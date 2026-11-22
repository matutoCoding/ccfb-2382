// 全局状态: 款式库 / 配置历史 / 收藏 / 订单, localStorage 持久化
import { hkRingDiameter, metalById, gemById, settingById } from '../data/materials.js';

const LS = {
  history: 'js_history_v1',
  favorites: 'js_favorites_v1',
  orders: 'js_orders_v1',
  prices: 'js_prices_v1'
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---------- 默认配置 ----------
export function defaultConfig(over = {}) {
  return {
    // 款式
    category: 'ring',          // ring | pendant | earring
    styleId: 'solitaire',      // 款式库 id
    // 金属
    metalId: 'pt950',
    metalness: 1.0,
    roughness: 0.16,
    bandThickness: 1.6,        // 金属壁厚 mm
    ringSize: 13,              // 港度圈号
    // 主石
    gemId: 'diamond',
    gemCut: 'round',           // round | oval | emerald
    gemSize: 6.5,              // 主石直径/宽度 mm
    gemHeight: 4.0,            // 亭深 mm (由切工自动给默认, 可调)
    // 镶口
    setting: 'prong',          // prong | pave | bezel
    prongCount: 4,             // 爪数 / 钉数 / 包镶忽略
    halo: false,               // 围石群镶
    haloCount: 12,
    // 吊坠/耳饰
    bailSize: 4.0,             // 吊咀口径
    earringStyle: 'stud',      // stud 耳钉 | drop 耳坠
    // 渲染偏好
    env: 'studio',             // studio | white
    dof: true,
    bloom: true,
    caustics: true,
    ...over
  };
}

// ---------- 款式库 ----------
export const CATALOG = [
  {
    id: 'solitaire', category: 'ring', name: '经典六爪单钻戒',
    desc: '皇冠六爪抬高主石，360° 透光，订婚戒基础款。',
    config: { styleId: 'solitaire', setting: 'prong', prongCount: 6, gemSize: 6.5 }
  },
  {
    id: 'halo-ring', category: 'ring', name: '围钻光环戒',
    desc: '主石外圈密钉群镶，视觉放大一倍，火彩叠加。',
    config: { styleId: 'halo-ring', setting: 'pave', prongCount: 8, halo: true, haloCount: 14, gemSize: 5.5 }
  },
  {
    id: 'bezel-ring', category: 'ring', name: '全包护石戒',
    desc: '金属包边完整裹住腰棱，日常佩戴最稳妥，现代简约。',
    config: { styleId: 'bezel-ring', setting: 'bezel', gemSize: 6.0 }
  },
  {
    id: 'three-stone', category: 'ring', name: '三生石戒指',
    desc: '主石两侧各一颗副石，爪镶贴合戒臂曲面，寓意过去现在未来。',
    config: { styleId: 'three-stone', setting: 'prong', prongCount: 4, gemSize: 5.2 }
  },
  {
    id: 'solitaire-pendant', category: 'pendant', name: '单石吊坠',
    desc: '四爪主石配锥形吊咀，配链即戴，主石火彩完整呈现。',
    config: { category: 'pendant', styleId: 'solitaire-pendant', setting: 'prong', prongCount: 4, gemSize: 7.0, bailSize: 4.2 }
  },
  {
    id: 'halo-pendant', category: 'pendant', name: '光环吊坠',
    desc: '围石放大主石，包镶外圈加钉镶碎钻，晚宴款。',
    config: { category: 'pendant', styleId: 'halo-pendant', setting: 'bezel', halo: true, haloCount: 16, gemSize: 6.0, bailSize: 4.0 }
  },
  {
    id: 'emerald-pendant', category: 'pendant', name: '祖母绿切吊坠',
    desc: '阶梯刻面长方主石，两端爪镶，复古 Art Deco 风格。',
    config: { category: 'pendant', styleId: 'emerald-pendant', gemId: 'emerald', gemCut: 'emerald', setting: 'prong', prongCount: 4, gemSize: 6.5, bailSize: 4.0 }
  },
  {
    id: 'stud-earring', category: 'earring', name: '四爪耳钉（一对）',
    desc: '经典四爪圆石耳钉，左右对称成对出图，耳针可换。',
    config: { category: 'earring', styleId: 'stud-earring', earringStyle: 'stud', setting: 'prong', prongCount: 4, gemSize: 5.0 }
  },
  {
    id: 'drop-earring', category: 'earring', name: '包镶耳坠（一对）',
    desc: '上钉下坠结构，水滴动线，包镶主石随步轻摇。',
    config: { category: 'earring', styleId: 'drop-earring', earringStyle: 'drop', setting: 'bezel', gemSize: 6.0 }
  }
];

export function catalogById(id) { return CATALOG.find(c => c.id === id) || CATALOG[0]; }

// ---------- 简易事件总线 ----------
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(name, payload) { listeners.forEach(fn => fn(name, payload)); }

// ---------- 配置历史(回退/重做) ----------
let history = load(LS.history, { stack: [], index: -1, cap: 40 });
export function getHistory() { return history; }
export function pushHistory(config) {
  const snap = JSON.parse(JSON.stringify(config));
  // 丢掉 index 之后的分支
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(snap);
  if (history.stack.length > history.cap) history.stack.shift();
  history.index = history.stack.length - 1;
  save(LS.history, history);
  emit('history');
}
export function undo() {
  if (history.index <= 0) return null;
  history.index--;
  save(LS.history, history); emit('history');
  return JSON.parse(JSON.stringify(history.stack[history.index]));
}
export function redo() {
  if (history.index >= history.stack.length - 1) return null;
  history.index++;
  save(LS.history, history); emit('history');
  return JSON.parse(JSON.stringify(history.stack[history.index]));
}
export function canUndo() { return history.index > 0; }
export function canRedo() { return history.index < history.stack.length - 1; }
export function historyList() { return history.stack.map((s, i) => ({ index: i, current: i === history.index, config: s })); }
export function jumpHistory(i) {
  if (i < 0 || i >= history.stack.length) return null;
  history.index = i; save(LS.history, history); emit('history');
  return JSON.parse(JSON.stringify(history.stack[i]));
}

// ---------- 收藏搭配 ----------
export function getFavorites() { return load(LS.favorites, []); }
export function addFavorite(config, label) {
  const list = getFavorites();
  const item = { id: 'fav_' + Date.now(), label: label || '收藏搭配', at: new Date().toLocaleString('zh-CN'), config: JSON.parse(JSON.stringify(config)) };
  list.unshift(item); save(LS.favorites, list); emit('favorites'); return item;
}
export function removeFavorite(id) {
  save(LS.favorites, getFavorites().filter(f => f.id !== id)); emit('favorites');
}

// ---------- 订单 ----------
export function getOrders() { return load(LS.orders, []); }
export function saveOrder(order) {
  const list = getOrders();
  if (order.id) {
    const i = list.findIndex(o => o.id === order.id);
    if (i >= 0) list[i] = order; else list.unshift(order);
  } else {
    order.id = 'ORD' + Date.now().toString().slice(-8);
    order.createdAt = new Date().toLocaleString('zh-CN');
    list.unshift(order);
  }
  save(LS.orders, list); emit('orders'); return order;
}
export function deleteOrder(id) { save(LS.orders, getOrders().filter(o => o.id !== id)); emit('orders'); }

// ---------- 门店参考价覆盖 ----------
export function getPriceOverrides() { return load(LS.prices, {}); }
export function setPriceOverrides(o) { save(LS.prices, o); emit('prices'); }

// ---------- 报价计算 ----------
// 几何体积由渲染器实测传入 (mm³); 这里给重量/克拉/总价
export function estimateQuote(config, measured) {
  const metal = metalById(config.metalId);
  const gem = gemById(config.gemId);
  const setting = settingById(config.setting);
  const overrides = getPriceOverrides();
  const metalPrice = overrides[metal.id] ?? metal.pricePerGram;
  const gemPrice = overrides[gem.id] ?? gem.pricePerCarat;

  // 金属: 实测体积 mm³ → cm³ (÷1000) × 密度
  const metalVolumeCm3 = (measured.metalVolumeMm3 || 0) / 1000;
  const metalWeightG = metalVolumeCm3 * metal.density;
  const metalCost = metalWeightG * metalPrice;

  // 主石: 克拉 = 体积(mm³)/1000 × 密度 / 0.2
  const gemVolumeCm3 = (measured.gemVolumeMm3 || 0) / 1000;
  const mainCarat = gemVolumeCm3 * gem.density / 0.2;
  const mainCost = mainCarat * gemPrice;

  // 副石(围石+三生石), 统一按 1.2mm 碎钻计
  let sideCount = 0;
  if (config.halo) sideCount += config.haloCount;
  if (config.styleId === 'three-stone') sideCount += 2;
  if (config.category === 'earring') sideCount *= 2;
  const sideCaratEach = 0.012;
  const sideCarat = sideCount * sideCaratEach;
  const sideCost = sideCarat * (overrides.diamond ?? 68000);

  // 工费
  const settingFee = setting.fee + (config.setting === 'pave' ? config.prongCount * 8 : 0);
  const craftFee = settingFee + (config.category === 'earring' ? 100 : 0) + (config.halo ? 150 : 0);

  const total = metalCost + mainCost + sideCost + craftFee;
  return {
    metal: { name: metal.name, weightG: metalWeightG, volumeMm3: measured.metalVolumeMm3, pricePerGram: metalPrice, cost: metalCost },
    mainGem: { name: gem.name, cut: config.gemCut, carat: mainCarat, pricePerCarat: gemPrice, cost: mainCost },
    sideGems: { count: sideCount, carat: sideCarat, cost: sideCost },
    craftFee,
    total
  };
}

export { hkRingDiameter };
