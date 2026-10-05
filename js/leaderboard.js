'use strict';
/* =========================================================
 * 排行榜客户端 + 战功榜 UI（真实连接平凯云 TiDB）
 *   LB    : 与后端 /api 通信（提交成绩/对局、拉取榜单/看板）
 *   LBUI  : 游戏内「战功榜」界面（菜单入口 + 结算后跳转）
 * 依赖：js/api-config.js（提供 window.API_BASE）、全局 HUD / SFX / LEVELS
 * ========================================================= */

window.LB = (function () {
  const KEY = 'tidb_fantasy_name';
  function getName() {
    try { return localStorage.getItem(KEY) || '匿名指挥官'; } catch (e) { return '匿名指挥官'; }
  }
  function setName(n) {
    try { localStorage.setItem(KEY, (n || '').trim().slice(0, 40) || '匿名指挥官'); } catch (e) {}
  }
  function base() { return (window.API_BASE || '').replace(/\/$/, ''); }
  async function api(path, opts) {
    try {
      const r = await fetch(base() + '/api' + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  // 把一局结果写入 TiDB（得分表 + 对局表），返回排名
  async function submitRun(app, core) {
    const won = core.status === 'won';
    const st = core.getStats();
    const lvl = core.lv.id, lvlName = core.lv.name;
    const score = Math.round(core.score || 0);
    const durationSec = won ? (core.lv.duration || 0) : Math.round(core.t || 0);
    const player = getName();
    const payload = { player, level: lvl, levelName: lvlName, score, stars: st.stars, won, durationSec, peakRisk: st.peakRisk };
    let rank = null, rankLevel = null;
    try {
      const r = await api('/score', { method: 'POST', body: JSON.stringify(payload) });
      if (r && r.ok) { rank = r.rank; rankLevel = r.rankLevel; }
      await api('/match', { method: 'POST', body: JSON.stringify({
        player, level: lvl, levelName: lvlName, result: won ? 'win' : 'lose',
        stars: st.stars, durationSec, peakRisk: st.peakRisk,
      }) });
    } catch (e) {}
    return { score, rank, rankLevel };
  }
  function loadBoard(level, limit) { return api('/leaderboard?level=' + (level || 'all') + '&limit=' + (limit || 50)); }
  function loadMatches(limit) { return api('/matches?limit=' + (limit || 30)); }
  function loadStats() { return api('/stats'); }
  return { getName, setName, submitRun, loadBoard, loadMatches, loadStats };
})();

window.LBUI = (function () {
  let tab = 'global';
  let lvSel = 1;
  let tabBound = false;

  function el(id) { return document.getElementById(id); }
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const e = el('screen-' + name); if (e) e.classList.add('active');
  }
  function stars(n) { n = n || 0; return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function fmt(s) { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60), r = s % 60; return m + ':' + String(r).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function open() {
    showScreen('leaderboard');
    const inp = el('lb-name'); if (inp) inp.value = LB.getName();
    bindTabs();
    refresh();
  }
  function bindTabs() {
    if (tabBound) return; tabBound = true;
    document.querySelectorAll('.lb-tab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.lb-tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); tab = b.dataset.tab; refresh();
      });
    });
    const back = el('lb-back');
    if (back) back.addEventListener('click', () => {
      if (window.SFX) SFX.play('click');
      if (window.App && App.showMenu) App.showMenu(); else showScreen('menu');
    });
    const inp = el('lb-name');
    if (inp) inp.addEventListener('change', () => { LB.setName(inp.value); });
  }
  function refresh() {
    if (tab === 'global') renderGlobal();
    else if (tab === 'level') renderLevel();
    else renderDash();
  }
  async function renderGlobal() {
    const body = el('lb-body'), sub = el('lb-sub');
    sub.textContent = '实时排名 · 数据落库平凯云 TiDB';
    body.innerHTML = '<div class="lb-loading">载入中…</div>';
    const d = await LB.loadBoard('all', 50);
    if (!d || !d.ok) { body.innerHTML = '<div class="lb-empty">排行榜暂时连不上（请确认 API 已部署）。</div>'; return; }
    el('lb-db').textContent = '🛢 ' + (d.db || '');
    if (!d.rows.length) { body.innerHTML = '<div class="lb-empty">还没有战绩，去打一局吧！</div>'; return; }
    body.innerHTML = tableHtml(d.rows.map((r, i) => ({
      rank: i + 1, player: r.player, score: r.score, stars: r.stars, won: r.won,
      lvl: r.lvl, lvlName: r.lvl_name, dur: r.duration_sec, time: r.created_at,
    })));
  }
  async function renderLevel() {
    const body = el('lb-body'), sub = el('lb-sub');
    const levels = (window.LEVELS || []).map(l => ({ id: l.id, name: l.name }));
    sub.innerHTML = '选择关卡：<select id="lb-level" class="lb-select">' +
      levels.map(l => `<option value="${l.id}" ${l.id == lvSel ? 'selected' : ''}>第${l.id}关 · ${esc(l.name)}</option>`).join('') +
      (levels.length ? '' : '<option>—</option>') + '</select>';
    const s = el('lb-level');
    if (s) s.onchange = () => { lvSel = +s.value; renderLevel(); };
    body.innerHTML = '<div class="lb-loading">载入中…</div>';
    const d = await LB.loadBoard(lvSel, 50);
    if (!d || !d.ok) { body.innerHTML = '<div class="lb-empty">排行榜暂时连不上。</div>'; return; }
    if (!d.rows.length) { body.innerHTML = '<div class="lb-empty">本关还没有战绩。</div>'; return; }
    body.innerHTML = tableHtml(d.rows.map((r, i) => ({
      rank: i + 1, player: r.player, score: r.score, stars: r.stars, won: r.won,
      lvl: lvSel, lvlName: '', dur: r.duration_sec, time: r.created_at,
    })));
  }
  async function renderDash() {
    const body = el('lb-body'), sub = el('lb-sub');
    sub.textContent = '对局数据看板 · 实时来自平凯云 TiDB';
    body.innerHTML = '<div class="lb-loading">载入中…</div>';
    const [s, m] = await Promise.all([LB.loadStats(), LB.loadMatches(20)]);
    if (!s || !s.ok) { body.innerHTML = '<div class="lb-empty">看板暂时连不上。</div>'; return; }
    el('lb-db').textContent = '🛢 ' + (s.db || '');
    const cards = `
      <div class="lb-cards">
        <div class="lb-card"><b>${s.totalMatches}</b><span>总对局</span></div>
        <div class="lb-card"><b>${s.winRate}%</b><span>胜率（${s.wins}胜/${s.losses}负）</span></div>
        <div class="lb-card"><b>${s.players}</b><span>参战指挥官</span></div>
        <div class="lb-card"><b>${s.bestScore}</b><span>最高分</span></div>
        <div class="lb-card"><b>${s.today}</b><span>今日对局</span></div>
      </div>`;
    let html = cards;
    if (m && m.ok && m.rows.length) {
      html += '<h3 class="lb-h3">📜 最近对局</h3>' + tableHtml(m.rows.map(r => ({
        rank: '·', player: r.player, score: '—', stars: r.stars,
        won: r.result === 'win' ? 1 : 0, lvl: r.lvl, lvlName: r.lvl_name,
        dur: r.duration_sec, time: r.created_at,
      })));
    }
    body.innerHTML = html;
  }
  function tableHtml(rows) {
    const head = '<tr><th>#</th><th>指挥官</th><th>得分</th><th>星</th><th>结果</th><th>关卡</th><th>时长</th><th>时间</th></tr>';
    const trs = rows.map(r => `<tr>
      <td class="lb-rank">${r.rank}</td>
      <td class="lb-player">${esc(r.player)}</td>
      <td class="lb-score">${r.score}</td>
      <td class="lb-stars">${stars(r.stars)}</td>
      <td class="${r.won ? 'lb-win' : 'lb-lose'}">${r.won ? '✅ 守住' : '❌ 失守'}</td>
      <td>${r.lvl ? ('第' + r.lvl + '关' + (r.lvlName ? (' · ' + esc(r.lvlName)) : '')) : '—'}</td>
      <td>${r.dur != null && r.dur !== '—' ? fmt(r.dur) : '—'}</td>
      <td class="lb-time">${esc(r.time)}</td>
    </tr>`).join('');
    return '<div class="lb-table-wrap"><table class="lb-table">' + head + trs + '</table></div>';
  }
  return { open, refresh };
})();
