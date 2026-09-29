/* target.js — 目标风格板：把风格画像变成看得见的一块板
   内容全部来自 style-profile.json + 内置参考图 data/inspo.json，
   并额外算一件事：现有衣橱离目标风格有多远（色板命中率 / 廓形命中率）。 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var T = (W.target = {});
  var inspoCache = null;

  function loadInspo() {
    if (inspoCache) return Promise.resolve(inspoCache);
    return fetch('data/inspo.json').then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) { inspoCache = Array.isArray(list) ? list : []; return inspoCache; })
      .catch(function () { inspoCache = []; return inspoCache; });
  }

  function section(title, node) {
    return U.el('div', { class: 'card' }, [U.el('h3', { text: title }), node]);
  }

  function kvRows(obj) {
    var wrap = U.el('div', { class: 'kv-list' });
    Object.keys(obj || {}).forEach(function (k) {
      wrap.appendChild(U.el('div', { class: 'kv' }, [
        U.el('span', { class: 'kv-k', text: k }),
        U.el('span', { class: 'kv-v', text: String(obj[k]) })
      ]));
    });
    return wrap;
  }

  function bullets(list) {
    var ol = U.el('ol', { class: 'bullets' });
    (list || []).forEach(function (x) { ol.appendChild(U.el('li', { text: x })); });
    return ol;
  }

  function chipsRow(list, cls) {
    var wrap = U.el('div', { class: 'chips-inline' });
    (list || []).forEach(function (x) {
      wrap.appendChild(U.el('span', { class: 'chip ' + (cls || ''), text: x }));
    });
    return wrap;
  }

  function paletteBlock(pf) {
    var wrap = U.el('div', { class: 'pal-grid' });
    (pf.colorPaletteHex || []).forEach(function (hex, i) {
      var name = (pf.colorPaletteNames || [])[i] || '';
      wrap.appendChild(U.el('div', { class: 'pal-cell' }, [
        U.el('div', { class: 'pal-chip', style: 'background:' + hex }),
        U.el('div', { class: 'pal-hex', text: hex }),
        U.el('div', { class: 'pal-name muted', text: name })
      ]));
    });
    return wrap;
  }

  /* 现有衣橱 vs 目标色板：命中率 */
  function fitBlock(pf, items) {
    var pal = pf.colorPaletteHex || [];
    var hit = [], near = [], miss = [];
    items.forEach(function (it) {
      var tier = U.paletteFit(it.colorHex, pal).tier;
      (tier === 'in' ? hit : tier === 'near' ? near : miss).push(it);
    });
    var pct = items.length ? Math.round(hit.length / items.length * 100) : 0;

    var loose = items.filter(function (it) {
      return (it.tags || []).concat(it.aestheticTags || []).join(' ').match(/阔腿|宽松|弯刀|oversize|直筒|伞|气球|拖地/);
    }).length;

    var wrap = U.el('div', {});
    wrap.appendChild(U.el('div', { class: 'fit-row' }, [
      U.el('div', { class: 'fit-stat' }, [
        U.el('b', { text: pct + '%' }), U.el('span', { class: 'muted', text: '严格命中色板' })
      ]),
      U.el('div', { class: 'fit-stat' }, [
        U.el('b', { text: hit.length + '/' + items.length }), U.el('span', { class: 'muted', text: '件 ΔE≤' + U.FIT_IN + '（同色系）' })
      ]),
      U.el('div', { class: 'fit-stat' }, [
        U.el('b', { text: near.length + ' 件' }), U.el('span', { class: 'muted', text: '邻近色（ΔE ' + U.FIT_IN + '–' + U.FIT_NEAR + '）' })
      ]),
      U.el('div', { class: 'fit-stat' }, [
        U.el('b', { text: loose + ' 件' }), U.el('span', { class: 'muted', text: '宽松廓形' })
      ])
    ]));
    if (miss.length) {
      wrap.appendChild(U.el('div', { class: 'hint warn', text: '明显偏离色板（ΔE>' + U.FIT_NEAR + '）：' + miss.slice(0, 8).map(function (m) { return m.name; }).join('、') + (miss.length > 8 ? ' 等 ' + miss.length + ' 件' : '') }));
    }
    if (near.length) {
      wrap.appendChild(U.el('div', { class: 'hint', text: '邻近色（能搭，但下次优先买严格色板内的）：' + near.slice(0, 8).map(function (m) { return m.name; }).join('、') + (near.length > 8 ? ' 等 ' + near.length + ' 件' : '') }));
    }
    return wrap;
  }

  T.render = function () {
    var host = U.$('#target-body');
    if (!host) return Promise.resolve();
    U.clear(host);
    host.appendChild(U.el('div', { class: 'muted', text: '加载中…' }));

    return Promise.all([S.profile(), S.list(), loadInspo()]).then(function (r) {
      var pf = r[0], items = r[1], inspo = r[2];
      U.clear(host);

      var top = U.el('div', { class: 'card target-hero' }, [
        U.el('h2', { text: '我的目标风格' }),
        U.el('p', { class: 'lead', text: pf.summary || '（还没有画像）' }),
        chipsRow(pf.coreStyles || [], 'on')
      ]);
      host.appendChild(top);

      var cols = U.el('div', { class: 'cols' });
      var left = U.el('div', { class: 'col-main' });
      var right = U.el('div', { class: 'col-side' });

      left.appendChild(section('目标色板（' + (pf.colorPaletteHex || []).length + ' 色）', paletteBlock(pf)));
      left.appendChild(section('现有衣橱 vs 目标风格', fitBlock(pf, items)));
      left.appendChild(section('目标廓形规则', kvRows({
        '上装': (pf.silhouetteRules && pf.silhouetteRules.topModes || []).join('；'),
        '下装': pf.silhouetteRules && pf.silhouetteRules.bottomRule,
        '裤长': pf.silhouetteRules && pf.silhouetteRules.hemLength,
        '腰位': pf.silhouetteRules && pf.silhouetteRules.waist,
        '比例': pf.silhouetteRules && pf.silhouetteRules.proportion
      })));
      left.appendChild(section('常用搭配公式（照抄这些不会错）', bullets(pf.outfitFormulas)));
      left.appendChild(section('参考图（' + inspo.length + ' 张）', (function () {
        var g = U.el('div', { class: 'inspo-grid' });
        inspo.forEach(function (x) {
          g.appendChild(U.el('figure', { class: 'inspo-card' }, [
            U.el('img', { src: 'data/' + String(x.file || '').replace(/^\.?\//, ''), alt: x.caption || '' }),
            U.el('figcaption', { text: x.caption || '' })
          ]));
        });
        if (!inspo.length) g.appendChild(U.el('div', { class: 'muted', text: '没有内置参考图' }));
        return g;
      })()));

      right.appendChild(section('鞋与包', kvRows(pf.shoeBagProfile)));
      right.appendChild(section('色彩规则', U.el('p', { class: 'lead small', text: pf.colorRules })));
      right.appendChild(section('材质偏好', chipsRow(pf.materialPreference)));
      right.appendChild(section('图案偏好', chipsRow(pf.patternPreference)));
      right.appendChild(section('雷区（别买）', chipsRow((pf.avoidList || []).concat(pf.avoidPatterns || []), 'bad')));
      right.appendChild(section('价位带', U.el('div', { class: 'kv-list' }, [
        U.el('div', { class: 'kv' }, [
          U.el('span', { class: 'kv-k', text: '常用区间' }),
          U.el('span', { class: 'kv-v', text: '¥' + (pf.priceRange || {}).min + ' – ¥' + (pf.priceRange || {}).max })
        ]),
        U.el('div', { class: 'kv' }, [
          U.el('span', { class: 'kv-k', text: '主要场合' }),
          U.el('span', { class: 'kv-v', text: (pf.typicalOccasions || []).join('、') })
        ])
      ])));
      if (pf.photoStyle || pf.lighting) {
        var ps = pf.photoStyle || {}, li = pf.lighting || {};
        right.appendChild(section('摄影与光影', kvRows({
          '构图': ps.framing, '场景': ps.scenePreference,
          '色调': ps.tone, '后期': ps.post,
          '偏好光线': (li.preferred || []).join('；'),
          '避开': (li.avoid || []).join('；'),
          '阴影': li.shadowCharacter
        })));
      }
      right.appendChild(section('各项置信度', kvRows(pf.confidence)));

      cols.appendChild(left);
      cols.appendChild(right);
      host.appendChild(cols);
    });
  };

  T.init = function () {
    /* 视图切换时由 app.go 触发 T.render */
  };
})(window.W = window.W || {});
