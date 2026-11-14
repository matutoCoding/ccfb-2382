// ============================================================
// 主应用:路由 / 状态 / 历史 / 收藏 / 订单 / 出图 / PDF
// ============================================================
import * as THREE from 'three';
import {
  METALS, GEMS, GEM_SHAPES, SETTING_TYPES, BASE_TYPES,
  PRESETS, defaultConfig,
} from './config.js';
import { buildJewelry } from './jewelry.js';
import { makeMetalMaterial, makeGemMaterial, makeMeleeMaterial } from './materials.js';
import { bakeCaustics } from './caustics.js';
import { Viewport } from './viewport.js';
import { estimate, fmtMoney, fmtNum } from './pricing.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ---------------- 全局状态 ----------------
const store = {
  config: defaultConfig(),
  history: [],
  future: [],
  favorites: JSON.parse(localStorage.getItem('jc_favorites') || '[]'),
  orders: JSON.parse(localStorage.getItem('jc_orders') || '[]'),
  compare: null,        // 分屏右侧配置快照
  compareOn: false,
};

let viewport = null;       // 主视口
let viewportB = null;      // 分屏副视口
let currentBuilt = null;   // 当前模型
let currentEstimate = null;
let causticsTimer = null;
let causticsRunning = false;
let causticsPending = false;

const GEOM_KEYS = new Set(['baseType', 'ringSize', 'bandWidth', 'bandThickness', 'gemShape', 'gemSize', 'gemAspect', 'settingType', 'prongCount', 'prongThickness', 'bezelHeight', 'paveRows', 'pavePerRow', 'paveStoneSize']);
const CAUSTIC_KEYS = new Set([...GEOM_KEYS, 'gemType', 'gemIor', 'gemDispersion']);

