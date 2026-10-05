/* =========================================================
 * uiSystem.js —— 动态UI系统（方案4.3）
 * Part A  SandboxRenderer：Phaser 沙盘（节点卡/副本块/副本连线/告警特效）
 * Part B  HUD：顶栏状态、右侧操作栏、PD控制台播报、弹窗结算
 * ========================================================= */
'use strict';

/* ============ Part A · 沙盘渲染器 ============ */
class SandboxRenderer {
  constructor(scene) {
    this.scene = scene;
    this.slots = [];
    this.nodeCount = 0;
    this.nodes = new Map();   // tikvId -> {g,name,load,cap}
    this.blocks = new Map();  // `${regionId}_${tikvId}` -> {container,g,txt,bar,tag,flame,rep,x,y,w,h,cx,cy}
    this.ghost = null;
    this.hl = null;           // {tikvId, ok}
    this.selected = null;     // regionId
    this.warnTexts = new Map();

    this.lineG = scene.add.graphics().setDepth(0);
    this.fxG = scene.add.graphics().setDepth(6);
    this.floodTxt = scene.add.text(CFG.VIEW_W / 2, 12, '', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: '#f44336', padding: { x: 14, y: 5 },
    }).setOrigin(0.5, 0).setDepth(7).setVisible(false);
    // 敌袭大警报横幅（无法忽视级）
    this.warnBanner = scene.add.text(CFG.VIEW_W / 2, 10, '', {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '24px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: '#c62828', padding: { x: 20, y: 8 },
    }).setOrigin(0.5, 0).setDepth(8).setVisible(false).setStroke('#5b1210', 6);
    this._warnSeen = new Set();
    this._offlineCount = 0;
    this._fallenSeen = new Set();
    this._bursts = []; // 城破爆发特效 [{tikv, t0}]
    this._enemyPos = []; // 每帧更新的可点击军团位置 [{x,y,tikv,type,r}]
    scene.add.rectangle(CFG.VIEW_W / 2, CFG.VIEW_H / 2, CFG.VIEW_W, CFG.VIEW_H, CFG.COLORS.bg).setDepth(-1);
  }

  /* ---------- 布局 ---------- */
  layout(core) {
    const n = core.tikvs.length;
    const gap = 12;
    const slotW = Math.min(300, (CFG.VIEW_W - 32 - (n - 1) * gap) / n);
    const total = n * slotW + (n - 1) * gap;
    const x0 = (CFG.VIEW_W - total) / 2;
    this.slots = [];
    for (let i = 0; i < n; i++) this.slots.push({ x: x0 + i * (slotW + gap), w: slotW });
  }

  rebuildNodes(core) {
    for (const nd of this.nodes.values()) { nd.g.destroy(); nd.name.destroy(); nd.load.destroy(); nd.cap.destroy(); if (nd.relief) nd.relief.destroy(); if (nd.gate) nd.gate.destroy(); if (nd.seal) nd.seal.destroy(); if (nd.siegeBadge) nd.siegeBadge.destroy(); }
    this.nodes.clear();
    for (const wt of this.warnTexts.values()) wt.destroy();
    this.warnTexts.clear();

    this.layout(core);
    this.nodeCount = core.tikvs.length;
    core.tikvs.forEach((t, i) => {
      const s = this.slots[i];
      const g = this.scene.add.graphics().setDepth(1);
      const name = this.scene.add.text(0, 0, '', this.font(15, '#2c3e50', 'bold')).setDepth(2);
      const load = this.scene.add.text(0, 0, '', this.font(14, '#2c3e50', 'bold')).setOrigin(1, 0).setDepth(2);
      const cap = this.scene.add.text(0, 0, '', this.font(11, '#8494a7')).setDepth(2);
      const sealG = this.scene.add.graphics();
      sealG.fillStyle(0x8a2f26, 0.92); sealG.fillCircle(0, 0, 52);
      sealG.lineStyle(2.5, 0xffffff, 0.85); sealG.strokeCircle(0, 0, 52);
      sealG.lineStyle(1.5, 0xffffff, 0.5); sealG.strokeCircle(0, 0, 45);
      const sealT = this.scene.add.text(0, 0, '陷落', this.font(28, '#ffffff', 'bold')).setOrigin(0.5);
      const sealC = this.scene.add.text(0, 64, '', this.font(13, '#ffffff', 'bold'))
        .setOrigin(0.5, 0).setBackgroundColor('rgba(90,20,14,0.92)').setPadding(6, 3, 6, 4);
      const seal = this.scene.add.container(0, 0, [sealG, sealT, sealC]).setDepth(4.5).setVisible(false).setRotation(-0.1);
      const relief = this.scene.add.text(0, 0, '', this.font(11, '#ffffff', 'bold'))
        .setBackgroundColor('#ff9800').setPadding(4, 1, 4, 1).setOrigin(1, 0).setDepth(4).setVisible(false);
      const gate = this.scene.textures.exists('gate' + (t.id % 6))
        ? this.scene.add.image(0, 0, 'gate' + (t.id % 6)).setDepth(1.5).setOrigin(0, 0)
        : null;
      const siegeBadge = this.scene.add.text(0, 0, '', this.font(11, '#ffffff', 'bold'))
        .setBackgroundColor('#c62828').setPadding(4, 1, 4, 1).setOrigin(1, 0).setDepth(4).setVisible(false);
      this.nodes.set(t.id, { g, name, load, cap, relief, gate, seal, siegeBadge, slotIdx: i });
    });
  }

  font(size, color, style) {
    return {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: size + 'px', color, fontStyle: style || 'normal',
    };
  }

  /* ---------- 跨局重置（清残留块/预警字/幽灵/高亮） ---------- */
  reset() {
    for (const key of [...this.blocks.keys()]) this.removeBlock(key);
    for (const wt of this.warnTexts.values()) wt.destroy();
    this.warnTexts.clear();
    this.dropGhost(true);
    this.clearHighlight();
    this.selected = null;
    this.lineG.clear();
    this.fxG.clear();
    this.floodTxt.setVisible(false);
    this._warnSeen.clear();
    this._fallenSeen.clear();
    this._bursts = [];
    this._offlineCount = 0;
    if (this.enemyG) this.enemyG.clear();
    (this._foeImgs || []).forEach(img => img && img.setVisible(false));
  }

  /* 点击命中敌军：返回 {tikv,type} 或 null */
  hitEnemy(px, py) {
    for (const e of this._enemyPos) {
      if (Math.abs(px - e.x) <= e.r + 12 && Math.abs(py - e.y) <= 36) return e;
    }
    return null;
  }

  /* ---------- 每帧渲染 ---------- */
  render(core, es) {
    // 城邦远景背景（SVG 纹理就绪后一次性加入）
    if (!this._bgReady && this.scene.textures.exists('scenebg')) {
      this._bgReady = true;
      this.scene.add.image(CFG.VIEW_W / 2, CFG.VIEW_H / 2, 'scenebg')
        .setDisplaySize(CFG.VIEW_W, CFG.VIEW_H).setDepth(-1).setAlpha(0.9);
    }
    if (core.tikvs.length !== this.nodeCount) this.rebuildNodes(core);
    // 城破瞬间：轰塌音效 + 镜头震动
    const offNow = core.tikvs.filter(t => t.offline).length;
    if (offNow > this._offlineCount) {
      SFX.play('down');
      this.scene.cameras.main.shake(280, 0.005);
      // 找出刚陷落的城 → 爆发特效
      core.tikvs.forEach(t => {
        if (t.offline && !this._fallenSeen.has(t.id)) {
          this._fallenSeen.add(t.id);
          this._bursts.push({ tikv: t.id, t0: this.scene.time.now });
        }
      });
    }
    this._offlineCount = offNow;
    this.syncBlocks(core);
    this.drawLines(core);
    core.tikvs.forEach(t => this.drawNode(t, core, es));
    this.drawWarnings(core, es);
    this.drawEnemies(core, es);
    this.drawFlood(core);
  }

  /* 敌军立绘按真实宽高比缩放（避免被拉伸变形），底边贴地 */
  placeFoe(img, texKey, x, y, w) {
    let h = w * 1.18;
    if (this.scene.textures.exists(texKey)) {
      const tex = this.scene.textures.get(texKey).getSourceImage();
      if (tex && tex.width && tex.height) h = w * (tex.height / tex.width);
    }
    img.setPosition(x, y - h / 2 + 8).setDisplaySize(w, h);
    return h;
  }

  /* ---------- 敌军行军可视化（军团从屏幕边缘压向目标城） ---------- */
  drawEnemies(core, es) {
    if (!this.enemyG) this.enemyG = this.scene.add.graphics().setDepth(5.5);
    const g = this.enemyG;
    g.clear();
    this._enemyPos = [];
    // 必须先建好数组：围攻分支按索引直接取用，而初始化原本只写在行军分支里，
    // 一旦某帧只有围攻没有行军就会崩（随机目标后才会出现这种帧）
    if (!this._foeImgs) this._foeImgs = [];
    // 每帧先把所有敌军立绘藏起来：行军转围攻、围攻结束后不再残留旧形象（否则会与城下攻城军叠在一起）
    this._foeImgs.forEach(img => img && img.setVisible(false));
    if (!es) return;
    const sieges = es.warnings.filter(w => !w.planned);
    const laneY = CFG.NODE_Y + 110; // 行军带：城区卡片上部（城名下方、仓块上方之间的空隙）
    sieges.forEach((w, idx) => {
      const slot = this.slots[w.tikv];
      // 该城已兵临城下（转入围攻）：行军形象不再显示，避免与城下攻城军重叠
      if (!slot || es.isSiege(w.tikv)) return;
      const targetX = slot.x + slot.w / 2;
      // 行军被限制在目标城自己的城区范围内：从靠屏幕边缘一侧的城界出现，压向城门（城中心）。
      // 旧版从屏幕最左/最右边缘长距离行军，打东城时会横穿内城辖区，看起来像"都从内城那边跑出来"。
      const startX = targetX < CFG.VIEW_W / 2 ? slot.x + 26 : slot.x + slot.w - 26;
      const p = clamp(1 - w.t / w.countdown, 0, 1);
      let x = startX + (targetX - startX) * p;
      const y = laneY + (idx % 3) * 7;
      // 受击后仰
      const sinceHit = performance.now() - (w.hitAt || 0);
      if (sinceHit < 160) x -= Math.sign(targetX - x) * 10 * (1 - sinceHit / 160);
      this._enemyPos.push({ x, y: y + 26, tikv: w.tikv, type: 'march', r: 30, hp: w.hp, maxHp: ECON.MARCH_HP, hitAt: w.hitAt });
      // 行军路线（虚线：从城界指向城门，路径收在本城辖区内，不横穿邻城）
      g.lineStyle(2, 0xc0392b, 0.35);
      for (let dx = 0; dx < Math.abs(targetX - x); dx += 14) {
        const sx = x + Math.sign(targetX - x) * dx;
        g.lineBetween(sx, y, sx + Math.sign(targetX - x) * 8, y);
      }
      // 出征标记：起点处画一个敌营小旗，标明敌军是从本城辖区外缘开进的
      g.lineStyle(2.5, 0x3f322a, 0.9);
      g.lineBetween(startX, y + 6, startX, y - 18);
      g.fillStyle(0x8e44ad, 0.85);
      g.fillTriangle(startX, y - 18, startX + 14, y - 13, startX, y - 8);
      // 军团：3 个兵卒 + 令旗（行进颠簸）
      const bob = Math.sin(this.scene.time.now / 90) * 2;
      // 3 份武卒立绘
      const dir = x < targetX ? 1 : -1;
      if (!this._foeImgs) this._foeImgs = [];
      let img = this._foeImgs[w.tikv];
      if (!img && this.scene.textures.exists('foe')) {
        img = this.scene.add.image(0, 0, 'foe').setDepth(5.6);
        this._foeImgs[w.tikv] = img;
      }
      if (img) {
        this.placeFoe(img, 'foe', x, y - 8 + bob * .5, 42);
        img.setFlipX(dir < 0);
        img.setVisible(true);
      }
      // 脚下柔影：小尺寸精灵靠投影才有落地感
      g.fillStyle(0x14293a, 0.15); g.fillEllipse(x, y + 13, 26, 7);
      // 令旗
      g.lineStyle(2.5, 0x3f322a, 1);
      g.lineBetween(x + 22, y + 4, x + 22, y - 30);
      g.fillStyle(0xc0392b, 1);
      g.fillTriangle(x + 22, y - 30, x + 44 + Math.sin(this.scene.time.now / 130) * 3, y - 25, x + 22, y - 19);
      // 距离压条
      g.fillStyle(0x2c3e50, 0.75);
      g.fillRoundedRect(x - 24, y - 44, 48, 9, 4);
      g.fillStyle(0xe74c3c, 1);
      g.fillRoundedRect(x - 22, y - 42, Math.max(3, 44 * p), 5, 2);
      // 血量 pip（可被砍杀）
      for (let k = 0; k < ECON.MARCH_HP; k++) {
        g.fillStyle(k < w.hp ? 0xffd54f : 0x4a5568, 1);
        g.fillCircle(x - 12 + k * 12, y - 52, 3.5);
      }
      if (sinceHit < 120) { g.lineStyle(3, 0xffffff, 1 - sinceHit / 120); g.strokeCircle(x, y - 10, 24); }
      // 临近冲锋
      if (w.t < 1.5) {
        g.lineStyle(2, 0xe74c3c, 0.5 + 0.5 * Math.sin(this.scene.time.now / 60));
        g.strokeCircle(x, y - 8, 26);
      }
    });
    // 围攻中的军团：驻在城下拼杀（火花乱溅）
    const citySieges = es ? es.sieges : [];
    citySieges.forEach((sg, idx) => {
      const slot = this.slots[sg.tikv];
      if (!slot) return;
      const x = slot.x + slot.w / 2;
      const y = laneY + (idx % 3) * 7;
      const bob = Math.sin(this.scene.time.now / 70) * 2.5;
      this._enemyPos.push({ x, y: y - 10, tikv: sg.tikv, type: 'siege', r: 30, hp: sg.hp, maxHp: ECON.SIEGE_HP, hitAt: sg.hitAt });
      const sinceHit = performance.now() - (sg.hitAt || 0);
      // 围攻军团用重甲立绘（foe2），缺失时回退 foe
      const texKey = this.scene.textures.exists('foe2') ? 'foe2' : 'foe';
      let img = this._foeImgs[6 + sg.tikv];
      if (!img && this.scene.textures.exists(texKey)) {
        img = this.scene.add.image(0, 0, texKey).setDepth(5.6);
        this._foeImgs[6 + sg.tikv] = img;
      }
      if (img) {
        this.placeFoe(img, texKey, x + (sinceHit < 160 ? Math.sin(performance.now()/60) * 6 : 0), y - 8 + bob * .5, 50);
        img.setVisible(true);
      }
      g.fillStyle(0x14293a, 0.15); g.fillEllipse(x, y + 13, 30, 8);
      for (let k = 0; k < ECON.SIEGE_HP; k++) {
        g.fillStyle(k < sg.hp ? 0xffd54f : 0x4a5568, 1);
        g.fillCircle(x - 15 + k * 10, y - 52, 3);
      }
      if (sinceHit < 120) { g.lineStyle(3, 0xffffff, 1 - sinceHit / 120); g.strokeCircle(x, y - 10, 26); }
      // 拼杀火花
      if (Math.sin(this.scene.time.now / 45 + idx) > 0.3) {
        g.lineStyle(2.5, 0xffd54f, 0.9);
        const sx = x + randInt(-22, 22);
        g.lineBetween(sx, y - 12, sx + randInt(-8, 8), y - 30 + randInt(-6, 6));
      }
      // 敌军士气条（倒计时）
      g.fillStyle(0x2c3e50, 0.75);
      g.fillRoundedRect(x - 26, y - 44, 52, 9, 4);
      g.fillStyle(0x8e44ad, 1);
      g.fillRoundedRect(x - 24, y - 42, Math.max(3, 48 * (sg.t / (sg.maxT || ECON.SIEGE_TIME))), 5, 2);
    });

    // 城破爆发冲击环
    for (const b of [...this._bursts]) {
      const age = this.scene.time.now - b.t0;
      if (age > 550) { this._bursts.splice(this._bursts.indexOf(b), 1); continue; }
      const slot = this.slots[b.tikv];
      if (!slot) continue;
      const p = age / 550;
      g.lineStyle(5 * (1 - p), 0xe74c3c, 1 - p);
      g.strokeCircle(slot.x + slot.w / 2, CFG.NODE_Y + CFG.NODE_H * 0.55, 30 + 90 * p);
    }
  }

  /* ---------- 节点卡片（城区：城墙垛口 + 耐久色阶 + 陷落特效） ---------- */
  drawNode(t, core, es) {
    const nd = this.nodes.get(t.id);
    const s = this.slots[nd.slotIdx];
    const C = CFG.COLORS;
    const load = t.offline ? 0 : core.nodeLoad(t);
    const isWarn = es && (es.isWarning(t.id) || es.isSiege(t.id));
    const g = nd.g;
    g.clear();

    const x = s.x, y = CFG.NODE_Y, w = s.w, h = CFG.NODE_H;
    // 城墙垛口（卡片顶上方一排齿）
    const teeth = 5, tw = (w - 28) / (teeth * 2 - 1);
    g.fillStyle(t.offline ? 0x9aa5b1 : 0xcfd8e3, 1);
    for (let k = 0; k < teeth; k++) g.fillRect(x + 14 + k * tw * 2, y - 8, tw, 9);
    // 卡片投影 + 主体（城区）
    g.fillStyle(0x1d3547, 0.13);
    g.fillRoundedRect(x + 4, y + 7, w, h, 14);
    g.fillStyle(t.offline ? 0xdfe3e8 : C.panel, 1);
    g.fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, t.offline ? C.offline : C.border, t.offline ? 0.8 : 1);
    g.strokeRoundedRect(x, y, w, h, 14);
    // 城墙描边加粗一层（建筑感）
    g.lineStyle(4, t.offline ? 0xb6bfc9 : 0xe9eef4, 1);
    g.strokeRoundedRect(x + 3, y + 3, w - 6, 26, 8);

    // 高亮（拖拽目标合法/非法）
    if (this.hl && this.hl.tikvId === t.id) {
      g.lineStyle(3.5, this.hl.ok ? C.ok : C.danger, 1);
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 16);
    }
    // 敌军攻城：红色脉冲描边 + 顶部火光
    if (isWarn && !t.offline) {
      g.lineStyle(3, C.danger, 0.45 + 0.45 * Math.sin(this.scene.time.now / 90));
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 16);
    }

    // 资源告急：橙色脉冲 + 驰援进度标签
    const rl = es ? es.relief : null;
    const isRelief = !!(rl && rl.tikv === t.id && !t.offline);
    if (isRelief) {
      g.lineStyle(3, 0xff9800, 0.45 + 0.4 * Math.sin(this.scene.time.now / 120));
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 16);
    }
    if (nd.relief) {
      nd.relief.setVisible(isRelief);
      if (isRelief) nd.relief.setText(`⚠ 告急 · 驰援 ${rl.got}/${rl.need} · ${Math.ceil(rl.t)}s`).setPosition(x + w - 8, y + 10);
    }
    // 围攻徽章：城内仓数实时显示
    if (nd.siegeBadge) {
      const sg = es ? es.sieges.find(x => x.tikv === t.id) : null;
      nd.siegeBadge.setVisible(!!sg);
      if (sg) {
        const n = es.cityStock(t.id);
        const min = ECON.SIEGE_HOLD_MIN;
        const slow = (Math.max(0, n - 3) * ECON.SIEGE_STOCK_SLOW).toFixed(1);
        const txt = n < min
          ? `⚠ 仅剩 ${n}/${min} 仓！不足三副本 → 城破`
          : (n === min
            ? `⚠ 贴红线 ${n}/${min} 仓 · 再烧一次城破 · ${Math.ceil(sg.t)}s 后撤退`
            : `⚔ 围攻 ${n}/${min} 仓（拖慢敌军 ${slow}s）· ${Math.ceil(sg.t)}s 后撤退`);
        nd.siegeBadge.setText(txt).setPosition(x + w - 8, y + 10);
        nd.siegeBadge.setBackgroundColor(n <= min ? '#8e1a14' : '#c62828');
      }
    }

    // 城门图：完整等比显示、贴卡片底部（城楼永远完整可见），陷落时灰化淡出
    if (nd.gate) {
      const tex = this.scene.textures.get('gate' + (t.id % 6)).getSourceImage();
      const dispH = w * (tex.height / tex.width);
      nd.gate.setPosition(x, y + CFG.NODE_H - dispH).setDisplaySize(w, dispH);
      nd.gate.setTint(t.offline ? 0x8890a0 : 0xffffff).setAlpha(t.offline ? 0.12 : 0.8);
    }

    // 头部：城区名 + TiKV 编号小字 + 耐久%
    nd.name.setText(CITY.name(t.id))
      .setPosition(x + 12, y + 8)
      .setColor(t.offline ? '#8494a7' : '#2c3e50').setFontSize(17);
    nd.cap.setText(t.offline ? '⚔ 城区已陷落' : `城墙·${CITY.name(t.id)} | TiKV-${t.id + 1}`).setPosition(x + 12, y + 52);
    nd.load.setText(t.offline ? '陷落' : Math.round(load) + '%')
      .setPosition(x + w - 12, y + 8)
      .setColor(t.offline ? '#8494a7' : load > CFG.LOAD_DANGER ? '#f44336' : load > CFG.LOAD_WARN ? '#d68900' : '#4caf50');

    // 耐久条（城墙水位，动态色阶）
    const bw = w - 24, bx = x + 12, by = y + 34;
    g.fillStyle(0xe8edf3, 1);
    g.fillRoundedRect(bx, by, bw, 10, 5);
    if (!t.offline && load > 0) {
      const c = load > CFG.LOAD_DANGER ? C.danger : load > CFG.LOAD_WARN ? C.warn : C.ok;
      g.fillStyle(c, 1);
      g.fillRoundedRect(bx, by, Math.max(6, bw * clamp(load, 0, 100) / 100), 10, 5);
    }

    if (t.offline) {
      // 陷落：灰烬罩层 + 暗红边框 + 朱印
      g.fillStyle(0x39424e, 0.16);
      g.fillRoundedRect(x, y, w, h, 14);
      g.lineStyle(3, 0x8a4a42, 0.85);
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 16);
      nd.seal.setVisible(true).setPosition(x + w / 2, y + h / 2 - 20);
      nd.seal.list[2].setText(t.fallCause || '守军寡不敌众');
      if (!nd._sealShown) {
        nd._sealShown = true;
        nd.seal.setScale(2.4).setAlpha(0);
        this.scene.tweens.add({ targets: nd.seal, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
      }
    } else {
      nd.seal.setVisible(false);
      nd._sealShown = false;
    }
  }

  /* ---------- 副本块同步（出现/消失/重绘） ---------- */
  syncBlocks(core) {
    const want = new Set();
    core.tikvs.forEach((t, i) => {
      if (t.offline) return;
      const s = this.slots[i];
      const reps = core.regions.filter(r => !r.dead && r.replicas.includes(t.id));
      const count = Math.max(reps.length, 1);
      const gapB = 6;
      const bh = clamp(Math.floor((CFG.NODE_H - 118 - 10) / count) - gapB, 22, 44);
      reps.forEach((r, k) => {
        const key = r.id + '_' + t.id;
        want.add(key);
        let b = this.blocks.get(key);
        if (!b) { b = this.makeBlock(r, t.id); this.blocks.set(key, b); }
        b.x = s.x + 10;
        b.y = CFG.NODE_Y + 118 + k * (bh + gapB);
        b.w = s.w - 20; b.h = bh;
        b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2;
        b.container.setPosition(b.x, b.y);
        b.regionId = r.id;
        this.drawBlock(b, r, core);
      });
    });
    for (const [key, b] of [...this.blocks]) {
      if (!want.has(key)) this.removeBlock(key);
    }
  }

  makeBlock(r, tikvId) {
    const container = this.scene.add.container(0, 0).setDepth(3);
    const g = this.scene.add.graphics();
    const txt = this.scene.add.text(0, 0, '', this.font(13, '#ffffff', 'bold'));
    const bar = this.scene.add.graphics();
    const tag = this.scene.add.text(0, 0, '过大', this.font(10, '#5d4037', 'bold'))
      .setBackgroundColor('#ffc107').setPadding(2, 1, 2, 1);
    const flame = this.scene.add.text(0, 0, '🔥', this.font(12));
    const rep = this.scene.add.text(0, 0, '⟳ 自愈中', this.font(10, '#ffffff', 'bold'))
      .setBackgroundColor('rgba(0,0,0,0.35)').setPadding(3, 1, 3, 1);
    container.add([g, bar, txt, tag, flame, rep]);
    container.setScale(0);
    this.scene.tweens.add({ targets: container, scale: 1, duration: 160, ease: 'Back.Out' });
    const b = { container, g, txt, bar, tag, flame, rep, regionId: r.id, tikvId, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
    return b;
  }

  drawBlock(b, r, core) {
    const C = CFG.COLORS;
    const color = CFG.REGION_PALETTE[r.colorIdx % CFG.REGION_PALETTE.length];
    const selected = this.selected === r.id;
    const hot = r.heat >= CFG.HEAT_DANGER;
    const over = r.size > CFG.SPLIT_MAX;

    b.container.setPosition(b.x, b.y);
    b.g.clear();
    // 投影 + 底色
    b.g.fillStyle(0x1f2d3a, 0.18);
    b.g.fillRoundedRect(2, 3, b.w, b.h, 8);
    b.g.fillStyle(color, r.heat >= 30 ? 1 : 0.92);
    b.g.fillRoundedRect(0, 0, b.w, b.h, 8);
    b.g.lineStyle(1, 0xffffff, 0.35);
    b.g.strokeRoundedRect(0, 0, b.w, b.h, 8);
    // 仓库棚顶（块内上部淡色三角，建筑感）
    b.g.fillStyle(0xffffff, 0.22);
    b.g.fillTriangle(4, 2, b.w / 2, Math.min(16, b.h * 0.42), b.w - 4, 2);
    // 状态描边：选中金色 / 热点红闪
    if (selected) {
      b.g.lineStyle(3, 0xffd54f, 1);
      b.g.strokeRoundedRect(-1.5, -1.5, b.w + 3, b.h + 3, 9);
    } else if (hot) {
      b.g.lineStyle(2.5, C.danger, 0.6 + 0.4 * Math.sin(this.scene.time.now / 110));
      b.g.strokeRoundedRect(-1, -1, b.w + 2, b.h + 2, 9);
    } else if (over) {
      b.g.lineStyle(2, C.warn, 0.9);
      b.g.strokeRoundedRect(-1, -1, b.w + 2, b.h + 2, 9);
    }
    // 体积条（白，占 SIZE_HARD 比例）
    const frac = clamp(r.size / CFG.SIZE_HARD, 0, 1);
    b.bar.clear();
    b.bar.fillStyle(0xffffff, 0.4);
    b.bar.fillRoundedRect(4, b.h - 6, Math.max(4, (b.w - 8) * frac), 3, 2);
    // 物资图标（SVG 纹理就绪后惰性创建）+ 名称垂直居中
    const texKey = 'sup' + ((r.id - 1) % 12);
    if (!b.icon && this.scene.textures.exists(texKey)) {
      b.icon = this.scene.add.image(16, b.h / 2, texKey).setDisplaySize(18, 18);
      b.container.add(b.icon);
    }
    if (b.icon) b.icon.setPosition(16, b.h / 2);
    b.txt.setText(SUPPLY.name(r.id)).setPosition(b.icon ? 30 : 7, b.h / 2 - 9);
    b.txt.setFontSize(b.icon ? 14 : 13);
    // 体积数字（右侧）
    if (!b.sizeTxt) {
      b.sizeTxt = this.scene.add.text(0, 0, '', this.font(11, '#ffffff')).setOrigin(1, 0);
      b.container.add(b.sizeTxt);
    }
    b.sizeTxt.setText(r.size.toFixed(1)).setPosition(b.w - 6, 3);
    // 过大标签
    b.tag.setVisible(over).setPosition(6, b.h - 22);
    // 热点火焰
    b.flame.setVisible(hot).setPosition(b.w - 20, b.h - 24);
    // 自愈中
    b.rep.setVisible(!!r.repairing && Math.sin(this.scene.time.now / 150) > -0.3)
      .setPosition(b.w / 2 - 26, b.h / 2 - 9);
  }

  removeBlock(key) {
    const b = this.blocks.get(key);
    if (!b) return;
    this.blocks.delete(key);
    this.scene.tweens.add({
      targets: b.container, scale: 0, duration: 140, ease: 'Back.In',
      onComplete: () => b.container.destroy(),
    });
  }

  /* ---------- 副本连线（核心可视化：同Region同色） ---------- */
  drawLines(core) {
    const g = this.lineG;
    g.clear();
    for (const r of core.regions) {
      if (r.dead || r.replicas.length < 2) continue;
      const pts = r.replicas.map(tid => {
        const b = this.blocks.get(r.id + '_' + tid);
        return b ? { x: b.cx, y: b.cy } : null;
      }).filter(Boolean);
      if (pts.length < 2) continue;
      const color = r.replicas.length < 3 ? CFG.COLORS.danger
        : CFG.REGION_PALETTE[r.colorIdx % CFG.REGION_PALETTE.length];
      const alpha = r.heat >= CFG.HEAT_DANGER
        ? 0.35 + 0.25 * Math.sin(this.scene.time.now / 120)
        : 0.3;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          if (r.replicas.length < 3) this.drawDash(g, pts[i], pts[j], color, alpha);
          else {
            g.lineStyle(2, color, alpha);
            g.lineBetween(pts[i].x, pts[i].y, pts[j].x, pts[j].y);
          }
        }
      }
    }
  }
  drawDash(g, p1, p2, color, alpha) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    const dash = 7, gap = 6;
    let d = 0;
    g.lineStyle(2, color, alpha);
    while (d < len) {
      const d2 = Math.min(d + dash, len);
      g.lineBetween(p1.x + ux * d, p1.y + uy * d, p1.x + ux * d2, p1.y + uy * d2);
      d += dash + gap;
    }
  }

  /* ---------- 宕机倒计时特效 ---------- */
  drawWarnings(core, es) {
    const warns = es ? es.warnings : [];
    // 新出现的警报：拉响警报音
    for (const w of warns) {
      const key = w.tikv + '_' + w.planned;
      if (!this._warnSeen.has(key)) {
        this._warnSeen.add(key);
        SFX.play('alarm');
      }
    }
    for (const key of [...this._warnSeen]) {
      const tikv = +key.split('_')[0];
      if (!warns.some(w => w.tikv === tikv)) this._warnSeen.delete(key);
    }
    // 大警报横幅：围攻（最紧急）> 行军敌袭 > 弃城令
    const citySieges = es ? es.sieges : [];
    const sieges = warns.filter(w => !w.planned);
    const planned = warns.filter(w => w.planned);
    const sg = citySieges[0];
    const urgent = sieges.sort((a, b) => a.t - b.t)[0];
    const soft = planned.sort((a, b) => a.t - b.t)[0];
    if (sg) {
      const n = es.cityStock(sg.tikv), min = ECON.SIEGE_HOLD_MIN;
      this.warnBanner.setVisible(true)
        .setText(n < min
          ? `⚔️ 围攻【${CITY.name(sg.tikv)}】仅剩 ${n}/${min} 仓！不足三副本 → 城破在即，快拖仓支援！`
          : `⚔️ 围攻【${CITY.name(sg.tikv)}】${n}/${min} 仓 · 敌军 ${Math.ceil(sg.t)}s 后撤退——仓越多城墙越厚！`)
        .setBackgroundColor(Math.sin(this.scene.time.now / 90) > 0 ? '#c62828' : '#8e1a14');
      this.floodTxt.setPosition(CFG.VIEW_W / 2, 60);
    } else if (urgent) {
      const un = es.cityStock(urgent.tikv), min = ECON.SIEGE_HOLD_MIN;
      this.warnBanner.setVisible(true)
        .setText(un < min
          ? `⚔️ 敌军 ${urgent.t.toFixed(1)} 秒后攻破【${CITY.name(urgent.tikv)}】！城内仅 ${un}/${min} 仓＝不足三副本，会被一攻即破！快拖仓到 ${min} 仓以上！`
          : `⚔️ 敌军 ${urgent.t.toFixed(1)} 秒后攻破【${CITY.name(urgent.tikv)}】！城内 ${un} 仓可守（红线 ${min} 仓）· 拖仓支援或御敌反击！`)
        .setBackgroundColor(Math.sin(this.scene.time.now / 90) > 0 ? '#c62828' : '#8e1a14');
      this.floodTxt.setPosition(CFG.VIEW_W / 2, 60);
    } else if (soft) {
      this.warnBanner.setVisible(true)
        .setText(`📋 弃城令：${Math.ceil(soft.t)} 秒内迁空【${CITY.name(soft.tikv)}】`)
        .setBackgroundColor('#546e7a');
      this.floodTxt.setPosition(CFG.VIEW_W / 2, 60);
    } else {
      this.warnBanner.setVisible(false);
      this.floodTxt.setPosition(CFG.VIEW_W / 2, 12);
    }
    const active = new Set(warns.map(w => w.tikv));
    for (const [id, txt] of [...this.warnTexts]) {
      if (!active.has(id)) { txt.destroy(); this.warnTexts.delete(id); }
    }
    for (const w of warns) {
      const t = core.tikvs[w.tikv];
      if (!t || t.offline) continue;
      const nd = this.nodes.get(w.tikv);
      const s = this.slots[nd.slotIdx];
      let txt = this.warnTexts.get(w.tikv);
      if (!txt) {
        txt = this.scene.add.text(0, 0, '', this.font(30, '#ffffff', 'bold'))
          .setOrigin(0.5).setDepth(5)
          .setBackgroundColor('#f44336').setPadding(10, 4, 10, 6);
        this.warnTexts.set(w.tikv, txt);
      }
      txt.setText(`⚔ ${Math.max(0, w.t).toFixed(1)}s`);
      txt.setPosition(s.x + s.w / 2, CFG.NODE_Y + 130);
    }
  }

  /* ---------- 数据洪峰特效 ---------- */
  drawFlood(core) {
    const g = this.fxG;
    g.clear();
    // 最后 10 秒：全屏红色警戒脉动（紧张氛围）
    if (core.status === 'playing' && core.timeLeft <= 10) {
      const a = 0.28 + 0.24 * Math.sin(this.scene.time.now / 110);
      g.lineStyle(16, CFG.COLORS.danger, a);
      g.strokeRect(8, 8, CFG.VIEW_W - 16, CFG.VIEW_H - 16);
    }
    if (core.floodTimer > 0) {
      const a = 0.25 + 0.18 * Math.sin(this.scene.time.now / 150);
      g.lineStyle(10, CFG.COLORS.danger, a);
      g.strokeRect(5, 5, CFG.VIEW_W - 10, CFG.VIEW_H - 10);
      this.floodTxt.setVisible(true).setText(`🌊 贸易洪峰 ×${CFG.FLOOD_RATE}　剩余 ${Math.ceil(core.floodTimer)}s`);
    } else {
      this.floodTxt.setVisible(false);
    }
  }

  /* ---------- 拾取（拖拽用） ---------- */
  pickReplica(x, y) {
    for (const b of this.blocks.values()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        return { regionId: b.regionId, tikvId: b.tikvId };
      }
    }
    return null;
  }
  pickNode(x, y) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (x >= s.x && x <= s.x + s.w && y >= CFG.NODE_Y && y <= CFG.NODE_Y + CFG.NODE_H) return i;
    }
    return null;
  }

  /* ---------- 拖拽幽灵 ---------- */
  makeGhost(regionId, x, y) {
    this.dropGhost(true);
    const r = this.appRegion(regionId);
    const color = r ? CFG.REGION_PALETTE[r.colorIdx % CFG.REGION_PALETTE.length] : CFG.COLORS.primary;
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.8);
    g.fillRoundedRect(-55, -20, 110, 40, 8);
    const txt = this.scene.add.text(0, 0, SUPPLY.name(regionId), this.font(14, '#ffffff', 'bold')).setOrigin(0.5);
    this.ghost = this.scene.add.container(x, y, [g, txt]).setDepth(10).setAlpha(0.85);
  }
  appRegion(regionId) { return (window.App && App.core) ? App.core.regionById(regionId) : null; }
  moveGhost(x, y) { if (this.ghost) this.ghost.setPosition(x, y); }
  dropGhost(instant) {
    if (!this.ghost) return;
    const gh = this.ghost; this.ghost = null;
    if (instant) { gh.destroy(); return; }
    this.scene.tweens.add({ targets: gh, alpha: 0, scale: 0.6, duration: 120, onComplete: () => gh.destroy() });
  }

  highlightNode(tikvId, ok) { this.hl = { tikvId, ok }; }
  clearHighlight() { this.hl = null; }
  selectRegion(regionId) { this.selected = regionId; }
}

