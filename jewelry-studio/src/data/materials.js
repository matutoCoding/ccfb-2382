// 材质 / 宝石物理参数库
// 单位: 密度 g/cm³; 长度单位 mm; 价格为门店参考价(可在订单页调整)

export const METALS = [
  {
    id: 'pt950', name: 'PT950 铂金', short: '铂金',
    color: 0xe8e9ee, metalness: 1.0, roughness: 0.16,
    density: 20.1, pricePerGram: 580,
    note: '铂950，洁白耐磨，不易氧化'
  },
  {
    id: 'au750-yellow', name: '18K 黄金', short: '黄金',
    color: 0xffc96b, metalness: 1.0, roughness: 0.18,
    density: 16.5, pricePerGram: 460,
    note: 'Au750 黄色金，硬度高适合镶爪'
  },
  {
    id: 'au750-rose', name: '18K 玫瑰金', short: '玫瑰金',
    color: 0xe8a48c, metalness: 1.0, roughness: 0.2,
    density: 15.9, pricePerGram: 450,
    note: '铜金合金，暖粉调'
  },
  {
    id: 'au750-white', name: '18K 白金', short: '白金',
    color: 0xdfe3ea, metalness: 1.0, roughness: 0.17,
    density: 16.7, pricePerGram: 440,
    note: 'Au750 白色金，电镀铑层'
  },
  {
    id: 's925', name: 'S925 银', short: '银',
    color: 0xd7dae0, metalness: 1.0, roughness: 0.24,
    density: 10.36, pricePerGram: 22,
    note: '925 纯银，性价比基础款'
  }
];

export const GEMS = [
  {
    id: 'diamond', name: '钻石', short: '钻',
    color: 0xffffff, ior: 2.417, dispersion: 0.044,
    density: 3.52, pricePerCarat: 68000,
    transmission: 1.0, attenuationColor: 0xffffff, attenuationDistance: 80,
    note: '折射率 2.42，色散 0.044，标准圆钻明亮切工'
  },
  {
    id: 'ruby', name: '红宝石', short: '红宝',
    color: 0xc0182c, ior: 1.765, dispersion: 0.018,
    density: 4.0, pricePerCarat: 12000,
    transmission: 0.92, attenuationColor: 0x9b0f22, attenuationDistance: 6,
    note: '铬致色，强荧光感'
  },
  {
    id: 'sapphire', name: '蓝宝石', short: '蓝宝',
    color: 0x1c3fa0, ior: 1.768, dispersion: 0.018,
    density: 4.0, pricePerCarat: 9800,
    transmission: 0.92, attenuationColor: 0x122c78, attenuationDistance: 7,
    note: '刚玉族，皇家蓝色散清晰'
  },
  {
    id: 'emerald', name: '祖母绿', short: '祖母绿',
    color: 0x1fa06a, ior: 1.576, dispersion: 0.014,
    density: 2.72, pricePerCarat: 8600,
    transmission: 0.9, attenuationColor: 0x0f6e45, attenuationDistance: 8,
    note: '绿柱石，阶梯刻面（祖母绿切）'
  },
  {
    id: 'amethyst', name: '紫水晶', short: '紫晶',
    color: 0x8a5cc8, ior: 1.544, dispersion: 0.013,
    density: 2.65, pricePerCarat: 320,
    transmission: 0.94, attenuationColor: 0x5e34a0, attenuationDistance: 12,
    note: '石英族，二月生辰石'
  },
  {
    id: 'citrine', name: '黄水晶', short: '黄晶',
    color: 0xe8b545, ior: 1.544, dispersion: 0.013,
    density: 2.65, pricePerCarat: 260,
    transmission: 0.94, attenuationColor: 0xb8801e, attenuationDistance: 14,
    note: '暖黄通透，十一月生辰石'
  },
  {
    id: 'aquamarine', name: '海蓝宝', short: '海蓝',
    color: 0x7fc4dd, ior: 1.577, dispersion: 0.014,
    density: 2.72, pricePerCarat: 680,
    transmission: 0.95, attenuationColor: 0x3f8fb0, attenuationDistance: 18,
    note: '浅海蓝，干净高透'
  },
  {
    id: 'garnet', name: '石榴石', short: '石榴',
    color: 0x8e1f33, ior: 1.76, dispersion: 0.027,
    density: 3.95, pricePerCarat: 480,
    transmission: 0.9, attenuationColor: 0x6a1224, attenuationDistance: 9,
    note: '高色散火彩强，酒红色'
  },
  {
    id: 'peridot', name: '橄榄石', short: '橄榄',
    color: 0x9bc14a, ior: 1.654, dispersion: 0.02,
    density: 3.34, pricePerCarat: 380,
    transmission: 0.93, attenuationColor: 0x6e9426, attenuationDistance: 12,
    note: '八月生辰石，橄榄绿'
  }
];

export const GEM_CUTS = [
  { id: 'round', name: '圆形明亮切', short: '圆' },
  { id: 'oval', name: '椭圆明亮切', short: '椭' },
  { id: 'emerald', name: '祖母绿阶梯切', short: '祖母绿切' }
];

export const SETTINGS = [
  { id: 'prong', name: '爪镶', short: '爪', minCount: 3, maxCount: 8, fee: 120, note: '经典透光，火彩最好' },
  { id: 'pave', name: '钉镶（密钉）', short: '钉', minCount: 4, maxCount: 24, fee: 260, note: '小珠固定，群镶密铺' },
  { id: 'bezel', name: '包镶', short: '包', minCount: 1, maxCount: 1, fee: 180, note: '金属围边，稳妥护石' }
];

export function metalById(id) { return METALS.find(m => m.id === id) || METALS[0]; }
export function gemById(id) { return GEMS.find(g => g.id === id) || GEMS[0]; }
export function cutById(id) { return GEM_CUTS.find(c => c.id === id) || GEM_CUTS[0]; }
export function settingById(id) { return SETTINGS.find(s => s.id === id) || SETTINGS[0]; }

// 香港圈号 → 内径(mm)，查表+线性插值（港度 6~26 号）
// 对照: 10号≈14.9mm, 15号≈17.3mm, 20号≈19.7mm
const HK_RING = [
  [6, 13.1], [7, 13.5], [8, 13.9], [9, 14.3], [10, 14.9],
  [11, 15.3], [12, 15.7], [13, 16.1], [14, 16.7], [15, 17.3],
  [16, 17.7], [17, 18.1], [18, 18.5], [19, 19.1], [20, 19.7],
  [21, 20.1], [22, 20.5], [23, 20.9], [24, 21.5], [25, 22.1], [26, 22.7]
];
export function hkRingDiameter(size) {
  if (size <= HK_RING[0][0]) return HK_RING[0][1];
  if (size >= HK_RING[HK_RING.length - 1][0]) return HK_RING[HK_RING.length - 1][1];
  for (let i = 0; i < HK_RING.length - 1; i++) {
    const [s0, d0] = HK_RING[i], [s1, d1] = HK_RING[i + 1];
    if (size >= s0 && size <= s1) return d0 + (d1 - d0) * (size - s0) / (s1 - s0);
  }
  return 17.3;
}
