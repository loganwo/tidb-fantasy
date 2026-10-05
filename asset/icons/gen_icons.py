# -*- coding: utf-8 -*-
"""生成游戏内全部 SVG 矢量资产：12 物资图标 / 沙盘背景 / 两个头像 / 菜单横幅"""
import os, io

os.makedirs('asset/icons', exist_ok=True)
W = 'fill="#ffffff" fill-opacity="0.96"'
D = 'stroke="#1f2d3a" stroke-opacity="0.22"'
HL = 'fill="#ffe9a0" fill-opacity="0.9"'

icons = {}
icons['supply-0'] = f'''<path d="M32 8 L54 48 H10 Z" {W} {D} stroke-width="2"/>
<line x1="18" y1="38" x2="46" y2="38" stroke="#1f2d3a" stroke-opacity="0.18" stroke-width="2"/>
<line x1="22" y1="30" x2="42" y2="30" stroke="#1f2d3a" stroke-opacity="0.18" stroke-width="2"/>
<circle cx="32" cy="8" r="4" {HL}/>'''

icons['supply-1'] = f'''<line x1="14" y1="50" x2="46" y2="18" stroke="#ffffff" stroke-opacity="0.96" stroke-width="6" stroke-linecap="round"/>
<path d="M40 10 L54 10 L54 24 Z" {W}/>
<path d="M14 50 L6 50 M14 50 L14 58" stroke="#ffe9a0" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round"/>'''

icons['supply-2'] = f'''<path d="M12 44 L20 30 H44 L52 44 Z" {W} {D} stroke-width="2"/>
<path d="M22 24 L28 14 H40 L46 24 H22 Z" fill="#ffffff" fill-opacity="0.75"/>
<line x1="24" y1="38" x2="40" y2="38" stroke="#ffe9a0" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round"/>'''

icons['supply-3'] = f'''<rect x="8" y="24" width="36" height="18" rx="9" {W} {D} stroke-width="2"/>
<circle cx="46" cy="33" r="11" {W} {D} stroke-width="2"/>
<circle cx="46" cy="33" r="6" fill="none" stroke="#1f2d3a" stroke-opacity="0.18" stroke-width="2"/>
<circle cx="46" cy="33" r="2" fill="#1f2d3a" fill-opacity="0.25"/>
<line x1="14" y1="29" x2="36" y2="29" stroke="#1f2d3a" stroke-opacity="0.12" stroke-width="2"/>'''

icons['supply-4'] = f'''<rect x="26" y="14" width="12" height="7" rx="2" {W}/>
<rect x="23" y="20" width="18" height="30" rx="6" {W} {D} stroke-width="2"/>
<path d="M32 28 V42 M25 35 H39" stroke="#2e86ab" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>
<path d="M46 44 C54 42 56 34 52 30 C48 34 46 38 46 44 Z" fill="#4caf50" fill-opacity="0.85"/>'''

icons['supply-5'] = f'''<path d="M32 8 L52 15 V32 C52 45 44 53 32 58 C20 53 12 45 12 32 V15 Z" {W} {D} stroke-width="2"/>
<path d="M32 16 V50 M18 30 H46" stroke="#2e86ab" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round"/>
<circle cx="32" cy="12" r="3" {HL}/>'''

icons['supply-6'] = f'''<path d="M18 54 C18 40 22 32 30 27 L27 16 L36 24 C44 20 50 26 52 33 C53 39 49 46 42 48 L42 54 Z" {W} {D} stroke-width="2"/>
<circle cx="42" cy="32" r="2.4" fill="#1f2d3a" fill-opacity="0.55"/>
<path d="M30 27 C34 30 36 34 36 38" stroke="#1f2d3a" stroke-opacity="0.18" stroke-width="2" fill="none"/>'''

