// ============================================================
// 视口:物理渲染(环境光照 + 软阴影 + 辉光 + 景深 + 轨道控制)
// 同一渲染管线用于交互视口与批量出图,保证两者一致
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const _envMap = new WeakMap(); // PMREM 纹理绑定渲染上下文,必须每个 renderer 各生成一份
export function getEnvironment(renderer) {
  if (!_envMap.has(renderer)) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    _envMap.set(renderer, pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  }
  return _envMap.get(renderer);
}

export class Viewport {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, preserveDrawingBuffer: true, alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
    this.camera.position.set(22, 16, 26);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 120;

    // 灯光:主光(软阴影)+ 补光 + 轮廓光
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    this.keyLight.position.set(12, 22, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = this.keyLight.shadow.camera.bottom = -25;
    this.keyLight.shadow.camera.right = this.keyLight.shadow.camera.top = 25;
    this.keyLight.shadow.camera.far = 80;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.radius = 6;
    this.scene.add(this.keyLight);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    fill.position.set(-14, 8, -6);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0dd, 1.4);
    rim.position.set(-4, 10, -18);
    this.scene.add(rim);
    this.fillLight = fill;
    this.rimLight = rim;

    // 地面
    this.groundY = -9;
    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 64),
      new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.9, metalness: 0 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = this.groundY;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 焦散贴地面
    this.causticsPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 1,
      })
    );
    this.causticsPlane.rotation.x = -Math.PI / 2;
    this.causticsPlane.position.y = this.groundY + 0.02;
    this.causticsPlane.visible = false;
    this.scene.add(this.causticsPlane);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);

    // 后处理
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.55, 0.92);
    this.composer.addPass(this.bloomPass);
    this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 30, aperture: 0.00018, maxblur: 0.008 });
    this.composer.addPass(this.bokehPass);
    this.composer.addPass(new OutputPass());

    this.background = 'studio';
    this._raf = null;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  setBackground(mode) {
    this.background = mode;
    if (mode === 'white') {
      this.scene.background = new THREE.Color(0xffffff);
      this.scene.environment = getEnvironment(this.renderer);
      this.scene.environmentIntensity = 0.45;
      this.ground.material.color.set(0xececec);
      this.ground.material.roughness = 0.95;
      // 白底模式压光,给焦散留出亮度余量
      this.keyLight.intensity = 1.1;
      this.fillLight.intensity = 0.4;
      this.rimLight.intensity = 0.6;
      this.causticsPlane.material.color.setScalar(1.8); // 白底下焦散增亮
    } else {
      this.scene.background = new THREE.Color(0x17181c);
      this.scene.environment = getEnvironment(this.renderer);
      this.scene.environmentIntensity = 1.0;
      this.ground.material.color.set(0x2a2c31);
      this.ground.material.roughness = 0.9;
      this.keyLight.intensity = 2.3;
      this.fillLight.intensity = 0.9;
      this.rimLight.intensity = 1.4;
      this.causticsPlane.material.color.setScalar(1.0);
    }
  }

  setModel(group) {
    this.modelRoot.clear();
    if (group) this.modelRoot.add(group);
    // 聚焦到模型,地面跟随模型底部
    const bb = new THREE.Box3().setFromObject(this.modelRoot);
    if (!bb.isEmpty()) {
      const c = bb.getCenter(new THREE.Vector3());
      this.controls.target.copy(c);
      this.bokehPass.uniforms['focus'].value = this.camera.position.distanceTo(c);
      this.groundY = bb.min.y - 3;
      this.ground.position.y = this.groundY;
      this.causticsPlane.position.y = this.groundY + 0.02;
      // 阴影相机跟随
      const s = Math.max(20, bb.getSize(new THREE.Vector3()).length());
      this.keyLight.shadow.camera.left = this.keyLight.shadow.camera.bottom = -s;
      this.keyLight.shadow.camera.right = this.keyLight.shadow.camera.top = s;
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.keyLight.target.position.copy(c);
      this.keyLight.position.copy(c).add(new THREE.Vector3(12, 22, 10));
      this.scene.add(this.keyLight.target);
    }
  }

  setCaustics(result) {
    if (!result) { this.causticsPlane.visible = false; return; }
    const tex = new THREE.CanvasTexture(result.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.causticsPlane.material.map?.dispose();
    this.causticsPlane.material.map = tex;
    this.causticsPlane.material.needsUpdate = true;
    this.causticsPlane.scale.set(result.patch, result.patch, 1);
    this.causticsPlane.position.x = result.center.x;
    this.causticsPlane.position.z = result.center.z;
    this.causticsPlane.visible = true;
  }

  // 自动取景:模型完整入画
  frameModel(dir = new THREE.Vector3(0.7, 0.5, 1)) {
    const bb = new THREE.Box3().setFromObject(this.modelRoot);
    if (bb.isEmpty()) return;
    const c = bb.getCenter(new THREE.Vector3());
    const r = bb.getSize(new THREE.Vector3()).length() / 2;
    const dist = Math.max(r * 3.0, 12);
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir.clone().normalize(), dist);
    this.controls.update();
  }

  resize() {
    const el = this.canvas.parentElement;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.controls.update();
      this.bokehPass.uniforms['focus'].value = this.camera.position.distanceTo(this.controls.target);
      this.composer.render();
    };
    loop();
  }
  stop() { cancelAnimationFrame(this._raf); this._raf = null; }

  // 离屏高分辨率渲染(与视口同一管线,保证出图一致)
  // 返回图像副本画布(原画布尺寸恢复后会被清空,必须先拷贝)
  renderStill(width, height, cameraPose) {
    const savedSize = new THREE.Vector2();
    this.renderer.getSize(savedSize);
    const savedPR = this.renderer.getPixelRatio();
    const savedCam = this.camera.clone();
    if (cameraPose) {
      this.camera.position.copy(cameraPose.position);
      this.camera.lookAt(cameraPose.target);
      this.controls.target.copy(cameraPose.target);
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bokehPass.uniforms['focus'].value = this.camera.position.distanceTo(this.controls.target);
    this.composer.render();
    // 拷贝结果
    const copy = document.createElement('canvas');
    copy.width = width; copy.height = height;
    copy.getContext('2d').drawImage(this.canvas, 0, 0);
    // 还原
    this.camera.copy(savedCam);
    this.camera.aspect = savedSize.x / savedSize.y;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(savedPR);
    this.renderer.setSize(savedSize.x, savedSize.y, false);
    this.composer.setSize(savedSize.x, savedSize.y);
    return copy;
  }

  dispose() {
    this.stop();
    this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
