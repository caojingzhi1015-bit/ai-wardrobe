/* 冒烟测试：zip 一键导入
   用法：node smoke-zip-import.js <zip路径> [url]
   断言：导入后衣橱网格出现 44 张卡片、图片真实渲染、无控制台错误 */
const path = require('path');
const fs = require('fs');

const { chromium } = require('playwright-core');

const EXE = 'C:/Users/餐巾纸/AppData/Local/ms-playwright/chromium-1169/chrome-win/chrome.exe';

(async () => {
  const zipPath = process.argv[2];
  const url = process.argv[3] || 'http://127.0.0.1:8765/index.html';
  if (!zipPath || !fs.existsSync(zipPath)) {
    console.error('需要有效的 zip 路径参数');
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.W && W.store, null, { timeout: 15000 });

  // 注入 zip
  await page.setInputFiles('#imp-zip-file', zipPath);
  await page.waitForFunction(() => {
    const t = document.querySelector('#toast-region') || document.body;
    return /zip 导入完成|zip 导入失败/.test(t.innerText || '');
  }, null, { timeout: 60000 });
  const toast = await page.evaluate(() => (document.querySelector('#toast-region') || document.body).innerText.slice(0, 200));
  console.log('[toast]', toast.replace(/\s+/g, ' '));

  // 等网格渲染
  await page.waitForTimeout(1200);
  const stat = await page.evaluate(async () => {
    const list = await W.store.list();
    let withImg = 0, broken = 0;
    const cards = document.querySelectorAll('#lib-grid .item-card');
    const imgs = document.querySelectorAll('#lib-grid .item-card img');
    imgs.forEach(i => { if (i.naturalWidth > 0) withImg++; else broken++; });
    return {
      dbCount: list.length,
      cardCount: cards.length,
      imgCount: imgs.length,
      imgOk: withImg,
      imgBroken: broken,
      firstName: list.length ? list[list.length - 1].name : '',
      stat: (document.querySelector('#side-stat') || {}).innerText || ''
    };
  });
  console.log('[db]', JSON.stringify(stat));

  let ok = true;
  if (stat.dbCount !== 44) { console.error('FAIL dbCount != 44'); ok = false; }
  if (stat.cardCount !== 44) { console.error('FAIL cardCount != 44'); ok = false; }
  if (stat.imgBroken > 0) { console.error('FAIL 有图片未渲染'); ok = false; }
  if (stat.imgOk < 44) { console.error('FAIL 渲染成功的图片不足 44'); ok = false; }
  const fatal = errors.filter(e => !/favicon/.test(e));
  if (fatal.length) { console.error('FAIL 控制台错误:', fatal); ok = false; }

  // 抽查明细：点开第一张卡确认弹窗可用
  await page.click('#lib-grid .item-card');
  await page.waitForTimeout(600);
  const modalTitle = await page.evaluate(() => {
    const h = document.querySelector('.modal h2, .modal-title, [class*=modal] h2, [class*=modal] h3');
    return h ? h.innerText : document.body.innerText.slice(0, 120);
  });
  console.log('[modal]', String(modalTitle).replace(/\s+/g, ' ').slice(0, 80));

  await browser.close();
  console.log(ok ? 'SMOKE OK (zip import)' : 'SMOKE FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(1); });
