// The console around the machine, laid out at 1600 x 900.
//   top band       title, the live QT number and its offset from the nomogram, the verdict, source chips, camera buttons
//   left column    01 pseudo-coloured ECG (one beat + the 10 s strip) · 02 QT ruler · 03 area hoppers · 04 S1–S7 and IP
//   right column   05 schematic of the pipeline · 06 subsystem buttons with isolate / cut / alone
//   bottom band    q dial and display toggles · the generated explanation · the fired rule with its numbers
// Every panel redraws from the frame's state (res = run(q)); every number comes from the model or its constants.
import {BEAT, BINS, C50, GREY, LIFT, LOUPE_BEAT, N, NOMOGRAM, PAINT_LEAD, Q_RANGE, run, RULES, S_NAMES, SAMPLE_MS, SQUARE, STRIP_S, beatAt, R_KEEP, FLAT_MIN, RR_DROP, RR_MIN, RR_MAX, HR_FAST, UPPER_SQ, LOWER_SQ, FAST_SQ, PAPER_SPEED, RULE_RATIO, roundR} from './model.js';
import {ACC, INK, SCALE} from './machine.js';
import {EXTRA, f1, firedText, GRADES, HR_HI, HR_LO, SUB, SUBS, WARN} from './notes.js';
import {CAM_KEYS, CAMS, MODES} from './tour.js';

