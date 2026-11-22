// 渲染出图页: 多视角批量出图, 白底/摄影棚双背景, PNG 导出 + 报价 PDF
import { h, toast, download } from '../ui/dom.js';
import { ViewerScene, CAMERA_PRESETS } from '../three/viewerScene.js';
import { estimateQuote, saveOrder } from '../state/store.js';
import { metalById, gemById, settingById } from '../data/materials.js';
import { makeQuotePdf, makeImagePdf } from '../export/pdf.js';

const ANGLES = [
  ['iso', '透视'], ['front', '正面'], ['back', '背面'],
  ['left', '左侧'], ['right', '右侧'], ['top', '俯视']
];
const BG_MODES = [['white', '白底'], ['studio', '摄影棚']];
const OUT_W = 1200, OUT_H = 1200;

let viewer = null;

export function disposeRender() {
  viewer?.dispose();
  viewer = null;
  document.querySelectorAll('.render-hidden-host').forEach(d => d.remove());
}

export function renderRender(root, session) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, '渲染出图'), h('p', {}, '与工作台同一 WebGL 物理管线 · 6 视角 × 2 背景批量出图 · 输出与视口完全一致')),
      h('div', { class: 'btn-row' },
        h('button', { id: 'btn-batch' }, '批量渲染全部 12 张'),
        h('button', { class: 'primary', id: 'btn-pdf' }, '生成图集 PDF')
      )
    ),
    h('div', { class: 'page-body' },
      h('div', { class: 'flex', style: 'margin-bottom:14px;flex-wrap:wrap' },
        h('span', { class: 'muted' }, '输出规格'),
        h('span', { class: 'pill' }, OUT_W + '×' + OUT_H + ' PNG'),
        h('span', { class: 'pill' }, 'PBR 物理材质'),
        h('span', { class: 'pill' }, 'RGB 分光焦散'),
        h('span', { class: 'pill' }, '软阴影 + 景深 + 辉光'),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'small', onclick: () => { location.hash = '#/workbench'; } }, '← 回工作台改参数')
      ),
      h('div', { class: 'angle-grid', id: 'shot-grid' })
    )
  );
  root.append(page);
  const grid = page.querySelector('#shot-grid');
  const shots = [];

  // 12 个格子(先占位, 逐张渲染)
  for (const [bg, bgLabel] of BG_MODES) {
    for (const [angle, angleLabel] of ANGLES) {
      const cell = h('div', { class: 'angle-cell' },
        h('div', { class: 'shot' }, h('div', {
          style: 'display:grid;place-items:center;height:100%;color:#999;font-size:12px;background:' + (bg === 'white' ? '#fff' : '#171a20')
        }, '待渲染')),
        h('div', { class: 'meta' },
          h('span', {}, `${bgLabel} · ${angleLabel}`),
          h('button', { class: 'small', disabled: true, 'data-dl': '1' }, '下载 PNG')
        )
      );
      grid.append(cell);
      shots.push({ cell, bg, angle, label: `${bgLabel}-${angleLabel}`, url: null });
    }
  }

  // 离屏渲染视口(挂在屏幕外但有真实尺寸)
  const hidden = h('div', { style: 'position:fixed;left:-9999px;top:0;width:1200px;height:1200px' });
  document.body.append(hidden);
  viewer = new ViewerScene(hidden);
  viewer.setConfig(session.config);
  viewer.resize();

  async function renderShot(s) {
    const ph = s.cell.querySelector('.shot');
    ph.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#999;font-size:12px;background:' + (s.bg === 'white' ? '#fff' : '#171a20') + '">渲染中…</div>';
    const url = await viewer.screenshot(OUT_W, OUT_H, s.angle, s.bg);
    s.url = url;
    ph.innerHTML = '';
    ph.append(h('img', { src: url }));
    const dl = s.cell.querySelector('[data-dl]');
    dl.disabled = false;
    dl.onclick = () => download(`jewelry-${s.bg}-${s.angle}.png`, url);
  }

  page.querySelector('#btn-batch').onclick = async () => {
    const btn = page.querySelector('#btn-batch');
    btn.disabled = true; btn.textContent = '批量渲染中…';
    for (const s of shots) {
      await renderShot(s);
    }
    btn.disabled = false; btn.textContent = '批量渲染全部 12 张';
    toast('12 张出图完成，可逐张下载或生成 PDF');
  };

  // 点击单格也可渲染
  shots.forEach(s => s.cell.querySelector('.shot').addEventListener('click', () => { if (!s.url) renderShot(s); }));

  page.querySelector('#btn-pdf').onclick = async () => {
    const btn = page.querySelector('#btn-pdf');
    btn.disabled = true;
    try {
      for (const s of shots) if (!s.url) await renderShot(s);
      const measured = viewer.measured || session.measured;
      const quote = estimateQuote(session.config, measured);
      const pdf = makeImagePdf(shots.map(s => ({ url: s.url, label: s.label })), session.config, quote);
      pdf.save('jewelry-render-set.pdf');
      toast('图集 PDF 已导出');
    } finally { btn.disabled = false; }
  };
}
