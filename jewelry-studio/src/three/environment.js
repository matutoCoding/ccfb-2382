// 程序化摄影棚环境: 渐变天幕 + 柔光箱, PMREM 烘焙为环境贴图(无外部资源)
import * as THREE from 'three';

export function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);

  function build(white) {
    const scene = new THREE.Scene();
    if (white) {
      scene.background = new THREE.Color(0xffffff);
    } else {
      // 天幕渐变球
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 20),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          uniforms: {
            top: { value: new THREE.Color(0x2b3242) },
            mid: { value: new THREE.Color(0x171b23) },
            bot: { value: new THREE.Color(0x0a0c10) }
          },
          vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
          fragmentShader: `
            varying vec3 vP; uniform vec3 top, mid, bot;
            void main(){
              float h = normalize(vP).y * 0.5 + 0.5;
              vec3 c = mix(bot, mid, smoothstep(0.0, 0.55, h));
              c = mix(c, top, smoothstep(0.55, 1.0, h));
              gl_FragColor = vec4(c, 1.0);
            }`
        })
      );
      scene.add(sky);
    }

    // 柔光箱: 自发光大板, 给金属反射和宝石高光
    const softBox = (w, h, pos, target, intensity, tint = 0xffffff) => {
      const box = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity) })
      );
      box.position.copy(pos);
      box.lookAt(target);
      scene.add(box);
      return box;
    };
    softBox(14, 9, new THREE.Vector3(9, 11, 8), new THREE.Vector3(0, 2, 0), white ? 2.2 : 3.4);
    softBox(10, 12, new THREE.Vector3(-10, 5, 5), new THREE.Vector3(0, 2, 0), white ? 1.4 : 2.1, 0xdfe8ff);
    softBox(16, 6, new THREE.Vector3(0, 3, -11), new THREE.Vector3(0, 2, 0), white ? 1.6 : 2.4, 0xfff2dd);
    softBox(7, 7, new THREE.Vector3(0, -6, 6), new THREE.Vector3(0, 2, 0), white ? 0.8 : 1.2); // 底部补光

    const tex = pmrem.fromScene(scene, 0.04).texture;
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    return tex;
  }

  return {
    studio: build(false),
    white: build(true),
    dispose() { this.studio.dispose(); this.white.dispose(); pmrem.dispose(); }
  };
}

// 摄影棚灯光: 主光/辅光/轮廓光, 产生软阴影
export function createLights(scene) {
  const key = new THREE.DirectionalLight(0xfff4e0, 3.2);
  key.position.set(8, 14, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 45;
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6; // PCFSoft 阴影柔化
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcfe0ff, 1.1);
  fill.position.set(-9, 6, 4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(0, 7, -10);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x2a2118, 0.5);
  scene.add(hemi);

  return { key, fill, rim, hemi };
}
