/* compose.js — 模块五：穿搭预览图（flat lay 平铺，程序化拼贴）
   严格照 AGENT-PROMPT §6：1080×1920 / 纯白 / 左右 120 / 上下 160 / 件间距 50 /
   堆叠序 outerwear→top→bottom→shoes→accessory / 品类宽度系数 / 溢出整体等比缩放 /
   不凭空加任何装饰，不调用任何生成式模型 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var C = (W.compose = {});

  var CANVAS_W = 1080, CANVAS_H = 1920;
  var MARGIN_X = 120, MARGIN_Y = 160, GAP = 50, GAP_X = 30;
  var RATIO = { outerwear: 0.80, top: 0.80, bottom: 0.85, shoes: 0.45, accessory: 0.30 };
  var ORDER = ['outerwear', 'top', 'bottom', 'shoes', 'accessory'];
  var USABLE_W = CANVAS_W - MARGIN_X * 2; // 840

  var selected = [];
  var tagChips = null;
  var lastCanvas = null;

  function groupsOf(items) {
    var byCat = {};
    items.forEach(function (it) { (byCat[it.category] = byCat[it.category] || []).push(it); });
    return ORDER.filter(function (c) { return byCat[c]; }).map(function (c) { return byCat[c]; });
  }

  function layout(bitmaps, scale) {
    // bitmaps: [{ item, bmp }]，已按组的顺序排好
    var rows = [];
    groupsOf(bitmaps.map(function (x) { return x.item; })).forEach(function (groupItems) {
      var ratio = RATIO[groupItems[0].category] || 0.7;
      var rowW = USABLE_W * ratio * scale;
      var n = groupItems.length;
      var cellW = (rowW - GAP_X * (n - 1)) / n;
      var cells = groupItems.map(function (it) {
        var entry = bitmaps.filter(function (x) { return x.item.id === it.id; })[0];
        var w = cellW;
        var h = w * (entry.bmp.height / entry.bmp.width);
        return { item: it, bmp: entry.bmp, w: w, h: h };
      });
      var rowH = Math.max.apply(null, cells.map(function (c2) { return c2.h; }));
      rows.push({ cells: cells, rowW: rowW, h: rowH });
    });

    var totalH = rows.reduce(function (a, r) { return a + r.h; }, 0) + GAP * Math.max(0, rows.length - 1);
    return { rows: rows, totalH: totalH };
  }

  function draw(bitmaps, options) {
    var canvas = U.$('#flatlay');
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (!bitmaps.length) {
      ctx.fillStyle = '#8B94A6';
      ctx.font = '500 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('左边勾选单品，点「渲染预览」', CANVAS_W / 2, CANVAS_H / 2);
      lastCanvas = canvas;
      return canvas;
    }

    var availH = CANVAS_H - MARGIN_Y * 2;
    var l1 = layout(bitmaps, 1);
    var scale = l1.totalH > availH ? availH / l1.totalH : 1;
    var l2 = layout(bitmaps, scale);

    var y = MARGIN_Y + Math.max(0, (availH - l2.totalH) / 2);

    l2.rows.forEach(function (row, ri) {
      if (ri > 0) y += GAP;
      var startX = (CANVAS_W - row.rowW) / 2;
      var slot = (row.rowW + GAP_X) / row.cells.length;
      row.cells.forEach(function (cell, ci) {
        var slotX = startX + ci * slot;
        var x = slotX + (slot - GAP_X - cell.w) / 2;
        ctx.drawImage(cell.bmp, x, y + (row.h - cell.h) / 2, cell.w, cell.h);
      });
      y += row.h;
    });

    if (options && options.labelOn && options.label) {
      ctx.fillStyle = '#172033';
      ctx.globalAlpha = 0.72;
      ctx.font = '400 28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(options.label, CANVAS_W / 2, CANVAS_H - 92);
      ctx.globalAlpha = 1;
    }

    lastCanvas = canvas;
    return canvas;
  }

  function loadSelected() {
    var specs = selected.slice();
    return Promise.all(specs.map(function (item) {
      return S.getImage(S.IMG_KEY.png(item.id)).then(function (blob) {
        if (!blob) return U.loadBitmap(new Blob()).catch(function () { return null; });
        return U.loadBitmap(blob);
      }).then(function (bmp) { return { item: item, bmp: bmp }; });
    })).then(function (list) {
      return list.filter(function (x) { return x.bmp; });
    });
  }

  function renderCanvas() {
    return loadSelected().then(function (list) {
      draw(list, { labelOn: U.$('#cmp-label-on').checked, label: U.$('#cmp-label').value.trim() });
      bitmapsClose(list);
    });
  }
  function bitmapsClose(list) {
    list.forEach(function (x) { if (x.bmp && x.bmp.close) try { x.bmp.close(); } catch (e) { } });
  }

  /* ---------- 左侧选择器 ---------- */
  function renderPicker() {
    var host = U.$('#compose-groups');
    var search = U.$('#compose-search');
    var q = (search.value || '').trim().toLowerCase();
    return S.list().then(function (items) {
      U.clear(host);
      var shown = items.filter(function (it) {
        return !q || (it.name + ' ' + (it.brand || '') + ' ' + (it.subcategory || '')).toLowerCase().indexOf(q) >= 0;
      });
      ORDER.forEach(function (cat) {
        var list = shown.filter(function (it) { return it.category === cat; });
        if (!list.length) return;
        var g = U.el('div', { class: 'pick-group' }, [U.el('h4', { text: W.schema.catLabel(cat) + ' · ' + list.length })]);
        list.forEach(function (it) {
          var on = selected.filter(function (s) { return s.id === it.id; }).length > 0;
          var row = U.el('div', { class: 'pick-item' + (on ? ' on' : '') });
          S.thumbUrl(it.id).then(function (u) {
            if (u) row.insertBefore(U.el('img', { src: u, alt: '' }), row.firstChild);
          });
          row.appendChild(U.el('span', { text: it.name }));
          row.addEventListener('click', function () {
            if (on) selected = selected.filter(function (s) { return s.id !== it.id; });
            else selected.push(it);
            renderPicker();
            renderCanvas();
          });
          g.appendChild(row);
        });
        host.appendChild(g);
      });
      if (!shown.length) host.appendChild(U.el('div', { class: 'hint', text: '没有匹配的单品。' }));
    });
  }

  /* ---------- 已保存搭配 ---------- */
  var token = 0;
  function renderSaved() {
    var host = U.$('#outfit-grid');
    var my = ++token;
    return S.outfits().then(function (list) {
      U.clear(host);
      if (my !== token) return;
      if (!list.length) {
        host.appendChild(U.el('div', { class: 'hint', text: '还没有保存的搭配。' }));
        return;
      }
      list.forEach(function (o) {
        S.imageUrl(S.IMG_KEY.outfit(o.id)).then(function (u) {
          if (my !== token) return;
          host.appendChild(U.el('div', { class: 'outfit-card' }, [
            u ? U.el('img', { src: u, alt: o.name }) : U.el('div', { class: 'muted small', style: 'padding:20px;text-align:center', text: '无图' }),
            U.el('div', { class: 'outfit-meta' }, [
              U.el('div', { style: 'font-weight:600', text: o.name || o.id }),
              U.el('div', { class: 'muted', text: o.occasion + ' · ' + (o.garmentIds || []).length + ' 件' }),
              U.el('div', { class: 'row-actions', style: 'margin-top:8px' }, [
                U.el('button', { class: 'btn sm ghost', type: 'button', text: '下载', onclick: function () {
                  S.getImage(S.IMG_KEY.outfit(o.id)).then(function (b) {
                    if (b) U.downloadBlob(b, o.id + '.png');
                  });
                } }),
                U.el('button', { class: 'btn sm danger', type: 'button', text: '删除', onclick: function () {
                  S.removeOutfit(o.id).then(function () { renderSaved(); W.app.refresh(); });
                } })
              ])
            ])
          ]));
        });
      });
    });
  }

  function saveOutfit() {
    if (!selected.length) return U.toast('先选几件单品', 'warn');
    return renderCanvas().then(function () {
      return U.canvasToBlob(U.$('#flatlay'), 'image/png');
    }).then(function (blob) {
      var id = U.uid('outfit');
      var o = {
        id: id,
        name: U.$('#cmp-name').value.trim() || (selected.map(function (s) { return s.name; }).join(' × ').slice(0, 40)),
        garmentIds: selected.map(function (s) { return s.id; }),
        occasion: U.$('#cmp-occasion').value,
        aestheticTags: tagChips ? tagChips.get() : [],
        image: 'outfits/' + id + '.png',
        createdAt: U.now()
      };
      return Promise.all([S.putImage(S.IMG_KEY.outfit(id), blob), S.addOutfit(o)]);
    }).then(function () {
      U.toast('搭配已保存', 'ok');
      renderSaved(); W.app.refresh();
    }).catch(function (e) { U.toast('保存失败：' + e.message, 'bad'); });
  }

  function autoLabel() {
    if (U.$('#cmp-label').value.trim()) return U.$('#cmp-label').value.trim();
    var names = selected.map(function (s) { return s.name; });
    return names.length ? String(selected.length).padStart(2, '0') + ' / ' + names.slice(0, 3).join(' × ') : '';
  }

  C.init = function () {
    S.list().then(function () { renderPicker(); });
    renderSaved();
    tagChips = U.chips(U.$('#cmp-tags'), [], { placeholder: '回车添加', split: ',' });

    U.$('#compose-search').addEventListener('input', U.debounce(renderPicker, 250));
    U.$('#btn-compose-render').addEventListener('click', function () {
      U.$('#cmp-label').value = autoLabel();
      renderCanvas();
    });
    U.$('#cmp-label-on').addEventListener('change', renderCanvas);
    U.$('#cmp-label').addEventListener('input', U.debounce(renderCanvas, 300));
    U.$('#btn-compose-png').addEventListener('click', function () {
      U.canvasToBlob(U.$('#flatlay'), 'image/png').then(function (b) {
        U.downloadBlob(b, (U.$('#cmp-name').value.trim() || 'outfit') + '.png');
      });
    });
    U.$('#btn-compose-save').addEventListener('click', saveOutfit);
    U.$('#btn-compose-clear').addEventListener('click', function () {
      selected = []; renderPicker(); renderCanvas();
    });

    draw([], {});
  };

  C.refresh = function () {
    selected = selected.filter(Boolean);
    renderPicker();
    renderSaved();
  };
})(window.W = window.W || {});
