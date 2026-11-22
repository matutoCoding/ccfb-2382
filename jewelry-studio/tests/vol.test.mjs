import * as THREE from 'three';
import { geometryVolumeMm3, createGemGeometry } from '../src/three/gemGeometry.js';

const sphere = new THREE.SphereGeometry(1, 32, 24);
const box = new THREE.BoxGeometry(2, 2, 2);
const torus = new THREE.TorusGeometry(9, 0.8, 20, 96);
const cyl = new THREE.CylinderGeometry(0.74, 0.74, 10, 14);
console.log('sphere r1 (期望 4.189):', geometryVolumeMm3(sphere).toFixed(3));
console.log('box 2 (期望 8):', geometryVolumeMm3(box).toFixed(3));
console.log('torus R9 r0.8 (期望 2π²Rr²≈113.7):', geometryVolumeMm3(torus).toFixed(2));
console.log('cyl r.74 h10 (期望 17.20):', geometryVolumeMm3(cyl).toFixed(2));
const gem = createGemGeometry('round', 6.5, 4);
const coneApprox = Math.PI * Math.pow(3.25, 2) * 4 / 3; // 近似双锥
console.log('round 6.5mm 宝石体积:', geometryVolumeMm3(gem).toFixed(2), '近似双锥参考:', coneApprox.toFixed(2));
const em = createGemGeometry('emerald', 6.5, 4);
console.log('emerald 体积:', geometryVolumeMm3(em).toFixed(2));
