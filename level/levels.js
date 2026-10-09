/* =========================================================
 * 《分片城邦：TiDB幻境》关卡配置
 * 原始 12 关（备战 1-2 / 先锋 3-4 / 压境 5-6 / 围城 7-9 / 总攻 10-12）；
 * 发布版过滤掉「备战」章后重编号为 10 关（见文件末尾 LEVELS）。
 * 纯 JSON 结构；以 JS 常量承载以支持 file:// 双击直开。
 *
 * 剧情字段：
 * story    开场剧情对白 [{ who: 'tidby'|'pit'|'king', text }]
 * storyEnd 通关剧情对白（章节收尾/关键剧情）
 * tasks    本关任务 [{ stat, op, target, desc }]
 *
 * 容量语义：每个 Region 的 3 副本在各自节点各占完整体积。
 * 负载% = Σ(本节点上各Region体积) / tikvCapacity。
 * tikvCapacity=300 时，4节点×6分片×20体积 ≈ 30% 初始水位。 */
'use strict';

/* 剧情角色（头像优先用 base64 内联数据，免疫 Tunnel 传输截断；内联缺失时回退文件路径） */
const AV = (window.AVATAR_DATA || {});
const CHARACTERS = {
  tidby: { name: '小Ti', color: '#2e86ab', avatar: 'asset/hero.webp', zoom: 1.6, origin: '50% 30%' },
  pit:   { name: '老皮特', color: '#8e44ad', avatar: AV.pit || 'asset/icons/avatar-pit.png', zoom: 2.8, origin: '52% 12%' },   // 武斗派军师
  king:  { name: '混沌之王', color: '#c0392b', avatar: AV.king || 'asset/icons/avatar-king.png' }, // 终极 BOSS
};

/* 章节通关后授予的称号 */
const TITLES = {
  0: '见习生',
  1: '值守调度官',
  2: '全局调度官',
  3: '首席容灾官',
  4: '城邦之主',
};

const LEVEL_DEFAULTS = {
  duration: 60,          // 生存倒计时（秒）
  tikvCount: 4,          // 初始 TiKV 节点数（≥4，保证迁移有空间）
  tikvCapacity: 300,     // 单节点容量
  initialRegions: 6,     // 初始 Region 数
  regionSizeMin: 16,     // 初始 Region 体积范围
  regionSizeMax: 22,
  bigRegions: 0,         // 初始"接近爆仓"的 Region 个数
  bigRegionSize: 30,
  dataRate: 0.2,         // 每个 Region 每秒数据流入
  powerMax: 5,           // 调度算力上限
  powerRegen: 0.85,      // 每秒算力恢复（提高：攻城无上限 + 手动补货，算力必须跟得上焚仓速度）
  skew: 0,               // 初始负载倾斜程度 0~1（物资偏向低编号城区）
  events: {},            // 随机灾难事件配置，未配置 = 不启用
  multiEvent: false,     // 是否允许多灾难并发
  tutorial: null,        // 教学步骤（仅第一关）
  intro: '',             // 老皮特战前叮嘱（PD 台个性化开场）
  knowledge: [],         // 通关科普知识点
  story: null,           // 开场剧情对白
  storyEnd: null,        // 通关剧情对白
  tasks: [],             // 本关任务
};

