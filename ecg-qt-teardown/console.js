// The console, laid out at 1600 x 900: input, front end, the A → D → S chart, subsystem buttons, display toggles,
// the output, the explanation sentence, warning chips, the focus card, callouts with leaders, and two overlays
// (hand check, code notes). update(res, s) redraws every live part from run(q).
import {BINS, Q_RANGE, run, RULES, S_NAMES, beatAt} from './model.js';
import {ACC, INK, SCALE} from './machine.js';
import {EXTRA, SUB, SUBS, WARN} from './notes.js';

export const C = {ink: INK, mute: '#8d8478', faint: '#d9cdbb', line: '#e6dccd', panel: 'rgba(252,249,244,.95)', acc: ACC, warn: '#b45309'};
export const DISPLAY = ['labels', 'glass', 'exploded', 'orbit', 'check', 'notes'];
export const DISPLAY_LABEL = {labels: 'LABELS', glass: 'GLASS', exploded: 'EXPLODED', orbit: 'ORBIT', check: 'HAND CHECK', notes: 'CODE NOTES'};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(120,90,50,.08)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.8px}
.ph i{display:block;width:3px;height:13px;background:${C.acc}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.rw{position:absolute;left:0;right:0;display:flex;justify-content:space-between;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.4px}
.rw span:first-child{color:${C.mute}}
.rw b{font-weight:700}
.bt{position:absolute;height:22px;padding:0 8px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fffdf9;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.1px;color:${C.ink};white-space:nowrap;box-sizing:border-box}
.bt.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.bt.foc{background:${C.acc};color:#fff;border-color:${C.acc}}
.call{position:absolute;white-space:nowrap;transform:translate(-50%,-100%)}
.call b{display:flex;align-items:center;gap:6px;font:700 9.6px 'JetBrains Mono',monospace;letter-spacing:1.1px;color:${C.ink};background:rgba(252,249,244,.9);padding:2px 5px;border-radius:3px}
.call b i{display:block;width:6px;height:6px;background:${C.ink}}
.call.acc b i{background:${C.acc}}
.call span{display:block;font:500 8.2px 'JetBrains Mono',monospace;letter-spacing:1px;color:#6d6357;margin-top:1px;padding:0 5px;background:rgba(252,249,244,.8)}
.chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:4px;background:${C.ink};color:#fff;font:700 9px 'JetBrains Mono',monospace;letter-spacing:1px;margin:0 3px}
.chip i{font-style:normal;color:#ffb02e}
.chip.ph2{background:#fff3e0;color:${C.warn};border:1px solid #f3c58f}
.ov{position:absolute;left:340px;top:84px;width:920px;height:640px;background:rgba(252,249,244,.98);border:1px solid ${C.line};border-radius:8px;box-shadow:0 8px 30px rgba(80,60,30,.18);overflow:auto;pointer-events:auto;display:none;padding:22px 26px;box-sizing:border-box}
.ov h2{margin:0 0 4px;font:800 19px Inter,sans-serif;letter-spacing:-.2px}
.ov h3{margin:16px 0 6px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.acc}}
.ov p,.ov li{font:400 12px/1.55 Inter,sans-serif;color:#3b352f;margin:4px 0}
.ov code,.ov td{font:500 11px 'JetBrains Mono',monospace}
.ov table{border-collapse:collapse;margin:6px 0}
.ov td{padding:2px 10px 2px 0;border-bottom:1px solid ${C.line};color:#3b352f}
.ov .ok{color:#1b7f4b;font-weight:700}
.ov .no{color:${C.warn};font-weight:700}
.ov .x{position:absolute;right:16px;top:14px;cursor:pointer}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.acc};opacity:0;z-index:49}
.knob{position:absolute;top:0;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.acc};box-sizing:border-box}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const f1 = (v) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));
const f2 = (v) => v.toFixed(3);

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
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };
  const rows = (x, y, w, n, gap = 17) =>
    Array.from({length: n}, (_, i) => {
      const r = add(`<div class="rw" style="left:${x}px;width:${w}px;right:auto;top:${y + i * gap}px"><span></span><b></b></div>`);
      return {k: r.children[0], v: r.children[1], r};
    });
  const leaders = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"></svg>`);
  const callLayer = add(`<div style="position:absolute;inset:0"></div>`);

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:20px;top:16px;width:8px;height:40px;background:${C.acc}"></div>`);
  add(`<div style="position:absolute;left:38px;top:14px;font-size:27px;font-weight:800;letter-spacing:-.6px;line-height:1">Pseudo-colour QT machine <span style="color:${C.acc};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:39px;top:46px;font-size:10px;letter-spacing:2px;color:#6d6357">4 R SCRIPTS → 1 MODEL, run(q) · PSEUDO-COLOUR → AREAS → Δ² → INFLECTION → 10 RULES · C5.0 BENCH</div>`);
  add(`<div class="chip ph2" style="position:absolute;right:300px;top:22px;margin:0">QT_nom = 440 MS · PLACEHOLDER</div>`);
  add(`<div class="chip ph2" style="position:absolute;right:146px;top:22px;margin:0">BEAT SHAPE INVENTED</div>`);
  add(`<div class="chip ph2" style="position:absolute;right:20px;top:22px;margin:0">HR FIXED 60 BPM</div>`);
  const chips = add(`<div style="position:absolute;left:340px;width:920px;top:66px;text-align:center"></div>`);

  // ------------------------------------------------------------ 01 input
  panel(20, 80, 300, 150, 'INPUT · q', '01');
  add(`<div class="sm" style="position:absolute;left:34px;top:108px">QT OF THE SYNTHETIC BEAT</div>`);
  const qBig = add(`<div style="position:absolute;left:33px;top:122px;font-size:34px;font-weight:800;letter-spacing:-1px"></div>`);
  const qDif = add(`<div class="mo" style="position:absolute;right:${1600 - 306}px;top:128px;font-size:11px;font-weight:700;text-align:right;line-height:1.5"></div>`);
  const QS = {x: 36, w: 268, y: 186};
  add(`<div style="position:absolute;left:${QS.x}px;top:${QS.y}px;width:${QS.w}px;height:3px;background:#efe6d8;border-radius:2px"></div>`);
  // the nomogram tick on the slider
  const nomX = QS.x + ((440 - Q_RANGE[0]) / (Q_RANGE[1] - Q_RANGE[0])) * QS.w;
  add(`<div style="position:absolute;left:${nomX - 1}px;top:${QS.y - 6}px;width:2px;height:15px;background:${C.ink}"></div>`);
  const qFill = add(`<div style="position:absolute;left:${QS.x}px;top:${QS.y}px;height:3px;background:${C.acc};border-radius:2px"></div>`);
  const qKnob = add(`<div class="knob" style="top:${QS.y - 6}px"></div>`);
  add(`<div class="sm" style="position:absolute;left:${QS.x}px;top:${QS.y + 14}px">${Q_RANGE[0]} = QT_nom − 200</div>`);
  add(`<div class="sm" style="position:absolute;right:${1600 - QS.x - QS.w}px;top:${QS.y + 14}px">${Q_RANGE[1]} = +100</div>`);
  add(`<div class="sm" style="position:absolute;left:${nomX - 30}px;top:${QS.y - 18}px">QT_nom 440</div>`);

  // ------------------------------------------------------------ 02 front end
  panel(20, 242, 300, 196, 'FRONT END · SCRIPT 1', '02');
  const fe = rows(34, 274, 272, 9, 17.5);

  // ------------------------------------------------------------ 03 A → D → S
  panel(20, 450, 300, 306, 'AREAS → D → S → IP', '03');
  const chart = add(`<svg style="position:absolute;left:30px;top:478px" width="282" height="272"></svg>`);

  // ------------------------------------------------------------ 04 subsystems
  const btn = {};
  panel(1280, 80, 300, 270, 'SUBSYSTEMS', '04');
  btn.all = add(`<div class="bt" style="left:1294px;top:110px;width:272px">WHOLE MACHINE</div>`);
  SUBS.forEach((s, i) => {
    const x = 1294 + (i % 2) * 139;
    const y = 138 + Math.floor(i / 2) * 29;
    btn[s.key] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:133px">${s.label}</div>`);
  });
  // ------------------------------------------------------------ 05 display
  panel(1280, 362, 300, 94, 'DISPLAY', '05');
  DISPLAY.forEach((k, i) => {
    const x = 1294 + (i % 3) * 92;
    const y = 392 + Math.floor(i / 3) * 29;
    btn[k] = add(`<div class="bt" style="left:${x}px;top:${y}px;width:87px">${DISPLAY_LABEL[k]}</div>`);
  });
  // ------------------------------------------------------------ 06 output
  panel(1280, 468, 300, 288, 'OUTPUT · SCRIPT 3', '06');
  const oRule = add(`<div style="position:absolute;left:1294px;top:496px;font-size:30px;font-weight:800;letter-spacing:-1px"></div>`);
  const oPred = add(`<div style="position:absolute;left:1376px;top:500px;font-size:20px;font-weight:800;letter-spacing:-.3px"></div>`);
  const oCond = add(`<div class="mo" style="position:absolute;left:1294px;top:535px;width:272px;font-size:9.4px;color:#6d6357;line-height:1.4"></div>`);
  const out = rows(1294, 566, 272, 8, 18.5);

  // ------------------------------------------------------------ bottom: the explanation
  add(`<div class="cp" style="left:340px;top:768px;width:1240px;height:118px"></div>`);
  add(`<div class="ph" style="left:354px;top:781px"><i></i>GENERATED EXPLANATION · paste() IN SCRIPT 3</div>`);
  const expl = add(`<div style="position:absolute;left:354px;top:801px;width:1210px;font-size:10.6px;line-height:1.48;color:#3b352f"></div>`);
  add(`<div class="cp" style="left:20px;top:768px;width:300px;height:118px"></div>`);
  add(`<div class="ph" style="left:34px;top:781px"><i></i>SOURCES</div>`);
  add(`<div class="mo" style="position:absolute;left:34px;top:801px;width:276px;font-size:8.8px;line-height:1.55;color:#6d6357">Code: the 4 attached R scripts (code wins over comments).<br><span style="color:${C.warn}">UNVERIFIED</span> QT_nom 440: QTnomogram.xlsx not attached.<br><span style="color:${C.warn}">INVENTED</span> beat shape (P, QRS, T curves).<br><span style="color:${C.warn}">N/A</span> C5.0 splits: UnbalancedData.xlsx not attached.</div>`);

  // ------------------------------------------------------------ focus card (top-left of the viewport)
  const card = add(`<div class="cp" style="left:340px;top:96px;width:330px;padding:12px 14px 12px;box-sizing:border-box;display:none"></div>`);

  // ------------------------------------------------------------ overlays
  const ovCheck = add(`<div class="ov"></div>`);
  const ovNotes = add(`<div class="ov"></div>`);
  ovNotes.innerHTML =
    `<span class="x mo">✕ CLOSE</span><h2>Code notes</h2><p>The six warnings asked for, then the other problems found while building the machine from the code. A chip at the top of the viewport lights when a warning applies at the current q.</p>` +
    `<h3>WARNINGS</h3>` +
    WARN.map((w) => `<p><b>⚠${w.id} ${w.title}.</b> ${w.text} <span class="sm">→ ${SUB[w.sub].label}</span></p>`).join('') +
    `<h3>ALSO FOUND IN THE CODE</h3>` +
    EXTRA.map((w) => `<p><b>${w.title}.</b> ${w.text} <span class="sm">→ ${SUB[w.sub].label}</span></p>`).join('');
  ovCheck.innerHTML = handCheckHTML();

  // ------------------------------------------------------------ cursor
  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2l0 19 5-4.5 3.4 7.3 3.3-1.5-3.3-7.2 6.8-.4z" fill="#fff" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);

  const spots = {};
  const center = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + 11];
  for (const [k, n] of Object.entries(btn)) spots[k] = center(n);
  const knobAt = (q) => [QS.x + ((q - Q_RANGE[0]) / (Q_RANGE[1] - Q_RANGE[0])) * QS.w, QS.y + 1];

  // ------------------------------------------------------------ update
  let lastKey = '';
  const update = (res, s) => {
    // per-frame: callouts, cursor, buttons, overlays
    const key = `${res.q}|${s.focus}`;
    if (key !== lastKey) {
      lastKey = key;
      redraw(res, s);
    }
    for (const sb of SUBS) btn[sb.key].classList.toggle('foc', s.focus === sb.key);
    btn.all.classList.toggle('foc', !s.focus);
    for (const k of DISPLAY) btn[k].classList.toggle('on', !!s.display[k]);
    ovCheck.style.display = s.display.check ? 'block' : 'none';
    ovNotes.style.display = s.display.notes && !s.display.check ? 'block' : 'none';
    // knob
    const [kx] = knobAt(res.q);
    qKnob.style.left = `${kx}px`;
    qFill.style.width = `${kx - QS.x}px`;
    // callouts
    let lh = '';
    let ch = '';
    const overlay = s.display.check || s.display.notes;
    if (s.labels > 0.01 && !overlay)
      for (const c of s.callouts) {
        const p = s.project(c.p);
        if (!p) continue;
        const [ax, ay] = p;
        const lx = ax + c.dx;
        const ly = ay + c.dy;
        if (lx < 330 || lx > 1270 || ly < 90 || ly > 765) continue;
        const col = c.acc ? C.acc : C.ink;
        lh += `<line x1="${ax}" y1="${ay}" x2="${lx}" y2="${ly}" stroke="${col}" stroke-width="1" opacity="${s.labels}"/><circle cx="${ax}" cy="${ay}" r="2.6" fill="${col}" opacity="${s.labels}"/>`;
        ch += `<div class="call${c.acc ? ' acc' : ''}" style="left:${lx}px;top:${ly}px;opacity:${s.labels}"><b><i></i>${c.t}</b><span>${c.s}</span></div>`;
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
    qBig.innerHTML = `${Math.round(r.q)}<span style="font-size:15px;font-weight:600;color:${C.mute}"> ms</span>`;
    const dif = Math.round(r.dif);
    qDif.innerHTML = `<span style="color:${dif > 0 ? '#cf2a1d' : '#2b7bba'}">q − QT_nom = ${dif > 0 ? '+' : ''}${dif} ms</span><br><span style="color:${C.mute};font-weight:500">T ends ${Math.round(r.tw.end)} ms after R</span>`;
    const F = [
      ['findpeaks pass 1 / pass 2', `${r.det.pass1} / ${r.det.pass2}`],
      ['kept ≥ 0.7 mV (raw)', `${r.det.kept.length} at ${r.det.kept[0]?.mv.toFixed(3)} mV`],
      ['dropped (next < 500 ms)', `${r.det.dropped.length}`],
      ['RR kept (500–1600)', `${r.gov.kept.length} × ${r.gov.rr.toFixed(0)} ms`],
      ['HR = 60000 / RR', `${r.gov.hr.toFixed(1)} bpm`],
      ['QT_nom (nearest HR)', `${r.nom.qt} ms*`],
      ['upper / lower limit', `${r.nom.upper} / ${r.nom.lower}`],
      ['paint 1 → max', `${r.nom.maxPaint} ms (HR < 85)`],
      ['painted samples', `${r.paint.filter((v) => v < 800).length.toLocaleString('en-US')} of 10,000`],
    ];
    F.forEach(([k, v], i) => {
      fe[i].k.textContent = k;
      fe[i].v.textContent = v;
    });
    fe[5].v.style.color = C.warn;
    // chart
    const W = 282;
    const bw = 26;
    const x0 = 14;
    const bx = (k) => x0 + k * 29.5;
    let h = `<text x="0" y="10" font-family="JetBrains Mono" font-size="8.5" letter-spacing="1" fill="${C.mute}">A · AREA PER COLOUR (mV·ms)</text>`;
    const aBase = 96;
    r.integ.A.forEach((a, k) => {
      const hh = Math.max(1, (a / SCALE.A) * 70);
      h += `<rect x="${bx(k)}" y="${aBase - hh}" width="${bw}" height="${hh}" fill="${BINS[k].col}"/>`;
      h += `<text x="${bx(k) + bw / 2}" y="${aBase + 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="7.6" fill="${C.ink}">${a >= 99.95 ? a.toFixed(0) : f1(a)}</text>`;
    });
    h += `<line x1="0" y1="${aBase}" x2="${W}" y2="${aBase}" stroke="${C.faint}"/>`;
    h += `<text x="0" y="128" font-family="JetBrains Mono" font-size="8.5" letter-spacing="1" fill="${C.mute}">D = A(k+1) − A(k)</text>`;
    const dBase = 158;
    r.inf.D.forEach((d, k) => {
      const hh = (d / SCALE.D) * 24;
      const x = bx(k) + bw / 2 + 14.75 - 5;
      h += `<rect x="${x}" y="${Math.min(dBase, dBase - hh)}" width="10" height="${Math.max(0.8, Math.abs(hh))}" fill="${C.ink}" opacity=".55"/>`;
    });
    h += `<line x1="0" y1="${dBase}" x2="${W}" y2="${dBase}" stroke="${C.faint}"/>`;
    h += `<text x="0" y="192" font-family="JetBrains Mono" font-size="8.5" letter-spacing="1" fill="${C.mute}">S = A(j) − 2A(j+1) + A(j+2)</text>`;
    const sBase = 222;
    r.inf.S.forEach((sv, j) => {
      const hh = (sv / SCALE.S) * 24;
      const x = bx(j + 1) + bw / 2 - 6;
      const m = j + 1 === r.inf.m;
      h += `<rect x="${x}" y="${Math.min(sBase, sBase - hh)}" width="12" height="${Math.max(0.8, Math.abs(hh))}" fill="${m ? C.acc : sv < 0 ? '#c9a27a' : '#9aa0a8'}"/>`;
      h += `<text x="${x + 6}" y="${sBase + (sv < 0 ? -Math.abs(hh) - 3 : Math.abs(hh) + 9) * (sv < 0 ? 1 : 1)}" text-anchor="middle" font-family="JetBrains Mono" font-size="7.4" fill="${m ? C.acc : C.ink}" font-weight="${m ? 700 : 400}">${f1(sv)}</text>`;
    });
    h += `<line x1="0" y1="${sBase}" x2="${W}" y2="${sBase}" stroke="${C.faint}"/>`;
    // IP marker between S_j and S_j+1
    if (r.inf.ip !== null) {
      const j = r.inf.ip - 0.5;
      const x = (bx(j) + bx(j + 1)) / 2 + bw / 2;
      h += `<path d="M${x - 6} 262 L${x + 6} 262 L${x} 252 Z" fill="${C.acc}"/><text x="${x + 9}" y="262" font-family="JetBrains Mono" font-size="9" font-weight="700" fill="${C.acc}">IP ${r.inf.ip}</text>`;
    } else h += `<text x="0" y="262" font-family="JetBrains Mono" font-size="9" font-weight="700" fill="${C.warn}">IP UNSET ⚠1</text>`;
    h += `<text x="${W - 2}" y="192" text-anchor="end" font-family="JetBrains Mono" font-size="8.5" font-weight="700" fill="${C.acc}">m = ${r.inf.m}</text>`;
    chart.innerHTML = h;
    // output
    const o = r.out;
    oRule.textContent = o.rule ? o.rule.id : '—';
    oPred.textContent = o.pred ? o.pred.toUpperCase() : 'NO RULE';
    oPred.style.color = o.pred === 'Abnormal' ? '#cf2a1d' : '#2b7bba';
    oCond.textContent = o.rule ? `first open gate: ${o.rule.cond}` : 'IP unset: every gate reads IP';
    const OUT = [
      ['grade (position, ⚠5)', o.grade ? `${o.grade} of 6` : '—'],
      ['estimated QT window', o.window ? `${o.window[0]}–${o.window[1]} ms` : '—'],
      ['inflection point IP', r.inf.ip ?? 'unset'],
      ['m (most negative S)', `S${r.inf.m}`],
      ['row written by script 2', r.inf.skipped ? 'NO · next ⚠2' : 'yes'],
      ['q inside the window?', o.window ? (r.within ? 'yes' : 'no') : '—'],
      ['C5.0 bench says', '— splits N/A ⚠6'],
      ['open gates', o.open.map((v, i) => (v ? RULES[i].id : null)).filter(Boolean).join(' ') || 'none'],
    ];
    OUT.forEach(([k, v], i) => {
      out[i].k.textContent = k;
      out[i].v.textContent = v;
      out[i].v.style.color = (i === 4 && r.inf.skipped) || i === 6 ? C.warn : i === 5 && o.window ? (r.within ? '#1b7f4b' : C.warn) : C.ink;
    });
    expl.innerHTML = o.text
      ? (r.inf.skipped ? `<b style="color:${C.warn}">⚠2 Script 2 skips this ECG's row, so script 3 would never print this.</b> What the rules would say: ` : '') + o.text
      : 'No rule fires.';
    // warning chips
    chips.innerHTML = WARN.filter((w) => w.on(r) && (w.id <= 2 || (s.focus && SUB[w.sub].key === s.focus)))
      .map((w) => `<span class="chip"><i>⚠${w.id}</i>${w.id === 1 && r.inf.overwritten ? `IP ${r.inf.firstIp} OVERWRITTEN → ${r.inf.ip}` : w.id === 1 ? 'IP UNSET · CARRIES LAST ECG' : w.title.toUpperCase()}</span>`)
      .join('');
    // focus card
    if (s.focus) {
      const sb = SUB[s.focus];
      const ws = [...WARN.filter((w) => w.sub === s.focus).map((w) => `⚠${w.id} ${w.title}`), ...EXTRA.filter((w) => w.sub === s.focus).map((w) => `• ${w.title}`)];
      card.style.display = 'block';
      card.innerHTML = `<div class="mo" style="font-size:10.5px;font-weight:700;letter-spacing:1.6px;color:${C.acc}">${sb.label}</div><div class="mo" style="font-size:8.8px;color:${C.mute};margin-top:3px;letter-spacing:.5px">${sb.code}</div><div style="font-size:11.5px;line-height:1.45;margin-top:7px">${sb.what(r)}</div>${ws.length ? `<div class="mo" style="font-size:8.8px;line-height:1.6;margin-top:7px;color:${C.warn}">${ws.join('<br>')}</div>` : ''}`;
    } else card.style.display = 'none';
  }

  return {root: ui, btn, spots, knobAt, QS, update, ovCheck, ovNotes};
}

