// 主视口: WebGL2 物理渲染 + 后期(景深/辉光) + 轨道控制
// 视口与批量出图共用同一渲染管线, 保证"所见即所得"
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { JewelryBuilder } from './jewelryBuilder.js';
import { createMetalMaterial, createGemMaterial } from './materials.js';
import { createStudioEnvironment, createLights } from './environment.js';
import { CausticsPass } from './caustics.js';

// 相机视角方向(距离由首饰包围球自动计算, 保证完整入画)
export const CAMERA_PRESETS = {
  iso:    { dir: [0.72, 0.42, 0.85], up: [0, 1, 0] },
  front:  { dir: [0, 0.1, 1],        up: [0, 1, 0] },
  back:   { dir: [0, 0.1, -1],       up: [0, 1, 0] },
  left:   { dir: [-1, 0.1, 0],       up: [0, 1, 0] },
  right:  { dir: [1, 0.1, 0],        up: [0, 1, 0] },
  top:    { dir: [0.01, 1, 0.01],    up: [0, 0, -1] }
};

const GROUND_Y = -12;

export class ViewerScene {
  constructor(container, opts = {}) {
    this.container = container;
    this.config = null;
    this.autoRotate = false;
    this.enablePost = opts.post !== false;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
    this.camera.position.set(16, 12, 20);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 120;
    this.controls.target.set(0, 0, 0);

    this.envs = createStudioEnvironment(this.renderer);
    this.lights = createLights(this.scene);

    // 地面
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.92, metalness: 0 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = GROUND_Y;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 焦散
    this.caustics = new CausticsPass(this.renderer);
    this.caustics.setLightDirection(this.lights.key.position);
    this.scene.add(this.caustics.createGroundPlane(GROUND_Y, false));

    // 后期管线(缩略图等轻量场景可关)
    this.bokeh = null; this.bloom = null;
    if (this.enablePost) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 20, aperture: 0.00016, maxblur: 0.0065 });
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.45, 0.94);
      this.composer.addPass(this.bokeh);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    this._loop = this._loop.bind(this);
    this.raf = requestAnimationFrame(this._loop);
  }

  setConfig(config) {
    this.config = config;
    if (this.jewelry) {
      this.scene.remove(this.jewelry);
      this.jewelry.traverse(o => { o.geometry?.dispose(); });
    }
    const builder = new JewelryBuilder(config);
    this.jewelry = builder.build();
    this.measured = { metalVolumeMm3: builder.metalVolume, gemVolumeMm3: builder.gemVolume };

    const metalMat = createMetalMaterial(config);
    const gemMat = createGemMaterial(config);
    this.jewelry.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.material = o.userData.isGem ? gemMat : metalMat;
      }
    });
    this.scene.add(this.jewelry);

    // 计算首饰包围球, 自动取景保证完整入画
    const box = new THREE.Box3().setFromObject(this.jewelry);
    this.modelBox = box;
    this.modelCenter = box.getCenter(new THREE.Vector3());
    this.modelRadius = box.getSize(new THREE.Vector3()).length() / 2;
    this.frameObject('iso');

    // 焦散点云随宝石更新
    this.caustics.updateGems(builder.gemEntries);
    this.applyEnv(config.env);
    this.applyToggles();
    this.onMeasure?.(this.measured);
    return this.measured;
  }

  // 按包围球 + 视角方向取景
  frameObject(presetName = 'iso') {
    const p = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.iso;
    const center = this.modelCenter || new THREE.Vector3();
    const radius = (this.modelRadius || 10) * 1.28;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = this.camera.aspect;
    const distV = radius / Math.sin(vFov / 2);
    const distH = radius / (Math.sin(vFov / 2) * aspect);
    const dist = Math.max(distV, distH);
    const dir = new THREE.Vector3(...p.dir).normalize();
    this.camera.up.set(...p.up);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.update();
  }

  applyEnv(mode) {
    const white = mode === 'white';
    this.scene.environment = white ? this.envs.white : this.envs.studio;
    this.scene.background = new THREE.Color(white ? 0xffffff : 0x0e1014);
    this.ground.material.color.set(white ? 0xf4f4f5 : 0x14161b);
    this.caustics.setWhiteMode(white);
  }

  applyToggles() {
    if (!this.config || !this.enablePost) return;
    this.bokeh.enabled = !!this.config.dof;
    this.bloom.enabled = !!this.config.bloom;
    this.caustics.groundPlane.visible = !!this.config.caustics;
  }

  setCameraPreset(name) {
    this.frameObject(name);
  }

  syncCameraFrom(other) {
    this.camera.position.copy(other.camera.position);
    this.camera.up.copy(other.camera.up);
    this.controls.target.copy(other.controls.target);
    this.controls.update();
  }

  setAutoRotate(v) { this.autoRotate = v; this.controls.autoRotate = v; this.controls.autoRotateSpeed = 1.4; }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  // 指定分辨率离屏截图(与视口同管线): 返回 dataURL
  async screenshot(width, height, cameraPreset = null, envMode = null) {
    const oldEnv = this.config.env;
    if (envMode) { this.config = { ...this.config, env: envMode }; this.applyEnv(envMode); }
    if (cameraPreset) this.frameObject(cameraPreset);

    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (cameraPreset) this.frameObject(cameraPreset); // aspect 变化后重新取景

    // 等两帧让 transmission 缓存与焦散就绪
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    this._renderOnce();
    const url = this.renderer.domElement.toDataURL('image/png');

    this.renderer.setPixelRatio(pr);
    this.resize();
    if (envMode) { this.config = { ...this.config, env: oldEnv }; this.applyEnv(oldEnv); }
    return url;
  }

  _renderOnce() {
    if (this.config?.caustics && this.caustics.items.length) {
      this.caustics.render(GROUND_Y);
    }
    if (this.enablePost && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _loop() {
    this.raf = requestAnimationFrame(this._loop);
    this.controls.update();
    if (this.bokeh && this.bokeh.enabled) {
      this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(this.controls.target);
    }
    this._renderOnce();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.envs.dispose();
    this.caustics.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
