/* =========================================================
 * gameLogic.js —— 核心规则引擎（方案4.3：四大系统之核心）
 * 数据增长 / 副本负载校验 / 算力资源 / 风险判定
 * 纯逻辑，不依赖 Phaser，可单测。
 * ========================================================= */
'use strict';

class GameCore {
  constructor(lv, hooks) {
    this.lv = lv;
    this.hooks = hooks || {};
    this.t = 0; // 本局已进行秒数

    // —— TiKV 节点 ——
    this.tikvs = [];
    for (let i = 0; i < lv.tikvCount; i++) {
      this.tikvs.push({ id: i, capacity: lv.tikvCapacity, isDown: false, offline: false });
    }

    // —— Region 分片 ——
    this.regions = [];
    this.nextRegionId = 1;
    this.initRegions();

    // —— 全局状态（方案4.4）——
    this.power = lv.powerMax;
    this.risk = 0;
    this.peakRisk = 0;
    this.timeLeft = lv.duration;
    this.floodTimer = 0;
    this.lostReplicaEvents = 0; // 宕机造成的副本丢失次数（影响星级）
    this.opsCount = 0;          // 迁移+分裂操作总次数
    this.stats = { migrate: 0, split: 0 }; // 任务统计（方案：任务冒险系统）
    this.nodesDowned = 0;
    this.annihilated = 0;    // 三份存货尽毁、永久灭失的仓数
    this.citiesFallen = 0; // 被敌军攻陷的城区数（弃城令不算）
    this.status = 'playing';    // playing | paused | won | lost-risk | lost-data
    this.failReason = '';
    this.riskSources = [];      // 当前风险源（供UI/提示）

    // —— 战备经济（连击/得分/商店 buff，攻城建城玩法层）——
    this.buffs = this.hooks.buffs || {};  // { wall:bool, tower:sec, repair:bool }
    this.score = 0;
    this.combo = 0;
    this.lastOpAt = -99;

    // —— 出征集结：向内城集结 N 处仓库（集结越多内城越招敌，风险自担）——
    // 集结目标默认 = 全部城区都有仓库（全军集结）；lv.requisition === null 可关闭
    this.requisition = (lv.requisition === null)
      ? null
      : (lv.requisition || { city: 0, count: lv.initialRegions });
    this.requisitionMet = false;
    this.requisitionCount = 0;
  }

  /* 集结城当前仓库数 */
  requisitionProgress() {
    const n = this.regions.filter(r => !r.dead && r.replicas.includes(this.requisition.city)).length;
    this.requisitionCount = n;
    return n;
  }

  /* 连击：COMBO_WINDOW 秒内连续有效操作累计倍率 */
  bumpCombo() {
    this.combo = (this.t - this.lastOpAt <= ECON.COMBO_WINDOW) ? this.combo + 1 : 1;
    this.lastOpAt = this.t;
    const gained = 10 * this.combo;
    this.score += gained;
    if (this.combo >= 2 && this.hooks.onCombo) this.hooks.onCombo(this.combo, gained);
    return this.combo;
  }
  /* 补货：手动为受损仓库补 1 份副本（自动补货已关闭）
   * 付费方式：默认消耗 CFG.REPAIR_COST 算力；买了「急修队」则改由金币支付（opts.free 跳过算力） */
  quickRepair(regionId, opts) {
    const r = this.regionById(regionId);
    if (!r || r.dead) return { ok: false, reason: '该仓库已不存在' };
    if (r.replicas.length >= 3) return { ok: false, reason: '该仓库已满 3 份副本，无需补货' };
    if (r.replicas.length === 0) return { ok: false, reason: '存货尽毁，无法补货' };
    const target = this.pickRepairNode(r);
    if (target == null) return { ok: false, reason: '没有可入驻的城区（容量不足）' };
    if (!(opts && opts.free)) {
      if (this.power < CFG.REPAIR_COST) return { ok: false, reason: `补货需要 ${CFG.REPAIR_COST} 算力` };
      this.power -= CFG.REPAIR_COST;
    }
    r.replicas.push(target);
    r.repairing = false; r.repairTimer = null;
    this.broadcast(`🔨 小Ti 挥锤补货！${SUPPLY.name(r.id)}新仓速建入驻 ${CITY.name(target)}（现 ${r.replicas.length}/3 份）`, 'ok');
    return { ok: true, target };
  }

