# -*- coding: utf-8 -*-
"""坏图抢救：多引擎出候选 → 统一惩罚分仲裁 → 覆盖 final/。

引擎：
  seg          SegFormer-b2-clothes 人体解析（服装类，天然排除人/背景）——支持面板裁剪
  cloth        u2net_cloth_seg attire
  dis          BiRefNet-DIS（高精度二分分割，平铺商品最强）
  bria         BRIA-RMBG 2.0（商业级去背，对暗色商品好）
  birefnet     BiRefNet-General-Lite
  isnet        ISNet-General

仲裁惩罚（与 segformer_run 同口径）：
  cover<0.05 +60；cover>0.85 +30；skin>0.10 按比例罚；cover 越界 +25。
  平手按引擎顺序取更"懂服装"的：seg > cloth > dis > bria > birefnet > isnet。

面板（多拼图只取主体那一格，抠完贴回原尺寸画布，原图宽高比/像素尺寸不变）。
"""
import argparse
import gc
import json
import os
import sys

import numpy as np
from PIL import Image

from matte_run import (SRC_DIR, OUT_ROOT, BASE, postprocess, skin_ratio,
                       fill_inner_holes, alpha_matting_cutout, putalpha_cutout)

RESCUE_DIR = os.path.join(OUT_ROOT, "rescue")
CAND_DIR = os.path.join(OUT_ROOT, "cand")
REPORT = os.path.join(BASE, "tmp", "rescue-report.json")
BG = (245, 243, 240)

# 多拼图：只抠这一格，贴回原画布（左上角对齐）
PANELS = {
    "cbxlab-carbon-wasteland-cargo": (0, 0, 770, 1409),
    "black-tie-front-cardigan": (0, 637, 600, 1405),
}

# 平手时的优先顺序（靠前优先）
PREF = ["seg", "cloth", "dis", "bria", "birefnet", "isnet"]

# 每图人工覆盖（视觉 QA 后定）：
#   classes: SegFormer 保留类别；engine: 直接指定胜出引擎
PICKS = {
    "white-fur-hood-rhinestone-jacket": {"engine": "seg"},        # 互换后=白色螺纹打底照，seg[4] 即可
    "white-button-front-long-sleeve": {"engine": "segnodark"},    # 互换后=毛领外套照，保留毛领并剔黑发
    "black-leopard-cross-barrel-jeans": {"engine": "isnet"},      # dis 带了 NewJeans 水印块
    "grey-wing-print-base-layer": {"engine": "seg"},              # isnet/dis 会带人
    "charcoal-asymmetric-batwing-sweater": {"engine": "seg"},     # isnet/dis 会把裤子+包当主体
}

SEG_CLASSES = {
    "top": [4], "outerwear": [4], "bottom": [5, 6, 7], "dress": [7],
    "accessory": [4, 5, 6, 7, 8, 17], "shoes": [9, 10],
}
COVER_OK = (0.02, 0.88)

_sessions = {}


def get_session(name):
    if name in _sessions:
        return _sessions[name]
    from rembg import new_session
    key = {"dis": "birefnet-dis", "bria": "bria-rmbg", "birefnet": "birefnet-general-lite",
           "isnet": "isnet-general-use", "cloth": "u2net_cloth_seg"}.get(name, name)
    s = new_session(key)
    _sessions[name] = s
    return s


def get_seg():
    if "segformer" in _sessions:
        return _sessions["segformer"]
    import torch
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
    local = os.path.join(BASE, "tmp", "models", "segformer-b2-clothes")
    proc = SegformerImageProcessor.from_pretrained(local)
    model = SegformerForSemanticSegmentation.from_pretrained(local)
    model.eval()
    _sessions["segformer"] = (proc, model, torch)
    return _sessions["segformer"]


