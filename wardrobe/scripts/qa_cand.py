# -*- coding: utf-8 -*-
"""单图多引擎候选对比表：一行一个引擎，挑最好的。"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND = os.path.join(BASE, "tmp", "matte-out", "cand")
OUT = os.path.join(BASE, "tmp", "qa-cand.jpg")
BG = (245, 243, 240)
FONT = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 13)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", required=True)
    ap.add_argument("--cell", type=int, default=250)
    args = ap.parse_args()
    slugs = [s for s in args.names.split(",") if s]
    cell = args.cell
    maxn = max(len([f for f in os.listdir(CAND) if f.endswith("__" + s + ".png")]) for s in slugs)
    W = maxn * (cell + 8) + 30
    H = len(slugs) * (cell + 24) + 10
    sheet = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, slug in enumerate(slugs):
        y = 10 + i * (cell + 24)
        files = sorted(f for f in os.listdir(CAND) if f.endswith("__" + slug + ".png"))
        n = len(files)
        row = Image.new("RGB", (n * (cell + 8) + 10, cell), (255, 255, 255))
        for j, f in enumerate(files):
            eng = f.split("__")[0]
            im = Image.open(os.path.join(CAND, f)).convert("RGBA")
            tile = Image.new("RGBA", (cell, cell), BG + (255,))
            s = min(cell / im.size[0], cell / im.size[1], 1.0)
            tw, th = max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))
            tile.alpha_composite(im.resize((tw, th), Image.LANCZOS), ((cell - tw) // 2, (cell - th) // 2))
            row.paste(tile.convert("RGB"), (10 + j * (cell + 8), 0))
            dd = ImageDraw.Draw(row)
            dd.text((14 + j * (cell + 8), cell - 20), eng, fill=(120, 30, 30), font=FONT)
        sheet.paste(row, (10, y))
        d.text((12, y + cell + 2), slug, fill=(23, 32, 51), font=FONT)
    sheet.save(OUT, "JPEG", quality=88)
    print("->", OUT, sheet.size)


if __name__ == "__main__":
    main()
