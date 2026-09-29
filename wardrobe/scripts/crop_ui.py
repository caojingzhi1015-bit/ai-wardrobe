# -*- coding: utf-8 -*-
"""裁剪版商品图：不做透明抠图，只截掉截图里不必要的 UI / 文字，尽量只留衣服形态。

思路（全程程序化，不重绘任何像素）：
1) 用已有的抠图 alpha（tmp/matte-out/final/*.png）定位「主体」= 衣服（+模特）所在区域
2) 取 alpha 最大连通域的包围盒 → 这就是衣服形态的范围
3) 用这个框去裁【原图】（tmp/matte-src/*.png，无损源），输出 JPG
   ——裁掉的自然就是截图顶部状态栏、底部「查看同款」、侧边悬浮按钮、价格条等 UI 文字

分级策略：
- 主体清晰（连通域填充率够、占比够）→ 紧裁，只留衣服
- 背景杂乱导致 alpha 不可靠 → 退化成温和裁剪，只切掉上下边缘条带（商品信息常在那儿），保留完整画面

输出：app/data/items/{slug}.jpg（长边 900）+ app/data/thumbs/{slug}.jpg（长边 360）
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE, "tmp", "matte-src")          # 无损原图
ALPHA_DIR = os.path.join(BASE, "tmp", "matte-out", "final")  # 抠图 alpha（仅用于定位）
APP_DATA = os.path.join(os.path.dirname(BASE), "app", "data")

ALPHA_T = 127
MIN_AREA_FRAC = 0.05     # 主体连通域至少占全图 5%，否则认为不可靠
MIN_FILL = 0.35          # 包围盒内 alpha 填充率，太低说明主体散乱（背景杂乱）
PAD_TIGHT = 0.02         # 紧裁外扩
EDGE_TRIM_TOP = 0.10     # 温和裁剪：顶部切掉（状态栏/标题/店铺名）
EDGE_TRIM_BOTTOM = 0.16  # 温和裁剪：底部切掉（价格、查看同款、导航条）
EDGE_TRIM_SIDE = 0.04


def largest_component(mask):
    """返回最大连通域的布尔掩膜（4 邻域，迭代实现避免递归爆栈）"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = None
    best_n = 0
    for y, x in np.argwhere(mask):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        comp = []
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(comp) > best_n:
            best_n = len(comp)
            best = comp
    if best is None:
        return None, 0
    ys = np.array([p[0] for p in best])
    xs = np.array([p[1] for p in best])
    out = np.zeros_like(mask, dtype=bool)
    out[ys, xs] = True
    return out, best_n


def bbox_of(comp):
    ys, xs = np.where(comp)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    slugs = [s for s in args.slugs.split(",") if s]
    if not slugs:
        slugs = sorted(f[:-4] for f in os.listdir(SRC_DIR) if f.endswith(".png"))

    if not args.dry:
        for sub in ("items", "thumbs"):
            os.makedirs(os.path.join(APP_DATA, sub), exist_ok=True)

    report = {}
    for i, slug in enumerate(slugs, 1):
        src_p = os.path.join(SRC_DIR, slug + ".png")
        al_p = os.path.join(ALPHA_DIR, slug + ".png")
        if not os.path.exists(src_p):
            print("MISS-SRC", slug)
            continue
        img = Image.open(src_p).convert("RGB")
        W, H = img.size

        box = None
        mode = "keep"
        if os.path.exists(al_p):
            a = np.asarray(Image.open(al_p).convert("RGBA").getchannel("A"))
            if a.shape[0] == H and a.shape[1] == W:
                mask = a >= ALPHA_T
                comp, n = largest_component(mask)
                if comp is not None:
                    frac = float(n) / float(mask.size)
                    x0, y0, x1, y1 = bbox_of(comp)
                    bw, bh = x1 - x0, y1 - y0
                    fill = float(comp[y0:y1, x0:x1].sum()) / float(bw * bh)
                    if frac >= MIN_AREA_FRAC and fill >= MIN_FILL:
                        px = int(max(bw, bh) * PAD_TIGHT)
                        box = (max(0, x0 - px), max(0, y0 - px),
                               min(W, x1 + px), min(H, y1 + px))
                        mode = "tight"
                    else:
                        mode = "edge"
                else:
                    mode = "edge"
            else:
                mode = "edge"
        else:
            mode = "edge"

        if mode == "edge":
            # 温和裁剪：只切掉上下边缘的商品信息带
            box = (int(W * EDGE_TRIM_SIDE), int(H * EDGE_TRIM_TOP),
                   int(W * (1 - EDGE_TRIM_SIDE)), int(H * (1 - EDGE_TRIM_BOTTOM)))

        crop = img.crop(box)
        cw, ch = crop.size
        report[slug] = {
            "mode": mode, "src": [W, H], "box": list(box), "crop": [cw, ch],
            "trimmed": round(1.0 - float(cw * ch) / float(W * H), 3),
        }
        print("[%02d/%d] %-38s %-5s %sx%s -> %sx%s (裁掉 %.0f%%)"
              % (i, len(slugs), slug, mode, W, H, cw, ch, report[slug]["trimmed"] * 100))

        if args.dry:
            continue

        def save(long_edge):
            im = crop
            s = long_edge / float(max(im.size))
            if s < 1:
                im = im.resize((int(im.size[0] * s), int(im.size[1] * s)), Image.LANCZOS)
            return im
        save(900).save(os.path.join(APP_DATA, "items", slug + ".jpg"), "JPEG", quality=92, optimize=True)
        save(360).save(os.path.join(APP_DATA, "thumbs", slug + ".jpg"), "JPEG", quality=88, optimize=True)

    with open(os.path.join(BASE, "tmp", "crop-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    tight = sum(1 for v in report.values() if v["mode"] == "tight")
    print("done", len(report), "| 紧裁", tight, "| 温和", len(report) - tight)


if __name__ == "__main__":
    main()
