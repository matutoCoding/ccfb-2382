// ============================================================
// 首饰装配:戒臂 / 镶口(爪镶·包镶·钉镶) / 吊坠扣 / 耳钉
// 所有尺寸单位 mm,宝石轴 = +Y,戒圈在 XY 平面
// ============================================================
import * as THREE from 'three';
import { ringSizeToInnerRadius } from './config.js';
import { buildGemGeometry, girdleOutline, brilliantGeometry, geometryVolume } from './gems.js';

// ---------- 通用:截面扫掠成环(索引几何,平滑法线) ----------
function sweepRing(crossPts, radiusFn, segments = 96) {
  // crossPts: [[radial, z],...] 相对环中心线的截面点(逆时针)
  const M = crossPts.length;
  const pos = [], idx = [];
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const r = radiusFn(th);
    const cx = Math.cos(th), sy = Math.sin(th);
    for (const [dr, z] of crossPts) pos.push(cx * (r + dr), sy * (r + dr), z);
  }
  for (let i = 0; i < segments; i++) {
    const ni = (i + 1) % segments;
    for (let j = 0; j < M; j++) {
      const jn = (j + 1) % M;
      const a = i * M + j, b = i * M + jn, c = ni * M + jn, d = ni * M + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 圆角矩形截面点列(径向半厚 ht, 宽半 hw)
function roundedRectSection(ht, hw, cr, per = 5) {
  const pts = [];
  const corners = [
    [ht - cr, hw - cr, 0], [-(ht - cr), hw - cr, Math.PI / 2],
    [-(ht - cr), -(hw - cr), Math.PI], [ht - cr, -(hw - cr), Math.PI * 1.5],
  ];
  for (const [cr0, cz, a0] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = a0 + (i / per) * Math.PI / 2;
      pts.push([cr0 + Math.cos(a) * cr, cz + Math.sin(a) * cr]);
    }
  }
  return pts;
}

// ---------- 通用:沿折线的变径圆管(爪、扣环用,索引几何平滑法线) ----------
function taperedTube(points, radiusFn, radialSegs = 10) {
  const n = points.length;
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const pPrev = points[Math.max(0, i - 1)], pNext = points[Math.min(n - 1, i + 1)];
    const t = pNext.clone().sub(pPrev).normalize();
    const ref = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const n1 = new THREE.Vector3().crossVectors(t, ref).normalize();
    const n2 = new THREE.Vector3().crossVectors(t, n1).normalize();
    const r = radiusFn(i / (n - 1));
    for (let j = 0; j < radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      pos.push(
        p.x + n1.x * Math.cos(a) * r + n2.x * Math.sin(a) * r,
        p.y + n1.y * Math.cos(a) * r + n2.y * Math.sin(a) * r,
        p.z + n1.z * Math.cos(a) * r + n2.z * Math.sin(a) * r,
      );
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const jn = (j + 1) % radialSegs;
      const a = i * radialSegs + j, b = i * radialSegs + jn;
      const c = (i + 1) * radialSegs + jn, d = (i + 1) * radialSegs + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  // 端盖(扇形)
  const cap = (ringIdx, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < radialSegs; j++) {
      cx += pos[(ringIdx * radialSegs + j) * 3]; cy += pos[(ringIdx * radialSegs + j) * 3 + 1]; cz += pos[(ringIdx * radialSegs + j) * 3 + 2];
    }
    const ci = pos.length / 3;
    pos.push(cx / radialSegs, cy / radialSegs, cz / radialSegs);
    for (let j = 0; j < radialSegs; j++) {
      const jn = (j + 1) % radialSegs;
      const a = ringIdx * radialSegs + j, b = ringIdx * radialSegs + jn;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  cap(0, true); cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- 戒臂 ----------
export function buildBand(cfg) {
  const inner = ringSizeToInnerRadius(cfg.ringSize);
  const t = cfg.bandThickness, w = cfg.bandWidth;
  const rMid = inner + t / 2;
  const cr = Math.min(t, w) * 0.32;
  const section = roundedRectSection(t / 2, w / 2, cr);
  // 肩部向镶口方向微微收细(顶部 ±50° 线性渐变到 82%)
  const radiusFn = (th) => {
    const d = Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2));
    const k = Math.max(0, 1 - Math.abs(d) / (Math.PI * 0.62));
    return rMid * (1 - 0.06 * k);
  };
  const geom = sweepRing(section, radiusFn, 128);
  return { geom, rMid, inner };
}

// 戒臂外表面点(钉镶自动贴合用):θ 弧度, z 横向偏移 → {point, normal}
export function bandSurface(cfg, theta, z) {
  const inner = ringSizeToInnerRadius(cfg.ringSize);
  const t = cfg.bandThickness, w = cfg.bandWidth;
  const rMid = inner + t / 2;
  const hw = w / 2, ht = t / 2;
  const cr = Math.min(t, w) * 0.32;
  let dr, slope = 0; // 外表面的径向偏移与 dz→dr 的导数
  const az = Math.abs(z);
  if (az <= hw - cr) { dr = ht; }
  else {
    const dz = Math.min(az - (hw - cr), cr);
    dr = ht - cr + Math.sqrt(Math.max(0, cr * cr - dz * dz));
    slope = -dz / Math.max(1e-4, Math.sqrt(Math.max(1e-8, cr * cr - dz * dz)));
  }
  const taper = 1 - 0.06 * Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(theta - Math.PI / 2), Math.cos(theta - Math.PI / 2))) / (Math.PI * 0.62));
  const r = rMid * taper + dr;
  const radial = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
  const point = radial.clone().multiplyScalar(r); point.z = z;
  const normal = radial.clone().addScaledVector(new THREE.Vector3(0, 0, 1), slope * Math.sign(z)).normalize();
  return { point, normal };
}

