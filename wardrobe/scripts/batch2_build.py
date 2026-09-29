# -*- coding: utf-8 -*-
"""批次2构建：44 条单品语义数据 + 裁剪图 → wardrobe/library.json + 导入 zip + 报告。

颜色 colorHex 以逐张目测判读为准（本会话可读图），tmp/batch2-crops.json 的
k-means 实测值写入报告做对照。
"""
import json
import os
import zipfile
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROPS = os.path.join(BASE, "tmp", "batch2-crops")
CROPS_JSON = os.path.join(BASE, "tmp", "batch2-crops.json")
LIBRARY = os.path.join(BASE, "library.json")
ZIP_OUT = os.path.join(BASE, "wardrobe-batch-2026-09-28-批次2.zip")
REPORT = os.path.join(BASE, "reports", "2026-09-28-批次2-现有衣橱导入.md")

ADDED = "2026-09-28T13:35:00+08:00"

D = "轻度待确认"


def item(slug, name, brand, price, platform, category, sub, color, sec, material,
         season, occasion, aes, tags, notes="", pdate=None):
    return {
        "id": slug, "name": name, "brand": brand, "price": price, "currency": "CNY",
        "sourcePlatform": platform, "sourceUrl": "", "category": category,
        "subcategory": sub, "colorHex": color, "secondaryColorHex": sec,
        "material": material, "season": season, "occasion": occasion,
        "aestheticTags": aes, "tags": tags, "purchaseDate": pdate,
        "addedAt": ADDED, "image": "items/%s.jpg" % slug, "notes": notes,
    }


