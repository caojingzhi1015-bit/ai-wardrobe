# -*- coding: utf-8 -*-
"""批次2 保真抠图：分割模型（U²-Net 服装解析 / ISNet 通用）出 RGBA PNG。

硬规格（违反即重做）：
- RGBA PNG、四角透明
- 只用分割模型，禁止生成式模型重绘商品
- 保持原始宽高比与像素尺寸：不缩放、不变形、不裁掉头尾
- 保真：不磨皮、不补画、不消除褶皱；细节（皮纹/绒毛/划痕/logo/标签字）全保留
后处理只有程序化手段：连通域清理 + alpha 边缘解析去背（closed-form / 局部去色边），不重绘像素。

用法：
  python matte_run.py --limit 3                # 试跑
  python matte_run.py                          # 全量
  python matte_run.py --matting                # 开启 closed-form alpha matting（更细，慢）
"""
import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image
from rembg import new_session
from rembg.bg import alpha_matting_cutout, putalpha_cutout

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE, "tmp", "matte-src")
OUT_ROOT = os.path.join(BASE, "tmp", "matte-out")
REPORT = os.path.join(BASE, "tmp", "matte-report.json")

ALPHA_T = 127
CORNER_FRAC = 0.03
MAX_ISLAND_FRAC = 0.02
COVER_OK = (0.02, 0.88)   # 主体占比合理区间，越界说明模型没认出来或整图都算主体


def cloth_mask(session, img):
    """服装解析模型：只取「衣服」类（上装+下装+整身），天然排除人/模特/衣架/背景。"""
    masks = session.predict(img, cloth_category="attire")
    return masks[-1] if masks else None


def saliency_mask(session, img):
    masks = session.predict(img)
    return masks[0] if masks else None


def mask_cover(mask):
    a = np.asarray(mask)
    return float((a >= ALPHA_T).sum()) / float(a.size)


