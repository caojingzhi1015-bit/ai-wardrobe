# -*- coding: utf-8 -*-
"""把 final/*.png 拼成 QA 联络表：每行 N 张，铺在 #F5F3F0 展示底上，标 id + cover。
用来一眼扫完 44 张，快速发现「还有模特 / 抠缺 / 残留 UI」的图。"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINAL = os.path.join(BASE, "tmp", "matte-out", "final")
OUT = os.path.join(BASE, "tmp", "qa-sheet.jpg")
BG = (245, 243, 240)  # #F5F3F0 略暖灰白展示底

font_path = None
for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc"):
    if os.path.exists(p):
        font_path = p
        break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--cell", type=int, default=230)
    ap.add_argument("--names", default="")
    args = ap.parse_args()

    slugs = [s for s in args.names.split(",") if s]
    if not slugs:
        slugs = sorted(f[:-4] for f in os.listdir(FINAL) if f.endswith(".png"))

    cols, cell = args.cols, args.cell
    rows = (len(slugs) + cols - 1) // cols
    pad = 10
    label = 22
    cw, ch = cell, cell + label
    sheet = Image.new("RGB", (cols * cw + pad, rows * ch + pad), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    font = None
    if font_path:
        from PIL import ImageFont
        font = ImageFont.truetype(font_path, 12)

    for i, slug in enumerate(slugs):
        src = Image.open(os.path.join(FINAL, slug + ".png")).convert("RGBA")
        # 等比缩放到 cell 内（不拉伸）
        s = min((cell - 12) / src.size[0], (cell - 12) / src.size[1], 1.0)
        tw, th = max(1, int(src.size[0] * s)), max(1, int(src.size[1] * s))
        im = src.resize((tw, th), Image.LANCZOS)
        tile = Image.new("RGBA", (cell, cell), BG + (255,))
        tile.alpha_composite(im, ((cell - tw) // 2, (cell - th) // 2))
        gx, gy = pad + (i % cols) * cw, pad + (i // cols) * ch
        sheet.paste(tile.convert("RGB"), (gx, gy))
        # 四角透明度是否干净
        a = np.asarray(src.getchannel("A"))
        h, w = a.shape
        k = max(2, int(min(h, w) * 0.03))
        corners = int(a[:k, :k].mean() + a[:k, -k:].mean() + a[-k:, :k].mean() + a[-k:, -k:].mean())
        cov = float((a >= 127).sum()) / a.size
        txt = "%s  c%.2f %s" % (slug[:26], cov, "" if corners == 0 else "角%d!" % corners)
        d.text((gx + 4, gy + cell + 4), txt, fill=(23, 32, 51), font=font)

    sheet.save(OUT, "JPEG", quality=88)
    print("QA sheet ->", OUT, sheet.size, "| %d 张" % len(slugs))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
