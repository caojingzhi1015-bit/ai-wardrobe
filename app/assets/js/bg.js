/* bg.js — 去背引擎
   原则（AGENT-PROMPT §2.5）：保真优先，不重绘。
   - 保持原始像素尺寸与宽高比，不缩放不改色不磨皮不补细节
   - 默认走离线算法（洪泛填色 + 软 Alpha + 最大连通块），无需联网
   - 可选 AI 模型模式（@imgly/background-removal，需联网下载模型），失败如实报错并让你切回算法
   - 禁止任何生成式（文生图 / 图生图）模型 */
(function (W) {
  'use strict';
  var U = W.utils;
  var Bg = (W.bg = {});

  var DISPLAY_BG = '#F5F3F0'; // 商品图墙展示底色（略暖灰白）

  /* ---------- 通用：blob / image → canvas（原尺寸） ---------- */
  Bg.toCanvas = function (source) {
    return U.loadBitmap(typeof source === 'object' && source.type !== undefined && !(source instanceof HTMLCanvasElement) ? source : source)
      .then(function (bmp) {
        var w = bmp.width, h = bmp.height;
        if (bmp instanceof HTMLCanvasElement) { w = source.width; h = source.height; }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        return c;
      });
  };

  /* ---------- 背景色估计：取四角小块的中位数 ---------- */
  function sampleBg(px, w, h) {
    function patch(x0, y0) {
      var rs = [], gs = [], bs = [];
      for (var y = y0; y < y0 + 8 && y < h; y++) {
        for (var x = x0; x < x0 + 8 && x < w; x++) {
          var i = (y * w + x) * 4;
          rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
        }
      }
      var med = function (a) { a.sort(function (m, n) { return m - n; }); return a[Math.floor(a.length / 2)]; };
      return { r: med(rs), g: med(gs), b: med(bs) };
    }
    var corners = [
      patch(0, 0), patch(w - 8, 0), patch(0, h - 8), patch(w - 8, h - 8)
    ];
    // 取出现频次最高的角（简单做法：取平均）
    var r = 0, g = 0, b = 0;
    corners.forEach(function (c) { r += c.r; g += c.g; b += c.b; });
    return { r: r / 4, g: g / 4, b: b / 4 };
  }

  function maxDiff(px, i, c) {
    var dr = Math.abs(px[i] - c.r), dg = Math.abs(px[i + 1] - c.g), db = Math.abs(px[i + 2] - c.b);
    return Math.max(dr, dg, db);
  }

  function maxDiffPixel(px, i, px2, j) {
    return Math.max(Math.abs(px[i] - px2[j]), Math.abs(px[i + 1] - px2[j + 1]), Math.abs(px[i + 2] - px2[j + 2]));
  }

  /* ---------- 离线索描算法：边界洪泛填色 + 渐变跟随 + 软 Alpha ---------- */
  Bg.removeAlgo = function (canvas, opts) {
    opts = opts || {};
    var tol = Number(opts.tolerance || 30);
    var parentTol = Number(opts.parentTolerance || 12);
    var keepLargest = opts.keepLargest !== false;

    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var img = ctx.getImageData(0, 0, w, h);
    var px = img.data;
    var bg = sampleBg(px, w, h);

    var n = w * h;
    var isBg = new Uint8Array(n);
    var dist = new Uint8Array(n);
    var queue = [];
    var head = 0;

    function seed(i) {
      if (isBg[i]) return;
      var d = maxDiff(px, i * 4, bg);
      if (d > tol * 1.6) return;
      isBg[i] = 1; dist[i] = Math.min(255, d); queue.push(i);
    }
    for (var x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (var y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

    var NB = [-1, 1, -w, w];
    while (head < queue.length) {
      var idx = queue[head++];
      if (head > 4000000) break; // 极端保护
      var p = idx * 4;
      for (var k = 0; k < 4; k++) {
        var j = idx + NB[k];
        if (j < 0 || j >= n) continue;
        // 同行相邻才允许左右溢出检查
        if ((k === 0 && idx % w === 0) || (k === 1 && (idx % w) === w - 1)) continue;
        if (isBg[j]) continue;
        var q = j * 4;
        var d = maxDiff(px, q, bg);
        var dp = maxDiffPixel(px, q, px, p);
        if (d <= tol || dp <= parentTol) {
          isBg[j] = 1;
          dist[j] = Math.min(255, Math.min(d, 255));
          queue.push(j);
        }
      }
    }

    /* 保留主要连通块：去掉孤立噪点和残留模特/水印碎片 */
    if (keepLargest) {
      var seen = new Uint8Array(n);
      var comps = [];
      for (var i0 = 0; i0 < n; i0++) {
        if (isBg[i0] || seen[i0]) continue;
        var stack = [i0], cnt = 0, cells = [];
        seen[i0] = 1;
        while (stack.length) {
          var cur = stack.pop(); cnt++; cells.push(cur);
          var cx = cur % w, cy = (cur / w) | 0;
          if (cx > 0 && !isBg[cur - 1] && !seen[cur - 1]) { seen[cur - 1] = 1; stack.push(cur - 1); }
          if (cx < w - 1 && !isBg[cur + 1] && !seen[cur + 1]) { seen[cur + 1] = 1; stack.push(cur + 1); }
          if (cy > 0 && !isBg[cur - w] && !seen[cur - w]) { seen[cur - w] = 1; stack.push(cur - w); }
          if (cy < h - 1 && !isBg[cur + w] && !seen[cur + w]) { seen[cur + w] = 1; stack.push(cur + w); }
        }
        comps.push({ cells: cells, size: cnt });
      }
      if (comps.length > 1) {
        comps.sort(function (a, b) { return b.size - a.size; });
        var keep = comps[0].size;
        var drop = comps.filter(function (c) { return c.size < Math.max(keep * 0.08, 200); });
        drop.forEach(function (c) {
          for (var t = 0; t < c.cells.length; t++) { isBg[c.cells[t]] = 1; dist[c.cells[t]] = 0; }
        });
      }
    }

    /* 软 Alpha：离背景色越近越透明，形成柔和边缘（不做羽化模糊，保留真实像素） */
    var lo = 0.45;
    for (var pi = 0; pi < n; pi++) {
      if (!isBg[pi]) continue;
      var di = dist[pi];
      var ratio = di / (tol || 1);
      var a = ratio <= lo ? 0 : Math.round(255 * Math.min(1, (ratio - lo) / (1 - lo)));
      px[pi * 4 + 3] = a;
    }

    ctx.putImageData(img, 0, 0);
    return { canvas: canvas, bgColor: U.rgbToHex(bg.r, bg.g, bg.b) };
  };

  /* ---------- AI 模型模式（可选，需联网） ---------- */
  Bg.MODEL_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/dist/index.js';
  var modelLoaded = null;

  function loadModel() {
    if (modelLoaded) return modelLoaded;
    modelLoaded = new Promise(function (resolve, reject) {
      import(Bg.MODEL_URL)
        .then(function (mod) {
          if (!mod || !mod.removeBackground) throw new Error('模块接口不符');
          resolve(mod);
        })
        .catch(function (e) {
          modelLoaded = null;
          reject(new Error('AI 抠图模型加载失败：' + (e && e.message ? e.message : '网络不通或 CDN 被墙') + '。请用「离线算法」模式。'));
        });
    });
    return modelLoaded;
  }

  Bg.removeModel = function (fileOrBlob) {
    return loadModel().then(function (mod) {
      return mod.removeBackground(fileOrBlob, { output: { format: 'image/png', quality: 1 } });
    }).then(function (pngBlob) {
      return Promise.all([Bg.toCanvas(pngBlob), U.loadBitmap(fileOrBlob)]);
    }).then(function (res) {
      var c = res[0], orig = res[1];
      // 保真要求：不允许模型改变像素尺寸
      if (c.width !== orig.width || c.height !== orig.height) {
        var fixed = document.createElement('canvas');
        fixed.width = orig.width; fixed.height = orig.height;
        fixed.getContext('2d').drawImage(c, 0, 0, orig.width, orig.height);
        c = fixed;
        if (orig.close) orig.close();
        return { canvas: c, warning: '模型输出尺寸与原图不一致，已按原尺寸放回归位' };
      }
      if (orig.close) orig.close();
      return { canvas: c };
    });
  };

  /* ---------- 统一入口 ----------
     mode: 'algo' | 'model' | 'none' */
  Bg.remove = function (fileOrBlob, opts) {
    opts = opts || {};
    var mode = opts.mode || 'algo';
    if (mode === 'model') return Bg.removeModel(fileOrBlob);
    return Bg.toCanvas(fileOrBlob).then(function (c) {
      if (mode === 'none') return { canvas: c, originalSize: true };
      return Bg.removeAlgo(c, opts);
    });
  };

  /* ---------- 派生文件 ---------- */
  Bg.png = function (canvas) { return U.canvasToBlob(canvas, 'image/png'); };

  Bg.flatten = function (canvas, color) {
    var c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    var ctx = c.getContext('2d');
    ctx.fillStyle = color || DISPLAY_BG;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, 0);
    return U.canvasToBlob(c, 'image/jpeg', 0.92);
  };

  Bg.thumb = function (canvas, longEdge) {
    longEdge = longEdge || 800;
    var w = canvas.width, h = canvas.height;
    var scale = longEdge / Math.max(w, h);
    if (scale >= 1) scale = 1;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    var ctx = c.getContext('2d');
    ctx.fillStyle = DISPLAY_BG;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return U.canvasToBlob(c, 'image/jpeg', 0.85);
  };

  /* 从画布取主色（用于自动填 colorHex）：取前景像素的 k-means 简化版（4 簇）。
     严格基于图里真实存在的像素，不编造。 */
  Bg.dominantColors = function (canvas, count) {
    count = count || 2;
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return []; }
    var samples = [];
    var step = Math.max(4, Math.floor(Math.sqrt((w * h) / 20000)));
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var i = (y * w + x) * 4;
        if (data[i + 3] < 200) continue;
        if (data[i + 3] < 250 && Math.random() > 0.3) continue;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    if (!samples.length) return [];
    var k = Math.min(count + 1, samples.length);
    var cents = [];
    for (var c = 0; c < k; c++) {
      var s = samples[Math.floor((c + 0.5) * samples.length / k)];
      cents.push(s.slice());
    }
    for (var iter = 0; iter < 6; iter++) {
      var sums = cents.map(function () { return [0, 0, 0, 0]; });
      samples.forEach(function (s) {
        var best = 0, bd = 1e9;
        cents.forEach(function (ct, ci) {
          var d = (s[0] - ct[0]) * (s[0] - ct[0]) + (s[1] - ct[1]) * (s[1] - ct[1]) + (s[2] - ct[2]) * (s[2] - ct[2]);
          if (d < bd) { bd = d; best = ci; }
        });
        var t = sums[best];
        t[0] += s[0]; t[1] += s[1]; t[2] += s[2]; t[3]++;
      });
      cents = sums.map(function (t, idx) {
        if (!t[3]) return cents[idx];
        return [t[0] / t[3], t[1] / t[3], t[2] / t[3]];
      });
    }
    var counts = new Array(cents.length).fill(0);
    samples.forEach(function (s) {
      var best = 0, bd = 1e9;
      cents.forEach(function (ct, ci) {
        var d = (s[0] - ct[0]) * (s[0] - ct[0]) + (s[1] - ct[1]) * (s[1] - ct[1]) + (s[2] - ct[2]) * (s[2] - ct[2]);
        if (d < bd) { bd = d; best = ci; }
      });
      counts[best]++;
    });
    return cents
      .map(function (c2, i) { return { hex: U.rgbToHex(c2[0], c2[1], c2[2]), n: counts[i] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, count)
      .map(function (o) { return o.hex; });
  };

  Bg.DISPLAY_BG = DISPLAY_BG;
})(window.W = window.W || {});