  /* ---------- 初始化：按 skew 生成初始分布 ---------- */
  initRegions() {
    for (let i = 0; i < this.lv.initialRegions; i++) {
      const size = (i < this.lv.bigRegions)
        ? (this.lv.bigRegionSize || 30)
        : randInt(this.lv.regionSizeMin, this.lv.regionSizeMax);
      const r = {
        id: this.nextRegionId++,
        size, heat: 0,
        replicas: [],
        dead: false, repairing: false, repairTimer: null,
        colorIdx: (i * 5 + 3) % CFG.REGION_PALETTE.length,
      };
      for (let k = 0; k < 3; k++) {
        const cand = this.tikvs
          .filter(t => !r.replicas.includes(t.id))
          .map(t => ({
            id: t.id,
            w: this.nodeSizeOf(t.id) + this.lv.skew * t.id * 20 + Math.random() * 2,
          }))
          .sort((a, b) => a.w - b.w);
        r.replicas.push(cand[0].id);
      }
      this.regions.push(r);
    }
  }

  /* ---------- 查询工具 ---------- */
  nodeSizeOf(tikvId) {
    let s = 0;
    for (const r of this.regions) {
      if (!r.dead && r.replicas.includes(tikvId)) s += r.size;
    }
    return s;
  }
  nodeLoad(t) { return this.nodeSizeOf(t.id) / t.capacity * 100; }
  regionById(id) { return this.regions.find(r => r.id === id); }
  canMigrate(regionId, fromT, toT) {
    if (fromT === toT) return { ok: false, reason: '' };
    const r = this.regionById(regionId);
    if (!r || r.dead) return { ok: false, reason: '分片不可用' };
    if (!r.replicas.includes(fromT)) return { ok: false, reason: '' };
    const to = this.tikvs[toT];
    if (!to || to.offline) return { ok: false, reason: '目标节点已下线' };
    if (r.replicas.includes(toT)) return { ok: false, reason: '同一 Raft 组的副本不可同节点！' };
    if (this.nodeSizeOf(toT) + r.size > to.capacity) return { ok: false, reason: '目标节点容量不足！' };
    if (this.power < CFG.COST_MIGRATE) return { ok: false, reason: '调度算力不足！等待恢复…' };
    return { ok: true };
  }
  canSplit(regionId) {
    const r = this.regionById(regionId);
    if (!r || r.dead) return { ok: false, reason: '分片不可用' };
    if (r.replicas.length < 3) return { ok: false, reason: '副本不完整，无法分裂' };
    if (r.size < CFG.SPLIT_MIN) return { ok: false, reason: `体积未达分裂标准（≥${CFG.SPLIT_MIN}）` };
    if (this.power < CFG.COST_SPLIT) return { ok: false, reason: '调度算力不足！等待恢复…' };
    return { ok: true };
  }

  /* ---------- 核心操作：迁移（扣1算力） ---------- */
  migrate(regionId, fromT, toT) {
    const c = this.canMigrate(regionId, fromT, toT);
    if (!c.ok) return c;
    const r = this.regionById(regionId);
    this.power -= CFG.COST_MIGRATE;
    this.opsCount++;
    this.stats.migrate++;
    this.bumpCombo();
    if (this.hooks.onGold) this.hooks.onGold(ECON.GOLD_MIGRATE, '货物转运');
    r.replicas = r.replicas.map(x => (x === fromT ? toT : x));
    this.broadcast(`🚚 ${SUPPLY.name(r.id)}转运：${CITY.name(fromT)} → ${CITY.name(toT)}`, 'info');
    if (this.hooks.onMigrate) this.hooks.onMigrate(toT); // 通报驰援系统落点
    if (this.hooks.onOp) this.hooks.onOp('migrate');
    return { ok: true };
  }

