/* 冒烟测试：内置数据 + 目标风格 + 我的搭配 + 购买评估升级
   用法：node smoke-v2.js [url] */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/餐巾纸/AppData/Local/ms-playwright/chromium-1169/chrome-win/chrome.exe';

const ok = [], bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? ' — ' + extra : ''));
  console.log((cond ? '✔ ' : '✘ ') + name + (extra ? ' — ' + extra : ''));
}

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8765/index.html';
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.W && W.store, null, { timeout: 15000 });

  // 1) 内置数据自动装载
  await page.waitForFunction(() => document.querySelectorAll('#lib-grid .item-card').length > 0, null, { timeout: 40000 });
  await page.waitForTimeout(1500);
  const seed = await page.evaluate(async () => {
    const list = await W.store.list();
    let imgOk = 0;
    document.querySelectorAll('#lib-grid .item-card img').forEach(i => { if (i.naturalWidth > 0) imgOk++; });
    return { n: list.length, imgOk, cards: document.querySelectorAll('#lib-grid .item-card').length };
  });
  check('内置数据自动装载 44 件', seed.n === 44, JSON.stringify(seed));
  check('卡片图片真实渲染', seed.imgOk >= 44, seed.imgOk + ' 张');
  check('卡片无重复渲染', seed.cards === 44, seed.cards + ' 张卡片 / ' + seed.n + ' 件');

  // 2) 目标风格
  await page.click('.nav-item[data-view="target"]');
  await page.waitForTimeout(1200);
  const tg = await page.evaluate(() => {
    const pal = document.querySelectorAll('#target-body .pal-cell').length;
    const inspo = document.querySelectorAll('#target-body .inspo-card').length;
    let inspoOk = 0;
    document.querySelectorAll('#target-body .inspo-card img').forEach(i => { if (i.naturalWidth > 0) inspoOk++; });
    const fit = (document.querySelector('#target-body .fit-stat b') || {}).textContent || '';
    return {
      pal, inspo, inspoOk, fit,
      stats: document.querySelectorAll('#target-body .fit-stat').length,
      hints: document.querySelectorAll('#target-body .hint').length
    };
  });
  check('目标风格：色板渲染', tg.pal >= 10, tg.pal + ' 色');
  check('目标风格：参考图加载', tg.inspoOk >= 15, tg.inspoOk + '/' + tg.inspo + ' 张');
  check('目标风格：衣橱命中率', /^\d+%$/.test((tg.fit || '').trim()) && tg.stats >= 4, '严格命中 ' + tg.fit + ' / ' + tg.stats + ' 项分档');
  check('目标风格：命中不是一刀切 100%', tg.fit !== '100%', tg.hints + ' 条提示');

  // 3) 我的搭配
  await page.click('.nav-item[data-view="mix"]');
  await page.waitForTimeout(800);
  const strips = await page.evaluate(() => ({
    rows: document.querySelectorAll('#mix-strips .strip-row').length,
    items: document.querySelectorAll('#mix-strips .strip-item').length,
    scrollable: Array.from(document.querySelectorAll('#mix-strips .strip')).filter(s => s.scrollWidth > s.clientWidth + 20).length
  }));
  check('搭配台：分区单品条', strips.rows >= 3, strips.rows + ' 行 / ' + strips.items + ' 件');
  check('搭配台：单品条可横向滑动', strips.scrollable >= 1, strips.scrollable + ' 行可滑动');

  await page.click('#btn-mix-random');
  await page.waitForTimeout(1200);
  const stage = await page.evaluate(() => ({
    slots: document.querySelectorAll('#mix-stage .mix-slot').length,
    imgs: document.querySelectorAll('#mix-stage .mix-slot img').length,
    outer: document.querySelectorAll('#mix-stage .band-outer').length,
    info: (document.querySelector('#mix-stage .mix-info') || {}).innerText || ''
  }));
  check('搭配台：随机一套出图', stage.imgs >= 2, JSON.stringify(stage.slots) + ' slots / ' + stage.imgs + ' imgs');
  check('搭配台：和谐度提示', /和谐度/.test(stage.info), stage.info.replace(/\s+/g, ' ').slice(0, 40));

  const tog = await page.evaluate(() => {
    const b = document.querySelector('#mix-stage .band-outer');
    if (!b) return { found: false };
    const before = b.classList.contains('on');
    b.click();
    const after = document.querySelector('#mix-stage .band-outer').classList.contains('on');
    document.querySelector('#mix-stage .band-outer').click();
    return { found: true, before, after };
  });
  check('搭配台：外衣叠加可点击穿脱', tog.found && tog.before !== tog.after, JSON.stringify(tog));

  const saved1 = await page.evaluate(() => (document.querySelector('#cnt-outfits') || {}).textContent);
  await page.click('#btn-mix-save');
  await page.waitForTimeout(900);
  const saved2 = await page.evaluate(() => Number((document.querySelector('#cnt-outfits') || {}).textContent || 0));
  check('搭配台：保存搭配', saved2 >= 1, saved1 + ' → ' + saved2);

  // 4) 购买评估
  await page.click('.nav-item[data-view="evaluate"]');
  await page.waitForTimeout(500);
  await page.click('#btn-eval-example');
  await page.waitForTimeout(1500);
  const ev = await page.evaluate(() => ({
    score: (document.querySelector('#eval-result .score-num') || {}).textContent || '',
    verdict: (document.querySelector('#eval-result .verdict') || {}).textContent || '',
    colorBoxes: document.querySelectorAll('#eval-result .color-cmp-box').length,
    ramps: document.querySelectorAll('#eval-result .ramp i').length,
    advices: document.querySelectorAll('#eval-result .advice').length,
    adviceImgs: (() => { let n = 0; document.querySelectorAll('#eval-result .advice img').forEach(i => { if (i.naturalWidth > 0) n++; }); return n; })(),
    hasColorTitle: /参考色系/.test(document.querySelector('#eval-result').innerText)
  }));
  check('评估：风格匹配分', !!ev.score, ev.score + ' 分');
  check('评估：推荐结论', /推荐|不建议|谨慎/.test(ev.verdict), ev.verdict.trim());
  check('评估：参考色系对比', ev.colorBoxes === 3 && ev.hasColorTitle, ev.colorBoxes + ' 块 / ' + ev.ramps + ' 色块');
  check('评估：搭配建议出图', ev.advices >= 3 && ev.adviceImgs >= 3, ev.advices + ' 套 / ' + ev.adviceImgs + ' 张图');

  const before = await page.evaluate(async () => (await W.store.outfits()).length);
  await page.click('#eval-result .advice .btn.tiny');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(async () => (await W.store.outfits()).length);
  check('评估：一键存这套', after > before, before + ' → ' + after);

  // ---- 断舍离雷达 ----
  await page.click('.nav-item[data-view="discard"]');
  await page.waitForSelector('#discard-body .dis-row', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const dis = await page.evaluate(() => ({
    rows: document.querySelectorAll('#discard-body .dis-row').length,
    stats: document.querySelectorAll('#discard-body .fit-stat').length,
    danger: document.querySelectorAll('#discard-body .btn.danger').length,
    keepBtn: [...document.querySelectorAll('#discard-body button')].some(b => /保留/.test(b.textContent)),
    flags: document.querySelectorAll('#discard-body .dis-thumb img').length
  }));
  check('断舍离：清单行渲染', dis.rows >= 5, dis.rows + ' 行 / 统计块 ' + dis.stats);
  check('断舍离：可删除操作', dis.danger >= 1, dis.danger + ' 个删除按钮');
  check('断舍离：保留白名单', dis.keepBtn, '保留按钮 ' + (dis.keepBtn ? '有' : '无'));
  check('断舍离：缩略图真实加载', dis.flags >= 5, dis.flags + ' 张');

  // 衣橱卡片角标
  await page.click('.nav-item[data-view="library"]');
  await page.waitForTimeout(1500);
  const flags = await page.evaluate(() => ({
    drop: document.querySelectorAll('#lib-grid .thumb-flag.drop').length,
    watch: document.querySelectorAll('#lib-grid .thumb-flag.watch').length
  }));
  check('衣橱：可丢弃/观察角标', flags.drop + flags.watch >= 1, JSON.stringify(flags));

  // 资产：裁剪版 JPG（原图截掉 UI 文字），44 件全部真实可加载
  const jpg = await page.evaluate(async () => {
    const lib = await (await fetch('data/library.json')).json();
    let ok = 0, ratio = 0;
    for (const it of lib) {
      const r = await fetch('data/thumbs/' + it.id + '.jpg');
      if (r.ok && r.headers.get('content-type') === 'image/jpeg') {
        ok++;
        const bmp = await createImageBitmap(await r.blob());
        // 细长款（阔腿裤等）短边本来就小，只判比例是否离谱（细条 / 整屏），不卡绝对像素
        const ar = bmp.width / bmp.height;
        if (bmp.width >= 60 && bmp.height >= 60 && ar > 0.18 && ar < 2.2) ratio++;
      }
    }
    return { ok, ratio, n: lib.length };
  });
  check('资产：缩略图为裁剪 JPG', jpg.ok === jpg.n, jpg.ok + '/' + jpg.n);
  check('资产：裁剪比例合理（非细条非整屏）', jpg.ratio === jpg.n, jpg.ratio + '/' + jpg.n);

  const fatal = errors.filter(e => !/favicon|Failed to load resource/.test(e));
  check('无控制台错误', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n通过 ' + ok.length + ' / 失败 ' + bad.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(1); });
