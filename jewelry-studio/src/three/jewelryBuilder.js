// 参数化首饰构建器: 按配置实时生成 ring/pendant/earring
// 所有金属网格体积累加 → 实测金属用量; 所有宝石登记给焦散通道
import * as THREE from 'three';
import { createGemGeometry, geometryVolumeMm3 } from './gemGeometry.js';
import { metalById, gemById, hkRingDiameter } from '../data/materials.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function cylinderBetween(p1, p2, r, mat, seg = 10) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 1e-6) { // 零长度保护, 避免 normalize 产生 NaN 污染几何与体积
    const geo = new THREE.SphereGeometry(r, seg, seg);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(p1);
    return mesh;
  }
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  return mesh;
}

export class JewelryBuilder {
  constructor(config) {
    this.cfg = config;
    this.metal = metalById(config.metalId);
    this.gemDef = gemById(config.gemId);
    this.group = new THREE.Group();
    this.metalVolume = 0;
    this.gemVolume = 0;
    this.gemEntries = []; // {worldMatrix, geometry, ior, dispersion}
  }

  addMetal(mesh) {
    mesh.userData.isMetal = true;
    this.metalVolume += geometryVolumeMm3(mesh.geometry);
    this.group.add(mesh);
    return mesh;
  }

  addGem(geometry, matrix) {
    const baseVol = geometryVolumeMm3(geometry);
    // 世界矩阵含缩放时, 体积按线性部分行列式(即三轴缩放之积)修正
    const scaleDet = Math.abs(new THREE.Matrix3().setFromMatrix4(matrix).determinant());
    this.gemVolume += baseVol * scaleDet;
    const entry = {
      geometry,
      matrix: matrix.clone(),
      ior: this.gemDef.ior,
      dispersion: this.gemDef.dispersion,
      volume: baseVol * scaleDet
    };
    this.gemEntries.push(entry);
    return entry;
  }

  // 一颗宝石的可视网格(物理材质由 viewer 统一管理, 这里只给几何与姿态)
  makeGemMesh(geometry) {
    const mesh = new THREE.Mesh(geometry);
    mesh.userData.isGem = true;
    return mesh;
  }

  build() {
    const c = this.cfg;
    if (c.category === 'ring') this.buildRing();
    if (c.category === 'pendant') this.buildPendant();
    if (c.category === 'earring') this.buildEarring();
    this.group.userData.metalVolumeMm3 = this.metalVolume;
    this.group.userData.gemVolumeMm3 = this.gemVolume;
    return this.group;
  }