// ---------- 爪镶 ----------
export function buildProngs(cfg, gemInfo) {
  const { girdleY, outline } = gemInfo;
  const group = new THREE.Group();
  const pr = cfg.prongThickness / 2;
  const n = cfg.prongCount;
  const positions = [];
  if (cfg.gemShape === 'emerald' && outline) {
    // 祖母绿切:爪在四个切角处
    const hx = Math.max(...outline.map(p => Math.abs(p.x)));
    const hz = Math.max(...outline.map(p => Math.abs(p.y)));
    const c = Math.min(cfg.gemSize, cfg.gemSize * cfg.gemAspect) * 0.18;
    const corners = [
      [hx - c * 0.5, hz - c * 0.5], [hx - c * 0.5, -(hz - c * 0.5)],
      [-(hx - c * 0.5), hz - c * 0.5], [-(hx - c * 0.5), -(hz - c * 0.5)],
    ];
    for (const [x, z] of corners) positions.push({ angle: Math.atan2(z, x), r: Math.hypot(x, z) });
  } else {
    const R = gemInfo.girdleRadius;
    const off = Math.PI / n; // 错开主刻面方向
    for (let i = 0; i < n; i++) positions.push({ angle: off + (i / n) * Math.PI * 2, r: R });
  }
  const seatY = gemInfo.bottomY * 0.35; // 爪根高度(与底托衔接)
  for (const { angle, r } of positions) {
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const pts = [
      dir.clone().multiplyScalar(r * 0.45).setY(seatY - 1.2),
      dir.clone().multiplyScalar(r * 0.92).setY(girdleY - 0.9),
      dir.clone().multiplyScalar(r * 1.01).setY(girdleY + 0.05),
      dir.clone().multiplyScalar(r * 0.90).setY(girdleY + 0.55), // 爪头内扣
    ];
    const g = taperedTube(pts, (t) => pr * (1.05 - 0.45 * t), 10);
    group.add(new THREE.Mesh(g));
  }
  return group;
}

// ---------- 包镶 ----------
export function buildBezel(cfg, gemInfo) {
  const outline = gemInfo.outline || girdleOutline(cfg.gemShape, cfg.gemSize, cfg.gemAspect, 64);
  const wall = 0.55, lip = 0.28;
  const h = cfg.bezelHeight;
  const yBot = gemInfo.girdleY - h * 0.62, yTop = gemInfo.girdleY + h * 0.38;
  const pts = outline.map(p => new THREE.Vector2(p.x, p.y));
  const scaled = (k) => pts.map(p => new THREE.Vector3(p.x * k, 0, p.y * k));
  const ringAt = (arr, y) => arr.map(p => new THREE.Vector3(p.x, y, p.z));
  const outBot = ringAt(scaled(1.015), yBot), outTop = ringAt(scaled(1.015 + wall / gemInfo.girdleRadius), yTop);
  const inBot = ringAt(scaled(0.985 - 0.001), yBot), inTop = ringAt(scaled(0.995), yTop);
  const lipRing = ringAt(scaled(1.0 - lip / gemInfo.girdleRadius), yTop + lip * 0.8);
  const pos = [];
  const M = pts.length;
  const quad = (a, b, c, d) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    quad(outBot[i], outBot[j], outTop[j], outTop[i]);       // 外壁
    quad(inBot[j], inBot[i], inTop[i], inTop[j]);           // 内壁
    quad(outTop[i], outTop[j], lipRing[j], lipRing[i]);     // 包边唇口
    quad(inTop[i], lipRing[i], lipRing[j], inTop[j]);
    quad(outBot[j], outBot[i], inBot[i], inBot[j]);         // 底缘
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g));
  // 底托(承石碗)
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(gemInfo.girdleRadius * 0.55, gemInfo.girdleRadius * 0.22, 0.6, 24));
  seat.position.y = yBot - 0.15;
  if (cfg.gemShape !== 'round') seat.scale.x = cfg.gemAspect >= 1 ? cfg.gemAspect : 1;
  group.add(seat);
  return group;
}

