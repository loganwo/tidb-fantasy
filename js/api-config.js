'use strict';
/*
 * 排行榜 API 基地址。
 *  - 默认 ''（同源）：用于「本地 node server」或「把整个游戏部署到 Vercel」两种场景。
 *  - 若游戏放在 GitHub Pages、而 API 单独部署在 Vercel，请把下面改成你的 Vercel 地址，
 *    例如：  window.API_BASE = 'https://tidb-fantasy-api.vercel.app';
 * 密码只存在于服务端，浏览器永远只拿到这个基地址。
 */
// 排行榜 API 已部署到 Vercel（真实连接平凯云 TiDB），GitHub Pages 上的游戏跨域调用它。
window.API_BASE = window.API_BASE || 'https://tidb-fantasy-leaderboard.vercel.app';
