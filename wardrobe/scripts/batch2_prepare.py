# -*- coding: utf-8 -*-
"""批次2：微信聊天记录里的 43 张现有衣橱截图 → 裁商品主图 + 采样主色。

- 原图归档到 originals/2026-09-28-批次2-微信衣橱/
- 裁剪结果放 tmp/batch2-crops/{slug}.jpg（带内缩安全边）
- 订单截图按缩略图框裁（小图，仅作记录用）
- 每张裁剪图做中心区域 k-means 取主色（纯 python 实现），写入 tmp/batch2-crops.json
"""
import json
import os
import random
import shutil
import sys

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # wardrobe/
SRC = r"C:\Users\餐巾纸\.workbuddy\app\tmp\chat-history\wechat-chat-history-1790572771332-a69fc52d\聊天记录内的图片、视频和文件"
ARCHIVE = os.path.join(BASE, "originals", "2026-09-28-批次2-微信衣橱")
CROPS = os.path.join(BASE, "tmp", "batch2-crops")
OUT_JSON = os.path.join(BASE, "tmp", "batch2-crops.json")

F309 = "微信图片_202609281309_%d.jpg"
F310 = "微信图片_202609281310_%d.jpg"

# 每个条目: slug -> (文件, 类型, box)
# band  = 商品主图带，box=(x0, top, x1, bottom)，比例坐标
# thumb = 订单缩略图，box=(x0, y0, x1, y1)，比例坐标
SPECS = [
    # ---- 1309 系列 ----
    ("navy-layered-long-sleeve-tee",     F309 % 1,  "band",  (0.0, 0.088, 1.0, 0.572)),
    ("grey-green-barrel-jeans",          F309 % 2,  "band",  (0.0, 0.078, 1.0, 0.572)),
    ("inknots-indigo-barrel-jeans",      F309 % 3,  "band",  (0.0, 0.078, 1.0, 0.548)),
    ("sanwild-black-bubble-skirt",       F309 % 4,  "band",  (0.0, 0.078, 1.0, 0.578)),
    ("grey-graphic-sunshirt-long-sleeve",F309 % 5,  "band",  (0.0, 0.078, 1.0, 0.598)),
    ("wash-blue-lowrise-bermuda-jeans",  F309 % 6,  "band",  (0.0, 0.078, 1.0, 0.588)),
    ("white-graphic-knit-overlay-top",   F309 % 8,  "band",  (0.0, 0.078, 1.0, 0.608)),  # _7/_8 同商品，取 _8 白天对镜图
    ("mosesqueen-beige-cami-tank",       F309 % 9,  "thumb", (0.040, 0.273, 0.268, 0.380)),
    ("mosesqueen-grey-cami-tank",        F309 % 9,  "thumb", (0.040, 0.466, 0.268, 0.573)),
    ("spear-youth-indigo-wide-jeans",    F309 % 10, "band",  (0.0, 0.078, 1.0, 0.548)),
    ("iu-room-white-balloon-pants",      F309 % 11, "band",  (0.0, 0.058, 1.0, 0.578)),
    ("black-lace-trim-cardigan",         F309 % 12, "thumb", (0.040, 0.273, 0.268, 0.380)),
    ("striped-wide-straight-pants",      F309 % 13, "band",  (0.0, 0.078, 1.0, 0.578)),
    ("black-tie-front-cardigan",         F309 % 14, "band",  (0.0, 0.078, 1.0, 0.608)),
    ("black-rib-wide-strap-tank",        F309 % 15, "band",  (0.0, 0.058, 1.0, 0.482)),
    ("black-floral-embroidery-tee",      F310 % 16, "band",  (0.0, 0.078, 1.0, 0.582)),
    ("forever21-washed-flare-jeans",     F310 % 17, "band",  (0.0, 0.078, 1.0, 0.582)),
    # ---- 1310 系列 ----
    ("blaexit-grey-pleated-wide-trousers",F310 % 18,"band",  (0.0, 0.078, 1.0, 0.498)),
    ("grey-wing-print-base-layer",       F310 % 19, "band",  (0.0, 0.078, 1.0, 0.588)),
    ("polka-dot-drawstring-jeans",       F310 % 20, "band",  (0.0, 0.078, 1.0, 0.568)),
    ("charcoal-asymmetric-batwing-sweater",F310 % 21,"band", (0.0, 0.078, 1.0, 0.528)),
    ("white-button-front-long-sleeve",   F310 % 22, "band",  (0.0, 0.078, 1.0, 0.592)),
    ("white-fur-hood-rhinestone-jacket", F310 % 23, "band",  (0.0, 0.078, 1.0, 0.598)),
    ("black-slit-crop-cardigan",         F310 % 24, "band",  (0.0, 0.078, 1.0, 0.582)),
    ("black-jennie-highwaist-jeans",     F310 % 25, "band",  (0.0, 0.078, 1.0, 0.572)),
    ("black-la-popup-graphic-tee",       F310 % 26, "band",  (0.0, 0.078, 1.0, 0.592)),
    ("cbxlab-parachute-track-pants",     F310 % 27, "band",  (0.0, 0.078, 1.0, 0.528)),
    ("cbxlab-carbon-wasteland-cargo",    F310 % 28, "band",  (0.0, 0.078, 1.0, 0.582)),
    ("black-double-yarn-tee",            F310 % 29, "thumb", (0.040, 0.273, 0.268, 0.380)),
    ("white-double-yarn-tee",            F310 % 29, "thumb", (0.040, 0.466, 0.268, 0.573)),
    ("blue-graffiti-zip-hoodie",         F310 % 30, "band",  (0.0, 0.078, 1.0, 0.608)),
    ("white-graffiti-crop-zip-hoodie",   F310 % 31, "band",  (0.0, 0.058, 1.0, 0.598)),
    ("black-dove-print-tee",             F310 % 32, "band",  (0.0, 0.078, 1.0, 0.562)),
    ("white-cat-analysis-tee",           F310 % 33, "band",  (0.0, 0.078, 1.0, 0.562)),
    ("charcoal-y2k-lace-heart-tee",      F310 % 34, "band",  (0.0, 0.032, 1.0, 0.482)),
    ("black-leopard-cross-barrel-jeans", F310 % 35, "band",  (0.0, 0.052, 1.0, 0.468)),
    ("snow-grey-modal-cardigan",         F310 % 36, "band",  (0.0, 0.052, 1.0, 0.438)),
    ("striped-polo-overshirt",           F310 % 37, "band",  (0.0, 0.052, 1.0, 0.612)),
    ("grey-highwaist-midi-skirt",        F310 % 38, "band",  (0.0, 0.052, 1.0, 0.438)),
    ("navy-plaid-overshirt",             F310 % 39, "band",  (0.0, 0.078, 1.0, 0.602)),
    ("slowacid-snowflake-scarf",         F310 % 40, "band",  (0.0, 0.078, 1.0, 0.432)),
    ("grey-polka-laceup-fitted-top",     F310 % 41, "band",  (0.0, 0.048, 1.0, 0.642)),
    ("oat-vneck-layered-cardigan",       F310 % 42, "band",  (0.0, 0.042, 1.0, 0.598)),
    ("black-henley-shell-button-top",    F310 % 43, "band",  (0.0, 0.042, 1.0, 0.582)),
]


