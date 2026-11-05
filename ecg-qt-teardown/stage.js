// Studio for the QT machine: a pale room, one sun with soft shadows, a small PMREM environment for the metal.
// frame(state, cam) poses the machine from run(q) and draws one frame.
import * as THREE from 'three';
import {BG, buildMachine} from './machine.js';

const V3 = THREE.Vector3;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 26, 48);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 120);

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e6ddd0');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 0.98, 0.95).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.2);
    box(3, 14, new V3(-12, 4, 6), 2.6);
    box(3, 14, new V3(12, 4, -4), 1.8);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.85;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#fff6ea', 2.1);
  sun.position.set(-4, 14, 9);
  sun.target.position.set(1.2, 0, -0.6);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -11, right: 11, top: 7, bottom: -7, near: 1, far: 40});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#fffaf2', '#cdbfa8', 0.75));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: BG, roughness: 1}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  floor.receiveShadow = true;
  scene.add(floor);
  const legMat = new THREE.MeshStandardMaterial({color: '#bdb2a2', roughness: 0.8});
  for (const [x, z] of [[-7.4, -3.9], [9.8, -3.9], [-7.4, 2.7], [9.8, 2.7]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18), legMat);
    l.position.set(x, -0.9, z);
    l.castShadow = true;
    scene.add(l);
  }

  const machine = buildMachine();
  scene.add(machine.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  // st: {res, t, focus, iso, explode, glass}; cam: {tx, ty, tz, az, el (radians), d, sx, sy}
  const frame = (st, cam) => {
    machine.update(st.res, st);
    camera.position.set(cam.tx + cam.d * Math.cos(cam.el) * Math.sin(cam.az), cam.ty + cam.d * Math.sin(cam.el), cam.tz + cam.d * Math.cos(cam.el) * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  };
  const pv = new V3();
  const project = (p) => {
    pv.set(p[0], p[1], p[2]).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({shadow}) => {
    sun.shadow.mapSize.set(shadow, shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
  return {renderer, scene, camera, machine, resize, frame, project, size, setQuality};
}
