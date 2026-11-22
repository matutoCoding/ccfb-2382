// Three 物理材质工厂
import * as THREE from 'three';
import { metalById, gemById } from '../data/materials.js';

export function createMetalMaterial(config) {
  const m = metalById(config.metalId);
  const mat = new THREE.MeshPhysicalMaterial({
    color: m.color,
    metalness: config.metalness,
    roughness: config.roughness,
    envMapIntensity: 1.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.18
  });
  return mat;
}

export function createGemMaterial(config) {
  const g = gemById(config.gemId);
  const base = new THREE.Color(g.color);
  const mat = new THREE.MeshPhysicalMaterial({
    color: base,
    metalness: 0,
    roughness: 0.02,
    transmission: g.transmission,          // 物理透射
    ior: g.ior,                            // 真实折射率
    thickness: config.gemHeight * 2.2,
    attenuationColor: new THREE.Color(g.attenuationColor),
    attenuationDistance: g.attenuationDistance,
    dispersion: g.dispersion,              // r172 物理色散(Abbe 反算项)
    envMapIntensity: 1.7,
    clearcoat: 1,
    clearcoatRoughness: 0,
    specularIntensity: 1,
    specularColor: 0xffffff,
    emissive: base.clone().multiplyScalar(0.06), // 极弱自发光, 避免暗角度死黑
    flatShading: true                            // 强制逐刻面平面着色, 凸显刻面几何
  });
  return mat;
}
