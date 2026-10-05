# -*- coding: utf-8 -*-
"""Kenney 素材重转：P 调色板 -> RGB 白底（修复 border-image 兼容性）"""
import os
from PIL import Image

BASE = os.path.join(os.environ.get('TEMP', r'C:\Users\acer\AppData\Local\Temp'), 'kenney_ui', 'PNG')
DST = os.path.join('asset', 'ui')
os.makedirs(DST, exist_ok=True)

def flatten(src, dst):
    im = Image.open(src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').save(dst)
    print(os.path.basename(dst), im.size)

for c in ['Blue', 'Red', 'Green', 'Grey', 'Yellow']:
    flatten(os.path.join(BASE, c, 'Default', 'button_rectangle_depth_gloss.png'),
            os.path.join(DST, 'btn-%s.png' % c))
for f in ['star', 'star-outline']:
    flatten(os.path.join(BASE, 'Blue', 'Default', f + '.png'),
            os.path.join(DST, f + '.png'))
print('done')
