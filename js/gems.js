// ============================================================
// 参数化刻面宝石几何:圆形明亮式 / 椭圆 / 祖母绿切(阶梯切)
// 所有几何为非索引三角形汤,面法线天然平直(刻面正确)
// ============================================================
import * as THREE from 'three';

// ---------- 工具 ----------
class TriSoup {
  constructor() { this.pos = []; }
  tri(a, b, c) { this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  build() {
    // 自动统一绕向:逐三角形检查法线是否背离质心,反则交换顶点(宝石为凸体)
    const p = this.pos;
    let cx = 0, cy = 0, cz = 0;
    const nv = p.length / 3;
    for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
    cx /= nv; cy /= nv; cz /= nv;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2];
      const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
      const cx2 = p[i + 6], cy2 = p[i + 7], cz2 = p[i + 8];
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz2 - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const mx = (ax + bx + cx2) / 3 - cx, my = (ay + by + cy2) / 3 - cy, mz = (az + bz + cz2) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) {
        p[i + 3] = cx2; p[i + 4] = cy2; p[i + 5] = cz2;
        p[i + 6] = bx; p[i + 7] = by; p[i + 8] = bz;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals(); // 非索引 → 平直法线
    return g;
  }
}

function ringPoint(r, angle, y) {
  return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}

// 数值体积(四面体求和),用于克拉估算
export function geometryVolume(geom) {
  const p = geom.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(v);
}

// ---------- 明亮式切工(圆 / 椭圆共用拓扑) ----------
// 冠部:台面8 + 星刻面8 + 风筝面8 + 上腰面16
// 亭部:主刻面8 + 下腰面16 + 底尖
// size: 宽度方向直径 mm; aspect: 长/宽; 长轴沿 X
export function brilliantGeometry({ size = 6.5, aspect = 1, tablePct = 0.57 }) {
  const R = size / 2;
  const sx = aspect >= 1 ? aspect : 1;          // X 方向拉伸
  const sz = aspect >= 1 ? 1 : 1 / aspect;
  const crownH = 0.30 * R;
  const pavH = 0.86 * R;
  const girdleT = 0.035 * R;
  const rT = R * tablePct;
  const rS = R * 0.82, hS = crownH * 0.45;      // 星刻面尖环
  const rB = R * 0.28, hB = pavH * 0.72;        // 亭部刻面转折环
  const yG = girdleT / 2, yG2 = -girdleT / 2;

  const P = (r, ang, y) => {
    const p = ringPoint(r, ang, y); p.x *= sx; p.z *= sz; return p;
  };
  const soup = new TriSoup();
  const N = 8;

  const T = [], S = [], Gt = [], Gb = [], B = [];
  for (let j = 0; j < N; j++) {
    T.push(P(rT, j * Math.PI / 4, crownH));
    Gt.push(P(R, j * Math.PI / 4, yG));
    Gb.push(P(R, j * Math.PI / 4, yG2));
  }
  for (let m = 0; m < 2 * N; m++) {
    if (m % 2 === 1) {
      S.push(P(rS, m * Math.PI / 8, hS));
      B.push(P(rB, m * Math.PI / 8, -hB));
    }
  }
  const Gt16 = [], Gb16 = [];
  for (let m = 0; m < 2 * N; m++) {
    Gt16.push(P(R, m * Math.PI / 8, yG));
    Gb16.push(P(R, m * Math.PI / 8, yG2));
  }
  const culet = new THREE.Vector3(0, -pavH, 0);

  // 台面(八边形,三角扇)
  for (let j = 0; j < N; j++) soup.tri(new THREE.Vector3(0, crownH, 0), T[j], T[(j + 1) % N]);
  // 星刻面 + 风筝面 + 上腰面
  const sAt = (m) => S[(((m % (2 * N)) + 2 * N) % (2 * N) - 1) / 2]; // m 为奇数索引
  for (let j = 0; j < N; j++) {
    const jn = (j + 1) % N;
    const sR = sAt(2 * j + 1);              // T_j 与 T_{j+1} 之间的星尖
    const sL = sAt(2 * j - 1);
    // 星刻面
    soup.tri(T[j], T[jn], sR);
    // 风筝面(主冠刻面)
    soup.quad(T[j], sL, Gt[j], sR);
    // 上腰面 ×2
    soup.tri(Gt16[2 * j], Gt16[2 * j + 1], sR);
    soup.tri(Gt16[2 * j + 1], Gt16[(2 * j + 2) % (2 * N)], sR);
  }
  // 腰棱(竖直窄带)
  for (let m = 0; m < 2 * N; m++) {
    const mn = (m + 1) % (2 * N);
    soup.quad(Gt16[m], Gt16[mn], Gb16[mn], Gb16[m]);
  }
  // 下腰面 ×16 + 亭部主刻面 ×8
  const bAt = (m) => B[(((m % (2 * N)) + 2 * N) % (2 * N) - 1) / 2];
  for (let j = 0; j < N; j++) {
    const bR = bAt(2 * j + 1), bL = bAt(2 * j - 1);
    soup.tri(Gb16[2 * j], Gb16[2 * j + 1], bR);
    soup.tri(Gb16[2 * j + 1], Gb16[(2 * j + 2) % (2 * N)], bR);
    soup.quad(Gb[j], bL, culet, bR);
  }
  const g = soup.build();
  g.userData = { girdleRadius: R, girdleY: yG, topY: crownH, bottomY: -pavH, outline: null };
  return g;
}