icons['supply-7'] = f'''<path d="M18 22 C18 20 46 20 46 22 L44 50 C44 52 20 52 20 50 Z" {W} {D} stroke-width="2"/>
<line x1="18" y1="30" x2="46" y2="30" stroke="#1f2d3a" stroke-opacity="0.2" stroke-width="2.5"/>
<line x1="18.6" y1="42" x2="45.4" y2="42" stroke="#1f2d3a" stroke-opacity="0.2" stroke-width="2.5"/>
<path d="M40 18 C44 12 50 12 52 8" stroke="#ffe9a0" stroke-opacity="0.95" stroke-width="3" fill="none" stroke-linecap="round"/>
<circle cx="53" cy="7" r="3.4" fill="#f44336" fill-opacity="0.9"/>'''

icons['supply-8'] = f'''<circle cx="24" cy="34" r="16" {W} {D} stroke-width="2"/>
<circle cx="24" cy="34" r="7" fill="none" stroke="#1f2d3a" stroke-opacity="0.2" stroke-width="2.5"/>
<path d="M36 22 C46 20 52 26 54 34 C55 42 50 48 42 48 L38 46 C44 44 46 38 44 32 C42 27 40 24 36 22 Z" fill="#ffffff" fill-opacity="0.75"/>'''

icons['supply-9'] = f'''<path d="M10 46 L16 34 H30 L36 46 Z" {HL} {D} stroke-width="2"/>
<path d="M28 46 L34 34 H48 L54 46 Z" {W} {D} stroke-width="2"/>
<path d="M52 12 L54 18 L60 20 L54 22 L52 28 L50 22 L44 20 L50 18 Z" {HL}/>'''

icons['supply-10'] = f'''<path d="M24 16 C18 22 12 32 12 42 C12 52 20 56 32 56 C44 56 52 52 52 42 C52 32 46 22 40 16 Z" {W} {D} stroke-width="2"/>
<rect x="22" y="10" width="20" height="8" rx="3" fill="#ffffff" fill-opacity="0.8"/>
<circle cx="28" cy="38" r="2" fill="#1f2d3a" fill-opacity="0.25"/>
<circle cx="36" cy="44" r="2" fill="#1f2d3a" fill-opacity="0.25"/>
<circle cx="33" cy="33" r="2" fill="#1f2d3a" fill-opacity="0.25"/>'''

icons['supply-11'] = f'''<rect x="26" y="8" width="12" height="8" rx="2" {W}/>
<ellipse cx="32" cy="38" rx="17" ry="19" {W} {D} stroke-width="2"/>
<path d="M15 32 H49" stroke="#c0392b" stroke-opacity="0.4" stroke-width="5"/>
<circle cx="32" cy="14" r="3" {HL}/>'''

for name, body in icons.items():
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + body + '</svg>'
    io.open('asset/icons/' + name + '.svg', 'w', encoding='utf-8').write(svg)
print('icons:', len(icons))

