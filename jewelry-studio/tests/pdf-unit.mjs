// 直接调用 makeQuotePdf / makeImagePdf 验证 PDF 生成逻辑(跳过渲染建单)
import { chromium } from 'playwright';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CE: ' + m.text().slice(0, 250)); });
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// 先在页面里生成一个合法 PNG 占位图
const pxUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#cccccc'; x.fillRect(0, 0, 8, 8);
  return c.toDataURL('image/png');
});

const result = await page.evaluate(async (pxUrl) => {
  try {
    const pdfMod = await import('/src/export/pdf.js');
    const storeMod = await import('/src/state/store.js');
    const config = storeMod.defaultConfig();
    const measured = { metalVolumeMm3: 160, gemVolumeMm3: 55 };
    const quote = storeMod.estimateQuote(config, measured);
    const order = {
      id: 'TEST0001', createdAt: '2026-11-23 10:00',
      customerName: '测试', customerPhone: '138', note: '备注',
      config, measured, quote, image: pxUrl, image2: pxUrl
    };
    const doc = pdfMod.makeQuotePdf(order);
    return { ok: true, pdfBytes: doc.output().length, totalPages: doc.getNumberOfPages() };
  } catch (e) {
    return { ok: false, error: e.message, stack: e.stack?.slice(0, 700) };
  }
}, pxUrl);
console.log('报价 PDF 结果:', JSON.stringify(result, null, 1));

const imgResult = await page.evaluate(async (pxUrl) => {
  try {
    const pdfMod = await import('/src/export/pdf.js');
    const storeMod = await import('/src/state/store.js');
    const config = storeMod.defaultConfig();
    const quote = storeMod.estimateQuote(config, { metalVolumeMm3: 160, gemVolumeMm3: 55 });
    const shots = [0, 1, 2, 3].map(i => ({ url: pxUrl, label: '白底·透视' + i }));
    const doc = pdfMod.makeImagePdf(shots, config, quote);
    return { ok: true, pdfBytes: doc.output().length, pages: doc.getNumberOfPages() };
  } catch (e) {
    return { ok: false, error: e.message, stack: e.stack?.slice(0, 700) };
  }
}, pxUrl);
console.log('图集 PDF 结果:', JSON.stringify(imgResult, null, 1));
console.log('页面错误:', JSON.stringify(errors));
await browser.close();
