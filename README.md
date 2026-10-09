# AI 衣橱管家

> 一个**本地优先**的个人衣橱 + 私人造型顾问 Web 应用。把商品图归档成结构化单品库，自动建立你的风格画像，评估新衣服值不值得买，生成 flat lay 搭配预览图，并标出该断舍离的旧衣服。

## 它解决什么问题

买衣服前凭感觉、衣橱里永远「没有衣服穿」、旧衣服舍不得扔——这个工具用**可执行规则 + 明确公式**，把「时尚黑话」变成你能直接用的结论：

- 这件新衣服和我的风格搭不搭？闲置概率多少？
- 我到底偏什么风格？色板 / 廓形 / 材质一眼看清。
- 手里这些衣服能凑出几套搭配？
- 哪些旧衣服该断舍离？

## 六大模块

| 模块 | 功能 | 关键产出 |
| --- | --- | --- |
| 一 批量入库 | 拖图 → 解析 `{价格}-{平台}-{品牌}-{简述}` 文件名 → 填元数据 → 入库 | `library.json` |
| 二 风格画像 | 发穿搭照 → 视觉模型整体覆盖冷启动值，量化色板 / 廓形 / 材质 / 摄影偏好 | `style-profile.json` |
| 三 购买评估 | 按写死公式打分（色彩40 / 廓形20 / 材质15 / 场合15 / 价位10）+ 闲置概率分档 | `reports/{slug}.md` |
| 四 搭配性 | 一键算出 ≥3 套可搭配方案，凑不齐就报闲置风险 | 搭配清单 |
| 五 flat lay 预览 | 1080×1920 纯白程序化拼贴，不漏件、不凭空加装饰 | `outfits/{id}.png` |
| 六 断舍离 | 三因子风险分（风格偏离 + 搭配度 + 闲置），标出可丢弃 / 可观察 | 风险清单 |

## 当前衣橱快照（2026-09 批次）

- **44 件单品**：上装 25 / 下装 15 / 外套 3 / 配饰 1
- **来源**：淘宝 36、拼多多 4、1688 4
- **价格**：¥12 – ¥153（中位数约 ¥55，90% 在 ¥100 以内）
- **风格画像**：低饱和蓝灰绿棕 + 黑白骨架的「日系 cityboy × 韩系松弛 × 轻工装」，带 y2k 复古底色；下装永远宽松（阔腿 / 伞裤 / 直筒牛仔），黑色厚底乐福 + 黑包是固定收尾；拒绝大 logo 与荧光色。

## 设计原则（不可改动的硬约束）

1. **不爬电商站**。主入口是 `wardrobe/inbox/` 文件夹，你把商品图另存进去；不主动爬淘宝 / 拼多多 / 京东。
2. **图片处理不重绘商品**。去背景只用分割模型（RMBG / BiRefNet / U²-Net / SAM）；flat lay 只用 `sharp` / `Pillow` 程序化合成，**禁止任何文生图 / 图生图模型**（会自加咖啡杯、绿植、首饰并改色）。
3. **数据只用本地 JSON**。`library.json` 是唯一数据源，不用 SQLite / Postgres。
4. **API key 走环境变量**（`WARDROBE_VISION_*`、`WARDROBE_LLM_*`、`RMBG_MODEL_PATH`），不写死进代码。
5. **诚实优先**：抓不到就标 `[待确认]`，不编造品牌 / 价格 / 材质；所有原始图片原样保留，中间产物放 `tmp/`。

> **关于商品图形态**：本项目实际采用**裁剪版 JPG**——用抠图掩膜定位衣服主体边界框、紧裁原图（零像素重绘），截掉截图里的状态栏 / 价格条 / 悬浮按钮等 UI 文字，保留衣服形态。透明 PNG 抠图成品仍备份在 `wardrobe/tmp/matte-out/final/`，但不再进应用（详见 `app/README.md`）。

## 技术栈

- **前端**：零构建、零依赖——原生 HTML / CSS / JS + 浏览器 IndexedDB。图片处理全在 Canvas，模型调用走 OpenAI 兼容 `/chat/completions`。
- **脚本**：Python（`wardrobe/scripts/`）做离线图片处理（裁剪、色板量化、风格分析）。
- **测试**：`tools/smoke-v2.js`（playwright-core 冒烟，26 项）。

## 目录结构

```
穿搭/
├── app/                    # Web 应用（发布为静态站点）
│   ├── index.html          # 单页入口
│   ├── assets/             # css + js（store / target / evaluate / mix / discard ...）
│   ├── data/               # items/ thumbs/ 裁剪 JPG + library.json
│   └── README.md           # 站内技术说明
├── wardrobe/               # 数据 + 脚本（Agent 工作区）
│   ├── AGENT-PROMPT.md     # 整段系统 prompt，可贴给任意 Agent 复现工作流
│   ├── scripts/            # intake / crop_ui / matte / 风格分析
│   ├── library.json        # 单品数据库（唯一数据源）
│   ├── style-profile.json  # 风格画像
│   ├── outfits.json        # 搭配清单
│   ├── originals/          # 原图归档（私人截图，公开仓库内含）
│   ├── reports/            # 新衣服评估报告
│   └── tmp/                # 中间产物（406M，未入库 .gitignore）
├── tools/                  # 冒烟测试
└── README.md               # 本文件
```

## 本地运行

必须走 http 打开（IndexedDB 在 `file://` 下不可用）：

```bash
cd app
python -m http.server 8777
# 浏览器打开 http://127.0.0.1:8777
```

也可以用 `python -m http.server 8777 --directory app`。数据存浏览器 IndexedDB；「导出全部 zip」按 `items/{slug}.jpg` + `thumbs/` + `outfits/` 结构打包，可直接落回 `wardrobe/`。

## 数据导入 / 导出

- **入库**：拖图到「批量入库」，文件名带上 `{价格}-{平台}-{品牌}-{简述}` 可省手填。
- **导入 zip**：与导出同结构，合并式不清空现有衣橱，`style-profile.json` 不覆盖。
- **导出**：JSON 全量 + zip 图片全量，随时可迁移。

## 复刻这套工作流

整段系统 prompt 在 `wardrobe/AGENT-PROMPT.md`（v3），整段发给任何支持文件 / 图片 / API 的 Agent（豆包、Codex、Claude、WorkBuddy、DeepSeek Agent）即可复现同一套流程。

## 线上地址

- 静态站点：**https://ai-wardrobe-79581.app.workbuddy.host/**
- 代码仓库：**https://github.com/caojingzhi1015-bit/ai-wardrobe**（Public）

> **隐私提示**：公开仓库内的 `wardrobe/originals/` 含约 70M 微信聊天记录截图（私人消费记录）。如介意，建议改为 Private，或将该目录加入 `.gitignore` 后清理 git 历史。
