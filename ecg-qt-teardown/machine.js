// The machine's geometry, built from code, and update(res) that poses every part from run(q). Nothing here keeps its
// own numbers: positions, fills, angles and textures all come from the model result.
import * as THREE from 'three';
import {BINS, GREY, LOUPE_BEAT, LOWER_SQ, N, NOMOGRAM, Q_RANGE, RR_MAX, RR_MIN, run, RULES, SQUARE, UPPER_SQ} from './model.js';

const HR_LO = 60000 / RR_MAX; // the HR window the RR governor allows
const HR_HI = 60000 / RR_MIN;
const GRADES = Math.max(...RULES.map((r) => r.grade));

export const INK = '#1f1c19';
export const ACC = '#e8336f'; // the one accent: the part doing the work right now
export const PAPER = '#fbf6ee';
export const BG = '#efe9df';

// ------------------------------------------------------------------------------------------------ layout (units)
// The loupe: one beat magnified, x by paint value c, y by lifted mV. The hoppers sit under their colour bins.
export const LX = (c) => (c - 340) * 0.01125; // 40 ms = 0.45 u
export const LOUPE = {c0: -40, c1: 600, z: -1.75, y0: 0.45, y1: 3.05, base: 1.0, k: 1.9};
export const LY = (v) => LOUPE.base + v * LOUPE.k;
export const HX = (k) => LX(160 + 40 * k + 20); // hopper k (0-based) under bin k
export const DX = (k) => HX(k) + 0.225; // D gear k between hoppers k and k+1
export const SX = (j) => HX(j + 1); // S gear j (0-based) centred on the middle bin of its three
export const IPX = (ip) => HX(ip - 0.5) + 0.225; // IP = j + 0.5 sits between S_j and S_j+1
// The whole strip: 10 s across 10 u
export const STRIP = {z: -3.3, x0: -5, x1: 5, y0: 3.35, y1: 4.15, base: 3.6, k: 0.36};
export const SXp = (s) => STRIP.x0 + (s - 0.5) / 1000;
export const SY = (v) => STRIP.base + v * STRIP.k;
export const HOP = {z: -0.45, r: 0.17, h: 1.75};
export const DG = {z: 0.45, y: 0.5, r: 0.17};
export const SG = {z: 1.15, y: 0.5, r: 0.205};
export const RAIL = {z: 1.85, y: 0.12};
export const GATE = {x0: 3.05, dx: 0.4, z: 0.15};
export const DIAL = {x: 4.85, y: 0.95, z: 1.75, r: 0.78};
export const BENCH = {x: 8.7, z: 0.1};
export const GOV = {x: -6.35, z: -1.0};
export const CAM = {x: -6.35, z: 0.95, y: 1.15, r: 0.62};

// Scales fixed once over the whole q range, so a fill or an angle means the same thing at every q
export const SCALE = (() => {
  let a = 0;
  let d = 0;
  let s = 0;
  for (let q = Q_RANGE[0]; q <= Q_RANGE[1]; q += 5) {
    const r = run(q);
    a = Math.max(a, ...r.integ.A);
    d = Math.max(d, ...r.inf.D.map(Math.abs));
    s = Math.max(s, ...r.inf.S.map(Math.abs));
  }
  return {A: a, D: d, S: s};
})();

const binCol = BINS.map((b) => new THREE.Color(b.col));

// ------------------------------------------------------------------------------------------------ helpers
function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return {c, g: c.getContext('2d'), t};
}
function gearShape(r, teeth, depth = 0.035, hole = 0.045) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ph = i % 4;
    const rr = ph === 1 || ph === 2 ? r : r - depth;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  return s;
}
const FONT = (w, px) => `${w} ${px}px "JetBrains Mono", ui-monospace, monospace`;