def kmeans(pixels, k=5, iters=12):
    """极简 k-means，输入 [(r,g,b),...]，返回 [(count,(r,g,b),total),...] 按数量降序。
    count 基于实际参与聚类的样本数（可能已下采样），total = len(该集合)。"""
    random.seed(7)
    if len(pixels) > 4000:
        pixels = random.sample(pixels, 4000)
    total = len(pixels)
    centers = random.sample(pixels, k)
    for _ in range(iters):
        buckets = [[] for _ in range(k)]
        for p in pixels:
            ci = min(range(k), key=lambda i: sum((a - b) ** 2 for a, b in zip(p, centers[i])))
            buckets[ci].append(p)
        new = []
        for i in range(k):
            if buckets[i]:
                n = len(buckets[i])
                new.append(tuple(sum(c[j] for c in buckets[i]) // n for j in range(3)))
            else:
                new.append(random.choice(pixels))
        if new == centers:
            break
        centers = new
    counts = [0] * k
    for p in pixels:
        ci = min(range(k), key=lambda i: sum((a - b) ** 2 for a, b in zip(p, centers[i])))
        counts[ci] += 1
    pairs = sorted(zip(counts, centers), key=lambda t: -t[0])
    return [(n, c, total) for n, c in pairs]


def measure_center(img):
    """裁剪图中心 56%×50% 区域取 k-means 前三色。"""
    w, h = img.size
    box = (int(w * 0.22), int(h * 0.25), int(w * 0.78), int(h * 0.75))
    region = img.crop(box).convert("RGB")
    px = list(region.getdata())
    px = [p for p in px if (p[0] + p[1] + p[2]) > 30 and (p[0] + p[1] + p[2]) < 740]
    if not px:
        return []
    clusters = kmeans(px)
    out = []
    for n, (r, g, b), total in clusters[:3]:
        out.append({"hex": "#%02x%02x%02x" % (r, g, b), "share": round(n / total, 3)})
    return out


def main():
    os.makedirs(ARCHIVE, exist_ok=True)
    os.makedirs(CROPS, exist_ok=True)
    result = {}
    seen_files = set()
    errors = []
    for slug, fname, kind, box in SPECS:
        src = os.path.join(SRC, fname)
        if not os.path.exists(src):
            errors.append("%s: 源文件缺失 %s" % (slug, fname))
            continue
        seen_files.add(fname)
        dst_archive = os.path.join(ARCHIVE, fname)
        if not os.path.exists(dst_archive):
            shutil.copy2(src, dst_archive)
        img = Image.open(src)
        W, H = img.size
        if kind == "band":
            x0, y0, x1, y1 = box
            crop = img.crop((int(W * x0), int(H * y0), int(W * x1), int(H * y1)))
        else:
            x0, y0, x1, y1 = box
            crop = img.crop((int(W * x0), int(H * y0), int(W * x1), int(H * y1)))
        crop = crop.convert("RGB")
        out_path = os.path.join(CROPS, slug + ".jpg")
        crop.save(out_path, "JPEG", quality=86)
        # 缩略图：长边 800
        tw, th = crop.size
        scale = 800.0 / max(tw, th)
        if scale < 1:
            crop.resize((int(tw * scale), int(th * scale)), Image.LANCZOS).save(
                os.path.join(CROPS, slug + ".thumb.jpg"), "JPEG", quality=80)
        else:
            crop.save(os.path.join(CROPS, slug + ".thumb.jpg"), "JPEG", quality=80)
        measured = measure_center(crop)
        result[slug] = {
            "src": fname, "kind": kind, "box": box,
            "cropSize": list(crop.size), "measured": measured,
        }
    missing_archive = []
    for i in range(1, 16):
        f = F309 % i
        if f not in seen_files:
            missing_archive.append(f)
    for i in range(16, 44):
        f = F310 % i
        if f not in seen_files:
            missing_archive.append(f)
    for f in missing_archive:  # 未参与裁剪的原图也归档（如 _7 重复图）
        src = os.path.join(SRC, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(ARCHIVE, f))
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("crops:", len(result), " archived:", len(os.listdir(ARCHIVE)), " errors:", errors)
    for slug, info in result.items():
        top = info["measured"][0] if info["measured"] else {"hex": "-", "share": 0}
        print("%-38s %-5s %sx%s  dominant %s %.2f" % (
            slug, info["kind"], info["cropSize"][0], info["cropSize"][1], top["hex"], top["share"]))


if __name__ == "__main__":
    main()
