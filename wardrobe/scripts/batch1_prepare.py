# -*- coding: utf-8 -*-
"""批次1 图片整理：归档原图、裁剪商品截图、提取真实主色、生成缩略图"""
import json, os, shutil
from PIL import Image

SRC = r"D:\xwechat_files\wxid_0fozf2qgws8o22_c057\temp\RWTemp\2026-09\9e20f478899dc29eb19741386f9343c8"
ROOT = r"D:\KuGou\Lyric\穿搭\wardrobe"
ORIG = os.path.join(ROOT, "originals", "2026-09-28-批次1")
INBOX = os.path.join(ROOT, "inbox")
INSPO = os.path.join(ROOT, "outfits", "inspo")
ITEMS = os.path.join(ROOT, "items")
THUMBS = os.path.join(ITEMS, "thumbs")
for d in (ORIG, INBOX, INSPO, ITEMS, THUMBS):
    os.makedirs(d, exist_ok=True)

# h: (目标目录, 新文件名, crop 或 None)
# crop=(l,t,r,b) 仅用于 3 张商品截图，裁掉 App UI 与价格栏
CATALOG = {
    # ---- 试衣间/街拍 穿搭参考（17 张中的 17=11 PNG + 6 JPG）----
    "9bbf05d41d8a7839b20a90a1ab39d798.png": (INSPO, "inspo-01-黑白细条纹短袖T恤+深灰工装伞裤.png", None),
    "b43b576c66ad3c66e65cd4f6448f0be9.png": (INSPO, "inspo-02-蓝白条纹短袖T恤+卡其宽松直筒裤.png", None),
    "03cd60089398f9d6af58c143914ebf7c.png": (INSPO, "inspo-03-浅灰修身短袖T恤+天蓝伞裤.png", None),
    "04a3c3c54f8e61420056dfb39a48ef55.png": (INSPO, "inspo-04-白泡泡袖短衬衫+深靛直筒牛仔裤.png", None),
    "169bea07d5baef2f679e5ac15783fef3.png": (INSPO, "inspo-05-藏青开衫+吊带+深直筒牛仔裤.png", None),
    "477de3279c255ba546676a6ef5a62fc6.png": (INSPO, "inspo-06-粉色印花短袖T恤+黑宽松裤.png", None),
    "53360106e4873bee35bc9442c0f60ffa.png": (INSPO, "inspo-07-黑迪士尼印花T恤+天蓝伞裤.png", None),
    "5b8768f288db060de4324b223dea0880.png": (INSPO, "inspo-08-米白史努比针织短袖+军绿工装裤.png", None),
    "5bbfdfbf020a375636a0e3fbefc5d63a.png": (INSPO, "inspo-09-炭灰亨利领针织短袖+中蓝直筒牛仔裤.png", None),
    "dbdfffedd3765ad7baf1d80dff4f61f2.png": (INSPO, "inspo-10-白别针心形印花T恤+深灰工装伞裤.png", None),
    "8e16214b092543e876d89f4dd1d7b922.png": (INSPO, "inspo-11-藏青落肩卫衣+浅蓝阔腿牛仔裤-街拍.png", None),
    "2ccbf952881ef4f40007bedec7c78cb1.jpg": (INSPO, "inspo-12-藏青V领针织+白内搭+卡其工装阔腿裤-韩系.jpg", None),
    "5d31912be99780819f2c17d690f53dcd.jpg": (INSPO, "inspo-13-军绿工装阔腿裤上身参考-电商5-10.jpg", None),
    "622bc03cfa37216024c757c38008555e.jpg": (INSPO, "inspo-14-藏青插肩七分袖棒球T+黑锥形裤.jpg", None),
    "6c1e7802dc3678529eaf3e0d3941203d.jpg": (INSPO, "inspo-15-石板灰蓝长袖T恤+军绿工装裤.jpg", None),
    "86951e779851862574a5cd1190b207b0.jpg": (INSPO, "inspo-16-灰开衫外套+蓝阔腿牛仔裤-夜街拍.jpg", None),
    "a6e0bbb8dbf57173a1821791404b6d18.jpg": (INSPO, "inspo-17-军绿工装阔腿裤上身参考-电商2-10.jpg", None),
    # ---- 商品截图（3 张，入库单品）----
    "14774736c1223b44090e1b997cf9cd71.jpg": (INBOX, "218-taobao-盐渍青梅jk-灰绿双排扣连帽卫衣.jpg", (0, 105, 486, 790)),
    "b2297bd78f2d21518eef0219b15511a6.jpg": (INBOX, "79.19-taobao-待确认-军绿多口袋工装阔腿裤.jpg", (55, 275, 437, 790)),
    "b27e805b9f1b5c37900a714e69419a39.jpg": (INBOX, "62.99-taobao-UniqueSEI-米白泡泡袖翻领排扣衬衫.jpg", (0, 95, 486, 782)),
}

# 商品 id -> 用于 items/ 展示图与缩略图
PRODUCT_FILES = {
    "olive-cargo-wide-pants": "79.19-taobao-待确认-军绿多口袋工装阔腿裤.jpg",
    "sage-green-double-breasted-hoodie": "218-taobao-盐渍青梅jk-灰绿双排扣连帽卫衣.jpg",
    "cream-puff-sleeve-collar-blouse": "62.99-taobao-UniqueSEI-米白泡泡袖翻领排扣衬衫.jpg",
}

def palette(path, n=6):
    im = Image.open(path).convert("RGB")
    im.thumbnail((120, 120))
    q = im.quantize(colors=n, method=Image.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    out = []
    for cnt, idx in counts:
        r, g, b = pal[idx*3:idx*3+3]
        out.append({"hex": "#%02x%02x%02x" % (r, g, b), "share": round(cnt / (im.width*im.height), 3)})
    return out

result = {"inspo": {}, "products": {}}
for h, (dest, name, crop) in CATALOG.items():
    src_path = os.path.join(SRC, h)
    shutil.copy2(src_path, os.path.join(ORIG, h))          # 原图归档
    dst = os.path.join(dest, name)
    im = Image.open(src_path)
    if crop:
        im = im.crop(crop)
        im.convert("RGB").save(dst, quality=88)            # 商品展示图
        result["products"][name] = {"size": im.size, "palette": palette(dst)}
    else:
        shutil.copy2(src_path, dst)                        # 参考穿搭原图
        result["inspo"][name] = palette(dst)

# 商品 items/<id>.jpg + thumbs/<id>.jpg
for pid, fname in PRODUCT_FILES.items():
    im = Image.open(os.path.join(INBOX, fname)).convert("RGB")
    im.save(os.path.join(ITEMS, pid + ".jpg"), quality=88)
    t = im.copy(); t.thumbnail((800, 800))
    t.save(os.path.join(THUMBS, pid + ".jpg"), quality=85)

with open(os.path.join(ROOT, "tmp", "batch1-analysis.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print("OK  inspo:", len(result["inspo"]), " products:", len(result["products"]))