// ------------------------------------------------------------------------------------------------ build
export function buildMachine() {
  const root = new THREE.Group();
  const groups = {};
  const mats = []; // [material, group key, base opacity]
  const G = (key) => {
    if (!groups[key]) {
      groups[key] = new THREE.Group();
      groups[key].userData.key = key;
      root.add(groups[key]);
    }
    return groups[key];
  };
  const M = (key, params, Kind = THREE.MeshStandardMaterial) => {
    // every material is transparent from the start, so fading a subsystem never recompiles a shader
    const m = new Kind({...params, transparent: true});
    mats.push([m, key, params.opacity ?? 1, params.depthWrite === false]);
    return m;
  };
  const mesh = (key, geo, mat, pos = [0, 0, 0], shadow = true) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...pos);
    o.castShadow = shadow;
    o.receiveShadow = true;
    G(key).add(o);
    return o;
  };
  const metal = (k) => M(k, {color: '#8d9299', metalness: 0.55, roughness: 0.45, envMapIntensity: 0.6});
  const dark = (k) => M(k, {color: '#34302c', roughness: 0.55, metalness: 0.2});
  const body = (k, c = '#d9d1c5') => M(k, {color: c, roughness: 0.8});
  const glass = (k, o = 0.16) => M(k, {color: '#ffffff', roughness: 0.08, metalness: 0, transparent: true, opacity: o, depthWrite: false});

  // ---------------------------------------------------------------- the table
  {
    const t = mesh('table', new THREE.BoxGeometry(17.6, 0.2, 7.2), M('table', {color: '#e4dbcd', roughness: 0.92}), [1.2, -0.1, -0.6]);
    t.castShadow = false;
  }

  // ---------------------------------------------------------------- 1 the strip feeder (10 s, 10 000 samples)
  const stripTex = canvasTex(4096, 328);
  {
    const w = STRIP.x1 - STRIP.x0;
    const h = STRIP.y1 - STRIP.y0;
    const paper = mesh('feeder', new THREE.PlaneGeometry(w, h), M('feeder', {map: stripTex.t, roughness: 0.95}), [0, (STRIP.y0 + STRIP.y1) / 2, STRIP.z]);
    paper.castShadow = false;
    mesh('feeder', new THREE.BoxGeometry(w + 0.2, h + 0.12, 0.05), body('feeder', '#cfc5b6'), [0, (STRIP.y0 + STRIP.y1) / 2, STRIP.z - 0.035]);
    for (const sx of [-1, 1]) {
      mesh('feeder', new THREE.CylinderGeometry(0.22, 0.22, 0.95, 40), M('feeder', {color: PAPER, roughness: 0.9}), [sx * 5.32, 3.75, STRIP.z]);
      mesh('feeder', new THREE.CylinderGeometry(0.05, 0.05, 1.1, 16), metal('feeder'), [sx * 5.32, 3.75, STRIP.z]);
      mesh('feeder', new THREE.BoxGeometry(0.1, 3.3, 0.1), dark('feeder'), [sx * 5.32, 1.65, STRIP.z]);
    }
  }
  // ---------------------------------------------------------------- 2 the R-peak detector: a rail of pins over the strip
  const pins = [];
  const ticks = [];
  {
    mesh('rpeak', new THREE.BoxGeometry(10.3, 0.07, 0.12), metal('rpeak'), [0, 4.42, STRIP.z + 0.08]);
    const pinMat = M('rpeak', {color: ACC, roughness: 0.4, emissive: ACC, emissiveIntensity: 0.15});
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), metal('rpeak'));
      rod.castShadow = true;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 16), pinMat);
      tip.rotation.x = Math.PI;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), pinMat);
      p.add(rod, tip, head);
      p.userData = {rod, tip, head};
      G('rpeak').add(p);
      pins.push(p);
    }
    // every candidate peak from findpeaks pass 1 (most are < 0.7 mV and rejected): a small bead on the strip
    const beadGeo = new THREE.SphereGeometry(0.018, 10, 8);
    const beadMat = M('rpeak', {color: '#8d8478', roughness: 0.6});
    for (let i = 0; i < 80; i++) {
      const b = new THREE.Mesh(beadGeo, beadMat);
      b.visible = false;
      G('rpeak').add(b);
      ticks.push(b);
    }
    // the 0.7 mV keep threshold, raw (= 0.82 mV lifted), as a thin bar across the strip
    mesh('rpeak', new THREE.BoxGeometry(10, 0.008, 0.01), M('rpeak', {color: ACC, transparent: true, opacity: 0.55}), [0, SY(0.82), STRIP.z + 0.02], false);
  }
  // ---------------------------------------------------------------- 3 the RR governor (a flyball governor spun at HR)
  const gov = {};
  {
    const g = new THREE.Group();
    g.position.set(GOV.x, 0, GOV.z);
    G('gov').add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 40), dark('gov'));
    base.position.y = 0.08;
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 16), metal('gov'));
    spindle.position.y = 0.95;
    const head = new THREE.Group();
    head.position.y = 1.72;
    const ballMat = M('gov', {color: ACC, roughness: 0.35, metalness: 0.3});
    const arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 8), metal('gov'));
      rod.position.y = -0.35;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), ballMat);
      ball.position.y = -0.7;
      ball.castShadow = true;
      arm.add(rod, ball);
      arm.userData.sx = sx;
      head.add(arm);
      arms.push(arm);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 20), metal('gov'));
    head.add(collar);
    g.add(base, spindle, head);
    for (const o of [base, spindle]) o.castShadow = true;
    Object.assign(gov, {g, head, arms});
  }
  // ---------------------------------------------------------------- 4 the nomogram cam (profile unknown: table not attached)
  const camTex = canvasTex(512, 512);
  const cam = {};
  {
    const disk = mesh('nomo', new THREE.CylinderGeometry(CAM.r, CAM.r, 0.06, 64), dark('nomo'), [CAM.x, CAM.y, CAM.z]);
    disk.rotation.x = Math.PI / 2;
    mesh('nomo', new THREE.CircleGeometry(CAM.r - 0.01, 64), M('nomo', {map: camTex.t, roughness: 0.7}), [CAM.x, CAM.y, CAM.z + 0.031], false);
    mesh('nomo', new THREE.BoxGeometry(0.12, CAM.y, 0.12), dark('nomo'), [CAM.x, CAM.y / 2, CAM.z - 0.06]);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, CAM.r * 0.86, 0.012), M('nomo', {color: ACC}));
    needle.geometry.translate(0, CAM.r * 0.43, 0);
    needle.position.set(CAM.x, CAM.y, CAM.z + 0.045);
    G('nomo').add(needle);
    const follower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 12), metal('nomo'));
    G('nomo').add(follower);
    const plate = canvasTex(512, 128);
    const tag = mesh('nomo', new THREE.PlaneGeometry(1.1, 0.275), M('nomo', {map: plate.t, roughness: 0.8, transparent: true}), [CAM.x, CAM.y + CAM.r + 0.62, CAM.z + 0.02], false);
    Object.assign(cam, {needle, follower, plate, tag});
  }
  // ---------------------------------------------------------------- 5 the loupe (one beat) and the paint head over it
  const loupeTex = canvasTex(2048, 740);
  const paint = {};
  {
    const w = LX(LOUPE.c1) - LX(LOUPE.c0);
    const h = LOUPE.y1 - LOUPE.y0;
    const cx = (LX(LOUPE.c1) + LX(LOUPE.c0)) / 2;
    const board = mesh('paint', new THREE.PlaneGeometry(w, h), M('paint', {map: loupeTex.t, roughness: 0.95}), [cx, (LOUPE.y0 + LOUPE.y1) / 2, LOUPE.z]);
    board.castShadow = false;
    mesh('paint', new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), body('paint', '#cdc3b4'), [cx, (LOUPE.y0 + LOUPE.y1) / 2, LOUPE.z - 0.04]);
    for (const x of [LX(LOUPE.c0) + 0.2, LX(LOUPE.c1) - 0.2]) mesh('paint', new THREE.BoxGeometry(0.08, LOUPE.y0, 0.08), dark('paint'), [x, LOUPE.y0 / 2, LOUPE.z - 0.05]);
    // the gantry rail, and the paint arm: from the head (R - 28) out to the last painted sample
    mesh('paint', new THREE.BoxGeometry(w + 0.3, 0.06, 0.1), metal('paint'), [cx, LOUPE.y1 + 0.2, LOUPE.z + 0.06]);
    const armTex = canvasTex(1024, 16);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.07), M('paint', {map: armTex.t, roughness: 0.5}));
    arm.castShadow = true;
    G('paint').add(arm);
    const head = mesh('paint', new THREE.BoxGeometry(0.2, 0.22, 0.22), dark('paint'), [0, LOUPE.y1 + 0.2, LOUPE.z + 0.12]);
    const nozzle = mesh('paint', new THREE.ConeGeometry(0.05, 0.14, 16), M('paint', {color: ACC}), [0, LOUPE.y1 + 0.03, LOUPE.z + 0.12]);
    nozzle.rotation.x = Math.PI;
    Object.assign(paint, {arm, armTex, head, nozzle});
  }
  // ---------------------------------------------------------------- 6 the colour ruler under the loupe
  const rulerTex = canvasTex(2048, 160);
  {
    const x0 = LX(160);
    const x1 = LX(520);
    mesh('ruler', new THREE.BoxGeometry(x1 - x0 + 0.1, 0.06, 0.34), body('ruler', '#d6ccbd'), [(x0 + x1) / 2, 0.03, LOUPE.z + 0.22]);
    const face = mesh('ruler', new THREE.PlaneGeometry(x1 - x0 + 0.1, (x1 - x0 + 0.1) * (160 / 2048)), M('ruler', {map: rulerTex.t, roughness: 0.9}), [(x0 + x1) / 2, 0.16, LOUPE.z + 0.2], false);
    face.rotation.x = -1.05;
  }
  // ---------------------------------------------------------------- 7 the trapezoid integrator: a housing with 9 chutes
  const integ = {};
  {
    const x0 = LX(160);
    const x1 = LX(520);
    const housingMat = M('integ', {color: '#cfc6b8', roughness: 0.7, transparent: true, opacity: 1});
    integ.housingMat = housingMat;
    mesh('integ', new THREE.BoxGeometry(x1 - x0 + 0.1, 0.3, 0.36), housingMat, [(x0 + x1) / 2, 0.15, -1.18]);
    // a trapezoid prism per bin: the shape it sums (|mv_i| + |mv_i+1|) / 2 x 1 ms
    const tr = new THREE.Shape();
    tr.moveTo(-0.12, 0);
    tr.lineTo(0.12, 0);
    tr.lineTo(0.12, 0.1);
    tr.lineTo(-0.12, 0.17);
    tr.closePath();
    const trGeo = new THREE.ExtrudeGeometry(tr, {depth: 0.12, bevelEnabled: false});
    integ.traps = [];
    for (let k = 0; k < 9; k++) {
      const m = mesh('integ', trGeo, M('integ', {color: BINS[k].col, roughness: 0.5}), [HX(k), 0.08, -1.24]);
      integ.traps.push(m);
      // chute down to the hopper
      const ch = mesh('integ', new THREE.BoxGeometry(0.1, 0.05, 0.6), metal('integ'), [HX(k), 0.32, -0.85]);
      ch.rotation.x = -0.25;
    }
  }
  // ---------------------------------------------------------------- 8 the nine hoppers
  const hop = [];
  {
    for (let k = 0; k < 9; k++) {
      const x = HX(k);
      mesh('hoppers', new THREE.CylinderGeometry(HOP.r + 0.03, HOP.r + 0.04, 0.06, 32), dark('hoppers'), [x, 0.03, HOP.z]);
      mesh('hoppers', new THREE.CylinderGeometry(HOP.r, HOP.r, HOP.h, 32, 1, true), glass('hoppers', 0.3), [x, 0.06 + HOP.h / 2, HOP.z], false);
      mesh('hoppers', new THREE.TorusGeometry(HOP.r, 0.012, 8, 32), metal('hoppers'), [x, 0.06 + HOP.h, HOP.z]).rotation.x = Math.PI / 2;
      const liq = mesh('hoppers', new THREE.CylinderGeometry(HOP.r - 0.012, HOP.r - 0.012, 1, 32), M('hoppers', {color: BINS[k].col, roughness: 0.3, transparent: true, opacity: 0.92}), [x, 0, HOP.z], false);
      hop.push(liq);
    }
  }
  // ---------------------------------------------------------------- 9 the first-difference gear train (8)
  const dg = [];
  {
    const geo = new THREE.ExtrudeGeometry(gearShape(DG.r, 14), {depth: 0.05, bevelEnabled: false});
    geo.translate(0, 0, -0.025);
    mesh('dgears', new THREE.BoxGeometry(LX(520) - LX(160), 0.06, 0.12), dark('dgears'), [0, 0.03, DG.z - 0.08]);
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group();
      g.position.set(DX(k), DG.y, DG.z);
      const gear = new THREE.Mesh(geo, metal('dgears'));
      gear.castShadow = true;
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.018, DG.r * 0.85, 0.012), M('dgears', {color: INK}));
      needle.geometry.translate(0, DG.r * 0.42, 0.035);
      gear.add(needle);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, DG.y, 0.05), dark('dgears'));
      post.position.set(0, -DG.y / 2, -0.06);
      g.add(gear, post);
      G('dgears').add(g);
      dg.push(gear);
    }
  }
  // ---------------------------------------------------------------- 10 the second-difference gear train (7)
  const sg = [];
  {
    const geo = new THREE.ExtrudeGeometry(gearShape(SG.r, 18), {depth: 0.06, bevelEnabled: false});
    geo.translate(0, 0, -0.03);
    mesh('sgears', new THREE.BoxGeometry(LX(480) - LX(200) + 0.5, 0.06, 0.12), dark('sgears'), [SX(3), 0.03, SG.z - 0.09]);
    for (let j = 0; j < 7; j++) {
      const g = new THREE.Group();
      g.position.set(SX(j), SG.y, SG.z);
      const mat = M('sgears', {color: '#9aa0a8', metalness: 0.5, roughness: 0.45, emissive: '#000000'});
      const gear = new THREE.Mesh(geo, mat);
      gear.castShadow = true;
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, SG.r * 0.85, 0.012), M('sgears', {color: INK}));
      needle.geometry.translate(0, SG.r * 0.42, 0.04);
      gear.add(needle);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, SG.y, 0.05), dark('sgears'));
      post.position.set(0, -SG.y / 2, -0.07);
      g.add(gear, post);
      G('sgears').add(g);
      sg.push({gear, mat});
    }
  }
  // ---------------------------------------------------------------- 11 the inflection selector: a rail with 7 detents
  const ipsel = {};
  {
    const xa = IPX(1.5) - 0.35;
    const xb = IPX(7.5) + 0.25;
    mesh('ipsel', new THREE.BoxGeometry(xb - xa, 0.05, 0.16), metal('ipsel'), [(xa + xb) / 2, RAIL.y - 0.05, RAIL.z]);
    const det = M('ipsel', {color: '#6f675d', roughness: 0.6});
    for (let j = 1; j <= 7; j++) mesh('ipsel', new THREE.BoxGeometry(0.03, 0.03, 0.2), det, [IPX(j + 0.5), RAIL.y - 0.01, RAIL.z]);
    const car = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.24), M('ipsel', {color: ACC, roughness: 0.4}));
    block.castShadow = true;
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), M('ipsel', {color: ACC, roughness: 0.4}));
    ptr.position.set(0, 0.16, 0);
    ptr.rotation.x = Math.PI;
    car.add(block, ptr);
    car.position.y = RAIL.y + 0.06;
    car.position.z = RAIL.z;
    G('ipsel').add(car);
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.24), M('ipsel', {color: ACC, transparent: true, opacity: 0.25, depthWrite: false}));
    ghost.position.set(0, RAIL.y + 0.06, RAIL.z);
    G('ipsel').add(ghost);
    // a wire up to the gear that set m
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), M('ipsel', {color: ACC}));
    G('ipsel').add(wire);
    Object.assign(ipsel, {car, ghost, wire});
  }
  // ---------------------------------------------------------------- 12 the rule gate bank (10 barrier gates)
  const gates = [];
  const gateTex = canvasTex(1024, 96);
  {
    const xb = GATE.x0 + GATE.dx * 9;
    mesh('gates', new THREE.BoxGeometry(xb - GATE.x0 + 0.5, 0.08, 0.6), body('gates', '#d3c9bb'), [(GATE.x0 + xb) / 2, 0.04, GATE.z]);
    mesh('gates', new THREE.PlaneGeometry(xb - GATE.x0 + 0.4, (xb - GATE.x0 + 0.4) * (96 / 1024)), M('gates', {map: gateTex.t, roughness: 0.9}), [(GATE.x0 + xb) / 2, 0.081, GATE.z + 0.2], false).rotation.x = -Math.PI / 2;
    // the lane the token runs along
    mesh('gates', new THREE.BoxGeometry(xb - GATE.x0 + 0.3, 0.012, 0.1), dark('gates'), [(GATE.x0 + xb) / 2, 0.086, GATE.z - 0.05]);
    for (let i = 0; i < 10; i++) {
      const x = GATE.x0 + i * GATE.dx;
      const post = mesh('gates', new THREE.BoxGeometry(0.06, 0.42, 0.06), dark('gates'), [x - 0.15, 0.29, GATE.z - 0.05]);
      void post;
      const pivot = new THREE.Group();
      pivot.position.set(x - 0.15, 0.46, GATE.z - 0.05);
      const mat = M('gates', {color: '#f5efe6', roughness: 0.5, emissive: '#000000'});
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.04), mat);
      arm.geometry.translate(0.17, 0, 0);
      arm.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.047, 0.042), M('gates', {color: INK}));
      stripe.position.x = 0.22;
      arm.add(stripe);
      pivot.add(arm);
      G('gates').add(pivot);
      gates.push({pivot, mat});
    }
    const token = mesh('gates', new THREE.SphereGeometry(0.07, 24, 16), M('gates', {color: ACC, roughness: 0.3, metalness: 0.2}), [GATE.x0, 0.16, GATE.z - 0.05]);
    gates.token = token;
  }
  // ---------------------------------------------------------------- 13 the output dial
  const dialTex = canvasTex(1024, 600);
  const dial = {};
  {
    const face = mesh('output', new THREE.PlaneGeometry(DIAL.r * 2.3, DIAL.r * 2.3 * (600 / 1024)), M('output', {map: dialTex.t, roughness: 0.85}), [DIAL.x, DIAL.y + 0.1, DIAL.z], false);
    void face;
    mesh('output', new THREE.BoxGeometry(DIAL.r * 2.4, DIAL.r * 1.45, 0.08), body('output', '#cfc5b6'), [DIAL.x, DIAL.y + 0.1, DIAL.z - 0.05]);
    mesh('output', new THREE.BoxGeometry(0.12, DIAL.y - 0.3, 0.12), dark('output'), [DIAL.x, (DIAL.y - 0.3) / 2, DIAL.z - 0.08]);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.025, DIAL.r * 0.9, 0.015), M('output', {color: INK}));
    needle.geometry.translate(0, DIAL.r * 0.45, 0);
    needle.position.set(DIAL.x, DIAL.y - 0.25, DIAL.z + 0.02);
    G('output').add(needle);
    const hub = mesh('output', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 20), M('output', {color: INK}), [DIAL.x, DIAL.y - 0.25, DIAL.z + 0.03]);
    hub.rotation.x = Math.PI / 2;
    Object.assign(dial, {needle});
  }
  // ---------------------------------------------------------------- 14 the C5.0 comparison bench
  const c50 = {};
  {
    const {x, z} = BENCH;
    mesh('c50', new THREE.BoxGeometry(2.2, 0.12, 2.6), body('c50', '#d6ccbd'), [x, 0.06, z + 0.3]);
    const shell = M('c50', {color: '#3b3732', roughness: 0.5, transparent: true, opacity: 1});
    c50.shell = shell;
    mesh('c50', new THREE.BoxGeometry(1.2, 0.9, 0.9), shell, [x + 0.25, 0.57, z]);
    // six input pipes from the left: S1..S5 and IP
    for (let i = 0; i < 6; i++) {
      const p = mesh('c50', new THREE.CylinderGeometry(0.035, 0.035, 0.9, 12), M('c50', {color: i < 5 ? '#9aa0a8' : ACC, metalness: 0.4, roughness: 0.45}), [x - 0.8, 0.3 + i * 0.11, z - 0.3 + i * 0.12]);
      p.rotation.z = Math.PI / 2;
    }
    // inside: a rule tree whose split nodes are blank (learned from data, not available)
    const nodeMat = M('c50', {color: '#f5efe6', roughness: 0.6});
    const pts = [[0, 0.95], [-0.3, 0.7], [0.3, 0.7], [-0.42, 0.45], [-0.18, 0.45], [0.18, 0.45], [0.42, 0.45]];
    for (const [px, py] of pts) mesh('c50', new THREE.SphereGeometry(0.05, 16, 12), nodeMat, [x + 0.25 + px, py, z]);
    const lk = M('c50', {color: '#f5efe6'});
    for (const [a, b] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]]) {
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const len = Math.hypot(bx - ax, by - ay);
      const l = mesh('c50', new THREE.CylinderGeometry(0.008, 0.008, len, 6), lk, [x + 0.25 + (ax + bx) / 2, (ay + by) / 2, z]);
      l.rotation.z = Math.atan2(bx - ax, -(by - ay)) + Math.PI;
    }
    // the five folds of the cross-validation, the test fold lifted
    for (let f = 0; f < 5; f++) mesh('c50', new THREE.BoxGeometry(0.28, 0.06, 0.6), M('c50', {color: f === 0 ? ACC : '#bdb3a5', roughness: 0.7}), [x - 0.6 + f * 0.32, 0.15 + (f === 0 ? 0.06 : 0), z + 1.15]);
    const lamp = mesh('c50', new THREE.SphereGeometry(0.09, 20, 14), M('c50', {color: '#b9b0a3', roughness: 0.4}), [x + 0.95, 0.9, z + 0.3]);
    void lamp;
  }

  // ------------------------------------------------------------------------------------------------ textures
  let lastKey = '';
  let lastNom = '';
  function drawStrip(res) {
    const {g, c, t} = stripTex;
    const W = c.width;
    const H = c.height;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    // the grid: 1 small square = 40 ms = 0.1 mV-equivalent; big square every 5
    const pxMs = W / N;
    const pxMv = H * (STRIP.k / (STRIP.y1 - STRIP.y0));
    const y0 = H * (1 - (STRIP.base - STRIP.y0) / (STRIP.y1 - STRIP.y0));
    for (let i = 0; i * 40 <= N; i++) {
      g.fillStyle = i % 5 ? 'rgba(232,120,140,.18)' : 'rgba(232,120,140,.42)';
      g.fillRect(i * 40 * pxMs, 0, i % 5 ? 1 : 2, H);
    }
    for (let j = -10; j <= 20; j++) {
      const y = y0 - j * 0.1 * pxMv;
      g.fillStyle = j % 5 ? 'rgba(232,120,140,.18)' : 'rgba(232,120,140,.42)';
      g.fillRect(0, y, W, j % 5 ? 1 : 2);
    }
    // the paint: every sample with a hopper gets its bin colour, painted-but-binless samples grey
    const {mv, paint, integ: ig} = res;
    for (let i = 0; i < N; i++) {
      if (paint[i] >= GREY) continue;
      const k = ig.bin[i];
      g.fillStyle = k >= 0 ? BINS[k].col : 'rgba(150,140,128,.55)';
      const y = y0 - mv[i] * pxMv;
      g.fillRect(i * pxMs, Math.min(y, y0), pxMs + 0.6, Math.abs(y - y0));
    }
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      const x = i * pxMs;
      const y = y0 - mv[i] * pxMv;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    t.needsUpdate = true;
  }
  function drawLoupe(res) {
    const {g, c, t} = loupeTex;
    const W = c.width;
    const H = c.height;
    const R = res.det.R[LOUPE_BEAT - 1] ?? res.det.R[0];
    const s0 = R - 28; // the sample with paint value 0 (paint c sits at s0 + c)
    const px = (cv) => ((cv - LOUPE.c0) / (LOUPE.c1 - LOUPE.c0)) * W;
    const py = (v) => H * (1 - (LY(v) - LOUPE.y0) / (LOUPE.y1 - LOUPE.y0));
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    // grid: small square 40 ms wide
    for (let cv = 0; cv <= LOUPE.c1; cv += 40) {
      g.fillStyle = cv % 200 ? 'rgba(232,120,140,.22)' : 'rgba(232,120,140,.5)';
      g.fillRect(px(cv), 0, cv % 200 ? 1.5 : 3, H);
    }
    for (let j = -3; j <= 11; j++) {
      g.fillStyle = j % 5 ? 'rgba(232,120,140,.22)' : 'rgba(232,120,140,.5)';
      g.fillRect(0, py(j * 0.1), W, j % 5 ? 1.5 : 3);
    }
    // the rule's estimated QT window, a hatched band
    if (res.out.window) {
      const a = px(res.out.window[0]);
      const b = px(res.out.window[1]);
      g.save();
      g.fillStyle = 'rgba(232,51,111,.10)';
      g.fillRect(a, 0, b - a, H);
      g.strokeStyle = 'rgba(232,51,111,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.rect(a, 0, b - a, H);
      g.clip();
      for (let x = a - H; x < b; x += 18) {
        g.moveTo(x, H);
        g.lineTo(x + H, 0);
      }
      g.stroke();
      g.restore();
      g.fillStyle = ACC;
      g.font = FONT(700, 22);
      g.fillText(`${res.out.rule.id} WINDOW ${res.out.window[0]}–${res.out.window[1]}`, a + 8, 30);
    }
    // the paint under the curve
    const {mv, paint, integ: ig} = res;
    const step = W / (LOUPE.c1 - LOUPE.c0);
    for (let cv = LOUPE.c0; cv < LOUPE.c1; cv++) {
      const i = s0 + cv - 1;
      if (i < 0 || i >= N || paint[i] >= GREY) continue;
      const k = ig.bin[i];
      g.fillStyle = k >= 0 ? BINS[k].col : 'rgba(150,140,128,.5)';
      const y = py(mv[i]);
      const yb = py(0);
      g.fillRect(px(cv), Math.min(y, yb), step + 0.8, Math.abs(y - yb));
    }
    // markers: QT_nom (placeholder) and the true q of this synthetic beat
    const vline = (cv, col, dash, label, top) => {
      g.save();
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.setLineDash(dash);
      g.beginPath();
      g.moveTo(px(cv), 40);
      g.lineTo(px(cv), H);
      g.stroke();
      g.restore();
      g.fillStyle = col;
      g.font = FONT(700, 20);
      const tw = g.measureText(label).width;
      g.fillText(label, Math.min(W - tw - 6, px(cv) + 6), top);
    };
    vline(res.nom.qt, INK, [10, 8], `QT_nom ${res.nom.qt}${NOMOGRAM.placeholder ? ' (PLACEHOLDER)' : ''}`, 64);
    vline(res.q, ACC, [], `q = ${Math.round(res.q)} ms`, 96);
    // the trace
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    for (let cv = LOUPE.c0; cv < LOUPE.c1; cv++) {
      const i = s0 + cv - 1;
      const v = mv[Math.max(0, Math.min(N - 1, i))];
      if (cv === LOUPE.c0) g.moveTo(px(cv), py(v));
      else g.lineTo(px(cv), py(v));
    }
    g.stroke();
    g.fillStyle = '#8d8478';
    g.font = FONT(600, 18);
    g.fillText(`BEAT ${LOUPE_BEAT} OF ${res.det.R.length} · R at sample ${R} · x: paint value (ms) · y: mV ×${LOUPE.k} · SHAPE INVENTED`, 14, H - 14);
    t.needsUpdate = true;
  }
  function drawRuler(res) {
    const {g, c, t} = rulerTex;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f6f0e6';
    g.fillRect(0, 0, W, H);
    const bins = res.ruler.bins;
    const lo = bins[0].lo;
    const hi = bins[8].hi;
    const px = (v) => 26 + ((v - lo) / (hi - lo)) * (W - 52);
    bins.forEach((b, k) => {
      g.fillStyle = b.col;
      g.fillRect(px(b.lo) + 2, 70, px(b.hi) - px(b.lo) - 4, 30);
      g.fillStyle = INK;
      g.font = FONT(700, 22);
      const n = b.name;
      g.fillText(n, (px(b.lo) + px(b.hi)) / 2 - g.measureText(n).width / 2, 56);
      g.font = FONT(500, 18);
      const iv = k === 0 ? `(${b.lo},${b.hi})` : `(${b.lo},${b.hi}]`;
      g.fillStyle = '#6d6357';
      g.fillText(iv, (px(b.lo) + px(b.hi)) / 2 - g.measureText(iv).width / 2, 128);
      g.fillText(`n=${res.integ.count[k]}`, (px(b.lo) + px(b.hi)) / 2 - 30, 152);
    });
    g.fillStyle = INK;
    g.font = FONT(700, 20);
    g.fillText(`QT_nom−${LOWER_SQ * SQUARE + SQUARE}`, 4, 22);
    const tx = `QT_nom+${UPPER_SQ * SQUARE}`;
    g.fillText(tx, W - g.measureText(tx).width - 4, 22);
    t.needsUpdate = true;
  }
  function drawCam(res) {
    const {g, c, t} = camTex;
    const W = c.width;
    g.fillStyle = '#f6f0e6';
    g.fillRect(0, 0, W, W);
    g.save();
    g.translate(W / 2, W / 2);
    // HR scale 30..130 bpm round the rim: angle from straight up, -135..+135 degrees
    for (let hr = 30; hr <= 130; hr += 5) {
      const a = ((hr - 80) / 50) * 2.36;
      g.save();
      g.rotate(a);
      g.fillStyle = hr >= HR_LO && hr <= HR_HI ? INK : '#b8ae9f';
      g.fillRect(-1.5, -W / 2 + 14, 3, hr % 10 ? 16 : 30);
      if (hr % 20 === 0) {
        g.font = FONT(700, 24);
        g.fillText(String(hr), -g.measureText(String(hr)).width / 2, -W / 2 + 72);
      }
      g.restore();
    }
    // the HR window the RR governor allows
    g.strokeStyle = ACC;
    g.lineWidth = 6;
    g.beginPath();
    const aa = (hr) => ((hr - 80) / 50) * 2.36 - Math.PI / 2;
    g.arc(0, 0, W / 2 - 8, aa(HR_LO), aa(HR_HI));
    g.stroke();
    // profile unknown
    g.setLineDash([12, 10]);
    g.strokeStyle = '#8d8478';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, W * 0.27, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#8d8478';
    g.font = FONT(700, 22);
    for (const [s, y] of [['CAM PROFILE', -14], ['NOT ATTACHED', 16]]) g.fillText(s, -g.measureText(s).width / 2, y + 90);
    g.restore();
    t.needsUpdate = true;
    const p = cam.plate;
    p.g.clearRect(0, 0, 512, 128);
    p.g.fillStyle = INK;
    p.g.fillRect(0, 0, 512, 128);
    p.g.fillStyle = '#fff';
    p.g.font = FONT(700, 44);
    p.g.fillText(`QT_nom ${res.nom.qt}`, 22, 58);
    p.g.fillStyle = '#ffb02e';
    p.g.font = FONT(700, 26);
    if (NOMOGRAM.placeholder) p.g.fillText('PLACEHOLDER · xlsx missing', 22, 104);
    p.t.needsUpdate = true;
  }
  function drawGates(res) {
    const {g, c, t} = gateTex;
    g.fillStyle = '#efe7da';
    g.fillRect(0, 0, c.width, c.height);
    const span = GATE.dx * 9 + 0.4;
    for (let i = 0; i < 10; i++) {
      const x = ((0.2 + i * GATE.dx) / span) * c.width;
      const win = res.out.winner === i;
      const open = res.out.open[i];
      g.fillStyle = win ? ACC : open ? INK : '#9b8f80';
      g.font = FONT(800, 34);
      const s = RULES[i].id;
      g.fillText(s, x - g.measureText(s).width / 2, 44);
      g.font = FONT(600, 20);
      const r = RULES[i];
      const sub = `${r.pred === 'Normal' ? 'N' : 'A'}${r.grade}`;
      g.fillText(sub, x - g.measureText(sub).width / 2, 78);
    }
    t.needsUpdate = true;
  }
  function drawDial(res) {
    const {g, c, t} = dialTex;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#f6f0e6';
    g.fillRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H - 100;
    const R = 400;
    // six grades: 1-3 Normal (cool), 4-6 Abnormal (warm)
    for (let k = 0; k < GRADES; k++) {
      const a0 = Math.PI + (k / GRADES) * Math.PI;
      const a1 = Math.PI + ((k + 1) / GRADES) * Math.PI;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, a0 + 0.01, a1 - 0.01);
      g.closePath();
      const on = res.out.grade === k + 1;
      g.fillStyle = RULES.find((r) => r.grade === k + 1)?.pred === 'Normal' ? (on ? '#2b7bba' : 'rgba(43,123,186,.22)') : on ? '#cf2a1d' : 'rgba(207,42,29,.2)';
      g.fill();
      g.fillStyle = on ? '#fff' : INK;
      g.font = FONT(800, 46);
      const am = (a0 + a1) / 2;
      g.fillText(String(k + 1), cx + Math.cos(am) * R * 0.72 - 13, cy + Math.sin(am) * R * 0.72 + 16);
    }
    g.fillStyle = '#f6f0e6';
    g.beginPath();
    g.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
    g.fill();
    g.font = FONT(700, 26);
    g.fillStyle = '#2b7bba';
    g.fillText('NORMAL', cx - R + 20, cy + 50);
    g.fillStyle = '#cf2a1d';
    g.fillText('ABNORMAL', cx + R - 150, cy + 50);
    g.fillStyle = INK;
    g.font = FONT(800, 42);
    const p = res.out.pred ? res.out.pred.toUpperCase() : '—';
    g.fillText(p, cx - g.measureText(p).width / 2, cy - 40);
    g.font = FONT(600, 22);
    g.fillStyle = '#8d8478';
    const s = 'GRADE = POSITION ON SCALE, NOT A PROBABILITY';
    g.fillText(s, cx - g.measureText(s).width / 2, 36);
    t.needsUpdate = true;
  }
  function drawArm(res) {
    const {g, c, t} = paint.armTex;
    const W = c.width;
    const n = res.nom.maxPaint;
    for (let x = 0; x < W; x++) {
      const v = 1 + (x / W) * (n - 1);
      const k = res.ruler.binOf(v);
      g.fillStyle = k >= 0 ? BINS[k].col : '#9b9285';
      g.fillRect(x, 0, 1, c.height);
    }
    t.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------------ update
  // res: run(q); o: {t (s, drives the governor's spin), focus (group key or null), explode 0..1, glass 0..1}
  const EXPL = {feeder: [0, 0.5, -1.2], rpeak: [0, 0.9, -1.2], paint: [0, 0.2, -0.6], ruler: [0, 0.1, -0.25], integ: [0, 0.25, 0.05], hoppers: [0, 0, 0.3], dgears: [0, 0, 0.7], sgears: [0, 0, 1.15], ipsel: [0, 0, 1.6], gates: [1.0, 0, 0.6], output: [1.5, 0.2, 1.2], c50: [2.2, 0, 0.3], gov: [-0.8, 0, -0.3], nomo: [-0.8, 0, 0.6]};
  // the cutaway: one plane, applied to the focused subsystem's materials only; boards and rails are cut across x
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const CUT_AXIS = {feeder: 'x', rpeak: 'x', paint: 'x'};
  let BOX = null;
  let lastCut = null;
  const update = (res, o) => {
    // textures that depend on q redraw when q changes; the rest only when the front end's numbers do
    const key = `${res.q}`;
    if (key !== lastKey) {
      lastKey = key;
      drawStrip(res);
      drawLoupe(res);
      drawGates(res);
      drawDial(res);
    }
    const nkey = `${res.nom.qt}|${res.nom.maxPaint}|${res.gov.hr}|${res.integ.count.join(',')}`;
    if (nkey !== lastNom) {
      lastNom = nkey;
      drawRuler(res);
      drawCam(res);
      drawArm(res);
    }
    // pins over every kept R peak
    const R = res.det.R;
    pins.forEach((p, i) => {
      p.visible = i < R.length;
      if (!p.visible) return;
      const s = R[i];
      const top = 4.4;
      const yTip = SY(res.mv[s - 1]) + 0.06;
      const len = top - yTip;
      p.position.set(SXp(s), 0, STRIP.z + 0.06);
      p.userData.rod.scale.y = len;
      p.userData.rod.position.y = yTip + len / 2;
      p.userData.tip.position.y = yTip;
      p.userData.head.position.y = top;
    });
    const cand = res.det.candidates;
    ticks.forEach((b, i) => {
      b.visible = i < cand.length;
      if (b.visible) b.position.set(SXp(cand[i].at), SY(cand[i].mv + 0.12), STRIP.z + 0.02);
    });
    // governor: arms swing out with HR across the RR window, the head turns at HR
    const hr = res.gov.hr;
    const swing = 0.25 + 0.75 * Math.min(1, Math.max(0, (hr - HR_LO) / (HR_HI - HR_LO)));
    gov.head.rotation.y = ((o.t || 0) * hr) / 60 * Math.PI * 2 * 0.25;
    gov.arms.forEach((a) => (a.rotation.z = a.userData.sx * swing));
    // nomogram: needle at HR, follower lifted by QT_nom
    cam.needle.rotation.z = -((hr - 80) / 50) * 2.36;
    const fl = 0.2 + (res.nom.qt / 600) * 0.5;
    cam.follower.scale.y = fl;
    cam.follower.position.set(CAM.x, CAM.y + CAM.r + fl / 2, CAM.z);
    // paint arm from the head at paint value 0 to maxPaint
    const xa = LX(0);
    const xb = LX(res.nom.maxPaint);
    paint.arm.scale.x = xb - xa;
    paint.arm.position.set((xa + xb) / 2, LOUPE.y1 + 0.2, LOUPE.z + 0.17);
    paint.head.position.x = xa;
    paint.nozzle.position.x = xa;
    // hoppers fill to A_k
    hop.forEach((m, k) => {
      const h = Math.max(0.002, (res.integ.A[k] / SCALE.A) * (HOP.h - 0.12));
      m.scale.y = h;
      m.position.y = 0.06 + h / 2;
    });
    // gears turn by their difference (a full value turns 0.9 rad at the largest |D| or |S| over the sweep)
    res.inf.D.forEach((d, k) => (dg[k].rotation.z = -(d / SCALE.D) * 1.6));
    res.inf.S.forEach((s, j) => {
      const {gear, mat} = sg[j];
      gear.rotation.z = -(s / SCALE.S) * 1.6;
      const isM = j + 1 === res.inf.m;
      mat.color.set(isM ? ACC : s < 0 ? '#c9a27a' : '#9aa0a8');
      mat.emissive.set(isM ? ACC : '#000000');
      mat.emissiveIntensity = isM ? 0.25 : 0;
    });
    // inflection carriage
    const ip = res.inf.ip;
    ipsel.car.position.x = ip === null ? IPX(1.5) - 0.3 : IPX(ip);
    ipsel.ghost.visible = res.inf.overwritten;
    if (res.inf.overwritten) ipsel.ghost.position.x = IPX(res.inf.firstIp);
    {
      const mx = SX(res.inf.m - 1);
      const x0 = ipsel.car.position.x;
      const a = new THREE.Vector3(x0, RAIL.y + 0.25, RAIL.z);
      const b = new THREE.Vector3(mx, SG.y - SG.r, SG.z + 0.05);
      const len = a.distanceTo(b);
      ipsel.wire.scale.y = len;
      ipsel.wire.position.copy(a).add(b).multiplyScalar(0.5);
      ipsel.wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    // gates: open ones raise their arm; the winner glows; gates past the winner are never reached
    gates.forEach((gt, i) => {
      const open = res.out.open[i];
      const win = res.out.winner === i;
      const reached = res.out.winner < 0 || i <= res.out.winner;
      gt.pivot.rotation.z = open ? 1.35 : 0;
      gt.mat.color.set(win ? ACC : reached ? '#f5efe6' : '#cfc6b8');
      gt.mat.emissive.set(win ? ACC : '#000000');
      gt.mat.emissiveIntensity = win ? 0.3 : 0;
    });
    gates.token.position.x = res.out.winner < 0 ? GATE.x0 - 0.45 : GATE.x0 + res.out.winner * GATE.dx;
    // dial needle at the grade
    dial.needle.rotation.z = res.out.grade ? Math.PI / 2 - ((res.out.grade - 0.5) / GRADES) * Math.PI : Math.PI / 2;
    // glass: the integrator housing and the C5.0 shell go clear
    const gl = o.glass || 0;
    // exploded: each subsystem slides out along its own direction
    const ex = o.explode || 0;
    for (const [k, grp] of Object.entries(groups)) {
      const v = EXPL[k] || [0, 0, 0];
      grp.position.set(v[0] * ex, v[1] * ex, v[2] * ex);
    }
    // modes for the focused subsystem: isolate (the rest fade to a ghost), cut (the same, and the part is sliced open
    // by a plane that slides in to its middle), alone (the rest are hidden)
    const iso = o.iso ?? 0;
    const mode = o.mode || 'isolate';
    const fk = o.focus;
    const ghost = mode === 'alone' ? 1 : 0.86;
    // `hide`: groups a camera has to see past (the C5.0 bench behind the gate row)
    for (const [k, grp] of Object.entries(groups)) grp.visible = !(mode === 'alone' && fk && k !== fk && k !== 'table' && iso > 0.98) && !(o.hide || []).includes(k);
    for (const [m, k, base, noDepth] of mats) {
      const dim = fk && k !== fk && k !== 'table' ? iso : 0;
      let op = base * (1 - ghost * dim);
      if (m === integ.housingMat) op *= 1 - gl * 0.8;
      if (m === c50.shell) op *= 1 - gl * 0.85;
      m.opacity = op;
      m.depthWrite = !noDepth && op > 0.6;
    }
    if (!BOX) {
      BOX = {};
      for (const [k, grp] of Object.entries(groups)) BOX[k] = new THREE.Box3().setFromObject(grp);
    }
    const ck = mode === 'cut' && fk ? fk : null;
    if (ck !== lastCut) {
      lastCut = ck;
      for (const [m, k] of mats) {
        const on = k === ck;
        m.clippingPlanes = on ? [clip] : null;
        m.clipShadows = on;
        m.side = on ? THREE.DoubleSide : THREE.FrontSide;
        m.needsUpdate = true;
      }
    }
    if (ck) {
      const ax = CUT_AXIS[ck] || 'z';
      const b = BOX[ck];
      const off = groups[ck].position[ax];
      const mid = (b.min[ax] + b.max[ax]) / 2 + off;
      const pos = mid + (1 - iso) * (b.max[ax] - b.min[ax]) * 0.55;
      clip.normal.set(ax === 'x' ? -1 : 0, 0, ax === 'z' ? -1 : 0);
      clip.constant = pos; // keeps the points with coordinate <= pos: the near (or right) half is cut away
    }
  };
  const groupOffset = (k) => groups[k]?.position ?? new THREE.Vector3();
  return {root, groups, update, groupOffset};
}
