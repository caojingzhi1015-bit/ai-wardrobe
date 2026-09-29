# -*- coding: utf-8 -*-
"""把现有衣橱数据 + 风格参考图打包成 app/data/，让网站开箱即用（用户无需手动导入）。

输出结构（与「导出全部 zip」一致，方便互相替换）：
  app/data/library.json
  app/data/style-profile.json
  app/data/items/{slug}.jpg      长边 900，q78
  app/data/thumbs/{slug}.jpg     长边 360，q72  （卡片用，先加载这个）
  app/data/inspo/{n}.jpg         长边 700，q78  （目标风格板的参考图）
  app/data/inspo.json            [{file, caption, tags}]
"""
import json
import os
import re

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))       # wardrobe/
APP = os.path.join(os.path.dirname(BASE), "app")
DATA = os.path.join(APP, "data")
CROPS = os.path.join(BASE, "tmp", "batch2-crops")
INSPO_SRC = os.path.join(BASE, "outfits", "inspo")


def save_scaled(src, dst, long_edge, quality):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    scale = long_edge / float(max(w, h))
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img.save(dst, "JPEG", quality=quality, optimize=True)
    return os.path.getsize(dst)


def caption_of(fname):
    """inspo-03-浅灰修身短袖T恤+天蓝伞裤.png → 浅灰修身短袖T恤 + 天蓝伞裤"""
    stem = os.path.splitext(fname)[0]
    stem = re.sub(r"^(inspo|ref)-\d+-", "", stem)
    stem = re.sub(r"-(电商\d*|\d+-\d+|街拍|韩系|夜街拍)$", "", stem)
    return stem.replace("+", " + ")


def main():
    os.makedirs(os.path.join(DATA, "items"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "thumbs"), exist_ok=True)
    os.makedirs(os.path.join(DATA, "inspo"), exist_ok=True)

    with open(os.path.join(BASE, "library.json"), "r", encoding="utf-8") as f:
        library = json.load(f)
    with open(os.path.join(BASE, "style-profile.json"), "r", encoding="utf-8") as f:
        profile = json.load(f)

    with open(os.path.join(DATA, "library.json"), "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "style-profile.json"), "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=1)

    total = 0
    missing = []
    for it in library:
        slug = it["id"]
        src = os.path.join(CROPS, slug + ".jpg")
        if not os.path.exists(src):
            missing.append(slug)
            continue
        total += save_scaled(src, os.path.join(DATA, "items", slug + ".jpg"), 900, 78)
        total += save_scaled(src, os.path.join(DATA, "thumbs", slug + ".jpg"), 360, 72)

    inspo = []
    files = sorted(os.listdir(INSPO_SRC))
    for i, fn in enumerate(files):
        if not fn.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        out = "inspo/%02d.jpg" % (i + 1)
        total += save_scaled(os.path.join(INSPO_SRC, fn), os.path.join(DATA, out), 700, 78)
        cap = caption_of(fn)
        inspo.append({
            "file": out,
            "caption": cap,
            "kind": "目标风格参考" if fn.startswith("inspo") else "单品参考",
        })
    with open(os.path.join(DATA, "inspo.json"), "w", encoding="utf-8") as f:
        json.dump(inspo, f, ensure_ascii=False, indent=1)

    print("library:", len(library), "inspo:", len(inspo), "missing:", missing)
    print("data size: %.2f MB" % (total / 1024.0 / 1024.0))


if __name__ == "__main__":
    main()