bg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 660">
<path d="M0 430 C160 380 300 400 460 360 C620 320 760 380 920 350 C1080 320 1180 360 1280 340 V660 H0 Z" fill="#e6edf5"/>
<path d="M0 520 C200 470 380 500 560 470 C760 438 940 490 1120 455 C1180 445 1240 452 1280 448 V660 H0 Z" fill="#dde7f1"/>
<g fill="#d3dfea">
<rect x="120" y="300" width="70" height="90"/><path d="M115 300 L155 262 L195 300 Z"/>
<rect x="210" y="330" width="46" height="60"/><rect x="1050" y="310" width="60" height="80"/><path d="M1044 310 L1080 274 L1116 310 Z"/>
<rect x="1130" y="340" width="44" height="50"/>
</g>
<g fill="#c9d7e6">
<rect x="560" y="250" width="24" height="150"/><path d="M552 250 L572 222 L592 250 Z"/>
<rect x="620" y="270" width="100" height="130"/>
<rect x="740" y="255" width="24" height="145"/><path d="M732 255 L752 227 L772 255 Z"/>
<rect x="590" y="330" width="160" height="60"/>
</g>
<g fill="#ffffff" fill-opacity="0.75">
<ellipse cx="220" cy="120" rx="70" ry="22"/><ellipse cx="270" cy="105" rx="50" ry="18"/>
<ellipse cx="980" cy="90" rx="80" ry="24"/><ellipse cx="1040" cy="76" rx="55" ry="18"/>
</g>
<circle cx="1160" cy="110" r="42" fill="#fff3c4" fill-opacity="0.8"/>
</svg>'''
io.open('asset/icons/scene-bg.svg', 'w', encoding='utf-8').write(bg)

pit = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="32" fill="#8e44ad"/>
<circle cx="32" cy="30" r="21" fill="#f7f3ff" fill-opacity="0.14"/>
<path d="M14 38 C14 52 22 60 32 60 C42 60 50 52 50 38 C44 46 20 46 14 38 Z" fill="#ffffff"/>
<path d="M28 44 C30 50 34 50 36 44 C34 46 30 46 28 44 Z" fill="#8e44ad"/>
<circle cx="24" cy="28" r="7" fill="none" stroke="#ffffff" stroke-width="2.6"/>
<circle cx="40" cy="28" r="7" fill="none" stroke="#ffffff" stroke-width="2.6"/>
<line x1="31" y1="28" x2="33" y2="28" stroke="#ffffff" stroke-width="2.6"/>
<circle cx="24" cy="28" r="2.6" fill="#2c3e50"/><circle cx="40" cy="28" r="2.6" fill="#2c3e50"/>
<path d="M20 16 C26 10 38 10 44 16" stroke="#ffe9a0" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>'''
io.open('asset/icons/avatar-pit.svg', 'w', encoding='utf-8').write(pit)

king = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="32" fill="#7a1f18"/>
<path d="M16 20 L20 8 L26 16 L32 4 L38 16 L44 8 L48 20 Z" fill="#ffd54f"/>
<rect x="16" y="19" width="32" height="5" rx="2" fill="#e6b800"/>
<path d="M14 34 C14 26 50 26 50 34 C50 48 42 58 32 58 C22 58 14 48 14 34 Z" fill="#952a20"/>
<path d="M20 36 L30 40 L20 42 Z" fill="#ffffff"/>
<path d="M44 36 L34 40 L44 42 Z" fill="#ffffff"/>
<circle cx="25" cy="37" r="2.2" fill="#2c0500"/><circle cx="39" cy="37" r="2.2" fill="#2c0500"/>
<path d="M24 50 C28 46 36 46 40 50" stroke="#ffd54f" stroke-width="2.5" fill="none"/>
</svg>'''
io.open('asset/icons/avatar-king.svg', 'w', encoding='utf-8').write(king)

skyline = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 130" preserveAspectRatio="none">
<g fill="#2e86ab" fill-opacity="0.14">
<path d="M0 130 V96 H30 V80 H50 V96 H70 V70 L85 52 L100 70 V96 H150 V84 H190 V96 H240 V78 L260 58 L280 78 V96 H340 V88 H390 V60 L410 40 L430 60 V88 H500 V96 H560 V74 L585 50 L610 74 V96 H680 V86 H730 V96 H800 V66 L825 44 L850 66 V96 H920 V84 H970 V96 H1040 V72 L1060 52 L1080 72 V96 H1140 V88 H1190 V96 H1240 V80 H1280 V130 Z"/>
</g>
<g fill="#2e86ab" fill-opacity="0.20">
<path d="M405 40 V18 L410 12 L415 18 V40 Z"/><path d="M580 50 V30 L585 24 L590 30 V50 Z"/><path d="M820 44 V26 L825 20 L830 26 V44 Z"/>
</g>
</svg>'''
io.open('asset/icons/skyline.svg', 'w', encoding='utf-8').write(skyline)
print('全部SVG生成完成:', sorted(os.listdir('asset/icons')))
