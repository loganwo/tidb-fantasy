/* =========================================================
 * main.js —— 游戏入口：Phaser启动 / 主循环 / 菜单 / 图鉴 / 教程
 * ========================================================= */
'use strict';

/* Phaser 沙盘场景 */
class SandboxScene extends Phaser.Scene {
  constructor() { super('sandbox'); }
  create() {
    // SVG 矢量资产：用 Image 元素加载（file:// 下不受 XHR 限制），注册为纹理
    for (let i = 0; i < 12; i++) this.registerSvg('sup' + i, 'asset/icons/supply-' + i + '.svg');
    this.registerSvg('scenebg', 'asset/icons/scene-bg.svg');
    this.registerSvg('foe', 'asset/foe.png?v=4');
    this.registerSvg('foe2', 'asset/foe2.png?v=4');   // 攻城重甲（围攻军团）
    for (let i = 0; i < 6; i++) this.registerSvg('gate' + i, 'asset/gates/gate-' + i + '.jpg?v=26');
    App.onSceneReady(this);
  }
  registerSvg(key, url) {
    const img = new Image();
    img.onload = () => { if (!this.textures.exists(key)) this.textures.addImage(key, img); };
    img.src = url;
  }
  update(time, delta) { App.tick(Math.min(delta, 50) / 1000); }
}