def seg_mask(img_rgb, keep_ids):
    proc, model, torch = get_seg()
    inputs = proc(images=img_rgb, return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    logits = torch.nn.functional.interpolate(
        out.logits, size=img_rgb.size[::-1], mode="bilinear", align_corners=False)
    seg = logits.argmax(dim=1)[0].numpy()
    return Image.fromarray(((np.isin(seg, keep_ids)) * 255).astype(np.uint8), "L")


def rembg_mask(engine, img_rgb):
    s = get_session(engine)
    masks = s.predict(img_rgb)
    return masks[0] if masks else None


def penalty(cover, skin):
    p = 0.0
    if cover < 0.05:
        p += 60
    if cover > 0.85:
        p += 30
    if skin is not None and skin > 0.10:
        p += (skin - 0.10) * 100
    if not (COVER_OK[0] <= cover <= COVER_OK[1]):
        p += 25
    return p


def largest_dark_components(mask_rgb, min_frac):
    """返回 mask 内暗色像素的连通域列表（面积降序）"""
    lum = np.asarray(mask_rgb.convert("L"))
    dark = lum < 70
    h, w = dark.shape
    seen = np.zeros_like(dark, dtype=bool)
    comps = []
    for y, x in np.argwhere(dark):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        comp = []
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def run_engine(engine, region_rgb, cat, classes=None):
    """返回 RGBA cutout（region 尺寸）"""
    keep_ids = classes if classes else SEG_CLASSES.get(cat, [4])
    if engine == "seg":
        mask = seg_mask(region_rgb, keep_ids)
    elif engine == "segnodark":
        # 白色毛领外套：毛领被标成 hair → 保留 [2,4]，再把 mask 内的大块黑发连通域剔除
        mask = seg_mask(region_rgb, [2, 4])
        cut0 = putalpha_cutout(region_rgb.convert("RGBA"), mask)
        a = np.asarray(cut0.getchannel("A")).copy()
        comps = largest_dark_components(cut0, 0.0)
        main_area = int((a >= 127).sum())
        for comp in comps:
            if len(comp) >= main_area * 0.015:
                ys = np.array([p[0] for p in comp])
                xs = np.array([p[1] for p in comp])
                a[ys, xs] = 0
        cut0.putalpha(Image.fromarray(a))
        return fill_inner_holes(postprocess(cut0)[0], region_rgb)
    elif engine == "segcrop":
        # 两段式：全图粗定位 → 裁局部放大再细抠（SegFormer 内部只有 512 输入，
        # 主体占比小时分辨率不够，裁剪后等效分辨率大幅提升）
        keep_ids2 = classes if classes else SEG_CLASSES.get(cat, [4])
        rough = seg_mask(region_rgb, keep_ids2)
        m = np.asarray(rough) >= 127
        if m.sum() < 500:
            return None
        ys, xs = np.where(m)
        pad_x = int((xs.max() - xs.min()) * 0.18) + 20
        pad_y = int((ys.max() - ys.min()) * 0.18) + 20
        x0, x1 = max(0, xs.min() - pad_x), min(region_rgb.size[0], xs.max() + pad_x)
        y0, y1 = max(0, ys.min() - pad_y), min(region_rgb.size[1], ys.max() + pad_y)
        crop = region_rgb.crop((x0, y0, x1, y1))
        mask = seg_mask(crop, keep_ids2)
        try:
            cut = alpha_matting_cutout(crop, mask, 240, 10, 7)
        except Exception:
            cut = putalpha_cutout(crop.convert("RGBA"), mask)
        cut = fill_inner_holes(postprocess(cut)[0], crop)
        canvas = Image.new("RGBA", region_rgb.size, (0, 0, 0, 0))
        canvas.paste(cut, (x0, y0))
        return canvas
    elif engine == "hybrid":
        # 人物/商品剪影 − 非目标类别：专治「深色衣服+深色背景+模特」
        pmask = rembg_mask("isnet", region_rgb)
        if pmask is None:
            return None
        if pmask.size != region_rgb.size:
            pmask = pmask.resize(region_rgb.size, Image.NEAREST)
        sub_ids = [c for c in range(18) if c not in set(keep_ids)]
        smask = seg_mask(region_rgb, sub_ids)
        m = (np.asarray(pmask) >= 127) & ~(np.asarray(smask) >= 127)
        mask = Image.fromarray((m * 255).astype(np.uint8), "L")
    elif engine == "cloth":
        mask = rembg_mask("cloth", region_rgb)
    else:
        mask = rembg_mask(engine, region_rgb)
    if mask is None:
        return None
    if mask.size != region_rgb.size:
        mask = mask.resize(region_rgb.size, Image.NEAREST)
    try:
        cut = alpha_matting_cutout(region_rgb, mask, 240, 10, 7)
    except Exception:
        cut = putalpha_cutout(region_rgb.convert("RGBA"), mask)
    cut = fill_inner_holes(postprocess(cut)[0], region_rgb)
    return cut


def score_cut(cut, engine):
    a = np.asarray(cut.getchannel("A"))
    cover = round(float((a >= 127).sum()) / float(a.size), 4)
    skin = 0.0 if engine == "seg" else skin_ratio(cut)
    return penalty(cover, skin), cover, skin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", required=True)
    ap.add_argument("--engines", default="seg,cloth,dis,bria,birefnet,isnet")
    ap.add_argument("--sheet", action="store_true")
    args = ap.parse_args()

    import shutil
    lib = json.load(open(os.path.join(BASE, "library.json"), encoding="utf-8"))
    catOf = {it["id"]: it.get("category", "top") for it in lib}

    os.makedirs(RESCUE_DIR, exist_ok=True)
    os.makedirs(CAND_DIR, exist_ok=True)
    slugs = [s for s in args.names.split(",") if s]
    engines = [e for e in args.engines.split(",") if e]

    scores = {s: {} for s in slugs}   # slug -> engine -> (penalty, cover, skin)

    for engine in engines:
        for i, slug in enumerate(slugs, 1):
            src = os.path.join(SRC_DIR, slug + ".png")
            img = Image.open(src).convert("RGB")
            box = PANELS.get(slug)
            region = img.crop(box) if box else img
            pick = PICKS.get(slug, {})
            try:
                cut = run_engine(engine, region, catOf.get(slug, "top"), pick.get("classes"))
            except Exception as e:
                print("   [%s/%s] 引擎失败: %s" % (engine, slug, e))
                cut = None
            if cut is None:
                continue
            cand_path = os.path.join(CAND_DIR, "%s__%s.png" % (engine, slug))
            cut.save(cand_path, "PNG", optimize=True)
            p, cover, skin = score_cut(cut, engine)
            scores[slug][engine] = [p, cover, skin]
            print("  %-38s %-9s pen=%6.2f cover=%.3f skin=%s" % (
                slug, engine, p, cover, ("%.3f" % skin) if skin is not None else "-"))
            sys.stdout.flush()
        gc.collect()

    # ---- 仲裁 + 贴回原画布 ----
    report = {}
    for slug in slugs:
        sc = scores[slug]
        pick = PICKS.get(slug, {})
        if not sc:
            print("!! %s 无任何候选" % slug)
            continue
        best = min(sc.items(), key=lambda kv: (kv[1][0], -kv[1][1],
                    PREF.index(kv[0]) if kv[0] in PREF else 99))
        eng, (p, cover, skin) = best
        if pick.get("engine") and pick["engine"] in sc:
            eng = pick["engine"]
            p, cover, skin = sc[eng]
        cut = Image.open(os.path.join(CAND_DIR, "%s__%s.png" % (eng, slug))).convert("RGBA")
        src = Image.open(os.path.join(SRC_DIR, slug + ".png")).convert("RGB")
        if slug in PANELS:
            canvas = Image.new("RGBA", src.size, (0, 0, 0, 0))
            canvas.paste(cut, PANELS[slug][:2])
            cut = canvas
        cut.save(os.path.join(RESCUE_DIR, slug + ".png"), "PNG", optimize=True)
        shutil.copyfile(os.path.join(RESCUE_DIR, slug + ".png"),
                        os.path.join(OUT_ROOT, "final", slug + ".png"))
        report[slug] = {"engine": eng, "penalty": p, "cover": cover, "skin": skin,
                        "panel": PANELS.get(slug), "all": {k: v for k, v in sc.items()}}
        print("WIN %-38s -> %-9s pen=%.2f" % (slug, eng, p))
        sys.stdout.flush()

    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("done:", len(report), "->", RESCUE_DIR)

    if args.sheet:
        from qa_compare import main as sheet_main
        sys.argv = ["qa_compare.py", "--names", ",".join(slugs), "--cell", "280"]
        sheet_main()


if __name__ == "__main__":
    main()
