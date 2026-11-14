// ============================================================
// PBR 材质:金属(可调金属度/粗糙度)+ 宝石(折射率/色散/体吸收)
// ============================================================
import * as THREE from 'three';
import { METALS, GEMS } from './config.js';

export function makeMetalMaterial(cfg) {
  const preset = METALS[cfg.metalType];
  const mat = new THREE.MeshPhysicalMaterial({
    color: preset.color,
    metalness: cfg.metalness,
    roughness: cfg.roughness,
    envMapIntensity: 1.1,
    clearcoat: 0.25,           // 抛光清漆层
    clearcoatRoughness: 0.06,
  });
  return mat;
}

export function makeGemMaterial(cfg) {
  const preset = GEMS[cfg.gemType];
  const mat = new THREE.MeshPhysicalMaterial({
    color: preset.color,
    metalness: 0,
    roughness: 0.015,
    transmission: 1.0,          // 真实折射(非贴图)
    ior: cfg.gemIor,
    dispersion: cfg.gemDispersion, // 物理色散(r160+ 物理材质特性)
    thickness: cfg.gemSize * 0.9,  // 体吸收路径长度
    attenuationColor: preset.attenuationColor,
    attenuationDistance: preset.attenuationDistance,
    specularIntensity: 1.0,
    envMapIntensity: 1.8,
    clearcoat: 0,
    side: THREE.FrontSide,
  });
  return mat;
}

// 小配石用简化宝石材质(共享,避免过多透射材质拖慢渲染)
export function makeMeleeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.92,
    ior: 2.417,
    dispersion: 0.03,
    thickness: 1.2,
    envMapIntensity: 2.0,
  });
}

export const METAL_LIST = Object.entries(METALS).map(([id, m]) => ({ id, ...m }));
export const GEM_LIST = Object.entries(GEMS).map(([id, g]) => ({ id, ...g }));
