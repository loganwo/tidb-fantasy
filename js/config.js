/* =========================================================
 * 《分片城邦：TiDB幻境》全局配置
 * 美术规范（方案第6节定稿色板） + 核心机制数值（方案第1节）
 * ========================================================= */
'use strict';

const CFG = {
  // —— 定稿色板 ——
  COLORS: {
    primary: 0x2e86ab, primaryDark: 0x1d6d8e, primaryLight: 0xd9eaf2,
    warn: 0xffc107, danger: 0xf44336, ok: 0x4caf50,
    bg: 0xf4f6f9, panel: 0xffffff, border: 0xdde4ec,
    text: 0x2c3e50, textSub: 0x8494a7, offline: 0xb3bcc9,
  },
  // Region 分片调色板（同一 Region 三副本同色连线）
  REGION_PALETTE: [
    0x2e86ab, 0x8e44ad, 0xe67e22, 0x16a085, 0xc0392b, 0x2980b9,
    0xd35400, 0x27ae60, 0xf39c12, 0x6c5ce7, 0x00b894, 0xe84393,
  ],

  // —— 算力（方案1.3：上限5、迁移1点、分裂0.5点、每2秒回1点）——
  POWER_MAX: 5,
  COST_MIGRATE: 1.0,
  COST_SPLIT: 0.5,
  REGEN_PER_SEC: 0.5,

  // —— 风险（方案1.4：柔性容错，累计风险值）——
  RISK_MAX: 175,
  RISK_DECAY: 1.5,           // 全程健康时每秒回落
  RISK_LOAD_DANGER: 1.6,     // 每个过载节点(>80%)
  RISK_OVERSIZE: 1.2,        // 每个超大分片(>36)
  RISK_OVERSIZE_HARD: 1.6,   // 极限尺寸额外叠加(>46)
  RISK_HOT: 1.2,             // 每个热点分片(heat>=50)（调低：多灾难并发关不致风险顶满）
  RISK_REPLICA_SHORT: 1.5,   // 每个副本不足的分片（调低：手动补货下副本不足会存续更久，不该按秒雪崩）
  RISK_WALL_CUT: 0.15,       // 城墙加固：每级正向风险累积 -15%（最多 3 级 → -45%）

  // —— 分片 / 负载色阶（方案2.2：0~60绿 60~80黄 80+红）——
  LOAD_WARN: 60,
  LOAD_DANGER: 80,
  SPLIT_MIN: 18,   // 达到此体积可分裂
  SPLIT_MAX: 36,   // 超过此体积开始积累风险
  SIZE_HARD: 46,   // 极限尺寸，额外风险
  HEAT_DANGER: 50,
  HEAT_DECAY: 1.3, // 热度每秒自然衰减（加快：妖火不分裂也会较快退去，不再整关常驻）

  // —— 补货（自动补货已关闭，改为玩家手动点「补货」）——
  REPAIR_TIME: 3.0,
  REPAIR_COST: 1.0,   // 每次补 1 份副本的算力消耗（与转运同价：补货是主动操作，不能靠狂点白嫖）

  // —— 数据洪峰倍率 ——
  FLOOD_RATE: 3.0,

  // —— 星级门槛（方案1.5）——
  STAR2_RISK: 60,
  STAR3_RISK: 30,

  // —— 沙盘画布逻辑尺寸 ——
  VIEW_W: 1280,
  VIEW_H: 660,
  NODE_Y: 20,
  NODE_H: 616,
};

// —— 攻城建城：城区命名（TiKV 节点的城邦包装）——
const CITY_NAMES = ['内城', '东城', '西城', '南城', '北城', '新城', '卫城'];
const CITY = {
  name(tikvId) { return CITY_NAMES[tikvId] || ('第' + (tikvId + 1) + '城'); },
  full(tikvId) { return CITY.name(tikvId) + '（TiKV-' + (tikvId + 1) + '）'; },
};

// —— 战争物资（Region 的城邦包装，同一物资多仓同色）——
const SUPPLY_NAMES = ['粮草', '箭矢', '铁锭', '木材', '药材', '兵甲', '战马', '火药', '布匹', '金块', '盐包', '酒水'];
const CN_ORD = ['', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const SUPPLY = {
  name(regionId) {
    const base = SUPPLY_NAMES[(regionId - 1) % SUPPLY_NAMES.length];
    const round = Math.floor((regionId - 1) / SUPPLY_NAMES.length);
    return round === 0 ? base : base + '·' + (CN_ORD[round] || round + 1);
  },
};

// —— 战备经济：金币 / 商店 / 连击 ——
const ECON = {
  START_GOLD: 50,          // 初次进入城邦的启动资金
  GOLD_DEFEND: 10,         // 守住一次敌袭（迁空或御敌）
  GOLD_EXTINGUISH: 8,      // 分仓灭掉妖火
  GOLD_MIGRATE: 2,         // 每次货物转运
  GOLD_SPLIT: 2,           // 每次分仓
  GOLD_WIN: 15,            // 通关
  GOLD_ALLTASKS: 10,       // 任务全达成
  GOLD_RELIEF: 15,         // 驰援告急城成功
  RELIEF_NEED: 2,          // 驰援所需仓库数
  RELIEF_TIME: 20,         // 驰援时限（秒）
  COMBO_WINDOW: 5,         // 连击窗口（秒）：窗口内连续操作累计 combo
  SHOP: [
    { id: 'wall', icon: '🛡️', name: '城墙加固', prices: [30, 60, 90], max: 3, desc: '每级：城防风险累积 -15%（永久生效）' },
    { id: 'tower', icon: '🏹', name: '箭塔', prices: [45, 70, 100], max: 3, desc: '每级：敌军行军时间 +2 秒（永久生效）' },
    { id: 'repair', icon: '🧰', name: '急修队', prices: [40], max: 1, desc: '补货改为付金币（5金币/次），不再消耗算力' },
  ],
  CITY_LV_XP: [0, 30, 60, 100, 150],   // 城邦等级所需建设度
  CITY_PERKS: {
    2: '军需商店 9 折',
    3: '算力上限 +1',
    4: '围攻焚仓间隔 +0.5 秒',
    5: '每关首次御敌免费',
  },
  REPAIR_GOLD: 5,          // 急修队每次使用费用
  SIEGE_TIME: 14,          // 围攻战时长（秒）：撑到敌军士气崩溃
  SIEGE_FIRST: 2.0,        // 围攻开始到第一次焚仓的缓冲（缩短：idle 的城会在围攻内被烧穿）
  SIEGE_CONSUME: 3.0,      // 围攻中每 X 秒焚毁一座仓库（攻城无上限后每次围攻不宜烧太狠，否则补货永远追不上）
  SIEGE_STOCK_SLOW: 0.4,   // 城内每多出 1 座仓（超出 3），敌军焚仓间隔 +0.4 秒（仓＝城墙血条；补仓=加厚城墙）
  SIEGE_HOLD_MIN: 3,       // 守城红线（三副本原理）：城内仓数少于 3 座，城防即崩溃
  GOLD_HOLD: 12,           // 围攻守城成功
  MARCH_HP: 3,             // 行军团长血量（连点数锤可阵斩）
  SIEGE_HP: 6,             // 围攻军团血量（打崩提前撤退）
  GOLD_KILL: 6,            // 阵斩敌军
  REPEL_COST: 3,           // 御敌消耗算力
};

// 小工具
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randFloat(a, b) { return Math.random() * (b - a) + a; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
