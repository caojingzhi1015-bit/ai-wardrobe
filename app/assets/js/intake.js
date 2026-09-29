/* intake.js — 模块一：批量入库
   拖图 → 解析文件名元数据 →（可选裁剪拆多件）→ 去背 → 生成 PNG/JPG/缩略图 → 填表写入 library.json */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store, Bg = W.bg;
  var I = (W.intake = {});
  var jobs = [];

  function uniqId(base, taken) {
    var id = base || 'sku';
    if (taken.indexOf(id) < 0) return id;
    var n = 2;
    while (taken.indexOf(id + '-' + n) >= 0) n++;
    return id + '-' + n;
  }

  function resetChecks(obj) {
    Object.keys(obj).forEach(function (k) {
      if (obj[k] === '[待确认]') obj[k] = null;
    });
    return obj;
  }

  function guessSeason(sub, name) {
    var s = (sub || '') + (name || '');
    if (/羽绒|棉服|大衣|羊绒|厚|加绒/.test(s)) return ['冬'];
    if (/T恤|短裤|裙|凉鞋|拖鞋|背心|吊带/.test(s)) return ['夏'];
    if (/夹克|卫衣|针织|外套|长袖|裤|鞋|帽|围巾/.test(s)) return ['春', '秋'];
    return [];
  }

  /* ---------- 自动补元数据（无 AI 时的诚实兜底，猜的部分写进 notes） ---------- */
  function autoMeta(job) {
    var p = job.parsed || U.parseInboxName(job.file.name);
    var desc = p.desc || U.fileStem(job.file.name);
    var cat = U.guessCategory(desc);
    var sub = U.guessSubcategory(desc);
    var seasons = guessSeason(sub, desc);
    var cols = job.canvas ? Bg.dominantColors(job.canvas, 2) : [];
    return {
      id: '',
      name: desc || '[待确认]',
      brand: p.brand || '[待确认]',
      price: p.price,
      currency: 'CNY',
      sourcePlatform: p.platform || 'taobao',
      sourceUrl: '',
      category: cat,
      subcategory: sub || '[待确认]',
      colorHex: cols[0] || '[待确认]',
      secondaryColorHex: cols[1] || null,
      material: '[待确认]',
      season: seasons,
      occasion: [],
      aestheticTags: [],
      tags: [],
      purchaseDate: null,
      addedAt: U.now(),
      image: '',
      notes: '自动推断：品类/季节为按描述词的猜测，材质与品牌未核实。'
    };
  }

  /* ---------- 加入队列 ---------- */
  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /image\//.test(f.type); });
    if (!files.length) { U.toast('没有识别到图片文件', 'warn'); return; }
    files.forEach(function (f) {
      jobs.push({
        jid: U.uid('job'),
        file: f,
        parsed: U.parseInboxName(f.name),
        status: 'idle',
        canvas: null,
        previewUrl: null,
        error: null,
        crop: null,
        done: false
      });
    });
    renderQueue();
    updatePill();
    if (U.$('#opt-autodo').checked) processAllIdle();
  }

  /* ---------- 去背处理 ---------- */
  function sourceBlobFor(job) {
    // 带裁剪时，先按原始像素裁一刀（不缩放）
    if (!job.crop) return Promise.resolve(job.file);
    return Bg.toCanvas(job.file).then(function (c) {
      var out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(job.crop.w));
      out.height = Math.max(1, Math.round(job.crop.h));
      out.getContext('2d').drawImage(c, -job.crop.x, -job.crop.y);
      return U.canvasToBlob(out, 'image/png');
    });
  }

  function processJob(job) {
    job.status = 'working';
    job.error = null;
    renderQueue();
    return S.settings().then(function (st) {
      return sourceBlobFor(job).then(function (blob) {
        return Bg.remove(blob, {
          mode: st.bgMode,
          tolerance: Number(st.tolerance),
          parentTolerance: Number(st.parentTolerance),
          keepLargest: st.keepLargest
        });
      });
    }).then(function (res) {
      job.canvas = res.canvas;
      job.warning = res.warning || null;
      job.status = 'ready';
      return Bg.thumb(res.canvas, 300);
    }).then(function (thumb) {
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      job.previewUrl = URL.createObjectURL(thumb);
      renderQueue();
    }).catch(function (e) {
      job.status = 'error';
      job.error = e && e.message ? e.message : String(e);
      renderQueue();
    });
  }

  function processAllIdle() {
    var list = jobs.filter(function (j) { return j.status === 'idle' || j.status === 'error'; });
    if (!list.length) return;
    var chain = Promise.resolve();
    // 串行，避免一次性吃满内存
    list.forEach(function (j) { chain = chain.then(function () { return processJob(j); }); });
    chain.then(function () { U.toast('处理完成', 'ok'); });
  }

  /* ---------- 队列渲染 ---------- */
  function renderQueue() {
    var host = U.$('#queue');
    U.clear(host);
    if (!jobs.length) { updatePill(); return; }
    jobs.forEach(function (job) {
      host.appendChild(rowDom(job));
    });
    U.$('#btn-intake-all').disabled = !jobs.some(function (j) { return !j.done && j.status === 'ready'; });
    updatePill();
  }

  function statusText(job) {
    if (job.status === 'working') return { cls: '', t: '去背中…' };
    if (job.status === 'error') return { cls: 'err', t: '失败：' + (job.error || '') };
    if (job.done) return { cls: 'ok', t: '已入库' + (job.savedAs ? '：' + job.savedAs : '') };
    if (job.status === 'ready') return { cls: 'ok', t: '就绪' + (job.warning ? '（' + job.warning + '）' : '') };
    return { cls: '', t: '待处理' };
  }

  function rowDom(job) {
    var st = statusText(job);
    var p = job.parsed;
    var row = U.el('div', { class: 'qrow' + (job.done ? ' done' : '') });
    row.appendChild(U.el('div', { class: 'qthumb' }, [
      job.previewUrl ? U.el('img', { src: job.previewUrl, alt: '' }) : U.el('span', { class: 'muted small', text: job.status === 'working' ? '…' : '原图' })
    ]));

    var mid = U.el('div', {});
    mid.appendChild(U.el('div', { class: 'qname', text: job.file.name }));
    var meta = U.el('div', { class: 'qmeta' });
    if (p.hit) {
      meta.appendChild(U.el('span', { class: 'pill', text: U.money(p.price) }));
      meta.appendChild(U.el('span', { class: 'pill mute', text: p.platform || '平台未知' }));
      meta.appendChild(U.el('span', { class: 'pill mute', text: p.brand || '品牌未知' }));
    } else {
      meta.appendChild(U.el('span', { class: 'pill warn', text: '文件名不符合约定，元数据留空' }));
    }
    if (job.crop) meta.appendChild(U.el('span', { class: 'pill mute', text: '已裁剪 ' + Math.round(job.crop.w) + '×' + Math.round(job.crop.h) }));
    mid.appendChild(meta);
    mid.appendChild(U.el('div', { class: 'qstatus ' + st.cls, text: st.t }));
    row.appendChild(mid);

    var acts = U.el('div', { class: 'qactions' });
    if (job.status !== 'working') {
      acts.appendChild(U.el('button', { class: 'btn sm ghost', type: 'button', text: job.canvas ? '重做去背' : '开始去背', onclick: function () { processJob(job); } }));
    }
    acts.appendChild(U.el('button', { class: 'btn sm ghost', type: 'button', text: '裁剪 / 拆件', onclick: function () { openCrop(job); } }));
    acts.appendChild(U.el('button', { class: 'btn sm ghost', type: 'button', text: 'AI 补全', onclick: function () { aiFill(job); } }));
    acts.appendChild(U.el('button', { class: 'btn sm primary', type: 'button', text: '填写并入库', disabled: job.status !== 'ready', onclick: function () { openEdit(job); } }));
    acts.appendChild(U.el('button', { class: 'btn sm', type: 'button', text: '移除', onclick: function () {
      jobs = jobs.filter(function (j) { return j !== job; });
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      renderQueue();
    } }));
    row.appendChild(acts);
    return row;
  }

  function updatePill() {
    var pill = U.$('#intake-mode-pill');
    var mode = U.$('#opt-bgmode');
    var map = { algo: '去背：离线算法', model: '去背：AI 模型', none: '去背：不去背' };
    pill.textContent = map[mode.value] || '去背';
    var ready = jobs.filter(function (j) { return j.status === 'ready' && !j.done; }).length;
    if (jobs.length) pill.textContent += ' · ' + ready + '/' + jobs.length + ' 就绪';
  }

  /* ---------- 裁剪 ---------- */
  function openCrop(job) {
    Bg.toCanvas(job.file).then(function (full) {
      var wrap = U.el('div', { class: 'crop-wrap', style: 'position:relative;display:inline-block;max-width:100%' });
      var img = U.el('img', { src: full.toDataURL('image/jpeg', 0.85), alt: '', style: 'max-width:100%;display:block;border-radius:8px' });
      var box = U.el('div', { class: 'crop-box', style: 'position:absolute;border:2px solid #8B6F47;background:rgba(139,111,71,.12);display:none;pointer-events:none' });
      wrap.appendChild(img);
      wrap.appendChild(box);
      var info = U.el('div', { class: 'hint', text: '在图上按住拖动画框。原图 ' + full.width + '×' + full.height + '，裁剪区域按 1:1 像素保留。' });
      var start = null, rect = null;

      function pos(e) {
        var r = img.getBoundingClientRect();
        var cx = e.touches ? e.touches[0].clientX : e.clientX;
        var cy = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: Math.max(0, Math.min(img.width, (cx - r.left) * (full.width / r.width))),
          y: Math.max(0, Math.min(img.height, (cy - r.top) * (full.height / r.height)))
        };
      }
      img.addEventListener('mousedown', function (e) { e.preventDefault(); start = pos(e); });
      img.addEventListener('mousemove', function (e) {
        if (!start) return;
        var p = pos(e);
        rect = {
          x: Math.min(start.x, p.x), y: Math.min(start.y, p.y),
          w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y)
        };
        box.style.display = 'block';
        box.style.left = (rect.x / full.width * img.clientWidth) + 'px';
        box.style.top = (rect.y / full.height * img.clientHeight) + 'px';
        box.style.width = (rect.w / full.width * img.clientWidth) + 'px';
        box.style.height = (rect.h / full.height * img.clientHeight) + 'px';
        info.textContent = '选区 ' + Math.round(rect.w) + ' × ' + Math.round(rect.h) + ' px（原图像素）';
      });
      window.addEventListener('mouseup', function () { if (start) { start = null; } });

      function apply(newJob) {
        if (!rect || rect.w < 20 || rect.h < 20) { U.toast('选区太小或没画；需要至少 20×20', 'warn'); return false; }
        newJob.crop = rect;
        newJob.status = 'idle';
        newJob.canvas = null;
        newJob.done = false;
        return true;
      }

      W.app.openModal('裁剪 / 拆件', U.el('div', {}, [wrap, info]), [
        U.el('button', { class: 'btn ghost', type: 'button', text: '取消', onclick: function () { W.app.closeModal(); } }),
        U.el('button', { class: 'btn', type: 'button', text: '另存为新一件（同一原图拆多件）', onclick: function () {
          var clone = {
            jid: U.uid('job'), file: job.file, parsed: job.parsed, status: 'idle',
            canvas: null, previewUrl: null, error: null, crop: null, done: false
          };
          if (!apply(clone)) return;
          jobs.splice(jobs.indexOf(job) + 1, 0, clone);
          W.app.closeModal(); renderQueue(); processJob(clone);
        } }),
        U.el('button', { class: 'btn primary', type: 'button', text: '替换这张', onclick: function () {
          if (!apply(job)) return;
          W.app.closeModal(); renderQueue(); processJob(job);
        } })
      ]);
    });
  }

  /* ---------- AI 补全元数据 ---------- */
  function aiFill(job) {
    return sourceBlobFor(job).then(function (blob) {
      U.toast('正在调用视觉模型…');
      return W.vision.tagItem(blob, job.parsed.hit ? job.parsed.desc : '');
    }).then(function (data) {
      var base = autoMeta(job);
      var merged = Object.assign(base, resetChecks(JSON.parse(JSON.stringify(data))));
      merged.price = job.parsed.price !== null ? job.parsed.price : base.price;
      merged.sourcePlatform = job.parsed.platform || base.sourcePlatform;
      merged.sourceUrl = '';
      merged.colorHex = data.colorHex || base.colorHex;
      merged.notes = data.notes || 'AI 视觉补齐；品牌与价格以文件名为准';
      U.toast('AI 已补全，请核对后入库', 'ok');
      openEdit(job, merged);
    }).catch(function (e) {
      U.toast('AI 补全失败：' + e.message, 'bad');
    });
  }

  /* ---------- 编辑表单 ---------- */
  function openEdit(job, preset) {
    var meta = preset || autoMeta(job);
    return S.list().then(function (list) {
      var taken = list.map(function (i) { return i.id; });
      var hint = U.slugify(meta.name) || U.slugify(job.parsed.desc) || 'sku';
      meta.id = uniqId(hint, taken);
      var previewHtml = '<div class="pv"><img src="' + (job.previewUrl || '') + '" alt=""></div>' +
        '<div><div class="muted small">来自文件<br>' + U.esc(job.file.name) + '</div>' +
        (meta.colorHex && /^#/.test(meta.colorHex) ? '<div style="margin-top:8px"><i class="swatch" style="display:inline-block;background:' + meta.colorHex + '"></i> <span class="small muted">' + meta.colorHex + '</span></div>' : '') +
        '</div>';
      var form = W.forms.item(meta, { previewHtml: previewHtml, showWorkwearHint: true });
      W.app.openModal('填写元数据并入库', form.node, [
        U.el('button', { class: 'btn ghost', type: 'button', text: '取消', onclick: function () { W.app.closeModal(); } }),
        U.el('button', { class: 'btn primary', type: 'button', text: '入库', onclick: function () {
          var item = form.read();
          return saveJob(job, item);
        } })
      ]);
    });
  }

  function saveJob(job, item) {
    if (!job.canvas) return U.toast('还没完成去背', 'warn');
    return S.list().then(function (list) {
      var exists = list.filter(function (i) { return i.id === item.id; })[0];
      if (exists && !confirm('id「' + item.id + '」已存在，覆盖它？')) return null;
      item.image = 'items/' + item.id + '.png';
      return Promise.all([
        Bg.png(job.canvas),
        Bg.flatten(job.canvas),
        Bg.thumb(job.canvas),
        sourceBlobFor(job)
      ]).then(function (res) {
        return Promise.all([
          S.putImage(S.IMG_KEY.png(item.id), res[0]),
          S.putImage(S.IMG_KEY.jpg(item.id), res[1]),
          S.putImage(S.IMG_KEY.thumb(item.id), res[2]),
          S.putImage(S.IMG_KEY.orig(item.id), res[3]),
          S.put(item)
        ]);
      }).then(function () {
        job.done = true;
        job.savedAs = item.id;
        W.app.closeModal();
        U.toast('已入库：' + item.id, 'ok');
        renderQueue();
        W.app.refresh();
      });
    }).catch(function (e) {
      U.toast('入库失败：' + (e && e.message ? e.message : e), 'bad');
    });
  }

  /* ---------- 全部快速入库 ---------- */
  function saveAll() {
    var list = jobs.filter(function (j) { return !j.done && j.status === 'ready'; });
    if (!list.length) return;
    if (!confirm('将把 ' + list.length + ' 件按文件名+图片推断直接入库（字段里会有 [待确认]）。继续？')) return;
    var chain = Promise.resolve();
    list.forEach(function (job) {
      chain = chain.then(function () {
        return S.list().then(function (items) {
          var meta = autoMeta(job);
          meta.id = uniqId(U.slugify(meta.name) || 'sku', items.map(function (i) { return i.id; }));
          return Promise.all([Bg.png(job.canvas), Bg.flatten(job.canvas), Bg.thumb(job.canvas), sourceBlobFor(job)])
            .then(function (res) {
              return Promise.all([
                S.putImage(S.IMG_KEY.png(meta.id), res[0]),
                S.putImage(S.IMG_KEY.jpg(meta.id), res[1]),
                S.putImage(S.IMG_KEY.thumb(meta.id), res[2]),
                S.putImage(S.IMG_KEY.orig(meta.id), res[3])
              ]);
            }).then(function () {
              meta.image = 'items/' + meta.id + '.png';
              return S.put(meta);
            }).then(function () {
              job.done = true; job.savedAs = meta.id;
            });
        });
      });
    });
    chain.then(function () {
      renderQueue(); W.app.refresh();
      U.toast('已入库 ' + list.length + ' 件；请到衣橱补 [待确认] 字段', 'ok');
    }).catch(function (e) { U.toast('批量入库失败：' + e.message, 'bad'); });
  }

  /* ---------- 初始化 ---------- */
  I.init = function () {
    var dz = U.$('#dropzone'), fi = U.$('#file-input');
    dz.addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function (e) { addFiles(e.target.files); fi.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    var mode = U.$('#opt-bgmode');
    var tol = U.$('#opt-tol');
    var ptol = U.$('#opt-ptol');
    var keep = U.$('#opt-keep');
    var autodo = U.$('#opt-autodo');
    S.settings().then(function (s) {
      mode.value = s.bgMode; tol.value = s.tolerance; U.$('#opt-tol-val').textContent = s.tolerance;
      ptol.value = s.parentTolerance; U.$('#opt-ptol-val').textContent = s.parentTolerance;
      keep.checked = s.keepLargest; autodo.checked = true;
      updatePill();
    });
    function persistOpts() {
      S.settings().then(function (s) {
        s.bgMode = mode.value;
        s.tolerance = Number(tol.value);
        s.parentTolerance = Number(ptol.value);
        s.keepLargest = keep.checked;
        return S.saveSettings(s);
      });
    }
    mode.addEventListener('change', function () { persistOpts(); updatePill(); });
    tol.addEventListener('input', function () { U.$('#opt-tol-val').textContent = tol.value; });
    tol.addEventListener('change', persistOpts);
    ptol.addEventListener('input', function () { U.$('#opt-ptol-val').textContent = ptol.value; });
    ptol.addEventListener('change', persistOpts);
    keep.addEventListener('change', persistOpts);

    U.$('#btn-intake-clear').addEventListener('click', function () {
      jobs.forEach(function (j) { if (j.previewUrl) URL.revokeObjectURL(j.previewUrl); });
      jobs = []; renderQueue();
    });
    U.$('#btn-intake-all').addEventListener('click', saveAll);
    renderQueue();
  };
})(window.W = window.W || {});
