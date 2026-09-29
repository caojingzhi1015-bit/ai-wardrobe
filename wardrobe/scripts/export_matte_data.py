# -*- coding: utf-8 -*-
"""把抠图成品（tmp/matte-out/final/*.png 透明 RGBA）打包进 app/data/。

输出：
  app/data/items/{slug}.png     长边 900、保留 alpha（详情/搭配用）
  app/data/thumbs/{slug}.png    长边 360、保留 alpha（卡片用）
  app/data/library.json         image 字段指向 .png
旧 jpg 不删（兼容 IndexedDB 里已存的缓存）。

原始全尺寸抠图成品保留在 wardrobe/tmp/matte-out/final/（硬规格：原像素尺寸 RGBA PNG）。
"""
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(os.path.dirname(BASE), "app")
DATA = os.path.join(APP, "data")
FINAL = os.path.join(BASE, "tmp", "matte-out", "final")


def save_scaled(src, dst, long_edge):
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    scale = long_edge / float(max(w, h))
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img.save(dst, "PNG", optimize=True)
    return os.path.getsize(dst)


def main():
    with open(os.path.join(BASE, "library.json"), "r", encoding="utf-8") as f:
        library = json.load(f)

    total = 0
    missing = []
    for it in library:
        slug = it["id"]
        src = os.path.join(FINAL, slug + ".png")
        if not os.path.exists(src):
            missing.append(slug)
            continue
        total += save_scaled(src, os.path.join(DATA, "items", slug + ".png"), 900)
        total += save_scaled(src, os.path.join(DATA, "thumbs", slug + ".png"), 360)
        it["image"] = "items/%s.png" % slug

    with open(os.path.join(DATA, "library.json"), "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=1)

    print("library:", len(library), "missing:", missing)
    print("png size: %.2f MB" % (total / 1024.0 / 1024.0))


if __name__ == "__main__":
    main()
