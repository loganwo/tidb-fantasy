# -*- coding: utf-8 -*-
"""① 删备战章 12→10 关并缩时 ② 废除迁空流：空城即陷落"""
import io, re

# ============ levels.js ============
p = 'level/levels.js'
s = io.open(p, encoding='utf-8').read()

# 1) 把教学步骤挂到「黑色倒计时」（新的第一关）
old_tut = """    intro: '敌军先锋到了。第一座城会带 6 秒预警被攻——提前迁空它的仓，或攒算力御敌。',
    story: ["""
new_tut = """    intro: '敌军先锋到了。城头会亮出 6 秒狼烟——调仓支援死守，或攒算力御敌反击！',
    requisition: null,
    tutorial: [
      { type: 'migrate', title: '第一步：货物转运', text: '按住任意彩色仓库块，拖到另一座城区上松开，即完成一次转运。\\n每次转运消耗 1 点调度算力（顶部黄色条）。' },
      { type: 'split', title: '第二步：分仓', text: '仓里的物资越堆越多，超过 36 就是「爆仓」，会持续积累风险。\\n点击一个标着「爆仓」的仓库块，再点右侧【分仓】按钮，一分为二。' },
      { type: 'card', title: '守城要诀', text: '敌军攻城时：往被围的城里拖仓支援（仓是城墙的血条），或攒 3⚡ 御敌反击。\\n空城会被直接占领——守城永远要留兵留粮！' },
    ],
    story: ["""
assert old_tut in s, 'tut anchor'
s = s.replace(old_tut, new_tut, 1)

# 2) 新 L1 剧情改写（原迁空话术 → 支援反击）
old_story = """    story: [
      { who: 'pit', text: '先锋营到了。他们第一波会猛攻一座城——城头上会亮出 6 秒的狼烟倒计时。' },
      { who: 'tidby', text: '来不及把仓迁走呢？' },
      { who: 'pit', text: '丢一份物资还能补；丢掉多数仓，那批账册就永远没了。要么抢在城破前迁空，要么攒够 3 点算力——用你的锤子御敌。' },
    ],"""
new_story = """    story: [
      { who: 'pit', text: '小Ti，斥候来报——混沌之王纠集十万大军压境，先锋营已经到了！' },
      { who: 'tidby', text: '来得好快！物资还没摆位呢！' },
      { who: 'pit', text: '记死铁律：同批物资的仓绝不同城。敌军攻城时——拖仓支援死守，或攒 3⚡ 御敌反击。空城是守不住的！' },
    ],"""
assert old_story in s, 'story'
s = s.replace(old_story, new_story, 1)

# 3) 删掉备战章两关（整块删除：从「第一章 · 备战演武」注释到「第二章」注释前）
start = s.index('/* ============ 第一章 · 备战演武')
end = s.index('/* ============ 第二章 · 先锋试探')
s = s[:start] + s[end:]

# 4) 过滤+重编号：删第一章、章节号前移
old_lv = "const LEVELS = LEVELS_RAW.map(l => Object.assign({}, LEVEL_DEFAULTS, l));"
new_lv = """/* 删掉备战章后重编号：章节 1=先锋 2=压境 3=围城 4=总攻 */
const LEVELS = LEVELS_RAW
  .filter(l => l.chapter > 1)
  .map((l, i) => Object.assign({}, LEVEL_DEFAULTS, l, { id: i + 1, chapter: l.chapter - 1 }));"""
assert old_lv in s
s = s.replace(old_lv, new_lv)

# 5) 章节表
old_ch = s[s.index('const CHAPTERS = ['):s.index('];', s.index('const CHAPTERS = [')) + 2]
new_ch = """const CHAPTERS = [
  { id: 1, name: '第一章 · 先锋试探', desc: '敌军先锋叩边：守城、驰援，别让任何仓库烧掉' },
  { id: 2, name: '第二章 · 大军压境', desc: '敌军主力逼近：贸易断续、粮道吃紧，全城调度' },
  { id: 3, name: '第三章 · 围城苦战', desc: '围城战：妖火四起、扩城屯兵、有序弃守' },
  { id: 4, name: '第四章 · 十万大军总攻', desc: '总攻之夜：全灾难并发，决战胜负在此一举' },
];"""
s = s.replace(old_ch, new_ch)

# 6) 缩时（按关名精准替换 duration）
durations = {'黑色倒计时': 35, '连环警报': 45, '贸易洪峰': 40, '断粮孤城': 50, '热点妖火': 40,
             '扩城屯兵': 45, '弃守之令': 45, '混战之夜': 50, '三线告急': 55, '城邦之主': 65}