def largest_components_keep(mask, min_frac=MAX_ISLAND_FRAC):
    """保留最大连通域 + 不小于其 min_frac 的块（上下装分离时可留两块）。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for y, x in np.argwhere(mask):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        comp = []
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        comps.append(comp)
    if not comps:
        return mask, 0
    comps.sort(key=len, reverse=True)
    keep_n = len(comps[0])
    out = np.zeros_like(mask, dtype=bool)
    kept = 0
    for comp in comps:
        if len(comp) >= keep_n * min_frac:
            ys = np.array([p[0] for p in comp])
            xs = np.array([p[1] for p in comp])
            out[ys, xs] = True
            kept += 1
    return out, kept


def fill_inner_holes(rgba, src_rgb, min_std=16.0, min_frac=0.0005):
    """填掉 mask 内部的分割空洞：洞内像素方差高（=衣服纹理/印花被误挖）→ 填回；
    方差低（=领口等真镂空/真背景）→ 保持透明。纯程序判断。"""
    arr = np.asarray(rgba.convert("RGBA")).copy()
    a = arr[..., 3]
    mask = a >= ALPHA_T
    if mask.sum() < 500:
        return rgba
    h, w = mask.shape
    # 从边界洪泛出「外部背景」
    outside = np.zeros_like(mask, dtype=bool)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if not mask[y, x]]
    stack += [(y, x) for x in range(w) for y in (0, h - 1) if not mask[y, x]]
    for y, x in stack:
        outside[y, x] = True
    while stack:
        cy, cx = stack.pop()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    holes = (~mask) & (~outside)
    if not holes.any():
        return rgba
    # 逐洞判断
    hole_mask = holes.astype(np.uint8)
    seen = np.zeros_like(holes, dtype=bool)
    main_area = int(mask.sum())
    src = np.asarray(src_rgb.convert("RGB")).astype(np.float32)
    filled = 0
    for y, x in np.argwhere(holes):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        comp = []
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and holes[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(comp) < main_area * min_frac:
            continue  # 太小的洞不动（防噪点）
        ys = np.array([p[0] for p in comp])
        xs = np.array([p[1] for p in comp])
        # 洞必须「贴着」主体（边界膨胀后接触 mask）才是分割空洞；
        # 悬在背景里的（淘宝页码/水印文字）不碰 —— 那些会被连通域清理另行处理
        touch = np.zeros_like(mask)
        touch[np.clip(ys - 2, 0, h - 1), xs] = True
        touch[np.clip(ys + 2, 0, h - 1), xs] = True
        touch[ys, np.clip(xs - 2, 0, w - 1)] = True
        touch[ys, np.clip(xs + 2, 0, w - 1)] = True
        if not (touch & mask).any():
            continue
        patch = src[ys, xs]
        std = float(patch.std())
        if std > min_std:  # 洞里有衣服纹理/印花/阴影 → 是分割空洞，填回
            a[ys, xs] = 255
            filled += 1
    if filled:
        out = rgba.copy()
        out.putalpha(Image.fromarray(a))
        return out
    return rgba


def decontaminate_edge(rgba, bg_sample_radius=6):
    """只处理边缘带（0.05<a<0.95）：用邻近背景色解析去背，去掉白/底色毛边。
    纯解析运算（C = a*F + (1-a)*B），不改纹理、不重绘。"""
    arr = np.asarray(rgba.convert("RGBA")).astype(np.float32)
    a = arr[..., 3] / 255.0
    edge = (a > 0.04) & (a < 0.96)
    if edge.sum() < 50:
        return rgba
    rgb = arr[..., :3]
    # 背景估计：对每个边缘像素取邻域里 alpha==0 的像素中值
    bgm = np.zeros_like(rgb)
    bgm[..., 0] = np.where(a == 0, rgb[..., 0], np.nan)
    bgm[..., 1] = np.where(a == 0, rgb[..., 1], np.nan)
    bgm[..., 2] = np.where(a == 0, rgb[..., 2], np.nan)
    # 用简单盒式统计近似局部背景（分块取中位数，够用且快）
    h, w = a.shape
    bs = 16
    out = rgb.copy()
    for by in range(0, h, bs):
        for bx in range(0, w, bs):
            blk_bg = bgm[by:by + bs, bx:bx + bs]
            blk_e = edge[by:by + bs, bx:bx + bs]
            if not blk_e.any():
                continue
            med = np.nanmedian(blk_bg.reshape(-1, 3), axis=0)
            if np.isnan(med).any():
                # 块内没有纯背景：用全图 alpha==0 的中值兜底
                med = np.nanpercentile(bgm.reshape(-1, 3), 50, axis=0)
                if np.isnan(med).any():
                    continue
            idx = np.argwhere(blk_e)
            for dy, dx in idx:
                y, x = by + dy, bx + dx
                av = a[y, x]
                f = (rgb[y, x] - (1.0 - av) * med) / max(av, 1e-3)
                out[y, x] = np.clip(f, 0, 255)
    res = np.dstack([out, arr[..., 3]]).astype(np.uint8)
    return Image.fromarray(res, "RGBA")


def postprocess(rgba):
    a = np.asarray(rgba.getchannel("A"))
    mask = a >= ALPHA_T
    clean, ncomp = largest_components_keep(mask)
    a2 = a.copy()
    a2[~clean] = 0
    h, w = a2.shape
    ch, cw = max(2, int(h * CORNER_FRAC)), max(2, int(w * CORNER_FRAC))
    corners = {}
    for k, (ys, xs) in {
        "tl": (slice(0, ch), slice(0, cw)),
        "tr": (slice(0, ch), slice(w - cw, w)),
        "bl": (slice(h - ch, h), slice(0, cw)),
        "br": (slice(h - ch, h), slice(w - cw, w)),
    }.items():
        corners[k] = int(a2[ys, xs].mean())
    out = rgba.copy()
    out.putalpha(Image.fromarray(a2))
    return out, corners, ncomp


def skin_ratio(rgba):
    """主体内肤色像素占比：判断是否把模特/手抠进来了。"""
    rgb = np.asarray(rgba.convert("RGB")).astype(np.int16)
    a = np.asarray(rgba.getchannel("A"))
    m = a >= 200
    if m.sum() < 500:
        return 0.0
    r, g, b = rgb[..., 0][m], rgb[..., 1][m], rgb[..., 2][m]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    skin = (y > 50) & (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173) & (r > g) & (r > b)
    return round(float(skin.sum()) / float(m.sum()), 4)


def build_cutout(img, mask, use_matting):
    if use_matting:
        try:
            return alpha_matting_cutout(img.convert("RGB"), mask, 240, 10, 7)
        except Exception as e:
            print("   matting 失败，回退 putalpha:", e)
    return putalpha_cutout(img.convert("RGBA"), mask)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--slugs", default="")
    ap.add_argument("--matting", action="store_true")
    ap.add_argument("--tag", default="cloth")
    args = ap.parse_args()

    slugs = [s for s in args.slugs.split(",") if s]
    if not slugs:
        slugs = sorted(f[:-4] for f in os.listdir(SRC_DIR) if f.endswith(".png"))
    if args.limit:
        slugs = slugs[: args.limit]

    out_dir = os.path.join(OUT_ROOT, args.tag)
    os.makedirs(out_dir, exist_ok=True)
    s_cloth = new_session("u2net_cloth_seg")
    s_gen = new_session("isnet-general-use")

    report = {}
    for i, slug in enumerate(slugs, 1):
        t0 = time.time()
        src = os.path.join(SRC_DIR, slug + ".png")
        img = Image.open(src).convert("RGBA")
        mask = cloth_mask(s_cloth, img)
        cover = mask_cover(mask)
        used = "cloth"
        if not (COVER_OK[0] <= cover <= COVER_OK[1]):
            mask2 = saliency_mask(s_gen, img)
            c2 = mask_cover(mask2)
            if COVER_OK[0] <= c2 <= COVER_OK[1] or abs(c2 - 0.35) < abs(cover - 0.35):
                mask, cover, used = mask2, c2, "isnet"
        cut = build_cutout(img, mask, args.matting)
        if cut.size != img.size:
            cut = cut.resize(img.size, Image.NEAREST)
        if not args.matting:
            cut = decontaminate_edge(cut)
        out, corners, ncomp = postprocess(cut)
        a = np.asarray(out.getchannel("A"))
        cover_final = round(float((a >= ALPHA_T).sum()) / float(a.size), 4)
        edge = round(float(((a >= ALPHA_T) & (a < 250)).sum()) / max(1, float((a >= ALPHA_T).sum())), 4)
        out.save(os.path.join(out_dir, slug + ".png"), "PNG", optimize=True)
        report[slug] = {
            "size": list(out.size),
            "srcSize": list(img.size),
            "model": used,
            "maskCover": round(cover, 4),
            "cover": cover_final,
            "skin": skin_ratio(out),
            "corners": corners,
            "components": ncomp,
            "softEdgeFrac": edge,
        }
        print("[%2d/%d] %-38s %-6s %sx%s cover=%.3f skin=%.3f corners=%s comp=%d %.1fs" % (
            i, len(slugs), slug, used, out.size[0], out.size[1], cover_final,
            report[slug]["skin"], ",".join(str(corners[k]) for k in ("tl", "tr", "bl", "br")),
            ncomp, time.time() - t0))
        sys.stdout.flush()

    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump({"tag": args.tag, "matting": args.matting, "items": report}, f, ensure_ascii=False, indent=1)
    print("done:", len(report), "->", out_dir)


if __name__ == "__main__":
    main()