  /* ---------- 核心操作：分裂（扣0.5算力） ---------- */
  split(regionId) {
    const c = this.canSplit(regionId);
    if (!c.ok) return c;
    const r = this.regionById(regionId);
    const half = r.size / 2;
    const heat = r.heat * 0.5;
    r.size = half; r.heat = heat;

    const r2 = {
      id: this.nextRegionId++,
      size: half, heat,
      replicas: [],
      dead: false, repairing: false, repairTimer: null,
      colorIdx: (r.colorIdx + 6) % CFG.REGION_PALETTE.length,
    };
    for (let k = 0; k < 3; k++) {
      const cand = this.tikvs
        .filter(t => !t.offline && !r2.replicas.includes(t.id) && this.nodeSizeOf(t.id) + half <= t.capacity)
        .sort((a, b) => this.nodeSizeOf(a.id) - this.nodeSizeOf(b.id));
      if (!cand.length) {
        // 极端满载：回滚
        r.size = half * 2;
        return { ok: false, reason: '集群已无可用容量放置新副本，先均衡负载！' };
      }
      r2.replicas.push(cand[0].id);
    }
    this.regions.push(r2);
    this.power -= CFG.COST_SPLIT;
    this.opsCount++;
    this.stats.split++;
    this.bumpCombo();
    if (r.heat >= CFG.HEAT_DANGER) {
      if (this.hooks.onGold) this.hooks.onGold(ECON.GOLD_EXTINGUISH, '分仓灭火');
      this.score += 30;
    } else if (this.hooks.onGold) {
      this.hooks.onGold(ECON.GOLD_SPLIT, '分仓');
    }
    const hot = r.heat >= CFG.HEAT_DANGER;
    this.broadcast(`📦 ${SUPPLY.name(r.id)}分仓完成 → 新仓${SUPPLY.name(r2.id)}${hot ? '，妖火已分摊' : ''}`, 'ok');
    if (this.hooks.onOp) this.hooks.onOp('split');
    return { ok: true };
  }

  /* ---------- 宕机执行（由事件系统调用） ---------- */
  bringNodeDown(tikvId, cause, planned) {
    const t = this.tikvs[tikvId];
    if (!t || t.offline) return;
    t.offline = true; t.isDown = false;
    if (!planned) this.citiesFallen++;
    t.fallCause = cause || '敌军攻破';
    this.nodesDowned++;
    const affected = this.regions.filter(r => !r.dead && r.replicas.includes(tikvId));
    let critical = 0; // 跌到 1 份存货 = 濒危（仍可救），不是灭失
    for (const r of affected) {
      r.replicas = r.replicas.filter(x => x !== tikvId);
      this.lostReplicaEvents++;
      if (r.replicas.length === 0) {
        // 三份存货全毁：这批物资永久灭失。单独一处灭失不等于全盘崩溃——
        // 只有"城邦仓廪尽毁"才判负（丢一座城 ≠ 输掉整局，这才是容灾的意义）
        r.dead = true; r.repairing = false; r.repairTimer = null;
        this.annihilated++;
        this.risk = clamp(this.risk + 18, 0, CFG.RISK_MAX);
        this.broadcast(`💀 【${SUPPLY.name(r.id)}】三份存货尽毁，这批物资永久灭失！（风险 +18）`, 'bad');
      } else if (r.replicas.length === 1) {
        critical++; // 濒危：PD 自愈与急修队都还能把它救回 3 份
      }
    }
    typeof HUD !== 'undefined' && HUD.knowledge('fall');
    this.broadcast(`💥 ${CITY.name(tikvId)}陷落！${affected.length} 处仓库受损`, 'bad');
    if (this.hooks.onCityFallen) this.hooks.onCityFallen(tikvId); // 城破 → 触发邻城告急驰援
    if (critical) {
      typeof HUD !== 'undefined' && HUD.knowledge('quorum');
      this.broadcast(`🆘 ${critical} 处仓库只剩 1 份存货（濒危）！副本不会自己回来——选中它点「🔨 补货」（${CFG.REPAIR_COST}⚡）补回 3 份，再丢一份就真没了！`, 'warn');
    }
    if (!this.regions.some(r => !r.dead)) {
      this.status = 'lost-data';
      this.failReason = '城邦仓廪尽毁，账册（数据）再无一份存货可恢复！\n教训：仓库掉到 1 份存货时就是最后窗口，务必让 PD 补齐或主动扩容。';
    }
  }

