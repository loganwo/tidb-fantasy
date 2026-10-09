'use strict';
/*
 * 排行榜 API 配置 —— 统一从服务端取数，浏览器侧无任何数据库凭据。
 * 路由规则（静态页本身不带 /api，分两种宿主）：
 *  - 同源：本地 all-in-one 调试（localhost）或自托管一体服务 tigame.546654.xyz
 *          → fetch('/api/...') 由同一进程直接处理，最快且无跨域。
 *  - 外部 API 节点：GitHub Pages 纯静态镜像、WorkBuddy 托管、任意第三方域
 *          → 统一走 Ubuntu 独立 API 节点 tidbapi.546654.xyz（已开放 CORS *）。
 *  URL 加 ?api=https://你的域名 可临时覆盖为单一端点（调试用）。
 */
(function () {
  var SELF_HOST = 'tigame.546654.xyz';
  var SELF_API = 'https://tidbapi.546654.xyz';
  var host = (window.location && window.location.hostname) || '';
  var isLocal = (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]');
  var EPS;

  if (host === SELF_HOST || isLocal) {
    EPS = ['']; // 同源：fetch('/api/...')
  } else {
    EPS = [SELF_API]; // 外部自托管 API 节点（CORS *，跨域可访问）
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
