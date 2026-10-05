/* =========================================================
 * eventSystem.js —— 随机灾难事件系统（游戏灵魂，方案1.2）
 * 事件1 节点宕机预警（倒计时） / 事件2 热点风暴 / 事件3 数据洪峰
 * 扩展：节点扩容 / 有序缩容；multiEvent 控制是否并发
 * ========================================================= */
'use strict';

const DOWN_REASONS = ['火攻', '投石猛攻', '地道偷袭', '云梯强攻', '断我粮道'];

class EventSystem {
  constructor(core, lv, hooks) {
    this.core = core;
    this.lv = lv;
    this.hooks = hooks || {};
    this.evCfg = lv.events || {};
    // 每类事件的计时器与已触发次数
    this.timers = {};
    this.fired = {};
    for (const type of ['nodeDown', 'hotspot', 'flood', 'scaleUp', 'scaleDown']) {
      const c = this.evCfg[type];
      if (c) { this.timers[type] = randFloat(c.gapMin, c.gapMax); this.fired[type] = 0; }
    }
    // 开战即战：首波敌军 2 秒内就杀到，不给干等
    if (this.evCfg.nodeDown) {
      this.timers.nodeDown = lv.id === 1 ? 2 : lv.id === 2 ? 4 : 5; // 首波：2s/4s/5s，越往后越拼手速
      this.maxSimul = lv.chapter >= 4 ? 3 : lv.chapter >= 3 ? 2 : 1; // 多门齐攻上限（同时刻被围城数：章1/2=1，章3=2，章4=3）
    }
    // 宕机/缩容预警列表：{ tikv, t, countdown, planned }
    this.warnings = [];
    this.firstDownDone = false;
    // 驰援机制：城破后邻城告急，需从其他城调仓驰援
    this.relief = null;      // { tikv, need, got, t }
    this.siegeHalve = false; // 驰援不及 → 下次敌袭倒计时减半
    // 围攻战：敌军抵达后进入消耗战 { tikv, t, consume }
    this.sieges = [];
    this._lastFoe = null;    // 上一波敌军攻打过的城（用于降权，避免连续挨同一座城）
  }

  isSiege(tikvId) { return this.sieges.some(sg => sg.tikv === tikvId); }

  cityStock(tikvId) { return this.core.regions.filter(r => !r.dead && r.replicas.includes(tikvId)).length; }

  isWarning(tikvId) { return this.warnings.some(w => w.tikv === tikvId); }

