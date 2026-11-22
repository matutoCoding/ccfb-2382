// 物理焦散通道(真折射解算, 非贴图)
// 原理:
//  1) 对宝石刻面表面密集采样点云
//  2) 沿主光方向入射, 按 Snell 定律 n1·sinθi = n2·sinθt 折射进入宝石
//  3) 用包围球近似求对面出射点, 再折射出空气
//  4) 出射光线与地面求交; R/G/B 分别用色散修正后的 IOR → 自然分光
//  5) 正交相机把落点写入 HalfFloat RT, 地面叠加显示
import * as THREE from 'three';
import { sampleSurfacePoints } from './gemGeometry.js';

const VERT = /* glsl */`
  attribute vec3 aNormal;
  uniform mat4 uWorld;
  uniform vec3 uLightDir;      // 入射光方向(指向场景)
  uniform float uIor;          // 本通道波长对应折射率
  uniform vec3 uSphereCenter;  // 宝石包围球中心(世界)
  uniform float uSphereR;      // 包围球半径
  uniform float uGroundY;
  uniform float uOrthoHalf;
  uniform vec2 uCamXZ;         // 正交相机 right 向量(xz)
  uniform vec2 uCamZY;         // 正交相机 up 向量(xz)
  varying float vIntensity;

  vec3 refracted(vec3 I, vec3 N, float eta) {
    // GLSL refract: I 入射, N 法线, eta = n1/n2
    return refract(I, N, eta);
  }

  void main() {
    vec3 wp = (uWorld * vec4(position, 1.0)).xyz;
    vec3 wn = normalize(mat3(uWorld) * aNormal);
    vec3 L = normalize(uLightDir);

    // ---- 第一次折射: 空气(n=1) → 宝石 ----
    vec3 N1 = dot(wn, L) < 0.0 ? wn : -wn;     // 法线转到迎光面
    vec3 r1 = refracted(L, N1, 1.0 / uIor);
    if (dot(r1, r1) < 1e-6) r1 = L;            // 全反射兜底

    // ---- 包围球求对面出射点 ----
    vec3 c = uSphereCenter;
    vec3 oc = wp - c;
    float b = dot(oc, r1);
    float disc = b * b - dot(oc, oc) + uSphereR * uSphereR;
    vec3 exitP = wp + r1 * (sqrt(max(disc, 0.0)) - b);
    vec3 N2 = normalize(exitP - c);

    // ---- 第二次折射: 宝石 → 空气 ----
    vec3 r2 = refracted(r1, -N2, uIor);
    if (dot(r2, r2) < 1e-6) r2 = r1;

    // ---- 出射光线与地面求交 ----
    float t = (uGroundY - exitP.y) / r2.y;
    vec3 hit = exitP + r2 * max(t, 0.0);

    // 世界坐标 → 正交相机裁剪空间(统一以世界原点为基准, 与地面对齐)
    vec2 rel = hit.xz;
    vec2 px = vec2(dot(rel, uCamXZ), dot(rel, uCamZY));
    vec2 clip = px / uOrthoHalf;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 2.2;

    // 掠射角处能量弱, 正向出射强
    vIntensity = clamp(abs(dot(normalize(r2), L)), 0.0, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uTint;
  varying float vIntensity;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float fall = smoothstep(0.5, 0.05, length(d));   // 软点
    gl_FragColor = vec4(uTint * (0.10 + 0.25 * vIntensity) * fall, 1.0);
  }
`;

// 折射率随波长变化(经验色散展开): 蓝 > 绿 > 红
function channelIors(ior, dispersion) {
  const d = dispersion * 0.9;
  return {
    r: ior - d,
    g: ior,
    b: ior + d
  };
}

