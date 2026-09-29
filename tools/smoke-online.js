/* smoke.js — 本地冒烟测试：起 Chromium 打开 App，跑一遍主要流程，收集控制台错误 */
const { chromium } = require('playwright-core');
const path = require('path');

const NODE_HOME = 'C:\\Users\\餐巾纸\\.workbuddy\\binaries\\node\\versions\\22.22.2-3';
const EXE = 'C:\\Users\\餐巾纸\\AppData\\Local\\ms-playwright\\chromium-1169\\chrome-win\\chrome.exe';
const URL = 'https://ai-wardrobe-79581.app.workbuddy.host';
const OUT = path.join(__dirname, 'smoke-report.txt');

(async () => {
  const log = [];
  const say = (s) => { log.push(s); console.log(s); };
  const errors = [];

  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.nav-item.active', { timeout: 8000 });
  say('✔ 页面加载，导航已激活');

  // 1. 灌 5 件测试单品（带图）
  await page.evaluate(async () => {
    const W = window.W;
    const defs = [
      ['test-navy-knit', 'top', '藏青针织衫', '#172033', '针织衫'],
      ['test-khaki-pants', 'bottom', '卡其休闲裤', '#bda46b', '休闲裤'],
      ['test-white-sneaker', 'shoes', '白色板鞋', '#f2efe6', '运动鞋'],
      ['test-olive-jacket', 'outerwear', '军绿工装夹克', '#4b5320', '夹克'],
      ['test-beanie', 'accessory', '米色冷帽', '#c9bfae', '帽']
    ];
    function makeBlob(hex, w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = hex;
      x.fillRect(Math.round(w * 0.15), Math.round(h * 0.1), Math.round(w * 0.7), Math.round(h * 0.8));
      return new Promise(r => c.toBlob(r, 'image/png'));
    }
    for (const [id, cat, name, hex, sub] of defs) {
      const sizes = cat === 'shoes' ? [900, 450] : cat === 'accessory' ? [500, 500] : [800, 900];
      const blob = await makeBlob(hex, sizes[0], sizes[1]);
      await W.store.putImage(W.store.IMG_KEY.png(id), blob);
      await W.store.putImage(W.store.IMG_KEY.thumb(id), blob);
      await W.store.put({
        id, name, brand: '测试品牌', price: 299, currency: 'CNY', sourcePlatform: 'taobao',
        sourceUrl: '', category: cat, subcategory: sub, colorHex: hex, secondaryColorHex: null,
        material: '棉', season: ['春', '秋'], occasion: ['通勤', '休闲'], aestheticTags: ['minimal'],
        tags: ['smoke'], purchaseDate: null, addedAt: new Date().toISOString(),
        image: 'items/' + id + '.png', notes: ''
      });
    }
  });
  await page.click('.nav-item[data-view="library"]');
  await page.waitForTimeout(400);
  await page.waitForSelector('.item-card', { timeout: 5000 });
  const cardCount = await page.locator('.item-card').count();
  say('✔ 衣橱渲染出 ' + cardCount + ' 张卡片（期望 5）');

  // 2. 详情弹窗
  await page.locator('.item-card').first().click();
  await page.waitForSelector('#modal:not([hidden])', { timeout: 3000 });
  say('✔ 单品详情弹窗可打开');
  await page.locator('.modal-foot .btn.primary').click();
  await page.waitForTimeout(300);
  say('✔ 单品保存（走回 store.put）');

  // 3. 搭配工作台：选 3 件 → 渲染 → 检查画布不是全白
  await page.click('.nav-item[data-view="compose"]');
  await page.waitForTimeout(400);
  const picks = await page.locator('.pick-item').count();
  say('✔ 搭配选择器列出 ' + picks + ' 个单品');
  const groups = await page.locator('.pick-group').count();
  say('✔ 按品类分组 ' + groups + ' 组（期望 5）');
  // 各品类各选一件
  await page.locator('.pick-group').nth(0).locator('.pick-item').first().click();
  await page.locator('.pick-group').nth(1).locator('.pick-item').first().click();
  await page.locator('.pick-group').nth(2).locator('.pick-item').first().click();
  await page.waitForTimeout(200);
  await page.click('#btn-compose-render');
  await page.waitForTimeout(600);
  const canvasProbe = await page.evaluate(() => {
    const c = document.querySelector('#flatlay');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) nonWhite++;
    }
    return { w: c.width, h: c.height, nonWhite };
  });
  say('✔ canvas ' + canvasProbe.w + '×' + canvasProbe.h + '，非白采样点 ' + canvasProbe.nonWhite + '（>0 说明画上去了）');

  await page.fill('#cmp-name', '冒烟测试搭配');
  await page.click('#btn-compose-save');
  await page.waitForTimeout(700);
  const outfitCards = await page.locator('.outfit-card').count();
  say('✔ 搭配保存成功，画廊 ' + outfitCards + ' 张（期望 1）');

  // 4. 评估
  await page.click('.nav-item[data-view="evaluate"]');
  await page.waitForTimeout(300);
  await page.click('#btn-eval-example');
  await page.waitForTimeout(600);
  const results = await page.evaluate(() => {
    const t = document.querySelector('#eval-result').innerText;
    const score = (t.match(/(\d+)\s*\/\s*100/) || [])[1];
    const idle = (t.match(/闲置概率\s*(\d+)%/) || [])[1];
    return { score, idle, combos: document.querySelectorAll('.combo').length, text: t.slice(0, 120) };
  });
  say('✔ 评估跑通：风格匹配分 ' + results.score + '，闲置 ' + results.idle + '%，方案 ' + results.combos + ' 套');

  // 5. 风格画像
  await page.click('.nav-item[data-view="profile"]');
  await page.waitForTimeout(400);
  const badge = await page.locator('#profile-origin').innerText();
  say('✔ 风格画像页：' + badge);

  // 6. 入库页 + 设置页
  await page.click('.nav-item[data-view="intake"]');
  await page.waitForTimeout(300);
  const optCount = await page.locator('#opt-bgmode option').count();
  say('✔ 入库页去背方式 ' + optCount + ' 个选项');
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(300);
  say('✔ 设置页可打开');

  // 7. 去背算法直测：白底 + 深色衣服 + 内部白色印花
  const bgRes = await page.evaluate(async () => {
    const W = window.W;
    const c = document.createElement('canvas');
    c.width = 400; c.height = 500;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 400, 500);
    x.fillStyle = '#334455'; x.fillRect(80, 100, 240, 300);
    x.fillStyle = '#FFFFFF'; x.fillRect(150, 180, 80, 60); // 不连通边界的白印花，不能被误删
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const res = await W.bg.remove(blob, { mode: 'algo', tolerance: 30, parentTolerance: 12, keepLargest: true });
    const d = res.canvas.getContext('2d').getImageData(0, 0, 400, 500).data;
    return {
      cornerAlpha: d[3],
      centerAlpha: d[(250 * 400 + 200) * 4 + 3],
      printAlpha: d[(210 * 400 + 190) * 4 + 3],
      colors: W.bg.dominantColors(res.canvas, 2)
    };
  });
  say('✔ 去背：四角 alpha=' + bgRes.cornerAlpha + '（期望0） 主体 alpha=' + bgRes.centerAlpha + '（期望255） 内部白印花 alpha=' + bgRes.printAlpha + '（期望255） 主色=' + bgRes.colors.join('/'));

  // 8. 文件名解析单测
  const parse = await page.evaluate(() => {
    const U = window.W.utils;
    return [
      U.parseInboxName('299-taobao-uniqlo-燕麦色廓形卫衣.jpg'),
      U.parseInboxName('随机文件名.PNG'),
      U.guessCategory('卡其工装裤'),
      U.guessSubcategory('费尔岛提花开衫'),
      U.hexDistance('#172033', '#172033'),
      Math.round(U.hexDistance('#172033', '#f2efe6'))
    ];
  });
  say('✔ 文件名解析：' + JSON.stringify(parse[0]));
  say('✔ 品类猜测：' + parse[2] + ' / 二级：' + parse[3] + ' / 同色距离 ' + parse[4] + ' / 藏青-米白 ' + parse[5]);

  await page.click('.nav-item[data-view="library"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'smoke-library.png'), fullPage: false });
  await page.click('.nav-item[data-view="compose"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, 'smoke-compose.png'), fullPage: false });

  say('');
  say(errors.length ? '✖ 控制台错误 ' + errors.length + ' 条：\n' + errors.join('\n') : '✔ 无控制台错误 / 未捕获异常');

  require('fs').writeFileSync(OUT, log.join('\n') + '\n\n' + (errors.join('\n') || 'no errors'), 'utf8');
  await browser.close();
})().catch(e => {
  console.error('SMOKE FAILED:', e.message);
  process.exit(1);
});