// ---------- 钉镶(配石沿戒臂曲面排布,每颗 4 钉) ----------
export function buildPave(cfg, gemMaterial, gemInfoCb) {
  const group = new THREE.Group();
  const rows = cfg.paveRows, perRow = cfg.pavePerRow, size = cfg.paveStoneSize;
  const spanDeg = 46; // 肩部分布范围(单侧)
  const gemGeoms = [];
  for (let row = 0; row < rows; row++) {
    const zOff = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * (cfg.bandWidth * 0.52);
    for (let i = 0; i < perRow; i++) {
      const frac = perRow === 1 ? 0 : (i / (perRow - 1) - 0.5) * 2;
      const theta = Math.PI / 2 + frac * (spanDeg * Math.PI / 180);
      const { point, normal } = bandSurface(cfg, theta, zOff);
      const gemGeom = brilliantGeometry({ size, aspect: 1 });
      const gi = gemGeom.userData;
      // 石头腰部贴到戒臂表面(略微下沉 15%)
      const pos = point.clone().addScaledVector(normal, -size * 0.10);
      const holder = new THREE.Group();
      holder.position.copy(pos);
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const mesh = new THREE.Mesh(gemGeom, gemMaterial);
      holder.add(mesh);
      // 4 颗钉
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(size * 0.09, 6, 5));
        bead.position.set(Math.cos(a) * size * 0.52, gi.girdleY, Math.sin(a) * size * 0.52);
        holder.add(bead);
      }
      group.add(holder);
      gemGeoms.push({ geom: gemGeom, matrix: holder.matrix, holder });
    }
  }
  return { group, count: rows * perRow, gemGeoms };
}

// ---------- 底托(连接戒臂与镶口,宝石局部坐标) ----------
export function buildBasket(cfg, gemInfo) {
  const group = new THREE.Group();
  const R = gemInfo.girdleRadius;
  const y0 = gemInfo.bottomY - 1.6;   // 篮底(与戒臂相接)
  const y1 = gemInfo.bottomY * 0.3;   // 承石圈
  const h = Math.max(0.8, y1 - y0);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, cfg.bandWidth * 0.42, h, 20));
  cone.position.y = (y0 + y1) / 2;
  if (cfg.gemShape !== 'round') cone.scale.x = cfg.gemAspect >= 1 ? Math.min(cfg.gemAspect, 1.5) : 1;
  group.add(cone);
  const seatRing = new THREE.Mesh(new THREE.TorusGeometry(R * 0.68, 0.35, 10, 32));
  seatRing.rotation.x = Math.PI / 2;
  seatRing.position.y = y1;
  if (cfg.gemShape !== 'round') seatRing.scale.x = cone.scale.x;
  group.add(seatRing);
  return group;
}

// ---------- 吊坠扣 ----------
export function buildBail(cfg, gemInfo) {
  const group = new THREE.Group();
  const R = gemInfo.girdleRadius;   // 宝石已旋转:台面朝 +Z,轮廓在 XY 平面
  const bail = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.55, 12, 36));
  bail.position.y = R + 2.9;
  group.add(bail);
  const link = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.32, 10, 28));
  link.position.y = R + 1.0;
  link.rotation.y = Math.PI / 2;
  group.add(link);
  // 包镶/爪镶与扣之间的连接座
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 1.4, 16));
  neck.position.y = R + 0.2;
  group.add(neck);
  return group;
}

// ---------- 耳钉针 + 蝴蝶扣 ----------
export function buildEarringBack(cfg, gemInfo) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 9, 12));
  post.position.y = gemInfo.bottomY - 4.2;
  group.add(post);
  const clutch = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.7, 24));
  clutch.position.y = gemInfo.bottomY - 6.5;
  group.add(clutch);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.4, 8, 24));
    loop.position.set(s * 2.6, gemInfo.bottomY - 6.5, 0);
    loop.rotation.y = Math.PI / 2;
    group.add(loop);
  }
  return group;
}

