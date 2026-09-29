/* profile.js — 模块二：风格画像 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var P = (W.profile = {});
  var photos = [];
  var ui = {};

  function colorRow(host, values, title, hint) {
    var box = U.el('div', { class: 'field' }, [U.el('span', { text: title })]);
    var chipsHost = U.el('div', { class: 'chips' });
    var chips = U.chips(chipsHost, values, { placeholder: '粘贴色值或回车', split: ',' });
    var picker = U.el('input', { type: 'color', value: '#8b6f47' });
    var add = U.el('button', { class: 'btn sm ghost', type: 'button', text: '＋ 取色', onclick: function () {
      chips.set(chips.get().concat([picker.value]));
    } });
    var swatches = U.el('div', { class: 'photo-strip', style: 'margin-top:6px' });
    function drawSwatches(list) {
      U.clear(swatches);
      list.forEach(function (hex) {
        swatches.appendChild(U.el('i', {
          class: 'swatch', title: hex,
          style: 'width:22px;height:22px;border-radius:5px;display:inline-block;background:' + hex
        }));
      });
    }
    drawSwatches(values);
    box.appendChild(chipsHost);
    box.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:6px;margin-top:6px' }, [picker, add]));
    box.appendChild(swatches);
    if (hint) box.appendChild(U.el('div', { class: 'hint', text: hint }));
    host.appendChild(box);
    return {
      get: function () { var v = chips.get(); drawSwatches(v); return v; },
      set: function (v) { chips.set(v); drawSwatches(v); }
    };
  }

  /* ---------- 只读「风格解读」面板：把画像里带结构的解读字段摊开给人看 ---------- */
  function kvList(obj, order) {
    var rows = [];
    (order || Object.keys(obj || {})).forEach(function (k) {
      var v = obj && obj[k];
      if (!v) return;
      rows.push(U.el('div', { class: 'hint', style: 'margin-top:4px' }, [
        U.el('b', { text: k + '：' }),
        U.el('span', { text: Array.isArray(v) ? v.join('；') : String(v) })
      ]));
    });
    return rows;
  }

  function bullets(title, list) {
    if (!list || !list.length) return null;
    return U.el('div', { style: 'margin-top:10px' }, [
      U.el('b', { class: 'small', text: title })
    ].concat(list.map(function (t, i) {
      return U.el('div', { class: 'hint', style: 'margin-top:3px', text: (i + 1) + ') ' + t });
    })));
  }

  function insightPanel(pf) {
    var box = U.el('div', { class: 'card', style: 'margin-bottom:16px' });
    box.appendChild(U.el('div', { class: 'card-head' }, [
      U.el('h3', { style: 'margin:0', text: '风格解读（只读）' }),
      U.el('span', { class: 'muted small', text: '由参考图分析得出，评分与搭配都按这几点来' })
    ]));

    var sr = pf.silhouetteRules || {};
    if (sr.bottomRule || (sr.topModes && sr.topModes.length)) {
      box.appendChild(U.el('b', { class: 'small', text: '廓形规则' }));
      box.appendChild(U.el('div', { class: 'hint', text: sr.bottomRule || '' }));
      (sr.topModes || []).forEach(function (t) {
        box.appendChild(U.el('div', { class: 'hint', style: 'margin-top:3px', text: '· ' + t }));
      });
      if (sr.hemLength) box.appendChild(U.el('div', { class: 'hint', text: '裤长：' + sr.hemLength }));
    }

    box.appendChild(bullets('常用搭配公式', pf.outfitFormulas));

    var sb = pf.shoeBagProfile || {};
    if (sb.shoes || sb.bags) {
      box.appendChild(U.el('div', { style: 'margin-top:10px' }, [
        U.el('b', { class: 'small', text: '鞋与包' }),
        U.el('div', { class: 'hint', text: '鞋：' + (sb.shoes || '') }),
        U.el('div', { class: 'hint', style: 'margin-top:3px', text: '包：' + (sb.bags || '') })
      ]));
    }

    if (pf.colorRules) {
      box.appendChild(U.el('div', { style: 'margin-top:10px' }, [
        U.el('b', { class: 'small', text: '色彩规则' }),
        U.el('div', { class: 'hint', text: pf.colorRules })
      ]));
    }

    var ps = pf.photoStyle || {};
    if (ps.tone || ps.scenePreference) {
      box.appendChild(U.el('div', { style: 'margin-top:10px' }, [
        U.el('b', { class: 'small', text: '摄影风格与色调' }),
        U.el('div', { class: 'hint', text: '色调：' + (ps.tone || '') }),
        U.el('div', { class: 'hint', style: 'margin-top:3px', text: '场景：' + (ps.scenePreference || '') }),
        U.el('div', { class: 'hint', style: 'margin-top:3px', text: '构图：' + (ps.framing || '') })
      ]));
    }

    var lt = pf.lighting || {};
    if (lt.preferred || lt.shadowCharacter) {
      box.appendChild(U.el('div', { style: 'margin-top:10px' }, [
        U.el('b', { class: 'small', text: '光影' })
      ].concat(kvList(lt, ['preferred', 'avoid', 'shadowCharacter']))));
    }

    if (pf.confidence && Object.keys(pf.confidence).length) {
      box.appendChild(U.el('div', { style: 'margin-top:10px' }, [
        U.el('b', { class: 'small', text: '置信度' })
      ].concat(kvList(pf.confidence))));
    }

    if (pf._meta && pf._meta.source) {
      box.appendChild(U.el('div', { class: 'hint', style: 'margin-top:10px', text: '来源：' + pf._meta.source }));
    }
    return box;
  }

  P.render = function () {
    var host = U.$('#profile-form');
    return S.profile().then(function (pf) {
      U.clear(host);
      host.appendChild(U.el('h3', { text: '我的风格画像' }));

      var badge = U.$('#profile-origin');
      badge.textContent = pf._meta && pf._meta.overwritten ? '已用真实数据覆盖' : '冷启动值（假设）';
      badge.className = 'pill' + (pf._meta && pf._meta.overwritten ? ' ok' : ' warn');

      host.appendChild(insightPanel(pf));

      var row1 = U.el('div', { class: 'form-grid' });

      function chipField(title, values, placeholder) {
        var box = U.el('div', { class: 'field' }, [U.el('span', { text: title })]);
        var cHost = U.el('div', { class: 'chips' });
        box.appendChild(cHost);
        row1.appendChild(box);
        return U.chips(cHost, values, { placeholder: placeholder || '回车添加', split: ',' });
      }

      ui.coreStyles = chipField('核心风格 coreStyles', pf.coreStyles || []);
      ui.materials = chipField('材质偏好 materialPreference', pf.materialPreference || []);
      ui.patterns = chipField('图案偏好 patternPreference', pf.patternPreference || []);
      ui.avoidPatterns = chipField('回避图案 avoidPatterns', pf.avoidPatterns || []);
      ui.occasions = chipField('主要场合 typicalOccasions', pf.typicalOccasions || []);
      ui.avoidList = chipField('回避清单 avoidList', pf.avoidList || []);

      var sil = U.el('textarea', { class: 'input', rows: 2 });
      sil.value = pf.silhouettePreference || '';
      row1.appendChild(U.el('label', { class: 'field', style: 'grid-column:1/-1' }, [
        U.el('span', { text: '廓形偏好 silhouettePreference' }), sil
      ]));
      ui.silhouette = sil;
      host.appendChild(row1);

      var row2 = U.el('div', { class: 'form-grid' });
      ui.palette = colorRow(row2, pf.colorPaletteHex || [], '核心配色 colorPaletteHex', '评分就用这套色：与其中任一色差 ≤20 视为命中');
      ui.avoid = colorRow(row2, pf.colorAvoidHex || [], '回避色 colorAvoidHex', '命中直接判低分');
      host.appendChild(row2);

      var row3 = U.el('div', { class: 'form-grid' });
      var pMin = U.el('input', { class: 'input', type: 'number', value: (pf.priceRange || {}).min });
      var pMax = U.el('input', { class: 'input', type: 'number', value: (pf.priceRange || {}).max });
      ui.summary = U.el('textarea', { class: 'input', rows: 3 });
      ui.summary.value = pf.summary || '';
      row3.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '价位带下限 ¥' }), pMin]));
      row3.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '价位带上限 ¥' }), pMax]));
      row3.appendChild(U.el('label', { class: 'field', style: 'grid-column:1/-1' }, [
        U.el('span', { text: '一句话总结 summary' }), ui.summary
      ]));
      ui.min = pMin; ui.max = pMax;
      host.appendChild(row3);

      host.appendChild(U.el('div', { class: 'row-actions' }, [
        U.el('button', { class: 'btn primary', type: 'button', text: '保存画像', onclick: P.save })
      ]));
    });
  };

  P.save = function () {
    return S.profile().then(function (pf) {
      var next = JSON.parse(JSON.stringify(pf));
      next.coreStyles = ui.coreStyles.get();
      next.materialPreference = ui.materials.get();
      next.patternPreference = ui.patterns.get();
      next.avoidPatterns = ui.avoidPatterns.get();
      next.typicalOccasions = ui.occasions.get();
      next.avoidList = ui.avoidList.get();
      next.silhouettePreference = ui.silhouette.value.trim();
      next.colorPaletteHex = ui.palette.get();
      next.colorAvoidHex = ui.avoid.get();
      next.priceRange = { min: Number(ui.min.value) || 0, max: Number(ui.max.value) || 99999, currency: 'CNY' };
      next.summary = ui.summary.value.trim();
      return S.saveProfile(next).then(function () {
        U.toast('风格画像已保存', 'ok');
        return P.render();
      });
    });
  };

  function pickPhotos() { U.$('#style-photos').click(); }

  function renderPhotos() {
    var strip = U.$('#photo-strip');
    U.clear(strip);
    photos.forEach(function (f, i) {
      var url = URL.createObjectURL(f);
      strip.appendChild(U.el('img', { src: url, alt: f.name, title: '点击移除', onclick: function () {
        photos.splice(i, 1); renderPhotos();
      } }));
    });
    U.$('#btn-run-style').disabled = photos.length === 0;
    U.$('#style-hint').textContent = photos.length
      ? '已选 ' + photos.length + ' 张；少于 5 张模型会明说样本不足。点小图可移除。'
      : '';
  }

  function runAI() {
    var btn = U.$('#btn-run-style');
    btn.disabled = true;
    U.$('#style-hint').textContent = '分析中…（图片越多越慢）';
    W.vision.analyzeStyle(photos).then(function (data) {
      return S.profile().then(function (pf) {
        var next = JSON.parse(JSON.stringify(pf));
        Object.keys(data).forEach(function (k) {
          if (k === 'evidence') return;
          next[k] = data[k];
        });
        next._meta = { source: '视觉模型从 ' + photos.length + ' 张真实穿搭照提炼', overwritten: true, evidence: data.evidence || '', at: U.now() };
        return S.saveProfile(next).then(function () {
          U.toast('画像已用真实数据覆盖', 'ok');
          return P.render();
        });
      });
    }).catch(function (e) {
      U.toast('分析失败：' + e.message, 'bad');
      U.$('#style-hint').textContent = '失败原因：' + e.message;
    }).then(function () { btn.disabled = false; });
  }

  P.init = function () {
    U.$('#btn-pick-photos').addEventListener('click', pickPhotos);
    U.$('#style-photos').addEventListener('change', function (e) {
      Array.prototype.slice.call(e.target.files).forEach(function (f) { photos.push(f); });
      e.target.value = '';
      renderPhotos();
    });
    U.$('#btn-run-style').addEventListener('click', runAI);
    U.$('#btn-profile-save').addEventListener('click', P.save);
    U.$('#btn-profile-ai').addEventListener('click', pickPhotos);
    renderPhotos();
    P.render();
  };
})(window.W = window.W || {});
