'use strict';
/*
 * 排行榜 API 配置 —— 多端点容灾
 *  - 页面部署在 tigame.546654.xyz（Cloudflare Tunnel → Ubuntu 自托管一体服务）时：
 *      API 走同源（同一进程直接处理 /api），最快且无跨域。
 *  - 页面部署在 GitHub Pages 等其他域时：
 *      依次尝试 Vercel 主节点 / 自托管 Tunnel 兜底节点，谁先通用谁。
 *  URL 加 ?api=https://你的域名 可临时覆盖为单一端点（调试用）。
 *  仅含公开域名，不含任何数据库凭据（凭据只在服务端）。
 */
(function () {
  var SELF_HOST = 'tigame.546654.xyz';
  var EPS;

  if (window.location && window.location.hostname === SELF_HOST) {
    EPS = ['']; // 同源：fetch('/api/...')
  } else {
    EPS = [
      'https://tidb-fantasy-leaderboard.vercel.app', // 主节点：Vercel（海外，国内可能不稳）
      'https://tidbapi.546654.xyz'                   // 兜底节点：自托管 Tunnel（国内直连）
    ];
  }

  try {
    var q = new URLSearchParams(location.search).get('api');
    if (q) EPS = [q.replace(/\/$/, '')];
  } catch (e) {}

  window.API_ENDPOINTS = EPS;
  window.API_BASE = EPS[0]; // 兼容旧代码

  var TIMEOUT = 6000;
  var primary = 0;

  function req(ep, path, opts) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    return fetch(ep.replace(/\/$/, '') + '/api' + path, Object.assign(
      { headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal }, opts || {}
    )).then(function (r) { clearTimeout(timer); return r; });
  }

  // 容灾请求：先试 primary，失败再依次试其余；返回 Response 或 null
  window.API = async function (path, opts) {
    var order = [primary];
    for (var i = 0; i < EPS.length; i++) if (i !== primary) order.push(i);
    for (var k = 0; k < order.length; k++) {
      var idx = order[k];
      try {
        var r = await req(EPS[idx], path, opts);
        if (r && r.ok) { primary = idx; return r; }
      } catch (e) {}
    }
    return null;
  };
})();