// ---------- 总装配 ----------
export function buildJewelry(cfg, gemMaterial) {
  const group = new THREE.Group();
  const metal = new THREE.Group();       // 全部金属件(统一金属材质,外部赋材质)
  const gemGeom = buildGemGeometry(cfg);
  const gemInfo = gemGeom.userData;
  if (!gemInfo.outline) gemInfo.outline = girdleOutline(cfg.gemShape, cfg.gemSize, cfg.gemAspect, 64);
  const gemMesh = new THREE.Mesh(gemGeom, gemMaterial);

  let paveInfo = null;
  const head = new THREE.Group(); // 镶口+主石,吊坠/耳饰会整体旋转

  if (cfg.settingType === 'bezel') {
    head.add(buildBezel(cfg, gemInfo));
  } else {
    head.add(buildProngs(cfg, gemInfo));
    head.add(buildBasket(cfg, gemInfo));
  }
  head.add(gemMesh);

  if (cfg.baseType === 'ring') {
    const band = buildBand(cfg);
    metal.add(new THREE.Mesh(band.geom));
    // 镶口整体抬升到戒臂顶端:篮底(局部 y=bottomY-1.6)落在戒臂外表面
    const bandTop = band.rMid * 0.94 + cfg.bandThickness / 2; // 顶部收细 6%
    head.position.y = bandTop - (gemInfo.bottomY - 1.6) - 0.35;
    if (cfg.settingType === 'pave') {
      paveInfo = buildPave(cfg, gemMaterial);
      metal.add(paveInfo.group);
    }
    metal.add(head);
  } else if (cfg.baseType === 'pendant') {
    head.rotation.x = Math.PI / 2;          // 台面朝 +Z(面向观众)
    head.position.y = 0;
    metal.add(head);
    metal.add(buildBail(cfg, gemInfo));
  } else { // earring:一对耳钉
    for (const s of [-1, 1]) {
      const one = new THREE.Group();
      const h2 = head.clone();
      h2.rotation.x = Math.PI / 2;          // 台面朝前
      one.add(h2);
      const back = buildEarringBack(cfg, gemInfo);
      back.rotation.x = Math.PI / 2;
      one.add(back);
      one.position.x = s * (gemInfo.girdleRadius + 4);
      one.rotation.y = -s * 0.35;
      metal.add(one);
    }
  }
  group.add(metal);

  // 供报价:金属体积估算(mm³)
  let metalVol = 0;
  if (cfg.baseType === 'ring') {
    const inner = ringSizeToInnerRadius(cfg.ringSize);
    const rMid = inner + cfg.bandThickness / 2;
    const area = cfg.bandWidth * cfg.bandThickness - (4 - Math.PI) * Math.pow(Math.min(cfg.bandWidth, cfg.bandThickness) * 0.32, 2);
    metalVol += area * 2 * Math.PI * rMid;
    if (paveInfo) metalVol += paveInfo.count * 4 * (4 / 3) * Math.PI * Math.pow(cfg.paveStoneSize * 0.09, 3);
  }
  // 镶口估算
  if (cfg.settingType === 'bezel') {
    const perim = gemInfo.outline.length * (gemInfo.girdleRadius * 2 * Math.PI / Math.max(gemInfo.outline.length, 8));
    metalVol += perim * cfg.bezelHeight * 0.55 + Math.PI * Math.pow(gemInfo.girdleRadius * 0.5, 2) * 0.8;
  } else {
    metalVol += cfg.prongCount * Math.PI * Math.pow(cfg.prongThickness / 2, 2) * (gemInfo.topY - gemInfo.bottomY * 0.35 + 1.2) * 0.8;
    metalVol += Math.PI * Math.pow(gemInfo.girdleRadius * 0.5, 2) * 1.2; // 底托
  }
  if (cfg.baseType === 'pendant') metalVol += Math.PI * 0.55 * 0.55 * 2 * Math.PI * 2.0 + 3;
  if (cfg.baseType === 'earring') metalVol += 2 * (Math.PI * 0.38 * 0.38 * 9 + 12);

  return {
    group, metal, gemMesh, gemGeom, gemInfo, paveInfo,
    metalVolume: metalVol,
    gemVolume: geometryVolume(gemGeom),
    paveGemVolume: paveInfo ? cfg.paveStoneSize : 0,
  };
}
