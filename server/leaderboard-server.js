'use strict';
/*
 * 本地 / 服务器一体进程：同时托管静态游戏 + /api 后端。
 * 运行：  node server/leaderboard-server.js   （默认 http://localhost:8800）
 * 这样本地调试时前端用同源 /api，无需跨域；也方便直接在你的 Ubuntu 服务器上跑。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./leaderboard-handler');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8800;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res); }
    catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT) || fp.includes('/.env') || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('404 Not Found'); return;
  }
  res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[tidb-fantasy] 游戏+排行榜服务已启动： http://localhost:${PORT}`);
});
