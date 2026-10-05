'use strict';
/*
 * 框架无关的核心 API。Vercel serverless 与本地 Node 服务器共用此文件，
 * 做到“同一套逻辑，两处部署”。
 *
 * 端点（均挂在 /api 下）：
 *   POST /api/score       提交一局得分（写入 lb_scores，返回全球/分关排名）
 *   GET  /api/leaderboard 排行榜（?level=all|N&limit=20）
 *   POST /api/match       记录一局对局（写入 lb_matches）
 *   GET  /api/matches     最近对局（?limit=20）
 *   GET  /api/stats       聚合看板（总局数/胜率/玩家数/最高分/今日）
 */
const { getPool, getDbName } = require('./db');

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (status === 204) { res.end(); return; }
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
  });
}

function str(v, max) { return String(v == null ? '' : v).slice(0, max); }
function num(v, d) { const n = parseInt(v); return Number.isFinite(n) ? n : d; }

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });

  const pool = await getPool();
  const q = url.searchParams;

  try {
    /* ---------- 提交得分 ---------- */
    if (path === '/api/score' && req.method === 'POST') {
      const b = await parseBody(req);
      const player = str(b.player || '匿名指挥官', 40) || '匿名指挥官';
      const lvl = Math.max(1, num(b.level, 1));
      const lvlName = str(b.levelName || '', 40);
      const score = Math.max(0, num(b.score, 0));
      const stars = Math.min(3, Math.max(0, num(b.stars, 0)));
      const won = b.won ? 1 : 0;
      const durationSec = Math.max(0, num(b.durationSec, 0));
      const peakRisk = Math.max(0, num(b.peakRisk, 0));

      await pool.query(
        'INSERT INTO lb_scores (player, lvl, lvl_name, score, stars, won, duration_sec, peak_risk) VALUES (?,?,?,?,?,?,?,?)',
        [player, lvl, lvlName, score, stars, won, durationSec, peakRisk]
      );
      const [[g]] = await pool.query('SELECT COUNT(*) c FROM lb_scores WHERE score > ?', [score]);
      const [[gl]] = await pool.query('SELECT COUNT(*) c FROM lb_scores WHERE lvl=? AND score > ?', [lvl, score]);
      return send(res, 200, { ok: true, rank: g.c + 1, rankLevel: gl.c + 1, db: getDbName() });
    }

    /* ---------- 排行榜查询 ---------- */
    if (path === '/api/leaderboard' && req.method === 'GET') {
      const lvl = q.get('level');
      const limit = Math.min(100, Math.max(1, num(q.get('limit'), 20)));
      let rows;
      if (lvl && lvl !== 'all') {
        [rows] = await pool.query(
          'SELECT id, player, score, stars, won, duration_sec, created_at FROM lb_scores WHERE lvl=? ORDER BY score DESC, created_at ASC LIMIT ?',
          [num(lvl, 1), limit]
        );
      } else {
        [rows] = await pool.query(
          'SELECT id, player, score, stars, won, lvl, lvl_name, duration_sec, created_at FROM lb_scores ORDER BY score DESC, created_at ASC LIMIT ?',
          [limit]
        );
      }
      return send(res, 200, { ok: true, db: getDbName(), rows });
    }

    /* ---------- 记录对局 ---------- */
    if (path === '/api/match' && req.method === 'POST') {
      const b = await parseBody(req);
      const player = str(b.player || '匿名指挥官', 40) || '匿名指挥官';
      const lvl = Math.max(1, num(b.level, 1));
      const lvlName = str(b.levelName || '', 40);
      const result = (b.result === 'win') ? 'win' : 'lose';
      const stars = Math.min(3, Math.max(0, num(b.stars, 0)));
      const durationSec = Math.max(0, num(b.durationSec, 0));
      const peakRisk = Math.max(0, num(b.peakRisk, 0));
      await pool.query(
        'INSERT INTO lb_matches (player, lvl, lvl_name, result, stars, duration_sec, peak_risk) VALUES (?,?,?,?,?,?,?)',
        [player, lvl, lvlName, result, stars, durationSec, peakRisk]
      );
      return send(res, 200, { ok: true });
    }

    /* ---------- 最近对局 ---------- */
    if (path === '/api/matches' && req.method === 'GET') {
      const limit = Math.min(100, Math.max(1, num(q.get('limit'), 20)));
      const [rows] = await pool.query(
        'SELECT id, player, lvl, lvl_name, result, stars, duration_sec, created_at FROM lb_matches ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      return send(res, 200, { ok: true, db: getDbName(), rows });
    }

    /* ---------- 聚合看板 ---------- */
    if (path === '/api/stats' && req.method === 'GET') {
      const [[tot]] = await pool.query('SELECT COUNT(*) c FROM lb_matches');
      const [[w]] = await pool.query("SELECT COUNT(*) c FROM lb_matches WHERE result='win'");
      const [[pl]] = await pool.query('SELECT COUNT(DISTINCT player) c FROM lb_scores');
      const [[bs]] = await pool.query('SELECT MAX(score) m FROM lb_scores');
      const [[tod]] = await pool.query('SELECT COUNT(*) c FROM lb_matches WHERE created_at >= CURDATE()');
      return send(res, 200, {
        ok: true, db: getDbName(),
        totalMatches: tot.c, wins: w.c, losses: tot.c - w.c,
        winRate: tot.c ? Math.round(w.c / tot.c * 100) : 0,
        players: pl.c, bestScore: bs.m || 0, today: tod.c,
      });
    }

    return send(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
}

module.exports = { handleApi };
