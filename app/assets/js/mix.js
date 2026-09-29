/* mix.js — 我的搭配：上装 / 下装 / 外套 三条可左右滑动的单品条，
   外套作为叠加层压在上装之上（可一键开/关），选好后可存成一套搭配。
   自动推荐用风格画像的色板 + 中性色规则，不调任何生成式模型。 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var M = (W.mix = {});

  var ROWS = [
    { k: 'outerwear', l: '外套（叠加层）' },
    { k: 'top', l: '上装' },
    { k: 'bottom', l: '下装' },
    { k: 'accessory', l: '配饰' }
  ];

  var items = [], pf = null;
  var sel = { outerwear: null, top: null, bottom: null, accessory: null };
  var outerOn = true;

  function byCat(k) { return items.filter(function (i) { return i.category === k; }); }

  /* 两件能不能搭：色板命中 + 中性色 + 季节重叠，0~3 分 */
  function harmony(a, b) {
    if (!a || !b) return 0;
    var pal = (pf && pf.colorPaletteHex) || [];
    var t1 = U.paletteFit(a.colorHex, pal).tier;
    var t2 = U.paletteFit(b.colorHex, pal).tier;
    var na = U.isNeutral(a.colorHex), nb = U.isNeutral(b.colorHex);
    var s = 0;
    if (t1 === 'in' && t2 === 'in') s = 3;
    else if ((t1 === 'in' || t2 === 'in') && t1 !== 'off' && t2 !== 'off') s = 3;
    else if ((t1 !== 'off' || t2 !== 'off') && (na || nb)) s = 2;
    else if (na && nb) s = 2;
    else s = 1;
    var sa = a.season || [], sb = b.season || [];
    if (sa.length && sb.length && !sa.some(function (x) { return sb.indexOf(x) >= 0; })) s -= 2;
    return s;
  }

  function pickRandom() {
    var tops = byCat('top'), bots = byCat('bottom'), outs = byCat('outerwear'), acc = byCat('accessory');
    if (!tops.length || !bots.length) { U.toast('上装或下装还不够，先去入库', 'warn'); return; }
    var best = null;
    for (var t = 0; t < tops.length; t++) {
      for (var b = 0; b < bots.length; b++) {
        var s = harmony(tops[t], bots[b]);
        if (!best || s > best.s) best = { s: s, top: tops[t], bottom: bots[b] };
      }
    }
    sel.top = best.top; sel.bottom = best.bottom;
    /* 外套：能加分才叠，否则留空 */
    var bo = null;
    outs.forEach(function (o) {
      var s = harmony(o, best.top) + harmony(o, best.bottom);
      if (!bo || s > bo.s) bo = { s: s, o: o };
    });
    if (bo && bo.s >= 3 && (best.top.season || []).some(function (x) { return (bo.o.season || []).indexOf(x) >= 0; })) {
      sel.outerwear = bo.o;
    } else {
      sel.outerwear = null;
    }
    sel.accessory = acc.length ? acc[Math.floor(Math.random() * acc.length)] : null;
    renderStage();
    markStrips();
  }

  function slotNode(kind, item, cls) {
    return new Promise(function (resolve) {
      if (!item) {
        resolve(U.el('div', { class: 'mix-slot empty ' + (cls || '') }, [
          U.el('span', { class: 'muted', text: kind === 'top' ? '选一件上装' : kind === 'bottom' ? '选一条下装' : '暂无' })
        ]));
        return;
      }
      S.ensureJpg(item.id).then(function () {
        return S.itemImage(item.id);
      }).then(function (u) {
        resolve(U.el('div', { class: 'mix-slot ' + (cls || ''), dataset: { id: item.id } }, [
          u ? U.el('img', { src: u, alt: item.name }) : U.el('span', { class: 'muted', text: item.name }),
          U.el('span', { class: 'mix-slot-tag', text: item.name }),
          U.el('i', { class: 'swatch', style: 'background:' + (item.colorHex || '#ccc') })
        ]));
      });
    });
  }

  function renderStage() {
    var stage = U.$('#mix-stage');
    U.clear(stage);
    Promise.all([
      slotNode('top', sel.top, 'band-top'),
      slotNode('bottom', sel.bottom, 'band-bottom'),
      slotNode('outer', sel.outerwear, 'band-outer' + (outerOn ? ' on' : ''))
    ]).then(function (nodes) {
      U.clear(stage);
      var stack = U.el('div', { class: 'mix-stack' });
      stack.appendChild(nodes[0]);
      stack.appendChild(nodes[1]);
      if (sel.outerwear) {
        var outer = nodes[2];
        outer.title = '点一下可以脱掉外套';
        outer.addEventListener('click', function () {
          outerOn = !outerOn;
          outer.classList.toggle('on', outerOn);
        });
        stack.appendChild(outer);
      }
      stage.appendChild(stack);

      var info = U.el('div', { class: 'mix-info' });
      var picked = [sel.outerwear, sel.top, sel.bottom, sel.accessory].filter(Boolean);
      if (picked.length >= 2) {
        var s = 0;
        if (sel.top && sel.bottom) s += harmony(sel.top, sel.bottom);
        if (sel.outerwear && sel.top) s += harmony(sel.outerwear, sel.top);
        var pal = (pf && pf.colorPaletteHex) || [];
        var off = picked.filter(function (i) { return U.paletteFit(i.colorHex, pal).tier === 'off'; });
        var nearOff = picked.filter(function (i) { return U.paletteFit(i.colorHex, pal).tier === 'near'; });
        info.appendChild(U.el('span', {
          class: 'pill ' + (s >= 4 ? 'ok' : s >= 2 ? 'warn' : 'bad'),
          text: '搭配和谐度 ' + s + ' / 6'
        }));
        info.appendChild(U.el('span', {
          class: 'pill ' + (off.length ? 'bad' : nearOff.length ? 'warn' : 'ok'),
          text: off.length ? off.length + ' 件不在目标色板内'
            : nearOff.length ? nearOff.length + ' 件是邻近色（其余在色板内）' : '全部严格落在目标色板内'
        }));
        var seasons = {};
        picked.forEach(function (i) { (i.season || []).forEach(function (x) { seasons[x] = 1; }); });
        info.appendChild(U.el('span', { class: 'pill mute', text: '可穿季节：' + (Object.keys(seasons).join('、') || '—') }));
      }
      stage.appendChild(info);
    });
  }

  function markStrips() {
    U.$$('#mix-strips .strip-item').forEach(function (n) {
      n.classList.toggle('on', !!sel[n.dataset.cat] && sel[n.dataset.cat].id === n.dataset.id);
    });
  }

  function renderStrips() {
    var host = U.$('#mix-strips');
    U.clear(host);
    ROWS.forEach(function (row) {
      var list = byCat(row.k);
      if (!list.length) return;
      var box = U.el('div', { class: 'strip-row' });
      box.appendChild(U.el('div', { class: 'strip-head' }, [
        U.el('h4', { text: row.l }),
        U.el('span', { class: 'muted small', text: list.length + ' 件 · 左右滑动' }),
        row.k === 'outerwear' ? U.el('button', {
          class: 'btn tiny', type: 'button', text: outerOn ? '叠加中' : '已脱下',
          onclick: function () { outerOn = !outerOn; renderStage(); renderStrips(); }
        }) : null
      ]));
      var strip = U.el('div', { class: 'strip' });
      list.forEach(function (it) {
        var n = U.el('div', { class: 'strip-item', dataset: { id: it.id, cat: row.k } }, [
          U.el('div', { class: 'strip-img' }),
          U.el('div', { class: 'strip-name', text: it.name })
        ]);
        S.thumbUrl(it.id).then(function (u) {
          var box2 = n.querySelector('.strip-img');
          if (u) { box2.appendChild(U.el('img', { src: u, alt: it.name, loading: 'lazy' })); }
          else { box2.appendChild(U.el('span', { class: 'muted', text: '无图' })); }
        });
        n.addEventListener('click', function () {
          sel[row.k] = sel[row.k] && sel[row.k].id === it.id ? null : it;
          if (row.k === 'outerwear' && sel[row.k]) outerOn = true;
          renderStage();
          markStrips();
        });
        strip.appendChild(n);
      });
      box.appendChild(strip);
      host.appendChild(box);
    });
    markStrips();
  }

  function saveOutfit() {
    var picked = [sel.outerwear, sel.top, sel.bottom, sel.accessory].filter(Boolean);
    if (picked.length < 2) { U.toast('至少选上装 + 下装', 'warn'); return; }
    var name = (sel.top ? sel.top.name : '') + ' × ' + (sel.bottom ? sel.bottom.name : '');
    var tags = [];
    picked.forEach(function (i) { (i.aestheticTags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    var occ = {};
    picked.forEach(function (i) { (i.occasion || []).forEach(function (o) { occ[o] = (occ[o] || 0) + 1; }); });
    var occBest = Object.keys(occ).sort(function (a, b2) { return occ[b2] - occ[a]; })[0] || '休闲';
    var o = {
      id: U.uid('outfit'), name: name, garmentIds: picked.map(function (i) { return i.id; }),
      occasion: occBest, aestheticTags: tags.slice(0, 3), pieces: picked.length,
      addedAt: U.now(), source: 'mix'
    };
    S.addOutfit(o).then(function () {
      U.toast('已保存搭配：' + name, 'ok');
      W.app.refresh();
    });
  }

  M.refresh = function () {
    return Promise.all([S.list(), S.profile()]).then(function (r) {
      items = r[0]; pf = r[1];
      renderStrips();
      renderStage();
    });
  };

  M.init = function () {
    U.$('#btn-mix-random').addEventListener('click', pickRandom);
    U.$('#btn-mix-save').addEventListener('click', saveOutfit);
    U.$('#btn-mix-clear').addEventListener('click', function () {
      sel = { outerwear: null, top: null, bottom: null, accessory: null };
      renderStage(); markStrips();
    });
  };
})(window.W = window.W || {});
