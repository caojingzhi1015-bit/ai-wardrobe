# -*- coding: utf-8 -*-
"""抠图质检用三联图：原图 | 去背后铺 #F5F3F0 | 去背后铺中灰（看毛边）。"""
import argparse
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE, "tmp", "matte-src")
PREVIEW = os.path.join(BASE, "tmp", "matte-preview")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="cloth")
    ap.add_argument("--slugs", default="")
    ap.add_argument("--width", type=int, default=560)
    args = ap.parse_args()

    out_dir = os.path.join(BASE, "tmp", "matte-out", args.tag)
    os.makedirs(PREVIEW, exist_ok=True)
    slugs = [s for s in args.slugs.split(",") if s] or sorted(
        f[:-4] for f in os.listdir(out_dir) if f.endswith(".png"))[:6]

    for slug in slugs:
        src = Image.open(os.path.join(SRC_DIR, slug + ".png")).convert("RGB")
        cut = Image.open(os.path.join(out_dir, slug + ".png")).convert("RGBA")
        w = args.width
        def fit(im):
            s = w / im.size[0]
            return im.resize((w, max(1, int(im.size[1] * s))), Image.LANCZOS)
        a = fit(src)
        b = fit(cut)
        g = fit(cut)
        bg1 = Image.new("RGB", b.size, (0xF5, 0xF3, 0xF0))
        bg1.paste(b, (0, 0), b)
        bg2 = Image.new("RGB", g.size, (0x80, 0x80, 0x80))
        bg2.paste(g, (0, 0), g)
        H = max(a.size[1], bg1.size[1])
        canvas = Image.new("RGB", (w * 3 + 24, H), (255, 255, 255))
        canvas.paste(a, (0, 0))
        canvas.paste(bg1, (w + 12, 0))
        canvas.paste(bg2, (w * 2 + 24, 0))
        p = os.path.join(PREVIEW, slug + ".jpg")
        canvas.save(p, "JPEG", quality=88)
        print(slug, "->", p)


if __name__ == "__main__":
    main()
