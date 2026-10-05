'use strict';
/*
 * Vercel Serverless Function 入口。把排行榜 API 免费部署到 HTTPS 域名，
 * GitHub Pages 上的静态游戏通过跨域请求调用它。
 * 部署：在 Vercel 项目设置里配置环境变量 TIDB_HOST / TIDB_PORT / TIDB_USER /
 * TIDB_PASSWORD / TIDB_DB（与 server/.env 一致），然后 `vercel deploy` 即可。
 */
const { handleApi } = require('../server/leaderboard-handler');

module.exports = async function (req, res) {
  try {
    await handleApi(req, res);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(e) }));
  }
};
