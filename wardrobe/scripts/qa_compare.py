# -*- coding: utf-8 -*-
"""对照表：左原图（缩小）右抠图结果，同一行对比，快速定位抠坏的图。"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "tmp", "matte-src")
FINAL = os.path.join(BASE, "tmp", "matte-out", "final")
OUT = os.path.join(BASE, "tmp", "qa-compare.jpg")
BG = (245, 243, 240)

FONT = None
for p in (r"C:\Windows\Fonts\msyh.ttc",):
    if os.path.exists(p):
        FONT = ImageFont.truetype(p, 13)
        break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", required=True)
    ap.add_argument("--cell", type=int, default=300)
    args = ap.parse_args()
    slugs = [s for s in args.names.split(",") if s]
    cell = args.cell
    W = 2 * cell + 30
    H = len(slugs) * (cell + 24) + 10
    sheet = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, slug in enumerate(slugs):
        y = 10 + i * (cell + 24)
        src = Image.open(os.path.join(SRC, slug + ".png")).convert("RGB")
        fin = Image.open(os.path.join(FINAL, slug + ".png")).convert("RGBA")
        for j, im in enumerate((src.convert("RGBA"), fin)):
            tile = Image.new("RGBA", (cell, cell), BG + (255,))
            s = min(cell / im.size[0], cell / im.size[1], 1.0)
            tw, th = max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))
            r = im.resize((tw, th), Image.LANCZOS)
            tile.alpha_composite(r, ((cell - tw) // 2, (cell - th) // 2))
            sheet.paste(tile.convert("RGB"), (10 + j * (cell + 10), y))
        d.text((12, y + cell + 3), "%d  %s   (左原图 / 右抠图)" % (i + 1, slug), fill=(23, 32, 51), font=FONT)
    sheet.save(OUT, "JPEG", quality=85)
    print("->", OUT, sheet.size, len(slugs), "行")


if __name__ == "__main__":
    main()
