/* store.js — 数据层：IndexedDB（kv 存 JSON，images 存图片 Blob）
   library.json 是唯一数据源；这里只是它的浏览器宿主。 */
(function (W) {
  'use strict';
  var S = (W.store = {});
  var DB_NAME = 'wardrobe';
  var DB_VER = 1;
  var db = null;

  var IMG_KEY = {
    orig: function (slug) { return 'orig/' + slug; },
    png: function (slug) { return 'png/' + slug; },
    jpg: function (slug) { return 'jpg/' + slug; },
    thumb: function (slug) { return 'thumb/' + slug; },
    outfit: function (id) { return 'outfit/' + id; }
  };
  S.IMG_KEY = IMG_KEY;

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  S.init = function () {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      if (!window.indexedDB) return reject(new Error('当前环境不支持 IndexedDB（请用 http 本地服务打开，不要用 file:// 直接双击）'));
      var open = indexedDB.open(DB_NAME, DB_VER);
      open.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images');
      };
      open.onsuccess = function (e) { db = e.target.result; resolve(db); };
      open.onerror = function () { reject(open.error || new Error('IndexedDB 打开失败')); };
    });
  };

  function tx(names, mode) { return db.transaction(names, mode); }

  function kvGet(key, fallback) {
    return S.init().then(function (d) {
      return req(tx(['kv'], 'readonly').objectStore('kv').get(key));
    }).then(function (v) { return v === undefined ? fallback : v; });
  }
  function kvSet(key, value) {
    return S.init().then(function (d) {
      var t = tx(['kv'], 'readwrite');
      t.objectStore('kv').put(value, key);
      return new Promise(function (res, rej) { t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
    });
  }
  /* 对外暴露，供 discard 等模块持久化自己的小状态 */
  S.kvGet = kvGet;
  S.kvSet = kvSet;

  /* ---------- library ---------- */
  var cache = null;

  S.list = function () {
    if (cache) return Promise.resolve(cache);
    return kvGet('library', []).then(function (list) {
      cache = Array.isArray(list) ? list : [];
      return cache;
    });
  };

  S.saveAll = function (list) {
    cache = list;
    return kvSet('library', list);
  };

  S.get = function (id) { return S.list().then(function (l) { return l.filter(function (i) { return i.id === id; })[0] || null; }); };

  S.put = function (item) {
    return S.list().then(function (list) {
      var idx = -1;
      list.forEach(function (it, i) { if (it.id === item.id) idx = i; });
      if (idx >= 0) list[idx] = item; else list.unshift(item);
      return S.saveAll(list);
    });
  };

  S.remove = function (id) {
    return S.list().then(function (list) {
      return S.saveAll(list.filter(function (i) { return i.id !== id; }));
    }).then(function () {
      return Promise.all([
        S.delImage(IMG_KEY.orig(id)), S.delImage(IMG_KEY.png(id)),
        S.delImage(IMG_KEY.jpg(id)), S.delImage(IMG_KEY.thumb(id))
      ]);
    });
  };

  /* ---------- style-profile ---------- */
  /* 2026-09-28 批次1 实测画像（20 张风格参考图，16 个场景），与 wardrobe/style-profile.json 同步 */
  S.DEFAULT_PROFILE = {
    _meta: {
      source: '模块二 · 2026-09-28 批次1：20 张风格参考图（13 套试衣间实拍 + 2 街拍 + 1 ins + 3 电商截图）',
      overwritten: true,
      method: '逐张目测判读 + Pillow 单品区域补丁采样（tmp/batch1-patches.json）'
    },
    coreStyles: ['korean', 'workwear', 'clean-fit', 'vintage', 'cityboy'],
    colorPaletteHex: [
      '#1f2430', '#4a546d', '#5d7290', '#93a7bd',
      '#2f2b26', '#8f8e8c', '#4b4b3b', '#6f6345',
      '#e8e2d4', '#17181a', '#edbfc7'
    ],
    colorPaletteNames: [
      '墨藏青', '石板蓝灰', '水洗牛仔蓝', '浅蓝水洗',
      '深灰工装炭', '浅灰', '军绿橄榄', '卡其',
      '米白', '黑', '粉（仅点缀）'
    ],
    colorAvoidHex: [],
    silhouettePreference: '整体偏宽松、垂坠、不紧身；上装两种模式并存——修身合身短款（微露腰线）与 oversize 落肩；下装只穿宽松版型（阔腿、伞裤、直筒阔腿），裤长盖到脚背或九分微堆叠；不接受紧身下装、不接受垮到邋遢',
    silhouetteRules: {
      topModes: [
        '修身合身短款：浅灰修身T、炭灰亨利领针织、藏青V领针织、白泡泡袖短衬衫——收腰或短摆，露出腰线',
        'oversize 落肩：黑色印花T、藏青落肩卫衣、米白史努比针织——肩线掉落、衣身宽大'
      ],
      bottomRule: '只穿宽松：工装阔腿裤、伞裤（parachute）、直筒阔腿牛仔裤、卡其宽松直筒；拒绝紧身/修身/铅笔裤型',
      hemLength: '裤长盖到脚背、鞋口微堆叠，或九分露脚踝',
      waist: '低腰/自然腰为主，露腰靠短上衣实现而不是低腰裤',
      proportion: '上紧下宽为主流公式；上下皆宽时靠材质差异（针织 vs 帆布）分层'
    },
    outfitFormulas: [
      '修身条纹短袖 + 深灰工装伞裤 + 黑色厚底乐福 + 黑色托特/斜挎',
      'oversize 复古印花T + 天蓝伞裤 + 黑色厚底鞋',
      '米白线条印花针织短袖 + 军绿工装裤 + 黑色厚底鞋 + 黑色尼龙斜挎',
      '炭灰亨利领针织 + 中蓝直筒牛仔裤 + 红色细腰带 + 黑色皮单肩包',
      '白泡泡袖短衬衫 + 深靛直筒牛仔裤 + 黑色乐福 + 黑色皮托特',
      '藏青开衫（拇指洞袖）+ 吊带 + 深色直筒牛仔裤 + 米白帆布托特',
      '藏青V领针织 + 白色内搭 + 卡其工装阔腿裤（韩系公式）',
      '藏青落肩卫衣 + 浅蓝阔腿牛仔裤（街拍公式）'
    ],
    shoeBagProfile: {
      shoes: '黑色厚底圆头乐福/小皮鞋是绝对主力，13 套试衣间实拍几乎全套出现；未见运动鞋/凉鞋',
      bags: '黑色系包为主：皮托特、皮单肩、尼龙斜挎、格纹托特；偶尔米白帆布托特或毛毛装饰包做软化'
    },
    colorRules: '全身 ≤3 个颜色；以低饱和的蓝灰绿棕为主，黑/米白做骨架；亮色只允许小面积点缀（红细腰带、粉色T恤、印花图案内部），拒绝大面积高饱和撞色',
    materialPreference: ['棉', '针织', '重磅棉', '牛仔', '帆布', '莫代尔', '华夫格', '羊毛'],
    patternPreference: ['纯色', '细条纹', '波点', '小面积复古印花（线条画/卡通/别针心形/文字印花）'],
    avoidPatterns: ['大logo', '荧光色', '高饱和大面积撞色', '运动套装日常化'],
    categoryCombos: [
      ['top', 'bottom', 'shoes'],
      ['outerwear', 'top', 'bottom'],
      ['top', 'bottom', 'shoes', 'accessory']
    ],
    priceRange: { min: 15, max: 160, currency: 'CNY' },
    typicalOccasions: ['休闲', '通勤', '旅行'],
    avoidList: ['大 logo', '荧光色', '廉价亮面化纤', '紧身裤', '运动套装日常化', '高饱和糖果色'],
    photoStyle: {
      framing: '竖构图 3:4 为主，全身入镜、主体居中；电商截图仅作商品参考不计入构图偏好',
      scenePreference: '生活场景优先：试衣间/门店（货架、木地板、镜子入镜）、城市街道夜景；没有一张影棚纯白背景的人像',
      tone: '暖白平衡（warmth +0.07 ~ +0.10）、中低饱和（meanSat 66/255）、对比中高（stdV ≈ 70）且中间调层次完整（midtone 40%）',
      post: '轻后期、无明显滤镜痕迹，接受自然颗粒（grain ≈ 9.6）；排斥重滤镜/HDR 感'
    },
    lighting: {
      preferred: [
        '自然漫射光（阴天、窗边、大玻璃门）',
        '暖色顶光/射灯，硬阴影可接受（试衣间组，shadowPct 24%）',
        '夜景点光源（路灯、红绿灯、店铺灯）'
      ],
      avoid: ['均匀无影的影棚平光', '冷白荧光感', 'HDR 过度的重口味后期'],
      shadowCharacter: '阴影可见但不吃细节：高光 4–8%、阴影 24–26%、中间调约 40%'
    },
    confidence: {
      '廓形': '高——13 套试衣间实拍反复验证同一套廓形体系',
      '色彩': '较高——色族稳定（蓝灰绿棕+黑白），个别 hex 受光线影响',
      '鞋包': '高——黑色厚底乐福与黑包重复出现率极高',
      '材质': '中——多为目测（棉/针织/牛仔/帆布），无实物手感验证',
      '价位带': '高——批次2 现有衣橱 44 件实测：¥12–153、中位数约 ¥55'
    },
    summary: '风格画像（批次1 实测 + 批次2 现有衣橱 44 件验证）：低饱和蓝灰绿棕 + 黑白骨架的日系 cityboy × 韩系松弛 × 轻工装，带 y2k 复古底色。上装修身短款或 oversize 落肩二选一，下装永远宽松（工装阔腿/伞裤/直筒阔腿牛仔），裤长堆叠或九分；黑色厚底乐福 + 黑包是固定收尾。图案接受细条纹、波点和小面积复古印花，拒绝大 logo 与荧光。实际价位带 ¥12–153（中位数约 ¥55），评估按 ¥15–160 计。'
  };

  var profileCache = null;
  S.profile = function () {
    if (profileCache) return Promise.resolve(profileCache);
    return kvGet('style-profile', null).then(function (p) {
      /* 旧的冷启动占位值（overwritten=false）会被实测画像直接替换；
         用户自己保存过或 AI 覆盖过的（overwritten=true）一律不动。 */
      var stale = p && p._meta && p._meta.overwritten === false;
      if (!p || stale) {
        profileCache = JSON.parse(JSON.stringify(S.DEFAULT_PROFILE));
        if (stale) return kvSet('style-profile', profileCache).then(function () { return profileCache; });
      } else {
        profileCache = p;
      }
      return profileCache;
    });
  };
  S.saveProfile = function (p) { profileCache = p; return kvSet('style-profile', p); };

  /* ---------- outfits ---------- */
  var outfitsCache = null;
  S.outfits = function () {
    if (outfitsCache) return Promise.resolve(outfitsCache);
    return kvGet('outfits', []).then(function (o) { outfitsCache = Array.isArray(o) ? o : []; return outfitsCache; });
  };
  S.saveOutfits = function (o) { outfitsCache = o; return kvSet('outfits', o); };
  S.addOutfit = function (o) {
    return S.outfits().then(function (list) {
      list.unshift(o);
      return S.saveOutfits(list);
    });
  };
  S.removeOutfit = function (id) {
    return S.outfits().then(function (list) {
      return S.saveOutfits(list.filter(function (o) { return o.id !== id; }));
    }).then(function () { return S.delImage(IMG_KEY.outfit(id)); });
  };

  /* ---------- 图片 ---------- */
  S.putImage = function (key, blob) {
    return S.init().then(function () {
      var t = tx(['images'], 'readwrite');
      t.objectStore('images').put(blob, key);
      return new Promise(function (res, rej) { t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
    });
  };
  S.getImage = function (key) {
    return S.init().then(function () {
      return req(tx(['images'], 'readonly').objectStore('images').get(key));
    });
  };
  S.delImage = function (key) {
    return S.init().then(function () {
      var t = tx(['images'], 'readwrite');
      t.objectStore('images').delete(key);
      return new Promise(function (res) { t.oncomplete = res; t.onerror = function () { res(); }; });
    });
  };

  /* ---------- 显示用 URL（带缓存，避免频繁创建/销毁） ---------- */
  var urlCache = {};
  S.imageUrl = function (key) {
    if (!key) return Promise.resolve(null);
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return S.getImage(key).then(function (blob) {
      if (!blob) return null;
      urlCache[key] = URL.createObjectURL(blob);
      return urlCache[key];
    });
  };
  S.dropUrl = function (key) {
    if (urlCache[key]) { URL.revokeObjectURL(urlCache[key]); delete urlCache[key]; }
  };
  S.thumbUrl = function (slug) { return S.imageUrl(IMG_KEY.thumb(slug)); };
  S.pngUrl = function (slug) { return S.imageUrl(IMG_KEY.png(slug)); };
  /* 卡片展示图：优先去背 PNG，其次缩略图，最后 JPG 展示版（穿搭参考图走这条） */
  S.itemImage = function (slug) {
    return S.imageUrl(IMG_KEY.png(slug)).then(function (u) {
      if (u) return u;
      return S.imageUrl(IMG_KEY.thumb(slug)).then(function (u2) {
        if (u2) return u2;
        return S.imageUrl(IMG_KEY.jpg(slug));
      });
    });
  };

  /* ---------- 设置 ---------- */
  var settingsCache = null;
  S.DEFAULT_SETTINGS = {
    visionBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    visionApiKey: '',
    visionModel: 'doubao-vision-pro',
    llmBaseUrl: 'https://api.deepseek.com/v1',
    llmApiKey: '',
    llmModel: 'deepseek-chat',
    bgMode: 'algo',
    tolerance: 30,
    parentTolerance: 12,
    keepLargest: true
  };
  S.settings = function () {
    if (settingsCache) return Promise.resolve(settingsCache);
    return kvGet('settings', null).then(function (s) {
      settingsCache = Object.assign({}, S.DEFAULT_SETTINGS, s || {});
      return settingsCache;
    });
  };
  S.saveSettings = function (s) { settingsCache = s; return kvSet('settings', s); };

  /* ---------- 内置数据（app/data/）：首次打开自动装载，不用手动导入 ---------- */
  function fetchBlob(url) {
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; });
  }

  /** 内置数据是否存在（用来决定要不要自动装载）。force=true 时强制覆盖为内置数据。 */
  S.seedBuiltin = function (force) {
    return kvGet('library', null).then(function (v) {
      if (!force && v && v.length) return { seeded: false, count: v.length };
      return fetch('data/library.json').then(function (r) {
        if (!r.ok) throw new Error('内置 library.json 读取失败（' + r.status + '）');
        return r.json();
      }).then(function (items) {
        if (!Array.isArray(items) || !items.length) throw new Error('内置 library.json 是空的');
        /* 先装小缩略图（卡片马上能看），大图按需后台补。
           现在是裁剪版商品图（原图截掉 UI 文字）。jpg / png 两种后缀都备了，
           哪个拿到用哪个——这样旧缓存的页面（找 png）和新页面（找 jpg）都能开。 */
        return Promise.all(items.map(function (it) {
          return fetchBlob('data/thumbs/' + it.id + '.jpg').then(function (b) {
            return b || fetchBlob('data/thumbs/' + it.id + '.png');
          }).then(function (b) {
            return b ? S.putImage(IMG_KEY.thumb(it.id), b) : null;
          });
        })).then(function () {
          cache = items;
          return kvSet('library', items);
        }).then(function () {
          return { seeded: true, count: items.length, ids: items.map(function (i) { return i.id; }) };
        });
      });
    });
  };

  /** 按需把某件的大图从内置目录补进 IndexedDB（打开详情/做搭配时用）。裁剪版 JPG */
  S.ensureJpg = function (id) {
    return S.getImage(IMG_KEY.jpg(id)).then(function (b) {
      if (b) return true;
      return fetchBlob('data/items/' + id + '.jpg').then(function (b2) {
        return b2 || fetchBlob('data/items/' + id + '.png');
      }).then(function (b2) {
        if (!b2) return false;
        return S.putImage(IMG_KEY.jpg(id), b2).then(function () { S.dropUrl(IMG_KEY.jpg(id)); return true; });
      });
    }).catch(function () { return false; });
  };

  /** 内置风格画像（仅在 kv 里还没有画像时写入，用户自己改过的不动） */
  S.seedProfile = function () {
    return kvGet('style-profile', null).then(function (p) {
      if (p) return false;
      return fetch('data/style-profile.json').then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (pf) {
        if (!pf) return false;
        profileCache = pf;
        return kvSet('style-profile', pf);
      }).then(function () { return true; });
    });
  };

  /** 一键恢复内置衣橱（会覆盖当前 library） */
  S.resetToBuiltin = function () {
    return S.list().then(function (list) {
      return Promise.all(list.map(function (it) {
        return Promise.all([
          S.delImage(IMG_KEY.orig(it.id)), S.delImage(IMG_KEY.png(it.id)),
          S.delImage(IMG_KEY.jpg(it.id)), S.delImage(IMG_KEY.thumb(it.id))
        ]);
      }));
    }).then(function () {
      cache = [];
      return kvSet('library', []);
    }).then(function () { return S.seedBuiltin(true); });
  };

  /* ---------- 统计 ---------- */
  S.stats = function () {
    return Promise.all([S.list(), S.outfits()]).then(function (r) {
      return { items: r[0].length, outfits: r[1].length, pending: r[0].filter(function (i) {
        return JSON.stringify(i).indexOf('[待确认]') >= 0;
      }).length };
    });
  };

  /* ---------- 导入导出 ---------- */
  S.exportJSON = function (name) {
    if (name === 'library') return S.list();
    if (name === 'style-profile') return S.profile();
    if (name === 'outfits') return S.outfits();
    return Promise.reject(new Error('未知数据集 ' + name));
  };

  S.importJSON = function (name, text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    if (name === 'library') {
      if (!Array.isArray(data)) throw new Error('library.json 必须是数组');
      cache = data; return kvSet('library', data);
    }
    if (name === 'style-profile') { profileCache = data; return kvSet('style-profile', data); }
    if (name === 'outfits') {
      if (!Array.isArray(data)) throw new Error('outfits.json 必须是数组');
      outfitsCache = data; return kvSet('outfits', data);
    }
    return Promise.reject(new Error('未知数据集 ' + name));
  };

  S.reset = function () {
    cache = []; profileCache = null; outfitsCache = [];
    Object.keys(urlCache).forEach(function (k) { URL.revokeObjectURL(urlCache[k]); });
    urlCache = {};
    return S.init().then(function () {
      var t = tx(['kv', 'images'], 'readwrite');
      t.objectStore('kv').clear();
      t.objectStore('images').clear();
      return new Promise(function (res, rej) { t.oncomplete = res; t.onerror = function () { rej(t.error); }; });
    });
  };
})(window.W = window.W || {});
