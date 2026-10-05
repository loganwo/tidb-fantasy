# -*- coding: utf-8 -*-
"""手绘 4 张城区城门矢量插画（竖版水印用，扁平插画风）
gate-0 内城宫门 / gate-1 东城市坊 / gate-2 西城山关 / gate-3 南城水门
"""
import io, os

OUT = 'asset/gates'
os.makedirs(OUT, exist_ok=True)

SKY_TOP, SKY_BOT = '#eaf3fa', '#f8fbfd'
INK = '#1f2d3a'

def svg(body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 616">'
            f'<defs>{defs}</defs>{body}</svg>')

DEFS_SKY = (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{SKY_TOP}"/><stop offset="1" stop-color="{SKY_BOT}"/></linearGradient>')

CLOUDS = ('<g fill="#ffffff" fill-opacity="0.85">'
          '<ellipse cx="52" cy="86" rx="34" ry="11"/><ellipse cx="78" cy="78" rx="24" ry="9"/>'
          '<ellipse cx="232" cy="120" rx="30" ry="10"/><ellipse cx="252" cy="112" rx="20" ry="8"/></g>')

BIRDS = ('<g stroke="#9db4c6" stroke-width="2" fill="none" stroke-linecap="round">'
         '<path d="M96 66 q6 -5 12 0 q6 -5 12 0"/><path d="M190 52 q5 -4 10 0 q5 -4 10 0"/></g>')

# ============ gate-0 内城 · 宫门（红墙金顶） ============
gate0 = f'''<rect width="280" height="616" fill="url(#sky)"/>
<path d="M0 300 C50 270 110 282 160 262 C210 244 250 256 280 244 V616 H0 Z" fill="#dde8f1"/>
{CLOUDS}{BIRDS}
<path d="M0 400 H96 V330 M184 330 V400 H280 V616 H0 Z" fill="#d9a49a"/>
<path d="M0 400 H96 V330 H184 V400 H280" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<path d="M0 372 H92 M188 372 H280" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4"/>
<rect x="58" y="316" width="164" height="130" fill="#cf5648"/>
<rect x="58" y="316" width="164" height="130" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<path d="M70 330 h140 M70 352 h140 M70 374 h140 M70 396 h140" stroke="#b8423a" stroke-width="3"/>
<path d="M58 446 H222 L234 470 H46 Z" fill="#e8e2d4"/>
<path d="M104 446 H176 V616 H104 Z" fill="#e8e2d4"/>
<path d="M96 446 L104 446 V616 H96 Z M176 446 L184 446 V616 H176 Z" fill="#d8d2c2"/>
<path d="M108 616 V480 C108 452 172 452 172 480 V616 Z" fill="#5a4638"/>
<path d="M112 616 V484 C112 460 168 460 168 484 V616 Z" fill="#3f322a"/>
<rect x="128" y="530" width="24" height="14" rx="3" fill="#c9a24b"/>
<rect x="40" y="196" width="200" height="122" fill="#cf5648"/>
<rect x="40" y="196" width="200" height="122" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<g fill="#b8423a"><rect x="52" y="206" width="10" height="102"/><rect x="86" y="206" width="10" height="102"/>
<rect x="124" y="206" width="10" height="102"/><rect x="162" y="206" width="10" height="102"/><rect x="196" y="206" width="10" height="102"/>
<rect x="218" y="206" width="10" height="102"/></g>
<path d="M28 200 C60 186 96 182 140 182 C184 182 220 186 252 200 L232 168 C196 158 84 158 48 168 Z" fill="#e6b84c"/>
<path d="M28 200 C60 186 96 182 140 182 C184 182 220 186 252 200" fill="none" stroke="#c9972f" stroke-width="4"/>
<path d="M52 190 C90 178 190 178 228 190" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="4"/>
<path d="M46 120 C84 108 196 108 234 120 L214 92 C186 84 94 84 66 92 Z" fill="#e6b84c"/>
<path d="M46 120 C84 108 196 108 234 120" fill="none" stroke="#c9972f" stroke-width="4"/>
<rect x="118" y="120" width="44" height="76" fill="#cf5648"/>
<path d="M118 120 h44 v8 h-44 Z" fill="#b8423a"/>
<rect x="130" y="134" width="20" height="26" rx="2" fill="#e8e2d4"/>
<g stroke="#c9972f" stroke-width="3"><line x1="64" y1="96" x2="46" y2="112"/><line x1="216" y1="96" x2="234" y2="112"/></g>
<g><line x1="34" y1="240" x2="34" y2="180" stroke="#8a6a3a" stroke-width="4"/><path d="M36 182 L62 190 L36 200 Z" fill="#d05a4e"/></g>
<g><line x1="246" y1="240" x2="246" y2="180" stroke="#8a6a3a" stroke-width="4"/><path d="M218 190 L244 182 L244 200 Z" fill="#d05a4e"/></g>
<path d="M0 500 C70 486 210 486 280 500 V616 H0 Z" fill="#e9eef4"/>
<path d="M40 560 h200 M60 588 h160" stroke="#d8dee6" stroke-width="4"/>
<circle cx="30" cy="470" r="16" fill="#8fbb8f"/><rect x="26" y="478" width="8" height="22" fill="#7ba36f"/>
<circle cx="250" cy="470" r="16" fill="#8fbb8f"/><rect x="246" y="478" width="8" height="22" fill="#7ba36f"/>'''

# ============ gate-1 东城 · 市坊（青瓦坊门+灯笼） ============
gate1 = f'''<rect width="280" height="616" fill="url(#sky)"/>
<path d="M0 320 C60 296 130 308 190 290 C230 278 260 286 280 280 V616 H0 Z" fill="#dfe9f1"/>
{CLOUDS}{BIRDS}
<circle cx="40" cy="300" r="20" fill="#8fbb8f"/><circle cx="62" cy="306" r="15" fill="#7ba36f"/>
<circle cx="244" cy="296" r="20" fill="#8fbb8f"/><circle cx="222" cy="304" r="15" fill="#7ba36f"/>
<rect x="46" y="330" width="188" height="150" fill="#cf5648"/>
<rect x="46" y="330" width="188" height="150" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<path d="M34 334 C70 320 210 320 246 334 L232 304 C196 294 84 294 48 304 Z" fill="#7fa6b8"/>
<path d="M34 334 C70 320 210 320 246 334" fill="none" stroke="#5f8a9c" stroke-width="4"/>
<path d="M48 306 C90 296 190 296 232 306" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4"/>
<g fill="#5f8a9c"><rect x="60" y="316" width="12" height="18"/><rect x="208" y="316" width="12" height="18"/></g>
<g fill="#b8423a"><rect x="66" y="340" width="12" height="130"/><rect x="202" y="340" width="12" height="130"/></g>
<rect x="112" y="352" width="56" height="20" rx="4" fill="#e6b84c"/>
<path d="M120 372 V440 C120 456 160 456 160 440 V372 Z" fill="#5a4638"/>
<path d="M126 372 V438 C126 450 154 450 154 438 V372 Z" fill="#3f322a"/>
<g><line x1="84" y1="350" x2="84" y2="392" stroke="#6b4f35" stroke-width="3"/>
<ellipse cx="84" cy="404" rx="11" ry="14" fill="#d05a4e"/><rect x="78" y="388" width="12" height="6" rx="2" fill="#c9972f"/>
<line x1="196" y1="350" x2="196" y2="392" stroke="#6b4f35" stroke-width="3"/>
<ellipse cx="196" cy="404" rx="11" ry="14" fill="#d05a4e"/><rect x="190" y="388" width="12" height="6" rx="2" fill="#c9972f"/></g>
<path d="M0 480 C70 468 210 468 280 480 V616 H0 Z" fill="#eceff3"/>
<path d="M60 520 h160 M80 552 h120 M100 580 h80" stroke="#d8dee6" stroke-width="4"/>
<g fill="#e6b84c"><path d="M30 470 l6 12 12 2 -9 9 2 13 -11 -6 -11 6 2 -13 -9 -9 12 -2 Z" fill-opacity="0.5"/></g>
<g fill="#c9542f"><path d="M244 466 l5 10 11 2 -8 8 2 12 -10 -5 -10 5 2 -12 -8 -8 11 -2 Z" fill-opacity="0.5"/></g>'''

# ============ gate-2 西城 · 山关（石砌关楼） ============
gate2 = f'''<rect width="280" height="616" fill="url(#sky)"/>
<path d="M0 260 L60 190 L120 268 L180 200 L240 262 L280 224 V616 H0 Z" fill="#c5d0da"/>
{CLOUDS}{BIRDS}
<path d="M0 340 L48 250 L96 336 L150 236 L210 330 L260 252 L280 300 V616 H0 Z" fill="#aebcc9"/>
<path d="M0 420 L40 330 L86 416 L140 316 L196 410 L246 336 L280 400 V616 H0 Z" fill="#93a3b4"/>
<g fill="#7e8fa2"><path d="M20 470 L48 400 L80 470 Z"/><path d="M210 480 L240 402 L272 480 Z"/><path d="M110 500 L136 434 L164 500 Z"/></g>
<rect x="70" y="300" width="140" height="180" fill="#8d99a8"/>
<rect x="70" y="300" width="140" height="180" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<path d="M80 318 h120 M80 340 h120 M80 362 h120 M80 384 h120 M80 406 h120 M80 428 h120 M80 450 h120" stroke="#77828f" stroke-width="3"/>
<path d="M116 480 V420 C116 396 164 396 164 420 V480 Z" fill="#2f3641"/>
<path d="M122 480 V424 C122 404 158 404 158 424 V480 Z" fill="#cfd8e0"/>
<path d="M60 268 H220 L212 244 H68 Z" fill="#6d7a8a"/>
<path d="M60 268 H220" stroke="#5d6a7a" stroke-width="3"/>
<g fill="#5d6a7a"><rect x="66" y="252" width="12" height="14"/><rect x="86" y="252" width="12" height="14"/><rect x="106" y="252" width="12" height="14"/><rect x="126" y="252" width="12" height="14"/><rect x="146" y="252" width="12" height="14"/><rect x="166" y="252" width="12" height="14"/><rect x="186" y="252" width="12" height="14"/><rect x="202" y="252" width="12" height="14"/></g>
<path d="M76 244 C96 234 184 234 204 244 L192 220 C170 212 110 212 88 220 Z" fill="#5f8a9c"/>
<path d="M76 244 C96 234 184 234 204 244" fill="none" stroke="#4d7282" stroke-width="3"/>
<rect x="118" y="160" width="44" height="60" fill="#8d99a8"/>
<path d="M112 160 L140 132 L168 160 Z" fill="#5f8a9c"/>
<rect x="132" y="176" width="16" height="18" fill="#3f4a56"/>
<g><line x1="94" y1="228" x2="94" y2="180" stroke="#6b4f35" stroke-width="3"/><path d="M96 182 L118 190 L96 198 Z" fill="#c9542f"/></g>
<g><line x1="186" y1="228" x2="186" y2="180" stroke="#6b4f35" stroke-width="3"/><path d="M184 190 L162 198 L184 198 Z" fill="#c9542f" transform="rotate(180 184 190)"/></g>
<path d="M0 480 C80 464 200 464 280 480 V616 H0 Z" fill="#dfe5ec"/>
<path d="M110 500 C120 540 160 560 140 616 M170 496 C160 530 130 560 150 616" stroke="#c8d0da" stroke-width="8" fill="none"/>
<path d="M120 508 C130 542 152 562 138 610 M162 504 C154 532 132 558 146 608" stroke="#e6ecf2" stroke-width="3" fill="none"/>'''

# ============ gate-3 南城 · 水门（水乡拱洞） ============
gate3 = f'''<rect width="280" height="616" fill="url(#sky)"/>
<path d="M0 300 C60 280 120 292 180 274 C220 262 256 270 280 264 V616 H0 Z" fill="#dfeaf2"/>
{CLOUDS}{BIRDS}
<rect x="30" y="300" width="220" height="140" fill="#b8c4ce"/>
<rect x="30" y="300" width="220" height="140" fill="none" stroke="{INK}" stroke-opacity="0.10" stroke-width="3"/>
<path d="M40 318 h200 M40 336 h200 M40 354 h200 M40 372 h200 M40 390 h200" stroke="#a6b2bd" stroke-width="3"/>
<path d="M96 440 V400 C96 356 184 356 184 400 V440 Z" fill="#43505c"/>
<path d="M104 440 V404 C104 366 176 366 176 404 V440 Z" fill="#dfeaf2"/>
<path d="M60 268 H220 L212 244 H68 Z" fill="#6d7a8a"/>
<g fill="#5d6a7a"><rect x="66" y="252" width="12" height="14"/><rect x="90" y="252" width="12" height="14"/><rect x="114" y="252" width="12" height="14"/><rect x="138" y="252" width="12" height="14"/><rect x="162" y="252" width="12" height="14"/><rect x="186" y="252" width="12" height="14"/><rect x="202" y="252" width="12" height="14"/></g>
<path d="M72 244 C100 232 180 232 208 244 L194 218 C168 210 112 210 86 218 Z" fill="#7fa6b8"/>
<path d="M72 244 C100 232 180 232 208 244" fill="none" stroke="#5f8a9c" stroke-width="3"/>
<rect x="118" y="176" width="44" height="44" fill="#b8c4ce"/>
<path d="M112 176 L140 150 L168 176 Z" fill="#7fa6b8"/>
<rect x="130" y="188" width="20" height="16" fill="#43505c"/>
<g><line x1="92" y1="232" x2="92" y2="184" stroke="#6b4f35" stroke-width="3"/><path d="M94 186 L116 194 L94 202 Z" fill="#d05a4e"/></g>
<g><line x1="188" y1="232" x2="188" y2="184" stroke="#6b4f35" stroke-width="3"/><path d="M186 194 L164 202 L186 202 Z" fill="#d05a4e" transform="rotate(180 186 194)"/></g>
<rect x="0" y="440" width="280" height="176" fill="#bcd8e8"/>
<g stroke="#a6cbd8" stroke-width="4" fill="none">
<path d="M20 470 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0"/>
<path d="M0 512 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0"/>
<path d="M40 556 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0"/>
<path d="M0 596 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0 q18 -8 36 0 q18 8 36 0"/></g>
<path d="M60 470 C86 428 194 428 220 470 L206 486 C186 452 94 452 74 486 Z" fill="#e6e2d4"/>
<path d="M74 486 C110 462 170 462 206 486" fill="none" stroke="#cfc9b6" stroke-width="3"/>
<g stroke="#cfc9b6" stroke-width="3"><line x1="88" y1="466" x2="82" y2="482"/><line x1="116" y1="456" x2="112" y2="474"/><line x1="140" y1="452" x2="140" y2="470"/><line x1="164" y1="456" x2="168" y2="474"/><line x1="192" y1="466" x2="198" y2="482"/></g>
<path d="M36 440 C30 400 46 392 44 372 M246 440 C252 402 238 394 240 374" stroke="#7ba36f" stroke-width="4" fill="none"/>
<g fill="#8fbb8f"><circle cx="42" cy="368" r="7"/><circle cx="38" cy="386" r="6"/><circle cx="46" cy="404" r="6"/>
<circle cx="241" cy="370" r="7"/><circle cx="245" cy="388" r="6"/><circle cx="237" cy="406" r="6"/></g>'''

for name, body in [('gate-0', gate0), ('gate-1', gate1), ('gate-2', gate2), ('gate-3', gate3)]:
    io.open(f'{OUT}/{name}.svg', 'w', encoding='utf-8').write(svg(body, DEFS_SKY))
print('4 张城门插画 SVG 生成完成')
