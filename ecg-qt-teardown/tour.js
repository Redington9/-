// Cameras and the auto tour. SUB_VIEWS frame each subsystem when its button is pressed; CAMS are the five named
// camera buttons. SCRIPT is the operator's tour (focus a subsystem, pick isolate / cut / alone, switch camera, toggle a
// display, drag q) and every value the tour sets is a pure function of the tour time.
import {GATE} from './machine.js';
import {DATA, Q_RANGE, QT_NOM, run} from './model.js';

// where the tour drags q: the nomogram value, the ends of the range, and the first q where warnings 1 and 2 fire
const SWEEP = [];
for (let q = Q_RANGE[0]; q <= Q_RANGE[1]; q++) SWEEP.push(run(q));
const Q_W1 = (SWEEP.find((r) => r.inf.overwritten) ?? SWEEP[0]).q;
const Q_W2 = (SWEEP.find((r) => r.inf.skipped) ?? SWEEP[0]).q;
const [QL, QH] = Q_RANGE;
const IDX_END = DATA.order.length - 1;
const IDX_MID = DATA.order.length >> 1;

export const SUB_VIEWS = {
  feeder: {tx: 0, ty: 3.6, tz: -3.3, az: 0, el: 10, d: 15},
  rpeak: {tx: -2.6, ty: 3.85, tz: -3.3, az: -8, el: 8, d: 7.4},
  gov: {tx: -6.35, ty: 1.0, tz: -1.0, az: 0, el: 12, d: 7.0},
  nomo: {tx: -6.5, ty: 1.45, tz: 0.95, az: 8, el: 6, d: 7.2},
  paint: {tx: -0.7, ty: 1.85, tz: -1.75, az: 0, el: 6, d: 12.5},
  ruler: {tx: -0.1, ty: 0.15, tz: -1.5, az: 0, el: 44, d: 9.4},
  integ: {tx: 0, ty: 0.35, tz: -1.05, az: -18, el: 30, d: 7.4},
  hoppers: {tx: 0, ty: 0.9, tz: -0.45, az: 0, el: 12, d: 10.8},
  dgears: {tx: 0, ty: 0.55, tz: 0.45, az: 0, el: 12, d: 7.4},
  sgears: {tx: 0, ty: 0.55, tz: 1.15, az: 0, el: 14, d: 7.4},
  ipsel: {tx: 0.2, ty: 0.15, tz: 1.45, az: 0, el: 46, d: 7.6},
  gates: {tx: 4.85, ty: 0.3, tz: 0.2, az: -6, el: 28, d: 8.6},
  output: {tx: 4.85, ty: 0.85, tz: 1.75, az: -4, el: 8, d: 6.6},
  c50: {tx: 8.5, ty: 0.5, tz: 0.5, az: -28, el: 24, d: 8.4},
};
// the camera buttons
export const CAMS = {
  hero: {label: 'HERO', v: {tx: 1.4, ty: 0.7, tz: -0.4, az: -32, el: 27, d: 34}},
  front: {label: 'FRONT', v: {tx: -0.8, ty: 2.6, tz: -2.4, az: -16, el: 9, d: 17}},
  side: {label: 'SIDE', v: {tx: 0.2, ty: 0.55, tz: 0.8, az: -74, el: 13, d: 7.2}},
  top: {label: 'TOP', v: {tx: 0, ty: 0, tz: -0.95, az: 0, el: 88, d: 8.6}},
  inside: {label: 'INSIDE GATES', v: {tx: GATE.x0 + 2.6, ty: 0.32, tz: GATE.z - 0.05, az: -90, el: 7, d: 3.4}},
};
export const CAM_KEYS = Object.keys(CAMS);
export const MODES = ['isolate', 'cut', 'alone'];
// the viewport's centre: x 800 between the side columns, y 431 between the top band and the bottom band
export const VIEW_SHIFT = {sx: 0, sy: -19};

// {t, focus} presses a subsystem button ('all' releases it); {t, mode}; {t, cam}; {t, display, on}; {t, q: [a, b, s]}
export const SCRIPT = [
  {t: 0.0, cam: 'hero'},
  {t: 4.0, cam: 'front'},
  {t: 8.5, focus: 'rpeak'},
  {t: 13.0, focus: 'gov'},
  {t: 17.5, focus: 'nomo'},
  {t: 22.0, focus: 'paint'},
  {t: 27.0, focus: 'integ'},
  {t: 28.4, mode: 'cut'},
  {t: 33.0, focus: 'hoppers'},
  {t: 34.4, mode: 'isolate'},
  {t: 38.0, focus: 'all'},
  {t: 39.0, cam: 'top'},
  {t: 44.0, cam: 'side'},
  {t: 49.5, focus: 'ipsel'},
  {t: 50.8, mode: 'alone'},
  {t: 52.0, q: [QT_NOM, Q_W1, 3.2]},
  {t: 57.0, q: [Q_W1, Q_W2, 2.0]},
  {t: 62.0, focus: 'all'},
  {t: 62.6, mode: 'isolate'},
  {t: 63.4, cam: 'inside'},
  {t: 65.0, q: [Q_W2, QH, 11.0]},
  {t: 78.0, focus: 'output'},
  {t: 79.4, q: [QH, QT_NOM, 2.4]},
  {t: 84.0, focus: 'c50'},
  {t: 85.4, mode: 'cut'},
  {t: 90.5, focus: 'all'},
  {t: 91.2, mode: 'isolate'},
  {t: 92.0, cam: 'hero'},
  {t: 93.0, display: 'exploded', on: 1},
  {t: 94.4, q: [QT_NOM, QL, 4.0]},
  {t: 99.0, q: [QL, QH, 9.0]},
  {t: 109.5, display: 'exploded', on: 0},
  {t: 110.6, q: [QH, QT_NOM, 2.4]},
  // the real dataset: switch the source, sweep the ECGs from far below the nomogram to far above, compare IP modes
  {t: 114.0, src: 'real'},
  {t: 115.5, idx: [IDX_MID, 0, 2.0]},
  {t: 118.5, idx: [0, IDX_END, 12.0]},
  {t: 131.5, ip: 'code'},
  {t: 135.0, ip: 'file'},
  {t: 137.0, display: 'data', on: 1},
  {t: 142.5, display: 'data', on: 0},
  {t: 143.5, src: 'syn'},
];
export const DURATION = 146;

