# -*- coding: utf-8 -*-
"""保守去背管线：只抠背景，保证主体完整好看。

与之前激进方案的区别（用户反馈"太难看了"后回退）：
- 不做语义类别剔除（不再用 SegFormer 挖掉"非目标类"）
- 不做面板裁剪、不做两段式局部放大重抠
- 不填洞（领口/袖口/镂空本来就该透明）
- 输出 = 源图像素尺寸，不缩放不裁切

流程：
1) 通用显著分割 isnet-general-use —— 纯粹的"去背景"，主体完整保留
2) 若主体内肤色占比 > SKIN_HUMAN，判定为模特实拍 → 再用 u2net_cloth_seg(attire) 去人
3) 服饰分割结果若残缺（cover < MIN_COVER）→ 回退第 1 步结果，宁可完整也不给残件
4) 后处理只动 alpha：最大连通域清理 + 四角归零 + 边缘解析去污染（不重绘 RGB）
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import matte_run as M  # noqa: E402

TAG = "plain"
SKIN_HUMAN = 0.12      # 主体内肤色占比超过它 → 认为把人抠进来了
MIN_COVER = 0.06       # 服饰分割结果低于它 → 判为残缺，回退


def cover_of(rgba):
    a = np.asarray(rgba.getchannel("A"))
    return float((a >= M.ALPHA_T).sum()) / float(a.size)


def pipe(img, mask):
    """mask(PIL L) → 成品 RGBA（源图尺寸）"""
    cut = M.build_cutout(img, mask, use_matting=True)
    if cut.size != img.size:
        cut = cut.resize(img.size, Image.LANCZOS)
    cut2, corners, ncomp = M.postprocess(cut)
    cut2 = M.decontaminate_edge(cut2)
    # 去污染可能让四角 alpha 微升，再归零一次
    a = np.asarray(cut2.getchannel("A")).copy()
    h, w = a.shape
    ch, cw = max(2, int(h * M.CORNER_FRAC)), max(2, int(w * M.CORNER_FRAC))
    for ys, xs in ((slice(0, ch), slice(0, cw)), (slice(0, ch), slice(w - cw, w)),
                   (slice(h - ch, h), slice(0, cw)), (slice(h - ch, h), slice(w - cw, w))):
        a[ys, xs] = 0
    cut2.putalpha(Image.fromarray(a))
    return cut2, corners, ncomp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", default="")
    ap.add_argument("--out", default=TAG)
    args = ap.parse_args()

    slugs = [s for s in args.slugs.split(",") if s]
    if not slugs:
        slugs = sorted(f[:-4] for f in os.listdir(M.SRC_DIR) if f.endswith(".png"))

    out_dir = os.path.join(M.OUT_ROOT, args.out)
    os.makedirs(out_dir, exist_ok=True)

    s_isp = new_session("isnet-general-use")
    s_cloth = None
    report = {}

    for i, slug in enumerate(slugs, 1):
        src = os.path.join(M.SRC_DIR, slug + ".png")
        if not os.path.exists(src):
            print("MISS", slug)
            continue
        img = Image.open(src)
        img = Image.open(src).convert("RGBA")
        rgb = img.convert("RGB")

        # ① 通用去背
        m1 = M.saliency_mask(s_isp, rgb)
        if m1 is None:
            print("FAIL isnet", slug)
            continue
        c1, corners1, n1 = pipe(img, m1)
        cover1 = cover_of(c1)
        skin1 = M.skin_ratio(c1)

        used, cut, cover, skin, corners = "isnet", c1, cover1, skin1, corners1

        # ② 检测到人 → 试服饰分割去人
        if skin1 > SKIN_HUMAN:
            if s_cloth is None:
                s_cloth = new_session("u2net_cloth_seg")
            m2 = M.cloth_mask(s_cloth, rgb)
            if m2 is not None:
                c2, corners2, n2 = pipe(img, m2)
                cover2 = cover_of(c2)
                skin2 = M.skin_ratio(c2)
                # 只在「不残缺」且「确实更去人」时才采用
                if cover2 >= MIN_COVER and skin2 < skin1 * 0.7:
                    used, cut, cover, skin, corners = "cloth", c2, cover2, skin2, corners2

        dst = os.path.join(out_dir, slug + ".png")
        cut.save(dst, "PNG", optimize=True)
        report[slug] = {
            "used": used, "cover": round(cover, 4), "skin": skin,
            "size": list(cut.size), "srcsize": list(img.size),
            "corners": corners,
        }
        print("[%02d/%d] %-38s %-6s cover=%.3f skin=%.3f %sx%s corners=%s"
              % (i, len(slugs), slug, used, cover, skin,
                 cut.size[0], cut.size[1], list(corners.values())))
        sys.stdout.flush()

    rp = os.path.join(M.BASE, "tmp", "matte-%s-report.json" % args.out)
    with open(rp, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    bad = [k for k, v in report.items() if v["size"] != v["srcsize"]]
    print("done", len(report), "size-mismatch:", bad)


if __name__ == "__main__":
    main()
