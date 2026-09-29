# -*- coding: utf-8 -*-
"""批次1 摄影风格量化：曝光、对比、饱和、色温、光质软硬、背景纯净度"""
import json, os, statistics
from PIL import Image, ImageStat

SRC = r"D:\xwechat_files\wxid_0fozf2qgws8o22_c057\temp\RWTemp\2026-09\9e20f478899dc29eb19741386f9343c8"
ROOT = r"D:\KuGou\Lyric\穿搭\wardrobe"

GROUPS = {
    "试衣间对镜": [
        "9bbf05d41d8a7839b20a90a1ab39d798.png", "b43b576c66ad3c66e65cd4f6448f0be9.png",
        "03cd60089398f9d6af58c143914ebf7c.png", "04a3c3c54f8e61420056dfb39a48ef55.png",
        "169bea07d5baef2f679e5ac15783fef3.png", "477de3279c255ba546676a6ef5a62fc6.png",
        "53360106e4873bee35bc9442c0f60ffa.png", "5b8768f288db060de4324b223dea0880.png",
        "5bbfdfbf020a375636a0e3fbefc5d63a.png", "dbdfffedd3765ad7baf1d80dff4f61f2.png",
        "622bc03cfa37216024c757c38008555e.jpg", "6c1e7802dc3678529eaf3e0d3941203d.jpg",
    ],
    "街拍夜景": ["8e16214b092543e876d89f4dd1d7b922.png", "86951e779851862574a5cd1190b207b0.jpg"],
    "ins/平面": ["2ccbf952881ef4f40007bedec7c78cb1.jpg"],
    "电商棚拍": [
        "14774736c1223b44090e1b997cf9cd71.jpg", "5d31912be99780819f2c17d690f53dcd.jpg",
        "a6e0bbb8dbf57173a1821791404b6d18.jpg", "b2297bd78f2d21518eef0219b15511a6.jpg",
        "b27e805b9f1b5c37900a714e69419a39.jpg",
    ],
}

def hist_pct(px, lo, hi):
    n = len(px)
    return round(sum(1 for v in px if lo <= v <= hi) / n, 3)

def analyze(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.copy(); small.thumbnail((300, 300))
    hsv = small.convert("HSV")
    hh, ss, vv = hsv.split()
    v_data = list(vv.getdata()); s_data = list(ss.getdata())
    st = ImageStat.Stat(small)  # R G B 均值与标准差

    meanV = statistics.mean(v_data)
    stdV = statistics.pstdev(v_data)
    meanS = statistics.mean(s_data)
    r, g, b = st.mean
    warmth = (r - b) / max(r + b, 1)          # >0 偏暖，<0 偏冷
    hi = hist_pct(v_data, 235, 255)           # 高光占比
    sh = hist_pct(v_data, 0, 45)              # 阴影占比
    mid = hist_pct(v_data, 80, 180)

    # 局部对比（相邻像素亮度差的均值）→ 细节锐度/颗粒感
    px = vv.load(); W, H = vv.size
    diffs = []
    for y in range(0, H - 1, 2):
        for x in range(0, W - 1, 2):
            diffs.append(abs(px[x, y] - px[x + 1, y]) + abs(px[x, y] - px[x, y + 1]))
    grain = round(statistics.mean(diffs) / 2, 2)

    # 背景纯净度：四角补丁的亮度标准差（越小越干净/越像棚拍）
    cs = []
    for (x0, y0, x1, y1) in ((0, 0, .18, .18), (.82, 0, 1, .18), (0, .82, .18, 1), (.82, .82, 1, 1)):
        p = vv.crop((int(x0*W), int(y0*H), int(x1*W), int(y1*H)))
        cs.append(statistics.mean(list(p.getdata())))
    bg_even = round(statistics.pstdev(cs), 2)

    return {
        "size": "%dx%d" % (w, h),
        "aspect": round(h / w, 2),
        "meanV": round(meanV, 1),
        "contrastStdV": round(stdV, 1),
        "meanSat": round(meanS, 1),
        "warmth": round(warmth, 4),
        "highlightPct": hi,
        "shadowPct": sh,
        "midtonePct": mid,
        "grain": grain,
        "bgEvenness": bg_even,
    }

out = {"perImage": {}, "byGroup": {}}
for grp, files in GROUPS.items():
    rows = []
    for f in files:
        p = os.path.join(SRC, f)
        a = analyze(p)
        out["perImage"][f] = {"group": grp, **a}
        rows.append(a)
    def avg(k): return round(statistics.mean([r[k] for r in rows]), 2)
    out["byGroup"][grp] = {
        "count": len(rows),
        "aspect": avg("aspect"),
        "meanV": avg("meanV"),
        "contrastStdV": avg("contrastStdV"),
        "meanSat": avg("meanSat"),
        "warmth": avg("warmth"),
        "highlightPct": avg("highlightPct"),
        "shadowPct": avg("shadowPct"),
        "midtonePct": avg("midtonePct"),
        "grain": avg("grain"),
        "bgEvenness": avg("bgEvenness"),
    }

with open(os.path.join(ROOT, "tmp", "batch1-photo-stats.json"), "w", encoding="utf-8") as fp:
    json.dump(out, fp, ensure_ascii=False, indent=2)

for g, v in out["byGroup"].items():
    print(g, v)
print("DONE")
