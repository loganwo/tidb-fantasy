/* 核心逻辑冒烟测试（Node + vm，无DOM依赖） */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ctx = { console, Math, Date };
vm.createContext(ctx);
for (const f of ['js/config.js', 'level/levels.js', 'js/gameLogic.js', 'js/eventSystem.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}

const script = `
(function(){
  const out = [];
  const L = LEVELS;
  out.push('levels=' + L.length + ' chapters=' + [...new Set(L.map(l=>l.chapter))].join(','));

  // T1 第1关挂机90秒：应正常won（无灾难章节，数据增长致oversize但45s内应能活）
  let core = new GameCore(L[0], {});
  let es = new EventSystem(core, L[0], {});
  let frames = 0;
  while (core.status === 'playing' && frames < 60*120) { core.update(1/60); es.update(1/60); frames++; }
  out.push('T1 第1关挂机: status=' + core.status + ' t=' + core.t.toFixed(1) + ' peakRisk=' + core.peakRisk.toFixed(0) + ' regions=' + core.regions.length);

  // T2 迁移/分裂
  core = new GameCore(L[0], {});
  const r0 = core.regions[0];
  const from = r0.replicas[0];
  let target = null;
  for (let t = 0; t < core.tikvs.length; t++) if (core.canMigrate(r0.id, from, t).ok) { target = t; break; }
  const mg = core.migrate(r0.id, from, target);
  out.push('T2 迁移: target=' + target + ' ok=' + mg.ok + ' power=' + core.power.toFixed(1) + ' (期望4.0)');
  const sameTikv = r0.replicas.find(x => x !== from);
  out.push('T2 同Region同节点拒绝: ' + JSON.stringify(core.canMigrate(r0.id, from, sameTikv)));
  r0.size = 30;
  const before = core.regions.length;
  const sp = core.split(r0.id);
  out.push('T2 分裂: ok=' + sp.ok + ' regions ' + before + '->' + core.regions.length + ' power=' + core.power.toFixed(1) + ' (期望3.5)');

  // T3 宕机事件不迁移 → 副本受损 + 自愈，观察40s
  core = new GameCore(L[0], {});
  es = new EventSystem(core, L[0], {});
  const logs = [];
  core.hooks.onBroadcast = (t) => logs.push(t);
  es.timers.nodeDown = 0.01;
  let f3 = 0;
  while (core.status === 'playing' && f3 < 60*40) { core.update(1/60); es.update(1/60); f3++; }
  out.push('T3 宕机不救40s: status=' + core.status + ' 下线=' + core.tikvs.filter(t=>t.offline).length + ' 受损=' + core.lostReplicaEvents + ' peakRisk=' + core.peakRisk.toFixed(0));
  out.push('T3 播报: ' + JSON.stringify(logs.slice(0, 2)));

  // T4 AI防守：预警迁空+分裂解热点，30s 应零副本丢失
  core = new GameCore(L[5], {});
  es = new EventSystem(core, L[5], {});
  core.hooks.onBroadcast = () => {};
  es.timers.nodeDown = 0.01;
  let f4 = 0, migrated = 0;
  while (core.status === 'playing' && f4 < 60*30) {
    core.update(1/60); es.update(1/60); f4++;
    for (const w of [...es.warnings]) {
      for (const r of core.regions) {
        if (r.dead || !r.replicas.includes(w.tikv)) continue;
        for (let t = 0; t < core.tikvs.length; t++) {
          if (core.canMigrate(r.id, w.tikv, t).ok) { core.migrate(r.id, w.tikv, t); migrated++; break; }
        }
      }
    }
    for (const r of [...core.regions]) {
      if (!r.dead && (r.size > 38 || r.heat > 50) && core.canSplit(r.id).ok) core.split(r.id);
    }
  }
  out.push('T4 AI防守30s: status=' + core.status + ' 迁移=' + migrated + ' 受损=' + core.lostReplicaEvents + ' peakRisk=' + core.peakRisk.toFixed(0) + ' stars=' + core.calcStars());

  // T5 24关全部实例化并模拟5秒
  let okAll = true;
  for (let i = 0; i < L.length; i++) {
    try {
      const c = new GameCore(L[i], {});
      const e = new EventSystem(c, L[i], {});
      for (let f = 0; f < 60*5; f++) { c.update(1/60); e.update(1/60); }
    } catch (err) { okAll = false; out.push('T5 关卡' + (i+1) + ' 异常: ' + err.message); }
  }
  out.push('T5 10关全模拟: ' + (okAll ? '全部通过' : '有失败'));

  // T6 完整一局：AI打第6关60秒
  core = new GameCore(L[0], {});
  es = new EventSystem(core, L[0], {});
  core.hooks.onBroadcast = () => {};
  let f6 = 0;
  while (core.status === 'playing' && f6 < 60*90) {
    core.update(1/60); es.update(1/60); f6++;
    for (const w of [...es.warnings]) {
      for (const r of core.regions) {
        if (r.dead || !r.replicas.includes(w.tikv)) continue;
        for (let t = 0; t < core.tikvs.length; t++) {
          if (core.canMigrate(r.id, w.tikv, t).ok) { core.migrate(r.id, w.tikv, t); break; }
        }
      }
    }
    for (const r of [...core.regions]) {
      if (!r.dead && (r.size > 38 || r.heat > 50) && core.canSplit(r.id).ok) core.split(r.id);
    }
    const over = core.tikvs.filter(t => !t.offline && core.nodeLoad(t) > 82).sort((a,b)=>core.nodeLoad(b)-core.nodeLoad(a))[0];
    if (over && core.power >= 1) {
      for (const r of core.regions) {
        if (r.dead || !r.replicas.includes(over.id)) continue;
        for (let t = 0; t < core.tikvs.length; t++) {
          if (core.canMigrate(r.id, over.id, t).ok) { core.migrate(r.id, over.id, t); break; }
        }
      }
    }
  }
  out.push('T6 AI全勤打第1关: status=' + core.status + ' t=' + core.t.toFixed(0) + ' stars=' + core.calcStars() + ' peakRisk=' + core.peakRisk.toFixed(0) + ' ops=' + core.opsCount);

  // T7 城墙加固：wallLv 越高，正向风险累积越慢（回归：曾误用不存在的 buffs.wall 导致永久失效）
  const riskAfterWall = (wallLv) => {
    const c = new GameCore(L[0], { buffs: { wallLv: wallLv } });
    c.risk = 0;
    c.regions[0].replicas = c.regions[0].replicas.slice(0, 1); // 制造「副本不足」这一正向风险源
    c.computeRisk(1);
    return c.risk;
  };
  const w0 = riskAfterWall(0), w3 = riskAfterWall(3);
  const ratio = w0 > 0 ? w3 / w0 : 0;
  out.push('T7 城墙加固: wallLv0=' + w0.toFixed(2) + ' wallLv3=' + w3.toFixed(2) + ' 比率=' + ratio.toFixed(2) + ' (期望≈0.55)');
  return out.join('\\n');
})()
`;
console.log(vm.runInContext(script, ctx));
