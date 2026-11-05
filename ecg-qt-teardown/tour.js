// The auto tour: a SCRIPT of operator moves (focus a subsystem, toggle a display, drag q) and pure functions of the
// tour time for each. The live page plays it when left alone; any input hands control to the visitor.
export const VIEWS = {
  all: {tx: 1.7, ty: 0.9, tz: -0.6, az: -6, el: 24, d: 32},
  feeder: {tx: 0, ty: 3.6, tz: -3.3, az: 0, el: 10, d: 12.5},
  rpeak: {tx: -2.6, ty: 3.85, tz: -3.3, az: -8, el: 8, d: 6.2},
  gov: {tx: -6.35, ty: 1.0, tz: -1.0, az: 0, el: 12, d: 6.0},
  nomo: {tx: -6.6, ty: 1.45, tz: 0.95, az: 8, el: 6, d: 6.2},
  paint: {tx: -0.7, ty: 1.85, tz: -1.75, az: 0, el: 6, d: 10.5},
  ruler: {tx: -0.35, ty: 0.15, tz: -1.5, az: 0, el: 44, d: 8.0},
  integ: {tx: 0, ty: 0.35, tz: -1.05, az: -18, el: 30, d: 6.2},
  hoppers: {tx: 0, ty: 0.9, tz: -0.45, az: 0, el: 12, d: 9.2},
  dgears: {tx: 0, ty: 0.55, tz: 0.45, az: 0, el: 12, d: 6.2},
  sgears: {tx: 0, ty: 0.55, tz: 1.15, az: 0, el: 14, d: 6.2},
  ipsel: {tx: 0.2, ty: 0.15, tz: 1.45, az: 0, el: 46, d: 6.4},
  gates: {tx: 4.75, ty: 0.3, tz: 0.2, az: -6, el: 28, d: 7.4},
  output: {tx: 4.85, ty: 0.85, tz: 1.75, az: -4, el: 8, d: 5.6},
  c50: {tx: 8.5, ty: 0.5, tz: 0.5, az: -28, el: 24, d: 7.2},
};
// the viewport's centre sits right of the left panels and above the bottom panel
export const VIEW_SHIFT = {sx: 0, sy: -40};

// {t, focus} clicks a subsystem button; {t, display, on} a toggle; {t, q: [from, to, dur]} drags the q slider
export const SCRIPT = [
  {t: 0.0, focus: 'all'},
  {t: 4.5, focus: 'feeder'},
  {t: 9.5, focus: 'rpeak'},
  {t: 15.0, focus: 'gov'},
  {t: 20.0, focus: 'nomo'},
  {t: 25.0, focus: 'paint'},
  {t: 31.0, focus: 'ruler'},
  {t: 36.5, focus: 'integ'},
  {t: 41.5, focus: 'hoppers'},
  {t: 46.5, focus: 'dgears'},
  {t: 51.5, focus: 'sgears'},
  {t: 57.0, focus: 'ipsel'},
  {t: 58.6, q: [440, 250, 3.2]},
  {t: 64.0, q: [250, 330, 2.0]},
  {t: 69.5, focus: 'gates'},
  {t: 71.0, q: [330, 540, 12.0]},
  {t: 85.0, focus: 'output'},
  {t: 86.4, q: [540, 440, 2.4]},
  {t: 91.5, focus: 'c50'},
  {t: 97.5, focus: 'all'},
  {t: 98.6, display: 'exploded', on: 1},
  {t: 99.8, display: 'orbit', on: 1},
  {t: 101.0, q: [440, 240, 4.0]},
  {t: 106.0, q: [240, 540, 9.0]},
  {t: 116.5, display: 'exploded', on: 0},
  {t: 117.5, display: 'orbit', on: 0},
  {t: 118.6, q: [540, 440, 2.4]},
];
export const DURATION = 123;

const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

export const focusAt = (t) => {
  let f = 'all';
  let t0 = 0;
  for (const e of SCRIPT) if (e.focus && e.t <= t) [f, t0] = [e.focus, e.t];
  return [f, t0];
};
export const displayAt = (t) => {
  const d = {labels: 1, glass: 0, exploded: 0, orbit: 0, check: 0, notes: 0};
  const since = {};
  for (const e of SCRIPT)
    if (e.display && e.t <= t) {
      d[e.display] = e.on;
      since[e.display] = e.t;
    }
  return {d, since};
};
export const qAt = (t) => {
  let q = 440;
  for (const e of SCRIPT) {
    if (!e.q || e.t > t) continue;
    const [a, b, dur] = e.q;
    q = a + (b - a) * ss(e.t, e.t + dur, t);
  }
  return q;
};

// The operator's cursor: travels to each button or the slider knob, presses, and rests between moves.
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.focus) return {t: e.t, spot: ui.spots[e.focus]};
    if (e.display) return {t: e.t, spot: ui.spots[e.display]};
    return {t: e.t, ramp: e.q};
  });
  const REST = [[900, 640], [760, 600], [1020, 660], [700, 690]];
  const posOf = (e, t) => (e.ramp ? ui.knobAt(e.ramp[0] + (e.ramp[1] - e.ramp[0]) * ss(e.t, e.t + e.ramp[2], t)) : e.spot);
  const endOf = (e) => e.t + (e.ramp ? e.ramp[2] : 0);
  return (t) => {
    let i = -1;
    for (let k = 0; k < EV.length; k++) if (EV[k].t - 0.9 <= t) i = k;
    if (i < 0) return {x: REST[0][0], y: REST[0][1], press: false, ring: 0, ringX: 0, ringY: 0};
    const e = EV[i];
    const prev = i > 0 ? EV[i - 1] : null;
    const restP = REST[i % REST.length];
    // where it was: resting after the previous move, or on it still
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
