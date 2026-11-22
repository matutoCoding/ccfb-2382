// 生成最终展示用的高分辨率成品图(三种品类各一张白底)
import { chromium } from 'playwright';
import fs from 'fs';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1255/chrome-win64/chrome.exe';
const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const wait = ms => new Promise(r => setTimeout(r, ms));
const client = await page.context().newCDPSession(page);
const shot = async name => {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`tests/shots/final-${name}.png`, Buffer.from(data, 'base64'));
};
// 祖母绿吊坠 + 耳钉 两款特色
await page.goto('http://localhost:5180/#/catalog', { waitUntil: 'domcontentloaded' });
await wait(3000);
// 进入祖母绿切吊坠
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const target = cards.find(c => c.innerText.includes('祖母绿切吊坠'));
  target.querySelector('button.primary').click();
});
await wait(3000);
await page.evaluate(() => {
  const seg = [...document.querySelectorAll('.seg button')].find(b => b.innerText.includes('白底'));
  seg?.click();
});
await wait(2500);
await shot('emerald-pendant-white');
console.log('祖母绿吊坠白底图完成');
await browser.close();