export const C = {ink: INK, mute: '#8d8478', faint: '#d9cdbb', line: '#e6dccd', panel: 'rgba(252,249,244,.95)', acc: ACC, warn: '#b45309', amber: '#d97706', nrm: '#2b7bba', abn: '#cf2a1d', noHop: '#d6cec2', unp: '#a39a8d'};
export const DISPLAY = ['labels', 'glass', 'exploded', 'orbit', 'check', 'notes'];
export const DISPLAY_LABEL = {labels: 'LABELS', glass: 'GLASS', exploded: 'EXPLODED', orbit: 'ORBIT', check: 'HAND CHECK', notes: 'CODE NOTES'};
// the 3D viewport between the columns and bands
export const VP = {x0: 410, x1: 1190, y0: 100, y1: 764};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(120,90,50,.08)}
.ph{position:absolute;display:flex;align-items:center;gap:8px;font:700 9.6px 'JetBrains Mono',monospace;letter-spacing:1.6px;white-space:nowrap}
.ph i{display:block;width:3px;height:12px;background:${C.acc}}
.pn{position:absolute;font:500 9px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 8.6px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:20px;padding:0 6px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fffdf9;font:700 8.6px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.bt.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.bt.seg{border:none;background:transparent}
.bt.seg.on{background:${C.ink};color:#fff}
.bt.foc{background:${C.acc};color:#fff;border-color:${C.acc}}
.call{position:absolute;white-space:nowrap;transform:translate(-50%,-100%)}
.call b{display:flex;align-items:center;gap:6px;font:700 9.2px 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.ink};background:rgba(252,249,244,.92);padding:2px 5px;border-radius:3px}
.call b i{display:block;width:6px;height:6px;background:${C.ink}}
.call.acc b i{background:${C.acc}}
.call.warn b{background:#fff4e2;color:${C.warn};border:1px solid #f3c58f}
.call.warn b i{background:${C.amber}}
.call span{display:block;font:500 8px 'JetBrains Mono',monospace;letter-spacing:.8px;color:#6d6357;margin-top:1px;padding:0 5px;background:rgba(252,249,244,.85)}
.call.warn span{color:${C.warn}}
.chip{display:inline-flex;align-items:center;gap:6px;height:20px;padding:0 8px;border-radius:4px;background:${C.ink};color:#fff;font:700 8.6px 'JetBrains Mono',monospace;letter-spacing:1px;margin:0 3px}
.chip i{font-style:normal;color:#ffb02e}
.chip.ph2{background:#fff3e0;color:${C.warn};border:1px solid #f3c58f;margin:0}
.ov{position:absolute;left:${VP.x0}px;top:${VP.y0}px;width:${VP.x1 - VP.x0}px;height:${VP.y1 - VP.y0 - 30}px;background:rgba(252,249,244,.98);border:1px solid ${C.line};border-radius:8px;box-shadow:0 8px 30px rgba(80,60,30,.18);overflow:auto;pointer-events:auto;display:none;padding:20px 24px;box-sizing:border-box}
.ov h2{margin:0 0 4px;font:800 18px Inter,sans-serif;letter-spacing:-.2px}
.ov h3{margin:14px 0 5px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.acc}}
.ov p,.ov li{font:400 11.5px/1.5 Inter,sans-serif;color:#3b352f;margin:4px 0}
.ov code,.ov td{font:500 10.5px 'JetBrains Mono',monospace}
.ov table{border-collapse:collapse;margin:6px 0}
.ov td{padding:2px 9px 2px 0;border-bottom:1px solid ${C.line};color:#3b352f;vertical-align:top}
.ov .ok{color:#1b7f4b;font-weight:700}
.ov .no{color:${C.warn};font-weight:700}
.ov .x{position:absolute;right:16px;top:14px;cursor:pointer}
.blk{cursor:pointer;pointer-events:auto}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49}
.knob{position:absolute;top:0;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const f3 = (v) => v.toFixed(3);
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±');
const T = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="${o.fs ?? 8}" font-weight="${o.fw ?? 400}" fill="${o.c ?? INK}" text-anchor="${o.a ?? 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${s}</text>`;

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h, parent = ui) => {
    const n = el(h);
    parent.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    const t = add(`<div class="ph" style="left:${x + 12}px;top:${y + 10}px"><i></i><span>${title}</span></div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 12}px;top:${y + 11}px">${n}</div>`);
    return t.children[1];
  };
  const leaders = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"></svg>`);
  const callLayer = add(`<div style="position:absolute;inset:0"></div>`);
  const btn = {};

  // ------------------------------------------------------------ top band
  add(`<div style="position:absolute;left:16px;top:12px;width:6px;height:76px;background:${C.acc}"></div>`);
  add(`<div style="position:absolute;left:30px;top:10px;font-size:15px;font-weight:800;letter-spacing:-.2px">Pseudo-colour QT machine <span style="color:${C.acc};font-weight:400">/</span> <span class="mo" style="font-size:9px;font-weight:500;letter-spacing:1.6px;color:#6d6357">4 R SCRIPTS · ONE INPUT, q</span></div>`);
  const big = add(`<div style="position:absolute;left:29px;top:32px;white-space:nowrap;line-height:1"></div>`);
  const bigSub = add(`<div class="mo" style="position:absolute;left:31px;top:78px;font-size:9px;letter-spacing:1.2px;color:#6d6357;white-space:nowrap"></div>`);
  add(`<div style="position:absolute;left:560px;top:30px;width:1px;height:58px;background:${C.faint}"></div>`);
  const vPred = add(`<div style="position:absolute;left:576px;top:30px;font-size:30px;font-weight:800;letter-spacing:-.8px;line-height:1"></div>`);
  const vSub = add(`<div class="mo" style="position:absolute;left:578px;top:66px;font-size:10px;font-weight:700;letter-spacing:1.2px;white-space:nowrap"></div>`);
  const srcChips = add(`<div style="position:absolute;left:880px;top:16px;width:300px;display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end"></div>`);
  add(`<div class="sm" style="position:absolute;left:1200px;top:18px">CAMERA</div>`);
  {
    let x = 1200;
    for (const k of CAM_KEYS) {
      const w = Math.round(CAMS[k].label.length * 6.9 + 18);
      btn['cam_' + k] = add(`<div class="bt" style="left:${x}px;top:36px;width:${w}px;height:24px">${CAMS[k].label}</div>`);
      x += w + 5;
    }
  }
  const camNote = add(`<div class="sm" style="position:absolute;left:1200px;top:68px"></div>`);
  const chips = add(`<div style="position:absolute;left:${VP.x0}px;width:${VP.x1 - VP.x0}px;top:${VP.y0 + 4}px;text-align:center"></div>`);

  // ------------------------------------------------------------ left column: charts
  const ecgT = panel(16, 100, 384, 236, '', '01');
  const ecg = add(`<svg style="position:absolute;left:28px;top:124px" width="360" height="206"></svg>`);
  panel(16, 342, 384, 104, 'QT RULER · q AGAINST THE RULE’S WINDOW', '02');
  const rul = add(`<svg style="position:absolute;left:28px;top:364px" width="360" height="78"></svg>`);
  panel(16, 452, 384, 150, 'AREA HOPPERS A1–A9 · mV·ms', '03');
  const hopC = add(`<svg style="position:absolute;left:28px;top:474px" width="360" height="124"></svg>`);
  panel(16, 608, 384, 156, 'SECOND DIFFERENCE S1–S7 · m · IP', '04');
  const sC = add(`<svg style="position:absolute;left:28px;top:630px" width="360" height="130"></svg>`);

  // ------------------------------------------------------------ right column: schematic and subsystems
  panel(1200, 100, 384, 426, 'SCHEMATIC · THE SAME MODEL IN 2D', '05');
  const sch = add(`<svg style="position:absolute;left:1212px;top:124px;pointer-events:auto" width="362" height="398"></svg>`);
  panel(1200, 532, 384, 232, 'SUBSYSTEMS', '06');
  {
    add(`<div style="position:absolute;left:1212px;top:556px;width:360px;height:24px;border-radius:5px;background:#efe6d8"></div>`);
    MODES.forEach((m, i) => (btn[m] = add(`<div class="bt seg" style="left:${1214 + i * 119}px;top:558px;width:118px;height:20px">${m.toUpperCase()}</div>`)));
    btn.all = add(`<div class="bt" style="left:1212px;top:586px;width:360px">WHOLE MACHINE · RELEASE</div>`);
    SUBS.forEach((s, i) => {
      const x = 1212 + (i % 2) * 182;
      const y = 611 + Math.floor(i / 2) * 22;
      btn[s.key] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:178px">${s.label}</div>`);
    });
  }

  // ------------------------------------------------------------ bottom band
  add(`<div class="cp" style="left:16px;top:772px;width:384px;height:116px"></div>`);
  add(`<div class="ph" style="left:28px;top:782px"><i></i>DIAL · q, THE BEAT’S QT</div>`);
  const QS = {x: 32, w: 352, y: 818};
  add(`<div style="position:absolute;left:${QS.x}px;top:${QS.y}px;width:${QS.w}px;height:3px;background:#efe6d8;border-radius:2px"></div>`);
  const nomTick = add(`<div style="position:absolute;top:${QS.y - 6}px;width:2px;height:15px;background:${C.ink}"></div>`);
  const nomLbl = add(`<div class="sm" style="position:absolute;top:${QS.y - 19}px"></div>`);
  const qFill = add(`<div style="position:absolute;left:${QS.x}px;top:${QS.y}px;height:3px;background:${C.acc};border-radius:2px"></div>`);
  const qKnob = add(`<div class="knob" style="top:${QS.y - 6}px"></div>`);
  const qLo = add(`<div class="sm" style="position:absolute;left:${QS.x}px;top:${QS.y + 9}px"></div>`);
  const qHi = add(`<div class="sm" style="position:absolute;right:${1600 - QS.x - QS.w}px;top:${QS.y + 9}px"></div>`);
  DISPLAY.forEach((k, i) => (btn[k] = add(`<div class="bt" style="left:${28 + i * 60}px;top:858px;width:56px;font-size:7.6px;letter-spacing:.4px">${DISPLAY_LABEL[k]}</div>`)));
  add(`<div class="cp" style="left:410px;top:772px;width:780px;height:116px"></div>`);
  add(`<div class="ph" style="left:422px;top:782px"><i></i>GENERATED EXPLANATION · paste() IN SCRIPT 3</div>`);
  const expl = add(`<div style="position:absolute;left:422px;top:800px;width:756px;font-size:9.8px;line-height:1.42;color:#3b352f"></div>`);
  add(`<div class="cp" style="left:1200px;top:772px;width:384px;height:116px"></div>`);
  const ruleT = add(`<div class="ph" style="left:1212px;top:782px"><i></i><span></span></div>`).children[1];
  const ruleBox = add(`<div class="mo" style="position:absolute;left:1212px;top:800px;width:362px;font-size:9px;line-height:1.55"></div>`);

  // ------------------------------------------------------------ overlays, cursor
  const ovCheck = add(`<div class="ov"></div>`);
  const ovNotes = add(`<div class="ov"></div>`);
  ovNotes.innerHTML =
    `<span class="x mo">✕ CLOSE</span><h2>Code notes</h2><p>The six warnings asked for, then the other problems found while building the machine from the code. A warning lights as an amber callout on its part, and as a chip over the viewport when it applies at the current q.</p><h3>WARNINGS</h3>` +
    WARN.map((w) => `<p><b>⚠${w.id} ${w.title}.</b> ${w.text()} <span class="sm">→ ${SUB[w.sub].label}</span></p>`).join('') +
    `<h3>ALSO FOUND IN THE CODE</h3>` +
    EXTRA.map((w) => `<p><b>${w.title}.</b> ${w.text()} <span class="sm">→ ${SUB[w.sub].label}</span></p>`).join('');
  ovCheck.innerHTML = handCheckHTML();
  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2l0 19 5-4.5 3.4 7.3 3.3-1.5-3.3-7.2 6.8-.4z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);

  const spots = {};
  const center = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + parseFloat(n.style.height || 20) / 2];
  for (const [k, n] of Object.entries(btn)) spots[k] = center(n);
  const knobAt = (q) => [QS.x + ((q - Q_RANGE[0]) / (Q_RANGE[1] - Q_RANGE[0])) * QS.w, QS.y + 1];
  let onPick = null;
  sch.addEventListener('click', (e) => {
    const g = e.target.closest('[data-k]');
    if (g && onPick) onPick(g.dataset.k);
  });

  // ------------------------------------------------------------ per frame
  let lastKey = '';
  const update = (res, s) => {
    const key = `${res.q}|${s.focus}|${s.mode}|${s.cam}`;
    if (key !== lastKey) {
      lastKey = key;
      redraw(res, s);
    }
    for (const sb of SUBS) btn[sb.key].classList.toggle('foc', s.focus === sb.key);
    btn.all.classList.toggle('foc', !s.focus);
    for (const m of MODES) btn[m].classList.toggle('on', s.mode === m);
    for (const k of CAM_KEYS) btn['cam_' + k].classList.toggle('on', s.cam === k);
    for (const k of DISPLAY) btn[k].classList.toggle('on', !!s.display[k]);
    ovCheck.style.display = s.display.check ? 'block' : 'none';
    ovNotes.style.display = s.display.notes && !s.display.check ? 'block' : 'none';
    const [kx] = knobAt(res.q);
    qKnob.style.left = `${kx}px`;
    qFill.style.width = `${kx - QS.x}px`;
    let lh = '';
    let ch = '';
    if (s.labels > 0.01 && !s.display.check && !s.display.notes)
      for (const c of s.callouts) {
        const p = s.project(c.p);
        if (!p) continue;
        const [ax, ay] = p;
        // keep the whole label inside the viewport: its width from the longer of its two lines
        const half = Math.max(c.t.length * 6.6, c.s.length * 5.7) / 2 + 10;
        const lx = Math.min(VP.x1 - half, Math.max(VP.x0 + half, ax + c.dx));
        const ly = ay + c.dy;
        if (ax < VP.x0 || ax > VP.x1 || ay < VP.y0 || ay > VP.y1 || ly < VP.y0 + 30 || ly > VP.y1 - 4) continue;
        const col = c.kind === 'warn' ? C.amber : c.kind === 'acc' ? C.acc : C.ink;
        lh += `<line x1="${ax}" y1="${ay}" x2="${lx}" y2="${ly}" stroke="${col}" stroke-width="0.9" opacity="${s.labels}"/><circle cx="${ax}" cy="${ay}" r="2.4" fill="${col}" opacity="${s.labels}"/>`;
        ch += `<div class="call ${c.kind}" style="left:${lx}px;top:${ly}px;opacity:${s.labels}"><b><i></i>${c.t}</b><span>${c.s}</span></div>`;
      }
    leaders.innerHTML = lh;
    callLayer.innerHTML = ch;
    const c = s.cursor;
    cur.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.press ? 0.88 : 1})`;
    cur.style.display = c.x < 0 ? 'none' : 'block';
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = c.ring;
    ring.style.transform = `scale(${1.6 - 0.6 * c.ring})`;
  };

  function redraw(r, s) {
    const o = r.out;
    const dif = Math.round(r.dif);
    // ---------------------------------------------------------------- top band
    big.innerHTML = `<span style="font-size:42px;font-weight:800;letter-spacing:-1.4px">QT ${Math.round(r.q)}</span><span style="font-size:20px;font-weight:700;color:${C.mute}"> ms</span><span style="font-size:20px;font-weight:700;color:${dif > 0 ? C.abn : C.nrm}"> · ${sgn(dif)}${Math.abs(dif)} vs nomogram</span>`;
    bigSub.textContent = `QT_nom ${r.nom.qt} AT HR ${r.gov.hr.toFixed(1)}${NOMOGRAM.placeholder ? ' · PLACEHOLDER' : ''} · T WAVE ENDS ${Math.round(r.tw.end)} MS AFTER R`;
    vPred.textContent = o.pred ? o.pred.toUpperCase() : 'NO VERDICT';
    vPred.style.color = o.pred === 'Abnormal' ? C.abn : o.pred ? C.nrm : C.mute;
    vSub.innerHTML = o.rule
      ? `GRADE ${o.grade} / ${GRADES} · <span style="color:${C.acc}">${o.rule.id}</span> · IP ${r.inf.ip}${r.inf.skipped ? ` · <span style="color:${C.warn}">ROW SKIPPED ⚠2</span>` : ''}`
      : `<span style="color:${C.warn}">${r.inf.unset ? 'IP UNSET ⚠1' : 'NO GATE OPENS'}</span>`;
    srcChips.innerHTML = [
      NOMOGRAM.placeholder ? `QT_nom ${r.nom.qt} · PLACEHOLDER` : null,
      BEAT.invented ? 'BEAT SHAPE INVENTED' : null,
      `HR ${r.gov.hr.toFixed(0)} · ${BEAT.beats} BEATS`,
      C50.splits ? null : 'C5.0 SPLITS N/A',
    ].filter(Boolean).map((t) => `<span class="chip ph2">${t}</span>`).join('');
    camNote.textContent = s.cam === 'sub' && s.focus ? `FRAMING ${SUB[s.focus].label}` : `${CAMS[s.cam]?.label ?? ''} VIEW`;
    chips.innerHTML = WARN.filter((w) => w.id <= 2 && w.on(r)).map((w) => `<span class="chip"><i>⚠${w.id}</i>${w.short(r)}</span>`).join('');
    // ---------------------------------------------------------------- dial
    const [nx] = knobAt(r.nom.qt);
    nomTick.style.left = `${nx - 1}px`;
    nomLbl.style.left = `${nx - 30}px`;
    nomLbl.textContent = `QT_nom ${r.nom.qt}`;
    qLo.textContent = `${Q_RANGE[0]} = QT_nom ${Q_RANGE[0] - r.nom.qt}`;
    qHi.textContent = `${Q_RANGE[1]} = +${Q_RANGE[1] - r.nom.qt}`;
    ecgT.textContent = `PSEUDO-COLOURED ECG · BEAT ${LOUPE_BEAT} OF ${r.det.R.length}`;
    drawEcg(r);
    drawRuler(r);
    drawHoppers(r);
    drawS(r);
    drawSchematic(r, s);
    // ---------------------------------------------------------------- bottom
    expl.innerHTML = o.text
      ? (r.inf.skipped ? `<b style="color:${C.warn}">⚠2 Script 2 skips this ECG's row, so script 3 would never print this.</b> What the rules would say: ` : '') + o.text
      : 'No rule fires, so script 3 writes no sentence.';
    ruleT.textContent = o.rule ? `FIRED · ${o.rule.id} · ${o.rule.cond}` : 'NO RULE FIRES';
    let h = '';
    if (o.winner >= 0) {
      h += o.clauses[o.winner].map((c) => `<span style="color:${c.ok ? '#1b7f4b' : C.warn}">${c.ok ? '✓' : '✗'}</span> ${c.txt}`).join('<br>');
      const before = RULES.slice(0, o.winner).map((x) => x.id);
      h += `<br><span style="color:${C.mute}">${before.length ? `checked first, shut: ${before.join(' ')}` : 'first gate checked'}</span>`;
      h += `<br>window ${o.window[0]}–${o.window[1]} ms · q ${Math.round(r.q)} <b style="color:${r.within ? '#1b7f4b' : C.warn}">${r.within ? 'inside' : 'outside'}</b>`;
    } else h = `<span style="color:${C.warn}">${r.inf.unset ? 'IP is unset: every gate compares IP' : 'every gate shut'}</span>`;
    ruleBox.innerHTML = h;
  }

  // ---------------------------------------------------------------- 01 the ECG
  function drawEcg(r) {
    const W = 360;
    const H1 = 140;
    const R = r.det.R[LOUPE_BEAT - 1];
    const s0 = R - PAINT_LEAD; // paint value c sits at sample s0 + c
    const c1 = r.nom.maxPaint + 2 * SQUARE; // a tail past the paint, to show the grey
    const X = (c) => 6 + (c / c1) * (W - 12);
    let lo = 0;
    let hi = 0;
    for (let c = 0; c <= c1; c++) {
      const v = r.mv[s0 + c - 1];
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const pad = (hi - lo) * 0.08;
    const Y = (v) => 14 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H1 - 20);
    let h = '';
    // grid: one small square = SQUARE ms
    for (let c = 0; c <= c1; c += SQUARE) h += `<line x1="${X(c)}" y1="12" x2="${X(c)}" y2="${H1}" stroke="#f0c9d1" stroke-width="${(c / SQUARE) % 5 ? 0.5 : 1}"/>`;
    const y0 = Y(0);
    const step = X(1) - X(0);
    for (let c = 1; c <= c1; c++) {
      const i = s0 + c - 1;
      const p = r.paint[i];
      const k = r.integ.bin[i];
      const col = p >= GREY ? C.unp : k >= 0 ? BINS[k].col : C.noHop;
      const y = Y(r.mv[i]);
      h += `<rect x="${X(c - 1)}" y="${Math.min(y, y0)}" width="${step + 0.4}" height="${Math.abs(y - y0)}" fill="${col}"/>`;
    }
    h += `<line x1="6" y1="${y0}" x2="${W - 6}" y2="${y0}" stroke="${C.mute}" stroke-width=".5"/>`;
    let d = '';
    for (let c = 0; c <= c1; c++) d += `${c ? 'L' : 'M'}${X(c).toFixed(1)} ${Y(r.mv[s0 + c - 1]).toFixed(1)}`;
    h += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
    // the R peak (solid) and R + QT_nom (dashed), as script 1 draws them
    h += `<line x1="${X(PAINT_LEAD)}" y1="12" x2="${X(PAINT_LEAD)}" y2="${H1}" stroke="${INK}" stroke-width="1.2"/>` + T(X(PAINT_LEAD) + 3, 20, 'R', {fw: 700});
    const xd = X(PAINT_LEAD + r.nom.qt);
    h += `<line x1="${xd}" y1="12" x2="${xd}" y2="${H1}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="4 3"/>` + T(xd + 3, 20, `R + QT_nom`, {fw: 700});
    // the paint end and q (the T end)
    h += `<path d="M${X(r.nom.maxPaint)} 4 v10" stroke="${C.mute}"/>` + T(X(r.nom.maxPaint) - 3, 30, `paint ends ${r.nom.maxPaint}`, {fs: 7, c: C.mute, a: 'end'});
    h += `<path d="M${X(r.q) - 4} 2 h8 l-4 6z" fill="${ACC}"/>` + T(X(r.q) + (X(r.q) > W / 2 ? -6 : 6), 8, `q ${Math.round(r.q)} · T ends`, {fs: 7, c: ACC, a: X(r.q) > W / 2 ? 'end' : 'start', fw: 700});
    h += T(6, H1 + 10, `R − ${PAINT_LEAD} MS`, {fs: 7, c: C.mute}) + T(W - 6, H1 + 10, `+${c1} MS · GREY: NOT PAINTED (${GREY})`, {fs: 7, c: C.mute, a: 'end'});
    // the full strip
    const sy = H1 + 18;
    const sh = 40;
    const px = (W - 12) / N;
    const ys = (v) => sy + 4 + (1 - (v - lo) / (hi - lo)) * (sh - 8);
    const bx = 6 + (s0 - 1) * px;
    h += `<rect x="6" y="${sy}" width="${W - 12}" height="${sh}" fill="#fbf6ee" stroke="${C.line}"/>`;
    const cols = W - 12;
    const per = N / cols;
    let top = '';
    for (let x = 0; x < cols; x++) {
      let mn = Infinity;
      let mx = -Infinity;
      let kk = -2;
      for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i++) {
        mn = Math.min(mn, r.mv[i]);
        mx = Math.max(mx, r.mv[i]);
        if (r.paint[i] < GREY && r.integ.bin[i] > kk) kk = r.integ.bin[i];
      }
      if (kk >= 0) h += `<rect x="${6 + x}" y="${Math.min(ys(mx), ys(0))}" width="1.05" height="${Math.abs(ys(0) - ys(mx))}" fill="${BINS[kk].col}"/>`;
      top += `${x ? 'L' : 'M'}${6 + x} ${ys(mx).toFixed(1)}L${6 + x} ${ys(mn).toFixed(1)}`;
    }
    h += `<path d="${top}" fill="none" stroke="${INK}" stroke-width=".6"/>`;
    h += `<rect x="${bx}" y="${sy - 1}" width="${c1 * px}" height="${sh + 2}" fill="none" stroke="${ACC}" stroke-width="1.2"/>`;
    h += T(6, sy + sh + 9, `FULL STRIP · ${STRIP_S} S · ${N.toLocaleString('en-US')} SAMPLES`, {fs: 7, c: C.mute}) + T(W - 6, sy + sh + 9, `R PEAKS ${r.det.R.length}`, {fs: 7, c: C.mute, a: 'end'});
    ecg.innerHTML = h;
  }

  // ---------------------------------------------------------------- 02 the QT ruler
  function drawRuler(r) {
    const W = 360;
    const bins = r.ruler.bins;
    const lo = bins[0].lo;
    const hi = bins[bins.length - 1].hi;
    const X = (v) => 8 + ((v - lo) / (hi - lo)) * (W - 16);
    let h = '';
    const by = 30;
    bins.forEach((b) => {
      h += `<rect x="${X(b.lo) + 0.5}" y="${by}" width="${X(b.hi) - X(b.lo) - 1}" height="14" fill="${b.col}"/>`;
      h += T((X(b.lo) + X(b.hi)) / 2, by + 24, `${b.hi}`, {fs: 7, a: 'middle', c: C.mute});
    });
    h += T(X(lo), by + 24, `${lo}`, {fs: 7, a: 'middle', c: C.mute});
    h += T(X(lo), by - 4, `QT_nom ${lo - r.nom.qt}`, {fs: 7, c: C.mute}) + T(X(hi), by + 34, `QT_nom +${hi - r.nom.qt}`, {fs: 7, c: C.mute, a: 'end'});
    h += `<line x1="${X(r.nom.qt)}" y1="${by - 4}" x2="${X(r.nom.qt)}" y2="${by + 18}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="3 2"/>` + T(X(r.nom.qt), by + 34, 'QT_nom', {fs: 7, a: 'middle', fw: 700});
    if (r.out.window) {
      const [a, b] = r.out.window;
      h += `<rect x="${X(a)}" y="${by - 12}" width="${X(b) - X(a)}" height="7" fill="none" stroke="${ACC}" stroke-width="1.4"/>`;
      const mid = (X(a) + X(b)) / 2;
      h += T(mid > W - 70 ? X(b) : mid < 70 ? X(a) : mid, by - 15, `${r.out.rule.id} ESTIMATE ${a}–${b}`, {fs: 7.2, a: mid > W - 70 ? 'end' : mid < 70 ? 'start' : 'middle', c: ACC, fw: 700});
    }
    const qx = X(Math.max(lo, Math.min(hi, r.q)));
    const off = r.q > hi || r.q < lo;
    h += `<line x1="${qx}" y1="${by - 6}" x2="${qx}" y2="${by + 18}" stroke="${ACC}" stroke-width="2.4"/>`;
    h += T(qx, by + 44, `q ${Math.round(r.q)}${off ? ' (OFF SCALE)' : ''} · ${r.out.window ? (r.within ? 'INSIDE ✓' : 'OUTSIDE ✗') : '—'}`, {fs: 7.6, a: qx > W - 70 ? 'end' : qx < 70 ? 'start' : 'middle', c: ACC, fw: 700});
    rul.innerHTML = h;
  }

  // ---------------------------------------------------------------- 03 the hoppers
  function drawHoppers(r) {
    const W = 360;
    const bw = (W - 16) / BINS.length;
    const base = 96;
    let h = `<line x1="4" y1="${base}" x2="${W - 4}" y2="${base}" stroke="${C.faint}"/>`;
    let kmax = 0;
    r.integ.A.forEach((a, k) => (a > r.integ.A[kmax] ? (kmax = k) : 0));
    r.integ.A.forEach((a, k) => {
      const x = 8 + k * bw;
      const hh = Math.max(0.8, (a / SCALE.A) * 78);
      h += `<rect x="${x + 4}" y="${base - hh}" width="${bw - 8}" height="${hh}" fill="${BINS[k].col}"${k === kmax ? ` stroke="${ACC}" stroke-width="1.4"` : ''}/>`;
      h += T(x + bw / 2, base - hh - 3, f1(a), {fs: 7.4, a: 'middle', fw: k === kmax ? 700 : 400});
      h += T(x + bw / 2, base + 10, `A${k + 1}`, {fs: 7.4, a: 'middle', fw: 700});
      h += T(x + bw / 2, base + 19, BINS[k].name.split(' ').map((w) => w.slice(0, 3)).join(' '), {fs: 6.4, a: 'middle', c: C.mute});
    });
    hopC.innerHTML = h;
  }

  // ---------------------------------------------------------------- 04 S1..S7, m, IP
  function drawS(r) {
    const W = 360;
    const n = r.inf.S.length;
    const bw = (W - 30) / (n + 1); // room on the right for IP = n + 0.5
    const X = (j) => 12 + (j - 0.5) * bw; // centre of bar S_j (1-based)
    const z = 58;
    let h = `<line x1="4" y1="${z}" x2="${W - 4}" y2="${z}" stroke="${C.faint}"/>` + T(W - 4, z - 3, '0', {fs: 7, a: 'end', c: C.mute});
    r.inf.S.forEach((sv, i) => {
      const j = i + 1;
      const hh = (sv / SCALE.S) * 44;
      const m = j === r.inf.m;
      h += `<rect x="${X(j) - bw * 0.3}" y="${Math.min(z, z - hh)}" width="${bw * 0.6}" height="${Math.max(0.8, Math.abs(hh))}" fill="${m ? ACC : sv < 0 ? '#c9a27a' : '#9aa0a8'}"/>`;
      h += T(X(j), sv < 0 ? z - hh + 9 : z - hh - 3, f1(sv), {fs: 7.2, a: 'middle', fw: m ? 700 : 400, c: m ? ACC : INK});
      h += T(X(j), 118, `S${j}`, {fs: 7.4, a: 'middle', fw: 700, c: m ? ACC : INK});
    });
    if (r.inf.ip !== null) {
      const x = X(r.inf.ip + 0.5) - bw / 2; // IP = j + 0.5 sits halfway between S_j and S_j+1
      h += `<line x1="${x}" y1="6" x2="${x}" y2="108" stroke="${ACC}" stroke-width="1.6" stroke-dasharray="4 3"/>` + T(x + 3, 12, `IP ${r.inf.ip}`, {fs: 8, fw: 700, c: ACC});
    } else h += T(W / 2, 12, 'IP UNSET ⚠1', {fs: 8, fw: 700, c: C.warn, a: 'middle'});
    h += T(4, 12, `m = ${r.inf.m} · ${S_NAMES[r.inf.m - 1]}`, {fs: 7.4, c: ACC, fw: 700});
    sC.innerHTML = h;
  }

  // ---------------------------------------------------------------- 05 the schematic
  function drawSchematic(r, s) {
    const BW = 170;
    const BH = 36;
    const G = 9;
    const colA = SUBS.slice(0, 7);
    const colB = SUBS.slice(7, 13);
    const c50 = SUBS[13];
    const xA = 2;
    const xB = 190;
    const pos = {};
    colA.forEach((b, i) => (pos[b.key] = [xA, i * (BH + G), BH]));
    let y = 0;
    colB.forEach((b) => {
      const hh = b.key === 'gates' ? 58 : BH;
      pos[b.key] = [xB, y, hh];
      y += hh + G;
    });
    pos.c50 = [xA, 7 * (BH + G) + 6, BH];
    const broken = r.inf.skipped || r.inf.unset; // the path to script 3 breaks here
    const after = new Set(['gates', 'output']);
    let h = `<defs><marker id="ar" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="${ACC}"/></marker><marker id="ag" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="${C.amber}"/></marker></defs>`;
    const arrow = (d, ok = true, dash = false) => `<path d="${d}" fill="none" stroke="${ok ? ACC : C.amber}" stroke-width="1.4"${dash ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#${ok ? 'ar' : 'ag'})"/>`;
    for (let i = 0; i < colA.length - 1; i++) h += arrow(`M${xA + BW / 2} ${pos[colA[i].key][1] + BH} V${pos[colA[i + 1].key][1] - 1}`);
    const [, yI] = pos.integ;
    h += arrow(`M${xA + BW} ${yI + BH / 2} H${xB - 9} V${BH / 2} H${xB - 1}`);
    for (let i = 0; i < colB.length - 1; i++) {
      const k = colB[i + 1].key;
      const bad = broken && after.has(k);
      h += arrow(`M${xB + BW / 2} ${pos[colB[i].key][1] + pos[colB[i].key][2]} V${pos[k][1] - 1}`, !bad, bad);
    }
    // the C5.0 bench taps S1–S5 and IP beside the rules
    h += `<path d="M${xB} ${pos.ipsel[1] + BH / 2} H${xB - 14} V${pos.c50[1] + BH / 2} H${xA + BW + 1}" fill="none" stroke="${C.mute}" stroke-width="1" stroke-dasharray="3 3" marker-end="url(#ar)"/>`;
    const warnOn = (k) => WARN.filter((w) => w.sub === k && (w.id > 2 ? true : w.on(r))).map((w) => w.id);
    for (const sb of SUBS) {
      const [x, yy, hh] = pos[sb.key];
      const foc = s.focus === sb.key;
      const dim = broken && after.has(sb.key);
      const isC = sb.key === 'c50';
      h += `<g class="blk" data-k="${sb.key}">`;
      h += `<rect x="${x}" y="${yy}" width="${BW}" height="${hh}" rx="4" fill="${foc ? '#fde4ec' : '#fffdf9'}" stroke="${foc ? ACC : dim ? C.amber : C.faint}" stroke-width="${foc ? 1.6 : 1}"${isC || dim ? ' stroke-dasharray="4 3"' : ''}/>`;
      if (!isC) h += `<rect x="${x}" y="${yy}" width="3" height="${hh}" fill="${dim ? C.amber : ACC}"/>`;
      h += T(x + 9, yy + 13, sb.short, {fs: 8, fw: 700, ls: 0.8});
      h += T(x + 9, yy + 27, sb.val(r), {fs: 8, c: isC ? C.mute : dim ? C.warn : '#4a433c'});
      const ws = warnOn(sb.key);
      if (ws.length) h += T(x + BW - 5, yy + 13, ws.map((i) => `⚠${i}`).join(' '), {fs: 8, fw: 700, c: C.amber, a: 'end'});
      if (sb.key === 'gates') {
        const cw = (BW - 18) / 10;
        r.out.open.forEach((_, i) => {
          const win = r.out.winner === i;
          const before = r.out.winner < 0 || i < r.out.winner;
          const cx = x + 9 + i * cw;
          h += `<rect x="${cx}" y="${yy + 33}" width="${cw - 2}" height="18" rx="2" fill="${win ? ACC : before ? '#d9d1c5' : 'none'}" stroke="${win ? ACC : C.faint}"/>`;
          h += T(cx + (cw - 2) / 2, yy + 45, RULES[i].id.slice(1), {fs: 7.2, a: 'middle', fw: 700, c: win ? '#fff' : before ? '#7d7469' : C.faint});
        });
      }
      h += '</g>';
    }
    if (broken) h += T(xB + BW / 2, pos.gates[1] - 2, r.inf.skipped ? 'row not written ⚠2' : 'IP unset ⚠1', {fs: 7, c: C.warn, a: 'middle', fw: 700});
    h += T(xA, pos.c50[1] + BH + 14, 'GREY CELLS: CHECKED IN ORDER, SHUT · PINK: OPENED · CLEAR: NEVER REACHED', {fs: 6.6, c: C.mute});
    sch.innerHTML = h;
  }

  return {root: ui, btn, spots, knobAt, QS, update, ovCheck, ovNotes, set onPick(f) {
    onPick = f;
  }};
}

// ------------------------------------------------------------------------------------------------ the hand check
// Every number below is computed from model.js or read from its constants; the areas are also checked against an
// independent integral of the beat function (a midpoint sum aligned to the samples each trapezoid spans).
function handCheckHTML() {
  const q0 = roundR(NOMOGRAM.lookup(60000 / BEAT.rr));
  const r = run(q0);
  const A = r.integ.A;
  const S = r.inf.S;
  const per = r.det.R.length;
  const ind = r.ruler.bins.map((b) => {
    let sum = 0;
    const h = 0.002;
    for (let c = b.lo + 1; c < b.hi + 1; c += h) sum += Math.abs(beatAt(c + h / 2 - PAINT_LEAD, q0)) * h;
    return per * sum;
  });
  // the first q in the sweep where each of warnings 1 and 2 fires
  const sweep = [];
  for (let q = Q_RANGE[0]; q <= Q_RANGE[1]; q += 1) sweep.push(run(q));
  const qa1 = sweep.find((x) => x.inf.overwritten);
  const qa2 = sweep.find((x) => x.inf.skipped);
  const R0 = r.det.R[0];
  const ok = (b, good) => `<span class="${good ? 'ok' : 'no'}">${b}</span>`;
  const B = BEAT;
  const eq = (b) => (0.5 * (b.at / b.sd) ** 2).toFixed(3);
  const rawHand = B.r.amp + B.q.amp * Math.exp(-0.5 * (B.q.at / B.q.sd) ** 2) + B.s.amp * Math.exp(-0.5 * (B.s.at / B.s.sd) ** 2) - LIFT;
  const rr = r.gov.rr;
  const m = r.inf.m;
  const pw = Math.max(0, r.out.winner - 1);
  return `<span class="x mo">✕ CLOSE</span>
  <h2>Hand check</h2>
  <p>Worked at q = ${q0} ms (on the nomogram line at the beat’s HR), then at the two q where warnings ⚠1 and ⚠2 fire. Green: the hand number matches the machine.</p>
  <h3>1 · STRIP, PEAKS, RR, HR</h3><table>
  <tr><td>samples</td><td>${STRIP_S} s ÷ ${SAMPLE_MS} ms = ${(STRIP_S * 1000) / SAMPLE_MS}</td><td>${ok(r.raw.length, r.raw.length === (STRIP_S * 1000) / SAMPLE_MS)}</td></tr>
  <tr><td>R peak, raw</td><td>${B.r.amp} + (${B.q.amp})·e<sup>−${eq(B.q)}</sup> + (${B.s.amp})·e<sup>−${eq(B.s)}</sup> − ${LIFT} = ${f3(rawHand)} mV ≥ ${R_KEEP}</td><td>${ok(f3(r.det.kept[0].mv), Math.abs(r.det.kept[0].mv - rawHand) < 1e-3)}</td></tr>
  <tr><td>peaks kept</td><td>${B.beats} beats at ${B.firstR} + k·${B.rr}; gaps ${B.rr} ≥ ${RR_DROP}, so none dropped</td><td>${ok(`${per} · dropped ${r.det.dropped.length}`, per === B.beats && !r.det.dropped.length)}</td></tr>
  <tr><td>HR</td><td>${r.gov.kept.length} RR of ${rr} ms in ${RR_MIN}–${RR_MAX} → 60000 / ${rr}</td><td>${ok(r.gov.hr.toFixed(1), r.gov.hr === 60000 / B.rr)}</td></tr>
  <tr><td>HR window</td><td>60000/${RR_MAX} = ${HR_LO} · 60000/${RR_MIN} = ${HR_HI} bpm</td><td>${ok(`${HR_LO}–${HR_HI}`, true)}</td></tr></table>
  <h3>2 · NOMOGRAM, PAINT, RULER</h3><table>
  <tr><td>nomogram</td><td>which.min(|HR_nomogram − ${r.gov.hr}|) → row ${r.nom.row.index} (Excel row ${r.nom.row.excelRow}): HR ${r.nom.row.hr.toFixed(3)}, QT_pred ${r.nom.row.qtPred} → round</td><td>${ok(r.nom.qt, r.nom.qt === roundR(r.nom.row.qtPred))}</td></tr>
  <tr><td>limits</td><td>upper ${r.nom.qt} + ${UPPER_SQ}·${SQUARE} · lower ${r.nom.qt} − ${LOWER_SQ}·${SQUARE} · HR ${r.gov.hr} ${r.gov.hr >= HR_FAST ? '≥' : '<'} ${HR_FAST}, so paint to ${r.gov.hr >= HR_FAST ? `QT_nom + ${FAST_SQ * SQUARE}` : 'upper'}</td><td>${ok(`${r.nom.upper} / ${r.nom.lower} / ${r.nom.maxPaint}`, r.nom.upper === r.nom.qt + UPPER_SQ * SQUARE && r.nom.lower === r.nom.qt - LOWER_SQ * SQUARE)}</td></tr>
  <tr><td>paint start</td><td>R at ${R0} → index ${R0 - PAINT_LEAD}; sample ${R0 - PAINT_LEAD + 1} gets 1, sample ${R0} (the R peak) gets ${PAINT_LEAD}</td><td>${ok(`${r.paint[R0 - PAINT_LEAD]} · ${r.paint[R0 - 1]}`, r.paint[R0 - PAINT_LEAD] === 1 && r.paint[R0 - 1] === PAINT_LEAD)}</td></tr>
  <tr><td>paint end</td><td>sample ${R0 - PAINT_LEAD + r.nom.maxPaint} gets ${r.nom.maxPaint}, the next one ${GREY} (grey)</td><td>${ok(`${r.paint[R0 - PAINT_LEAD + r.nom.maxPaint - 1]} · ${r.paint[R0 - PAINT_LEAD + r.nom.maxPaint]}`, r.paint[R0 - PAINT_LEAD + r.nom.maxPaint] === GREY)}</td></tr>
  <tr><td>ruler</td><td>edges ${r.ruler.cc[0] - SQUARE}, ${r.ruler.cc.join(', ')} → ${BINS.length} × ${SQUARE} ms; one small square at ${PAPER_SPEED} mm/s = 1000/${PAPER_SPEED} = ${1000 / PAPER_SPEED} ms</td><td>${ok(`${r.ruler.bins[BINS.length - 1].hi - r.ruler.bins[0].lo} ms`, r.ruler.bins[BINS.length - 1].hi - r.ruler.bins[0].lo === BINS.length * SQUARE)}</td></tr>
  <tr><td>samples per bin</td><td>purple (${r.ruler.bins[0].lo},${r.ruler.bins[0].hi}) open at both ends → <b>${SQUARE - 1}</b>; the others (lo,hi] → ${SQUARE}</td><td>${ok(r.integ.count.map((n) => n / per).join(' '), r.integ.count[0] / per === SQUARE - 1)}</td></tr></table>
  <p><b>Correction to the brief:</b> “every ${SQUARE} ms bin holds exactly ${SQUARE} trapezoids” holds for ${BINS.length - 1} of the ${BINS.length} bins. Purple holds ${SQUARE - 1} per beat, and paint value ${r.ruler.bins[0].hi} falls in no hopper.</p>
  <h3>3 · AREAS (q = ${q0}), AGAINST AN INDEPENDENT INTEGRAL</h3>
  <table><tr><td>bin</td>${BINS.map((b) => `<td>${b.name}</td>`).join('')}</tr>
  <tr><td>trapezoids</td>${A.map((a) => `<td>${f3(a)}</td>`).join('')}</tr>
  <tr><td>∫|beat| × ${per}</td>${ind.map((a) => `<td>${f3(a)}</td>`).join('')}</tr>
  <tr><td>match</td>${A.map((a, k) => `<td>${ok(Math.abs(a - ind[k]) < 0.02 ? '✓' : '✗', Math.abs(a - ind[k]) < 0.02)}</td>`).join('')}</tr></table>
  <h3>4 · S, m, IP, RULE (q = ${q0})</h3><table>
  ${[m - 1, m, m + 1].filter((j) => j >= 1 && j <= S.length).map((j) => `<tr><td>S${j}</td><td>A${j} − 2·A${j + 1} + A${j + 2} = ${f3(A[j - 1])} − 2·${f3(A[j])} + ${f3(A[j + 1])}</td><td>${ok(f3(S[j - 1]), Math.abs(A[j - 1] - 2 * A[j] + A[j + 1] - S[j - 1]) < 1e-9)}${j === m ? ' most negative → m' : ''}</td></tr>`).join('')}
  <tr><td>IP</td><td>branches fired for m = ${m}: ${r.inf.fired.map((b) => b.val).join(' → ')}</td><td>${ok(`IP ${r.inf.ip}`, r.inf.ip !== null)}</td></tr>
  <tr><td>${RULES[pw].id}</td><td>the gate just before: ${r.out.clauses[pw].map((c) => `${c.txt} ${c.ok ? '✓' : '✗'}`).join(' & ')}</td><td>${ok(r.out.res[pw] ? 'open' : 'shut', !r.out.res[pw])}</td></tr>
  <tr><td>${r.out.rule.id}</td><td>${firedText(r)} → ${r.out.pred}, grade ${r.out.grade}, ${r.nom.qt}${sgn(r.out.rule.lo)}${Math.abs(r.out.rule.lo)} … ${r.nom.qt}${sgn(r.out.rule.hi)}${Math.abs(r.out.rule.hi)}</td><td>${ok(`${r.out.window.join('–')}`, true)}</td></tr></table>
  <p>q = ${q0} sits on the nomogram line, yet ${r.out.rule.id} puts the QT at ${r.out.window.join('–')} ms. That is what the code does with this invented beat; it says nothing about real ECGs.</p>
  <h3>5 · THE WARNINGS AT WORK</h3><table>
  <tr><td>q = ${qa1.q} ⚠1</td><td>m = ${qa1.inf.m}; branches ${qa1.inf.fired.map((b) => b.val).join(' then ')}: the later one overwrites</td><td>${ok(`IP ${qa1.inf.ip}`, qa1.inf.overwritten)}</td></tr>
  <tr><td></td><td>${firedText(qa1)}</td><td>${ok(qa1.out.rule.id, true)}</td></tr>
  <tr><td>q = ${qa2.q} ⚠2</td><td>m = ${qa2.inf.m}; branches ${qa2.inf.fired.map((b) => b.val).join(' then ')}, the last with <code>next</code></td><td>${ok(`IP ${qa2.inf.ip}, row skipped`, qa2.inf.skipped)}</td></tr></table>
  <h3>6 · WHERE EACH NUMBER COMES FROM</h3><table>
  <tr><td>the code</td><td>lift ${LIFT}, flat-top ${FLAT_MIN} and keep ${R_KEEP} mV, drop ${RR_DROP} ms, RR ${RR_MIN}–${RR_MAX} ms, lead ${PAINT_LEAD} ms, grey ${GREY}, bins ${SQUARE} ms, limits +${UPPER_SQ}/−${LOWER_SQ} squares, HR ${HR_FAST}, ratio ${RULE_RATIO} and the ${RULES.length} rules</td></tr>
  <tr><td>ECG paper</td><td>${PAPER_SPEED} mm/s: 1 mm = ${1000 / PAPER_SPEED} ms, one small square</td></tr>
  <tr><td>1 sample = ${SAMPLE_MS} ms</td><td>assumed, as the code assumes it (sample gaps read as ms in RR and 60000/RR); holds only for a 1 kHz recorder</td></tr>
  <tr><td>QTnomogram.xlsx</td><td>QT_nom: the first row nearest HR ${r.gov.hr} is Excel row ${r.nom.row.excelRow} (HR ${r.nom.row.hr.toFixed(2)}, QT_pred ${r.nom.row.qtPred}) → round → ${r.nom.qt} ms (${NOMOGRAM.source})</td></tr>
  <tr><td class="no">the brief</td><td>HR fixed by RR ${B.rr} ms; q from QT_nom ${Q_RANGE[0] - q0} to +${Q_RANGE[1] - q0}</td></tr>
  <tr><td class="no">invented</td><td>beat: P ${B.p.amp}, Q ${B.q.amp}, R ${B.r.amp}, S ${B.s.amp}, T ${B.t.amp} mV, T lasting ${B.t.durK}·q</td></tr>
  <tr><td class="no">not available</td><td>C5.0 thresholds (UnbalancedData.xlsx not attached)</td></tr></table>`;
}
