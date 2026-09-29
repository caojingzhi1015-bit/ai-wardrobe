/* app.js — 启动、导航、弹窗、全局刷新 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var app = (W.app = {});
  var current = 'library';

  var VIEWS = ['library', 'intake', 'profile', 'target', 'mix', 'evaluate', 'discard', 'compose', 'settings'];

  app.go = function (name) {
    if (VIEWS.indexOf(name) < 0) name = 'library';
    current = name;
    VIEWS.forEach(function (v) { U.$('#view-' + v).hidden = v !== name; });
    U.$$('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    window.scrollTo(0, 0);
    if (name === 'library') W.library.render();
    if (name === 'compose') W.compose.refresh();
    if (name === 'profile') W.profile.render();
    if (name === 'target') W.target.render();
    if (name === 'mix') W.mix.refresh();
    if (name === 'discard' && W.discard) W.discard.render();
  };

  app.openModal = function (title, bodyNode, footNodes) {
    U.$('#modal-title').textContent = title;
    var body = U.$('#modal-body');
    var foot = U.$('#modal-foot');
    U.clear(body); U.clear(foot);
    body.appendChild(bodyNode);
    (footNodes || []).forEach(function (n) { foot.appendChild(n); });
    U.$('#modal').hidden = false;
  };

  app.closeModal = function () { U.$('#modal').hidden = true; };

  app.refresh = function () {
    S.stats().then(function (st) {
      U.$('#cnt-items').textContent = st.items;
      U.$('#cnt-outfits').textContent = st.outfits;
      U.$('#side-stat').textContent = st.items + ' 件单品 · ' + st.outfits + ' 套搭配' + (st.pending ? ' · ' + st.pending + ' 件含 [待确认]' : '');
      if (current === 'library') W.library.render();
      if (current === 'compose') W.compose.refresh();
    });
  };

  app.refreshAll = function () {
    W.library.renderFilters && W.library.renderFilters();
    W.profile.render && W.profile.render();
    W.compose.refresh && W.compose.refresh();
    app.refresh();
  };

  function bindNav() {
    U.$$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.dataset.view); });
    });
    U.$$('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.dataset.goto); });
    });
  }

  function bindModal() {
    var modal = U.$('#modal');
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) app.closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) app.closeModal();
    });
  }

  function start() {
    bindNav();
    bindModal();

    W.library.init();
    W.intake.init();
    W.profile.init();
    W.evaluate.init();
    if (W.discard) W.discard.init();
    W.mix.init();
    W.target.init();
    W.compose.init();
    W.settings.init();

    /* 内置数据：库里没东西就自动装载 app/data/ 下的衣橱与画像，用户不用手动导入 */
    return S.seedProfile().catch(function () { return false; }).then(function () {
      return S.seedBuiltin().catch(function (e) {
        console.warn('内置数据装载失败', e);
        return { seeded: false };
      });
    }).then(function (r) {
      if (r && r.seeded) U.toast('已载入内置衣橱：' + r.count + ' 件单品（无需手动导入）', 'ok');
      app.go('library');
      app.refresh();
    });
  }

  S.init().then(start).catch(function (e) {
    document.querySelector('.main').innerHTML =
      '<div style="max-width:620px;margin:60px auto;background:#fff;border:1px solid #E4E7EB;border-radius:12px;padding:24px">' +
      '<h2 style="margin-bottom:10px">没法打开本地数据库</h2>' +
      '<p style="color:#59637A">' + U.esc(e.message) + '</p>' +
      '<p style="color:#59637A">这个 App 用 IndexedDB 存图，<b>必须走 http 打开，不能直接双击 index.html</b>。<br>' +
      '在 app 目录下起一个本地服务即可：<br><code>python -m http.server 8777</code><br>' +
      '然后浏览器访问 <code>http://127.0.0.1:8777</code></p></div>';
  });
})(window.W = window.W || {});
