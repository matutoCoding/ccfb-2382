// ============================================================
// 报价引擎:金属重量 / 主石克拉 / 配石数量 / 工费 → 总价
// ============================================================
import { METALS, GEMS, LABOR } from './config.js';

/**
 * @param cfg     当前配置
 * @param built   buildJewelry 返回的 { metalVolume, gemVolume, paveInfo }
 * @param prices  可选覆盖单价 { metalPerGram, gemPerCarat }
 */
export function estimate(cfg, built, prices = {}) {
  const metal = METALS[cfg.metalType];
  const gem = GEMS[cfg.gemType];

  // 金属:体积 mm³ → cm³ → g
  const metalWeight = built.metalVolume / 1000 * metal.density;
  const metalPrice = metalWeight * (prices.metalPerGram ?? metal.pricePerGram);

  // 主石:体积 mm³ → cm³ → g → 克拉(1ct = 0.2g)
  const gemCarat = built.gemVolume / 1000 * gem.density / 0.2;
  const gemPrice = gemCarat * (prices.gemPerCarat ?? gem.pricePerCarat);

  // 配石(钉镶小钻,按钻石比重)
  let meleeCount = 0, meleeCarat = 0, meleePrice = 0;
  if (cfg.settingType === 'pave' && built.paveInfo) {
    meleeCount = built.paveInfo.count;
    // 小圆钻体积 ≈ 直径³ × 0.55(经验)
    const vEach = Math.pow(cfg.paveStoneSize, 3) * 0.55; // mm³
    meleeCarat = vEach / 1000 * 3.52 / 0.2 * meleeCount;
    meleePrice = meleeCarat * (prices.meleePerCarat ?? 12000);
  }

  // 工费
  const labor = LABOR.base[cfg.baseType] + LABOR.setting[cfg.settingType]
    + (cfg.settingType === 'pave' ? meleeCount * LABOR.pavePerStone : 0);

  const total = metalPrice + gemPrice + meleePrice + labor;
  return {
    metalWeight, metalPrice,
    gemCarat, gemPrice,
    meleeCount, meleeCarat, meleePrice,
    labor, total,
    metalName: metal.name, gemName: gem.name,
  };
}

export function fmtMoney(n) {
  return '¥' + Math.round(n).toLocaleString('zh-CN');
}
export function fmtNum(n, digits = 2) {
  return Number(n).toFixed(digits);
}
