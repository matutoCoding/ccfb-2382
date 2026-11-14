// ============================================================
// 全局常量:金属 / 宝石 / 价格 / 默认配置
// ============================================================

export const METALS = {
  pt950: {
    name: '铂金 Pt950',
    color: 0xe9e9ec,
    density: 21.45,        // g/cm³
    pricePerGram: 260,     // 元/g(可在订单页调整)
    defaultRoughness: 0.10,
  },
  gold18k: {
    name: '黄金 18K',
    color: 0xf3c15c,
    density: 15.6,
    pricePerGram: 560,
    defaultRoughness: 0.08,
  },
  rose18k: {
    name: '玫瑰金 18K',
    color: 0xe3a88f,
    density: 15.2,
    pricePerGram: 560,
    defaultRoughness: 0.08,
  },
};

// ior: 折射率 @589nm; dispersion: 色散强度; density: g/cm³;
// cauchyB: 柯西色散系数 B (nm²), n(λ)=ior + B*(1/λ² - 1/589²),由色散拟合
export const GEMS = {
  diamond: {
    name: '钻石', ior: 2.417, dispersion: 0.044, density: 3.52,
    color: 0xffffff, attenuationColor: 0xffffff, attenuationDistance: 40,
    pricePerCarat: 45000, cauchyB: 4600,
  },
  moissanite: {
    name: '莫桑钻', ior: 2.65, dispersion: 0.104, density: 3.22,
    color: 0xffffff, attenuationColor: 0xffffff, attenuationDistance: 40,
    pricePerCarat: 900, cauchyB: 11200,
  },
  ruby: {
    name: '红宝石', ior: 1.77, dispersion: 0.018, density: 4.0,
    color: 0xffffff, attenuationColor: 0xd40028, attenuationDistance: 5.5,
    pricePerCarat: 18000, cauchyB: 1900,
  },
  sapphire: {
    name: '蓝宝石', ior: 1.77, dispersion: 0.018, density: 4.0,
    color: 0xffffff, attenuationColor: 0x1a4fd6, attenuationDistance: 5.5,
    pricePerCarat: 9000, cauchyB: 1900,
  },
  emerald: {
    name: '祖母绿', ior: 1.58, dispersion: 0.014, density: 2.72,
    color: 0xffffff, attenuationColor: 0x0d8a4f, attenuationDistance: 6,
    pricePerCarat: 15000, cauchyB: 1500,
  },
  aquamarine: {
    name: '海蓝宝', ior: 1.577, dispersion: 0.014, density: 2.7,
    color: 0xffffff, attenuationColor: 0x7fc8e8, attenuationDistance: 8,
    pricePerCarat: 1800, cauchyB: 1500,
  },
  tanzanite: {
    name: '坦桑石', ior: 1.7, dispersion: 0.03, density: 3.35,
    color: 0xffffff, attenuationColor: 0x5a3fd4, attenuationDistance: 6,
    pricePerCarat: 4200, cauchyB: 3100,
  },
};

export const GEM_SHAPES = {
  round:   { name: '圆形明亮式' },
  oval:    { name: '椭圆形' },
  emerald: { name: '祖母绿切' },
};

export const SETTING_TYPES = {
  prong: { name: '爪镶' },
  bezel: { name: '包镶' },
  pave:  { name: '钉镶(配爪镶主石)' },
};

export const BASE_TYPES = {
  ring:     { name: '戒指' },
  pendant:  { name: '吊坠' },
  earring:  { name: '耳饰' },
};

// 港号 → 内周长 mm
export function ringSizeToCircumference(sizeHK) { return 40 + sizeHK; }
export function ringSizeToInnerRadius(sizeHK) { return (40 + sizeHK) / (2 * Math.PI); }

// 工费(元)
export const LABOR = {
  base: { ring: 380, pendant: 300, earring: 520 },
  setting: { prong: 120, bezel: 200, pave: 260 },
  pavePerStone: 15,
};