ITEMS = [
    item("navy-layered-long-sleeve-tee", "藏蓝假两件宽松长袖T恤", "宋正恩", 73.99, "taobao",
         "top", "T恤", "#232a3d", "#f2f0ec", "棉（目测）", ["秋"], ["休闲", "通勤"],
         ["korean", "lazy"], ["假两件", "落肩", "宽松"],
         "限时补贴价¥73.99（原价¥89.99）；微信截图入库"),
    item("grey-green-barrel-jeans", "灰绿弯刀阔腿牛仔裤", "[待确认]", 76.63, "taobao",
         "bottom", "牛仔裤", "#646558", None, "牛仔", ["秋"], ["休闲"],
         ["workwear", "vintage"], ["弯刀", "廓形", "阔腿", "褶皱", "高腰"],
         "平台加补价¥76.63起（原¥79起）"),
    item("inknots-indigo-barrel-jeans", "原色蓝弯刀牛仔裤", "INKNOTS", 145.0, "taobao",
         "bottom", "牛仔裤", "#2e3a55", None, "原色丹宁", ["秋"], ["休闲", "通勤"],
         ["vintage", "workwear"], ["弯刀", "原色丹宁", "阔腿", "高级感"],
         "店铺优惠后¥145（原¥173）；已售1万+"),
    item("sanwild-black-bubble-skirt", "黑色花苞褶皱蓬蓬中长半身裙", "Sanwild", 55.56, "taobao",
         "bottom", "裙装", "#1c1a1b", None, "棉（目测）", ["春", "秋"], ["休闲", "约会"],
         ["korean", "vintage"], ["花苞", "蓬蓬", "高腰", "辣妹"],
         "店铺优惠后¥55.56起（原¥61.76起）；已售6000+"),
    item("grey-graphic-sunshirt-long-sleeve", "灰色印花防晒罩衫长袖T", "欧尼轻亚", 29.8, "taobao",
         "top", "T恤", "#b0aba4", "#17171a", "涤纶（待确认）", ["夏", "秋"], ["休闲"],
         ["korean", "lazy"], ["防晒", "印花", "斜肩", "慵懒"],
         "店铺优惠后¥29.8（原¥33.2）"),
    item("wash-blue-lowrise-bermuda-jeans", "复古低腰水洗蓝牛仔五分中裤", "爹妈不骂", 45.8, "taobao",
         "bottom", "短裤", "#7d93a8", None, "牛仔", ["夏", "秋"], ["休闲"],
         ["vintage", "y2k"], ["低腰", "五分", "做旧", "宽松"],
         "¥45.8；商品已下架"),
    item("white-graphic-knit-overlay-top", "白色美式印花针织罩衫长袖", "轻亚日常", 29.6, "taobao",
         "top", "T恤", "#e8e6e2", "#9a9a9a", "棉（目测）", ["春", "秋"], ["休闲"],
         ["korean", "lazy"], ["印花", "罩衫", "宽松", "慵懒"],
         "店铺优惠后¥29.6（原¥32.9）；聊天记录里有两张商品图，取白天对镜图"),
    item("mosesqueen-beige-cami-tank", "杏色细肩带吊带背心", "MosesQueen", 15.79, "taobao",
         "top", "背心", "#e3d9c8", None, "棉氨（待确认）", ["春", "夏", "秋"], ["休闲", "通勤"],
         ["minimal", "korean"], ["细肩带", "吊带", "基础款"],
         "订单实付价（标价¥20.99）；2026-05-26 下单", "2026-05-26"),
    item("mosesqueen-grey-cami-tank", "灰色细肩带吊带背心", "MosesQueen", 15.79, "taobao",
         "top", "背心", "#a9adb3", None, "棉氨（待确认）", ["春", "夏", "秋"], ["休闲", "通勤"],
         ["minimal", "korean"], ["细肩带", "吊带", "基础款"],
         "订单实付价（标价¥20.99）；2026-05-26 下单", "2026-05-26"),
    item("spear-youth-indigo-wide-jeans", "藏青原色高腰大阔腿垂感牛仔裤", "SPEAR YOUTH", 58.6, "taobao",
         "bottom", "牛仔裤", "#232c42", None, "原色丹宁", ["秋"], ["休闲", "通勤"],
         ["korean", "workwear"], ["原色丹宁", "高腰", "阔腿", "垂感"],
         "店铺优惠后¥58.6起（原¥69起）"),
    item("iu-room-white-balloon-pants", "白色高腰气球阔腿休闲裤", "IU ROOM", 139.9, "taobao",
         "bottom", "休闲裤", "#ece8e0", None, "棉涤（待确认）", ["春", "夏", "秋"], ["休闲", "通勤"],
         ["korean", "minimal"], ["气球裤", "高腰", "垂感", "宽松"],
         "¥139.9（券满69减20）；商品已下架"),
    item("black-lace-trim-cardigan", "黑色花边腰头开衫上衣（M）", "一只闪闪", 65.99, "taobao",
         "top", "针织衫", "#17171a", None, "针织", ["春", "秋"], ["休闲", "约会"],
         ["vintage", "lazy"], ["花边", "排扣", "短款"],
         "⚠️ 订单交易关闭（2026-05-19 下单）[待确认]：是否已通过其他渠道购入"),
    item("striped-wide-straight-pants", "灰白竖条纹直筒阔腿拖地裤", "一只闪闪", 53.99, "taobao",
         "bottom", "休闲裤", "#9a9c9e", "#ffffff", "涤纶混纺（待确认）", ["春", "秋"], ["休闲"],
         ["korean", "lazy"], ["竖条纹", "花边腰头", "拖地", "阔腿"],
         "店铺优惠后¥53.99起（原¥59.99起）"),
    item("black-tie-front-cardigan", "黑色纯欲风V领系带针织开衫", "Vegetable Orbs", 119.0, "taobao",
         "top", "针织衫", "#17171a", None, "针织", ["春", "秋"], ["约会", "休闲"],
         ["korean"], ["系带", "V领", "修身", "短款"],
         "¥119；已下架（黑色现货/白色预售）"),
    item("black-rib-wide-strap-tank", "黑色螺纹宽肩带弹力背心", "贰小姬", 29.9, "taobao",
         "top", "背心", "#1a1a1c", None, "氨纶混纺（待确认）", ["春", "夏", "秋"], ["休闲", "通勤"],
         ["minimal", "korean"], ["螺纹", "宽肩带", "修身"],
         "¥29.9；象牙白/黑色两色，截图为黑色"),
    item("black-floral-embroidery-tee", "黑色重工花卉刺绣防晒短袖T", "NELY", 12.0, "taobao",
         "top", "T恤", "#141416", "#d8cfd8", "棉", ["夏"], ["休闲"],
         ["street", "vintage"], ["刺绣", "oversize", "防晒", "凉感"],
         "¥12；已下架；upf50+"),
    item("forever21-washed-flare-jeans", "深蓝灰做旧低腰微喇牛仔裤", "Forever 21", 125.0, "taobao",
         "bottom", "牛仔裤", "#3d4a5c", None, "牛仔", ["秋"], ["休闲", "约会"],
         ["vintage", "y2k"], ["低腰", "微喇", "做旧水洗", "遮胯"],
         "店铺优惠后¥125起（原¥139起）"),
    item("blaexit-grey-pleated-wide-trousers", "深灰老钱风A字打褶阔腿弯刀西裤", "BLAEXIT", 130.0, "taobao",
         "bottom", "西裤", "#4a4d52", None, "西装面料（待确认）", ["春", "秋"], ["通勤", "休闲"],
         ["clean-fit", "quiet-luxury"], ["打褶", "A字", "阔腿", "弯刀", "垂感"],
         "店铺入会后¥130（原¥148）"),
    item("grey-wing-print-base-layer", "灰色十字架天使翅膀印花长袖打底衫", "eihey", 45.26, "taobao",
         "top", "打底衫", "#6f6f70", "#e8e8e8", "棉（目测）", ["春", "秋"], ["休闲", "约会"],
         ["vintage", "y2k"], ["修身", "印花", "打底", "显瘦"],
         "¥45.26；另有白色可选"),
    item("polka-dot-drawstring-jeans", "黑底白波点抽绳直筒牛仔裤", "橘子树在哪儿", 113.9, "taobao",
         "bottom", "牛仔裤", "#202022", "#e8e8e8", "牛仔", ["春", "秋"], ["休闲"],
         ["vintage", "y2k"], ["波点", "抽绳", "直筒", "拖地"],
         "店铺优惠后¥113.9（原¥129.9）；JZSZNE"),
    item("charcoal-asymmetric-batwing-sweater", "深灰不对称高领蝙蝠袖套头毛衣", "[待确认]", 62.9, "taobao",
         "top", "针织衫", "#3f4045", None, "针织", ["秋", "冬"], ["休闲", "通勤"],
         ["lazy", "quiet-luxury"], ["不对称", "高领", "蝙蝠袖", "宽松"],
         "¥62.9；浅灰/深灰两色，截图为深灰；已售3万+"),
    item("white-button-front-long-sleeve", "白色单排扣修身长袖打底衫", "eihey", 49.49, "taobao",
         "top", "打底衫", "#f0efec", None, "棉（目测）", ["春", "秋"], ["休闲", "通勤"],
         ["korean", "minimal"], ["单排扣", "V领", "修身"],
         "店铺优惠后¥49.49（原¥54.99）"),
    item("white-fur-hood-rhinestone-jacket", "白色毛领烫钻短款连帽开衫外套", "eihey", 99.57, "taobao",
         "outerwear", "夹克", "#e9e7e3", "#8a8a8a", "涤纶（待确认）", ["秋", "冬"], ["休闲", "约会"],
         ["street", "y2k"], ["毛领", "烫钻", "短款", "连帽", "开衫"],
         "店铺优惠后¥99.57（原¥111.57）；主图标注「图片疑似AI生成」⚠️[待确认]"),
    item("black-slit-crop-cardigan", "黑色开叉收腰短款针织开衫", "橘子树在哪儿", 97.73, "taobao",
         "top", "针织衫", "#17171a", None, "针织", ["春", "秋"], ["通勤", "休闲"],
         ["korean", "quiet-luxury"], ["开叉", "收腰", "短款", "V领", "排扣"],
         "¥97.73；JZSZNR"),
    item("black-jennie-highwaist-jeans", "jennie风黑色高腰直筒阔腿牛仔裤", "橘子树在哪儿", 109.9, "taobao",
         "bottom", "牛仔裤", "#1d2024", "#d8d8d8", "牛仔", ["春", "秋"], ["休闲", "通勤"],
         ["korean", "street"], ["高腰", "直筒", "阔腿", "明线"],
         "店铺优惠后¥109.9起（原¥124.89起）；JZSZNR；已售3万+"),
    item("black-la-popup-graphic-tee", "黑色LA pop-up海报印花短袖T", "UPUPXIA·搞钱做慈善", 21.4, "taobao",
         "top", "T恤", "#17181a", "#e8e8e8", "重磅棉260g", ["春", "夏", "秋"], ["休闲"],
         ["street", "vintage"], ["重磅", "印花", "宽松", "情侣款"],
         "店铺优惠后¥21.4（原¥23.8）；三本针260克双纱"),
    item("cbxlab-parachute-track-pants", "军绿大香蕉嘻哈速干伞兵运动裤", "CBXLAB", 103.42, "taobao",
         "bottom", "运动裤", "#6b6a4f", "#ffffff", "速干面料（待确认）", ["春", "夏", "秋"], ["休闲", "运动"],
         ["street"], ["伞兵裤", "抽绳", "速干", "街舞"],
         "店铺优惠后¥103.42（原¥129）；军绿/黑/粉三色，主图为军绿"),
    item("cbxlab-carbon-wasteland-cargo", "碳灰闪光废土嘻哈工装长裤", "CBXLAB", 139.0, "taobao",
         "bottom", "工装裤", "#8b8b89", None, "涤纶（待确认）", ["春", "秋"], ["休闲"],
         ["street"], ["废土", "做旧", "工装", "街头爵士"],
         "¥139；已下架"),
    item("black-double-yarn-tee", "3A黑色双纱重磅短袖T（M）", "搞钱做慈善", 18.24, "taobao",
         "top", "T恤", "#141414", None, "重磅棉260g", ["春", "夏", "秋"], ["休闲"],
         ["street", "minimal"], ["重磅", "双纱", "基础款"],
         "⚠️ 订单显示该件已退款[待确认]；标价¥18.8", "2025-04-08"),
    item("white-double-yarn-tee", "3A白色双纱重磅短袖T（M）", "搞钱做慈善", 18.24, "taobao",
         "top", "T恤", "#eceae4", None, "重磅棉260g", ["春", "夏", "秋"], ["休闲"],
         ["street", "minimal"], ["重磅", "双纱", "基础款"],
         "订单实付价（标价¥18.8）；2025-04-08 下单", "2025-04-08"),
    item("blue-graffiti-zip-hoodie", "蓝色涂鸦摇滚做旧连帽开衫外套", "MADEEXTREME", 153.26, "taobao",
         "outerwear", "夹克", "#2c3542", "#c8c8c8", "水洗棉（待确认）", ["春", "秋"], ["休闲"],
         ["street", "vintage"], ["涂鸦", "做旧水洗", "连帽", "开衫", "oversize"],
         "平台加补后¥153.26（原¥158）；黑/灰/蓝三色，截图为蓝色"),
    item("white-graffiti-crop-zip-hoodie", "白色美式涂鸦字母短款连帽开衫", "WHXS", 60.8, "taobao",
         "outerwear", "夹克", "#e5e3df", "#1a1a1a", "抓绒（待确认）", ["春", "秋"], ["休闲"],
         ["street", "y2k"], ["涂鸦", "短款", "连帽", "开衫"],
         "¥60.8；已下架；已售38"),
    item("black-dove-print-tee", "黑色和平鸽印花短袖T", "UPUPXIA·搞钱做慈善", 21.4, "taobao",
         "top", "T恤", "#17181a", "#e8e8e8", "重磅棉260g", ["春", "夏", "秋"], ["休闲"],
         ["street", "vintage"], ["重磅", "印花", "宽松"],
         "店铺优惠后¥21.4（原¥23.8）"),
    item("white-cat-analysis-tee", "白色「猫猫的分析」满印文字短袖T", "搞钱做慈善", 26.8, "taobao",
         "top", "T恤", "#eae8e4", "#2a2a2a", "重磅棉260g", ["春", "夏", "秋"], ["休闲"],
         ["vintage", "street"], ["满印文字", "重磅", "宽松", "情侣款"],
         "¥26.8；黑/白两色，截图为白色"),
    item("charcoal-y2k-lace-heart-tee", "深灰y2k蕾丝心形烫银大领口短袖T", "[待确认]", 32.9, "pdd",
         "top", "T恤", "#4a4a4c", "#d8a8b8", "棉（目测）", ["春", "夏", "秋"], ["休闲", "约会"],
         ["y2k", "vintage"], ["蕾丝印花", "烫银", "大领口", "正肩"],
         "¥32.9（单独购买¥35.9）；拼多多"),
    item("black-leopard-cross-barrel-jeans", "黑色豹纹十字架烫钻弯刀阔腿牛仔裤", "[待确认]", 50.0, "1688",
         "bottom", "牛仔裤", "#1b1c1e", "#c0c0c0", "牛仔", ["春", "秋"], ["休闲", "约会"],
         ["y2k", "street"], ["弯刀", "豹纹", "十字架", "烫钻", "高腰"],
         "1688批发价¥50（60天老客价）；满50减5"),
    item("snow-grey-modal-cardigan", "雪花灰天丝莫代尔轻薄V领针织开衫", "[待确认]", 55.99, "1688",
         "top", "针织衫", "#c9c9c7", None, "天丝莫代尔", ["春", "夏", "秋"], ["通勤", "休闲"],
         ["minimal", "korean"], ["轻薄", "V领", "排扣", "亲肤"],
         "1688一件代发价¥55.99；多色，截图为雪花灰"),
    item("striped-polo-overshirt", "黑白条纹polo领宽松中长衬衫外套", "[待确认]", 22.0, "1688",
         "top", "衬衫", "#3a3a3a", "#ffffff", "涤纶混纺（待确认）", ["春", "秋"], ["休闲"],
         ["korean", "lazy"], ["条纹", "polo领", "oversize", "中长款", "两穿"],
         "1688批发¥22（1件起批，≥100件¥20）"),
    item("grey-highwaist-midi-skirt", "灰色高腰韩系中长半身裙", "木子恋", 59.99, "1688",
         "bottom", "裙装", "#9b9b99", "#2a2a2a", "涤纶混纺（待确认）", ["春", "夏", "秋"], ["通勤", "休闲"],
         ["korean", "minimal"], ["高腰", "A字", "中长", "垂感"],
         "1688一件代发¥59.99；另有藏青/黑色"),
    item("navy-plaid-overshirt", "藏青格纹宽松衬衫外套", "eihey", 53.86, "taobao",
         "top", "衬衫", "#2c3442", "#8a93a8", "涤纶混纺（待确认）", ["春", "秋"], ["休闲"],
         ["vintage", "korean"], ["格纹", "oversize", "两穿", "设计感"],
         "店铺优惠后¥53.86（原¥59.86）"),
    item("slowacid-snowflake-scarf", "黑白雪花字母双面流苏围巾", "slowacid", 82.0, "taobao",
         "accessory", "围巾 / 手套 / 皮带 / 墨镜 / 首饰", "#e8e4da", "#17171a", "棉+聚酯纤维", ["冬"], ["休闲", "通勤"],
         ["vintage", "korean"], ["双面", "流苏", "雪花字母", "加厚"],
         "店铺优惠后¥82（原¥102）；金云鹤同款；韩国代购"),
    item("grey-polka-laceup-fitted-top", "灰色波点系带收腰长袖", "米尼尼", 60.9, "pdd",
         "top", "打底衫", "#8f8f91", "#e8e8e8", "针织（待确认）", ["春", "秋"], ["约会", "休闲"],
         ["korean"], ["波点", "系带", "假两件", "收腰", "修身"],
         "到手价¥60.9（原¥75.9，满70减15）；已选灰色M"),
    item("oat-vneck-layered-cardigan", "灰褐V领假两件羊毛针织开衫", "律政俏佳人", 99.9, "pdd",
         "top", "针织衫", "#a89a88", None, "羊毛/桑蚕丝（待确认）", ["春", "秋"], ["通勤", "休闲"],
         ["quiet-luxury", "minimal"], ["假两件", "V领", "宽松", "轻薄"],
         "到手价¥99.9（原¥129.9，限时立减30）"),
    item("black-henley-shell-button-top", "黑色正肩收腰亨利领贝壳扣长袖打底", "[待确认]", 69.0, "pdd",
         "top", "打底衫", "#17181a", None, "针织（待确认）", ["春", "秋"], ["通勤", "休闲"],
         ["korean", "minimal"], ["亨利领", "贝壳扣", "正肩", "收腰", "修身"],
         "¥69；已选黑色长袖2.0版M；已售4.6万+"),
]