  /* ---------- 围攻焚仓：敌军烧掉城里一座仓库 ---------- */
  siegeBurnWarehouse(tikvId) {
    const cands = this.regions.filter(r => !r.dead && r.replicas.includes(tikvId));
    if (!cands.length) return 0;
    // 优先烧"存货充足"的仓：只剩 1 份的濒危仓不烧——
    // 否则玩家会在同一次围攻里被连烧两下、直接把一批物资清零，毫无挽救窗口。
    const safe = cands.filter(r => r.replicas.length >= 2);
    if (!safe.length) {
      // 城里只剩濒危仓，守军拼死护住最后一批存货
      this.risk = clamp(this.risk + 4, 0, CFG.RISK_MAX);
      this.broadcast(`🛡 ${CITY.name(tikvId)}守军拼死护住最后一批存货，未被焚毁！（风险 +4·快补货）`, 'warn');
      return this.regions.filter(x => !x.dead && x.replicas.includes(tikvId)).length;
    }
    const r = safe[randInt(0, safe.length - 1)];
    r.replicas = r.replicas.filter(x => x !== tikvId);
    this.lostReplicaEvents++;
    this.risk = clamp(this.risk + 3, 0, CFG.RISK_MAX);
    const left = this.regions.filter(x => !x.dead && x.replicas.includes(tikvId)).length;
    // 存货被烧到只剩 1 份 = 濒危，必须让玩家看见"最后一次挽救机会"；烧光才算彻底灭失
    if (r.replicas.length === 0) {
      r.dead = true; r.repairing = false; r.repairTimer = null;
      this.annihilated++;
      this.risk = clamp(this.risk + 18, 0, CFG.RISK_MAX);
      this.broadcast(`💀 【${SUPPLY.name(r.id)}】三份存货尽毁，永久灭失！（风险 +18）`, 'bad');
    } else if (r.replicas.length === 1) {
      typeof HUD !== 'undefined' && HUD.knowledge('quorum');
      this.broadcast(`🆘 ${SUPPLY.name(r.id)}仓只剩 1 份存货！选中它点「🔨 补货」补齐（${CFG.REPAIR_COST}⚡）——再被烧一次就彻底没了！`, 'warn');
    }
    if (typeof SFX !== 'undefined') SFX.play('clash');
    typeof HUD !== 'undefined' && HUD.knowledge('burn');
    this.broadcast(`🔥 敌军焚毁【${SUPPLY.name(r.id)}】仓，不可恢复！${CITY.name(tikvId)} 城内仅剩 ${left} 仓——仓越多城墙越厚，从别的城调仓能拖慢敌军！`, 'bad');
    return left;
  }

  /* ---------- PD 自愈：自动补副本（消耗算力） ----------
   * 【已停用】玩家反馈"资源凭空生成"很出戏，改为手动补货（见 quickRepair）。
   * 保留实现以便日后需要「自动补货」难度档位时直接启用（主循环调用即可）。 */
  autoRepair(dt) {
    for (const r of this.regions) {
      // 副本不足（1 份濒危 / 2 份受损）都进自愈队列；0 份＝已灭失，不再自愈
      if (r.dead || !r.replicas || r.replicas.length >= 3 || r.replicas.length === 0) {
        if (r.replicas && r.replicas.length >= 3) { r.repairing = false; r.repairTimer = null; }
        continue;
      }
      if (r.repairTimer == null) {
        r.repairTimer = CFG.REPAIR_TIME;
        this.broadcast(`🩹 ${SUPPLY.name(r.id)}仅剩 ${r.replicas.length} 份存货，军师启动补货调度（需 ${CFG.REPAIR_COST} 算力）…`, 'warn');
      }
      r.repairing = true;
      r.repairTimer -= dt;
      if (r.repairTimer <= 0) {
        if (this.power >= CFG.REPAIR_COST) {
          const target = this.pickRepairNode(r);
          if (target != null) {
            this.power -= CFG.REPAIR_COST;
            r.replicas.push(target);
            r.repairing = false; r.repairTimer = null;
            this.broadcast(`✅ ${SUPPLY.name(r.id)}补货完成，新仓入驻 ${CITY.name(target)}`, 'ok');
          }
          // target==null：暂无合法节点，下帧继续尝试
        }
        // 算力不足：repairTimer 停在 0，风险持续积累，等算力恢复
      }
    }
  }
  pickRepairNode(r) {
    const cand = this.tikvs
      .filter(t => !t.offline && !r.replicas.includes(t.id) && this.nodeSizeOf(t.id) + r.size <= t.capacity)
      .sort((a, b) => this.nodeSizeOf(a.id) - this.nodeSizeOf(b.id));
    return cand.length ? cand[0].id : null;
  }

