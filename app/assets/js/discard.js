/* discard.js — 断舍离雷达
   与目标风格的偏离度 + 与现有衣橱的搭配度 + 闲置风险 → 🔴 可丢弃 / 🟡 观察 / 🟢 留
   纯前端计算，不打分玄学：每一项扣分都给得出理由。 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var D = (W.discard = {});

  var COMP = {
    top: ['bottom', 'outerwear', 'shoes', 'accessory'],
    outerwear: ['top', 'bottom', 'shoes'],
    bottom: ['top', 'outerwear', 'shoes', 'accessory'],
    shoes: ['top', 'bottom'],
    accessory: ['top', 'bottom', 'outerwear']
  };

  var AVOID_WORDS = ['大 logo', '大logo', '荧光', '紧身', '糖果色', '运动套装', '廉价亮面', '亮面化纤'];
  var TIGHT_RE = /紧身|修身|铅笔|打底裤|收口小脚/;
  var LOOSE_RE = /宽松|阔腿|直筒|伞裤|oversize|落肩|弯刀|气球|工装|垂坠/;

  var cache = null;          /* id -> result */
  var keepIds = null;        /* 用户点了「保留」的白名单 */

  function textOf(it) {
    return [it.name, it.subcategory, (it.tags || []).join(' '),
      (it.aestheticTags || []).join(' '), it.material, it.notes || ''].join(' ');
  }

  /* 与谁都能搭：品类互补 + 季节有交集 + 颜色不互相拉黑 */
  function partnersOf(it, items, pf) {
    var want = COMP[it.category] || [];
    var myT = (U.paletteFit(it.colorHex, pf.colorPaletteHex || []) || {}).tier;
    return items.filter(function (o) {
      if (o.id === it.id || want.indexOf(o.category) < 0) return false;
      var ss = it.season || [], os = o.season || [];
      if (ss.length && os.length && !ss.some(function (x) { return os.indexOf(x) >= 0; })) return false;
      var t = (U.paletteFit(o.colorHex, pf.colorPaletteHex || []) || {}).tier;
      var nIt = U.isNeutral(it.colorHex), nO = U.isNeutral(o.colorHex);
      if (myT === 'off' && t === 'off' && !nIt && !nO) return false;
      return true;
    });
  }

  function avoidHits(it, pf) {
    var hay = textOf(it).toLowerCase();
    var words = (pf.avoidList || []).concat(pf.avoidPatterns || []);
    var out = [];
    words.forEach(function (w) {
      var k = String(w).toLowerCase().replace(/\s+/g, '');
      if (k && hay.replace(/\s+/g, '').indexOf(k) >= 0 && out.indexOf(w) < 0) out.push(w);
    });
    return out;
  }

  function analyzeOne(it, items, pf) {
    var reasons = [];
    var style = 0, pair = 0, idle = 0;

    /* ---- 1) 目标风格偏离（0–40） ---- */
    var fit = U.paletteFit(it.colorHex, pf.colorPaletteHex || []);
    if (fit.tier === 'off') { style += 20; reasons.push({ p: 20, t: '颜色偏离目标色板（ΔE ' + Math.round(fit.d) + '，色板里没有这一族）' }); }
    else if (fit.tier === 'near') { style += 8; reasons.push({ p: 8, t: '邻近色（能穿，但不是你的核心色）' }); }

    var hits = avoidHits(it, pf);
    if (hits.length) { style += 12; reasons.push({ p: 12, t: '命中雷区：' + hits.join('、') }); }

    if (it.category === 'bottom' && TIGHT_RE.test(textOf(it))) {
      style += 12; reasons.push({ p: 12, t: '下装偏紧身/修身——你的下装规则是「只穿宽松」' });
    } else if (it.category === 'top' && /紧身/.test(textOf(it))) {
      style += 6; reasons.push({ p: 6, t: '上装紧身（上装修身可以，紧身不行）' });
    }
    if (it.category === 'bottom' && !LOOSE_RE.test(textOf(it)) && !TIGHT_RE.test(textOf(it))) {
      style += 6; reasons.push({ p: 6, t: '看不出宽松属性——目标下装基本全是阔腿/直筒/伞形' });
    }
    style = Math.min(40, style);

    /* ---- 2) 搭配度（0–35） ---- */
    var ps = partnersOf(it, items, pf);
    var n = ps.length;
    var pairBase = n === 0 ? 25 : n === 1 ? 18 : n === 2 ? 12 : n === 3 ? 7 : n === 4 ? 4 : 0;
    pair += pairBase;
    if (pairBase >= 7) reasons.push({ p: -0, t: '可搭 ' + n + ' 件：' + ps.slice(0, 3).map(function (x) { return x.name; }).join('、') + (n > 3 ? ' 等' : ''), ok: true });
    if (pairBase >= 12) reasons[reasons.length - 1].p = pairBase, reasons[reasons.length - 1].t = '搭配度低，只能配 ' + n + ' 件：' + ps.slice(0, 3).map(function (x) { return x.name; }).join('、') + (n > 3 ? ' 等' : '');

    if (n < 3) {
      var ss = it.season || [];
      var share = items.filter(function (o) {
        if (o.id === it.id) return false;
        var os = o.season || [];
        return ss.length && os.length && ss.some(function (x) { return os.indexOf(x) >= 0; });
      }).length;
      if (share < 3) { pair += 10; reasons.push({ p: 10, t: '季节孤岛：只有 ' + share + ' 件和它同季' }); }
    }
    pair = Math.min(35, pair);

    /* ---- 3) 闲置风险（0–25，口径同评估模块） ---- */
    idle += n >= 5 ? 5 : n >= 2 ? 12 : 20;
    if ((it.season || []).length === 1 && (it.occasion || []).length <= 1) {
      idle += 5; reasons.push({ p: 5, t: '单季单场合，出场机会少' });
    }
    idle = Math.min(25, idle);

    var risk = Math.min(100, style + pair + idle);
    var tier = risk >= 55 ? 'drop' : risk >= 35 ? 'watch' : 'keep';
    reasons.sort(function (a, b) { return b.p - a.p; });
    return {
      id: it.id, risk: risk, tier: tier, reasons: reasons,
      partners: n, style: style, pair: pair, idle: idle
    };
  }

  function kvKeep() {
    if (keepIds) return Promise.resolve(keepIds);
    return S.kvGet('discard-keep', []).then(function (v) { keepIds = v || []; return keepIds; });
  }

  D.ensure = function () {
    /* 恒返回 Promise：内部任何同步异常都转成 rejection，避免拖死衣橱渲染 */
    return Promise.resolve().then(function () {
      if (cache) return cache;
      return Promise.all([S.list(), S.profile(), kvKeep()]).then(function (r) {
        var items = r[0], pf = r[1] || {};
        var map = {};
        items.forEach(function (it) {
          var res;
          try { res = analyzeOne(it, items, pf); }
          catch (e) { res = { risk: 0, tier: 'keep', reasons: ['评分失败：' + (e && e.message || e)] }; }
          if (!res) res = { risk: 0, tier: 'keep', reasons: [] };
          map[it.id] = res;
        });

        /* 相对分位校准：这批衣橱色板命中率高，绝对分普遍偏低（大多 13 分左右），
           纯绝对阈值会让 44 件全是 keep、功能失效。所以最终分 = 绝对风险 0.65 + 分位 0.35，
           保证「同批里相对最该处理的」浮出来，同时保留可解释的绝对理由。 */
        var arr = items.map(function (it) { return map[it.id]; }).filter(Boolean);
        arr.sort(function (a, b) { return a.risk - b.risk; });
        var n = arr.length;
        arr.forEach(function (res, i) {
          var pct = n > 1 ? i / (n - 1) : 0;
          res.raw = res.risk;
          res.pct = pct;
          res.risk = Math.round(Math.min(100, res.risk * 0.65 + pct * 100 * 0.35));
          if (pct >= 0.85) {
            res.reasons.push({ p: 14, t: '综合排名垫底 15%（全衣橱第 ' + (i + 1) + '/' + n + '）' });
          } else if (pct >= 0.70) {
            res.reasons.push({ p: 8, t: '综合排名后 30%（全衣橱第 ' + (i + 1) + '/' + n + '）' });
          }
          res.tier = res.risk >= 55 ? 'drop' : res.risk >= 35 ? 'watch' : 'keep';
        });
        items.forEach(function (it) {
          var res = map[it.id];
          if (keepIds.indexOf(it.id) >= 0) { res.tier = 'keep'; res.kept = true; }
        });
        cache = map;
        return map;
      });
    });
  };

  D.invalidate = function () { cache = null; };

  D.resultFor = function (id) { return cache ? cache[id] : null; };

  D.setKeep = function (id, on) {
    return kvKeep().then(function () {
      var i = keepIds.indexOf(id);
      if (on && i < 0) keepIds.push(id);
      if (!on && i >= 0) keepIds.splice(i, 1);
      return S.kvSet('discard-keep', keepIds);
    }).then(function () { cache = null; });
  };

  /* ---------- 视图 ---------- */
  var TIER_LABEL = { drop: '🔴 可丢弃', watch: '🟡 观察', keep: '🟢 留' };

  function pill(tier) {
    return U.el('span', { class: 'pill ' + (tier === 'drop' ? 'bad' : tier === 'watch' ? 'warn' : 'ok'), text: TIER_LABEL[tier] });
  }

  function itemRow(res, item, imgUrl) {
    var box = U.el('div', { class: 'dis-row' });
    var left = U.el('div', { class: 'dis-thumb' });
    if (imgUrl) left.appendChild(U.el('img', { src: imgUrl, alt: item.name }));
    box.appendChild(left);
    var mid = U.el('div', { class: 'dis-mid' }, [
      U.el('div', { class: 'dis-name' }, [
        U.el('b', { text: item.name || item.id }),
        U.el('span', { class: 'muted small', text: ' ¥' + (item.price == null ? '?' : item.price) + ' · ' + (W.schema.catLabel(item.category)) })
      ]),
      U.el('div', { class: 'dis-why' }, (res.reasons.length ? res.reasons : [{ t: '暂无明显问题', ok: true }]).slice(0, 5).map(function (r) {
        return U.el('div', { class: 'dis-reason ' + (r.ok ? 'ok' : '') }, [
          U.el('span', { text: (r.ok ? '✓ ' : (r.p > 0 ? '+ ' : '')) }),
          U.el('span', { text: r.t + (r.ok ? '' : '（+' + r.p + '）') })
        ]);
      })),
      U.el('div', { class: 'dis-score' }, [
        U.el('b', { text: '丢弃风险 ' + res.risk }),
        U.el('span', { class: 'muted small', text: ' / 100（风格 ' + res.style + ' + 搭配 ' + res.pair + ' + 闲置 ' + res.idle + '）· 可搭 ' + res.partners + ' 件' })
      ])
    ]);
    box.appendChild(mid);
    var right = U.el('div', { class: 'dis-act' }, [
      res.kept
        ? U.el('button', { class: 'btn tiny', type: 'button', text: '取消保留', onclick: function () { D.setKeep(res.id, false).then(refresh); } })
        : U.el('button', { class: 'btn tiny ghost', type: 'button', text: '我再想想（保留）', onclick: function () { D.setKeep(res.id, true).then(refresh); } }),
      U.el('button', {
        class: 'btn tiny danger', type: 'button', text: '从衣橱删除', onclick: function () {
          if (!confirm('确定删除「' + (item.name || res.id) + '」？不可撤销。')) return;
          S.remove(res.id).then(function () { D.invalidate(); U.toast('已删除 ' + res.id); refresh(); W.app.refresh(); });
        }
      })
    ]);
    box.appendChild(right);
    return box;
  }

  function downloadReport(map, items) {
    var byTier = { drop: [], watch: [], keep: [] };
    items.forEach(function (it) { var r = map[it.id]; if (r) byTier[r.tier].push({ it: it, r: r }); });
    var L = ['# 断舍离清单（' + new Date().toISOString().slice(0, 10) + '）', ''];
    L.push('判定口径：丢弃风险 = 风格偏离(≤40) + 搭配度(≤35) + 闲置风险(≤25)；≥55 🔴 可丢弃，35–54 🟡 观察。');
    L.push('');
    ['drop', 'watch'].forEach(function (t) {
      L.push('## ' + TIER_LABEL[t] + '（' + byTier[t].length + ' 件）');
      byTier[t].forEach(function (x) {
        L.push('- **' + x.it.name + '**（¥' + x.it.price + '，' + W.schema.catLabel(x.it.category) + '）— 风险 ' + x.r.risk + '：' +
          x.r.reasons.filter(function (r) { return !r.ok; }).map(function (r) { return r.t; }).join('；'));
      });
      L.push('');
    });
    var money = byTier.drop.reduce(function (s, x) { return s + (x.it.price || 0); }, 0);
    L.push('🔴 可丢弃合计约 ¥' + Math.round(money) + '。删除前建议先试着各搭一套（我的搭配页）。');
    U.downloadText('断舍离清单-' + new Date().toISOString().slice(0, 10) + '.md', L.join('\n'));
  }

  function refresh() { cache = null; return D.ensure().then(function () { return D.render(); }); }

  D.render = function () {
    var host = U.$('#discard-body');
    if (!host) return Promise.resolve();
    U.clear(host);
    host.appendChild(U.el('div', { class: 'muted', text: '计算中…' }));
    return Promise.all([S.list(), S.profile(), D.ensure()]).then(function (r) {
      var items = r[0], map = r[2];
      U.clear(host);
      if (!items.length) {
        host.appendChild(U.el('div', { class: 'muted', text: '衣橱是空的' }));
        return;
      }
      var groups = { drop: [], watch: [], keep: [] };
      items.forEach(function (it) {
        var x = map[it.id] || { risk: 0, raw: 0, tier: 'keep', reasons: [] };
        (groups[x.tier] || groups.keep).push({ it: it, r: x });
      });
      var money = groups.drop.reduce(function (s, x) { return s + (x.it.price || 0); }, 0);
      var shoes = items.filter(function (i) { return i.category === 'shoes'; }).length;

      host.appendChild(U.el('div', { class: 'card target-hero' }, [
        U.el('h2', { text: '断舍离雷达' }),
        U.el('p', { class: 'lead', text: '按「目标风格偏离 + 搭配度 + 闲置风险」给每件衣服打丢弃风险分。≥55 可丢弃，35–54 观察。' }),
        U.el('div', { class: 'fit-row' }, [
          U.el('div', { class: 'fit-stat' }, [U.el('b', { text: groups.drop.length + ' 件' }), U.el('span', { class: 'muted', text: '🔴 建议丢弃' })]),
          U.el('div', { class: 'fit-stat' }, [U.el('b', { text: groups.watch.length + ' 件' }), U.el('span', { class: 'muted', text: '🟡 观察' })]),
          U.el('div', { class: 'fit-stat' }, [U.el('b', { text: '¥' + Math.round(money) }), U.el('span', { class: 'muted', text: '可回收金额（按买入价估）' })]),
          U.el('div', { class: 'fit-stat' }, [U.el('b', { text: (keepIds || []).length + ' 件' }), U.el('span', { class: 'muted', text: '你点过「保留」' })])
        ]),
        shoes === 0 ? U.el('div', { class: 'hint', text: '提醒：衣橱里还没录鞋子，搭配度按现有品类计算；录完鞋子后分数会更准。' }) : null,
        U.el('div', { style: 'margin-top:10px;display:flex;gap:8px' }, [
          U.el('button', { class: 'btn small', type: 'button', text: '⬇ 下载清单 .md', onclick: function () { downloadReport(map, items); } }),
          U.el('button', { class: 'btn small ghost', type: 'button', text: '↻ 重新计算', onclick: function () { D.invalidate(); D.render(); } })
        ])
      ]));

      [['drop', '🔴 建议丢弃（风格不合 / 没人能配 / 吃灰）'], ['watch', '🟡 观察名单（有点边缘，先别急着买同款）']].forEach(function (g) {
        var key = g[0];
        if (!groups[key].length) return;
        var card = U.el('div', { class: 'card' }, [U.el('h3', { text: g[1] + '（' + groups[key].length + '）' })]);
        groups[key].sort(function (a, b) { return b.r.risk - a.r.risk; });
        groups[key].forEach(function (x) {
          var row = itemRow(x.r, x.it, null);
          card.appendChild(row);
          S.itemImage(x.it.id).then(function (u) {
            if (!u) return;
            var img = row.querySelector('.dis-thumb');
            if (img && !img.firstChild) {
              var el = U.el('img', { src: u, alt: x.it.name });
              img.appendChild(el);
            }
          });
        });
        host.appendChild(card);
      });

      if (!groups.drop.length && !groups.watch.length) {
        host.appendChild(U.el('div', { class: 'card' }, [U.el('p', { class: 'lead', text: '🎉 全部衣橱都在目标风格内且搭配良好，没有要丢的。' })]));
      }
    });
  };

  D.init = function () {};
})(window.W = window.W || {});
