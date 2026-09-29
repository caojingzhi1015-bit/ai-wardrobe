/* evaluate.js — 模块三（购买前评估）+ 模块四（与已有衣柜的搭配性）
   评分公式与闲置概率规则严格照 AGENT-PROMPT §4 写死：
     风格匹配分 = 色彩命中 palette(40) + 廓形匹配(20) + 材质匹配(15) + 场合命中(15) + 价位带命中(10)
   可落在每一档的具体阈值在 profit() 里集中定义，方便你单独改某一项。 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var E = (W.evaluate = {});
  var ui = {};

  var SIL_OPTIONS = ['oversize / 宽松', '垂坠', '合身', '紧身'];
  var PAT_OPTIONS = ['纯色', '细条纹', '格纹', '印花', '大 logo'];

  /* 哪些品类可以和哪些品类搭（互补，不重复同品类） */
  var COMP = {
    top: ['bottom', 'outerwear', 'shoes', 'accessory'],
    outerwear: ['top', 'bottom', 'shoes'],
    bottom: ['top', 'outerwear', 'shoes', 'accessory'],
    shoes: ['top', 'bottom'],
    accessory: ['top', 'bottom', 'outerwear']
  };

  function buildForm(host) {
    U.clear(host);
    host.appendChild(U.el('h3', { text: '候选单品' }));

    /* 想买的衣服：可以直接传图，文件名按 {价格}-{平台}-{品牌}-{简述} 命名会自动填表 */
    var fileInput = U.el('input', { type: 'file', accept: 'image/*', hidden: true });
    var photoHost = U.el('div', { id: 'cand-photo' });
    var nameLabel = U.el('span', { class: 'muted small', text: '未选择图片' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var url = URL.createObjectURL(f);
      U.clear(photoHost);
      photoHost.appendChild(U.el('img', { class: 'cand-photo', src: url, alt: '' }));
      var meta = U.parseInboxName(f.name);
      if (meta.hit || meta.desc) {
        if (meta.price && !ui.price.value) ui.price.value = meta.price;
        if (meta.brand) ui.brand.value = meta.brand;
        if (meta.platform) ui.platform.value = meta.platform;
        if (meta.desc && !ui.name.value) ui.name.value = meta.desc;
        nameLabel.textContent = f.name + '（已从文件名解析：' + [meta.price ? '¥' + meta.price : '', meta.platform, meta.brand, meta.desc].filter(Boolean).join(' · ') + '）';
      } else {
        nameLabel.textContent = f.name + '（文件名没带元数据，价格/品牌请手填）';
      }
      ui.photoUrl = url;
    });
    host.appendChild(U.el('label', { class: 'field' }, [
      U.el('span', { text: '上传想买的衣服（可选）' }),
      U.el('div', { class: 'row-actions' }, [
        U.el('button', { class: 'btn ghost', type: 'button', text: '选择图片', onclick: function () { fileInput.click(); } }),
        nameLabel
      ]),
      photoHost
    ]));

    var grid = U.el('div', { class: 'form-grid' });

    ui.name = U.el('input', { class: 'input', type: 'text', placeholder: '如 燕麦色廓形卫衣' });
    ui.price = U.el('input', { class: 'input', type: 'number', min: 0, placeholder: '259' });
    ui.brand = U.el('input', { class: 'input', type: 'text', placeholder: '[待确认]' });
    ui.platform = U.el('select', { class: 'input select' });
    ['taobao', 'pdd', '1688', 'jd', 'xhs', 'offline', 'gift'].forEach(function (p) {
      ui.platform.appendChild(U.el('option', { value: p, text: p, selected: p === 'taobao' }));
    });
    ui.photoUrl = null;

    ui.cat = U.el('select', { class: 'input select' });
    W.schema.CATS.forEach(function (c) {
      ui.cat.appendChild(U.el('option', { value: c.key, text: c.label, selected: c.key === 'top' }));
    });
    ui.sub = U.el('select', { class: 'input select' });
    function fillSub(cat) {
      U.clear(ui.sub);
      W.schema.subsOf(cat).forEach(function (s) { ui.sub.appendChild(U.el('option', { value: s, text: s })); });
    }
    fillSub('top');
    ui.cat.addEventListener('change', function () { fillSub(ui.cat.value); });

    ui.silhouette = U.el('select', { class: 'input select' });
    SIL_OPTIONS.forEach(function (s) { ui.silhouette.appendChild(U.el('option', { value: s, text: s })); });
    ui.pattern = U.el('select', { class: 'input select' });
    PAT_OPTIONS.forEach(function (s) { ui.pattern.appendChild(U.el('option', { value: s, text: s })); });
    ui.material = U.el('input', { class: 'input', type: 'text', placeholder: '如 棉 / 羊毛 / 重磅棉 / [待确认]' });

    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '名称' }), ui.name]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '价格 ¥' }), ui.price]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '品牌' }), ui.brand]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '平台' }), ui.platform]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '品类' }), ui.cat]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '二级分类' }), ui.sub]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '廓形' }), ui.silhouette]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '图案' }), ui.pattern]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '材质' }), ui.material]));
    host.appendChild(grid);

    var colorRow = U.el('div', { class: 'form-grid' });
    ui.colorPicker = U.el('input', { type: 'color', value: '#D9CFBA' });
    ui.colorText = U.el('input', { class: 'input small', type: 'text', value: '#D9CFBA', style: 'max-width:150px' });
    ui.colorPicker.addEventListener('input', function () { ui.colorText.value = ui.colorPicker.value; });
    ui.colorText.addEventListener('input', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(ui.colorText.value.trim())) ui.colorPicker.value = ui.colorText.value.trim();
    });
    colorRow.appendChild(U.el('label', { class: 'field' }, [
      U.el('span', { text: '主色' }),
      U.el('div', { style: 'display:flex;gap:8px;align-items:center' }, [ui.colorPicker, ui.colorText])
    ]));
    host.appendChild(colorRow);

    var chipRow = U.el('div', { class: 'form-grid' });
    function chipField(title, list, placeholder) {
      var box = U.el('div', { class: 'field' }, [U.el('span', { text: title })]);
      var cHost = U.el('div', { class: 'chips' });
      box.appendChild(cHost);
      chipRow.appendChild(box);
      return U.chips(cHost, list || [], { placeholder: placeholder, split: ',' });
    }
    ui.season = chipField('季节', ['春', '秋']);
    ui.occasion = chipField('场合', ['通勤', '休闲']);
    ui.tags = chipField('标签（工装就填 workwear）', []);
    host.appendChild(chipRow);
  }

  function readForm() {
    return {
      name: ui.name.value.trim() || '[待确认]',
      brand: ui.brand.value.trim() || '[待确认]',
      platform: ui.platform ? ui.platform.value : 'taobao',
      photoUrl: ui.photoUrl || null,
      price: ui.price.value === '' ? null : Number(ui.price.value),
      category: ui.cat.value,
      subcategory: ui.sub.value,
      silhouette: ui.silhouette.value,
      pattern: ui.pattern.value,
      material: ui.material.value.trim() || '[待确认]',
      colorHex: ui.colorText.value.trim(),
      season: ui.season.get(),
      occasion: ui.occasion.get(),
      tags: ui.tags.get()
    };
  }

  /* ---------- 五项打分（阈值集中在这里，可单独调） ---------- */
  function score(cand, pf) {
    var parts = [];
    var detail = {};

    /* 1) 色彩 40 */
    var near = U.nearestPalette(cand.colorHex, pf.colorPaletteHex || []);
    var d = near.distance;
    var colorScore;
    if ((pf.colorAvoidHex || []).some(function (c) { return String(c).toLowerCase() === String(cand.colorHex).toLowerCase(); })) {
      colorScore = 0; detail.color = '命中回避色';
    } else if (d <= U.FIT_IN) { colorScore = 40; detail.color = '色差 ΔE ' + Math.round(d) + '，在核心色板内'; }
    else if (d <= U.FIT_NEAR) { colorScore = 32; detail.color = '色差 ΔE ' + Math.round(d) + '，邻近色板'; }
    else if (d <= 35) { colorScore = 24; detail.color = '色差 ΔE ' + Math.round(d) + '，偏一点'; }
    else if (d <= 50) { colorScore = 14; detail.color = '色差 ΔE ' + Math.round(d) + '，离色板较远'; }
    else { colorScore = 4; detail.color = '色差 ' + Math.round(d) + '，基本不在 palette 里'; }
    parts.push({ k: '色彩命中 palette', v: colorScore, max: 40, note: detail.color });

    /* 2) 廓形 20 */
    var pref = pf.silhouettePreference || '';
    var wantsLoose = /宽松|oversize|垂坠/.test(pref);
    var hatesTight = /不紧身|紧身/.test(pref) && /不.*紧身/.test(pref);
    var silScore;
    if (/oversize|宽松|垂坠/.test(cand.silhouette)) {
      silScore = wantsLoose ? 20 : 14;
      detail.sil = '偏宽松，' + (wantsLoose ? '符合你的廓形偏好' : '与画像描述不完全一致');
    } else if (cand.silhouette === '合身') {
      silScore = wantsLoose ? 10 : 16;
      detail.sil = '合身，' + (wantsLoose ? '比你平时的偏好收一点' : '与画像一致');
    } else {
      silScore = hatesTight || wantsLoose ? 3 : 10;
      detail.sil = '紧身，与你「不紧身」的偏好冲突';
    }
    parts.push({ k: '廓形匹配', v: silScore, max: 20, note: detail.sil });

    /* 3) 材质 15 */
    var mats = pf.materialPreference || [];
    var hit = mats.filter(function (m) {
      return String(cand.material).indexOf(m) >= 0 || String(m).indexOf(String(cand.material)) >= 0;
    });
    var matScore;
    if (/化纤|涤纶|亮面/.test(cand.material) && (pf.avoidList || []).some(function (a) { return /化纤|亮面/.test(a); })) {
      matScore = 0; detail.mat = '命中回避清单里的廉价化纤';
    } else if (hit.length) { matScore = 15; detail.mat = '命中材质偏好：' + hit.join('/'); }
    else if (/棉|羊毛|羊绒|麻|针织|牛仔|帆布|皮/.test(cand.material)) { matScore = 9; detail.mat = '天然材质，但不在偏好清单里'; }
    else { matScore = 5; detail.mat = '材质 ' + cand.material + '，与偏好清单无关'; }
    parts.push({ k: '材质匹配', v: matScore, max: 15, note: detail.mat });

    /* 4) 场合 15 */
    var typical = pf.typicalOccasions || [];
    var ov = cand.occasion.filter(function (o) { return typical.indexOf(o) >= 0; });
    var occScore;
    if (ov.length >= 2) { occScore = 15; detail.occ = '命中 ' + ov.length + ' 个主要场合'; }
    else if (ov.length === 1) { occScore = 12; detail.occ = '命中 1 个主要场合：' + ov[0]; }
    else if (cand.occasion.length) { occScore = 4; detail.occ = '不在你的主要场合里：' + cand.occasion.join('/'); }
    else { occScore = 0; detail.occ = '没填场合'; }
    parts.push({ k: '场合命中', v: occScore, max: 15, note: detail.occ });

    /* 5) 价位 10 */
    var pr = pf.priceRange || { min: 0, max: 99999 };
    var p = cand.price;
    var priceScore;
    if (p === null) { priceScore = 5; detail.price = '没填价格'; }
    else if (p >= pr.min && p <= pr.max) { priceScore = 10; detail.price = '落在 ' + pr.min + '–' + pr.max + ' 区间'; }
    else if (p < pr.min) { priceScore = 6; detail.price = '低于你常买的价位带，注意品质'; }
    else if (p <= pr.max * 1.5) { priceScore = 5; detail.price = '略高于常用价位带'; }
    else { priceScore = 2; detail.price = '明显超出常用价位带'; }
    parts.push({ k: '价位带命中', v: priceScore, max: 10, note: detail.price });

    var total = parts.reduce(function (a, b2) { return a + b2.v; }, 0);
    return { total: total, parts: parts };
  }

  /* ---------- 能不能搭 / 有几件能搭 ---------- */
  function pairScore(cand, item, pf) {
    if (!COMP[cand.category] || COMP[cand.category].indexOf(item.category) < 0) return 0;
    var seasons = item.season || [];
    if (seasons.length && cand.season.length && cand.season.filter(function (s) { return seasons.indexOf(s) >= 0; }).length === 0) return 0;

    var t1 = U.paletteFit(cand.colorHex, pf.colorPaletteHex || []).tier;
    var t2 = U.paletteFit(item.colorHex, pf.colorPaletteHex || []).tier;
    var neutral = U.isNeutral(item.colorHex) || U.isNeutral(cand.colorHex);

    if (t1 === 'in' && t2 === 'in') return 3;                                  // A：两件都在核心色板里
    if ((t1 === 'in' || t2 === 'in') && (t1 !== 'off' && t2 !== 'off')) return 3;
    if ((t1 !== 'off' || t2 !== 'off') && neutral) return 2;                   // B：一件在色板内 + 一件中性
    if (neutral && U.isNeutral(item.colorHex) && U.isNeutral(cand.colorHex)) return 2;
    return 1;                                                                  // C：勉强
  }

  function analyze(cand, items, pf) {
    var scored = items.map(function (it) {
      return { item: it, tier: pairScore(cand, it, pf) };
    }).filter(function (x) { return x.tier > 0; });

    var good = scored.filter(function (x) { return x.tier >= 2; });
    var meh = scored.filter(function (x) { return x.tier === 1; });
    var n = good.length;

    var base;
    if (n >= 8) base = 12;
    else if (n >= 5) base = 18;
    else if (n === 4) base = 25;
    else if (n === 3) base = 35;
    else if (n === 2) base = 45;
    else if (n === 1) base = 72;
    else base = 85;

    var risks = [];
    var avoidHit = (pf.avoidList || []).filter(function (a) {
      var core = String(a).replace(/\s/g, '');
      return core && (
        String(cand.name).indexOf(core) >= 0 ||
        String(cand.material).indexOf(core) >= 0 ||
        (cand.tags || []).join(' ').indexOf(core) >= 0 ||
        (cand.pattern === '大 logo' && /logo/i.test(a))
      );
    });
    if (avoidHit.length) { base += 30; risks.push('撞了回避清单：' + avoidHit.join('、')); }

    if (cand.season.length === 1 && cand.occasion.length === 1) {
      base += 20;
      risks.push('只有 1 个季节 × 1 个场合能穿');
    }
    base = Math.max(5, Math.min(95, base));

    return { good: good, meh: meh, count: n, idle: base, risks: risks };
  }

  /* ---------- 生成 ≥3 套搭配方案 ---------- */
  var CAT_ORDER = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];
  var PARTNER_ORDER = {
    top: ['bottom', 'shoes', 'outerwear', 'accessory'],
    outerwear: ['top', 'bottom', 'shoes', 'accessory'],
    bottom: ['top', 'outerwear', 'shoes', 'accessory'],
    shoes: ['top', 'bottom', 'outerwear', 'accessory'],
    accessory: ['top', 'bottom', 'outerwear', 'shoes']
  };

  function combos(cand, good) {
    var byCat = {};
    good.forEach(function (g) {
      (byCat[g.item.category] = byCat[g.item.category] || []).push(g.item);
    });
    Object.keys(byCat).forEach(function (k) { byCat[k] = byCat[k].slice(0, 3); });

    var pref = PARTNER_ORDER[cand.category] || CAT_ORDER;
    var cats = CAT_ORDER.filter(function (c) {
      return byCat[c] && (COMP[cand.category] || []).indexOf(c) >= 0;
    }).sort(function (a, b2) { return pref.indexOf(a) - pref.indexOf(b2); });

    var out = [];
    var seen = {};
    function add(set) {
      var key = set.map(function (s) { return s.id; }).sort().join('|');
      if (seen[key] || out.length >= 6) return;
      seen[key] = 1;
      out.push(set);
    }

    for (var i = 0; i < cats.length && out.length < 6; i++) {
      for (var j = i + 1; j < cats.length && out.length < 6; j++) {
        var a = byCat[cats[i]], b3 = byCat[cats[j]];
        for (var x = 0; x < Math.min(2, a.length); x++) {
          for (var y = 0; y < Math.min(2, b3.length); y++) add([a[x], b3[y]]);
        }
      }
    }
    if (!out.length) {
      cats.forEach(function (c) {
        for (var x = 0; x < Math.min(3, byCat[c].length); x++) add([byCat[c][x]]);
      });
    }
    return out;
  }

  /* ---------- 参考色系：候选色 vs 目标色板 vs 现有衣橱色分布 ---------- */
  function colorCmp(cand, pf, items) {
    var pal = pf.colorPaletteHex || [];
    var names = pf.colorPaletteNames || [];
    var near = U.nearestPalette(cand.colorHex, pal);
    var wrap = U.el('div', {});
    wrap.appendChild(U.el('h3', { style: 'margin-top:16px', text: '参考色系' }));

    var box = U.el('div', { class: 'color-cmp' });

    /* 1) 候选色 */
    var b1 = U.el('div', { class: 'color-cmp-box' });
    b1.appendChild(U.el('h4', { text: '这件的主色' }));
    b1.appendChild(U.el('div', { class: 'cand-swatch', style: 'background:' + cand.colorHex }));
    b1.appendChild(U.el('div', { class: 'muted small', style: 'margin-top:6px', text: cand.colorHex }));
    if (pal.length) {
      var idx = pal.indexOf(near.color);
      var fit = U.paletteFit(cand.colorHex, pal);
      b1.appendChild(U.el('div', { class: 'muted small', text: '最接近目标色板里的：' + (idx >= 0 ? (names[idx] || near.color) : near.color) + ' ' + near.color }));
      b1.appendChild(U.el('span', {
        class: 'pill ' + (fit.tier === 'in' ? 'ok' : fit.tier === 'near' ? 'warn' : 'bad'),
        style: 'display:inline-block;margin-top:6px',
        text: '色差 ΔE ' + Math.round(near.distance) + (fit.tier === 'in' ? '（在色板内）' : fit.tier === 'near' ? '（邻近色）' : '（不在色板里）')
      }));
    }
    box.appendChild(b1);

    /* 2) 目标色板 */
    var b2 = U.el('div', { class: 'color-cmp-box' });
    b2.appendChild(U.el('h4', { text: '你的目标色板（' + pal.length + ' 色）' }));
    var ramp2 = U.el('div', { class: 'ramp' });
    pal.forEach(function (c) { ramp2.appendChild(U.el('i', { style: 'background:' + c, title: c })); });
    b2.appendChild(ramp2);
    box.appendChild(b2);

    /* 3) 现有衣橱色分布 */
    var b3 = U.el('div', { class: 'color-cmp-box' });
    var colored = items.filter(function (i) { return i.colorHex; });
    var sorted = colored.slice().sort(function (a, b) {
      return U.nearestPalette(a.colorHex, pal).distance - U.nearestPalette(b.colorHex, pal).distance;
    });
    var inPal = sorted.filter(function (i) { return U.paletteFit(i.colorHex, pal).tier === 'in'; }).length;
    var nearPal = sorted.filter(function (i) { return U.paletteFit(i.colorHex, pal).tier === 'near'; }).length;
    b3.appendChild(U.el('h4', { text: '现有衣橱 ' + colored.length + ' 件的颜色（越靠前越合色板）' }));
    var ramp3 = U.el('div', { class: 'ramp' });
    sorted.slice(0, 16).forEach(function (i) {
      ramp3.appendChild(U.el('i', { style: 'background:' + i.colorHex, title: i.name + ' ' + i.colorHex }));
    });
    b3.appendChild(ramp3);
    b3.appendChild(U.el('div', { class: 'muted small', style: 'margin-top:6px', text: '其中 ' + inPal + ' 件严格落在色板内（' + (colored.length ? Math.round(inPal / colored.length * 100) : 0) + '%），另有 ' + nearPal + ' 件是邻近色' }));
    box.appendChild(b3);

    wrap.appendChild(box);
    var sameTone = sorted.filter(function (i) { return U.nearestPalette(i.colorHex, [cand.colorHex]).distance <= 12; });
    wrap.appendChild(U.el('div', { class: 'hint', text: sameTone.length
      ? '衣橱里已有 ' + sameTone.length + ' 件同色系：' + sameTone.slice(0, 5).map(function (i) { return i.name; }).join('、') + '——买之前想清楚是不是重复了。'
      : '衣橱里暂时没有同色系单品，这件能补一个空位。' }));
    return wrap;
  }

  /* ---------- 把候选存进衣橱（想买清单），返回 id ---------- */
  function addCandidate(cand) {
    var id = U.slugify(cand.name) || U.uid('cand');
    return S.get(id).then(function (exist) {
      if (exist) return id;
      var it = {
        id: id, name: cand.name, brand: cand.brand, price: cand.price, currency: 'CNY',
        sourcePlatform: cand.platform || 'taobao', sourceUrl: '',
        category: cand.category, subcategory: cand.subcategory,
        colorHex: cand.colorHex, secondaryColorHex: null, material: cand.material,
        season: cand.season, occasion: cand.occasion, aestheticTags: [],
        tags: (cand.tags || []).concat(['想买', '评估候选']),
        purchaseDate: null, addedAt: U.now(), image: 'items/' + id + '.jpg',
        notes: '想买清单 · 评估候选（尚未购买）'
      };
      var imgJob = Promise.resolve(null);
      if (cand.photoUrl) {
        imgJob = fetch(cand.photoUrl).then(function (r) { return r.blob(); }).then(function (b) {
          return Promise.all([S.putImage(S.IMG_KEY.jpg(id), b), S.putImage(S.IMG_KEY.thumb(id), b)]);
        }).catch(function () { return null; });
      }
      return imgJob.then(function () { return S.put(it); }).then(function () { return id; });
    });
  }

  function renderResult(cand, sc, an, list, pf) {
    var host = U.$('#eval-result');
    U.clear(host);
    pf = pf || {};

    var total = sc.total;
    var verdictCls = 'ok', verdictText = '✅ 推荐买';
    if (total < 50 || an.idle >= 60) { verdictCls = 'bad'; verdictText = '❌ 不建议'; }
    else if (total < 70 || an.idle > 35) { verdictCls = 'warn'; verdictText = '⚠️ 谨慎（想清楚再买）'; }

    host.appendChild(U.el('h3', { text: '【新衣服评估】' + cand.name }));
    host.appendChild(U.el('div', { class: 'muted small', text: (cand.brand || '品牌未知') + ' · ' + U.money(cand.price) + ' · ' + W.schema.catLabel(cand.category) + (cand.subcategory ? ' / ' + cand.subcategory : '') }));

    host.appendChild(U.el('div', { class: 'score-ring', style: 'margin-top:14px' }, [
      U.el('span', { class: 'score-num', text: String(total) }),
      U.el('span', { class: 'muted', text: '/ 100 风格匹配分' })
    ]));

    var seg = U.el('div', { class: 'score-seg' });
    sc.parts.forEach(function (p) {
      seg.appendChild(U.el('div', { class: 'seg-row', title: p.note }, [
        U.el('span', { text: p.k }),
        U.el('div', { class: 'seg-bar' }, [U.el('i', { style: 'width:' + Math.round(p.v / p.max * 100) + '%' })]),
        U.el('span', { class: 'seg-val', text: p.v + '/' + p.max })
      ]));
    });
    host.appendChild(seg);

    host.appendChild(U.el('div', { class: 'row-stats', style: 'display:flex;gap:14px;flex-wrap:wrap;margin:6px 0' }, [
      U.el('span', { class: 'pill' + (an.idle <= 20 ? ' ok' : an.idle <= 50 ? ' warn' : ' bad'), text: '预估闲置概率 ' + an.idle + '%' }),
      U.el('span', { class: 'pill mute', text: '能与 ' + an.count + ' 件已有单品搭' })
    ]));

    host.appendChild(U.el('div', { class: 'verdict ' + verdictCls, text: verdictText }));

    var ol = U.el('ol', { class: 'reasons' });
    sc.parts.forEach(function (p) { ol.appendChild(U.el('li', { text: p.note })); });
    ol.appendChild(U.el('li', { text: '能与 ' + an.count + ' 件已有单品搭配' + (an.count >= 5 ? '（≥5 件，闲置风险低）' : an.count >= 2 ? '（2–4 件，中等）' : '（≤1 件，闲置风险高）') }));
    ol.appendChild(U.el('li', { text: '季节跨度：' + (cand.season.length ? cand.season.join('、') : '[待确认]') + '（' + cand.season.length + ' 季）' }));
    host.appendChild(ol);

    host.appendChild(U.el('div', { class: 'hint', text: '风险点：' + (an.risks.length ? an.risks.join('；') : '没有') }));

    /* 参考色系 */
    host.appendChild(colorCmp(cand, pf, list || []));

    /* 模块四：搭配建议（完整套，可存进搭配库） */
    var cs = combos(cand, an.good);
    host.appendChild(U.el('h3', { style: 'margin-top:16px', text: '【搭配建议 · 买回来怎么穿】' }));
    if (cs.length < 3) {
      host.appendChild(U.el('div', { class: 'warn-box', text: '只凑出 ' + cs.length + ' 套：' + (an.count <= 1 ? '只能搭 1~2 件，闲置风险高。' : '组合空间有限，先别冲动。') }));
    }
    list = cs.length ? cs : [];
    var wrap = U.el('div', {});
    Promise.all(cs.map(function (set, idx) {
      return Promise.all(set.map(function (it) { return S.thumbUrl(it.id); })).then(function (urls) {
        var imgs = U.el('div', { class: 'advice-imgs' }, urls.map(function (u) {
          return U.el('img', { src: u || '', alt: '' });
        }));
        var tag = '方案' + String.fromCharCode(65 + idx);
        wrap.appendChild(U.el('div', { class: 'advice' }, [
          U.el('div', { class: 'advice-head' }, [
            U.el('span', { class: 'pill mute', text: tag }),
            U.el('span', { class: 'muted small', text: (cand.occasion[0] || '日常') + ' · ' + (cand.season.join('/') || '四季') })
          ]),
          imgs,
          U.el('div', {
            class: 'advice-txt',
            text: '这件「' + cand.name + '」+ ' + set.map(function (s2) { return '「' + s2.name + '」'; }).join(' + ') +
              '　→　' + howToWear(cand, set)
          }),
          U.el('div', { class: 'row-actions' }, [
            U.el('button', {
              class: 'btn tiny', type: 'button', text: '存这套',
              onclick: function () {
                addCandidate(cand).then(function (cid) {
                  return S.addOutfit({
                    id: U.uid('outfit'),
                    name: cand.name + ' × ' + set.map(function (s2) { return s2.name; }).join(' × '),
                    garmentIds: [cid].concat(set.map(function (s2) { return s2.id; })),
                    occasion: cand.occasion[0] || '休闲',
                    aestheticTags: [], pieces: set.length + 1,
                    addedAt: U.now(), source: 'evaluate'
                  });
                }).then(function () {
                  U.toast('已存为搭配（候选也进了衣橱，标记「想买」）', 'ok');
                  W.app.refresh();
                }).catch(function (e) { U.toast('保存失败：' + e.message, 'bad'); });
              }
            })
          ])
        ]));
      });
    })).then(function () {
      host.appendChild(wrap);
      host.appendChild(U.el('div', { class: 'row-actions' }, [
        U.el('button', { class: 'btn ghost', type: 'button', text: '下载报告 .md', onclick: function () { downloadReport(cand, sc, an, cs, verdictText); } }),
        U.el('button', {
          class: 'btn ghost', type: 'button', text: '加入想买清单',
          onclick: function () {
            addCandidate(cand).then(function () {
              U.toast('已加入衣橱（标记「想买」）', 'ok');
              W.app.refresh();
            });
          }
        })
      ]));
    });
  }

  /* 一句话穿法：按候选品类给个固定说法，不自由发挥 */
  function howToWear(cand, set) {
    var names = set.map(function (s) { return s.name; });
    if (cand.category === 'top') return '上装主角，下装压住裤量，黑鞋黑包收尾';
    if (cand.category === 'bottom') return '下装主角，上身收短或塞一角，露出腰线';
    if (cand.category === 'outerwear') return '外套主角，里面保持素色，敞开穿更有层次';
    if (cand.category === 'shoes') return '鞋做收尾，全身颜色压到 3 个以内';
    return '配饰做点缀，面积控制在 10% 以内';
  }

  function reportText(cand, sc, an, cs, verdictText) {
    var L = [];
    L.push('# 【新衣服评估】' + cand.name + ' · ' + U.money(cand.price) + ' · ' + (cand.brand || '品牌未知'));
    L.push('');
    L.push('- 风格匹配分：' + sc.total + ' / 100');
    L.push('- 预估闲置概率：' + an.idle + '%');
    L.push('- 结论：' + verdictText);
    L.push('- 理由：');
    sc.parts.forEach(function (p, i) { L.push('  ' + (i + 1) + '. ' + p.note + '（' + p.v + '/' + p.max + '）'); });
    L.push('  ' + (sc.parts.length + 1) + '. 可与已有 ' + an.count + ' 件单品搭配');
    L.push('- 风险点：' + (an.risks.length ? an.risks.join('；') : '没有'));
    L.push('');
    L.push('## 【可搭配的已有单品】');
    if (!cs.length) L.push('只能搭 1~2 件，闲置风险高。');
    cs.forEach(function (set, i) {
      L.push('- 方案' + String.fromCharCode(65 + i) + ': 这件「' + cand.name + '」+ ' + set.map(function (s2) { return '「' + s2.name + '」'; }).join(' + '));
    });
    L.push('');
    L.push('> 生成时间：' + U.now() + '　by AI 衣橱管家 v3');
    return L.join('\n');
  }

  function downloadReport(cand, sc, an, cs, verdictText) {
    var slug = U.slugify(cand.name) || 'candidate';
    U.downloadText(reportText(cand, sc, an, cs, verdictText), slug + '.md', 'text/markdown');
    U.toast('已下载 ' + slug + '.md（放到 wardrobe/reports/）', 'ok');
  }

  function run() {
    var cand = readForm();
    Promise.all([S.list(), S.profile()]).then(function (r) {
      var items = r[0], pf = r[1];
      var sc = score(cand, pf);
      var an = analyze(cand, items, pf);
      renderResult(cand, sc, an, items, pf);
    });
  }

  E.init = function () {
    buildForm(U.$('#eval-form'));
    U.$('#btn-eval-run').addEventListener('click', run);
    U.$('#btn-eval-example').addEventListener('click', function () {
      ui.name.value = '燕麦色廓形卫衣';
      ui.price.value = '259';
      ui.brand.value = '[待确认]';
      ui.cat.value = 'top';
      ui.cat.dispatchEvent(new Event('change'));
      ui.sub.value = '卫衣';
      ui.silhouette.value = 'oversize / 宽松';
      ui.pattern.value = '纯色';
      ui.material.value = '棉';
      ui.colorText.value = '#D9CFBA';
      ui.colorPicker.value = '#D9CFBA';
      ui.season.set(['春', '秋']);
      ui.occasion.set(['通勤', '休闲']);
      ui.tags.set([]);
      run();
    });
  };
})(window.W = window.W || {});
