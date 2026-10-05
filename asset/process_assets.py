# -*- coding: utf-8 -*-
"""tidb-fantasy 素材处理：
   1) 6 张城门：等比缩放沉底 + 顶部补白渐隐 -> 800x1400 JPG
   2) 2 个敌人 sprite：烘焙棋盘格 -> 真透明 RGBA PNG
"""
from PIL import Image
import numpy as np
from scipy import ndimage
import os

ROOT = 'C:/Users/acer/ZCodeProject/tidb-fantasy/asset'
GEN = ROOT + '/gen'
OUT_W, OUT_H = 800, 1400

GATES = [
    (GEN + '/gA/Soft_flat_2D_game_illustration_2026-10-04T16-48-27.png', 'gate-0'),   # 内城宫门
    (GEN + '/foe/Soft_flat_2D_game_illustration_2026-10-04T16-46-41.png', 'gate-1'),  # 东城市坊
    (GEN + '/Soft_flat_2D_game_illustration_2026-10-04T16-46-04.png', 'gate-2'),      # 西城山关
    (GEN + '/gB/Soft_flat_2D_game_illustration_2026-10-04T16-48-46.png', 'gate-3'),   # 南城水门
    (GEN + '/Soft_flat_2D_game_illustration_2026-10-04T16-46-06.png', 'gate-4'),      # 北城箭楼
    (GEN + '/foe/Soft_flat_2D_game_illustration_2026-10-04T16-46-48.png', 'gate-5'),  # 新城奠基
]
FOES = [
    (GEN + '/foe/2D_game_unit_sprite__chibi_Q_v_2026-10-04T16-46-51.png', 'foe.png'),   # 行军武卒
    (GEN + '/foe/2D_game_unit_sprite__chibi_Q_v_2026-10-04T16-46-54.png', 'foe2.png'),  # 攻城重甲
]


# ---------------- 城门 ----------------
def proc_gate(src, name):
    im = Image.open(src).convert('RGB')
    w = OUT_W
    h = round(w * im.height / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGB', (OUT_W, OUT_H), (255, 255, 255))
    canvas.paste(im, (0, OUT_H - h))          # 城楼沉底
    a = np.asarray(canvas).astype(float)
    # 顶部渐隐到纯白（前 22% 高度线性过渡）
    fade_px = int(OUT_H * 0.22)
    ramp = np.clip(np.arange(fade_px) / fade_px, 0, 1)[:, None, None]
    a[:fade_px] = a[:fade_px] * ramp + 255.0 * (1 - ramp)
    out = Image.fromarray(a.astype(np.uint8))
    p = f'{ROOT}/gates/{name}.jpg'
    out.save(p, quality=86, optimize=True)
    top = a[:int(OUT_H * 0.12)].mean()
    print(f'{name}.jpg', out.size,
          round(os.path.getsize(p) / 1024), 'KB  顶部亮度=%.1f' % top)


# ---------------- 敌人 sprite（棋盘格 -> alpha） ----------------
def frame_clusters(arr, frac=0.93):
    h, w, _ = arr.shape
    f = 16
    frame = np.concatenate([arr[:f].reshape(-1, 3), arr[-f:].reshape(-1, 3),
                            arr[:, :f].reshape(-1, 3), arr[:, -f:].reshape(-1, 3)])
    q = frame // 24
    colors, counts = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-counts)
    tot = counts.sum()
    acc, cents = 0, []
    for i in order:
        acc += counts[i]
        cents.append(colors[i].astype(float) * 24 + 12)
        if acc / tot > frac:
            break
    return np.array(cents)


def periodic_iou(mask):
    best = 0.0
    if mask.sum() == 0:
        return 0.0
    for s in (16, 24, 32, 40, 48, 56, 64, 80, 96, 128):
        for dy, dx in ((0, s), (s, 0), (s, s)):
            m2 = np.roll(np.roll(mask, dy, 0), dx, 1)
            union = (mask | m2).sum()
            if union:
                best = max(best, (mask & m2).sum() / union)
    return best


def proc_foe(src, name, max_side=320):
    im = Image.open(src).convert('RGB')
    arr = np.asarray(im).astype(float)
    h, w, _ = arr.shape
    cents = frame_clusters(arr)
    d = np.min(np.linalg.norm(arr[..., None, :] - cents[None, None, :, :], axis=3), axis=2)
    sat = arr.max(2) - arr.min(2)
    fam = (d < 40.0) & (sat < 48)

    lab, n = ndimage.label(fam)
    frame_lab = set(np.unique(np.concatenate([lab[:8].ravel(), lab[-8:].ravel(),
                                              lab[:, :8].ravel(), lab[:, -8:].ravel()])))
    frame_lab.discard(0)
    sizes = ndimage.sum_labels(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    remove = np.zeros((h, w), bool)
    for i in range(1, n + 1):
        if i in frame_lab or sizes[i - 1] < 24:
            remove |= lab == i
        elif sizes[i - 1] >= 150:
            comp = lab == i
            px = arr[comp]
            near = np.linalg.norm(px[:, None, :] - cents[None, :, :], axis=2) < 30
            cover = near.mean(0)
            two_tone = np.sort(cover)[-2:].sum() >= 0.60 and np.sort(cover)[-2] >= 0.12
            if two_tone and periodic_iou(comp) > 0.45:
                remove |= comp

    alpha = np.where(remove, 0.0, np.clip((d - 12) / 32.0, 0, 1))
    for _ in range(2):   # 针孔填补
        op = alpha > 0.5
        filled = op.copy()
        filled[1:-1, 1:-1] |= (op[:-2, 1:-1] & op[2:, 1:-1] & op[1:-1, :-2] & op[1:-1, 2:])
        alpha = np.where(filled, 1.0, alpha)

    nearest = np.argmin(np.linalg.norm(arr[..., None, :] - cents[None, None, :, :], axis=3), axis=2)
    cbg = cents[nearest]
    af = alpha[..., None]
    band = (alpha > 0.02) & (alpha < 0.995)
    un = (arr - cbg * (1 - af)) / np.maximum(af, 1e-3)
    arr_out = np.clip(np.where(band[..., None], un, arr), 0, 255)

    rgba = np.dstack([arr_out, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    bbox = Image.fromarray((alpha * 255).astype(np.uint8)).getbbox()
    if bbox:
        l, t, r, b = bbox
        img = img.crop((max(0, l - 8), max(0, t - 8), min(w, r + 8), min(h, b + 8)))
    if max(img.size) > max_side:
        sc = max_side / max(img.size)
        img = img.resize((round(img.width * sc), round(img.height * sc)), Image.LANCZOS)
    # 水印：右下角浅色像素清 alpha
    ar = np.asarray(img).copy()
    yy, xx = int(ar.shape[0] * 0.92), int(ar.shape[1] * 0.55)
    reg = ar[yy:, xx:]
    reg[..., 3] = np.where(reg[..., :3].min(axis=2) > 150, 0, reg[..., 3])
    ar[yy:, xx:] = reg
    img = Image.fromarray(ar, 'RGBA')
    p = f'{ROOT}/{name}'
    img.save(p)
    arr2 = np.asarray(img)
    op_ratio = float((arr2[..., 3] > 128).mean())
    print(name, img.size, round(os.path.getsize(p) / 1024), 'KB  不透明像素占比=%.2f' % op_ratio)


for src, name in GATES:
    proc_gate(src, name)
print('---')
for src, name in FOES:
    proc_foe(src, name)
print('DONE')