const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

/** The tour's state at time t: focus, mode, camera (a CAMS key, or 'sub' to frame the focus), displays, q, and when each changed. */
export function tourAt(t) {
  const st = {focus: 'all', focusT: 0, mode: 'isolate', cam: 'hero', camT: 0, q: QT_NOM, src: 'syn', idx: IDX_MID, ipMode: 'file', d: {labels: 1, glass: 0, exploded: 0, orbit: 0, check: 0, notes: 0, data: 0}};
  for (const e of SCRIPT) {
    if (e.t > t) break;
    if (e.focus) {
      st.focus = e.focus;
      st.focusT = e.t;
      if (e.focus !== 'all') [st.cam, st.camT] = ['sub', e.t];
    }
    if (e.mode) st.mode = e.mode;
    if (e.cam) [st.cam, st.camT] = [e.cam, e.t];
    if (e.display) st.d[e.display] = e.on;
    if (e.src) st.src = e.src;
    if (e.ip) st.ipMode = e.ip;
    if (e.idx) {
      const [a, b, dur] = e.idx;
      st.idx = Math.round(a + (b - a) * ss(e.t, e.t + dur, t));
    }
    if (e.q) {
      const [a, b, dur] = e.q;
      st.q = a + (b - a) * ss(e.t, e.t + dur, t);
    }
  }
  return st;
}

// The operator's cursor: travels to each button or the slider knob, presses, and rests between moves.
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    const k = e.focus ?? e.mode ?? (e.cam ? 'cam_' + e.cam : e.src ? 'src_' + e.src : e.ip ? 'ipm_' + e.ip : e.display);
    if (e.idx) return {t: e.t, ramp: e.idx, knob: ui.knobAtIdx};
    return e.q ? {t: e.t, ramp: e.q, knob: ui.knobAt} : {t: e.t, spot: ui.spots[k]};
  });
  const REST = [[900, 640], [760, 600], [1020, 660], [700, 690]];
  const posOf = (e, t) => (e.ramp ? e.knob(e.ramp[0] + (e.ramp[1] - e.ramp[0]) * ss(e.t, e.t + e.ramp[2], t)) : e.spot);
  const endOf = (e) => e.t + (e.ramp ? e.ramp[2] : 0);
  return (t) => {
    let i = -1;
    for (let k = 0; k < EV.length; k++) if (EV[k].t - 0.9 <= t) i = k;
    if (i < 0) return {x: REST[0][0], y: REST[0][1], press: false, ring: 0, ringX: 0, ringY: 0};
    const e = EV[i];
    const prev = i > 0 ? EV[i - 1] : null;
    const restP = REST[i % REST.length];
    const from = prev ? (t - 0.9 > endOf(prev) + 1.2 ? restP : posOf(prev, endOf(prev))) : REST[0];
    const at = posOf(e, Math.max(e.t, t));
    let x;
    let y;
    if (t < e.t) {
      const k = ss(e.t - 0.9, e.t - 0.08, t);
      const bow = Math.sin(Math.PI * k) * 18;
      x = from[0] + (at[0] - from[0]) * k + bow;
      y = from[1] + (at[1] - from[1]) * k - bow * 0.5;
    } else if (t < endOf(e) + 0.25) [x, y] = at;
    else {
      const k = ss(endOf(e) + 0.25, endOf(e) + 1.4, t);
      const end = posOf(e, endOf(e));
      x = end[0] + (restP[0] - end[0]) * k;
      y = end[1] + (restP[1] - end[1]) * k;
    }
    const press = e.ramp ? t >= e.t - 0.08 && t < endOf(e) + 0.1 : t >= e.t - 0.07 && t < e.t + 0.1;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    if (!e.ramp && t >= e.t && t < e.t + 0.55) {
      ring = 1 - (t - e.t) / 0.55;
      [rx, ry] = e.spot;
    }
    return {x, y, press, ring, ringX: rx, ringY: ry};
  };
}