  // ============ 戒指 ============
  buildRing() {
    const c = this.cfg;
    const innerD = hkRingDiameter(c.ringSize);
    const t = c.bandThickness;
    const R = innerD / 2 + t / 2;          // 戒圈中径
    const tube = t / 2;

    const band = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 20, 96));
    this.addMetal(band);

    // 戒肩: 向头部收窄的两根锥形臂
    const headPos = new THREE.Vector3(0, R + t * 0.2, 0);
    for (const side of [-1, 1]) {
      const ang = side * 0.62;
      const start = new THREE.Vector3(Math.sin(ang) * R, Math.cos(ang) * R, 0);
      const end = new THREE.Vector3(side * c.gemSize * 0.42, R + t * 0.5, 0);
      const shoulder = cylinderBetween(start, end, tube * 0.92, this.metalMat(), 14);
      this.addMetal(shoulder);
    }

    // 头部朝向 +Y (台面朝外), 宝石本地 +Z → 世界 +Y
    const headQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const headM = new THREE.Matrix4().compose(headPos, headQ, new THREE.Vector3(1, 1, 1));
    this.buildSetting(headM, c.gemSize, c.gemHeight, true);

    // 三生石: 戒臂两侧各一副石, 自动贴合戒圈曲面(径向朝外)
    if (c.styleId === 'three-stone') {
      for (const side of [-1, 1]) {
        const ang = side * 0.42;
        const radial = new THREE.Vector3(Math.sin(ang), Math.cos(ang), 0);
        const pos = radial.clone().multiplyScalar(R + tube + 0.4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), radial);
        const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(0.62, 0.62, 0.62));
        this.buildSetting(m, c.gemSize * 0.5, c.gemHeight * 0.5, false);
      }
    }
  }

  // ============ 吊坠 ============
  buildPendant() {
    const c = this.cfg;
    const headPos = new THREE.Vector3(0, -2, 0);
    const headM = new THREE.Matrix4().compose(headPos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    this.buildSetting(headM, c.gemSize, c.gemHeight, true);

    // 吊咀: 顶部圆环 + 连接桥
    const bailY = headPos.y + c.gemHeight * 0.5 + c.gemSize * 0.75 + c.bailSize;
    const bail = new THREE.Mesh(new THREE.TorusGeometry(c.bailSize, c.bandThickness * 0.45, 16, 48));
    bail.position.set(0, bailY, 0);
    this.addMetal(bail);

    const bridge = cylinderBetween(
      new THREE.Vector3(0, bailY - c.bailSize, 0),
      new THREE.Vector3(0, headPos.y + c.gemHeight * 0.5 + c.gemSize * 0.55, 0),
      c.bandThickness * 0.42, this.metalMat()
    );
    this.addMetal(bridge);
  }

  // ============ 耳饰(成对) ============
  buildEarring() {
    const c = this.cfg;
    const makeOne = (xOff) => {
      const g = new THREE.Group();
      const base = new THREE.Vector3(xOff, 0, 0);

      if (c.earringStyle === 'stud') {
        const m = new THREE.Matrix4().compose(base, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        g.add(this.buildSettingGroup(m, c.gemSize, c.gemHeight, true));
        // 耳针
        const post = cylinderBetween(
          new THREE.Vector3(xOff, 0, -c.gemHeight * 0.4),
          new THREE.Vector3(xOff, 0, -c.gemHeight * 0.4 - 7),
          0.35, this.metalMat(), 8
        );
        g.add(post); this.metalVolume += geometryVolumeMm3(post.geometry);
      } else {
        // 耳坠: 上钉 + 跳环 + 下垂主石
        const studM = new THREE.Matrix4().compose(
          new THREE.Vector3(xOff, 9, 0), new THREE.Quaternion(), new THREE.Vector3(0.55, 0.55, 0.55)
        );
        g.add(this.buildSettingGroup(studM, c.gemSize * 0.55, c.gemHeight * 0.55, false));
        const jump = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.32, 12, 32));
        jump.position.set(xOff, 5.6, 0);
        g.add(jump); this.metalVolume += geometryVolumeMm3(jump.geometry);
        const link = cylinderBetween(
          new THREE.Vector3(xOff, 5, 0), new THREE.Vector3(xOff, 3.2, 0), 0.3, this.metalMat(), 8
        );
        g.add(link); this.metalVolume += geometryVolumeMm3(link.geometry);
        const dropM = new THREE.Matrix4().compose(
          new THREE.Vector3(xOff, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)
        );
        g.add(this.buildSettingGroup(dropM, c.gemSize, c.gemHeight, true));
      }
      return g;
    };
    const spacing = c.gemSize * 2.4;
    this.group.add(makeOne(-spacing));
    this.group.add(makeOne(spacing));
  }

  // ============ 镶口总成 ============
  // matrix: 宝石中心世界姿态; 宝石本地 +Z 为台面朝向
  buildSetting(matrix, size, height, withHalo) {
    this.group.add(this.buildSettingGroup(matrix, size, height, withHalo));
  }

  buildSettingGroup(matrix, size, height, withHalo) {
    const c = this.cfg;
    const holder = new THREE.Group();
    holder.applyMatrix4(matrix);
    const geo = createGemGeometry(c.gemCut, size, height);
    const gemMesh = this.makeGemMesh(geo);
    holder.add(gemMesh);
    this.addGem(geo, matrix);

    const R = size / 2;
    const zGirdle = height * 0.03;
    const zTop = height * 0.32;

    // 头部金属底座(镶口座): 锥形短柱, 承接宝石与戒臂, 也是真实金属重量的一部分
    const headBase = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.55, R * 0.72, height * 0.34, 24),
      this.metalMat()
    );
    headBase.rotation.x = Math.PI / 2;
    headBase.position.z = -height * 0.42;
    holder.add(headBase);
    this.metalVolume += geometryVolumeMm3(headBase.geometry);

    // 托架篮底(交叉两圈)
    for (const rot of [0, Math.PI / 2]) {
      const basket = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, c.bandThickness * 0.22, 10, 32));
      basket.rotation.x = Math.PI / 2;
      basket.rotation.z = rot;
      basket.position.z = -height * 0.28;
      holder.add(basket);
      this.metalVolume += geometryVolumeMm3(basket.geometry);
    }

    if (c.setting === 'prong') {
      const n = c.prongCount;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / n;
        const x = Math.cos(a) * R * 0.92, y = Math.sin(a) * R * 0.92;
        // 爪: 从亭部下方伸到台面边缘, 顶端内扣压住腰棱
        const prong = cylinderBetween(
          new THREE.Vector3(x * 1.06, y * 1.06, -height * 0.34),
          new THREE.Vector3(x * 0.92, y * 0.92, zTop + 0.25),
          Math.max(0.28, c.bandThickness * 0.26), this.metalMat(), 8
        );
        holder.add(prong); this.metalVolume += geometryVolumeMm3(prong.geometry);
        // 扣头小球
        const bead = new THREE.Mesh(new THREE.SphereGeometry(c.bandThickness * 0.34, 12, 10));
        bead.position.set(x * 0.9, y * 0.9, zTop + 0.1);
        holder.add(bead); this.metalVolume += geometryVolumeMm3(bead.geometry);
      }
    } else if (c.setting === 'pave') {
      // 钉镶: 腰棱外围一圈金属小珠 + 短钉
      const n = c.prongCount;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * R * 1.02, y = Math.sin(a) * R * 1.02;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.3, c.bandThickness * 0.32), 12, 10));
        bead.position.set(x, y, zGirdle + 0.15);
        holder.add(bead); this.metalVolume += geometryVolumeMm3(bead.geometry);
        const pin = cylinderBetween(
          new THREE.Vector3(x, y, -height * 0.2),
          new THREE.Vector3(x, y, zGirdle),
          0.22, this.metalMat(), 6
        );
        holder.add(pin); this.metalVolume += geometryVolumeMm3(pin.geometry);
      }
    } else {
      // 包镶: 围边金属壁
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.0, height * 0.55, 40, 1, true));
      wall.rotation.x = Math.PI / 2;
      wall.position.z = -height * 0.02;
      holder.add(wall); this.metalVolume += geometryVolumeMm3(wall.geometry);
      // 上沿压边圈
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, c.bandThickness * 0.2, 12, 48));
      rim.position.z = height * 0.26;
      holder.add(rim); this.metalVolume += geometryVolumeMm3(rim.geometry);
    }

    // 围石群镶(halo): 小钻沿主石圆周排列, 自动贴合头部曲面
    if (withHalo && c.halo) {
      const n = c.haloCount;
      const orbitR = R + size * 0.16;
      const smallSize = Math.max(1.0, size * 0.16);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(a) * orbitR, Math.sin(a) * orbitR, zGirdle - smallSize * 0.12);
        const sGeo = createGemGeometry('round', smallSize, smallSize * 0.62);
        const sMesh = this.makeGemMesh(sGeo);
        sMesh.position.copy(pos);
        holder.add(sMesh);
        // 相对 holder 的姿态再叠加 holder 世界矩阵, 得到碎钻世界矩阵
        const localM = new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        const worldM = localM.clone().premultiply(matrix);
        this.addGem(sGeo, worldM);
        // 每颗碎钻两颗金属钉
        for (const off of [0.35, -0.35]) {
          const aa = a + off;
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8));
          bead.position.set(Math.cos(aa) * (orbitR + smallSize * 0.4), Math.sin(aa) * (orbitR + smallSize * 0.4), pos.z + 0.15);
          holder.add(bead); this.metalVolume += geometryVolumeMm3(bead.geometry);
        }
      }
    }
    return holder;
  }

  metalMat() {
    // 材质实例由 viewer 统一替换, 这里给占位(体积计算不依赖材质)
    if (!this._mat) {
      this._mat = new THREE.MeshStandardMaterial({ color: this.metal.color, metalness: 1, roughness: 0.2 });
    }
    return this._mat;
  }
}

export function buildJewelry(config) {
  return new JewelryBuilder(config).build();
}
