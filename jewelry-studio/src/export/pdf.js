// PDF 导出: 中文经 canvas 栅格化(无外部字体依赖), 图片用真实渲染 PNG
import { jsPDF } from 'jspdf';
import { metalById, gemById, settingById, cutById } from '../data/materials.js';
import { num, money } from '../ui/dom.js';

const GOLD = '#b4884a', DARK = '#1b1e25', GRAY = '#6b7180';

// 把一段中文/混排文本画成透明 PNG, 再贴进 PDF
function textPng(doc, text, x, y, sizePx, color = DARK, opts = {}) {
  const scale = 3;
  const font = `${opts.bold ? '700' : '400'} ${sizePx * scale}px "PingFang SC","Microsoft YaHei",sans-serif`;
  // 离屏测量
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(String(text)).width) + 6;
  const h = Math.ceil(sizePx * scale * 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c2 = canvas.getContext('2d');
  c2.font = font;
  c2.fillStyle = color;
  c2.textBaseline = 'middle';
  c2.fillText(String(text), 3, h / 2);
  const px = canvas.width / scale, py = canvas.height / scale;
  let drawX = x;
  if (opts.align === 'right') drawX = x - px; // 右对齐: x 视为右边界
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', drawX, y, px, py, undefined, 'FAST');
  return { w: px, h: py, x: drawX };
}

function configLines(config) {
  const metal = metalById(config.metalId), gem = gemById(config.gemId);
  const setting = settingById(config.setting), cut = cutById(config.gemCut);
  const cat = config.category === 'ring' ? `戒指 / 港度 ${config.ringSize} 号`
    : config.category === 'pendant' ? `吊坠 / 吊咀 ${config.bailSize}mm`
    : `耳饰 / ${config.earringStyle === 'stud' ? '耳钉' : '耳坠'}一对`;
  return [
    ['品类款式', cat],
    ['金属', `${metal.name} · 金属度 ${config.metalness} · 粗糙度 ${config.roughness} · 壁厚 ${config.bandThickness}mm`],
    ['主石', `${gem.name} · ${cut.name} · ${config.gemSize}mm × 亭深 ${config.gemHeight}mm`],
    ['光学常数', `IOR ${gem.ior} · 色散 ${gem.dispersion} · 密度 ${gem.density}g/cm³`],
    ['镶口', `${setting.name}${setting.id === 'bezel' ? '' : ' × ' + config.prongCount + (setting.id === 'prong' ? ' 爪' : ' 钉')}${config.halo ? ` · 围石 ${config.haloCount} 颗` : ''}`],
    ['渲染', `${config.env === 'white' ? '白底' : '摄影棚'} · 景深${config.dof ? '开' : '关'} · 辉光${config.bloom ? '开' : '关'} · 物理焦散${config.caustics ? '开' : '关'}`]
  ];
}

function drawQuoteTable(doc, quote, startY) {
  let y = startY;
  const x0 = 16, x1 = 120, x2 = 160, x3 = 194;
  const rows = [
    ['项目', '规格 / 用量', '单价', '金额'],
    ['金属', `${quote.metal.name}  ${num(quote.metal.weightG, 3)}g`, `¥${quote.metal.pricePerGram}/g`, '¥' + Math.round(quote.metal.cost).toLocaleString()],
    ['主石', `${quote.mainGem.name}  ${num(quote.mainGem.carat, 2)}ct`, `¥${quote.mainGem.pricePerCarat.toLocaleString()}/ct`, '¥' + Math.round(quote.mainGem.cost).toLocaleString()],
    ['副石', `碎钻 ${quote.sideGems.count} 颗 / ${num(quote.sideGems.carat, 2)}ct`, '计价', '¥' + Math.round(quote.sideGems.cost).toLocaleString()],
    ['工费', '镶口工艺 + 抛光 + 品控', '—', '¥' + Math.round(quote.craftFee).toLocaleString()]
  ];
  rows.forEach((r, i) => {
    if (i === 0) { doc.setFillColor(236, 226, 205); doc.rect(x0, y - 1, 178, 9, 'F'); }
    const color = i === 0 ? '#5a421e' : '#282828';
    textPng(doc, r[0], x0 + 2, y, 9.5, color, { bold: i === 0 });
    textPng(doc, r[1], x1, y, 9.5, color);
    textPng(doc, r[2], x2, y, 9.5, color);
    textPng(doc, r[3], x3, y, 9.5, color, { bold: i === 0, align: 'right' });
    y += 10;
  });
  doc.setDrawColor(200, 200, 200);
  doc.line(x0, y, x0 + 178, y);
  y += 8;
  textPng(doc, '合计报价', x0, y, 12, GRAY);
  textPng(doc, '¥ ' + Math.round(quote.total).toLocaleString('zh-CN'), x3 - 30, y - 1, 16, GOLD, { bold: true });
  return y;
}

