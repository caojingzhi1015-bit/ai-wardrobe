/* utils.js — 通用工具：DOM / 颜色 / 文件 / 文件名元数据解析 / chips 输入组件 */
(function (W) {
  'use strict';
  var U = (W.utils = {});

  /* ---------- DOM ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  U.clear = function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); };

  U.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- 提示条 ---------- */
  var toastTimer = null;
  U.toast = function (msg, kind) {
    var box = U.$('#toast');
    if (!box) return;
    box.className = 'toast show ' + (kind || 'info');
    box.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'toast'; }, 3200);
  };

  /* ---------- 通用小函数 ---------- */
  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36).slice(-6) + '-' + Math.random().toString(36).slice(2, 6);
  };

  U.today = function () {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  U.now = function () { return new Date().toISOString(); };

  U.money = function (n) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    return '¥' + Number(n).toLocaleString('zh-CN');
  };

  U.fileStem = function (name) { return String(name).replace(/\.[^.]+$/, ''); };
  U.fileExt = function (name) { return String(name).split('.').pop().toLowerCase(); };

  U.slugify = function (text) {
    var s = String(text || '').toLowerCase().trim();
    s = s.replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-+|-+$/g, '');
    // 纯中文 → 没有可用拉丁串，交给调用方兜底
    var hasLatin = /[a-z0-9]/.test(s);
    return hasLatin ? s.slice(0, 48) : '';
  };

  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  };

  /* ---------- 文件下载 ---------- */
  U.downloadBlob = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  };

  U.downloadText = function (text, filename, mime) {
    U.downloadBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
  };

  U.canvasToBlob = function (canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, type || 'image/png', quality);
    });
  };

  U.loadImageFromBlob = function (blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  };

  U.loadBitmap = function (blob) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(blob).catch(function () {
        return U.loadImageFromBlob(blob);
      });
    }
    return U.loadImageFromBlob(blob);
  };

  /* ---------- 颜色 ---------- */
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  U.hexToRgb = function (hex) {
    var h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  };

  U.rgbToHex = function (r, g, b) {
    var p = function (n) { var s = Math.max(0, Math.min(255, Math.round(n))).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + p(r) + p(g) + p(b);
  };

  function srgbToLinear(c) { c = c / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  U.rgbToLab = function (rgb) {
    var r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b);
    var X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    var Y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
    var Z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t + 16 / 116); };
    var fx = f(X), fy = f(Y), fz = f(Z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  };

  U.hexToLab = function (hex) {
    var rgb = U.hexToRgb(hex);
    return rgb ? U.rgbToLab(rgb) : null;
  };

  // CIE76 色差
  U.labDistance = function (labA, labB) {
    if (!labA || !labB) return 999;
    var dL = labA.L - labB.L, da = labA.a - labB.a, db = labA.b - labB.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  };

  U.hexDistance = function (hexA, hexB) { return U.labDistance(U.hexToLab(hexA), U.hexToLab(hexB)); };

  U.nearestPalette = function (hex, palette) {
    var best = null, bestD = 1e9, pLab, d;
    pLab = U.hexToLab(hex);
    (palette || []).forEach(function (p) {
      d = U.labDistance(pLab, U.hexToLab(p));
      if (d < bestD) { bestD = d; best = p; }
    });
    return { color: best, distance: bestD === 1e9 ? null : bestD };
  };

  /* 色板判定统一口径（Lab ΔE）：人眼可辨阈值约 ΔE 2.3，
     所以 8 / 15 是「同一色系 / 邻近可搭」的合理分界，25 太松会全命中。
     实测 44 件衣橱：≤8 有 34 件，≤15 有 44 件。 */
  U.FIT_IN = 8;
  U.FIT_NEAR = 15;
  U.paletteFit = function (hex, palette) {
    var d = U.nearestPalette(hex, palette).distance;
    if (d == null) return { d: null, tier: 'unknown' };
    return { d: d, tier: d <= U.FIT_IN ? 'in' : (d <= U.FIT_NEAR ? 'near' : 'off') };
  };

  // 中性色判据：低饱和 + 中低明度区间；用于搭配兜底判断
  U.isNeutral = function (hex) {
    var lab = U.hexToLab(hex);
    if (!lab) return true;
    var chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
    return chroma < 12;
  };

  U.readableOn = function (hex) {
    var rgb = U.hexToRgb(hex) || { r: 255, g: 255, b: 255 };
    var lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum > 0.62 ? '#172033' : '#FFFFFF';
  };

  /* ---------- inbox 文件名元数据解析 ----------
     约定：{价格}-{平台}-{品牌}-{简述}.jpg
     例：299-taobao-uniqlo-燕麦色廓形卫衣.jpg
  ------------------------------------------------ */
  var PLATFORM_MAP = {
    taobao: 'taobao', tb: 'taobao', tmall: 'taobao', '淘宝': 'taobao', '天猫': 'taobao',
    pdd: 'pdd', pinduoduo: 'pdd', '拼多多': 'pdd',
    jd: 'jd', '京东': 'jd',
    xhs: 'xhs', xiaohongshu: 'xhs', '小红书': 'xhs',
    douyin: 'xhs', '抖音': 'xhs', dy: 'xhs',
    offline: 'offline', '线下': 'offline', gift: 'gift', '赠品': 'gift'
  };
  var UNKNOWN = ['unknown', '未知', 'unknown-brand', 'nobrand', 'xxx'];

  U.parseInboxName = function (filename) {
    var stem = U.fileStem(filename).trim();
    var out = { raw: stem, price: null, platform: null, brand: null, desc: null, hit: false };
    var parts = stem.split('-').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ''; });
    if (parts.length >= 2 && /^\d+(\.\d+)?$/.test(parts[0].replace(/[¥￥]/g, ''))) {
      out.hit = true;
      out.price = Number(parts[0].replace(/[¥￥]/g, ''));
      if (parts[1]) out.platform = PLATFORM_MAP[parts[1].toLowerCase()] || null;
      if (parts[2] && UNKNOWN.indexOf(parts[2].toLowerCase()) < 0) out.brand = parts[2];
      if (parts[3]) out.desc = parts.slice(3).join('-');
      else if (parts[2] && !out.brand) out.desc = parts.slice(2).join('-');
    }
    if (!out.desc) out.desc = parts.length ? parts[parts.length - 1] : stem;
    return out;
  };

  /* ---------- 基于中文字面描述的品类猜测（无 AI 时的诚实兜底） ---------- */
  var CAT_RULES = [
    ['accessory', ['包', '托特', '双肩', '斜挎', '胸包', '公文包', '邮差包', '帽', '冷帽', '棒球帽', '贝雷帽', '渔夫帽', '围巾', '手套', '皮带', '腰带', '墨镜', '项链', '戒指', '首饰']],
    ['shoes', ['鞋', '运动鞋', '板鞋', '跑鞋', '老爹鞋', '靴', '马丁靴', '切尔西', '乐福', '皮鞋', '凉鞋', '拖鞋']],
    ['bottom', ['裤', '牛仔裤', '西裤', '工装裤', '休闲裤', '短裤', '裙', '半裙', '运动裤', '卫裤']],
    ['outerwear', ['外套', '夹克', '大衣', '风衣', '羽绒', '棉服', '西装外套', '西装', '马甲', '冲锋衣', '皮肤衣', '皮衣', 'blazer', 'trench']]
  ];

  U.guessCategory = function (desc) {
    var d = String(desc || '');
    for (var i = 0; i < CAT_RULES.length; i++) {
      for (var j = 0; j < CAT_RULES[i][1].length; j++) {
        if (d.indexOf(CAT_RULES[i][1][j]) >= 0) return CAT_RULES[i][0];
      }
    }
    return 'top';
  };

  var SUB_MAP = [
    ['top', 'T恤', ['t恤', 'tee', 'polo']],
    ['top', '衬衫', ['衬衫']],
    ['top', '卫衣', ['卫衣', '帽衫', 'hoodie']],
    ['top', '针织衫', ['毛衣', '针织', '开衫', '费尔岛', '绞花', '羊绒']],
    ['top', '背心', ['背心', '吊带']],
    ['top', '打底衫', ['打底', '高领']],
    ['outerwear', '夹克', ['夹克', 'm-65', 'm65', 'ma-1', 'ma1', '飞行员', '教练夹克', '哈灵顿', '猎装', '牛仔夹克']],
    ['outerwear', '大衣', ['大衣', '风衣', 'trench', '柴斯特', '双排扣']],
    ['outerwear', '羽绒服 / 棉服', ['羽绒', '棉服', '面包服', '派克']],
    ['outerwear', '西装外套', ['西装', 'blazer']],
    ['outerwear', '马甲', ['马甲']],
    ['outerwear', '防风外套', ['冲锋衣', '皮肤衣', '防风']],
    ['outerwear', '皮夹克', ['皮衣', '皮夹克']],
    ['bottom', '牛仔裤', ['牛仔裤']],
    ['bottom', '西裤', ['西裤']],
    ['bottom', '休闲裤', ['休闲裤', '卡其', 'chino', '灯芯绒']],
    ['bottom', '工装裤', ['工装裤', 'cargo', '多袋', 'm-65', '老爹工装']],
    ['bottom', '短裤', ['短裤']],
    ['bottom', '裙装', ['裙']],
    ['bottom', '运动裤', ['运动裤', '卫裤', '束脚']],
    ['shoes', '运动鞋', ['运动鞋', '板鞋', '跑鞋', '老爹鞋']],
    ['shoes', '靴子', ['靴']],
    ['shoes', '皮鞋', ['皮鞋', '德比', '牛津', '乐福']],
    ['shoes', '凉鞋 / 拖鞋', ['凉鞋', '拖鞋']],
    ['accessory', '包', ['包']],
    ['accessory', '帽', ['帽']],
    ['accessory', '围巾 / 手套 / 皮带 / 墨镜 / 首饰', ['围巾', '手套', '皮带', '腰带', '墨镜', '项链', '戒指']]
  ];

  U.guessSubcategory = function (desc) {
    var d = String(desc || '').toLowerCase();
    for (var i = 0; i < SUB_MAP.length; i++) {
      for (var j = 0; j < SUB_MAP[i][2].length; j++) {
        if (d.indexOf(SUB_MAP[i][2][j]) >= 0) return SUB_MAP[i][1];
      }
    }
    return null;
  };

  /* ---------- chips 输入组件 ---------- */
  U.chips = function (container, initial, options) {
    options = options || {};
    var values = (initial || []).slice();
    var inputId = 'chip-input-' + Math.random().toString(36).slice(2, 7);

    function render() {
      U.clear(container);
      container.classList.add('chips');
      values.forEach(function (v, i) {
        container.appendChild(U.el('span', { class: 'chip' }, [
          U.el('span', { text: v }),
          U.el('button', {
            class: 'chip-x', type: 'button', title: '移除',
            onclick: function (e) { e.preventDefault(); values.splice(i, 1); render(); }
          }, ['×'])
        ]));
      });
      var input = U.el('input', {
        class: 'chip-input', type: 'text', id: inputId,
        placeholder: values.length ? '' : (options.placeholder || '输入后回车')
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var v = input.value.trim();
          if (!v) return;
          (options.split ? v.split(options.split) : [v]).forEach(function (piece) {
            piece = piece.trim();
            if (piece && values.indexOf(piece) < 0) values.push(piece);
          });
          input.value = '';
          render();
          U.$('#' + inputId).focus();
        } else if (e.key === 'Backspace' && !input.value && values.length) {
          values.pop(); render(); U.$('#' + inputId).focus();
        }
      });
      input.addEventListener('blur', function () {
        if (input.value.trim()) {
          input.value.trim().split(options.split || ',').forEach(function (piece) {
            piece = piece.trim();
            if (piece && values.indexOf(piece) < 0) values.push(piece);
          });
          input.value = ''; render();
        }
      });
      container.appendChild(input);
    }
    render();
    return {
      get: function () { return values.slice(); },
      set: function (list) { values = (list || []).slice(); render(); },
      focus: function () { var i = U.$('#' + inputId); if (i) i.focus(); }
    };
  };
})(window.W = window.W || {});