export class CausticsPass {
  constructor(renderer, size = 1024, orthoHalf = 26) {
    this.renderer = renderer;
    this.size = size;
    this.orthoHalf = orthoHalf;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.baseMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uWorld: { value: new THREE.Matrix4() },
        uLightDir: { value: new THREE.Vector3(0, -1, 0) },
        uIor: { value: 2.4 },
        uSphereCenter: { value: new THREE.Vector3() },
        uSphereR: { value: 1 },
        uGroundY: { value: -12 },
        uOrthoHalf: { value: orthoHalf },
        uCamXZ: { value: new THREE.Vector2(1, 0) },
        uCamZY: { value: new THREE.Vector2(0, 1) },
        uTint: { value: new THREE.Color(1, 1, 1) }
      }
    });
    this.items = [];
    this.groundPlane = null;
  }

  // gemEntries: JewelryBuilder.gemEntries
  updateGems(gemEntries) {
    this.items = gemEntries.map(e => {
      const cloud = sampleSurfacePoints(e.geometry, 4);
      cloud.applyMatrix4(e.matrix);
      const sphere = new THREE.Sphere();
      cloud.computeBoundingSphere();
      sphere.copy(cloud.boundingSphere);
      return { cloud, ior: e.ior, dispersion: e.dispersion, sphere };
    });
  }

  setLightDirection(dir) {
    this.lightDir = dir.clone().normalize();
  }

  // 正交相机的 xz 基轴: 投影面始终覆盖地面 xz
  setupCameraBasis() {
    // 用 lightDir 在 xz 的投影作为 up 基准, right 与其垂直
    const f = this.lightDir;
    let up = new THREE.Vector3(-f.x, 0, -f.z);
    if (up.lengthSq() < 1e-4) up.set(0, 0, 1);
    up.normalize();
    const right = new THREE.Vector3(up.z, 0, -up.x).normalize();
    this.rightXZ = new THREE.Vector2(right.x, right.z);
    this.upXZ = new THREE.Vector2(up.x, up.z);
  }

  render(groundY) {
    if (!this.items.length) return;
    this.setupCameraBasis();
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, false, false);
    this.renderer.autoClear = false;

    const mat = this.baseMat; // 复用同一 program, 仅更新 uniforms
    const U = mat.uniforms;
    U.uLightDir.value.copy(this.lightDir);
    U.uGroundY.value = groundY;
    U.uOrthoHalf.value = this.orthoHalf;
    U.uCamXZ.value.copy(this.rightXZ);
    U.uCamZY.value.copy(this.upXZ);

    const tints = [
      new THREE.Color(1.5, 0.25, 0.25),
      new THREE.Color(0.3, 1.35, 0.3),
      new THREE.Color(0.25, 0.4, 1.55)
    ];
    for (const item of this.items) {
      const iors = channelIors(item.ior, item.dispersion);
      const passIors = [iors.r, iors.g, iors.b];
      U.uSphereCenter.value.copy(item.sphere.center);
      U.uSphereR.value = item.sphere.radius;
      const pts = new THREE.Points(item.cloud, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      for (let k = 0; k < 3; k++) {
        U.uIor.value = passIors[k];
        U.uTint.value.copy(tints[k]);
        this.renderer.render(this.scene, this.camera);
      }
      this.scene.remove(pts);
    }

    this.renderer.setRenderTarget(prev);
    this.renderer.autoClear = true;
  }

  // 地面上的焦散显示面
  createGroundPlane(groundY, white) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.rt.texture,
      transparent: true,
      opacity: white ? 0.55 : 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(this.orthoHalf * 2, this.orthoHalf * 2), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = groundY + 0.05;
    plane.renderOrder = 2;
    this.groundPlane = plane;
    return plane;
  }

  setWhiteMode(white) {
    if (this.groundPlane) this.groundPlane.material.opacity = white ? 0.55 : 0.95;
  }

  dispose() {
    this.rt.dispose();
    this.baseMat.dispose();
    this.groundPlane?.material.dispose();
    this.groundPlane?.geometry.dispose();
    this.items.forEach(i => i.cloud.dispose());
  }
}