for name, dur in durations.items():
    s, n = re.subn(r"(name: '" + name + r"', duration: )\d+", r"\g<1>" + str(dur), s)
    assert n == 1, name
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('levels 10 关缩时完成')

# ============ eventSystem：废除迁空流 ============
p = 'js/eventSystem.js'
s = io.open(p, encoding='utf-8').read()
old2 = """        } else {
          core.score += 50;
          if (core.hooks.onGold) core.hooks.onGold(ECON.GOLD_DEFEND, '守住' + CITY.name(w.tikv));
          core.broadcast(`🛡 ${CITY.name(w.tikv)} 空城御敌！敌军一无所获悻悻而退（+${ECON.GOLD_DEFEND}💰）`, 'ok');
        }"""
new2 = """        } else {
          // 空城不战而下：弃守逃跑流直接判负一城
          core.bringNodeDown(w.tikv, '空城无备，敌军不战而下', false);
          core.broadcast(`🏴 ${CITY.name(w.tikv)}空无守备，被敌军不战而下！守城必须留仓留兵。`, 'bad');
        }"""
assert old2 in s, 'empty city'
s = s.replace(old2, new2, 1)
old3 = "——迁空仓库，或攒 3⚡ 御敌反击！"
new3 = "——调仓支援死守，或攒 3⚡ 御敌反击！"
assert old3 in s
s = s.replace(old3, new3)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('eventSystem 迁空流废除 ok')

# ============ uiSystem：横幅文案 + 章节阶段映射 ============
p = 'js/uiSystem.js'
s = io.open(p, encoding='utf-8').read()
old4 = "迁空仓库或御敌反击！\")"
new4 = "拖仓支援或御敌反击！\")"
assert old4 in s
s = s.replace(old4, new4)
old5 = """    const phase = lv.chapter <= 1 ? '，正是备战演武的好时机！'
      : lv.chapter === 2 ? '，敌军先锋已抵边境！'
      : lv.chapter === 3 ? '，大军已兵临城下！'
      : lv.chapter === 4 ? '，围城战正酣，各城告急频传！'
      : '——总攻已经打响！';"""
new5 = """    const phase = lv.chapter === 1 ? '，敌军先锋已抵边境！'
      : lv.chapter === 2 ? '，大军已兵临城下！'
      : lv.chapter === 3 ? '，围城战正酣，各城告急频传！'
      : '——总攻已经打响！';"""
assert old5 in s, 'phase'
s = s.replace(old5, new5)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('uiSystem ok')

# ============ main.js：TITLES 与行军阶段 ============
p = 'js/main.js'
s = io.open(p, encoding='utf-8').read()
old6 = """const TITLES = {
  0: '见习生',
  1: '见习调度官',
  2: '值守调度官',
  3: '全局调度官',
  4: '首席容灾官',
  5: '城邦之主',
};"""
# TITLES 在 levels.js —— main.js 只改 warPhase 阈值
old6 = "      const warPhase = warDays > 10 ? '远在边境' : warDays > 7 ? '正在逼近' : warDays > 3 ? '已兵临城下' : warDays > 0 ? '围城总攻在即' : '兵临城下！';"
new6 = "      const warPhase = warDays > 7 ? '远在边境' : warDays > 4 ? '正在逼近' : warDays > 1 ? '已兵临城下' : warDays > 0 ? '围城总攻在即' : '兵临城下！';"
assert old6 in s, 'warPhase'
s = s.replace(old6, new6)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('main ok')

# ============ levels.js TITLES（4章版） ============
p = 'level/levels.js'
s = io.open(p, encoding='utf-8').read()
old7 = """const TITLES = {
  0: '见习生',
  1: '见习调度官',
  2: '值守调度官',
  3: '全局调度官',
  4: '首席容灾官',
  5: '城邦之主',
};"""
new7 = """const TITLES = {
  0: '见习生',
  1: '值守调度官',
  2: '全局调度官',
  3: '首席容灾官',
  4: '城邦之主',
};"""
assert old7 in s
s = s.replace(old7, new7)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('TITLES ok')

# ============ index.html 帮助文案 ============
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
old8 = "⚔️ 敌军攻城倒计时结束前，迁空城区仓库！"
new8 = "⚔️ 敌军攻城：拖仓支援死守，或攒 3⚡ 御敌反击！"
assert old8 in s
s = s.replace(old8, new8)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('help ok')