export function defaultConfig() {
  return {
    baseType: 'ring',
    // 基础参数
    ringSize: 13,          // 港号
    bandWidth: 2.2,        // mm 戒臂宽
    bandThickness: 1.4,    // mm 金属厚度
    // 主石
    gemShape: 'round',     // round | oval | emerald
    gemType: 'diamond',
    gemSize: 6.5,          // mm 直径(圆)/ 宽度(椭圆、祖母绿切)
    gemAspect: 1.35,       // 长宽比(椭圆、祖母绿切)
    gemIor: 2.417,
    gemDispersion: 0.044,
    // 镶口
    settingType: 'prong',  // prong | bezel | pave
    prongCount: 4,
    prongThickness: 0.7,   // mm
    bezelHeight: 1.6,      // mm
    paveRows: 1,
    pavePerRow: 7,
    paveStoneSize: 1.3,    // mm
    // 金属
    metalType: 'pt950',
    metalness: 1.0,
    roughness: 0.10,
    // 视口 / 渲染
    background: 'studio',  // studio | white
    bloom: 0.35,
    dof: true,
    caustics: true,
  };
}

// 款式库预设
export const PRESETS = [
  { id: 'ring-solitaire4', name: '经典四爪钻戒', cat: 'ring',
    config: { baseType: 'ring', settingType: 'prong', prongCount: 4, gemShape: 'round', gemType: 'diamond', gemSize: 6.5, metalType: 'pt950', bandWidth: 2.2, bandThickness: 1.4 } },
  { id: 'ring-six-prong', name: '六爪皇冠钻戒', cat: 'ring',
    config: { baseType: 'ring', settingType: 'prong', prongCount: 6, gemShape: 'round', gemType: 'diamond', gemSize: 6.5, metalType: 'gold18k', bandWidth: 2.0, bandThickness: 1.35 } },
  { id: 'ring-pave', name: '钉镶排钻戒指', cat: 'ring',
    config: { baseType: 'ring', settingType: 'pave', prongCount: 4, gemShape: 'round', gemType: 'diamond', gemSize: 5.8, metalType: 'rose18k', paveRows: 2, pavePerRow: 8, bandWidth: 2.6, bandThickness: 1.5 } },
  { id: 'ring-emerald-bezel', name: '祖母绿切包镶戒', cat: 'ring',
    config: { baseType: 'ring', settingType: 'bezel', gemShape: 'emerald', gemType: 'emerald', gemSize: 6.0, gemAspect: 1.4, metalType: 'gold18k', bandWidth: 2.4, bandThickness: 1.5 } },
  { id: 'ring-oval-ruby', name: '椭圆红宝石戒指', cat: 'ring',
    config: { baseType: 'ring', settingType: 'prong', prongCount: 4, gemShape: 'oval', gemType: 'ruby', gemSize: 6.0, gemAspect: 1.35, metalType: 'rose18k', bandWidth: 2.2, bandThickness: 1.4 } },
  { id: 'pendant-solitaire', name: '单钻吊坠', cat: 'pendant',
    config: { baseType: 'pendant', settingType: 'prong', prongCount: 4, gemShape: 'round', gemType: 'diamond', gemSize: 6.0, metalType: 'pt950' } },
  { id: 'pendant-sapphire', name: '蓝宝石包镶吊坠', cat: 'pendant',
    config: { baseType: 'pendant', settingType: 'bezel', gemShape: 'oval', gemType: 'sapphire', gemSize: 6.0, gemAspect: 1.3, metalType: 'pt950' } },
  { id: 'earring-stud', name: '四爪钻石耳钉', cat: 'earring',
    config: { baseType: 'earring', settingType: 'prong', prongCount: 4, gemShape: 'round', gemType: 'diamond', gemSize: 5.0, metalType: 'gold18k' } },
  { id: 'earring-emerald', name: '祖母绿耳钉', cat: 'earring',
    config: { baseType: 'earring', settingType: 'bezel', gemShape: 'emerald', gemType: 'emerald', gemSize: 4.5, gemAspect: 1.35, metalType: 'gold18k' } },
];