/* ============ Part B · DOM HUD ============ */
const HUD = {
  el: {},

  init(app) {
    this.app = app;
    const $ = id => document.getElementById(id);
    this.el = {
      topbar: $('topbar'), lvName: $('lv-name'), timer: $('timer'),
      powerBar: $('power-bar'), powerNum: $('power-num'), powerMax: $('power-max'),
      riskBar: $('risk-bar'), riskNum: $('risk-num'),
      floodMark: $('flood-mark'),
      btnPause: $('btn-pause'), btnReset: $('btn-reset'), btnBack: $('btn-back'), btnSfx: $('btn-sfx'),
      selInfo: $('sel-info'), btnSplit: $('btn-split'), splitHint: $('split-hint'), btnHint: $('btn-hint'),
      pdLogs: $('pdlogs'),
      overlay: $('overlay'),
    };
    this.el.btnPause.addEventListener('click', () => app.togglePause());
    this.el.btnReset.addEventListener('click', () => app.restartLevel());
    this.el.btnBack.addEventListener('click', () => app.quitToMenu());
    this.el.btnSfx.addEventListener('click', () => {
      SFX.enabled = !SFX.enabled;
      this.el.btnSfx.textContent = SFX.enabled ? '🔊' : '🔇';
      if (SFX.enabled) SFX.play('click');
    });
    this.el.btnSplit.addEventListener('click', () => app.doSplit());
    this.el.btnHint.addEventListener('click', () => {
      if (!app.core) return;
      SFX.play('click');
      this.log('💡 ' + app.core.getMostUrgent(), 'info');
    });

    // —— 战备经济：金币 / 御敌 / 急修 ——
    this.el.reqCard = $('req-card');
    this.el.reqLine = $('req-line');
    this.el.goldChip = $('gold-chip');
    this.el.btnRepel = $('btn-repel');
    this.el.btnRecharge = $('btn-recharge');
    this.el.btnRecharge.addEventListener('click', () => app.doRecharge());
    this.el.btnQuick = $('btn-quick');
    this.el.btnRepel.addEventListener('click', () => app.doRepel());
    this.el.btnQuick.addEventListener('click', () => app.doQuickRepair());

    // 剧情对话框
    this.el.dialog = $('dialog');
    this.el.dlgBox = document.querySelector('.dlg-box');
    this.el.dlgAvatar = $('dlg-avatar');
    this.el.dlgName = $('dlg-name');
    this.el.dlgText = $('dlg-text');
    this.el.dlgNext = $('dlg-next');
    this._dlg = null;
    $('dlg-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      SFX.play('click');
      this._dlgFinish();
    });
    this.el.dlgBox.addEventListener('click', () => this._dlgAdvance());
  },

  /* ---------- 剧情对话框（视觉小说式，打字机） ---------- */
  showDialog(lines, onDone) {
    this._dlg = { lines, idx: 0, onDone, timer: null, full: '' };
    this.el.dialog.classList.remove('hidden');
    this._dlgShow();
  },
  _dlgShow() {
    const d = this._dlg;
    if (!d) return;
    const ch = CHARACTERS[d.lines[d.idx].who] || CHARACTERS.tidby;
    if (ch.avatar) {
      this.el.dlgAvatar.innerHTML = `<img src="${ch.avatar}" alt="${ch.name}" style="object-position:center">`;
      const avImg = this.el.dlgAvatar.querySelector('img');
      if (avImg && ch.zoom) { avImg.style.transform = `scale(${ch.zoom})`; avImg.style.transformOrigin = ch.origin || 'center'; }
      this.el.dlgAvatar.style.borderColor = ch.color;
    } else if (d.lines[d.idx].who === 'king') {
      this.el.dlgAvatar.innerHTML = '<span class="dlg-mark" style="background:#c0392b">👑</span>';
      this.el.dlgAvatar.style.borderColor = '#c0392b';
    } else {
      this.el.dlgAvatar.innerHTML = '<span class="dlg-mark" style="background:#8e44ad">PD</span>';
      this.el.dlgAvatar.style.borderColor = '#8e44ad';
    }
    this.el.dlgName.textContent = ch.name;
    this.el.dlgName.style.color = ch.color;
    this.el.dlgText.textContent = '';
    this.el.dlgText.style.color = ch.color === '#c0392b' ? '#a03223' : '#2c3e50';
    d.full = d.lines[d.idx].text;
    let i = 0;
    clearInterval(d.timer);
    d.timer = setInterval(() => {
      i++;
      this.el.dlgText.textContent = d.full.slice(0, i);
      if (i >= d.full.length) { clearInterval(d.timer); d.timer = null; }
    }, 26);
    this.el.dlgNext.style.visibility = 'hidden';
  },
  _dlgAdvance() {
    const d = this._dlg;
    if (!d) return;
    if (d.timer) { // 打字未完 → 立即补全
      clearInterval(d.timer); d.timer = null;
      this.el.dlgText.textContent = d.full;
      return;
    }
    SFX.play('click');
    d.idx++;
    if (d.idx >= d.lines.length) { this._dlgFinish(); return; }
    this._dlgShow();
  },
  _dlgFinish() {
    const d = this._dlg;
    if (!d) return;
    if (d.timer) clearInterval(d.timer);
    this._dlg = null;
    this.el.dialog.classList.add('hidden');
    if (d.onDone) d.onDone();
  },

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    this.el.overlay.classList.add('hidden');
  },

  enterLevel(lv, core) {
    this.el.lvName.textContent = `第${lv.chapter}章 · ${lv.name}`;
    this.el.powerMax.textContent = '/ ' + lv.powerMax;
    this.el.pdLogs.innerHTML = '';
    this.setSplitButton({ ok: false, reason: '点击仓库后可分仓' });
    this.selectInfo(null);
    // 角色栏：当前称号
    const title = TITLES[Math.max(0, ...(this.app.chaptersCleared() || new Set()))] || '见习生';
    document.getElementById('hero-title').textContent = title;
    // 任务清单
    const tl = document.getElementById('task-list');
    tl.innerHTML = (lv.tasks || []).map((t, i) =>
      `<div class="task-item" id="task-${i}"><span class="task-dot"></span><span class="task-desc">${t.desc}</span><span class="task-prog">—</span></div>`
    ).join('') || '<div class="task-item none"><span class="task-desc">本关无额外任务，稳态生存即可</span></div>';

    const rqCard = document.getElementById('req-title');
    if (core.requisition) {
      const rqCity = core.requisition.city;
      if (rqCard) rqCard.textContent = `🚚 出征集结 · ${CITY.name(rqCity)}`;
      // 军备与城邦加成情报
    const army = this.app.progress.army || {};
    const perks = [];
    if (army.wall) perks.push(`城墙加固 Lv${army.wall}（风险-15%×${army.wall}）`);
    if (army.tower) perks.push(`箭塔 Lv${army.tower}（行军+${army.tower * 2}s）`);
    if (army.repair) perks.push('急修队');
    const clv = this.app.cityLevel();
    for (let k = 2; k <= clv; k++) if (ECON.CITY_PERKS[k]) perks.push(ECON.CITY_PERKS[k]);
    if (perks.length) this.log(`🏛 生效中军备：${perks.join('、')}`, 'ok');
    this.log(`🚚 集结令：全军向${CITY.name(rqCity)}集结（${core.requisition.count} 处仓库各驻一仓）可得重赏——但囤得越多，敌军越眼馋！`, 'warn');
    } else if (rqCard) {
      rqCard.textContent = '🚚 出征集结';
    }
    this.log(`🎖 老皮特：「${lv.intro}」`, 'info');
    // 本关要点：按事件配置动态生成，每关不同
    const ev = lv.events || {};
    const hints = [];
    if (ev.nodeDown) hints.push('敌军会持续进攻（无次数上限），全程盯紧倒计时');
    if (ev.nodeDown) this.log(`⏳ 战术提示：敌军先锋即至，且会一波接一波猛攻到最后一刻！守城红线＝被围的城至少 ${ECON.SIEGE_HOLD_MIN} 座仓（三副本原理），少于 ${ECON.SIEGE_HOLD_MIN} 座城防立即崩溃；仓越多城墙越厚，敌军烧得越慢。`, 'warn');
    if (ev.hotspot) hints.push(`妖火将起 ${ev.hotspot.maxTimes} 阵，及时分仓`);
    if (ev.flood) hints.push(`洪峰将至（×${CFG.FLOOD_RATE}），先囤好仓`);
    if (ev.scaleUp) hints.push('新城奠基后迅速布防');
    if (ev.scaleDown) hints.push('弃城令下，从容迁空');
    if (!hints.length) hints.push('稳态即是最好的防务');
    this.log(`🎯 本关要点：${hints.join('；')}。风险值满 ${CFG.RISK_MAX} 即败退。`, 'info');
    // 城区阵容与扩容/弃城预告（解释城数变化）
    if (ev.scaleUp) this.log(`🏗 情报：本关 ${lv.tikvCount} 座城区，开战约 ${ev.scaleUp.gapMin}~${ev.scaleUp.gapMax} 秒后将有新城奠基，城数 +1！`, 'info');
    else this.log(`🗺 本关阵容：${lv.tikvCount} 座城区，同批物资的三个仓分守不同城。`, 'info');
    if (ev.scaleDown) this.log(`📋 情报：开战约 ${ev.scaleDown.gapMin}~${ev.scaleDown.gapMax} 秒后将下达弃城令，一城有序撤空！`, 'warn');
    const days = Math.max(0, LEVELS.length - lv.id);
    const phase = lv.chapter === 1 ? '，敌军先锋已抵边境！'
      : lv.chapter === 2 ? '，大军已兵临城下！'
      : lv.chapter === 3 ? '，围城战正酣，各城告急频传！'
      : '——总攻已经打响！';
    this.log(`📜 战报：十万大军距城邦还有 ${days} 日${phase}`, lv.id <= 5 ? 'info' : 'warn');
  },

  /* 每帧刷新 */
  refresh(core, es) {
    this.el.timer.textContent = fmtTime(core.timeLeft);
    this.el.timer.classList.toggle('danger-flash', core.timeLeft <= 10 && core.status === 'playing');

    const pm = core.lv.powerMax;
    this.el.powerBar.style.width = (core.power / pm * 100) + '%';
    this.el.powerBar.style.background = core.power >= CFG.COST_MIGRATE ? '#ffc107' : '#e0b04080';
    this.el.powerNum.textContent = core.power.toFixed(1);

    this.el.riskBar.style.width = core.risk + '%';
    this.el.riskBar.className = core.risk < CFG.STAR3_RISK ? 'ok' : core.risk < CFG.STAR2_RISK ? 'warn' : 'danger';
    this.el.riskNum.textContent = Math.round(core.risk);

    this.el.floodMark.style.display = core.floodTimer > 0 ? 'inline-block' : 'none';

    // 紧张心跳：最后 10 秒或敌袭预警期间，低频鼓点每 0.85 秒一拍
    const urgent = core.status === 'playing' &&
      (core.timeLeft <= 10 || (es && es.warnings.length > 0));
    if (urgent) {
      const now = performance.now();
      if (!this._hbLast || now - this._hbLast > 850) {
        this._hbLast = now;
        SFX.play('heartbeat');
      }
    } else this._hbLast = 0;

    // 金币 + 御敌/急修按钮状态
    if (this.el.goldChip) this.el.goldChip.textContent = '💰 ' + (this.app.gold || 0);
    if (this.el.btnRecharge) {
      const rc = this.el.btnRecharge;
      const can = this.app.gold >= 10 && core.power < core.lv.powerMax - 0.05;
      rc.style.display = this.app.core ? '' : 'none';
      rc.disabled = !can;
    }
    if (this.el.btnRepel) {
      const siege = es && es.warnings.some(w => !w.planned);
      this.el.btnRepel.style.display = siege ? '' : 'none';
      this.el.btnRepel.disabled = !siege || core.power < ECON.REPEL_COST;
      this.el.btnRepel.textContent = siege ? `⚔️ 御敌反击（${ECON.REPEL_COST}⚡·推退敌军，需城内≥3仓）` : '⚔️ 御敌';
    }
    if (this.el.btnQuick) {
      const sel = this.app.renderer ? this.app.renderer.selected : null;
      const r = sel != null ? core.regionById(sel) : null;
      const payGold = !!(this.app.buffs && this.app.buffs.repair); // 急修队：付金币；否则耗算力
      const need = r && !r.dead && r.replicas.length > 0 && r.replicas.length < 3;
      const afford = payGold ? (this.app.gold || 0) >= ECON.REPAIR_GOLD : core.power >= CFG.REPAIR_COST;
      const can = !!(need && afford);
      this.el.btnQuick.style.display = ''; // 补货对所有人生效，不再需要买急修队
      this.el.btnQuick.disabled = !can;
      this.el.btnQuick.textContent = can
        ? `🔨 补货${SUPPLY.name(r.id)}（${payGold ? ECON.REPAIR_GOLD + '💰' : CFG.REPAIR_COST + '⚡'}）`
        : (need ? `🔨 补货（需 ${payGold ? ECON.REPAIR_GOLD + '💰' : CFG.REPAIR_COST + '⚡'}）` : '🔨 补货');
    }

    // 出征集结进度
    if (this.el.reqLine) {
      const rq = core.requisition;
      if (!rq) {
        this.el.reqCard.style.display = 'none';
      } else {
      const done = core.requisitionMet;
      this.el.reqLine.innerHTML = done
        ? '🎖 已达成！大军提前开拔'
        : `向<b>${CITY.name(rq.city)}</b>集结 <b>${core.requisitionCount}</b> / ${rq.count} 处仓库`;
      this.el.reqCard.classList.toggle('done', done);
      this.el.reqCard.classList.toggle('hot', !done && core.requisitionCount >= rq.count - 1);
      }
    }

    // 任务实时进度
    if (core.lv.tasks && core.lv.tasks.length) {
      core.lv.tasks.forEach((t, i) => {
        const el = document.getElementById('task-' + i);
        if (!el) return;
        const v = core.taskValue(t);
        const met = core.taskMet(t);
        const prog = el.querySelector('.task-prog');
        prog.textContent = t.op === '<=' ? `${Math.min(v, t.target)}/${t.target}` : `${Math.min(v, t.target)}/${t.target}`;
        el.classList.toggle('done', met);
      });
    }
  },

  /* 事件驱动知识签 */
  knowledge(key) {
    const T = {
      march: '📖 敌军专攻仓库最多的城——真实集群里数据最多的节点最先出问题，这叫「负载倾斜」。',
      siege: '📖 敌军兵临城下＝故障注入。守城红线：城内至少留 3 座仓（三副本冗余），少于 3 座城防立即崩溃。',
      burn: '📖 被焚的仓不会自己长回来——选中它点「🔨 补货」（消耗算力）才行；转运只是挪位置，不会增加存货份数！',
      quorum: '📖 多数派法则：3 份存货剩 2 仍可服务，剩 1 就濒危——补货要手动点「🔨 补货」，别等烧起来才想起来。',
      hold: '📖 撑过围攻＝故障转移成功：只要多数派副本活着，服务就不中断。',
      fall: '📖 城池陷落＝TiKV 节点宕机，其上副本一并损毁。真实 TiDB 靠其余副本自动补齐，所以丢一座城不等于全盘崩溃。',
      flood: '📖 洪峰＝写入量暴涨，Region 加速膨胀——所以老手会先分仓、留水位。',
      hot: '📖 妖火＝热点访问：读写全挤在一个 Region。分仓一分为二，流量跟着减半。',
      scale: '📖 新城奠基＝在线扩容：新 TiKV 上线，PD 会自动把副本渐进迁过去，业务无感。',
    };
    if (!T[key]) return;
    if (!this._kseen) this._kseen = new Set();
    if (this._kseen.has(key)) return;
    this._kseen.add(key);
    const el = document.createElement('div');
    el.className = 'knowledge-toast';
    el.innerHTML = T[key];
    const wrap = document.getElementById('sandbox-wrap');
    if (wrap) wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 7000);
  },

  /* PD 播报 */
  log(text, type) {
    const div = document.createElement('div');
    div.className = 'pd-item ' + (type || 'info');
    const t = (this.app && this.app.core) ? this.app.core.t : 0;
    div.innerHTML = `<span class="pd-time">[${fmtTime(t)}]</span>${text}`;
    this.el.pdLogs.prepend(div);
    while (this.el.pdLogs.children.length > 8) this.el.pdLogs.lastChild.remove();
  },
  toast(text, type) { this.log('⚠️ ' + text, type); },

  /* 飘字（金币/连击/战利品） */
  floatText(text, color) {
    const wrap = document.getElementById('sandbox-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.color = color || '#2e7d32';
    el.style.left = (12 + Math.random() * 60) + '%';
    el.style.top = (25 + Math.random() * 45) + '%';
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  },

  /* 战备商店（开局购物） */
  showShop(app, onDone) {
    const gold = app.gold || 0;
    const army = app.progress.army || {};
    const discount = app.cityLevel() >= 2 ? 0.9 : 1;
    const cards = ECON.SHOP.map(it => {
      const lv = army[it.id] || 0;
      const maxed = lv >= it.max;
      const cost = maxed ? 0 : Math.round(it.prices[lv] * discount);
      const afford = !maxed && gold >= cost;
      const lvTxt = it.max > 1 ? `Lv${lv}/${it.max}` : (lv ? '已备' : '未备');
      return `<div class="shop-card ${maxed ? 'owned' : afford ? '' : 'poor'}">
        <div class="shop-icon">${it.icon}</div>
        <b>${it.name}</b><span class="shop-price">${maxed ? '★ 满级' : cost + ' 💰'}</span>
        <span class="shop-lv">${lvTxt}</span>
        <p>${it.desc}</p>
        ${maxed ? '' : `<button class="btn ${afford ? '' : 'ghost'}" data-buy="${it.id}" ${afford ? '' : 'disabled'}>${lv ? '升级' : '购买'}</button>`}
      </div>`;
    }).join('');
    this.showModal(`
      <h2>🛒 军备商店</h2>
      <p class="modal-intro">军需官：这里买的是<b>永久军备</b>——今天花的每一枚金币，之后每一关都在生效。</p>
      <div class="shop-gold">💰 金币 <b>${gold}</b></div>
      <div class="shop-grid">${cards}</div>
      <div class="modal-btns"><button class="btn big" id="ov-go">▶ 出发迎敌</button></div>`);
    this.el.overlay.querySelectorAll('[data-buy]').forEach(b => {
      b.addEventListener('click', () => { SFX.play('split'); app.buyItem(b.dataset.buy); });
    });
    document.getElementById('ov-go').addEventListener('click', () => { SFX.play('click'); this.hideOverlay(); onDone(); });
  },

  /* 侧栏：选中分片信息 + 分裂按钮 */
  selectInfo(regionId) {
    const app = this.app, core = app.core;
    const box = this.el.selInfo;
    if (regionId == null || !core) {
      box.innerHTML = '<div class="sel-empty">点击任意彩色分片块<br>查看详情并执行分裂</div>';
      this.setSplitButton({ ok: false, reason: '' });
      return;
    }
    const r = core.regionById(regionId);
    if (!r) { this.selectInfo(null); return; }
    const tags = [];
    if (r.size > CFG.SPLIT_MAX) tags.push('<span class="tag warn">爆仓</span>');
    if (r.heat >= CFG.HEAT_DANGER) tags.push('<span class="tag danger">妖火</span>');
    if (r.replicas.length < 3) tags.push('<span class="tag danger">存货缺失</span>');
    if (r.repairing) tags.push('<span class="tag info">补货中</span>');
    if (!tags.length) tags.push('<span class="tag ok">安稳</span>');
    box.innerHTML = `
      <div class="sel-title">${SUPPLY.name(r.id)}仓 ${tags.join('')}</div>
      <div class="sel-row"><span>存货体积</span><b>${r.size.toFixed(1)}</b>（≥${CFG.SPLIT_MIN}可分仓）</div>
      <div class="sel-row"><span>妖火热度</span><b>${Math.round(r.heat)}</b>${r.heat >= CFG.HEAT_DANGER ? ' ⚠️' : ''}</div>
      <div class="sel-row"><span>存货分布</span><b>${r.replicas.map(x => CITY.name(x)).join(' / ') || '已损毁'}</b></div>`;
    const c = core.canSplit(regionId);
    this.setSplitButton(c);
  },

  setSplitButton(c) {
    this.el.btnSplit.disabled = !c.ok;
    this.el.splitHint.textContent = c.ok ? `消耗 ${CFG.COST_SPLIT} 算力，一分为二` : (c.reason || '');
  },

  /* ---------- 弹窗系统 ---------- */
  showModal(html, opts) {
    this.el.overlay.innerHTML = `<div class="modal">${html}</div>`;
    this.el.overlay.classList.remove('hidden');
    if (opts && opts.noClose !== false) { /* 点击遮罩不关闭，只能点按钮 */ }
  },
  hideOverlay() { this.el.overlay.classList.add('hidden'); this.el.overlay.innerHTML = ''; },

  showIntro(lv, onStart) {
    const tutNote = lv.tutorial ? '<p class="modal-sub">本章为教学模式，跟随引导完成操作。</p>' : '';
    this.showModal(`
      <h2>📦 第${lv.chapter}章 · ${lv.name}</h2>
      <p class="modal-intro">${lv.intro}</p>
      ${tutNote}
      <div class="modal-stats">
        <div><span>生存目标</span><b>${lv.duration}s</b></div>
        <div><span>初始节点</span><b>${lv.tikvCount}</b></div>
        <div><span>算力上限</span><b>${lv.powerMax}</b></div>
      </div>
      <div class="modal-btns"><button class="btn big" id="ov-start">▶ 开始生存</button></div>`);
    document.getElementById('ov-start').addEventListener('click', () => { SFX.play('click'); this.hideOverlay(); onStart(); });
  },

  showResult(app, core) {
    const st = core.getStats();
    const stars = [0, 1, 2].map(i => `<img class="st" src="asset/ui/${i < st.stars ? 'star' : 'star-outline'}.png" alt="star">`).join('');
    const knowledge = core.lv.knowledge.map(k => `<div class="knowledge">📖 ${k}</div>`).join('');
    const tasks = core.calcTasks();
    const allDone = tasks.length > 0 && tasks.every(t => t.done);
    const taskRows = tasks.map(t =>
      `<div class="task-res ${t.done ? 'ok' : 'miss'}">${t.done ? '✅' : '❌'} ${t.desc}<b>${t.op === '<=' ? `${t.value}/${t.target}` : `${Math.min(t.value, t.target)}/${t.target}`}</b></div>`
    ).join('');
    let taskBlock = '';
    if (tasks.length) {
      taskBlock = allDone
        ? '<div class="task-res-wrap"><div class="task-badge">🎖 任务全达成！</div></div>'
        : '<div class="task-res-wrap"><div class="task-res-title">本关任务</div>' + taskRows + '</div>';
    }
    const hasNext = core.lv.id < LEVELS.length;
    const xp = app._lastXpGain || 10;
    const city = app.progress.city || 0;
    const cityLv = Math.min(5, Math.floor(city / 30) + 1);
    const CITY_LV = ['荒地营地', '木栅寨', '石墙镇', '城堡', '王城'];
    this.showModal(`
      <h2 class="win">🏆 城邦守住！</h2>
      <div class="stars">${stars}</div>
      <div class="xp-gain">🪨 城邦建设度 +${xp}　·　当前 ${city}（${CITY_LV[cityLv - 1]} Lv${cityLv}）</div>
      <div class="xp-gain">⚔️ 本局得分 <b>${core.score}</b>　·　战利品 <b>+${app._goldRun || 0}💰</b></div>
      ${taskBlock}
      <div class="modal-stats">
        <div><span>峰值风险</span><b>${st.peakRisk}</b></div>
        <div><span>调度操作</span><b>${st.ops} 次</b></div>
        <div><span>节点下线</span><b>${st.nodesDowned}</b></div>
        <div><span>副本受损</span><b>${st.lostReplicaEvents}</b></div>
      </div>
      ${knowledge}
      <div class="modal-btns">
        <button class="btn ghost" id="ov-retry">↻ 重玩</button>
        ${hasNext ? '<button class="btn big" id="ov-next">下一关 ▶</button>' : '<button class="btn big" id="ov-menu">返回基地 🏠</button>'}
      </div>
      ${!hasNext ? '<p class="modal-sub" style="text-align:center">你已通关全部章节，真正吃透了 TiDB 分布式运维思想！</p>' : ''}`);
    document.getElementById('ov-retry').addEventListener('click', () => { SFX.play('click'); app.restartLevel(); });
    const nb = document.getElementById('ov-next');
    if (nb) nb.addEventListener('click', () => { SFX.play('click'); app.startLevel(core.lv.id + 1); });
    const mb = document.getElementById('ov-menu');
    if (mb) mb.addEventListener('click', () => { SFX.play('click'); app.quitToMenu(); });
  },

  showFail(app, core) {
    const st = core.getStats();
    const reason = core.status === 'lost-data'
      ? '💥 多数派仓库同时损毁，账册无法恢复！'
      : core.status === 'lost-obj'
        ? '🚩 守城目标未达成，城邦失守！'
        : '💥 城防风险失控，城池陷落！';
    const knowledge = core.lv.knowledge.slice(0, 1).map(k => `<div class="knowledge">📖 ${k}</div>`).join('');
    this.showModal(`
      <h2 class="lose">${reason}</h2>
      <p class="modal-intro">${core.failReason || ''}</p>
      <div class="modal-stats">
        <div><span>坚守了</span><b>${Math.round(core.t)}s / ${core.lv.duration}s</b></div>
        <div><span>峰值风险</span><b>${st.peakRisk}</b></div>
        <div><span>调度操作</span><b>${st.ops} 次</b></div>
      </div>
      ${knowledge}
      <div class="modal-btns">
        <button class="btn ghost" id="ov-menu">返回基地 🏠</button>
        <button class="btn big" id="ov-retry">↻ 再战</button>
      </div>`);
    document.getElementById('ov-retry').addEventListener('click', () => { SFX.play('click'); app.restartLevel(); });
    document.getElementById('ov-menu').addEventListener('click', () => { SFX.play('click'); app.quitToMenu(); });
  },

  showPause(app) {
    this.showModal(`
      <h2>⏸ 已暂停</h2>
      <p class="modal-intro">灾难不会等你太久，但你会需要喘口气。</p>
      <div class="modal-btns">
        <button class="btn ghost" id="ov-quit">退出关卡</button>
        <button class="btn big" id="ov-resume">▶ 继续生存</button>
      </div>`);
    document.getElementById('ov-resume').addEventListener('click', () => { SFX.play('click'); app.togglePause(); });
    document.getElementById('ov-quit').addEventListener('click', () => { SFX.play('click'); app.quitToMenu(); });
  },

  /* 教学卡片 + 提示条 */
  showTutorialCard(step, onNext) {
    this.showModal(`
      <h2>🎓 ${step.title}</h2>
      <p class="modal-intro" style="white-space:pre-line">${step.text}</p>
      <div class="modal-btns"><button class="btn big" id="ov-tut">知道了，开始！</button></div>`);
    document.getElementById('ov-tut').addEventListener('click', () => { SFX.play('click'); this.hideOverlay(); onNext(); });
  },
  tutorialHint(text) {
    let bar = document.getElementById('tut-hint');
    if (!text) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'tut-hint';
      document.getElementById('sandbox-wrap').appendChild(bar);
    }
    bar.innerHTML = text;
  },
};
