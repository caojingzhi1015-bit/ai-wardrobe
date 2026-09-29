# -*- coding: utf-8 -*-
"""单品区域补丁采样 v2：相对坐标（比例），并打印实际尺寸"""
import json, os
from PIL import Image

SRC = r"D:\xwechat_files\wxid_0fozf2qgws8o22_c057\temp\RWTemp\2026-09\9e20f478899dc29eb19741386f9343c8"
ROOT = r"D:\KuGou\Lyric\穿搭\wardrobe"
INBOX = os.path.join(ROOT, "inbox")
ITEMS = os.path.join(ROOT, "items")
THUMBS = os.path.join(ITEMS, "thumbs")

# (hash, 相对box(x0,y0,x1,y1))
PATCHES = {
    "天蓝伞裤(03cd)":   ("03cd60089398f9d6af58c143914ebf7c.png", (.40, .62, .72, .84)),
    "天蓝伞裤(5336)":   ("53360106e4873bee35bc9442c0f60ffa.png", (.45, .60, .80, .84)),
    "军绿工装(5b87)":   ("5b8768f288db060de4324b223dea0880.png", (.30, .60, .72, .84)),
    "军绿工装(6c1e)":   ("6c1e7802dc3678529eaf3e0d3941203d.jpg", (.35, .58, .72, .84)),
    "深灰工装(9bbf)":   ("9bbf05d41d8a7839b20a90a1ab39d798.png", (.35, .58, .75, .84)),
    "深灰工装(dbdf)":   ("dbdfffedd3765ad7baf1d80dff4f61f2.png", (.32, .60, .75, .86)),
    "藏青开衫(169b)":   ("169bea07d5baef2f679e5ac15783fef3.png", (.30, .20, .58, .40)),
    "藏青卫衣(8e16)":   ("8e16214b092543e876d89f4dd1d7b922.png", (.30, .35, .62, .55)),
    "卡其工装(2ccb)":   ("2ccbf952881ef4f40007bedec7c78cb1.jpg", (.28, .42, .58, .68)),
    "卡其直筒(b43b)":   ("b43b576c66ad3c66e65cd4f6448f0be9.png", (.35, .55, .70, .85)),
    "中蓝牛仔(5bbf)":   ("5bbfdfbf020a375636a0e3fbefc5d63a.png", (.35, .55, .70, .85)),
    "深靛牛仔(04a3)":   ("04a3c3c54f8e61420056dfb39a48ef55.png", (.38, .52, .72, .85)),
    "灰绿卫衣(1477)":   ("14774736c1223b44090e1b997cf9cd71.jpg", (.25, .25, .70, .55)),
    "米白衬衫(b27e)":   ("b27e805b9f1b5c37900a714e69419a39.jpg", (.22, .18, .72, .45)),
    "黑锥形裤(622b)":   ("622bc03cfa37216024c757c38008555e.jpg", (.38, .55, .72, .88)),
}

def mean_rgb(im, fx):
    w, h = im.size
    box = (int(fx[0]*w), int(fx[1]*h), int(fx[2]*w), int(fx[3]*h))
    px = im.crop(box).resize((16, 16))
    data = list(px.getdata())
    n = len(data)
    r = sum(p[0] for p in data) // n
    g = sum(p[1] for p in data) // n
    b = sum(p[2] for p in data) // n
    return "#%02x%02x%02x" % (r, g, b)

out = {}
for k, (h, fx) in PATCHES.items():
    im = Image.open(os.path.join(SRC, h)).convert("RGB")
    out[k] = mean_rgb(im, fx)
    print(k, im.size, out[k])

# 裤子商品图（重裁后的 inbox 文件）
im = Image.open(os.path.join(INBOX, "79.19-taobao-待确认-军绿多口袋工装阔腿裤.jpg"))
out["裤子商品图(裤腿)"] = mean_rgb(im, (.20, .50, .60, .82))
print("裤子商品图", im.size, out["裤子商品图(裤腿)"])

with open(os.path.join(ROOT, "tmp", "batch1-patches.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("DONE")
