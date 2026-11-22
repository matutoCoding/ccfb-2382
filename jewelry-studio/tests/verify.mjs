// 浏览器自动化验证: 路由/控制台错误/WebGL 渲染/交互/出图/建单
import { chromium } from 'playwright';
import fs from 'fs';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5180';
const errors = [];

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 220)); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
let client = null;
const shot = async name => {
  client ||= await page.context().newCDPSession(page);
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`tests/shots/${name}.png`, Buffer.from(data, 'base64'));
};

// ---------- 1. 款式库 ----------
await page.goto(BASE + '/#/catalog', { waitUntil: 'domcontentloaded' });
await wait(3000);
await shot('01-catalog');
console.log('款式库卡片数:', await page.locator('.card').count());
const renderInfo = await page.evaluate(() => {
  const cvs = document.querySelectorAll('.thumb canvas');
  const c = cvs[0]; const gl = c.getContext('webgl2');
  const px = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
  return { canvases: cvs.length, litRatio: +(lit / (c.width * c.height)).toFixed(3) };
});
console.log('缩略图 WebGL:', JSON.stringify(renderInfo));

// ---------- 2. 工作台 ----------
await page.evaluate(() => document.querySelector('.card .primary').click());
await wait(2500);
await shot('02-workbench');
console.log('徽章:', (await page.locator('#badge-a').innerText()).replace(/\n/g, ' | '));

// 改指圈号 13 -> 20
await page.evaluate(() => {
  const lab = [...document.querySelectorAll('label.field')].find(l => l.innerText.includes('指圈号'));
  const s = lab.querySelector('input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(s, 20);
  s.dispatchEvent(new Event('input', { bubbles: true }));
});
await wait(1500);
console.log('圈号20生效:', (await page.locator('#badge-a').innerText()).includes('20'));

// 切玫瑰金 + 包镶 + 椭圆切
await page.evaluate(() => {
  const sel = document.querySelector('.side-panel select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, 'au750-rose');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(500);
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.innerText.includes('包镶')).click());
await wait(500);
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find(b => b.innerText.includes('椭圆')).click());
await wait(700);
await shot('03-rose-bezel-oval');

// 围石开关
await page.evaluate(() => {
  const line = [...document.querySelectorAll('.checkline')].find(l => l.innerText.includes('围石'));
  const box = line.querySelector('input');
  if (!box.checked) box.click();
});
await wait(700);
await shot('04-halo');

// 历史回退
const undoCount = 3;
for (let i = 0; i < undoCount; i++) { await page.evaluate(() => document.querySelector('#btn-undo').click()); await wait(200); }
await wait(400);
await page.evaluate(() => document.querySelector('#btn-history').click());
await wait(400);
await shot('05-history-modal');
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('.modal .small.ghost')?.click());
await wait(300);

// 收藏
await page.evaluate(() => document.querySelector('#btn-fav').click());
await wait(300);

// 分屏对比
await page.evaluate(() => document.querySelector('#btn-split').click());
await wait(2000);
await shot('06-split');
console.log('分屏视口数:', await page.locator('.vp').count());
await page.evaluate(() => [...document.querySelectorAll('#badge-b button')].find(b => b.innerText.includes('A→B'))?.click());
await wait(800);
const hasB = await page.locator('#badge-b').innerText();
console.log('B款徽章存在:', hasB.includes('B 款'));
await page.evaluate(() => document.querySelector('#btn-split').click()); // 关闭分屏
await wait(500);

// ---------- 3. 材质宝石库 ----------
await page.goto(BASE + '/#/library', { waitUntil: 'domcontentloaded' });
await wait(800);
await shot('07-library');
console.log('收藏卡片数:', await page.locator('text=载入工作台').count());

// ---------- 4. 渲染出图 ----------
await page.goto(BASE + '/#/render', { waitUntil: 'domcontentloaded' });
await wait(2000);
console.log('出图格数:', await page.locator('.angle-cell').count());
await page.evaluate(() => document.querySelectorAll('.angle-cell .shot')[0].click());
await page.evaluate(() => document.querySelectorAll('.angle-cell .shot')[6].click()); // 第二背景第一张
await wait(6000);
await shot('08-render-shots');
console.log('已渲染图片:', await page.locator('.angle-cell img').count());
const dims = await page.evaluate(() => {
  const img = document.querySelector('.angle-cell img');
  return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
});
console.log('PNG 尺寸:', JSON.stringify(dims));

// ---------- 5. 订单 ----------
await page.goto(BASE + '/#/orders', { waitUntil: 'domcontentloaded' });
await wait(1000);
await page.evaluate(() => document.querySelector('#btn-new').click());
await wait(1800);
await shot('09-order-form');
console.log('估价行数:', await page.locator('.modal .kv').count());
await page.evaluate(() => {
  document.querySelector('input[placeholder="客户姓名（可空）"]').value = '测试客户';
  document.querySelector('input[placeholder="联系电话（可空）"]').value = '13800001111';
});
await page.evaluate(() => document.querySelector('#confirm-order').click());
// 手动轮询等待订单落库(绕开 waitForFunction 在该 Playwright 版本忽略 timeout 的问题)
let orderCount = 0;
for (let i = 0; i < 100; i++) {
  await wait(1000);
  orderCount = await page.locator('table.data tbody tr').count();
  if (orderCount > 0) break;
}
console.log('建单等待完成, 订单行数:', orderCount);
await wait(500);
await shot('10-orders');

// PDF 导出(手动轮询下载事件)
const pdfEvents = [];
page.on('download', d => pdfEvents.push(d.suggestedFilename()));
await page.evaluate(() => [...document.querySelectorAll('table.data tbody tr button')].find(b => b.innerText === 'PDF').click());
for (let i = 0; i < 25 && !pdfEvents.length; i++) await wait(400);
console.log('PDF 文件:', pdfEvents[0] || '未触发');

// CSV
const csvBefore = pdfEvents.length;
await page.evaluate(() => document.querySelector('#btn-csv').click());
for (let i = 0; i < 25 && pdfEvents.length < csvBefore + 1; i++) await wait(400);
console.log('CSV 文件:', pdfEvents.find(f => f.endsWith('.csv')) || '未触发');

// 调价面板
await page.evaluate(() => document.querySelector('#btn-price').click());
await wait(500);
await shot('11-price');
await page.evaluate(() => document.querySelector('.modal .small.ghost')?.click());

await wait(400);
console.log('\n==== 控制台错误数:', errors.length, '====');
[...new Set(errors)].slice(0, 8).forEach((e, i) => console.log(`ERR#${i}:`, e));
await browser.close();