  /* ---------- 风险计算（方案1.4） ---------- */
  computeRisk(dt) {
    let rate = 0;
    const src = [];
    for (const t of this.tikvs) {
      if (t.offline) continue;
      const L = this.nodeLoad(t);
      if (L > CFG.LOAD_DANGER) { rate += CFG.RISK_LOAD_DANGER; src.push(`TiKV-${t.id + 1} 过载 ${Math.round(L)}%`); }
    }
    for (const r of this.regions) {
      if (r.dead) continue;
      if (r.size > CFG.SIZE_HARD) { rate += CFG.RISK_OVERSIZE_HARD; src.push(`R${r.id} 分片严重超大！`); }
      else if (r.size > CFG.SPLIT_MAX) { rate += CFG.RISK_OVERSIZE; src.push(`R${r.id} 分片过大，应分裂`); }
      if (r.heat >= CFG.HEAT_DANGER) { rate += CFG.RISK_HOT; src.push(`R${r.id} 热点集中，请分裂分摊`); }
      if (r.replicas.length < 3) { rate += CFG.RISK_REPLICA_SHORT; src.push(`R${r.id} 副本不足(${r.replicas.length}/3)`); }
    }
    if (!src.length) rate = -CFG.RISK_DECAY; // 稳态奖励：风险回落
    // 城墙加固军备：正向风险累积按 -15%/级 递减（回落不受影响）
    const wallLv = this.buffs.wallLv || 0;
    if (rate > 0 && wallLv > 0) rate *= Math.max(0, 1 - CFG.RISK_WALL_CUT * wallLv);
    this.risk = clamp(this.risk + rate * dt, 0, CFG.RISK_MAX);
    this.peakRisk = Math.max(this.peakRisk, this.risk);
    this.riskSources = src;
    if (!this.regions.some(r => !r.dead)) {
      // 兜底：仓廪尽毁（可能发生在焚仓而非城破）→ 账册无法恢复
      this.status = 'lost-data';
      this.failReason = '城邦仓廪尽毁，账册（数据）再无一份存货可恢复！\n教训：仓库掉到 1 份存货时就是最后窗口，务必让 PD 补齐或主动扩容。';
      return;
    }
    if (this.risk >= CFG.RISK_MAX) {
      this.status = 'lost-risk';
      this.failReason = '集群风险值失控，数据服务全面崩溃！\n教训：异常要趁小处理，拖着不管就是雪崩。';
    }
  }

  /* ---------- 每帧驱动 ---------- */
  update(dt) {
    if (this.status !== 'playing') return;
    this.t += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      // 通关硬条件：守城目标（不丢城 + 规定的调度操作）必须达成，否则视为失守——
      // 否则"全程不操作只挨打"也能靠撑时间过关，违背三副本守城的教学内核。
      const failed = this.calcTasks().filter(t => ['migrate', 'split', 'cities'].includes(t.stat) && !t.done);
      if (failed.length) {
        this.status = 'lost-obj';
        this.failReason = '⏳ 撑到了时间，但守城目标未达成：\n'
          + failed.map(t => '· ' + t.desc + `（当前 ${t.value} / 目标 ${t.target}）`).join('\n')
          + '\n城邦稳态靠主动调度：光挨打不操作，等于把城邦拱手让人。';
      } else {
        this.status = 'won';
      }
      return;
    }

    // 1) 数据持续流入（洪峰 ×3）
    const rate = this.lv.dataRate * (this.floodTimer > 0 ? CFG.FLOOD_RATE : 1);
    for (const r of this.regions) if (!r.dead) r.size += rate * dt;
    this.floodTimer = Math.max(0, this.floodTimer - dt);

    // 2) 热度自然衰减
    for (const r of this.regions) r.heat = Math.max(0, r.heat - CFG.HEAT_DECAY * dt);

    // 3) 算力恢复
    this.power = Math.min(this.lv.powerMax, this.power + this.lv.powerRegen * dt);

    // 5) 风险（焚毁的仓不可自动恢复——玩家必须主动转运扩容）
    this.computeRisk(dt);

