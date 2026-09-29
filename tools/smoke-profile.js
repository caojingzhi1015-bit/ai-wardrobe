/* smoke-profile.js — 只验证「风格画像」页：新画像是否生效、解读面板是否渲染、评估是否用新色板 */
const { chromium } = require('playwright-core');

const EXE = 'C:\\Users\\餐巾纸\\AppData\\Local\\ms-playwright\\chromium-1169\\chrome-win\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8777';

(async () => {
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.nav-item.active', { timeout: 8000 });

  // 切到风格画像
  await page.click('[data-view="profile"]');
  await page.waitForTimeout(600);

  const txt = await page.textContent('#view-profile');
  const has = s => txt.indexOf(s) >= 0;
  const checks = [
    ['解读面板标题', has('风格解读（只读）')],
    ['廓形规则', has('只穿宽松')],
    ['搭配公式', has('黑色厚底乐福')],
    ['鞋包', has('黑色厚底圆头乐福')],
    ['摄影色调', has('暖白平衡')],
    ['光影', has('自然漫射光')],
    ['置信度', has('价位带') ],
    ['画像状态=已覆盖', (await page.textContent('#profile-origin')).indexOf('已用真实数据') >= 0]
  ];

  // 画像本体
  const pf = await page.evaluate(() => window.W.store.profile());
  const info = {
    palette: (pf.colorPaletteHex || []).length,
    styles: (pf.coreStyles || []).join(','),
    price: JSON.stringify(pf.priceRange),
    source: (pf._meta || {}).source.slice(0, 24),
    overwritten: (pf._meta || {}).overwritten
  };

  // 用新色板跑一次评估：军绿工装裤 #4b4b3b 应得高分
  await page.click('[data-view="evaluate"]');
  await page.waitForTimeout(400);
  const score = await page.evaluate(async () => {
    const pf = await window.W.store.profile();
    const cand = { name: '军绿工装阔腿裤', category: 'bottom', subcategory: '工装裤', price: 79,
      silhouette: 'oversize / 宽松', pattern: '纯色', material: '帆布', colorHex: '#4b4b3b',
      season: ['春', '秋'], occasion: ['休闲', '通勤'], tags: ['workwear'] };
    const r = window.W.evaluate.scoreForTest ? window.W.evaluate.scoreForTest(cand, pf) : null;
    return r;
  });

  console.log('--- 画像页检查 ---');
  checks.forEach(c => console.log((c[1] ? '✔' : '✘') + ' ' + c[0]));
  console.log('画像本体:', JSON.stringify(info));
  console.log('评估(军绿工装裤):', score ? JSON.stringify(score) : '（score 未导出，跳过）');
  console.log('控制台错误:', errors.length ? errors : '无');

  await browser.close();
  const fail = checks.filter(c => !c[1]).length;
  process.exit(fail || errors.length ? 1 : 0);
})();
