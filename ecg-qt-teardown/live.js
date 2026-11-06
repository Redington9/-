// The QT machine as a page you drive. One input, q (the dial slider, ← → keys). A subsystem button (or its block in
// the schematic) frames that part and applies the mode: ISOLATE fades the rest, CUT also slices the part open, ALONE
// hides the rest. The camera buttons give the named views. Left alone it plays the tour with the operator's cursor;
// a click, drag, wheel or key hands control over, 25 s of quiet hands it back.
import {DATA, IP_MODES, Q_RANGE, QT_NOM, run, runReal} from './model.js';
import {createConsole, DISPLAY} from './console.js';
import {callouts} from './notes.js';
import {createStage} from './stage.js';
import {CAM_KEYS, CAMS, DURATION, makeCursor, MODES, SUB_VIEWS, tourAt, VIEW_SHIFT} from './tour.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const CSS = `
html,body{margin:0;background:#efe9df;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.bt,.x{pointer-events:auto;cursor:pointer}
.bt:hover{filter:brightness(.96)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:740px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:20px;padding:0 10px;border:1px solid #e6dccd;border-radius:4px;background:rgba(252,249,244,.95);color:#1f1c19;font:700 8.6px 'JetBrains Mono',monospace;letter-spacing:1.2px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#e8336f}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:12px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8d8478;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.title = 'Pseudo-colour QT machine';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);

  const TIERS = [{shadow: 4096, pr: 2}, {shadow: 2048, pr: 1.5}, {shadow: 1024, pr: 1}];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    st.setQuality(TIERS[tier]);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let q = QT_NOM;
  let src = 'syn'; // 'syn': the synthetic beat at q · 'real': ECG idx of the dataset (sorted by QT − nomogram)
  let idx = DATA.order.length >> 1;
  let ipMode = 'file';
  let focus = 'all';
  let focusT = 0;
  let mode = 'isolate';
  let cam = 'hero'; // a CAMS key, or 'sub': frame the focused subsystem
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: k === 'labels' ? 1 : 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  const camPos = {...CAMS.hero.v};
  let ring = {t: -9, x: 0, y: 0};
  let snap = false;
  const eased = (k, dur = 0.7) => {
    const d = disp[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
    for (const k of ['check', 'notes', 'glass']) if (disp[k].on) Object.assign(disp[k], {on: 0, t: T});
  };
  const takeOver = () => {
    lastInput = T;
    AP.on = false;
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ controls
  const setFocus = (f) => {
    if (f === focus) return;
    focus = f;
    focusT = T;
    if (f !== 'all') cam = 'sub';
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const pick = (k) => {
    takeOver();
    setFocus(focus === k ? 'all' : k);
  };
  ui.onPick = pick;
  ui.btn.all.addEventListener('click', () => {
    takeOver();
    pulse('all');
    setFocus('all');
  });
  for (const k of Object.keys(SUB_VIEWS))
    ui.btn[k].addEventListener('click', () => {
      pulse(k);
      pick(k);
    });
  for (const m of MODES)
    ui.btn[m].addEventListener('click', () => {
      takeOver();
      pulse(m);
      mode = m;
      focusT = Math.min(focusT, T - 0.2);
    });
  for (const [b, v] of [['src_syn', 'syn'], ['src_real', 'real']])
    ui.btn[b].addEventListener('click', () => {
      takeOver();
      pulse(b);
      src = v;
    });
  for (const m of IP_MODES)
    ui.btn['ipm_' + m].addEventListener('click', () => {
      takeOver();
      pulse('ipm_' + m);
      ipMode = m;
      src = 'real';
    });
  for (const k of CAM_KEYS)
    ui.btn['cam_' + k].addEventListener('click', () => {
      takeOver();
      pulse('cam_' + k);
      cam = k;
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  const toggle = (k, v) => {
    const on = v ?? (disp[k].on ? 0 : 1);
    if (disp[k].on === on) return;
    disp[k].on = on;
    disp[k].t = T;
    // one overlay at a time
    if (on && ['check', 'notes', 'data'].includes(k)) for (const o of ['check', 'notes', 'data']) if (o !== k) Object.assign(disp[o], {on: 0, t: T});
  };
  for (const k of DISPLAY)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      toggle(k);
    });
  // overlay close buttons (the dataset overlay is redrawn, so listen on the overlay)
  for (const ov of [ui.ovCheck, ui.ovNotes, ui.ovData])
    ov.addEventListener('click', (e) => {
      if (!e.target.closest('.x')) return;
      takeOver();
      for (const o of ['check', 'notes', 'data']) toggle(o, 0);
    });
  {
    const {x: x0, w, y} = ui.QS;
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 10}px`, top: `${y - 14}px`, width: `${w + 20}px`, height: '30px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      const u = clamp((x - x0) / w, 0, 1);
      if (src === 'real') idx = Math.round(u * (DATA.order.length - 1));
      else q = Math.round(Q_RANGE[0] + u * (Q_RANGE[1] - Q_RANGE[0]));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright') {
      takeOver();
      const dir = k === 'arrowleft' ? -1 : 1;
      if (src === 'real') idx = clamp(idx + dir * (e.shiftKey ? 50 : 1), 0, DATA.order.length - 1);
      else q = clamp(Math.round(q) + dir * (e.shiftKey ? 20 : 5), Q_RANGE[0], Q_RANGE[1]);
    } else if (k === 'escape') {
      takeOver();
      toggle('check', 0);
      toggle('notes', 0);
      setFocus('all');
    } else if (/^[1-5]$/.test(k)) ui.btn['cam_' + CAM_KEYS[+k - 1]].click();
    else if (k === 'i') ui.btn.isolate.click();
    else if (k === 'c') ui.btn.cut.click();
    else if (k === 'a') ui.btn.alone.click();
    else if (k === 'r') ui.btn[src === 'real' ? 'src_syn' : 'src_real'].click();
    else if (k === 'w') ui.btn[ipMode === 'file' ? 'ipm_code' : 'ipm_file'].click();
    else if (k === 'd') ui.btn.data.click();
    else if (k === 'l') ui.btn.labels.click();
    else if (k === 'g') ui.btn.glass.click();
    else if (k === 'e') ui.btn.exploded.click();
    else if (k === 'o') ui.btn.orbit.click();
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az += ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -20, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.35, 2.4);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.024 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= 2) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }
    let cursor;
    if (AP.on) {
      const c = (T - AP.t0) % DURATION;
      const ts = tourAt(c);
      if (ts.focus !== focus) {
        focus = ts.focus;
        focusT = T - (c - ts.focusT);
      }
      mode = ts.mode;
      cam = ts.cam;
      q = ts.q;
      src = ts.src;
      idx = ts.idx;
      ipMode = ts.ipMode;
      for (const k of DISPLAY) if (disp[k].on !== ts.d[k]) Object.assign(disp[k], {on: ts.d[k], t: T});
      cursor = tourCursor(c);
    } else {
      if (T - lastInput > IDLE) startTour();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    const res = src === 'real' ? runReal(DATA.order[Math.round(idx)], ipMode) : run(Math.round(q));
    const fkey = focus === 'all' ? null : focus;
    if (cam === 'sub' && !fkey) cam = 'hero';
    const since = T - focusT;
    const iso = fkey ? ss(0.2, 0.9, since) : 0;
    const explode = eased('exploded', 0.9);
    // a housing in focus goes clear on its own, so its inside is what the camera sees
    const glass = Math.max(eased('glass', 0.6), fkey === 'integ' || fkey === 'c50' ? iso : 0);
    const tgt = {...(cam === 'sub' ? SUB_VIEWS[fkey] : CAMS[cam].v)};
    tgt.az += off.az + (disp.orbit.on ? 10 * Math.sin((T - disp.orbit.t) * 0.25) : 0);
    tgt.el = clamp(tgt.el + off.el, -15, 89);
    tgt.d *= off.k * (1 + 0.18 * explode * (cam === 'hero' ? 1 : 0.4));
    const k = snap ? 1 : 1 - Math.exp(-dt / (AP.on ? 0.32 : 0.4));
    snap = false;
    camPos.az += wrap(tgt.az - camPos.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd']) camPos[key] += (tgt[key] - camPos[key]) * k;
    st.frame({res, t: T, focus: fkey, iso, mode, explode, glass, hide: cam === 'inside' ? ['c50'] : []}, {...camPos, ...VIEW_SHIFT, az: camPos.az * D2R, el: camPos.el * D2R});
    const calls = callouts(res, {focus: fkey, cam}).map((c) => {
      const o = st.machine.groupOffset(c.g);
      return {...c, p: [c.p[0] + o.x, c.p[1] + o.y, c.p[2] + o.z]};
    });
    const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
    ui.update(res, {focus: fkey, mode, cam, display, idx: Math.round(idx), labels: eased('labels', 0.4) * ss(0.7, 1.3, Math.min(since, T - camT0())), callouts: calls, project: st.project, cursor});
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  // labels wait for the camera to settle after a camera change too
  let camWas = cam;
  let camAt = -9;
  const camT0 = () => {
    if (cam !== camWas) {
      camWas = cam;
      camAt = T;
    }
    return camAt;
  };
  st.renderer.compileAsync(st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {
    st,
    run,
    get T() {
      return T;
    },
    set(qq, f, d = {}, extra = {}) {
      takeOver();
      lastInput = 1e9;
      q = qq;
      if (f) {
        focus = f;
        focusT = T - 5;
        cam = f === 'all' ? 'hero' : 'sub';
      }
      if (extra.cam) cam = extra.cam;
      if (extra.mode) mode = extra.mode;
      if (extra.src) src = extra.src;
      if (extra.idx !== undefined) idx = extra.idx;
      if (extra.ip) ipMode = extra.ip;
      camAt = T - 5;
      camWas = cam;
      for (const [kk, v] of Object.entries(d)) Object.assign(disp[kk], {on: v, t: T - 5});
      snap = true;
    },
    tour(t) {
      AP.on = true;
      AP.t0 = T - t;
    },
  };
}
