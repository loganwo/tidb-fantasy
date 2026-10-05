# -*- coding: utf-8 -*-
"""重新生成 6 张城区城门插画：城门楼只占顶部、下部渐隐留白（不撑满整卡）
内城/东城/西城/南城/北城/新城 各一张，消除重复。
用法：GLM_KEY=xxx python asset/gates/gen_gates_ai.py"""
import io, os, json, urllib.request
from PIL import Image

KEY = os.environ['GLM_KEY']
OUT = 'asset/gates'
os.makedirs(OUT, exist_ok=True)

STYLE = ("柔和扁平游戏插画风格，浅色UI适配，柔和色彩，竖构图，无文字，无水印，无人物。"
         "构图要求：画面底部约三分之一是完整清晰的城门楼主体（城楼整体可见、位于画面下缘），"
         "城门楼以上全部是接近纯白的浅色背景，向上渐渐变浅，大量留白，顶部干净。")

PROMPTS = {
    0: "中式皇宫城门楼：红墙、金色双层飞檐屋顶、拱形大门、门前白玉台阶和铜狮，",
    1: "东城市坊门楼：青灰色瓦顶、红色立柱、悬挂的红灯笼、沿街店铺幌子和遮阳棚，",
    2: "西城山关隘口：灰石砌成的关楼建在山岩之间、垛口城墙、山坡烽火台、蜿蜒山路，",
    3: "南城水乡水门：城墙横跨平静的河面、半圆形水门拱洞、前方石拱桥、垂柳和水波倒影，",
    4: "北城箭楼要塞：深灰色石墙箭楼、密集的射箭孔、城墙上猎猎旌旗、远处雪山地平线，",
    5: "新城奠基工地：半建成的新城墙、木质脚手架、夯土锤、石料堆、一面写工期的新旗，",
}

for i, subject in PROMPTS.items():
    body = json.dumps({'model': 'cogview-3-flash', 'prompt': subject + STYLE, 'size': '768x1344'}).encode('utf-8')
    req = urllib.request.Request(
        'https://open.bigmodel.cn/api/paas/v4/images/generations', data=body,
        headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as resp:
        url = json.loads(resp.read())['data'][0]['url']
    with urllib.request.urlopen(url, timeout=180) as r:
        raw = r.read()
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    # 压缩：宽 800 足够（卡片显示最大 ~300px 宽）
    im = im.resize((800, int(800 * im.height / im.width)), Image.LANCZOS)
    im.save(f'{OUT}/gate-{i}.jpg', quality=84)
    print(f'gate-{i}.jpg', im.size, round(os.path.getsize(f"{OUT}/gate-{i}.jpg") / 1024), 'KB')
print('6 张城门插画生成完成')