  /* 敌军攻城目标：加权随机（不再固定打最肥的那一座城）
   * 权重 = 1 + 城内仓数 × 2：仓越多越像"肥肉"，越容易被盯上；
   * 上一波刚打过的城权重 ×0.35，避免同一座城被连着反复攻打。
   * 既保留"敌军盯着物资最集中的城"的教学意图，又保证每波目标会变。 */
  pickFoeTarget(pool) {
    if (!pool.length) return null;
    // 内部直接用 cityStock（收城市 id），不再依赖外部传入的计数函数，避免"传对象还是传 id"的契约歧义
    const weights = pool.map(t => {
      let w = 1 + this.cityStock(t.id) * 2;
      if (this._lastFoe != null && t.id === this._lastFoe) w *= 0.35;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = randFloat(0, total);
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /* 城破后：幸存城中"物资缺口最大"的城进入告急，请求驰援。
   * 需求量 = 该城可合法迁入的仓位数（同物资不可同城的 Raft 约束下不会卡死玩家） */
  spawnRelief() {
    const core = this.core;
    // 同样修掉旧 bug：missing 收【城市 id】（旧版收 tikv 对象却被调用方传 t.id，恒返回总仓数 → 排序失效 → 永远挑第一座城）
    const missing = id => core.regions.filter(r => !r.dead && !r.replicas.includes(id)).length;
    const cands = core.tikvs
      .filter(t => !t.offline && missing(t.id) >= 1 && core.regions.some(r => !r.dead && r.replicas.includes(t.id)))
      .sort((a, b) => missing(b.id) - missing(a.id));
    if (!cands.length || this.relief) return;
    const pick = cands[0];
    const need = Math.min(ECON.RELIEF_NEED, missing(pick.id));
    this.relief = { tikv: pick.id, need, got: 0, t: ECON.RELIEF_TIME };
    this.broadcast(`⚠️ ${CITY.name(pick.id)}资源告急！前线告破，${ECON.RELIEF_TIME} 秒内从其他城调 ${need} 仓物资驰援（拖入该城即可）！`, 'warn');
  }

  /* 转运落点通报（core.migrate 成功后由 App 调用） */
  notifyRelief(toT) {
    const r = this.relief;
    if (!r || toT !== r.tikv) return;
    r.got++;
    if (r.got >= r.need) {
      this.relief = null;
      this.core.score += 60;
      this.core.bumpCombo();
      if (this.core.hooks.onGold) this.core.hooks.onGold(ECON.GOLD_RELIEF, '驰援告急城');
      this.broadcast(`🎖 驰援成功！${CITY.name(r.tikv)}守备稳固，全军士气大振（+${ECON.GOLD_RELIEF}💰）`, 'ok');
    } else {
      this.broadcast(`🚚 驰援进度 ${r.got}/${r.need}——继续往${CITY.name(r.tikv)}调仓！`, 'info');
    }
  }

  /* 御敌大招：立即击退一场敌袭（迁城令不可击退） */
  /* 挥锤砍敌 */
  strike(tikvId) {
    const w = this.warnings.find(x => !x.planned && x.tikv === tikvId);
    if (w) {
      w.hp--; w.hitAt = performance.now();
      w.t = Math.min(w.countdown, w.t + 0.5);
      if (w.hp <= 0) {
        this.warnings = this.warnings.filter(x => x !== w);
        this.core.score += 60;
        this.core.bumpCombo();
        if (this.core.hooks.onGold) this.core.hooks.onGold(ECON.GOLD_KILL, '阵斩敌军');
        this.core.broadcast(`⚔️ 小Ti 阵斩敌军先锋！攻打${CITY.name(w.tikv)}的部队作鸟兽散（+${ECON.GOLD_KILL}💰）`, 'ok');
        return { ok: true, killed: true };
      }
      return { ok: true, killed: false };
    }
    const sg = this.sieges.find(x => x.tikv === tikvId);
    if (sg) {
      sg.hp--; sg.hitAt = performance.now();
      sg.t -= 1.2;
      if (sg.hp <= 0 || sg.t <= 0) {
        this.sieges.splice(this.sieges.indexOf(sg), 1);
        this.core.score += 80;
        this.core.bumpCombo();
        if (this.core.hooks.onGold) this.core.hooks.onGold(ECON.GOLD_KILL + ECON.GOLD_HOLD, '打崩围攻');
        this.core.broadcast(`💥 小Ti 率军突出城门，杀得敌军丢盔弃甲！${CITY.name(tikvId)}围攻立解！（+${ECON.GOLD_KILL + ECON.GOLD_HOLD}💰）`, 'ok');
        return { ok: true, killed: true };
      }
      return { ok: true, killed: false };
    }
    return { ok: false, reason: '那里没有敌军' };
  }

  /* 御敌反击：opts.tikv 可指定目标；不指定时自动挑"最危急"的一处（剩余时间最短）。
   * 旧版固定取 warnings[0] / sieges[0] → 多城同时被围时永远只打第一座城（表现为"一直对内城生效"）。 */
  repelAttack(opts) {
    const o = opts || {};
    const openW = this.warnings.filter(x => !x.planned);
    let w = o.tikv != null ? openW.find(x => x.tikv === o.tikv) : null;
    let sg = o.tikv != null ? this.sieges.find(x => x.tikv === o.tikv) : null;
    if (!w && !sg) {
      const wMin = openW.length ? openW.reduce((a, b) => (a.t <= b.t ? a : b)) : null;
      const sMin = this.sieges.length ? this.sieges.reduce((a, b) => (a.t <= b.t ? a : b)) : null;
      if (wMin && sMin) { if (wMin.t <= sMin.t) w = wMin; else sg = sMin; }
      else { w = wMin; sg = sMin; }
    }
    if (!w && !sg) return { ok: false, reason: '当前没有敌军' };
    const tikv = w ? w.tikv : sg.tikv;
    const stock = this.cityStock(tikv);
    if (stock < 3) return { ok: false, reason: `兵源不足：${CITY.name(tikv)} 城内需至少 3 处仓库才能出城反击（现存 ${stock}）` };
    if (!(opts && opts.free)) {
      if (this.core.power < ECON.REPEL_COST) return { ok: false, reason: `御敌需要 ${ECON.REPEL_COST} 算力！` };
      this.core.power -= ECON.REPEL_COST;
    }
    this.core.bumpCombo();
    this.core.score += 30;
    if (w) {
      // 御敌=把行军团长推退 45% 路程；推退出征途才算大捷
      w.t = Math.min(w.countdown, w.t + w.countdown * 0.45);
      if (this.core.hooks.onGold) this.core.hooks.onGold(3, '御敌小胜');
      this.broadcast(`⚔️ 守军依托城内 ${stock} 处武库出城冲阵，把${CITY.name(tikv)}方向的敌军推退了半程！敌军将重新压上（+3💰）`, 'ok');
    } else {
      // 围攻中反击：内外夹攻直接打崩围攻
      this.sieges.splice(this.sieges.indexOf(sg), 1);
      if (this.core.hooks.onGold) this.core.hooks.onGold(ECON.GOLD_HOLD, '内外夹攻破围');
      this.broadcast(`💥 内外夹攻！${CITY.name(tikv)}守军开城冲杀，围攻之敌溃散！（+${ECON.GOLD_HOLD}💰）`, 'ok');
    }
    return { ok: true };
  }

  /* 当前"未解决事件"数（multiEvent=false 时同一时刻只允许一个） */
  countActive() {
    const core = this.core;
    let n = this.warnings.length + this.sieges.length;
    if (core.floodTimer > 0) n++;
    for (const r of core.regions) if (!r.dead && r.heat >= CFG.HEAT_DANGER) { n++; break; }
    return n;
  }

  update(dt) {
    const core = this.core;
    if (core.status !== 'playing') return;

    // —— 预警倒计时推进 ——
    for (const w of [...this.warnings]) {
      w.t -= dt;
      if (w.t <= 0) {
        this.warnings = this.warnings.filter(x => x !== w);
        if (!w.planned) this.firstDownDone = true;
        // 守城判定（三副本原理）：倒计时归零时城内仓数不足 3 座 = 守不住
        const stock = this.cityStock(w.tikv);
        const holds = stock >= ECON.SIEGE_HOLD_MIN;
        if (w.planned) {
          // 弃城令：有序撤退的城按时下线
          core.bringNodeDown(w.tikv, '弃城令：物资已撤空', true);
        } else if (holds && this.isSiege(w.tikv)) {
          // 两路敌军合流围同一城：只延长士气，不叠加焚城计时器
          const sg0 = this.sieges.find(x => x.tikv === w.tikv);
          if (sg0) sg0.t = Math.min(sg0.maxT || ECON.SIEGE_TIME, sg0.t + 4);
          core.broadcast(`⚔️ 敌军两路合流，${CITY.name(w.tikv)}围攻压力增大！`, 'bad');
        } else if (holds) {
          // 敌军兵临城下 → 围攻消耗战开始
          const holdSec = w.siegeTime || ECON.SIEGE_TIME;
          this.sieges.push({ tikv: w.tikv, t: holdSec, maxT: holdSec, consume: ECON.SIEGE_FIRST + 2, hp: ECON.SIEGE_HP, hitAt: 0, warned: false });
          typeof HUD !== 'undefined' && HUD.knowledge('siege');
          core.broadcast(`⚔️ 敌军兵临${CITY.name(w.tikv)}城下，围攻开始！城内须守住 ${ECON.SIEGE_HOLD_MIN} 座仓（三副本红线），撑住 ${holdSec} 秒敌军就撤！`, 'bad');
        } else {
          // 不足三副本：城防一攻即破（空城同理）
          core.bringNodeDown(w.tikv, `城内仅 ${stock} 座仓，不足 ${ECON.SIEGE_HOLD_MIN} 副本，城防一攻即破`, false);
          core.broadcast(`🏴 ${CITY.name(w.tikv)}只有 ${stock} 座仓，凑不齐三副本，被敌军一鼓而下！守城红线：被围的城至少留 ${ECON.SIEGE_HOLD_MIN} 座仓。`, 'bad');
        }
      }
    }

    // —— 围攻消耗战 ——
    for (const sg of [...this.sieges]) {
      if (core.tikvs[sg.tikv] && core.tikvs[sg.tikv].offline) { this.sieges.splice(this.sieges.indexOf(sg), 1); continue; }
      sg.t -= dt;
      sg.consume -= dt;
      if (sg.consume <= 0) {
        const stock = this.cityStock(sg.tikv);
        // 城内仓越多＝城墙越厚：敌军每烧一仓越吃力（拖仓支援因此真正有效）
        sg.consume = ECON.SIEGE_CONSUME + (core.buffs.cityLv >= 4 ? 0.5 : 0)
          + Math.max(0, stock - 3) * ECON.SIEGE_STOCK_SLOW;
        if (stock < ECON.SIEGE_HOLD_MIN) {
          // 三副本红线：围攻中城内仓数不足 3 座 → 城防崩溃（玩家搬空同理）
          this.sieges.splice(this.sieges.indexOf(sg), 1);
          const cause = stock <= 0
            ? '守军随最后一批物资撤离，城门洞开'
            : `城内仅剩 ${stock} 座仓，不足 ${ECON.SIEGE_HOLD_MIN} 副本，城防崩溃`;
          core.bringNodeDown(sg.tikv, cause, false);
          core.broadcast(stock <= 0
            ? `🏴 ${CITY.name(sg.tikv)}城内已空，被敌军不战而取！围攻期间别把仓调走——留仓才算守城。`
            : `🏴 ${CITY.name(sg.tikv)}只剩 ${stock} 座仓，凑不齐三副本，城防崩溃！守城红线：至少留 ${ECON.SIEGE_HOLD_MIN} 座仓。`, 'bad');
          continue;
        }
        const left = core.siegeBurnWarehouse(sg.tikv);
        if (left < ECON.SIEGE_HOLD_MIN) {
          // 烧到不足三副本 → 城破
          this.sieges.splice(this.sieges.indexOf(sg), 1);
          core.bringNodeDown(sg.tikv, `城内仅剩 ${left} 座仓，不足 ${ECON.SIEGE_HOLD_MIN} 副本，城防崩溃`, false);
          core.broadcast(`🏴 ${CITY.name(sg.tikv)}被烧到只剩 ${left} 座仓，凑不齐三副本，城防崩溃！`, 'bad');
          continue;
        }
        if (left === ECON.SIEGE_HOLD_MIN && !sg.warned) {
          sg.warned = true;
          this.broadcast(`🚨 ${CITY.name(sg.tikv)}城内只剩 ${left} 座仓＝贴着三副本红线！再被烧一次就城破——立刻从别的城拖仓支援！`, 'bad');
        }
      }
      if (sg.t <= 0) {
        // 撑到敌军士气崩溃
        this.sieges.splice(this.sieges.indexOf(sg), 1);
        core.score += 60;
        core.bumpCombo();
        if (core.hooks.onGold) core.hooks.onGold(ECON.GOLD_HOLD, '围攻守城');
        core.broadcast(`🎖 敌军久攻${CITY.name(sg.tikv)}不下，士气崩溃撤退！守城大捷（+${ECON.GOLD_HOLD}💰）`, 'ok');
      }
    }

    // —— 驰援倒计时 ——
    if (this.relief) {
      this.relief.t -= dt;
      if (this.relief.t <= 0) {
        const r = this.relief;
        this.relief = null;
        this.siegeHalve = true; // 防务空虚：下次敌袭倒计时减半
        this.broadcast(`⌛ 驰援不及…${CITY.name(r.tikv)}防务空虚，敌军下次进攻将势如破竹（倒计时减半）！`, 'bad');
      }
    }

    // —— 各事件调度 ——
    for (const type of Object.keys(this.timers)) {
      const c = this.evCfg[type];
      if (!c) { delete this.timers[type]; continue; } // 防御：未配置的事件类型不参与调度
      // 敌袭（nodeDown）不设次数上限：从开局一直攻到关卡时间结束，靠 gap 间隔控制节奏。
      // 其余灾难（洪峰/妖火/扩缩容）仍按 maxTimes 限量，避免刷屏。
      if (type !== 'nodeDown' && c.maxTimes != null && this.fired[type] >= c.maxTimes) continue;
      if (!this.lv.multiEvent && type === 'nodeDown' && (this.maxSimul || 1) > 1) {
        // 多门齐攻关卡：nodeDown 不被串行门阻塞，只受门数上限约束
        const gates = this.warnings.filter(x => !x.planned).length + this.sieges.length;
        if (gates >= this.maxSimul) continue;
      } else if (!this.lv.multiEvent && this.countActive() > 0) continue; // 串行模式：等上一事件解决
      this.timers[type] -= dt;
      if (this.timers[type] <= 0) {
        this.timers[type] = randFloat(c.gapMin, c.gapMax);
        if (this.tryFire(type, c)) this.fired[type]++;
      }
    }
  }

  tryFire(type, c) {
    const core = this.core;
    switch (type) {

      case 'nodeDown': {
        const alive = core.tikvs.filter(t => !t.offline && !this.isWarning(t.id) && !this.isSiege(t.id));
        // 保底：至少保留 2 个健康节点，否则不再制造宕机
        if (alive.length <= 2) return false;
        // 优先挑有副本的节点，威胁感更强
        const withReplica = alive.filter(t => core.regions.some(r => !r.dead && r.replicas.includes(t.id)));
        const pool = withReplica.length ? withReplica : alive;
        // 选目标：加权随机——仓多的城更"肥"权重更高，但每波目标都会变（不再固定打最肥的那一座）
        // 注意：whCount 收的是【城市 id】，不是 tikv 对象（旧代码传 t.id 给收 t 的函数，恒返回 0 → 排序失效 → 永远打第一座城）
        const whCount = id => core.regions.filter(r => !r.dead && r.replicas.includes(id)).length;
        const pick = this.pickFoeTarget(pool);
        if (!pick) return false;
        this._lastFoe = pick.id;
        const maxWh = Math.max.apply(null, pool.map(t => whCount(t.id)));
        const reason = DOWN_REASONS[randInt(0, DOWN_REASONS.length - 1)];
        const n = whCount(pick.id);
        const why = n >= 2
          ? (n >= maxWh
            ? `（那里囤了 ${n} 处仓库，是敌军眼中最大的肥肉）`
            : `（那里囤了 ${n} 处仓库，被敌军盯上了）`)
          : '';
        // 城破会把城里剩 1 份的濒危仓直接清零 → 提前警告，别让玩家莫名其妙判负
        const fragile = core.regions.filter(r => !r.dead && r.replicas.includes(pick.id) && r.replicas.length < 2).length;
        const fragTxt = fragile ? ` ⚠️${CITY.name(pick.id)}有 ${fragile} 处仅剩 1 份存货的濒危仓，城破即彻底灭失——选中它点「🔨 补货」补齐！` : '';
        let cd = c.countdown + (core.buffs.towerSec || 0); // 箭塔：预警时间加长
        let rush = '';
        if (this.siegeHalve) { // 驰援不及的惩罚：防务空虚，敌军势如破竹
          cd = Math.max(2, Math.ceil(cd / 2));
          this.siegeHalve = false;
          rush = '（防务空虚，敌军突进！）';
        }
        this.warnings.push({ tikv: pick.id, t: cd, countdown: cd, planned: false, hp: ECON.MARCH_HP, hitAt: 0, siegeTime: (c.siegeTime || ECON.SIEGE_TIME) });
        typeof HUD !== 'undefined' && HUD.knowledge('march');
        // 多门齐攻：门数未满且有余量 → 3 秒后连锁进攻下一门
        const gates = this.warnings.filter(x => !x.planned).length + this.sieges.length;
        if (gates < this.maxSimul) this.timers.nodeDown = 3;
        this.broadcast(`⚔️ 混沌军团${reason}，猛攻${CITY.full(pick.id)}${why}！${cd} 秒后城破${rush}——调仓支援死守，或攒 3⚡ 御敌反击！${fragTxt}`, 'bad');
        return true;
      }

      case 'hotspot': {
        const cands = core.regions.filter(r => !r.dead && r.heat < 30 && r.replicas.length === 3);
        if (!cands.length) return false;
        cands.sort((a, b) => b.size - a.size); // 优先大分片起火
        const r = cands[0];
        r.heat = randFloat(c.strengthMin, c.strengthMax);
        typeof HUD !== 'undefined' && HUD.knowledge('hot');
        this.broadcast(`🔥 热点妖火！${SUPPLY.name(r.id)}仓前人潮涌动（访问量飙升），请立即分仓分摊！`, 'bad');
        return true;
      }

      case 'flood': {
        core.floodTimer = c.duration;
        typeof HUD !== 'undefined' && HUD.knowledge('flood');
        this.broadcast(`🌊 贸易洪峰！天下粮草涌入城邦（写入 ×${CFG.FLOOD_RATE}，${c.duration} 秒），盯紧各仓容量！`, 'bad');
        return true;
      }

      case 'scaleUp': {
        if (core.tikvs.length >= 6) return false;
        const t = { id: core.tikvs.length, capacity: core.lv.tikvCapacity, isDown: false, offline: false };
        core.tikvs.push(t);
        typeof HUD !== 'undefined' && HUD.knowledge('scale');
        this.broadcast(`🏗 ${CITY.full(t.id)}奠基！新城墙已立起，迁些仓库过去分摊负载`, 'info');
        return true;
      }

      case 'scaleDown': {
        const alive = core.tikvs.filter(t => !t.offline && !this.isWarning(t.id));
        const withR = alive.filter(t => core.regions.some(r => !r.dead && r.replicas.includes(t.id)));
        if (alive.length <= 2 || !withR.length) return false;
        const pick = withR[randInt(0, withR.length - 1)];
        this.warnings.push({ tikv: pick.id, t: c.countdown, countdown: c.countdown, planned: true });
        this.broadcast(`📜 迁城之令：${CITY.full(pick.id)}将于 ${c.countdown} 秒后弃守，请从容迁出全部仓库`, 'warn');
        return true;
      }
    }
    return false;
  }

  broadcast(text, type) { if (this.hooks.onBroadcast) this.hooks.onBroadcast(text, type || 'info'); }
}