// ------------------------------------------------------------------------------------------------ the hand check
// Every number below is computed here from model.js, and the areas are checked against an independent integral of
// the beat function (a 1 µs midpoint sum, aligned to the samples each trapezoid spans).
function handCheckHTML() {
  const r = run(440);
  const A = r.integ.A;
  const S = r.inf.S;
  const ind = [];
  for (let k = 0; k < 9; k++) {
    const lo = r.ruler.bins[k].lo;
    const hi = r.ruler.bins[k].hi;
    let sum = 0;
    const h = 0.002;
    for (let c = lo + 1; c < hi + 1; c += h) sum += Math.abs(beatAt(c + h / 2 - 28, 440)) * h;
    ind.push(10 * sum);
  }
  const r250 = run(250);
  const r330 = run(330);
  const R0 = r.det.R[0];
  const qa = (b, ok) => `<span class="${ok ? 'ok' : 'no'}">${b}</span>`;
  const ratio = S[3] / (S[3] + S[4]);
  const ratio250 = r250.inf.S[0] / (r250.inf.S[0] + r250.inf.S[1]);
  const per = r.det.R.length;
  return `<span class="x mo">✕ CLOSE</span>
  <h2>Hand check</h2>
  <p>Worked at q = 440 ms (on the placeholder nomogram line), then the two q values where the warnings show. Green means the hand number matches the machine.</p>
  <h3>1 · STRIP, PEAKS, RR, HR</h3>
  <table>
  <tr><td>samples</td><td>10 s × 1000 /s = 10,000</td><td>${qa(r.raw.length.toLocaleString('en-US'), r.raw.length === 10000)}</td></tr>
  <tr><td>R peak, raw</td><td>1.000 − 0.08·e<sup>−6.125</sup> − 0.20·e<sup>−3.92</sup> − 0.12 = 0.876 mV</td><td>${qa(r.det.kept[0].mv.toFixed(3), Math.abs(r.det.kept[0].mv - 0.876) < 0.001)} ≥ 0.7 ✓</td></tr>
  <tr><td>peaks kept</td><td>10 beats at 400, 1400 … 9400; gaps 1000 ≥ 500, none dropped</td><td>${qa(`${r.det.R.length} · dropped ${r.det.dropped.length}`, r.det.R.length === 10 && !r.det.dropped.length)}</td></tr>
  <tr><td>HR</td><td>9 RR of 1000 ms → 60000 / 1000 = 60 bpm</td><td>${qa(r.gov.hr.toFixed(1), r.gov.hr === 60)}</td></tr>
  <tr><td>HR window</td><td>60000/1600 = 37.5 · 60000/500 = 120 bpm</td><td>${qa('37.5–120', true)}</td></tr>
  </table>
  <h3>2 · NOMOGRAM, PAINT, RULER</h3>
  <table>
  <tr><td>limits</td><td>upper 440 + 2·40 = 520 · lower 440 − 6·40 = 200 · HR 60 &lt; 85 so paint to 520</td><td>${qa(`${r.nom.upper} / ${r.nom.lower} / ${r.nom.maxPaint}`, r.nom.upper === 520 && r.nom.lower === 200 && r.nom.maxPaint === 520)}</td></tr>
  <tr><td>paint start</td><td>R at ${R0} ≥ 100 → index ${R0 - 28}; sample ${R0 - 27} gets 1, sample ${R0} (the R peak) gets 28</td><td>${qa(`${r.paint[R0 - 28]} · ${r.paint[R0 - 1]}`, r.paint[R0 - 28] === 1 && r.paint[R0 - 1] === 28)}</td></tr>
  <tr><td>paint end</td><td>sample ${R0 - 28 + 520} gets 520, the next one is grey (800)</td><td>${qa(`${r.paint[R0 - 28 + 519]} · ${r.paint[R0 - 28 + 520]}`, r.paint[R0 - 28 + 519] === 520 && r.paint[R0 - 28 + 520] === 800)}</td></tr>
  <tr><td>ruler</td><td>edges ${r.ruler.cc[0] - 40}, ${r.ruler.cc.join(', ')} → 9 × 40 = 360 ms</td><td>${qa(`${r.ruler.bins[8].hi - r.ruler.bins[0].lo} ms`, r.ruler.bins[8].hi - r.ruler.bins[0].lo === 360)}</td></tr>
  <tr><td>samples per bin</td><td>purple (160,200) open both ends → 161…199 = <b>39</b>; the others (lo,hi] = 40</td><td>${qa(r.integ.count.map((n) => n / per).join(' '), r.integ.count[0] / per === 39)}</td></tr>
  </table>
  <p><b>Correction to the brief:</b> “every 40 ms bin holds exactly 40 trapezoids” holds for 8 of the 9 bins. Purple holds 39 per beat, and paint value 200 (QT_nom − 240) falls in no hopper at all.</p>
  <h3>3 · AREAS (q = 440), CHECKED AGAINST AN INDEPENDENT INTEGRAL</h3>
  <table><tr><td>bin</td>${BINS.map((b) => `<td>${b.name}</td>`).join('')}</tr>
  <tr><td>trapezoids</td>${A.map((a) => `<td>${f2(a)}</td>`).join('')}</tr>
  <tr><td>∫|beat| × 10</td>${ind.map((a) => `<td>${f2(a)}</td>`).join('')}</tr>
  <tr><td>match</td>${A.map((a, k) => `<td>${qa(Math.abs(a - ind[k]) < 0.02 ? '✓' : '✗', Math.abs(a - ind[k]) < 0.02)}</td>`).join('')}</tr></table>
  <h3>4 · D, S, m, IP, RULE (q = 440)</h3>
  <table>
  <tr><td>S4</td><td>A4 − 2·A5 + A6 = ${f2(A[3])} − 2·${f2(A[4])} + ${f2(A[5])}</td><td>${qa(f2(S[3]), true)}</td></tr>
  <tr><td>S5</td><td>A5 − 2·A6 + A7 = ${f2(A[4])} − 2·${f2(A[5])} + ${f2(A[6])}</td><td>${qa(f2(S[4]), true)} most negative → m = ${r.inf.m}</td></tr>
  <tr><td>S6</td><td>A6 − 2·A7 + A8 = ${f2(A[5])} − 2·${f2(A[6])} + ${f2(A[7])} &gt; 0</td><td>${qa(f2(S[5]), S[5] > 0)} → branch (m = 5, S6 &gt; 0) → IP 5.5</td></tr>
  <tr><td>R9</td><td>S4/(S4+S5) = ${f2(S[3])} / ${f2(S[3] + S[4])} = ${ratio.toFixed(3)} ≤ 0.5 → shut</td><td>${qa(r.out.open[8] ? 'open' : 'shut', !r.out.open[8])}</td></tr>
  <tr><td>R10</td><td>IP 5.5 ≥ 5.5 → Abnormal, grade 6, 440+40 … 440+80</td><td>${qa(`${r.out.rule.id} · ${r.out.window.join('–')}`, r.out.rule.id === 'R10')}</td></tr>
  </table>
  <p>q = 440 sits on the (placeholder) nomogram line, yet R10 puts the QT at 480–520 ms. That is what the code does with this invented beat. It says nothing about real ECGs.</p>
  <h3>5 · THE WARNINGS AT WORK</h3>
  <table>
  <tr><td>q = 250 ⚠1</td><td>m = ${r250.inf.m}; S2 = ${f2(r250.inf.S[1])} &gt; 0 sets 1.5, then S3 = ${f2(r250.inf.S[2])} &gt; 0 overwrites it with 2.5</td><td>${qa(`IP ${r250.inf.ip}`, r250.inf.ip === 2.5)}</td></tr>
  <tr><td></td><td>R2: S1/(S1+S2) = ${f2(r250.inf.S[0])} / ${f2(r250.inf.S[0] + r250.inf.S[1])} = ${ratio250.toFixed(2)} &gt; 0.5</td><td>${qa(r250.out.rule.id, r250.out.rule.id === 'R2')}</td></tr>
  <tr><td>q = 330 ⚠2</td><td>m = ${r330.inf.m}; S4 = ${f2(r330.inf.S[3])} &gt; 0 → 3.5, then S5 = ${f2(r330.inf.S[4])} &gt; 0 → 4.5 and <code>next</code></td><td>${qa(`IP ${r330.inf.ip}, row skipped`, r330.inf.skipped)}</td></tr>
  </table>
  <h3>6 · WHERE EACH NUMBER COMES FROM</h3>
  <table>
  <tr><td>from the code</td><td>0.12 lift, 0.6 and 0.7 mV, 500 / 1600 ms, 28 ms lead, 800 grey, 40 ms bins, ±80/−240 limits, HR 85, the 10 rules</td></tr>
  <tr><td>standard ECG paper</td><td>25 mm/s: 1 mm = 40 ms (one small square)</td></tr>
  <tr><td>1 sample = 1 ms</td><td>assumed, as the code assumes it: 10,000 samples for a 10-second recording, sample gaps read as ms (RR, HR = 60000/RR). Holds only for a 1 kHz recorder.</td></tr>
  <tr><td class="no">placeholder</td><td>QT_nom = 440 ms for every HR (QTnomogram.xlsx not attached)</td></tr>
  <tr><td class="no">from the brief</td><td>HR fixed at 60 bpm, q from QT_nom − 200 to + 100</td></tr>
  <tr><td class="no">invented</td><td>beat shape: P 0.12 mV, Q −0.08, R 1.0, S −0.2, T 0.3 mV lasting 0.42·q</td></tr>
  <tr><td class="no">not available</td><td>C5.0 thresholds (UnbalancedData.xlsx not attached)</td></tr>
  </table>`;
}
