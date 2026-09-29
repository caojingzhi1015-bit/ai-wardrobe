/* settings.js — 数据与设置：模型配置、导入导出、清空 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var ST = (W.settings = {});

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (window.JSZip) return resolve(window.JSZip);
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error('JSZip 加载失败（可能没联网）')); };
      document.head.appendChild(s);
    });
  }

  ST.importDialog = function (kind) {
    var input = U.$('#imp-file');
    input.value = '';
    input.dataset.kind = kind || '';
    input.click();
  };

  /* ---------- zip 导入（与「导出全部(zip)」同结构，合并式不清空） ---------- */
  ST.importZip = function () {
    var input = U.$('#imp-zip-file');
    input.value = '';
    input.click();
  };

  function importZip(file) {
    U.toast('正在读取 zip…');
    loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js').then(function (JSZip) {
      return JSZip.loadAsync(file);
    }).then(function (zip) {
      var libEntry = zip.file('library.json');
      if (!libEntry) throw new Error('zip 里没有 library.json');
      return libEntry.async('string').then(function (text) {
        var items = JSON.parse(text);
        if (!Array.isArray(items)) throw new Error('library.json 必须是数组');
        return S.list().then(function (cur) {
          var have = {};
          cur.forEach(function (i) { have[i.id] = true; });
          var add = items.filter(function (i) { return i && i.id && !have[i.id]; });
          var next = add.concat(cur);

          var idSet = {};
          items.forEach(function (i) { if (i && i.id) idSet[i.id] = true; });
          var jobs = [];
          zip.forEach(function (path, entry) {
            if (entry.dir) return;
            var m;
            if ((m = path.match(/^items\/thumbs\/(.+)\.jpg$/)) && idSet[m[1]]) {
              jobs.push(entry.async('blob').then(function (b) { return S.putImage(S.IMG_KEY.thumb(m[1]), b); }));
            } else if ((m = path.match(/^items\/(.+)\.png$/)) && idSet[m[1]]) {
              jobs.push(entry.async('blob').then(function (b) { return S.putImage(S.IMG_KEY.png(m[1]), b); }));
            } else if ((m = path.match(/^items\/(.+)\.jpg$/)) && idSet[m[1]]) {
              jobs.push(entry.async('blob').then(function (b) { return S.putImage(S.IMG_KEY.jpg(m[1]), b); }));
            } else if ((m = path.match(/^outfits\/(.+)\.png$/))) {
              jobs.push(entry.async('blob').then(function (b) { return S.putImage(S.IMG_KEY.outfit(m[1]), b); }));
            }
          });

          var outfitEntry = zip.file('outfits.json');
          var outfitJob = outfitEntry
            ? outfitEntry.async('string').then(function (t) {
                var list = JSON.parse(t);
                if (!Array.isArray(list)) return null;
                return S.outfits().then(function (curO) {
                  var ids = {};
                  curO.forEach(function (o) { ids[o.id] = true; });
                  var addO = list.filter(function (o) { return o && o.id && !ids[o.id]; });
                  return S.saveOutfits(addO.concat(curO)).then(function () { return addO.length; });
                });
              })
            : Promise.resolve(0);

          return Promise.all([Promise.all(jobs), outfitJob]).then(function (r) {
            return S.saveAll(next).then(function () {
              return { imported: add.length, skipped: items.length - add.length, outfits: r[1] };
            });
          });
        });
      });
    }).then(function (r) {
      var msg = 'zip 导入完成：新增 ' + r.imported + ' 件，跳过已存在 ' + r.skipped + ' 件';
      if (r.outfits) msg += '，搭配 +' + r.outfits;
      U.toast(msg, 'ok');
      W.app.refreshAll();
    }).catch(function (e) {
      U.toast('zip 导入失败：' + e.message, 'bad');
    });
  }

  function handleImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var text = String(fr.result);
      var name = file.name.replace(/\.json$/i, '');
      try {
        if (['library', 'style-profile', 'outfits'].indexOf(name) < 0) {
          throw new Error('文件名必须是 library.json / style-profile.json / outfits.json，当前是 ' + file.name);
        }
        S.importJSON(name, text).then(function () {
          U.toast('已导入 ' + file.name, 'ok');
          W.app.refreshAll();
        }).catch(function (e) { U.toast('导入失败：' + e.message, 'bad'); });
      } catch (e) {
        U.toast('导入失败：' + e.message, 'bad');
      }
    };
    fr.readAsText(file, 'utf-8');
  }

  function exportZip() {
    U.toast('打包中…');
    loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js').then(function (JSZip) {
      var zip = new JSZip();
      return Promise.all([S.list(), S.profile(), S.outfits()]).then(function (r) {
        zip.file('library.json', JSON.stringify(r[0], null, 2));
        zip.file('style-profile.json', JSON.stringify(r[1], null, 2));
        zip.file('outfits.json', JSON.stringify(r[2], null, 2));
        return Promise.all(r[0].map(function (it) {
          return Promise.all([
            S.getImage(S.IMG_KEY.png(it.id)),
            S.getImage(S.IMG_KEY.jpg(it.id)),
            S.getImage(S.IMG_KEY.thumb(it.id))
          ]).then(function (imgs) {
            if (imgs[0]) zip.file('items/' + it.id + '.png', imgs[0]);
            if (imgs[1]) zip.file('items/' + it.id + '.jpg', imgs[1]);
            if (imgs[2]) zip.file('items/thumbs/' + it.id + '.jpg', imgs[2]);
          });
        })).then(function () {
          return Promise.all(r[2].map(function (o) {
            return S.getImage(S.IMG_KEY.outfit(o.id)).then(function (b) {
              if (b) zip.file('outfits/' + o.id + '.png', b);
            });
          }));
        });
      }).then(function () {
        return zip.generateAsync({ type: 'blob' });
      }).then(function (blob) {
        U.downloadBlob(blob, 'wardrobe-export-' + U.today() + '.zip');
        U.toast('已导出 zip', 'ok');
      });
    }).catch(function (e) {
      U.toast('导出失败：' + e.message + '（可改用逐个导出 JSON）', 'bad');
    });
  }

  ST.init = function () {
    S.settings().then(function (s) {
      U.$('#st-vision-base').value = s.visionBaseUrl || '';
      U.$('#st-vision-key').value = s.visionApiKey || '';
      U.$('#st-vision-model').value = s.visionModel || '';
      U.$('#st-llm-base').value = s.llmBaseUrl || '';
      U.$('#st-llm-key').value = s.llmApiKey || '';
      U.$('#st-llm-model').value = s.llmModel || '';
    });

    U.$('#btn-st-save').addEventListener('click', function () {
      S.settings().then(function (s) {
        s.visionBaseUrl = U.$('#st-vision-base').value.trim();
        s.visionApiKey = U.$('#st-vision-key').value.trim();
        s.visionModel = U.$('#st-vision-model').value.trim();
        s.llmBaseUrl = U.$('#st-llm-base').value.trim();
        s.llmApiKey = U.$('#st-llm-key').value.trim();
        s.llmModel = U.$('#st-llm-model').value.trim();
        return S.saveSettings(s);
      }).then(function () { U.toast('设置已保存', 'ok'); });
    });

    var exp = function (name) {
      return function () {
        S.exportJSON(name).then(function (data) {
          U.downloadText(JSON.stringify(data, null, 2), name + '.json', 'application/json');
        });
      };
    };
    U.$('#btn-exp-all').addEventListener('click', exportZip);
    U.$('#btn-exp-lib').addEventListener('click', exp('library'));
    U.$('#btn-exp-profile').addEventListener('click', exp('style-profile'));
    U.$('#btn-exp-outfits').addEventListener('click', exp('outfits'));
    U.$('#btn-imp').addEventListener('click', function () { ST.importDialog(); });
    U.$('#btn-lib-import-zip').addEventListener('click', ST.importZip);
    U.$('#imp-zip-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importZip(f);
      e.target.value = '';
    });

    U.$('#imp-file').addEventListener('change', function (e) {
      Array.prototype.slice.call(e.target.files).forEach(handleImport);
      e.target.value = '';
    });

    U.$('#btn-reseed').addEventListener('click', function () {
      if (!confirm('会用内置的 44 件衣橱数据覆盖当前单品列表（你自己入库的会被替换）。确定？')) return;
      S.resetToBuiltin().then(function (r) {
        U.toast('已恢复内置数据：' + (r.count || 0) + ' 件', 'ok');
        W.app.refreshAll();
      }).catch(function (e) { U.toast('恢复失败：' + e.message, 'bad'); });
    });

    U.$('#btn-reset').addEventListener('click', function () {
      if (!confirm('会清空本机浏览器里的全部单品、图片、画像和搭配。确定？')) return;
      if (!confirm('再确认一次：这一步不可撤销。')) return;
      S.reset().then(function () {
        U.toast('已清空', 'ok');
        W.app.refreshAll();
      }).catch(function (e) { U.toast('清空失败：' + e.message, 'bad'); });
    });
  };
})(window.W = window.W || {});
