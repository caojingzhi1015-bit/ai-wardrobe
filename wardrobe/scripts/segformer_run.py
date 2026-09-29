# -*- coding: utf-8 -*-
"""SegFormer-b2-clothes 人体解析抠图 + 与 cloth_seg 自动择优 → tmp/matte-final/

类别表（mattmdjaga/segformer_b2_clothes）：
0 Background 1 Hat 2 Hair 3 Sunglasses 4 Upper-clothes 5 Skirt 6 Pants 7 Dress
8 Belt 9/10 shoes 11 Face 12/13 legs 14/15 arms 16 Bag 17 Scarf

择优规则（全自动，纯规则非生成式）：
- 对 cloth_seg 已有结果与 segformer 新结果各算惩罚分：
  cover<0.05 重罚（没抠出来）；cover>0.85 罚（背景被算进主体）；skin>0.10 按比例罚（把人抠进来了）
- segformer 惩罚更低才替换；平手偏 cloth_seg（768 输入边缘更细）
- segformer 胜出时用 closed-form alpha matting 精化边缘
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
import torch
from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

from matte_run import (SRC_DIR, OUT_ROOT, BASE, postprocess, skin_ratio,
                       fill_inner_holes, alpha_matting_cutout, putalpha_cutout)

SEG_DIR = os.path.join(OUT_ROOT, "seg")
FINAL_DIR = os.path.join(OUT_ROOT, "final")
REPORT = os.path.join(BASE, "tmp", "matte-final-report.json")

SEG_CLASSES = {
    "top": [4], "outerwear": [4], "bottom": [5, 6], "dress": [7],
    "accessory": [4, 5, 6, 7, 8, 17], "shoes": [9, 10],
}
COVER_OK = (0.02, 0.88)


def penalty(cover, skin):
    p = 0.0
    if cover < 0.05:
        p += 60
    if cover > 0.85:
        p += 30
    if skin > 0.10:
        p += (skin - 0.10) * 100
    if not (COVER_OK[0] <= cover <= COVER_OK[1]):
        p += 25
    return p


def measure(rgba):
    a = np.asarray(rgba.getchannel("A"))
    return {
        "cover": round(float((a >= 127).sum()) / float(a.size), 4),
        "skin": skin_ratio(rgba),
    }


def seg_mask(processor, model, img_rgb, keep_ids):
    inputs = processor(images=img_rgb, return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    logits = torch.nn.functional.interpolate(
        out.logits, size=img_rgb.size[::-1], mode="bilinear", align_corners=False)
    seg = logits.argmax(dim=1)[0].numpy()
    return Image.fromarray(((np.isin(seg, keep_ids)) * 255).astype(np.uint8), "L")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--slugs", default="")
    ap.add_argument("--no-matting", action="store_true")
    args = ap.parse_args()

    lib = json.load(open(os.path.join(BASE, "library.json"), encoding="utf-8"))
    catOf = {it["id"]: it.get("category", "top") for it in lib}

    cloth_dir = os.path.join(OUT_ROOT, "cloth")
    os.makedirs(SEG_DIR, exist_ok=True)
    os.makedirs(FINAL_DIR, exist_ok=True)

    slugs = [s for s in args.slugs.split(",") if s]
    if not slugs:
        slugs = sorted(f[:-4] for f in os.listdir(SRC_DIR) if f.endswith(".png"))
    if args.limit:
        slugs = slugs[: args.limit]

    LOCAL_MODEL = os.path.join(BASE, "tmp", "models", "segformer-b2-clothes")
    processor = SegformerImageProcessor.from_pretrained(LOCAL_MODEL)
    model = SegformerForSemanticSegmentation.from_pretrained(LOCAL_MODEL)
    model.eval()

    report = {}
    for i, slug in enumerate(slugs, 1):
        src = os.path.join(SRC_DIR, slug + ".png")
        img = Image.open(src).convert("RGB")
        cloth_path = os.path.join(cloth_dir, slug + ".png")

        rep = {"size": list(img.size)}
        if os.path.exists(cloth_path):
            rep["cloth"] = dict(measure(Image.open(cloth_path).convert("RGBA")))
        else:
            rep["cloth"] = {"cover": 0, "skin": 1.0}
        rep["cloth"]["penalty"] = round(penalty(rep["cloth"]["cover"], rep["cloth"]["skin"]), 3)

        keep = SEG_CLASSES.get(catOf.get(slug, "top"), [4])
        mask = seg_mask(processor, model, img, keep)
        rep["seg"] = {"cover": round(float((np.asarray(mask) >= 127).sum()) / mask.size[0] / mask.size[1], 4)}
        rep["seg"]["penalty"] = round(penalty(rep["seg"]["cover"], 0.0), 3)

        used = "cloth"
        cut = None
        # seg 优先：惩罚不比 cloth 差超过 3 分就用 seg（人体解析天生会排除模特/头发/帽子/UI）
        if rep["seg"]["penalty"] <= rep["cloth"]["penalty"] + 3.0:
            used = "seg"
            if args.no_matting:
                cut = putalpha_cutout(img.convert("RGBA"), mask)
            else:
                try:
                    cut = alpha_matting_cutout(img, mask, 240, 10, 7)
                except Exception as e:
                    print("   matting 失败，回退 putalpha:", e)
                    cut = putalpha_cutout(img.convert("RGBA"), mask)
            cut = fill_inner_holes(postprocess(cut)[0], img)
            cut.save(os.path.join(SEG_DIR, slug + ".png"), "PNG", optimize=True)

        if used == "seg":
            final_img = Image.open(os.path.join(SEG_DIR, slug + ".png")).convert("RGBA")
            fm = measure(final_img)
            fm["skin"] = None  # seg 是人体解析，肤色指标无意义（粉/卡其衣物会误报）
        else:
            final_img = Image.open(cloth_path).convert("RGBA")
            fm = measure(final_img)
        final_img.save(os.path.join(FINAL_DIR, slug + ".png"), "PNG", optimize=True)
        rep["final"] = fm
        rep["final"]["used"] = used
        report[slug] = rep

        print("[%2d/%d] %-38s %-5s final cover=%.3f skin=%s | cloth c%.3f p%.1f | seg c%.3f p%.1f" % (
            i, len(slugs), slug, used, rep["final"]["cover"],
            ("%.3f" % rep["final"]["skin"]) if rep["final"]["skin"] is not None else "-",
            rep["cloth"]["cover"], rep["cloth"]["penalty"], rep["seg"]["cover"], rep["seg"]["penalty"]))
        sys.stdout.flush()

    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    n_seg = sum(1 for r in report.values() if r["final"]["used"] == "seg")
    print("done: %d 张（segformer 胜出 %d，cloth_seg 保留 %d）-> %s" % (len(report), n_seg, len(report) - n_seg, FINAL_DIR))


if __name__ == "__main__":
    main()
