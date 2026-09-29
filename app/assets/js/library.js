/* library.js — 单品 schema 常量、通用单品表单、衣橱视图 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;

  /* ---------- §1.2 二级分类表 + 枚举 ---------- */
  var schema = (W.schema = {
    CATS: [
      { key: 'top', label: '上装', subs: ['T恤', '衬衫', '卫衣', '针织衫', '背心', '打底衫'] },
      { key: 'outerwear', label: '外套', subs: ['夹克', '大衣', '羽绒服 / 棉服', '西装外套', '马甲', '防风外套', '皮夹克'] },
      { key: 'bottom', label: '下装', subs: ['牛仔裤', '西裤', '休闲裤', '工装裤', '短裤', '裙装', '运动裤'] },
      { key: 'shoes', label: '鞋', subs: ['运动鞋', '靴子', '皮鞋', '凉鞋 / 拖鞋'] },
      { key: 'accessory', label: '配饰', subs: ['包', '帽', '围巾 / 手套 / 皮带 / 墨镜 / 首饰'] }
    ],
    PLATFORMS: ['taobao', 'pdd', 'jd', 'xhs', 'ig', 'offline', 'gift'],
    SEASONS: ['春', '夏', '秋', '冬'],
    OCCASIONS: ['通勤', '休闲', '约会', '运动', '旅行', '居家'],
    AESTHETICS: ['minimal', 'korean', 'lazy', 'workwear', 'clean-fit', 'street', 'vintage', 'preppy', 'techwear', 'outdoor', 'quiet-luxury'],
    catLabel: function (k) {
      var c = schema.CATS.filter(function (x) { return x.key === k; })[0];
      return c ? c.label : k;
    },
    subsOf: function (k) {
      var c = schema.CATS.filter(function (x) { return x.key === k; })[0];
      return c ? c.subs : [];
    }
  });

  /* ---------- 通用单品表单 ---------- */
  var forms = (W.forms = {});

  function colorField(label, value) {
    var wrap = U.el('div', { class: 'color-field' });
    var picker = U.el('input', { type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#cccccc' });
    var text = U.el('input', { class: 'input small', type: 'text', value: value || '', placeholder: '留空或 #RRGGBB', style: 'max-width:150px' });
    picker.addEventListener('input', function () { text.value = picker.value; });
    text.addEventListener('input', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value.trim())) picker.value = text.value.trim();
    });
    wrap.appendChild(U.el('label', { class: 'field' }, [
      U.el('span', { text: label }),
      U.el('div', { class: 'color-row', style: 'display:flex;gap:8px;align-items:center' }, [picker, text])
    ]));
    return { node: wrap, get: function () { return text.value.trim() || null; } };
  }

  forms.item = function (item, opts) {
    opts = opts || {};
    item = item || {};
    var node = U.el('div', {});

    if (opts.previewHtml) {
      node.appendChild(U.el('div', { class: 'preview-strip', html: opts.previewHtml }));
    }

    var grid = U.el('div', { class: 'form-grid' });

    var fId = U.el('input', { class: 'input', type: 'text', value: item.id || '', placeholder: '如 navy-fair-isle-cardigan' });
    var fName = U.el('input', { class: 'input', type: 'text', value: item.name || '' });
    var fBrand = U.el('input', { class: 'input', type: 'text', value: item.brand || '' });
    var fPrice = U.el('input', { class: 'input', type: 'number', min: 0, step: '1', value: item.price === null || item.price === undefined ? '' : item.price });
    var fPlatform = U.el('select', { class: 'input select' });
    schema.PLATFORMS.forEach(function (p) {
      fPlatform.appendChild(U.el('option', { value: p, selected: item.sourcePlatform === p }, [p]));
    });
    var fUrl = U.el('input', { class: 'input', type: 'text', value: item.sourceUrl || '' });
    var fMaterial = U.el('input', { class: 'input', type: 'text', value: item.material || '' });
    var fDate = U.el('input', { class: 'input', type: 'date', value: item.purchaseDate || '' });

    var fCat = U.el('select', { class: 'input select' });
    schema.CATS.forEach(function (c) {
      fCat.appendChild(U.el('option', { value: c.key, selected: item.category === c.key }, [c.label + ' / ' + c.key]));
    });
    var fSub = U.el('select', { class: 'input select' });
    function fillSub(cat, selected) {
      U.clear(fSub);
      var list = schema.subsOf(cat);
      fSub.appendChild(U.el('option', { value: '' }, ['（未指定）']));
      list.forEach(function (s) { fSub.appendChild(U.el('option', { value: s, selected: s === selected }, [s])); });
      if (selected && list.indexOf(selected) < 0) fSub.appendChild(U.el('option', { value: selected, selected: true }, [selected + '（自定义）']));
    }
    fillSub(item.category || 'top', item.subcategory || '');
    fCat.addEventListener('change', function () { fillSub(fCat.value, fSub.value); });

    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: 'id / slug' }), fId]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '名称' }), fName]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '品牌' }), fBrand]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '价格 ¥' }), fPrice]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '来源平台' }), fPlatform]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '原始链接' }), fUrl]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '品类' }), fCat]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '二级分类' }), fSub]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '材质' }), fMaterial]));
    grid.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '购买日期' }), fDate]));
    node.appendChild(grid);

    var cRow = U.el('div', { class: 'form-grid' });
    var c1 = colorField('主色 colorHex', item.colorHex || '');
    var c2 = colorField('次要色 secondaryColorHex', item.secondaryColorHex || '');
    cRow.appendChild(c1.node);
    cRow.appendChild(c2.node);
    node.appendChild(cRow);

    var chipRow = U.el('div', { class: 'form-grid' });
    function chipBlock(title, values, key) {
      var box = U.el('div', { class: 'field' }, [U.el('span', { text: title })]);
      var host = U.el('div', { class: 'chips' });
      box.appendChild(host);
      return { node: box, chips: U.chips(host, values, { placeholder: '回车添加', split: ',' }) };
    }
    var chSeason = chipBlock('季节 season', item.season || [], 'season');
    var chOcc = chipBlock('场合 occasion', item.occasion || [], 'occasion');
    var chAes = chipBlock('风格 aestheticTags', item.aestheticTags || [], 'aestheticTags');
    var chTags = chipBlock('细节标签 tags', item.tags || [], 'tags');
    [chSeason, chOcc, chAes, chTags].forEach(function (c) { chipRow.appendChild(c.node); });
    node.appendChild(chipRow);

    var fNotes = U.el('textarea', { class: 'input', rows: 2, placeholder: '备注 / 待确认说明' });
    fNotes.value = item.notes || '';
    node.appendChild(U.el('label', { class: 'field' }, [U.el('span', { text: '备注 notes' }), fNotes]));

    if (opts.showWorkwearHint) {
      node.appendChild(U.el('div', { class: 'warn-box' }, [
        U.el('b', { text: '工装单品请补这些标签：' }),
        U.el('div', { text: '版型来源（M-65 / MA-1 / Amekaji / 日系 / 法式）、结构特征（多口袋数量与位置、D 环、挂袢、袖口调节）、材质（重磅帆布 12oz+ / 重磅牛仔 / 灯芯绒 / 油蜡布）。搭配上避免上下全工装。' })
      ]));
    }

    return {
      node: node,
      setId: function (v) { fId.value = v; },
      read: function () {
        var out = {
          id: (fId.value.trim() || opts.fallbackId || U.uid('sku')),
          name: fName.value.trim() || '[待确认]',
          brand: fBrand.value.trim() || '[待确认]',
          price: fPrice.value === '' ? null : Number(fPrice.value),
          currency: 'CNY',
          sourcePlatform: fPlatform.value,
          sourceUrl: fUrl.value.trim(),
          category: fCat.value,
          subcategory: fSub.value || '[待确认]',
          colorHex: c1.get(),
          secondaryColorHex: c2.get(),
          material: fMaterial.value.trim() || '[待确认]',
          season: chSeason.chips.get(),
          occasion: chOcc.chips.get(),
          aestheticTags: chAes.chips.get(),
          tags: chTags.chips.get(),
          purchaseDate: fDate.value || null,
          addedAt: item.addedAt || U.now(),
          image: item.image || ('items/' + (fId.value.trim() || 'x') + '.png'),
          notes: fNotes.value.trim()
        };
        return out;
      }
    };
  };

  /* ---------- 衣橱视图 ---------- */
  var Lib = (W.library = {});
  var state = { q: '', cat: '', season: '', sort: 'new' };
  var all = [];

  function matches(it) {
    if (state.cat && it.category !== state.cat) return false;
    if (state.season && (it.season || []).indexOf(state.season) < 0) return false;
    if (state.q) {
      var hay = [it.name, it.brand, it.subcategory, (it.tags || []).join(' '), (it.aestheticTags || []).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }

  function card(it, pngUrl) {
    var dr = (W.discard && W.discard.resultFor) ? W.discard.resultFor(it.id) : null;
    var flag = dr && dr.tier === 'drop' ? U.el('span', { class: 'thumb-flag drop', text: '可丢弃' })
      : dr && dr.tier === 'watch' ? U.el('span', { class: 'thumb-flag watch', text: '观察' }) : null;
    var n = U.el('div', { class: 'item-card', dataset: { id: it.id } }, [
      U.el('div', { class: 'item-thumb' }, [
        pngUrl ? U.el('img', { src: pngUrl, alt: it.name, loading: 'lazy' }) : U.el('div', { class: 'muted small', text: '无图' }),
        flag
      ]),
      U.el('div', { class: 'item-meta' }, [
        U.el('div', { class: 'item-name', text: it.name || it.id }),
        U.el('div', { class: 'item-line' }, [
          it.colorHex ? U.el('i', { class: 'swatch', style: 'background:' + it.colorHex }) : null,
          U.el('span', { text: schema.catLabel(it.category) + (it.subcategory ? ' · ' + it.subcategory : '') }),
          U.el('span', { class: 'item-price', text: U.money(it.price) })
        ])
      ])
    ]);
    n.addEventListener('click', function () { openDetail(it.id); });
    return n;
  }

  var renderSeq = 0;
  Lib.render = function () {
    var grid = U.$('#lib-grid'), empty = U.$('#lib-empty');
    var my = ++renderSeq;           /* 并发渲染时只让最后一次落地，避免卡片重复堆两遍 */
    var ensureDr = (W.discard && W.discard.ensure) ? W.discard.ensure().catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([S.list(), ensureDr]).then(function (rr) {
      if (my !== renderSeq) return;
      var list = rr[0];
      all = list;
      var shown = list.filter(matches);
      var cmp = {
        new: function (a, b) { return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); },
        'price-desc': function (a, b) { return (b.price || 0) - (a.price || 0); },
        'price-asc': function (a, b) { return (a.price || 99999) - (b.price || 99999); },
        name: function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); }
      }[state.sort];
      shown.sort(cmp);
      U.clear(grid);
      empty.hidden = list.length > 0;
      grid.hidden = shown.length === 0 ? false : false;
      return Promise.all(shown.map(function (it) {
        return S.itemImage(it.id).then(function (u) {
          if (my !== renderSeq) return;
          grid.appendChild(card(it, u));
        });
      }));
    });
  };

  Lib.renderFilters = function () {
    var host = U.$('#lib-cat-filter');
    U.clear(host);
    var defs = [{ k: '', l: '全部' }].concat(schema.CATS.map(function (c) { return { k: c.key, l: c.label }; }));
    defs.forEach(function (d) {
      var b = U.el('button', {
        class: 'filter' + (state.cat === d.k ? ' on' : ''), type: 'button', text: d.l,
        onclick: function () { state.cat = d.k; Lib.renderFilters(); Lib.render(); }
      });
      host.appendChild(b);
    });
  };

  function openDetail(id) {
    S.get(id).then(function (it) {
      if (!it) return;
      return S.itemImage(id).then(function (imgUrl) {
        return S.getImage(S.IMG_KEY.orig(id)).then(function (orig) {
          var body = U.el('div', {});
          var previewHtml = '<div class="pv"><img src="' + (imgUrl || '') + '" alt=""></div>' +
            '<div><div style="font-weight:600;margin-bottom:6px">' + U.esc(it.name) + '</div>' +
            '<div class="muted small">id：' + U.esc(it.id) + '<br>入库：' + U.esc(String(it.addedAt || '').slice(0, 10)) + '</div></div>';
          var form = forms.item(it, { previewHtml: previewHtml, showWorkwearHint: true });
          body.appendChild(form.node);

          var foot = [
            U.el('button', { class: 'btn danger', type: 'button', text: '删除', onclick: function () {
              if (!confirm('确定删除「' + it.name + '」？图片与记录都会消失（不可撤销）。')) return;
              S.remove(id).then(function () {
                W.app.closeModal(); U.toast('已删除 ' + id); W.app.refresh();
              });
            } }),
            U.el('button', { class: 'btn ghost', type: 'button', text: '下载去背 PNG', onclick: function () {
              S.getImage(S.IMG_KEY.png(id)).then(function (b) {
                if (!b) return U.toast('这张没有去背图', 'warn');
                U.downloadBlob(b, id + '.png');
              });
            } }),
            U.el('button', { class: 'btn primary', type: 'button', text: '保存', onclick: function () {
              var next = form.read();
              next.id = it.id;
              next.image = 'items/' + it.id + '.png';
              S.put(next).then(function () {
                W.app.closeModal(); U.toast('已保存', 'ok'); W.app.refresh();
              });
            } })
          ];
          if (orig) {
            foot.splice(2, 0, U.el('button', { class: 'btn ghost', type: 'button', text: '重新去背', onclick: function () {
              S.settings().then(function (st) {
                return W.bg.remove(orig, { mode: st.bgMode === 'model' ? 'algo' : st.bgMode, tolerance: st.tolerance, parentTolerance: st.parentTolerance, keepLargest: st.keepLargest });
              }).then(function (res) {
                return W.bg.png(res.canvas).then(function (png) {
                  return Promise.all([
                    S.putImage(S.IMG_KEY.png(id), png),
                    W.bg.flatten(res.canvas).then(function (j) { return S.putImage(S.IMG_KEY.jpg(id), j); }),
                    W.bg.thumb(res.canvas).then(function (t) { return S.putImage(S.IMG_KEY.thumb(id), t); })
                  ]);
                });
              }).then(function () {
                S.dropUrl(S.IMG_KEY.png(id)); S.dropUrl(S.IMG_KEY.thumb(id));
                U.toast('已重新去背', 'ok'); W.app.closeModal(); W.app.refresh();
              }).catch(function (e) { U.toast('重新去背失败：' + e.message, 'bad'); });
            } }));
          }
          W.app.openModal('编辑单品', body, foot);
        });
      });
    });
  }
  Lib.openDetail = openDetail;

  Lib.init = function () {
    Lib.renderFilters();
    U.$('#lib-search').addEventListener('input', U.debounce(function (e) {
      state.q = e.target.value.trim(); Lib.render();
    }, 200));
    U.$('#lib-season').addEventListener('change', function (e) { state.season = e.target.value; Lib.render(); });
    U.$('#lib-sort').addEventListener('change', function (e) { state.sort = e.target.value; Lib.render(); });
    U.$('#btn-lib-export').addEventListener('click', function () {
      S.list().then(function (l) { U.downloadText(JSON.stringify(l, null, 2), 'library.json', 'application/json'); });
    });
    U.$('#btn-lib-import').addEventListener('click', function () { W.settings.importDialog('library'); });
  };
})(window.W = window.W || {});