    // 6) 出征集结检查（一次性发赏，达标后不回吐）
    if (this.requisition && !this.requisitionMet) {
      const n = this.requisitionProgress();
      if (n >= this.requisition.count) {
        this.requisitionMet = true;
        this.score += 100;
        this.bumpCombo();
        if (this.hooks.onGold) this.hooks.onGold(30, '出征集结达成');
        this.broadcast(`🎖 出征物资集结完毕！${CITY.name(this.requisition.city)}军心大振（+30💰 +100分）`, 'ok');
      }
    }
  }

  /* ---------- 提示（方案2.2 PD播报） ---------- */
  getMostUrgent() {
    const r = this.regions.find(x => !x.dead && x.replicas.length < 3);
    if (r) return `最紧急：${SUPPLY.name(r.id)}仓只剩 ${r.replicas.length} 份存货！转运不能增加份数——选中它点「🔨 补货」（${CFG.REPAIR_COST}⚡；买了急修队则付 ${ECON.REPAIR_GOLD}💰）`;
    for (const t of this.tikvs) if (t.offline) return `${CITY.name(t.id)}已陷落，关注受影响仓库的补货进度。`;
    const big = this.regions.filter(x => !x.dead && x.size > CFG.SPLIT_MAX).sort((a, b) => b.size - a.size)[0];
    if (big) return `最紧急：${SUPPLY.name(big.id)}存货 ${Math.round(big.size)} 爆仓，请选中并分仓！`;
    const hot = this.regions.filter(x => !x.dead && x.heat >= CFG.HEAT_DANGER).sort((a, b) => b.heat - a.heat)[0];
    if (hot) return `最紧急：${SUPPLY.name(hot.id)}妖火 ${Math.round(hot.heat)}，分仓可把火苗一分为二！`;
    const over = this.tikvs.filter(t => !t.offline && this.nodeLoad(t) > CFG.LOAD_DANGER)
      .sort((a, b) => this.nodeLoad(b) - this.nodeLoad(a))[0];
    if (over) return `最紧急：${CITY.full(over.id)}城墙吃紧 ${Math.round(this.nodeLoad(over))}%，转运部分仓库出去！`;
    const warn = this.tikvs.filter(t => !t.offline && this.nodeLoad(t) > CFG.LOAD_WARN)
      .sort((a, b) => this.nodeLoad(b) - this.nodeLoad(a))[0];
    if (warn) return `关注：${CITY.full(warn.id)}耐久 ${Math.round(this.nodeLoad(warn))}% 接近预警线。`;
    return '城邦稳态运转中，保持观察，为敌袭留足算力。';
  }

  broadcast(text, type) { if (this.hooks.onBroadcast) this.hooks.onBroadcast(text, type || 'info'); }

  /* ---------- 结算（方案1.5 星级） ---------- */
  calcStars() {
    if (this.status !== 'won') return 0;
    if (this.citiesFallen > 0) return 1;        // 丢过城，只有1星
    if (this.peakRisk <= CFG.STAR3_RISK) return 3;
    if (this.peakRisk <= CFG.STAR2_RISK) return 2;
    return 1;
  }
  getStats() {
    return {
      survive: this.lv.duration,
      peakRisk: Math.round(this.peakRisk),
      ops: this.opsCount,
      nodesDowned: this.nodesDowned,
      lostReplicaEvents: this.lostReplicaEvents,
      stars: this.calcStars(),
    };
  }

  /* ---------- 任务系统（冒险模式）：当前值 / 是否达成 ---------- */
  taskValue(t) {
    switch (t.stat) {
      case 'migrate': return this.stats.migrate;
      case 'split': return this.stats.split;
      case 'lost': return this.lostReplicaEvents;
      case 'cities': return this.citiesFallen;
      case 'balance': {
        const loads = this.tikvs.filter(t => !t.offline).map(t => this.nodeLoad(t));
        if (loads.length < 2) return 0;
        return Math.round(Math.max(...loads) - Math.min(...loads));
      }
      case 'peakRisk': return Math.round(this.peakRisk);
      case 'powerLeft': return Math.round(this.power * 10) / 10;
      default: return 0;
    }
  }
  taskMet(t) { return t.op === '<=' ? this.taskValue(t) <= t.target : this.taskValue(t) >= t.target; }
  calcTasks() { return (this.lv.tasks || []).map(t => ({ stat: t.stat, op: t.op, target: t.target, desc: t.desc, done: this.taskMet(t), value: this.taskValue(t) })); }
}
