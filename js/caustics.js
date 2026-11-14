// ============================================================
// 光谱光子焦散烘焙器
// 对真实刻面网格做波长相关折射率(柯西公式)的光子追迹:
// 斯涅尔折射 + 菲涅尔反射 + 全内反射 + 比尔-朗伯体吸收,
// 光子落地面累积成光谱能量图 —— 完全由几何与物理参数算出,非贴图。
// ============================================================
import * as THREE from 'three';

// 波长(nm) → 线性 RGB(Bruton 近似)
function wavelengthToRGB(w) {
  let r = 0, g = 0, b = 0;
  if (w < 440) { r = (440 - w) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = (510 - w) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = (645 - w) / 65; }
  else { r = 1; }
  // 两端衰减
  let f = 1;
  if (w < 420) f = 0.3 + 0.7 * (w - 380) / 40;
  else if (w > 680) f = 0.3 + 0.7 * (720 - w) / 40;
  return [r * f, g * f, b * f];
}

// 柯西色散:n(λ) = nD + B·(1/λ² − 1/λD²),λ 单位 nm
function iorAt(nD, B, lambda) {
  return nD + B * (1 / (lambda * lambda) - 1 / (589 * 589));
}

// 非偏振菲涅尔反射率
function fresnel(n1, n2, cosI) {
  const sinT2 = (n1 / n2) * (n1 / n2) * (1 - cosI * cosI);
  if (sinT2 >= 1) return 1; // 全内反射
  const cosT = Math.sqrt(1 - sinT2);
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  return 0.5 * (rs * rs + rp * rp);
}

// Möller–Trumbore
function rayTri(ro, rd, a, b, c, out) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const px = rd[1] * e2z - rd[2] * e2y, py = rd[2] * e2x - rd[0] * e2z, pz = rd[0] * e2y - rd[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = ro[0] - a[0], ty = ro[1] - a[1], tz = ro[2] - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1.000001) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv;
  if (v < -1e-6 || u + v > 1.000001) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t < 1e-5) return -1;
  out[0] = t;
  // 几何法线(未归一)
  out[1] = e1y * e2z - e1z * e2y; out[2] = e1z * e2x - e1x * e2z; out[3] = e1x * e2y - e1y * e2x;
  return t;
}

// 从宝石网格提取世界空间三角形
function extractTris(mesh) {
  mesh.updateWorldMatrix(true, false);
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  const m = mesh.matrixWorld;
  const tris = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, i + k).applyMatrix4(m);
      tris.push(v.x, v.y, v.z);
    }
  }
  return tris;
}

/**
 * 烘焙焦散
 * @param gemMesh   主石 Mesh(世界变换已就绪)
 * @param lightDir  平行光方向(归一化,指向场景)
 * @param groundY   地面世界高度
 * @param gemDef    { ior, cauchyB, attenuationColor, attenuationDistance }
 * @param opts      { photons, resolution, patchSize, onProgress }
 * @returns HTMLCanvasElement(光谱能量图)
 */