// ---------------- 模型构建 ----------------
function buildModel(cfg) {
  const gemMat = makeGemMaterial(cfg);
  const meleeMat = makeMeleeMaterial();
  const built = buildJewelry(cfg, gemMat);
  const metalMat = makeMetalMaterial(cfg);
  // 钉镶配石先换成简化材质(避免与主石混淆)
  if (built.paveInfo) {
    built.paveInfo.group.traverse(o => {
      if (o.isMesh && o.material === gemMat) o.material = meleeMat;
    });
  }
  built.metal.traverse(o => {
    if (o.isMesh) {
      // 几何模块创建的网格带的是默认 Basic 材质 → 全部替换为金属
      if (o.material.type === 'MeshBasicMaterial') o.material = metalMat;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // 主石列表(供焦散追迹)
  const gemMeshes = [];
  built.group.traverse(o => {
    if (o.isMesh && o.material === gemMat) { gemMeshes.push(o); o.castShadow = true; }
  });
  return { ...built, gemMeshes, gemMat, metalMat, meleeMat };
}

function rebuild(keysChanged = null, { rebake = true } = {}) {
  const cfg = store.config;
  currentBuilt = buildModel(cfg);
  viewport.setModel(currentBuilt.group);
  viewport.setBackground(cfg.background);
  viewport.bloomPass.strength = cfg.bloom;
  viewport.bokehPass.enabled = cfg.dof;
  updatePricePanel();
  if (store.compareOn && viewportB) rebuildCompare();
  const needBake = rebake && cfg.caustics && (!keysChanged || [...keysChanged].some(k => CAUSTIC_KEYS.has(k)));
  if (needBake) scheduleCaustics();
  if (!cfg.caustics) viewport.setCaustics(null);
}

function scheduleCaustics() {
  clearTimeout(causticsTimer);
  causticsTimer = setTimeout(runCaustics, 500);
}

async function runCaustics() {
  if (causticsRunning) { causticsPending = true; return; }
  causticsRunning = true;
  const status = $('#caustics-status');
  try {
    const cfg = store.config;
    const preset = GEMS[cfg.gemType];
    const gemDef = {
      ior: cfg.gemIor,
      cauchyB: preset.cauchyB * (preset.dispersion > 0 ? cfg.gemDispersion / preset.dispersion : 1),
      attenuationColor: preset.attenuationColor,
      attenuationDistance: preset.attenuationDistance,
    };
    viewport.scene.updateMatrixWorld(true);
    const lightDir = viewport.keyLight.target.position.clone().sub(viewport.keyLight.position).normalize();
    const result = await bakeCaustics(currentBuilt.gemMeshes, lightDir, viewport.groundY, gemDef, {
      onProgress: p => { if (status) status.textContent = `焦散计算中 ${(p * 100) | 0}% · 光谱光子追迹`; },
    });
    viewport.setCaustics(result);
    if (status) status.textContent = `焦散已更新(${(result.canvas.width)}px,真折射+色散)`;
  } catch (e) {
    console.error('caustics failed', e);
    if (status) status.textContent = '焦散计算失败';
  }
  causticsRunning = false;
  if (causticsPending) { causticsPending = false; scheduleCaustics(); }
}

// ---------------- 历史 ----------------
let lastCommitted = JSON.stringify(store.config ?? defaultConfig());
function commitHistory() {
  // 提交的是"改动前"的状态快照
  store.history.push(lastCommitted);
  lastCommitted = JSON.stringify(store.config);
  if (store.history.length > 60) store.history.shift();
  store.future = [];
  updateHistoryButtons();
}
function replaceConfig(cfg) {
  commitHistory();
  store.config = cfg;
  lastCommitted = JSON.stringify(cfg);
  refreshWorkbenchControls();
  rebuild();
}
function undo() {
  if (!store.history.length) return;
  store.future.push(JSON.stringify(store.config));
  store.config = JSON.parse(store.history.pop());
  lastCommitted = JSON.stringify(store.config);
  refreshWorkbenchControls();
  rebuild();
  updateHistoryButtons();
}
function redo() {
  if (!store.future.length) return;
  store.history.push(JSON.stringify(store.config));
  store.config = JSON.parse(store.future.pop());
  lastCommitted = JSON.stringify(store.config);
  refreshWorkbenchControls();
  rebuild();
  updateHistoryButtons();
}
function updateHistoryButtons() {
  $('#btn-undo').disabled = !store.history.length;
  $('#btn-redo').disabled = !store.future.length;
}

// 修改配置:live 重建 + change 提交历史
function setConfig(key, value, commit) {
  const old = store.config[key];
  store.config[key] = value;
  if (commit) commitHistory();
  rebuild(new Set([key]));
}

// ---------------- 价格面板 ----------------
function updatePricePanel() {
  currentEstimate = estimate(store.config, currentBuilt);
  const e = currentEstimate;
  const box = $('#price-panel');
  if (!box) return;
  box.innerHTML = `
    <div class="price-row"><span>金属 ${e.metalName}</span><b>${fmtNum(e.metalWeight)} g · ${fmtMoney(e.metalPrice)}</b></div>
    <div class="price-row"><span>主石 ${e.gemName}</span><b>${fmtNum(e.gemCarat)} ct · ${fmtMoney(e.gemPrice)}</b></div>
    ${e.meleeCount ? `<div class="price-row"><span>配石 ×${e.meleeCount}</span><b>${fmtNum(e.meleeCarat)} ct · ${fmtMoney(e.meleePrice)}</b></div>` : ''}
    <div class="price-row"><span>工费</span><b>${fmtMoney(e.labor)}</b></div>
    <div class="price-row total"><span>预估总价</span><b>${fmtMoney(e.total)}</b></div>`;
}

// ============================================================
// 页面:配置工作台
// ============================================================
const CONTROL_SCHEMA = [
  {
    title: '基础款', open: true, controls: [
      { key: 'baseType', label: '首饰类型', type: 'select', options: BASE_TYPES },
      { key: 'ringSize', label: '指圈号(港号)', type: 'range', min: 8, max: 24, step: 1, showIf: c => c.baseType === 'ring' },
      { key: 'bandWidth', label: '戒臂宽度 mm', type: 'range', min: 1.4, max: 4.5, step: 0.1, showIf: c => c.baseType === 'ring' },
      { key: 'bandThickness', label: '金属厚度 mm', type: 'range', min: 0.8, max: 2.6, step: 0.05, showIf: c => c.baseType === 'ring' },
    ],
  },
  {
    title: '宝石', open: true, controls: [
      { key: 'gemShape', label: '切工形状', type: 'select', options: GEM_SHAPES },
      { key: 'gemType', label: '宝石种类', type: 'select', options: Object.fromEntries(Object.entries(GEMS).map(([k, v]) => [k, { name: v.name }])) },
      { key: 'gemSize', label: '尺寸 mm', type: 'range', min: 3, max: 12, step: 0.1 },
      { key: 'gemAspect', label: '长宽比', type: 'range', min: 1.0, max: 2.0, step: 0.05, showIf: c => c.gemShape !== 'round' },
      { key: 'gemIor', label: '折射率 IOR', type: 'range', min: 1.4, max: 2.8, step: 0.001 },
      { key: 'gemDispersion', label: '色散', type: 'range', min: 0, max: 0.15, step: 0.001 },
    ],
  },
  {
    title: '镶口', open: true, controls: [
      { key: 'settingType', label: '镶嵌方式', type: 'select', options: SETTING_TYPES },
      { key: 'prongCount', label: '爪数量', type: 'range', min: 3, max: 8, step: 1, showIf: c => c.settingType !== 'bezel' },
      { key: 'prongThickness', label: '爪粗细 mm', type: 'range', min: 0.4, max: 1.4, step: 0.05, showIf: c => c.settingType !== 'bezel' },
      { key: 'bezelHeight', label: '包镶高度 mm', type: 'range', min: 0.8, max: 3.0, step: 0.1, showIf: c => c.settingType === 'bezel' },
      { key: 'paveRows', label: '钉镶排数', type: 'range', min: 1, max: 3, step: 1, showIf: c => c.settingType === 'pave' && c.baseType === 'ring' },
      { key: 'pavePerRow', label: '每排颗数', type: 'range', min: 3, max: 14, step: 1, showIf: c => c.settingType === 'pave' && c.baseType === 'ring' },
      { key: 'paveStoneSize', label: '配石大小 mm', type: 'range', min: 0.8, max: 2.2, step: 0.1, showIf: c => c.settingType === 'pave' && c.baseType === 'ring' },
    ],
  },
  {
    title: '金属材质', open: true, controls: [
      { key: 'metalType', label: '金属', type: 'select', options: Object.fromEntries(Object.entries(METALS).map(([k, v]) => [k, { name: v.name }])) },
      { key: 'metalness', label: '金属度', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'roughness', label: '粗糙度', type: 'range', min: 0.02, max: 0.6, step: 0.01 },
    ],
  },
  {
    title: '显示与渲染', open: false, controls: [
      { key: 'background', label: '背景', type: 'select', options: { studio: { name: '场景(深灰)' }, white: { name: '白底' } } },
      { key: 'bloom', label: '辉光强度', type: 'range', min: 0, max: 1.2, step: 0.05 },
      { key: 'dof', label: '景深', type: 'check' },
      { key: 'caustics', label: '宝石焦散(实时光子追迹)', type: 'check' },
    ],
  },
];

function buildWorkbenchPanel() {
  const panel = $('#workbench-controls');
  panel.innerHTML = '';
  for (const sec of CONTROL_SCHEMA) {
    const det = el('details', 'ctrl-section');
    det.open = sec.open;
    det.append(el('summary', '', sec.title));
    const body = el('div', 'ctrl-body');
    for (const c of sec.controls) {
      const row = el('div', 'ctrl-row');
      row.dataset.key = c.key;
      const label = el('label', '', c.label);
      const val = el('span', 'ctrl-val');
      let input;
      if (c.type === 'select') {
        input = el('select');
        for (const [v, o] of Object.entries(c.options)) {
          const opt = el('option', '', o.name); opt.value = v; input.append(opt);
        }
      } else if (c.type === 'check') {
        input = el('input'); input.type = 'checkbox';
      } else {
        input = el('input'); input.type = 'range';
        Object.assign(input, { min: c.min, max: c.max, step: c.step });
      }
      input.dataset.key = c.key;
      input.addEventListener('input', () => {
        const v = c.type === 'check' ? input.checked : (c.type === 'select' ? input.value : parseFloat(input.value));
        setConfig(c.key, v, false);
        // 切换宝石/金属时联动物理参数
        if (c.key === 'gemType') {
          const g = GEMS[v];
          setConfig('gemIor', g.ior, false);
          setConfig('gemDispersion', g.dispersion, false);
        }
        if (c.key === 'metalType') setConfig('roughness', METALS[v].defaultRoughness, false);
        updateCtrlVal(row, c, v);
        refreshConditionalRows();
        refreshWorkbenchControls();
      });
      input.addEventListener('change', () => commitHistory());
      row.append(label, input, val);
      body.append(row);
    }
    det.append(body);
    panel.append(det);
  }
  refreshWorkbenchControls();
}

function updateCtrlVal(row, c, v) {
  const val = row.querySelector('.ctrl-val');
  if (c.type === 'range') val.textContent = typeof v === 'number' ? (Number.isInteger(c.step) ? v : v.toFixed(String(c.step).split('.')[1]?.length || 2)) : v;
  else if (c.type === 'check') val.textContent = v ? '开' : '关';
  else val.textContent = '';
}

function refreshWorkbenchControls() {
  for (const sec of CONTROL_SCHEMA) {
    for (const c of sec.controls) {
      const row = $(`.ctrl-row[data-key="${c.key}"]`);
      if (!row) continue;
      const input = row.querySelector('input,select');
      const v = store.config[c.key];
      if (c.type === 'check') input.checked = v;
      else input.value = v;
      updateCtrlVal(row, c, v);
    }
  }
  refreshConditionalRows();
}

function refreshConditionalRows() {
  for (const sec of CONTROL_SCHEMA) {
    for (const c of sec.controls) {
      const row = $(`.ctrl-row[data-key="${c.key}"]`);
      if (!row) continue;
      row.style.display = (!c.showIf || c.showIf(store.config)) ? '' : 'none';
    }
  }
}

// ---------------- 分屏对比 ----------------
function toggleCompare(on) {
  store.compareOn = on;
  $('#viewport-wrap').classList.toggle('split', on);
  if (on) {
    if (!viewportB) {
      viewportB = new Viewport($('#viewport-b'));
      viewportB.start();
    }
    if (!store.compare) store.compare = JSON.parse(JSON.stringify(store.config));
    rebuildCompare();
  }
}

function rebuildCompare() {
  if (!viewportB || !store.compare) return;
  const built = buildModel(store.compare);
  const first = !viewportB._framed;
  viewportB.setModel(built.group);
  viewportB.setBackground(store.compare.background);
  viewportB.bloomPass.strength = store.compare.bloom;
  viewportB.bokehPass.enabled = store.compare.dof;
  if (first) { viewportB.frameModel(); viewportB._framed = true; }
}

// ---------------- 收藏 ----------------
function saveFavorites() { localStorage.setItem('jc_favorites', JSON.stringify(store.favorites)); }
function renderFavorites() {
  const box = $('#favorites-list');
  box.innerHTML = store.favorites.length ? '' : '<div class="muted">暂无收藏搭配</div>';
  store.favorites.forEach((f, i) => {
    const item = el('div', 'fav-item');
    item.append(el('span', 'fav-name', f.name));
    const apply = el('button', 'btn small', '应用');
    apply.onclick = () => replaceConfig(JSON.parse(JSON.stringify(f.config)));
    const del = el('button', 'btn small ghost', '删');
    del.onclick = () => { store.favorites.splice(i, 1); saveFavorites(); renderFavorites(); };
    item.append(apply, del);
    box.append(item);
  });
}

// ============================================================
// 页面:款式库
// ============================================================
let thumbViewport = null;
async function renderStyleThumbs() {
  const grid = $('#styles-grid');
  grid.innerHTML = '';
  const cat = $('#style-filter').value;
  const list = PRESETS.filter(p => cat === 'all' || p.cat === cat);
  if (!thumbViewport) {
    thumbViewport = new Viewport($('#thumb-canvas'));
    thumbViewport.camera.position.set(20, 14, 24);
  }
  for (const p of list) {
    const cfg = { ...defaultConfig(), ...p.config };
    const built = buildModel(cfg);
    thumbViewport.setModel(built.group);
    thumbViewport.setBackground('studio');
    thumbViewport.bokehPass.enabled = false;
    thumbViewport.frameModel();
    thumbViewport.resize();
    thumbViewport.composer.render();
    const url = thumbViewport.canvas.toDataURL('image/png');
    const card = el('div', 'style-card');
    card.append(el('img', '')); card.querySelector('img').src = url;
    card.append(el('div', 'style-name', p.name));
    card.append(el('div', 'style-cat', BASE_TYPES[p.cat].name + ' · ' + SETTING_TYPES[p.config.settingType].name));
    const btn = el('button', 'btn primary', '在工作台打开');
    btn.onclick = () => {
      replaceConfig({ ...defaultConfig(), ...JSON.parse(JSON.stringify(p.config)) });
      switchPage('workbench');
    };
    card.append(btn);
    grid.append(card);
  }
}

// ============================================================
// 页面:材质宝石库
// ============================================================
function renderMaterialsPage() {
  const mt = $('#metals-table tbody');
  mt.innerHTML = '';
  for (const [id, m] of Object.entries(METALS)) {
    const tr = el('tr');
    tr.innerHTML = `<td><span class="swatch" style="background:#${m.color.toString(16).padStart(6, '0')}"></span>${m.name}</td>
      <td>${m.density} g/cm³</td><td>¥${m.pricePerGram}/g</td><td>金属度 1.0 · 粗糙度 ${m.defaultRoughness}</td>`;
    const td = el('td'); const b = el('button', 'btn small', '用于当前款');
    b.onclick = () => { setConfig('metalType', id, true); setConfig('roughness', m.defaultRoughness, false); refreshWorkbenchControls(); switchPage('workbench'); };
    td.append(b); tr.append(td); mt.append(tr);
  }
  const gt = $('#gems-table tbody');
  gt.innerHTML = '';
  for (const [id, g] of Object.entries(GEMS)) {
    const tr = el('tr');
    tr.innerHTML = `<td><span class="swatch" style="background:#${g.attenuationColor.toString(16).padStart(6, '0')}"></span>${g.name}</td>
      <td>${g.ior}</td><td>${g.dispersion}</td><td>${g.density} g/cm³</td><td>¥${g.pricePerCarat.toLocaleString()}/ct</td>`;
    const td = el('td'); const b = el('button', 'btn small', '用于当前款');
    b.onclick = () => {
      setConfig('gemType', id, true);
      setConfig('gemIor', g.ior, false);
      setConfig('gemDispersion', g.dispersion, false);
      refreshWorkbenchControls(); switchPage('workbench');
    };
    td.append(b); tr.append(td); gt.append(tr);
  }
}

// ============================================================
// 页面:渲染出图
// ============================================================
const VIEWS = [
  { id: 'hero', name: '45° 主视角', dir: [0.75, 0.55, 1] },
  { id: 'front', name: '正面', dir: [0, 0.25, 1] },
  { id: 'side', name: '侧面', dir: [1, 0.2, 0.05] },
  { id: 'top', name: '俯视', dir: [0.02, 1, 0.02] },
];

async function batchRender() {
  const size = parseInt($('#render-size').value);
  const results = $('#render-results');
  results.innerHTML = '';
  const btn = $('#btn-render');
  btn.disabled = true; btn.textContent = '渲染中…';
  const bb = new THREE.Box3().setFromObject(currentBuilt.group);
  const center = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() / 2;
  for (const view of VIEWS) {
    const d = radius * (view.id === 'hero' ? 2.6 : 2.4);
    const dir = new THREE.Vector3(...view.dir).normalize();
    const pose = { position: center.clone().addScaledVector(dir, d), target: center.clone() };
    const still = viewport.renderStill(size, size, pose);
    const blob = await new Promise(r => still.toBlob(r, 'image/png'));
    const url = URL.createObjectURL(blob);
    const card = el('div', 'render-card');
    const img = el('img'); img.src = url;
    const cap = el('div', 'render-cap', `${view.name} · ${size}×${size}`);
    const dl = el('a', 'btn small', '下载 PNG');
    dl.href = url; dl.download = `${store.config.baseType}-${view.id}-${size}.png`;
    card.append(img, cap, dl);
    results.append(card);
  }
  btn.disabled = false; btn.textContent = '开始批量出图';
}

// 报价 PDF:整页画布绘制(中文无字体问题)→ jsPDF 导出
async function exportQuotePDF() {
  const order = collectOrderForm();
  const e = currentEstimate;
  const cfg = store.config;
  // 先渲一张产品图
  const bb = new THREE.Box3().setFromObject(currentBuilt.group);
  const center = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() / 2;
  const pose = { position: center.clone().addScaledVector(new THREE.Vector3(0.75, 0.55, 1).normalize(), radius * 2.6), target: center.clone() };
  const productImg = viewport.renderStill(900, 900, pose);

  const W = 1240, H = 1754;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1a1a2e'; x.fillRect(0, 0, W, 130);
  x.fillStyle = '#d4af37'; x.font = 'bold 52px "Microsoft YaHei", sans-serif';
  x.fillText('珠宝定制报价单', 60, 82);
  x.fillStyle = '#999'; x.font = '28px "Microsoft YaHei", sans-serif';
  x.fillText(new Date().toLocaleString('zh-CN'), W - 380, 82);

  // 产品图
  x.drawImage(productImg, 60, 170, 560, 560);
  x.strokeStyle = '#ddd'; x.strokeRect(60, 170, 560, 560);

  // 配置明细
  const rows = [
    ['首饰类型', BASE_TYPES[cfg.baseType].name],
    ['金属材质', `${METALS[cfg.metalType].name}(金属度 ${cfg.metalness},粗糙度 ${cfg.roughness})`],
    ['主石', `${GEMS[cfg.gemType].name} · ${GEM_SHAPES[cfg.gemShape].name} · ${cfg.gemSize}mm${cfg.gemShape !== 'round' ? ' ×' + cfg.gemAspect : ''}`],
    ['光学参数', `折射率 ${cfg.gemIor} · 色散 ${cfg.gemDispersion}`],
    ['镶嵌方式', SETTING_TYPES[cfg.settingType].name + (cfg.settingType !== 'bezel' ? ` · ${cfg.prongCount} 爪` : ` · 高 ${cfg.bezelHeight}mm`)],
  ];
  if (cfg.baseType === 'ring') rows.push(['指圈号', `港号 ${cfg.ringSize} · 戒臂 ${cfg.bandWidth}mm × ${cfg.bandThickness}mm`]);
  if (cfg.settingType === 'pave') rows.push(['配石', `${cfg.paveRows} 排 × ${cfg.pavePerRow} 颗 · ${cfg.paveStoneSize}mm`]);
  if (order.customer) rows.push(['客户', `${order.customer} ${order.phone}`]);

  x.fillStyle = '#333'; x.font = '30px "Microsoft YaHei", sans-serif';
  let y = 210;
  x.font = 'bold 34px "Microsoft YaHei", sans-serif';
  x.fillText('配置明细', 680, y); y += 24;
  x.font = '28px "Microsoft YaHei", sans-serif';
  for (const [k, v] of rows) {
    y += 52;
    x.fillStyle = '#888'; x.fillText(k, 680, y);
    x.fillStyle = '#222'; x.fillText(v, 830, y);
  }

  // 报价表
  y = 790;
  x.font = 'bold 34px "Microsoft YaHei", sans-serif';
  x.fillStyle = '#333'; x.fillText('报价明细', 60, y);
  const priceRows = [
    ['项目', '规格', '金额'],
    ['金属', `${e.metalName} · ${fmtNum(e.metalWeight)} g`, fmtMoney(e.metalPrice)],
    ['主石', `${e.gemName} · ${fmtNum(e.gemCarat)} ct`, fmtMoney(e.gemPrice)],
  ];
  if (e.meleeCount) priceRows.push(['配石', `${e.meleeCount} 颗 · ${fmtNum(e.meleeCarat)} ct`, fmtMoney(e.meleePrice)]);
  priceRows.push(['工费', '镶嵌+制作', fmtMoney(e.labor)]);
  priceRows.push(['合计', '', fmtMoney(e.total)]);
  y += 20;
  for (let i = 0; i < priceRows.length; i++) {
    const [a, b, c] = priceRows[i];
    const isHead = i === 0, isTotal = i === priceRows.length - 1;
    y += 64;
    x.fillStyle = isHead ? '#1a1a2e' : (isTotal ? '#fdf6e3' : (i % 2 ? '#f7f7f9' : '#ffffff'));
    x.fillRect(60, y - 42, W - 120, 64);
    x.fillStyle = isHead ? '#fff' : '#222';
    x.font = (isHead || isTotal ? 'bold ' : '') + '30px "Microsoft YaHei", sans-serif';
    x.fillText(a, 90, y);
    x.fillText(b, 420, y);
    x.fillText(c, W - 320, y);
  }
  x.fillStyle = '#999'; x.font = '24px "Microsoft YaHei", sans-serif';
  x.fillText('* 报价为系统按金属重量与宝石参数自动估算,最终以门店确认为准。', 60, H - 80);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.save(`报价单-${order.customer || '客户'}-${Date.now()}.pdf`);
}

// ============================================================
// 页面:订单
// ============================================================
function collectOrderForm() {
  return {
    customer: $('#order-customer').value.trim(),
    phone: $('#order-phone').value.trim(),
    note: $('#order-note').value.trim(),
  };
}

function saveOrder() {
  const info = collectOrderForm();
  const thumb = viewport.renderStill(320, 320).toDataURL('image/png');
  const order = {
    id: 'D' + String(Date.now()).slice(-8),
    createdAt: new Date().toLocaleString('zh-CN'),
    ...info,
    config: JSON.parse(JSON.stringify(store.config)),
    estimate: JSON.parse(JSON.stringify(currentEstimate)),
    thumb,
  };
  store.orders.unshift(order);
  localStorage.setItem('jc_orders', JSON.stringify(store.orders));
  renderOrders();
  switchPage('orders');
}

function configSummary(c) {
  return `${BASE_TYPES[c.baseType].name} · ${METALS[c.metalType].name} · ${GEMS[c.gemType].name}${GEM_SHAPES[c.gemShape].name} · ${SETTING_TYPES[c.settingType].name}`;
}

function renderOrders() {
  const box = $('#orders-list');
  box.innerHTML = store.orders.length ? '' : '<div class="muted">暂无订单,在工作台或此处保存当前配置。</div>';
  for (const o of store.orders) {
    const card = el('div', 'order-card');
    const img = el('img'); img.src = o.thumb;
    const info = el('div', 'order-info');
    info.innerHTML = `<b>${o.id}</b> · ${o.createdAt} · ${o.customer || '未填客户'}<br>
      <span class="muted">${configSummary(o.config)}</span><br>
      金属 ${fmtNum(o.estimate.metalWeight)}g · 主石 ${fmtNum(o.estimate.gemCarat)}ct${o.estimate.meleeCount ? ` · 配石${o.estimate.meleeCount}颗` : ''} · <b class="gold">${fmtMoney(o.estimate.total)}</b>`;
    const ops = el('div', 'order-ops');
    const load = el('button', 'btn small', '载入工作台');
    load.onclick = () => {
      replaceConfig(JSON.parse(JSON.stringify(o.config)));
      switchPage('workbench');
    };
    const exp = el('button', 'btn small ghost', '导出JSON');
    exp.onclick = () => {
      const blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
      const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `${o.id}.json`; a.click();
    };
    const del = el('button', 'btn small ghost', '删除');
    del.onclick = () => {
      store.orders = store.orders.filter(x => x.id !== o.id);
      localStorage.setItem('jc_orders', JSON.stringify(store.orders));
      renderOrders();
    };
    ops.append(load, exp, del);
    card.append(img, info, ops);
    box.append(card);
  }
}

function exportOrdersCSV() {
  const head = '订单号,时间,客户,电话,类型,金属,主石,切工,镶嵌,金属重(g),主石(ct),配石数,总价(元)\n';
  const lines = store.orders.map(o => [
    o.id, o.createdAt, o.customer, o.phone,
    BASE_TYPES[o.config.baseType].name, METALS[o.config.metalType].name,
    GEMS[o.config.gemType].name, GEM_SHAPES[o.config.gemShape].name, SETTING_TYPES[o.config.settingType].name,
    fmtNum(o.estimate.metalWeight), fmtNum(o.estimate.gemCarat), o.estimate.meleeCount, Math.round(o.estimate.total),
  ].join(','));
  const blob = new Blob(['﻿' + head + lines.join('\n')], { type: 'text/csv' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'orders.csv'; a.click();
}

// ============================================================
// 路由与启动
// ============================================================
const PAGES = ['styles', 'workbench', 'materials', 'render', 'orders'];
function switchPage(id) {
  for (const p of PAGES) {
    $('#page-' + p).classList.toggle('active', p === id);
    $('#nav-' + p).classList.toggle('active', p === id);
  }
  if (id === 'workbench') { viewport.resize(); if (store.compareOn && viewportB) viewportB.resize(); }
  if (id === 'styles') renderStyleThumbs();
  if (id === 'materials') renderMaterialsPage();
  if (id === 'orders') renderOrders();
}

function boot() {
  viewport = new Viewport($('#viewport'));
  window.__vp = viewport; // 调试钩子
  window.__store = store;
  window.__setCfg = (k, v, commit = false) => { setConfig(k, v, commit); refreshWorkbenchControls(); };
  viewport.start();
  buildWorkbenchPanel();
  rebuild();
  updateHistoryButtons();
  renderFavorites();

  for (const p of PAGES) $('#nav-' + p).onclick = () => switchPage(p);
  $('#style-filter').onchange = renderStyleThumbs;
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  });
  $('#btn-compare').onclick = () => toggleCompare(!store.compareOn);
  $('#btn-sync-compare').onclick = () => { store.compare = JSON.parse(JSON.stringify(store.config)); rebuildCompare(); };
  $('#btn-favorite').onclick = () => {
    const name = prompt('搭配名称', `${METALS[store.config.metalType].name}+${GEMS[store.config.gemType].name}`);
    if (!name) return;
    store.favorites.push({ name, config: JSON.parse(JSON.stringify(store.config)) });
    saveFavorites(); renderFavorites();
  };
  $('#btn-save-order').onclick = saveOrder;
  $('#btn-save-order2').onclick = saveOrder;
  $('#btn-render').onclick = batchRender;
  $('#btn-pdf').onclick = exportQuotePDF;
  $('#btn-export-csv').onclick = exportOrdersCSV;
  $('#btn-rebake').onclick = () => scheduleCaustics();
  $('#render-bg').onchange = (e) => { setConfig('background', e.target.value, true); refreshWorkbenchControls(); };
  switchPage('workbench');
}

boot();
