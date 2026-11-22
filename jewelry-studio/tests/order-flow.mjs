import { chromium } from 'playwright';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PE: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CE: ' + m.text().slice(0, 200)); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const elap = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

// 清掉历史订单, 干净验证
await page.addInitScript(() => localStorage.clear());
await page.goto('http://localhost:5180/#/orders', { waitUntil: 'domcontentloaded' });
await wait(1200);
console.log(elap(), '打开订单页, 现有订单:', await page.locator('table.data tbody tr').count());

await page.evaluate(() => document.querySelector('#btn-new').click());
await wait(1800);
console.log(elap(), '建单弹窗打开, 估价行:', await page.locator('.modal .kv').count());

await page.evaluate(() => {
  document.querySelector('input[placeholder="客户姓名（可空）"]').value = '专项测试';
  document.querySelector('input[placeholder="联系电话（可空）"]').value = '13900000000';
});
await page.evaluate(() => document.querySelector('#confirm-order').click());
console.log(elap(), '点击确认, 开始渲染两张图...');

// 轮询按钮状态 + 订单出现
let done = false;
for (let i = 0; i < 60; i++) {
  await wait(1000);
  const cnt = await page.locator('table.data tbody tr').count();
  const btnTxt = await page.evaluate(() => document.querySelector('#confirm-order')?.textContent || '(弹窗已关闭)');
  if (cnt > 0) { console.log(elap(), '订单已落库, 按钮:', btnTxt); done = true; break; }
  if (i % 5 === 4) console.log(elap(), '等待中... 按钮:', btnTxt);
}
if (!done) { console.log('建单超时'); console.log('错误:', errors); await browser.close(); process.exit(1); }

// PDF
const pdfPromise = page.waitForEvent('download', { timeout: 20000 });
await page.evaluate(() => [...document.querySelectorAll('table.data tbody tr button')].find(b => b.innerText === 'PDF').click());
const pdf = await pdfPromise;
console.log(elap(), 'PDF 下载:', pdf.suggestedFilename());

// CSV
const csvPromise = page.waitForEvent('download', { timeout: 15000 });
await page.evaluate(() => document.querySelector('#btn-csv').click());
const csv = await csvPromise;
console.log(elap(), 'CSV 下载:', csv.suggestedFilename());

// 编辑订单
await page.evaluate(() => [...document.querySelectorAll('table.data tbody tr button')].find(b => b.innerText === '编辑').click());
await wait(500);
const modalOpen = await page.locator('.modal-mask').count();
console.log(elap(), '编辑弹窗:', modalOpen);
await page.evaluate(() => document.querySelector('.modal .small.ghost')?.click());

console.log('\n==== 错误数:', errors.length, '====');
errors.forEach((e, i) => console.log('#' + i, e));
await browser.close();
console.log(elap(), '全部通过');