/* 事件配置：nodeDown 攻城 / hotspot 妖火 / flood 洪峰 / scaleUp 筑新城 / scaleDown 弃守 */
const LEVELS_RAW = [

  /* ============ 第二章 · 先锋试探（敌军叩边） ============ */
  {
    id: 3, chapter: 2, name: '黑色倒计时', duration: 35,
    tikvCount: 4, initialRegions: 7, dataRate: 0.2,
    events: { nodeDown: { gapMin: 8, gapMax: 12, countdown: 5, maxTimes: 2, siegeTime: 14 } },
    intro: '敌军先锋到了。城头会亮出 6 秒狼烟——调仓支援死守，或攒算力御敌反击！',
    requisition: null,
    tutorial: [
      { type: 'migrate', title: '第一步：货物转运', text: '按住任意彩色仓库块，拖到另一座城区上松开，即完成一次转运。\n每次转运消耗 1 点调度算力（顶部黄色条）。' },
      { type: 'split', title: '第二步：分仓', text: '仓里的物资越堆越多，超过 36 就是「爆仓」，会持续积累风险。\n点击一个标着「爆仓」的仓库块，再点右侧【分仓】按钮，一分为二。' },
      { type: 'card', title: '守城要诀', text: '守城红线＝三副本原理：被围的城必须留住 3 座仓，少于 3 座城防立即崩溃。\n敌军攻城时：往被围的城里拖仓支援（仓越多城墙越厚，敌军烧得越慢），或攒 3⚡ 御敌反击。' },
    ],
    story: [
      { who: 'pit', text: '小Ti，斥候来报——混沌之王纠集十万大军压境，先锋营已经到了！' },
      { who: 'tidby', text: '来得好快！物资还没摆位呢！' },
      { who: 'pit', text: '记死铁律：同批物资的仓绝不同城。守城红线——被围的城必须留住 3 座仓，凑不齐三副本，城防一攻即破！' },
    ],
    storyEnd: [
      { who: 'tidby', text: '呼——这就是守城的滋味吗。心跳都和倒计时同步了！' },
    ],
    tasks: [
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
      { stat: 'migrate', op: '>=', target: 3, desc: '完成 3 次货物转运' },
    ],
    knowledge: [
      '三副本（3 Replica）：每个 Region 默认 3 个副本构成 Raft 组，写入需多数派（2/3）确认。',
      'Raft 多数派：3 副本丢 1 个仍可服务；丢 2 个数据无法恢复——这就是敌袭前必须迁空的原因。',
    ],
  },
  {
    id: 4, chapter: 2, name: '连环警报', duration: 45,
    tikvCount: 5, initialRegions: 8, dataRate: 0.2, powerRegen: 0.6,
    events: { nodeDown: { gapMin: 9, gapMax: 13, countdown: 5, maxTimes: 3, siegeTime: 14 } },
    intro: '先锋营轮番袭扰，两次攻城、算力恢复还慢了。学会排序：先救燃烧的，再救冒烟的。',
    story: [
      { who: 'pit', text: '先锋营今晚轮番袭扰：两波攻城，而我们的算力恢复变慢了。' },
      { who: 'tidby', text: '那更得省着用——每一次出手都要打在要害上！' },
      { who: 'pit', text: '记住：城破之后，相邻的城会资源告急。听见告警，立刻调仓驰援，慢了敌军下一波会更猛。' },
    ],
    tasks: [
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
      { stat: 'migrate', op: '>=', target: 5, desc: '完成 5 次货物转运' },
    ],
    knowledge: [
      'PD 自愈：节点真挂了，PD 会自动为受损 Region 补齐副本——但要消耗调度资源，且有风险窗口。',
      '提前迁移的收益远大于事后自愈：防患于未然，正是运维的第一课。',
    ],
  },

  /* ============ 第三章 · 大军压境（兵临城下） ============ */
  {
    id: 5, chapter: 3, name: '贸易洪峰', duration: 40,
    tikvCount: 4, initialRegions: 7, dataRate: 0.2,
    events: {
      flood: { gapMin: 14, gapMax: 20, duration: 10, maxTimes: 2 },
      nodeDown: { gapMin: 12, gapMax: 16, countdown: 5, maxTimes: 2, siegeTime: 14 },
    },
    intro: '大军压境前最后的商潮：各地物资涌入，洪峰一来全局写入三倍——趁早把大仓分好。',
    story: [
      { who: 'tidby', text: '师父！大军压境了，各地百姓都往城里送物资——仓库快堆不下了！' },
      { who: 'pit', text: '洪峰不可怕，可怕的是平时没有留出水位。趁洪峰没到，把大仓全部分掉。' },
    ],
    tasks: [
      { stat: 'split', op: '>=', target: 3, desc: '分仓 3 次' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '数据洪峰：秒杀、大促等场景写入量瞬间翻倍，Region 膨胀速度同步飙升。',
      '洪峰应对靠"水位余量"：平时保持分片不过大、节点不过满，突发流量才有缓冲空间。',
    ],
  },
  {
    id: 6, chapter: 3, name: '断粮孤城', duration: 50,
    tikvCount: 5, initialRegions: 9, dataRate: 0.22, skew: 0.8, powerRegen: 0.55,
    events: {
      flood: { gapMin: 16, gapMax: 22, duration: 8, maxTimes: 2 },
      nodeDown: { gapMin: 12, gapMax: 16, countdown: 5, maxTimes: 3, siegeTime: 14 },
    },
    intro: '粮道被断、调度通道被限流：城内倾斜严重、算力只剩六成。每一手都要打在要害上。',
    story: [
      { who: 'king', text: '愚蠢的调度官……你们的粮道，已经在我手里。' },
      { who: 'pit', text: '混沌之王亲自断我粮道，调度算力只剩六成，南城还堆着老毛病。' },
      { who: 'tidby', text: '粮道断了我们自己调！倾斜我们自己平！这一城一池，都不会丢！' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 6, desc: '完成 6 次货物转运' },
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '倾斜 + 洪峰是最危险的组合：热点节点会在洪峰中第一个过载，拖垮整个集群的服务质量。',
      '资源受限时，调度官的核心能力变成"排序"：先救副本缺失，再救过载，最后才是不紧急的均衡。',
    ],
  },

  /* ============ 第四章 · 围城苦战 ============ */
  {
    id: 7, chapter: 4, name: '热点妖火', duration: 40,
    tikvCount: 4, initialRegions: 7, dataRate: 0.18,
    events: {
      hotspot: { gapMin: 9, gapMax: 13, strengthMin: 70, strengthMax: 90, maxTimes: 4 },
      nodeDown: { gapMin: 10, gapMax: 14, countdown: 5, maxTimes: 2, siegeTime: 14 },
    },
    intro: '围城战中敌军四处放火：妖火一阵接一阵，仓库过热就得分仓降温。',
    story: [
      { who: 'pit', text: '围城战开始了——敌军不攻城，改放火。妖火一阵接一阵，专烧人最多的仓。' },
      { who: 'tidby', text: '火苗再旺，分仓一分为二，它就烧不起来了！' },
    ],
    tasks: [
      { stat: 'split', op: '>=', target: 4, desc: '分仓 4 次' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '热点（Hotspot）：单行热点、大促秒杀页都会让某个 Region 的读写流量远超其他，成为全集群瓶颈。',
      '热点治理三板斧：分裂打散、迁移腾挪、业务侧打散 Key（比如加随机前缀）。',
    ],
  },
  {
    id: 8, chapter: 4, name: '扩城屯兵', duration: 45,
    tikvCount: 4, initialRegions: 8, dataRate: 0.22,
    events: {
      scaleUp: { gapMin: 12, gapMax: 16, maxTimes: 1 },
      nodeDown: { gapMin: 11, gapMax: 15, countdown: 5, maxTimes: 3, siegeTime: 14 },
    },
    intro: '工兵营在城外筑起新城！把仓库匀些过去——但老城区的敌袭，也不会停。',
    story: [
      { who: 'tidby', text: '师父！工兵营起新城了，城墙一天就立起来了！' },
      { who: 'pit', text: '新城空着就是浪费。把仓库匀过去——但记住，老城区的敌袭也不会停。' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 5, desc: '完成 5 次货物转运' },
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
    ],
    knowledge: [
      '扩容（Scale-out）：新 TiKV 加入集群后，PD 会逐渐把副本迁移过去，容量与吞吐随之线性增长。',
      'TiDB 的在线扩缩容对业务几乎透明——这正是分片 + 多副本架构的最大红利。',
    ],
  },
  {
    id: 9, chapter: 4, name: '弃守之令', duration: 45,
    tikvCount: 5, initialRegions: 8, dataRate: 0.2,
    events: {
      scaleDown: { gapMin: 10, gapMax: 14, countdown: 30, maxTimes: 1 },
      hotspot: { gapMin: 14, gapMax: 20, strengthMin: 70, strengthMax: 85, maxTimes: 2 },
      nodeDown: { gapMin: 11, gapMax: 15, countdown: 5, maxTimes: 3, siegeTime: 14 },
    },
    intro: '军令：弃守一座孤城，把物资全部撤出（30 秒长预警）。有序撤退也是必修课。',
    story: [
      { who: 'pit', text: '军令下来：一座孤城守不过来，弃守——给你 30 秒，把物资全撤出来。' },
      { who: 'tidby', text: '有序撤退，也是调度官的必修课！撤！' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 4, desc: '完成 4 次货物转运' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '缩容（Evict Leader / 下线节点）：先停止向它调度新副本，再逐个搬走存量副本，最后安全下线。',
      '有序缩容和突然宕机的区别只有一个：时间。给足时间，灾难就只是例行维护。',
    ],
  },

  /* ============ 第五章 · 十万大军总攻 ============ */
  {
    id: 10, chapter: 5, name: '混战之夜', duration: 50,
    tikvCount: 5, initialRegions: 8, dataRate: 0.2, multiEvent: true,
    events: {
      nodeDown: { gapMin: 9, gapMax: 13, countdown: 5, maxTimes: 3, siegeTime: 14 },
      hotspot: { gapMin: 12, gapMax: 16, strengthMin: 70, strengthMax: 85, maxTimes: 2 },
      flood: { gapMin: 14, gapMax: 20, duration: 10, maxTimes: 1 },
    },
    intro: '总攻前夜：攻城、妖火、洪峰不再排队而来。这是你练了十关的一切。',
    story: [
      { who: 'pit', text: '小Ti，总攻前夜到了。攻城、妖火、洪峰——它们不再排队，而是一起来。' },
      { who: 'tidby', text: '让它们来！前九关练的每一下，都是为今晚准备的！' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 5, desc: '完成 5 次货物转运' },
      { stat: 'split', op: '>=', target: 4, desc: '分仓 4 次' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '混沌工程（Chaos Engineering）：主动向系统注入故障来验证容灾能力——本游戏就是一场混沌实验。',
      '并发灾难是常态：真实运维中告警从来排队而来，SRE 的价值在于并发下的优先级排序。',
    ],
  },
  {
    id: 11, chapter: 5, name: '三线告急', duration: 55,
    tikvCount: 6, initialRegions: 10, dataRate: 0.22, multiEvent: true, powerRegen: 1.3, powerMax: 6,
    events: {
      nodeDown: { gapMin: 8, gapMax: 12, countdown: 5, maxTimes: 3, siegeTime: 14 },
      hotspot: { gapMin: 10, gapMax: 14, strengthMin: 75, strengthMax: 90, maxTimes: 2 },
      flood: { gapMin: 12, gapMax: 16, duration: 10, maxTimes: 1 },
    },
    intro: '六城战线全面开花：攻城、妖火、洪峰轮番轰炸。规模是红利，管得过来才算本事。',
    story: [
      { who: 'pit', text: '六城战线全面开花——东线告急、西线起火、粮道又被冲了。' },
      { who: 'tidby', text: '规模是红利也是负担。哪座城先救、哪座城能缓，我心中有数！' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 6, desc: '完成 6 次货物转运' },
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
      { stat: 'split', op: '>=', target: 4, desc: '分仓 4 次' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '规模的红利：节点越多，单点故障影响占比越小；规模的负担：Region 总数指数增长，调度决策更多更快。',
      '真实 TiDB 集群管理着百万级 Region，全靠 PD 的自动化调度，人只负责策略与兜底。',
    ],
  },
  {
    id: 12, chapter: 5, name: '城邦之主', duration: 65, chapterBoss: true,
    tikvCount: 5, initialRegions: 10, regionSizeMin: 14, regionSizeMax: 18, dataRate: 0.24, powerRegen: 1.2, powerMax: 6, multiEvent: true,
    events: {
      nodeDown: { gapMin: 8, gapMax: 12, countdown: 5, maxTimes: 3, siegeTime: 14 },
      hotspot: { gapMin: 10, gapMax: 14, strengthMin: 75, strengthMax: 95, maxTimes: 2 },
      flood: { gapMin: 12, gapMax: 16, duration: 12, maxTimes: 1 },
      scaleUp: { gapMin: 18, gapMax: 24, maxTimes: 1 },
    },
    intro: '决战：混沌之王亲率十万大军攻城，110 秒生存，全灾难并发——守住，就是城邦之主！',
    story: [
      { who: 'king', text: '渺小的调度官……本王的十万大军已踏平外围。这座城邦的混乱，由我书写！' },
      { who: 'tidby', text: '很遗憾，这里是我的城邦——每一片分片、每一个副本，都由我守护！' },
      { who: 'pit', text: '小Ti，全城邦的眼睛都看着你。让它见识，什么叫真正的稳态！' },
      { who: 'tidby', text: '决战吧！！' },
    ],
    storyEnd: [
      { who: 'pit', text: '混沌之王退散了……孩子，从今天起，你就是城邦的新任 PD。' },
      { who: 'tidby', text: '师父——不，老皮特前辈。请叫我：城邦之主！' },
      { who: 'pit', text: '去吧。记住：用副本换安全，用分裂换均衡，用调度换稳态。' },
      { who: 'tidby', text: '玩法如此，架构亦然！' },
    ],
    tasks: [
      { stat: 'migrate', op: '>=', target: 6, desc: '完成 6 次货物转运' },
      { stat: 'split', op: '>=', target: 3, desc: '分仓 3 次' },
      { stat: 'cities', op: '<=', target: 0, desc: '不丢失任何城区' },
      { stat: 'peakRisk', op: '<=', target: 40, desc: '峰值风险 ≤ 40' },
    ],
    knowledge: [
      '你已经掌握了 TiDB 的五大核心：分片（Region）、多副本（Raft）、调度（PD）、分裂（Split）、容灾（HA）。',
      '分布式数据库的思想总结：用副本换安全，用分裂换均衡，用全局调度换稳态——玩法如此，架构亦然。',
    ],
  },
];

/* 删掉备战章后重编号：章节 1=先锋 2=压境 3=围城 4=总攻 */
const LEVELS = LEVELS_RAW
  .filter(l => l.chapter > 1)
  .map((l, i) => Object.assign({}, LEVEL_DEFAULTS, l, { id: i + 1, chapter: l.chapter - 1 }));

const CHAPTERS = [
  { id: 1, name: '第一章 · 先锋试探', desc: '敌军先锋叩边：守城、驰援，别让任何仓库烧掉' },
  { id: 2, name: '第二章 · 大军压境', desc: '敌军主力逼近：贸易断续、粮道吃紧，全城调度' },
  { id: 3, name: '第三章 · 围城苦战', desc: '围城战：妖火四起、扩城屯兵、有序弃守' },
  { id: 4, name: '第四章 · 十万大军总攻', desc: '总攻之夜：全灾难并发，决战胜负在此一举' },
];

// 图鉴（科普卡片，按章节进度解锁）
const CODEX = [
  { ch: 1, icon: '🧩', title: 'Region 分片', text: 'TiDB 把表数据按 Key 范围切成一片片 Region（默认约 96MB），它是调度的最小单元。数据持续写入会让 Region 变大，超过阈值就分裂。' },
  { ch: 1, icon: '🗄️', title: 'TiKV 存储节点', text: 'TiKV 是负责存数据的分布式 KV 引擎。每个节点有自己的容量水位，80% 以上就进入危险区，需要尽快均衡。' },
  { ch: 1, icon: '📝', title: '分裂 Split', text: 'Region 体积超限就一分为二，各继承约一半数据。新分片会被调度到更空的节点上——分裂即再平衡。' },
  { ch: 1, icon: '🚚', title: '迁移副本', text: '把某个 Region 的副本从一个节点搬到另一个节点，是均衡负载、规避宕机的基本手段，但要消耗调度资源。' },
  { ch: 2, icon: '👥', title: '三副本与 Raft', text: '每个 Region 默认 3 个副本组成 Raft 组。写入需要多数派（2/3）确认，读也能从多数派读到最新数据。' },
  { ch: 2, icon: '⚖️', title: 'Raft 多数派', text: '3 副本挂 1 个：还有多数派，正常服务；挂 2 个：多数派丢失，数据无法恢复。这就是"提前迁移"存在的意义。' },
  { ch: 2, icon: '🛡️', title: 'PD 自愈', text: '节点真挂了，PD 会自动为受损 Region 补齐副本。自愈不是免费的：要消耗调度资源，还有一段风险窗口。' },
  { ch: 2, icon: '🧯', title: '宕机与容灾', text: '容灾的本质是冗余：副本分散得越开，能抵抗的故障级别越高——硬盘级、机器级、机架级、机房级。' },
  { ch: 3, icon: '🎯', title: 'PD 调度', text: 'PD 是 TiDB 的大脑，掌握全集群心跳与元数据，决定"把哪个副本搬到哪"。它调度的也是有限的资源。' },
  { ch: 3, icon: '🌊', title: '数据洪峰', text: '大促、秒杀让写入量瞬间翻倍。平时保持分片不过大、节点不过满，突发流量才有缓冲空间。' },
  { ch: 4, icon: '🔥', title: '热点风暴', text: '某个 Region 访问量远超其他就是热点。治理三板斧：分裂打散、迁移腾挪、业务侧打散 Key。' },
  { ch: 4, icon: '📈', title: '扩容与缩容', text: '扩容：新节点上线，PD 渐进迁移，对业务透明；缩容：长预警有序搬空再下线。给足时间，灾难只是维护。' },
  { ch: 5, icon: '⚡', title: '调度算力', text: '调度本身消耗集群资源，真实系统会对调度限速。会排序的调度官：先救副本，再救过载，最后做优雅。' },
  { ch: 5, icon: '🧪', title: '混沌工程', text: '主动注入故障来验证容灾能力。稳定不是没有故障，而是任何单点故障都无法击垮整体——这就是分布式的浪漫。' },
];
