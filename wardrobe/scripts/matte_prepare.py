# -*- coding: utf-8 -*-
"""批次2 抠图预处理：从归档原图按 hand-tuned 版式框裁出商品图，存为无损 PNG 源。

与 batch2_prepare.py 的区别：
- 输出 PNG（无损），不进 JPEG —— 抠图前不能再压一次，保真优先
- 不缩放，保持原始像素尺寸（如 1200x1293）
- 上下各外扩 EXPAND，避免把衣服的头尾裁掉（规格：不裁掉头尾）
- SPECS 直接从 batch2_prepare.py 里 exec 出来，不复制维护
"""
import json
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # wardrobe/
ARCHIVE = os.path.join(BASE, "originals", "2026-09-28-批次2-微信衣橱")
SRC_DIR = os.path.join(BASE, "tmp", "matte-src")
OUT_JSON = os.path.join(BASE, "tmp", "matte-src.json")

EXPAND = 0.012  # band 上下各外扩 1.2%（截图高度的比例）


def load_specs():
    """从 batch2_prepare.py 抽出 SPECS（避免两处维护）。"""
    path = os.path.join(BASE, "scripts", "batch2_prepare.py")
    lines = open(path, encoding="utf-8").read().split("\n")
    start = None
    for i, ln in enumerate(lines):
        if ln.startswith("SPECS = ["):
            start = i
            break
    if start is None:
        raise RuntimeError("找不到 SPECS")
    end = start
    while lines[end].rstrip() != "]":
        end += 1
    prefix = "\n".join(lines[: end + 1])
    ns = {"__file__": path}
    exec(compile(prefix, "batch2_prepare.py", "exec"), ns)
    return ns["SPECS"]


def main():
    os.makedirs(SRC_DIR, exist_ok=True)
    specs = load_specs()
    result, errors = {}, []
    for slug, fname, kind, box in specs:
        src = os.path.join(ARCHIVE, fname)
        if not os.path.exists(src):
            errors.append("%s: 缺原图 %s" % (slug, fname))
            continue
        img = Image.open(src)
        W, H = img.size
        x0, y0, x1, y1 = box
        if kind == "band":
            y0 = max(0.0, y0 - EXPAND)
            y1 = min(1.0, y1 + EXPAND)
        crop = img.crop((int(W * x0), int(H * y0), int(W * x1), int(H * y1))).convert("RGB")
        out = os.path.join(SRC_DIR, slug + ".png")
        crop.save(out, "PNG", optimize=True)
        result[slug] = {
            "src": fname, "kind": kind, "box": [x0, y0, x1, y1],
            "size": list(crop.size), "originSize": [W, H],
        }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("sources:", len(result), "errors:", errors)
    for slug, info in list(result.items())[:6]:
        print("  %-38s %sx%s" % (slug, info["size"][0], info["size"][1]))
    total = sum(os.path.getsize(os.path.join(SRC_DIR, s + ".png")) for s in result) // 1024 // 1024
    print("total:", total, "MB")


if __name__ == "__main__":
    main()