// 报价单 PDF(订单页用)
export function makeQuotePdf(order) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(27, 30, 37); doc.rect(0, 0, 210, 34, 'F');
  doc.setFillColor(180, 136, 74); doc.rect(0, 34, 210, 1.2, 'F');
  textPng(doc, '曜金工坊 · 珠宝定制报价单', 16, 10, 18, '#f0e6d2', { bold: true });
  textPng(doc, 'JEWELRY STUDIO QUOTATION', 16, 22, 9, '#b9b0a0');
  textPng(doc, `单号 ${order.id}    ${order.createdAt || ''}`, 120, 13, 10, '#cfc6b6');
  if (order.customerName) textPng(doc, `客户 ${order.customerName}    电话 ${order.customerPhone || '—'}`, 120, 21, 10, '#cfc6b6');

  let y = 46;
  textPng(doc, '一、配置参数（订单存档，可复现同款）', 16, y, 13, DARK, { bold: true }); y += 9;
  for (const [k, v] of configLines(order.config)) {
    doc.setFillColor(245, 243, 238);
    doc.rect(16, y - 1, 30, 8, 'F');
    textPng(doc, k, 18, y + 0.6, 9.5, GRAY);
    textPng(doc, v, 50, y + 0.6, 9.5, DARK);
    y += 10;
  }

  y += 4;
  textPng(doc, '二、报价明细（金属按实测体积×密度，宝石按体积×密度折克拉）', 16, y, 13, DARK, { bold: true }); y += 10;
  y = drawQuoteTable(doc, order.quote, y) + 8;

  if (order.image) {
    textPng(doc, '三、成品渲染图', 16, y, 13, DARK, { bold: true }); y += 8;
    const s = 86;
    doc.addImage(order.image, 'PNG', 16, y, s, s);
    if (order.image2) doc.addImage(order.image2, 'PNG', 108, y, s, s);
    y += s + 8;
  }
  textPng(doc, '说明：本单参数与渲染图由同一物理渲染管线生成，折射率、色散与焦散均为实时解算结果。', 16, 282, 8.5, GRAY);
  return doc;
}

// 图集 PDF(渲染页用)
export function makeImagePdf(shots, config, quote) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // 封面
  doc.setFillColor(27, 30, 37); doc.rect(0, 0, 210, 297, 'F');
  textPng(doc, '曜金工坊 · 成品渲染图集', 24, 30, 22, '#f0e6d2', { bold: true });
  textPng(doc, `${metalById(config.metalId).name} × ${gemById(config.gemId).name} · ${settingById(config.setting).name}`, 24, 46, 12, '#cfc6b6');
  const cover = shots.find(s => s.label.includes('透视') && s.label.includes('白底')) || shots[0];
  doc.addImage(cover.url, 'PNG', 24, 60, 110, 110);
  textPng(doc, '合计参考价  ' + money(quote.total), 24, 178, 16, GOLD, { bold: true });
  let y = 196;
  for (const [k, v] of configLines(config)) {
    textPng(doc, `${k}：${v}`, 24, y, 9.5, '#b9b0a0'); y += 9;
  }

  // 图集页: 每页 4 张
  for (let i = 0; i < shots.length; i += 4) {
    doc.addPage();
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F');
    textPng(doc, '多视角成品图（与视口同管线渲染）', 16, 12, 13, DARK, { bold: true });
    const chunk = shots.slice(i, i + 4);
    chunk.forEach((s, j) => {
      const col = j % 2, row = Math.floor(j / 2);
      const x = 16 + col * 92, yy = 24 + row * 128;
      doc.addImage(s.url, 'PNG', x, yy, 84, 84);
      textPng(doc, s.label, x, yy + 88, 10, GRAY);
    });
  }

  // 报价页
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F');
  textPng(doc, '报价明细', 16, 18, 15, DARK, { bold: true });
  drawQuoteTable(doc, quote, 34);
  return doc;
}
