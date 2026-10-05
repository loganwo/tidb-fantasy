# -*- coding: utf-8 -*-
"""纯 PIL 敌人 sprite 抠图（不依赖 numpy/scipy）。

方法：从图像四边做泛洪（flood fill），把"与边角背景色接近且连通到边缘"的区域
置为透明。只删除连通到边缘的背景，内部人物绝不会被误删。最后裁边 + 缩放到 max_side。

用法：python process_foe_simple.py <src.png> <out.png> [max_side]
"""
from PIL import Image
import sys, os, math

MAX_SIDE = int(sys.argv[3]) if len(sys.argv) > 3 else 320


def corner_color(im, pad=6):
    px = im.load()
    w, h = im.size
    pts = []
    for (cx, cy) in [(pad, pad), (w - 1 - pad, pad),
                     (pad, h - 1 - pad), (w - 1 - pad, h - 1 - pad)]:
        for dx in range(-pad, pad + 1):
            for dy in range(-pad, pad + 1):
                pts.append(px[cx + dx, cy + dy][:3])
    pts.sort()
    return pts[len(pts) // 2]  # 中值，抗噪点


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def remove_bg(im, tol=46):
    w, h = im.size
    px = im.load()
    bg = corner_color(im)
    alpha = bytearray(w * h)  # 0=背景待删 1=保留
    # 先标记所有"明显不是背景"的像素为保留，避免泛洪穿过它们
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if alpha[y * w + x] == 0 and dist(px[x, y][:3], bg) < tol:
                stack.append((x, y)); alpha[y * w + x] = 2
    for y in range(h):
        for x in (0, w - 1):
            if alpha[y * w + x] == 0 and dist(px[x, y][:3], bg) < tol:
                stack.append((x, y)); alpha[y * w + x] = 2
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and alpha[ny * w + nx] == 0:
                if dist(px[nx, ny][:3], bg) < tol:
                    alpha[ny * w + nx] = 2
                    stack.append((nx, ny))
    # 转成 alpha 通道：背景=0，前景=255
    out = im.convert("RGBA")
    opx = out.load()
    removed = 0
    for i in range(w * h):
        if alpha[i] == 2:
            opx[i % w, i // w] = (opx[i % w, i // w][0], opx[i % w, i // w][1],
                                  opx[i % w, i // w][2], 0)
            removed += 1
    return out, removed / (w * h)


def crop_ground_shadow(im, gray_std=30, max_rows=90, min_gray_ratio=0.6):
    """切除图片底部的灰色地面阴影/倒影（生成图常自带）。

    从底部向上扫描行，把连续的低饱和度（≈灰色）阴影带直接裁掉。
    游戏本身会用代码画脚底椭圆阴影，素材不需要自带地面投影。
    """
    w, h = im.size
    px = im.load()
    new_bottom = h
    for dy in range(max_rows):
        y = h - 1 - dy
        if y < 0:
            break
        R = G = B = A = gray = n = 0
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                R += r; G += g; B += b; A += a; n += 1
                m = (r + g + b) / 3.0
                std = math.sqrt(((r - m) ** 2 + (g - m) ** 2 + (b - m) ** 2) / 3)
                if std < gray_std:
                    gray += 1
        if n == 0:
            continue
        avg_a = A / n
        gray_ratio = gray / n
        # 阴影行：灰色为主、且不是特别实心；一旦遇到非阴影行就停
        if gray_ratio >= min_gray_ratio and avg_a < 240:
            new_bottom = y
        else:
            break
    if new_bottom >= h:
        return im, 0
    # 留 2px 过渡再裁切
    crop_y = min(h, new_bottom + 2)
    return im.crop((0, 0, w, crop_y)), h - crop_y


def feather(im, bg_tol_extra=22, edge=1):
    """对前景边缘做 1px 半透明羽化，抠边更自然。"""
    w, h = im.size
    px = im.load()
    bg = corner_color(im)
    new = im.copy()
    npx = new.load()
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            if a > 0:  # 前景
                # 若某邻域像素是背景，说明这是边缘
                is_edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        is_edge = True
                        break
                if is_edge:
                    npx[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 150)
    return new


def process(src, dst):
    im = Image.open(src).convert("RGBA")
    out, ratio = remove_bg(im)
    out = feather(out)
    # 裁边到不透明包围盒 + 8px 余量
    bbox = out.split()[-1].getbbox()
    if bbox:
        l, t, r, b = bbox
        out = out.crop((max(0, l - 8), max(0, t - 8), min(out.width, r + 8), min(out.height, b + 8)))
    if max(out.size) > MAX_SIDE:
        sc = MAX_SIDE / max(out.size)
        out = out.resize((round(out.width * sc), round(out.height * sc)), Image.LANCZOS)
    # 缩放后底部常出现羽化/半透明灰边（来自原图地面阴影），最后切掉
    out, crop_rows = crop_ground_shadow(out, max_rows=60)
    out.save(dst)
    hist = out.split()[-1].histogram()
    op = float(sum(hist[129:]))
    print(f"{os.path.basename(dst)} {out.size} 删背景={ratio*100:.1f}% 去阴影切行={crop_rows} 不透明像素={op:.0f} ({100*op/(out.size[0]*out.size[1]):.1f}%)")


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    process(src, dst)
