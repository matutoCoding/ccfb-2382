// 宝石刻面几何: 程序化生成真实多面体, 非索引 + 平面法线(flat shading)
// 三种切工: round 圆形明亮 / oval 椭圆明亮 / emerald 祖母绿阶梯
import * as THREE from 'three';

// ---------- 基础工具 ----------
function makeNonIndexed() {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  return {
    pos, tri,
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals(); // 非索引 → 每个面独立法线 = 刻面平面法线
      g.computeBoundingSphere();
      return g;
    }
  };
}

// 两环之间连面; offset=true 时下一环相对上环偏转半档 → 明亮切工三角刻面
function connectRings(b, ringA, ringB, twisted) {
  const n = ringA.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = ringA[i], a1 = ringA[j];
    const b0 = ringB[i], b1 = ringB[j];
    if (twisted) {
      b.tri(a0, b0, b1);
      b.tri(a0, b1, a1);
    } else {
      b.tri(a0, b0, b1);
      b.tri(a0, b1, a1);
    }
  }
}

function polarRing(n, r, z, phase = 0) {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    ring.push([Math.cos(t) * r, Math.sin(t) * r, z]);
  }
  return ring;
}

function capFan(b, center, ring, reverse = false) {
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    reverse ? b.tri(center, ring[j], ring[i]) : b.tri(center, ring[i], ring[j]);
  }
}

// ---------- 圆形 / 椭圆 明亮切工 ----------
function brilliantGeometry(radius, height, n = 16, ovalRatio = 1) {
  const b = makeNonIndexed();
  const H = height, R = radius, half = Math.PI / n;

  // 自顶向下各刻面环 (z 以几何中心为 0)
  const table   = polarRing(n, R * 0.56,  H * 0.30);
  const star    = polarRing(n, R * 0.76,  H * 0.20, half);   // 错位 → 三角刻面
  const girdleT = polarRing(n, R,          H * 0.03);
  const girdleB = polarRing(n, R * 0.995, -H * 0.03);
  const pavMid  = polarRing(n, R * 0.58,  -H * 0.30, half);
  const culet = [0, 0, -H * 0.46];
  const tableCenter = [0, 0, H * 0.30];

  capFan(b, tableCenter, table);                       // 台面
  connectRings(b, table, star, true);                  // 冠部星形刻面
  connectRings(b, star, girdleT, true);                // 冠部主刻面
  connectRings(b, girdleT, girdleB, false);            // 腰棱
  connectRings(b, girdleB, pavMid, true);              // 亭部上刻面
  capFan(b, culet, pavMid, true);                      // 亭尖汇聚

  const g = b.build();
  if (ovalRatio !== 1) g.scale(ovalRatio, 1, 1);
  g.computeBoundingSphere();
  return g;
}

// ---------- 祖母绿阶梯切 (八角轮廓, 平行阶梯刻面) ----------
function octagonRing(a, halfW, cut, z) {
  // 长轴 x, 短轴 y, 切角 cut
  const w = halfW;
  return [
    [ a - cut,  w, z], [ a,  w - cut, z], [ a, -w + cut, z], [ a - cut, -w, z],
    [-a + cut, -w, z], [-a, -w + cut, z], [-a,  w - cut, z], [-a + cut,  w, z]
  ];
}
function emeraldGeometry(length, width, height) {
  const b = makeNonIndexed();
  const a = length / 2, w = width / 2, H = height;
  const cut = Math.min(a, w) * 0.22;

  const table   = octagonRing(a * 0.64, w * 0.62, cut * 0.6, H * 0.28);
  const crown1  = octagonRing(a * 0.84, w * 0.82, cut * 0.8, H * 0.14);
  const girdleT = octagonRing(a, w, cut, H * 0.03);
  const girdleB = octagonRing(a * 0.995, w * 0.995, cut, -H * 0.03);
  const pav1    = octagonRing(a * 0.72, w * 0.70, cut * 0.7, -H * 0.18);
  const pav2    = octagonRing(a * 0.40, w * 0.36, cut * 0.4, -H * 0.40);

  capFan(b, [0, 0, H * 0.28], table);
  connectRings(b, table, crown1, false);    // 阶梯面: 不错位, 刻面互相平行
  connectRings(b, crown1, girdleT, false);
  connectRings(b, girdleT, girdleB, false);
  connectRings(b, girdleB, pav1, false);
  connectRings(b, pav1, pav2, false);
  capFan(b, [0, 0, -H * 0.40], pav2, true); // 底脊平面

  return b.build();
}

// ---------- 入口 ----------
export function createGemGeometry(cut, size, height) {
  if (cut === 'emerald') {
    // size 作为宽度, 长宽比 1.35
    return emeraldGeometry(size * 1.35, size, height);
  }
  if (cut === 'oval') {
    return brilliantGeometry(size / 2, height, 16, 1.38);
  }
  return brilliantGeometry(size / 2, height);
}

// ---------- 多面体体积(mm³): 三角面有向四面体求和 ----------
// 必须先 toNonIndexed(): indexed 几何体的 position 是顶点列表而非面列表。
// 非索引后每 3 个顶点构成一个面; 闭合多面体各面四面体同号, 直接求和取绝对值。
export function geometryVolumeMm3(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position.array;
  let sum = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    if (Number.isFinite(det)) sum += det;
  }
  if (geometry.index) g.dispose();
  return Math.abs(sum) / 6;
}

// ---------- 焦散用表面采样点云 ----------
// 在每个三角面内做重心插值采样, 输出世界空间由调用方传 matrix 计算
export function sampleSurfacePoints(geometry, perTriangle = 3) {
  const p = geometry.attributes.position.array;
  const n = geometry.attributes.normal.array;
  const triCount = p.length / 9;
  const total = triCount * perTriangle;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let k = 0;
  // 确定性伪随机, 保证出图与视口一致
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < triCount; t++) {
    const i = t * 9;
    const a = [p[i], p[i + 1], p[i + 2]], b = [p[i + 3], p[i + 4], p[i + 5]], c = [p[i + 6], p[i + 7], p[i + 8]];
    const na = [n[i], n[i + 1], n[i + 2]];
    for (let s = 0; s < perTriangle; s++) {
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w0 = 1 - u - v, w1 = u, w2 = v;
      positions[k * 3]     = w0 * a[0] + w1 * b[0] + w2 * c[0];
      positions[k * 3 + 1] = w0 * a[1] + w1 * b[1] + w2 * c[1];
      positions[k * 3 + 2] = w0 * a[2] + w1 * b[2] + w2 * c[2];
      normals[k * 3]     = na[0]; normals[k * 3 + 1] = na[1]; normals[k * 3 + 2] = na[2];
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('aNormal', new THREE.BufferAttribute(normals, 3));
  return g;
}