const App = {
  progress: { stars: {} },
  core: null, es: null,
  renderer: null, drag: null,
  scene: null, game: null,
  ended: false,
  tutorial: null,

  /* ---------- 进度存取 ---------- */
  loadProgress() {
    try {
      const raw = localStorage.getItem('tidb-fantasy-progress');
      if (raw) this.progress = JSON.parse(raw);
    } catch (e) { /* 忽略损坏数据 */ }
    if (!this.progress || typeof this.progress !== 'object' || !this.progress.stars) {
      this.progress = { stars: {} };
    }
    if (!this.progress.tasks) this.progress.tasks = {};
    if (!this.progress.army) this.progress.army = { wall: 0, tower: 0, repair: 0 };
    // 战备金币：新玩家发放启动资金
    if (typeof this.progress.gold !== 'number') {
      this.progress.gold = ECON.START_GOLD;
      this.saveProgress();
    }
    this.gold = this.progress.gold;
  },
  saveProgress() {
    try { localStorage.setItem('tidb-fantasy-progress', JSON.stringify(this.progress)); } catch (e) { /* 隐私模式 */ }
  },
  starsOf(id) { return this.progress.stars[id] || 0; },
  unlockedCount() {
    let n = 1;
    for (let i = 1; i <= LEVELS.length; i++) if (this.starsOf(i) > 0) n = Math.max(n, i + 1);
    return Math.min(n, LEVELS.length);
  },
  chaptersCleared() {
    const s = new Set();
    for (const lv of LEVELS) if (this.starsOf(lv.id) > 0) s.add(lv.chapter);
    return s;
  },

  /* ---------- 启动 ---------- */
  boot() {
    this.loadProgress();
    HUD.init(this);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'sandbox',
      width: CFG.VIEW_W,
      height: CFG.VIEW_H,
      backgroundColor: '#f4f6f9',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [SandboxScene],
    });

    document.getElementById('btn-codex').addEventListener('click', () => { SFX.play('click'); this.showCodex(); });
    document.getElementById('btn-codex-back').addEventListener('click', () => { SFX.play('click'); this.showMenu(); });
    document.getElementById('btn-continue').addEventListener('click', () => {
      SFX.play('click'); this.startLevel(this.unlockedCount());
    });
    this.initMenuFx();
    document.getElementById('btn-reset-progress').addEventListener('click', () => {
      if (confirm('确定清空全部通关进度与星级吗？')) {
        this.progress = { stars: {} };
        this.saveProgress();
        this.showMenu();
      }
    });
    this.showMenu();
  },

  onSceneReady(scene) {
    this.scene = scene;
    this.renderer = new SandboxRenderer(scene);
    this.drag = new DragSystem(scene, this.renderer, this);
  },

  /* ---------- 关卡生命周期 ---------- */
  startLevel(id) {
    const lv = LEVELS[id - 1];
    if (!lv) return;
    if (!this.renderer) { setTimeout(() => this.startLevel(id), 100); return; } // 场景未就绪

    this.ended = false;
    this.tutorial = null;
    const army = this.progress.army;
    const cityLv = this.cityLevel();
    this._repelFreeUsed = false;
    this.buffs = {
      wallLv: army.wall || 0,          // 风险累积 -15%/级
      towerSec: (army.tower || 0) * 2, // 行军 +2s/级
      repair: !!army.repair,
      cityLv,
    };
    this._goldRun = 0; // 本局战利品
    // 城邦 Lv3：算力上限 +1
    const lvEff = cityLv >= 3 ? Object.assign({}, lv, { powerMax: lv.powerMax + 1 }) : lv;
    this.core = new GameCore(lvEff, {
      onBroadcast: (t, ty) => {
        HUD.log(t, ty);
        if (t.includes('焚毁')) HUD.floatText('🔥 ' + t.split('！')[0].replace(/^[^：]*：/, ''), '#c0392b');
      },
      buffs: this.buffs,
      onGold: (n, reason) => this.earnGold(n, reason),
      onCombo: (n, gained) => { HUD.floatText(`🔥 连击 x${n}！+${gained}`, '#d68900'); SFX.play('split'); },
      onMigrate: (toT) => this.es && this.es.notifyRelief(toT),
      onCityFallen: () => this.es && this.es.spawnRelief(),
    });
    this.es = new EventSystem(this.core, lv, { onBroadcast: (t, ty) => HUD.log(t, ty) });

    HUD.showScreen('game');
    if (this.game) {
      // 界面从 display:none 变可见后，需等布局稳定再让 Scale.FIT 重算画布，否则 canvas 尺寸为 0
      requestAnimationFrame(() => this.game.scale.refresh());
      setTimeout(() => this.game.scale.refresh(), 80);
    }
    this.renderer.reset();
    HUD.enterLevel(lv, this.core);
    this.renderer.selectRegion(null);
    this.renderer.clearHighlight();

    this.core.status = 'ready'; // 剧情播放期间暂停
    const afterStory = () => {
      // 战备商店：永久军备投资（跳过按钮=直接出发）
      HUD.showShop(this, () => this._beginPlay(lvEff));
    };
    if (lv.story && lv.story.length) {
      // 冒险剧情：开场对白（可跳过），播完进入商店
      HUD.showDialog(lv.story, afterStory);
    } else {
      HUD.showIntro(lv, afterStory);
    }
  },

  _beginPlay(lv) {
    if (lv.tutorial) this.startTutorial(lv);
    this.core.status = 'playing';
    SFX.play('alarm');
  },

  /* ---------- 战备经济 ---------- */
  earnGold(n, reason) {
    this.gold = (this.gold || 0) + n;
    this._goldRun = (this._goldRun || 0) + n;
    this.progress.gold = this.gold;
    this.saveProgress();
    HUD.floatText(`+${n}💰 ${reason}`, '#2e7d32');
  },
  cityLevel() {
    const xp = this.progress.city || 0;
    const th = ECON.CITY_LV_XP;
    let lv = 1;
    for (let i = 0; i < th.length; i++) if (xp >= th[i]) lv = i + 1;
    return lv;
  },
  buyItem(id) {
    const it = ECON.SHOP.find(x => x.id === id);
    const owned = this.progress.army[id] || 0;
    if (!it || owned >= it.max) return;
    const cost = Math.round(it.prices[owned] * (this.cityLevel() >= 2 ? 0.9 : 1));
    if ((this.gold || 0) < cost) return;
    this.gold -= cost;
    this.progress.gold = this.gold;
    this.progress.army[id] = owned + 1;
    this.saveProgress();
    // 立即生效到本局
    this.buffs.wallLv = this.progress.army.wall || 0;
    this.buffs.towerSec = (this.progress.army.tower || 0) * 2;
    this.buffs.repair = !!this.progress.army.repair;
    HUD.log(`🛒 军备升级【${it.name} Lv${owned + 1}】-${cost}💰（永久生效）`, 'ok');
    HUD.showShop(this, () => this._beginPlay(this.core.lv)); // 刷新商店
  },
  doRepel() {
    if (!this.core || this.core.status !== 'playing') return;
    const free = this.buffs.cityLv >= 5 && !this._repelFreeUsed;
    const res = this.es.repelAttack({ free });
    if (res.ok) {
      if (free) this._repelFreeUsed = true;
      SFX.play('win');
    } else { SFX.play('deny'); HUD.toast(res.reason, 'bad'); }
  },
  doRecharge() {
    if (!this.core || this.core.status !== 'playing') return;
    if ((this.gold || 0) < 10 || this.core.power >= this.core.lv.powerMax) return;
    this.gold -= 10;
    this.progress.gold = this.gold;
    this.saveProgress();
    this.core.power = Math.min(this.core.lv.powerMax, this.core.power + 1);
    SFX.play('split');
    HUD.floatText('⚡ +1 紧急充电', '#2e86ab');
  },

  doQuickRepair() {
    if (!this.core || this.core.status !== 'playing') return;
    const rid = this.renderer.selected;
    if (rid == null) { HUD.toast('请先点击选中一个受损仓库', 'bad'); return; }
    const payGold = !!(this.buffs && this.buffs.repair); // 买了急修队：付金币、不耗算力
    if (payGold && (this.gold || 0) < ECON.REPAIR_GOLD) { HUD.toast(`急修需要 ${ECON.REPAIR_GOLD} 金币`, 'bad'); return; }
    const res = this.core.quickRepair(rid, { free: payGold });
    if (res.ok) {
      if (payGold) { this.gold -= ECON.REPAIR_GOLD; this.progress.gold = this.gold; this.saveProgress(); }
      SFX.play('migrate');
      HUD.selectInfo(rid);
    } else { SFX.play('deny'); HUD.toast(res.reason, 'bad'); }
  },

  restartLevel() { if (this.core) this.startLevel(this.core.lv.id); },
  quitToMenu() {
    this.core = null; this.es = null; this.tutorial = null;
    HUD.tutorialHint('');
    HUD.showScreen('menu');
    this.showMenu();
  },
  togglePause() {
    if (!this.core) return;
    if (this.core.status === 'playing') {
      this.core.status = 'paused';
      HUD.showPause(this);
    } else if (this.core.status === 'paused') {
      this.core.status = 'playing';
      HUD.hideOverlay();
    }
  },

  /* ---------- 主循环（由 SandboxScene.update 驱动） ---------- */
  tick(dt) {
    if (!this.core || !this.renderer) return;
    if (this.core.status === 'playing') {
      this.core.update(dt);
      this.es.update(dt);
      // PD 自动补货已关闭：副本不足需玩家手动点「补货」（消耗算力；买了急修队则付金币）
      if (this.tutorial && !this.tutorial.done) this.checkTutorial();
    }
    this.renderer.render(this.core, this.es);
    const gameActive = document.getElementById('screen-game').classList.contains('active');
    if (!gameActive) return;
    HUD.refresh(this.core, this.es);
    if (!this.ended && (this.core.status === 'won' || this.core.status === 'lost-risk' || this.core.status === 'lost-data' || this.core.status === 'lost-obj')) {
      this.ended = true;
      this.endGame();
    }
  },

  endGame() {
    const core = this.core;
    if (core.status === 'won') {
      SFX.play('win');
      const st = core.getStats();
      if (st.stars > (this.progress.stars[core.lv.id] || 0)) this.progress.stars[core.lv.id] = st.stars;
      // 任务全达成标记 + 城邦建设度（攻城建城元成长）
      const tasks = core.calcTasks();
      const allDone = tasks.length > 0 && tasks.every(t => t.done);
      if (allDone) this.progress.tasks[core.lv.id] = true;
      this._lastXpGain = 10 + (allDone ? 5 : 0) + (st.stars === 3 ? 5 : 0);
      this.progress.city = (this.progress.city || 0) + this._lastXpGain;
      this.earnGold(ECON.GOLD_WIN, '守住城邦');
      if (allDone) this.earnGold(ECON.GOLD_ALLTASKS, '任务全达成');
      this.saveProgress();
      if (core.lv.storyEnd && core.lv.storyEnd.length) {
        // 章节收尾剧情 → 结算
        HUD.showDialog(core.lv.storyEnd, () => HUD.showResult(this, core));
      } else {
        HUD.showResult(this, core);
      }
    } else {
      SFX.play('lose');
      HUD.showFail(this, core);
    }
  },

  /* ---------- 交互回调 ---------- */
  onSelectRegion(regionId) { HUD.selectInfo(regionId); },
  toast(text, type) { HUD.toast(text, type); },
  doSplit() {
    if (!this.core || this.core.status !== 'playing') return;
    const rid = this.renderer.selected;
    if (rid == null) { HUD.toast('请先点击选中一个仓库块，再执行分仓', 'bad'); return; }
    const res = this.core.split(rid);
    if (res.ok) { SFX.play('split'); HUD.selectInfo(rid); }
    else { SFX.play('deny'); HUD.toast(res.reason, 'bad'); }
  },

  /* ---------- 教程引擎（第一关分步引导） ---------- */
  startTutorial(lv) {
    this.tutorial = { steps: lv.tutorial, idx: -1, opsBase: 0, done: false };
    this.advanceTutorial();
  },
  advanceTutorial() {
    const tr = this.tutorial;
    tr.idx++;
    if (tr.idx >= tr.steps.length) {
      tr.done = true;
      HUD.tutorialHint('🎓 教学完成！倒计时已在跑，稳住，调度官！');
      setTimeout(() => { if (this.tutorial && this.tutorial.done) HUD.tutorialHint(''); }, 6000);
      return;
    }
    const step = tr.steps[tr.idx];
    tr.opsBase = this.core.opsCount;
    if (step.type === 'card') HUD.showTutorialCard(step, () => this.advanceTutorial());
    else HUD.tutorialHint('🎯 ' + step.text.replace(/\n/g, '<br>'));
  },
  checkTutorial() {
    const tr = this.tutorial;
    if (!tr || tr.done) return;
    const step = tr.steps[tr.idx];
    if (!step) return;
    if ((step.type === 'migrate' || step.type === 'split') && this.core.opsCount > tr.opsBase) {
      SFX.play('win');
      this.advanceTutorial();
    }
  },

  /* ---------- 菜单 / 图鉴 ---------- */
  showMenu() {
    HUD.showScreen('menu');
    const total = Object.values(this.progress.stars).reduce((a, b) => a + b, 0);
    const cleared = this.chaptersCleared();
    const title = TITLES[Math.max(0, ...cleared)] || '见习生';
    const totalTasks = LEVELS.filter(l => l.tasks.length).length;
    const doneTasks = Object.keys(this.progress.tasks).length;
    document.getElementById('menu-stars').textContent =
      `⭐ ${total} / ${LEVELS.length * 3}　·　🎖 任务 ${doneTasks} / ${totalTasks}　·　通关章节解锁运维图鉴`;

    // 角色卡（冒险主角 + 城邦等级）
    const heroCard = document.getElementById('menu-hero-card');
    if (heroCard) {
      const city = this.progress.city || 0;
      const cityLv = Math.min(5, Math.floor(city / 30) + 1);
      const CITY_LV = ['荒地营地', '木栅寨', '石墙镇', '城堡', '王城'];
      const warDays = Math.max(0, LEVELS.length - Object.keys(this.progress.stars).length);
      const warPhase = warDays > 7 ? '远在边境' : warDays > 4 ? '正在逼近' : warDays > 1 ? '已兵临城下' : warDays > 0 ? '围城总攻在即' : '兵临城下！';
      const nextAt = cityLv * 30;
      heroCard.innerHTML = `
        <img src="asset/hero.jpg" alt="小Ti">
        <div><b>小Ti · Tidby</b><span class="hero-badge">${title}</span>
        <span class="city-lv">🏰 ${CITY_LV[cityLv - 1]} Lv${cityLv}　🪨 ${city}${cityLv < 5 ? ' / ' + nextAt : ''}</span>
        <span class="war-line">⚔️ 十万大军：${warPhase}（剩 ${warDays} 关防线）</span><span class="city-perks">🏛 ${cityLv >= 2 ? Object.values(ECON.CITY_PERKS).slice(0, cityLv - 1).join(" · ") : "升级城邦解锁加成"}</span><i>${doneTasks >= totalTasks ? '全部任务达成，真正的城邦之主！' : '把混沌赶出分片城邦！'}</i></div>`;
    }

    const grid = document.getElementById('lv-grid');
    let html = '';
    for (const ch of CHAPTERS) {
      const chCleared = cleared.has(ch.id);
      html += `<div class="chapter-row"><b>${ch.name}</b><span>${ch.desc}</span>${chCleared ? '<i class="ch-done">已通关 ✓</i>' : ''}</div><div class="lv-row">`;
      for (const lv of LEVELS.filter(l => l.chapter === ch.id)) {
        const unlocked = lv.id <= this.unlockedCount();
        const stars = this.starsOf(lv.id);
        const taskDone = this.progress.tasks[lv.id] ? '<i class="lv-task">🎖</i>' : '';
        html += unlocked
          ? `<button class="lv-cell boss-${lv.chapterBoss ? 1 : 0}" data-lv="${lv.id}">${taskDone}<b>${lv.id}</b><span class="lv-name-sm">${lv.name}</span><span class="lv-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></button>`
          : `<button class="lv-cell locked" disabled><b>🔒</b><span class="lv-name-sm">未解锁</span><span class="lv-stars"></span></button>`;
      }
      html += '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.lv-cell').forEach((b, i) => {
      b.style.animationDelay = (i * 45) + 'ms';
    });
    grid.querySelectorAll('.lv-cell[data-lv]').forEach(b => {
      b.addEventListener('click', () => { SFX.play('click'); this.startLevel(+b.dataset.lv); });
    });
  },

  /* ---------- 首页动态特效：星空 / 视差 ---------- */
  initMenuFx() {
    if (this._menuFx) return;
    this._menuFx = true;
    const $ = id => document.getElementById(id);
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 星星
    const starBox = $('sky-stars');
    if (starBox && !reduceMotion) {
      let html = '';
      for (let i = 0; i < 70; i++) {
        const size = (Math.random() * 2 + 1).toFixed(1);
        html += `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 62).toFixed(1)}%;` +
          `width:${size}px;height:${size}px;--d:${(2 + Math.random() * 3.5).toFixed(1)}s;--dl:${(Math.random() * 4).toFixed(1)}s"></i>`;
      }
      starBox.innerHTML = html;
    }

    // 鼠标视差
    const hero = $('menu-hero');
    if (hero && !reduceMotion) {
      const stars = starBox, sky = $('skyline-wrap'), title = hero.querySelector('.hero-title-wrap');
      let raf = null;
      document.getElementById('screen-menu').addEventListener('mousemove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const r = hero.getBoundingClientRect();
          const dx = (e.clientX - r.left) / r.width - 0.5;
          const dy = (e.clientY - r.top) / r.height - 0.5;
          if (stars) stars.style.transform = `translate(${dx * -8}px, ${dy * -4}px)`;
          if (sky) sky.style.transform = `translate(${dx * 12}px, 0)`;
          if (title) title.style.transform = `translate(${dx * 5}px, ${dy * 3}px)`;
          const army2 = $('army-march');
          if (army2) army2.style.transform = `translate(${dx * 16}px, 0)`;
        });
      });
    }
  },

  showCodex() {
    HUD.showScreen('codex');
    const cleared = this.chaptersCleared();
    const grid = document.getElementById('codex-grid');
    grid.innerHTML = CODEX.map(c => {
      const unlocked = c.ch === 1 || cleared.has(c.ch);
      return unlocked
        ? `<div class="codex-card"><div class="codex-icon">${c.icon}</div><b>${c.title}</b><p>${c.text}</p></div>`
        : `<div class="codex-card locked"><div class="codex-icon">🔒</div><b>？？？</b><p>通关第 ${c.ch} 章任意关卡后解锁</p></div>`;
    }).join('');
  },
};

window.addEventListener('load', () => App.boot());

// 调试钩子（自动化测试与控制台调参用）
window.__game = () => App;