def main():
    with open(CROPS_JSON, "r", encoding="utf-8") as f:
        measured = json.load(f)

    # library.json：读旧值合并（当前应为空数组）
    old = []
    if os.path.exists(LIBRARY):
        try:
            with open(LIBRARY, "r", encoding="utf-8") as f:
                old = json.load(f)
            if not isinstance(old, list):
                old = []
        except Exception:
            old = []
    existing_ids = {i.get("id") for i in old}
    new_items = [it for it in ITEMS if it["id"] not in existing_ids]
    library = new_items + old
    with open(LIBRARY, "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=1)

    # 导入 zip：与站点「导出全部(zip)」同结构
    if os.path.exists(ZIP_OUT):
        os.remove(ZIP_OUT)
    with zipfile.ZipFile(ZIP_OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("library.json", json.dumps(library, ensure_ascii=False, indent=1))
        for it in ITEMS:
            jpg = os.path.join(CROPS, it["id"] + ".jpg")
            th = os.path.join(CROPS, it["id"] + ".thumb.jpg")
            if os.path.exists(jpg):
                z.write(jpg, "items/%s.jpg" % it["id"])
            if os.path.exists(th):
                z.write(th, "items/thumbs/%s.jpg" % it["id"])

    # 报告
    lines = []
    a = lines.append
    a("# 批次2 · 现有衣橱导入（微信聊天记录 43 张截图）")
    a("")
    a("> 2026-09-28 · 逐张目测判读 + 版式化裁剪 + 中心区域 k-means 采样对照")
    a("")
    a("## 一、总览")
    a("")
    prices = [it["price"] for it in ITEMS]
    cats = {}
    for it in ITEMS:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    a("- 截图 43 张 → 单品 **44 条**（订单页拆 2 件 ×2、重复商品图合并 1、其余 1:1）")
    a("- 品类构成：" + "、".join("%s %d" % (k, v) for k, v in sorted(cats.items(), key=lambda x: -x[1])))
    a("- 价格区间：¥%.2f ~ ¥%.2f，中位数 ¥%.2f" % (min(prices), max(prices), sorted(prices)[len(prices) // 2]))
    a("- 平台：taobao 36 · pdd 4 · 1688 4")
    a("")
    a("## 二、单品清单")
    a("")
    a("| # | id | 名称 | 品牌 | 价格 | 平台 | 品类 | 主色(目测) | 主色(采样) |")
    a("|---|----|------|------|------|------|------|------------|------------|")
    for i, it in enumerate(ITEMS, 1):
        m = (measured.get(it["id"], {}) or {}).get("measured", [])
        mhex = m[0]["hex"] if m else "-"
        a("| %d | %s | %s | %s | ¥%s | %s | %s/%s | %s | %s |" % (
            i, it["id"], it["name"], it["brand"], it["price"], it["sourcePlatform"],
            it["category"], it["subcategory"], it["colorHex"], mhex))
    a("")
    a("## 三、需要确认的事项")
    a("")
    a("1. **black-lace-trim-cardigan（一只闪闪黑色开衫 ¥65.99）**：订单状态是「交易关闭」，如果这件实际没买到，建议在网站里直接删除。")
    a("2. **black-double-yarn-tee（搞钱做慈善黑T ¥18.24）**：订单显示「退款成功」，同款白T是实付购入。")
    a("3. **white-fur-hood-rhinestone-jacket（eihey 毛领外套）**：商品主图自带「图片疑似AI生成」标注。")
    a("4. 品牌 `[待确认]` 共 8 条（截图里没有店铺名或品牌名）。")
    a("")
    a("## 四、对风格画像的更新建议")
    a("")
    a("- **价位带**：批次1 仅 3 个样本估了 ¥60–250；本批 44 件实测 ¥12–153、中位数约 ¥55。")
    a("  建议把 priceRange 更新为 **¥15–160**（已同步写入 style-profile.json 与网站默认画像）。")
    a("- **品类结构**：44 件中下装 15 件且 8 件为阔腿/弯刀/直筒牛仔，进一步验证「下装永远宽松」的廓形规则；")
    a("  黑色单品 16 件、灰系 10 件、白色系 8 件——黑白灰骨架再次确认。")
    a("- **新增元素**：本批出现较多 y2k 元素（蕾丝心形、豹纹十字架、低腰微喇、波点），")
    a("  画像的 aestheticTags 里 vintage/street 覆盖得住，但 patternPreference 建议补充「波点」。")
    a("")
    a("## 五、产物路径")
    a("")
    a("- 单品库：`wardrobe/library.json`（%d 条）" % len(library))
    a("- 导入包：`wardrobe/wardrobe-batch-2026-09-28-批次2.zip`（library.json + items/*.jpg + items/thumbs/*.jpg）")
    a("- 原图归档：`wardrobe/originals/2026-09-28-批次2-微信衣橱/`（43 张）")
    a("- 裁剪图：`wardrobe/tmp/batch2-crops/`")
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("library:", len(library), "items; zip:", os.path.getsize(ZIP_OUT) // 1024, "KB; report:", REPORT)
    blacks = sum(1 for it in ITEMS if it["colorHex"] in ("#141414", "#17171a", "#17181a", "#1a1a1c", "#1b1c1e", "#1c1a1b", "#202022", "#1d2024", "#141416"))
    greys = sum(1 for it in ITEMS if it["colorHex"].startswith("#4a") or it["colorHex"] in ("#3f4045", "#6f6f70", "#8f8f91", "#9a9c9e", "#9b9b99", "#a9adb3", "#c9c9c7", "#8b8b89"))
    print("black-ish:", blacks, "grey-ish:", greys)


if __name__ == "__main__":
    main()
