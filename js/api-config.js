'use strict';
/*
 * 排行榜 API 配置 —— 双后端容灾（Vercel 主 + 自托管 Ubuntu 兜底）
 *  浏览器依次尝试下列端点，谁先返回 200 就用谁；之后优先复用该端点。
 *  仅含公开域名，不含任何数据库凭据（凭据只在服务端）。
 *  URL 加 ?api=https://你的域名 可临时覆盖为单一端点（调试用）。
 */
(function () {
  var EPS = [
    'https://tidb-fantasy-leaderboard.vercel.app', // 主节点：Vercel（海外，国内可能不稳）
    'https://tidbapi.546654.xyz'                   // 兜底节点：自托管 Ubuntu（国内直连）
  ];
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