export async function bakeCaustics(gemMesh, lightDir, groundY, gemDef, opts = {}) {
  const photons = opts.photons ?? 24000;
  const res = opts.resolution ?? 256;
  const meshes = Array.isArray(gemMesh) ? gemMesh : [gemMesh];
  const tris = new Float32Array(meshes.flatMap(m => extractTris(m)));
  const triCount = tris.length / 9;

  // 宝石包围球(世界)
  const bb = new THREE.Box3();
  for (const m of meshes) bb.expandByObject(m);
  const center = bb.getCenter(new THREE.Vector3());
  const radius = bb.getSize(new THREE.Vector3()).length() / 2;
  const patch = opts.patchSize ?? radius * 5;

  // 入射光子平面:垂直于光方向,覆盖宝石
  const L = lightDir.clone().normalize();
  const up = Math.abs(L.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(L, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, L).normalize();
  const startCenter = center.clone().addScaledVector(L, -radius * 2.5);

  // 体吸收系数(比尔-朗伯)
  const ac = new THREE.Color(gemDef.attenuationColor ?? 0xffffff);
  const ad = gemDef.attenuationDistance ?? 1e9;
  const sigma = [
    ac.r >= 0.999 ? 0 : -Math.log(Math.max(ac.r, 1e-3)) / ad,
    ac.g >= 0.999 ? 0 : -Math.log(Math.max(ac.g, 1e-3)) / ad,
    ac.b >= 0.999 ? 0 : -Math.log(Math.max(ac.b, 1e-3)) / ad,
  ];

  const accR = new Float32Array(res * res);
  const accG = new Float32Array(res * res);
  const accB = new Float32Array(res * res);

  const ro = [0, 0, 0], rd = [0, 0, 0], hit = [0, 0, 0, 0];
  const nD = gemDef.ior, B = gemDef.cauchyB ?? 0;
  const EPS = 1e-4;

  const traceOne = () => {
    const lambda = 380 + Math.random() * 340;
    const nG = iorAt(nD, B, lambda);
    const [wr, wg, wb] = wavelengthToRGB(lambda);
    // 圆盘均匀采样
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * radius * 1.15;
    const sx = startCenter.x + u.x * Math.cos(a) * rr + v.x * Math.sin(a) * rr;
    const sy = startCenter.y + u.y * Math.cos(a) * rr + v.y * Math.sin(a) * rr;
    const sz = startCenter.z + u.z * Math.cos(a) * rr + v.z * Math.sin(a) * rr;
    ro[0] = sx; ro[1] = sy; ro[2] = sz;
    rd[0] = L.x; rd[1] = L.y; rd[2] = L.z;
    let thr = 1, thrG = 1, thrB = 1; // 光谱吞吐量(体吸收)
    let interacted = false;

    for (let bounce = 0; bounce < 6; bounce++) {
      // 最近三角形
      let bestT = Infinity, bi = -1;
      for (let i = 0; i < triCount; i++) {
        const t = rayTri(ro, rd, tris.subarray(i * 9, i * 9 + 3), tris.subarray(i * 9 + 3, i * 9 + 6), tris.subarray(i * 9 + 6, i * 9 + 9), hit);
        if (t > 0 && t < bestT) { bestT = t; bi = i; }
      }
      // 地面求交
      let tGround = Infinity;
      if (rd[1] < -1e-6) tGround = (groundY - ro[1]) / rd[1];
      if (tGround > 0 && tGround < bestT) {
        if (interacted) {
          const hx = ro[0] + rd[0] * tGround, hz = ro[2] + rd[2] * tGround;
          const gx = Math.floor(((hx - center.x) / patch + 0.5) * res);
          const gz = Math.floor(((hz - center.z) / patch + 0.5) * res);
          if (gx >= 0 && gx < res && gz >= 0 && gz < res) {
            const idx = gz * res + gx;
            accR[idx] += wr * thr; accG[idx] += wg * thrG; accB[idx] += wb * thrB;
          }
        }
        return;
      }
      if (bi < 0) return; // 飞出场景
      interacted = true;
      // 命中点与法线
      const o = bi * 9;
      const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
      const e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az;
      const e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const px = ro[0] + rd[0] * bestT, py = ro[1] + rd[1] * bestT, pz = ro[2] + rd[2] * bestT;
      const cosI = -(rd[0] * nx + rd[1] * ny + rd[2] * nz);
      let n1, n2, fnx, fny, fnz;
      if (cosI > 0) { n1 = 1; n2 = nG; fnx = nx; fny = ny; fnz = nz; }        // 进入
      else { n1 = nG; n2 = 1; fnx = -nx; fny = -ny; fnz = -nz; }             // 射出
      const ci = Math.abs(cosI);
      const R = fresnel(n1, n2, ci);
      const eta = n1 / n2;
      const k = 1 - eta * eta * (1 - ci * ci);
      let dirX, dirY, dirZ;
      if (k < 0 || Math.random() < R) {
        // 反射 / 全内反射
        dirX = rd[0] + 2 * ci * fnx; dirY = rd[1] + 2 * ci * fny; dirZ = rd[2] + 2 * ci * fnz;
      } else {
        const t2 = eta * ci - Math.sqrt(k);
        dirX = eta * rd[0] + t2 * fnx; dirY = eta * rd[1] + t2 * fny; dirZ = eta * rd[2] + t2 * fnz;
      }
      // 体吸收(在宝石内部行进的距离)
      if (n1 === nG) {
        thr *= Math.exp(-sigma[0] * bestT);
        thrG *= Math.exp(-sigma[1] * bestT);
        thrB *= Math.exp(-sigma[2] * bestT);
        if (thr + thrG + thrB < 0.01) return;
      }
      const dl = Math.hypot(dirX, dirY, dirZ);
      ro[0] = px + dirX / dl * EPS; ro[1] = py + dirY / dl * EPS; ro[2] = pz + dirZ / dl * EPS;
      rd[0] = dirX / dl; rd[1] = dirY / dl; rd[2] = dirZ / dl;
    }
  };

  // 分块执行,保持 UI 响应
  const CHUNK = 3000;
  for (let done = 0; done < photons; done += CHUNK) {
    const end = Math.min(photons, done + CHUNK);
    for (let i = done; i < end; i++) traceOne();
    if (opts.onProgress) opts.onProgress(end / photons);
    await new Promise(r => setTimeout(r, 0));
  }

  // 色调映射 + 轻微高斯模糊 → 画布
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(res, res);
  const blur = (src) => {
    const dst = new Float32Array(src.length);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      let s = 0, wsum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= res || yy < 0 || yy >= res) continue;
        const w = dx === 0 && dy === 0 ? 4 : (dx !== 0 && dy !== 0 ? 1 : 2);
        s += src[yy * res + xx] * w; wsum += w;
      }
      dst[y * res + x] = s / wsum;
    }
    return dst;
  };
  let bR = blur(accR), bG = blur(accG), bB = blur(accB);
  bR = blur(bR); bG = blur(bG); bB = blur(bB);
  bR = blur(bR); bG = blur(bG); bB = blur(bB);
  // 自适应曝光
  let maxE = 1e-6;
  for (let i = 0; i < res * res; i++) maxE = Math.max(maxE, bR[i], bG[i], bB[i]);
  const exposure = 2.2 / maxE;
  for (let i = 0; i < res * res; i++) {
    const o = i * 4;
    img.data[o] = Math.min(255, 255 * (1 - Math.exp(-bR[i] * exposure)));
    img.data[o + 1] = Math.min(255, 255 * (1 - Math.exp(-bG[i] * exposure)));
    img.data[o + 2] = Math.min(255, 255 * (1 - Math.exp(-bB[i] * exposure)));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, patch, center };
}