// ---------- 祖母绿切(阶梯切) ----------
// 轮廓:长方形切角;冠部3级台阶+台面;亭部3级台阶+龙骨线
export function emeraldCutGeometry({ size = 6, aspect = 1.4 }) {
  const W = size, L = size * aspect;          // 宽(Z) × 长(X)
  const c = Math.min(W, L) * 0.18;            // 切角量
  const crownH = 0.26 * W, pavH = 0.62 * W, girdleT = 0.04 * W;

  // 8 点轮廓(单位 1 = 实际半尺寸),逆时针
  const hx = L / 2, hz = W / 2;
  const outline = [
    [hx - c, hz], [hx, hz - c], [hx, -(hz - c)], [hx - c, -hz],
    [-(hx - c), -hz], [-hx, -(hz - c)], [-hx, hz - c], [-(hx - c), hz],
  ];
  const ring = (sx, sz, y) => outline.map(([x, z]) => new THREE.Vector3(x * sx, y, z * sz));

  const soup = new TriSoup();
  const yG = girdleT / 2, yG2 = -girdleT / 2;
  const gTop = ring(1, 1, yG), gBot = ring(1, 1, yG2);
  // 冠部台阶
  const cr1 = ring(0.88, 0.84, yG + crownH * 0.34);
  const cr2 = ring(0.76, 0.68, yG + crownH * 0.67);
  const tab = ring(0.64, 0.52, yG + crownH);
  // 亭部台阶
  const pv1 = ring(0.82, 0.78, yG2 - pavH * 0.35);
  const pv2 = ring(0.62, 0.55, yG2 - pavH * 0.68);
  const keel = outline.map(([x]) => new THREE.Vector3(x * 0.42, yG2 - pavH, 0));

  const n = outline.length;
  const stitch = (A, Bm) => { // 两环之间缝四边形带
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      soup.quad(A[i], A[j], Bm[j], Bm[i]);
    }
  };
  stitch(gTop, cr1); stitch(cr1, cr2); stitch(cr2, tab);
  // 台面
  for (let i = 1; i < n - 1; i++) soup.tri(tab[0], tab[i], tab[i + 1]);
  // 腰棱
  stitch(gTop, gBot);
  // 亭部
  stitch(gBot, pv1); stitch(pv1, pv2); stitch(pv2, keel);

  const g = soup.build();
  g.userData = {
    girdleRadius: Math.max(hx, hz), girdleY: yG, topY: yG + crownH, bottomY: yG2 - pavH,
    outline: outline.map(([x, z]) => new THREE.Vector2(x, z)),
  };
  return g;
}

// 圆形/椭圆的轮廓点(供包镶、焦散采样用)
export function girdleOutline(shape, size, aspect, segments = 48) {
  if (shape === 'emerald') {
    const W = size, L = size * aspect, c = Math.min(W, L) * 0.18;
    const hx = L / 2, hz = W / 2;
    return [
      [hx - c, hz], [hx, hz - c], [hx, -(hz - c)], [hx - c, -hz],
      [-(hx - c), -hz], [-hx, -(hz - c)], [-hx, hz - c], [-(hx - c), hz],
    ].map(([x, z]) => new THREE.Vector2(x, z));
  }
  const R = size / 2;
  const sx = aspect >= 1 ? aspect : 1, sz = aspect >= 1 ? 1 : 1 / aspect;
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * R * sx, Math.sin(a) * R * sz));
  }
  return pts;
}

export function buildGemGeometry(cfg) {
  const { gemShape, gemSize, gemAspect } = cfg;
  if (gemShape === 'emerald') return emeraldCutGeometry({ size: gemSize, aspect: gemAspect });
  return brilliantGeometry({ size: gemSize, aspect: gemShape === 'oval' ? gemAspect : 1 });
}
