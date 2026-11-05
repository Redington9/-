// What each subsystem is, which lines of R it stands for, its warnings, and the callouts it hangs on the machine.
// Every number in a callout is read from res = run(q).
import {BINS, C50, S_NAMES} from './model.js';
import {BENCH, CAM, DIAL, DG, DX, GATE, GOV, HOP, HX, IPX, LOUPE, LX, LY, RAIL, SG, STRIP, SX, SXp, SY} from './machine.js';

const f1 = (v) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));

// The six warnings asked for, then the further problems found in the code. `on(res)` lights a warning at this q.
export const WARN = [
  {id: 1, sub: 'ipsel', title: 'IP: later true branch overwrites', on: (r) => r.inf.overwritten || r.inf.unset,
    text: 'Script 2’s inflection selector is a run of separate ifs, not else-if. A later true branch overwrites an earlier one: for m = 1 the last positive among S2–S5 wins, not the first. If no branch fires, inflectionPoint keeps the previous ECG’s value (or the first ECG fails with “object not found”).'},
  {id: 2, sub: 'ipsel', title: '`next` skips the CSV row', on: (r) => r.inf.skipped,
    text: 'The `next` in the (m = 2, S5 > 0) and (m = 6, S7 > 0) branches jumps to the next file, so that ECG’s row is never written to All_ECGs_with_coloured_AUC_and_second_derivative.csv and script 3 never sees it. The machine still shows what the rules would have done.'},
  {id: 3, sub: 'rpeak', title: 'R threshold: comment 0.8, code 0.7', on: () => true,
    text: 'Script 1, line 59: the comment says “any peak larger than 0.8 mv”; line 61 keeps R_mv >= 0.7. The machine uses 0.7 (raw mV, before the +0.12 lift).'},
  {id: 4, sub: 'ruler', title: 'Lime/green order differs', on: () => true,
    text: 'Script 1’s comments list purple, blue, lime, green…; script 2’s comments also say cc3 = lime, cc4 = green, but its area loops and feature names use green (cc2, cc3] before lime (cc3, cc4]. The machine follows script 2’s code.'},
  {id: 5, sub: 'output', title: '“Confidence rate” is a position', on: () => true,
    text: 'Script 3’s confidence_rate is a 1–6 grade: where on the colour scale the T wave is judged to end. It is not a probability or a confidence measure.'},
  {id: 6, sub: 'c50', title: 'C5.0 splits not available', on: () => true,
    text: 'Decision_tree.R learns its rules from UnbalancedData.xlsx, which is not attached. The bench shows the six inputs and the 5-fold CV procedure; its thresholds are marked “learned from data, not available” and nothing is invented.'},
];
export const EXTRA = [
  {sub: 'ruler', title: 'Purple bin holds 39, not 40', text: 'Purple is (QT_nom−280, QT_nom−240), open at both ends; every other bin is (lo, hi]. So purple counts 39 samples per beat (161…199 at QT_nom 440), and paint value QT_nom−240 = 200 falls in no hopper. The brief’s “every bin holds exactly 40” is true for 8 of the 9.'},
  {sub: 'gov', title: 'RR loop index 0:(n−1)', text: '`for (i in 1:length(R_peaks_time)-1)` is (1:n)−1 = 0:(n−1). The i = 0 pass assigns to index 0, a silent no-op, so the RR list comes out right by accident.'},
  {sub: 'feeder', title: 'Loops use undefined ID and f', text: 'Scripts 1 and 2 loop over 1:length(ID) and read myfiles[f]; neither ID nor f is defined, so as written they stop at the first read. The machine runs one pass on one strip.'},
  {sub: 'feeder', title: 'Two parse errors', text: 'Script 1 ends with an unmatched `}` (line 290). Script 3, rule 10 (line 301) has a stray `.` after round(HR[i])). R will not parse either file as written.'},
  {sub: 'paint', title: 'The saved picture uses other colours', text: 'Script 1’s ggplot fill is a continuous Spectral gradient with limits 201–519 (QT_nom−239 … +79); values outside, including the whole purple bin, render grey. The picture is not used downstream; the machine paints script 2’s nine bins.'},
  {sub: 'paint', title: 'CSV time column off by one', text: '`time <- time[-1]` makes time 9 999 long; cbind recycles it, so the written time column is shifted one sample and its last row wraps to the first value. Areas use mv and colour only, so they are unaffected.'},
  {sub: 'output', title: 'Header repeated on every row', text: 'Script 2 appends with col.names = !file.exists("myDF.csv"), a file that never exists, so the header is written again before every ECG.'},
  {sub: 'c50', title: 'ROC section cannot run', text: 'Decision_tree.R uses Test2 and Outcome2, which are never defined, and has a bare `Plot` line. The “train on 80 %” comment fits only if the Training sheet is that 80 %.'},
];

// subsystem catalogue: key, button label, the R it stands for, one line on what it does
export const SUBS = [
  {key: 'feeder', label: 'STRIP FEEDER', code: 'script 1 · read_csv, mv + 0.12', what: (r) => `10 s lead II, ${r.raw.length.toLocaleString('en-US')} samples at 1 ms. Raw baseline sits at −0.12 mV; the lift puts it at 0.`},
  {key: 'rpeak', label: 'R-PEAK DETECTOR', code: 'script 1 · findpeaks ×2, ≥ 0.7, < 500 drop', what: (r) => `Pass 1 finds ${r.det.pass1} local peaks, pass 2 ${r.det.pass2} flat tops ≥ 0.6. ${r.det.kept.length} are ≥ 0.7 mV; ${r.det.dropped.length} dropped for a neighbour < 500 ms on.`},
  {key: 'gov', label: 'RR GOVERNOR', code: 'script 1 · RR 500–1600, HR = 60000/RR', what: (r) => `${r.gov.kept.length} RR intervals kept, mean ${r.gov.rr.toFixed(0)} ms → HR ${r.gov.hr.toFixed(1)} bpm. Accepted window 37.5–120 bpm.`},
  {key: 'nomo', label: 'NOMOGRAM CAM', code: 'script 1 · which.min(|HR_nomogram − HR|)', what: (r) => `Nearest-HR row of QTnomogram.xlsx → QT_nom ${r.nom.qt} ms. The table is not attached: ${r.nom.qt} is a placeholder.`},
  {key: 'paint', label: 'PAINT HEAD', code: 'script 1 · colourVector[index + i] = i', what: (r) => `Starts at R − 28 ms and stamps 1, 2, 3 … ${r.nom.maxPaint} ms (QT_nom + ${r.nom.maxPaint - r.nom.qt}). Unpainted samples get 800 (grey).`},
  {key: 'ruler', label: 'COLOUR RULER', code: 'script 2 · colorcodesValues[1..9]', what: (r) => `9 bins of 40 ms by paint value, ${r.ruler.bins[0].lo} → ${r.ruler.bins[8].hi}. Purple is open at both ends.`},
  {key: 'integ', label: 'TRAPEZOID INTEGRATOR', code: 'script 2 · (|mv_i| + |mv_i+1|)/2 × 1', what: () => 'Each painted sample adds the trapezoid to its right, in mV·ms. Grey samples add 0. Paint values ≤ QT_nom−280 (the QRS) reach no hopper.'},
  {key: 'hoppers', label: 'AREA HOPPERS', code: 'script 2 · sum_of_<colour>_area', what: (r) => `A1…A9 = ${r.integ.A.map(f1).join(' · ')} mV·ms`},
  {key: 'dgears', label: 'D GEAR TRAIN', code: 'script 2 · First_derivative_k', what: (r) => `D_k = A_k+1 − A_k: ${r.inf.D.map(f1).join(' · ')}`},
  {key: 'sgears', label: 'S GEAR TRAIN', code: 'script 2 · Second_derivative_j', what: (r) => `S_j = A_j − 2A_j+1 + A_j+2: ${r.inf.S.map(f1).join(' · ')}. Most negative: S${r.inf.m}.`},
  {key: 'ipsel', label: 'INFLECTION SELECTOR', code: 'script 2 · if-chain on m', what: (r) => `m = ${r.inf.m} (maximum concave down = T wave). ${r.inf.unset ? 'No branch fires: IP is unset.' : `Branches fired: ${r.inf.fired.map((x) => x.val).join(' → ')}. IP = ${r.inf.ip}.`}`},
  {key: 'gates', label: 'RULE GATES', code: 'script 3 · rules 1–10, first wins', what: (r) => (r.out.winner < 0 ? 'No gate opens.' : `${r.out.open.filter(Boolean).length} gates true; ${r.out.rule.id} is the first: ${r.out.rule.cond}.`)},
  {key: 'output', label: 'OUTPUT DIAL', code: 'script 3 · pred, confidence_rate, QTRange', what: (r) => (r.out.pred ? `${r.out.pred}, grade ${r.out.grade} of 6, estimated QT ${r.out.window[0]}–${r.out.window[1]} ms.` : 'No output.')},
  {key: 'c50', label: 'C5.0 BENCH', code: 'Decision_tree.R · C5.0(rules = TRUE)', what: () => 'Same 6 features (S1–S5 + IP), 5-fold CV on the shuffled Training sheet, then a final model tested on the Testing sheet. Splits: learned from data, not available.'},
];
export const SUB = Object.fromEntries(SUBS.map((s) => [s.key, s]));

// callouts: {p: [x, y, z] anchor, g: group key (for the exploded offset), dx, dy (label offset, px), t: title, s: sub, acc}
export function callouts(r, focus) {
  const out = [];
  const add = (g, p, dx, dy, t, s, acc = false) => out.push({g, p, dx, dy, t, s, acc});
  const R = r.det.R;
  const all = !focus;
  if (all || focus === 'feeder') {
    add('feeder', [STRIP.x0 + 0.3, STRIP.y1, STRIP.z], -60, -46, 'STRIP FEEDER', `${r.raw.length.toLocaleString('en-US')} SAMPLES · 1 MS EACH · 10 S`);
    if (!all) add('feeder', [5.32, 4.2, STRIP.z], 40, -40, 'LIFT +0.12 mV', 'mv <- ECG$mv + 0.12');
  }
  if (focus === 'rpeak') {
    add('rpeak', [SXp(R[0]), 4.42, STRIP.z + 0.06], -40, -50, `${R.length} R PEAKS KEPT`, `PASS 1: ${r.det.pass1} PEAKS · PASS 2: ${r.det.pass2} FLAT TOPS`, true);
    add('rpeak', [SXp(R[1]) + 0.45, SY(0.82), STRIP.z + 0.02], 30, 60, 'KEEP ≥ 0.7 mV (RAW)', '⚠3 THE COMMENT SAYS 0.8');
    add('rpeak', [(SXp(R[2]) + SXp(R[3])) / 2, 4.42, STRIP.z + 0.06], 20, -44, 'DROP IF NEXT < 500 MS', `DROPPED: ${r.det.dropped.length}`);
  }
  if (focus === 'gov') {
    add('gov', [GOV.x, 1.75, GOV.z], 70, -50, 'RR GOVERNOR', `${r.gov.kept.length} RR IN 500–1600 · MEAN ${r.gov.rr.toFixed(0)} MS`, true);
    add('gov', [GOV.x + 0.4, 0.12, GOV.z], 80, 30, `HR = 60000 / ${r.gov.rr.toFixed(0)} = ${r.gov.hr.toFixed(1)}`, 'WINDOW 37.5–120 BPM');
  }
  if (focus === 'nomo') {
    add('nomo', [CAM.x, CAM.y + CAM.r + 0.62, CAM.z], 90, -30, `QT_nom ${r.nom.qt} · PLACEHOLDER`, 'QTnomogram.xlsx NOT ATTACHED', true);
    if (focus === 'nomo') add('nomo', [CAM.x - 0.3, CAM.y - 0.3, CAM.z + 0.03], -80, 50, `HR ${r.gov.hr.toFixed(1)} → NEAREST ROW`, `UPPER ${r.nom.upper} · LOWER ${r.nom.lower}`);
  }
  if (all || focus === 'paint') {
    add('paint', [LX(r.q), LY(0.62), LOUPE.z], 40, -40, `q = ${Math.round(r.q)} MS`, 'T WAVE ENDS HERE · SHAPE INVENTED', true);
    if (!all) {
      add('paint', [LX(0), LOUPE.y1 + 0.3, LOUPE.z + 0.12], -40, -40, 'PAINT HEAD AT R − 28 MS', `STAMPS 1, 2, 3 … ${r.nom.maxPaint}`);
      add('paint', [LX(r.nom.maxPaint), LOUPE.y1 + 0.2, LOUPE.z + 0.17], 40, -36, `STOPS AT ${r.nom.maxPaint}`, 'HR ≥ 85 WOULD STOP AT QT_nom + 40');
    }
  }
  if (focus === 'ruler') {
    add('ruler', [HX(0), 0.2, LOUPE.z + 0.2], -60, 50, 'PURPLE (160, 200) OPEN', `${r.integ.count[0]} SAMPLES = ${r.integ.count[0] / R.length} PER BEAT, NOT 40`, true);
    add('ruler', [HX(8), 0.2, LOUPE.z + 0.2], 50, 50, '9 BINS × 40 MS = 360 MS', `EDGES ${r.ruler.bins[0].lo} … ${r.ruler.bins[8].hi}`);
    add('ruler', [HX(3), 0.25, LOUPE.z + 0.2], 0, 80, '⚠4 GREEN BEFORE LIME', 'SCRIPT 2 CODE ORDER');
  }
  if (focus === 'integ') {
    add('integ', [HX(4), 0.3, -1.18], 40, -60, 'TRAPEZOID INTEGRATOR', '(|mv_i| + |mv_i+1|) / 2 × 1 MS', true);
    add('integ', [HX(0), 0.2, -1.0], -60, 50, 'GREY (800) ADDS 0', 'QRS (PAINT ≤ 160) REACHES NO HOPPER');
  }
  if (focus === 'hoppers' || all) {
    let kmax = 0;
    r.integ.A.forEach((a, k) => (a > r.integ.A[kmax] ? (kmax = k) : 0));
    if (all) add('hoppers', [HX(kmax), 0.1 + HOP.h, HOP.z], 30, -30, `A${kmax + 1} ${BINS[kmax].name}`, `${f1(r.integ.A[kmax])} mV·MS`);
    else r.integ.A.forEach((a, k) => add('hoppers', [HX(k), 0.12 + HOP.h, HOP.z], 0, -26 - (k % 2) * 30, `A${k + 1}`, `${f1(a)}`, k === kmax));
  }
  if (focus === 'dgears') r.inf.D.forEach((d, k) => add('dgears', [DX(k), DG.y + DG.r, DG.z], 0, -30 - (k % 2) * 30, `D${k + 1}`, f1(d)));
  if (focus === 'sgears' || all) {
    if (all) add('sgears', [SX(r.inf.m - 1), SG.y + SG.r, SG.z], 50, -40, `S${r.inf.m} MOST NEGATIVE`, S_NAMES[r.inf.m - 1].toUpperCase(), true);
    else r.inf.S.forEach((s, j) => add('sgears', [SX(j), SG.y + SG.r, SG.z], 0, -30 - (j % 2) * 30, `S${j + 1}`, f1(s), j + 1 === r.inf.m));
  }
  if (focus === 'ipsel' || all) {
    const x = r.inf.ip === null ? IPX(1.5) - 0.3 : IPX(r.inf.ip);
    add('ipsel', [x, RAIL.y + 0.2, RAIL.z], 30, 46, r.inf.ip === null ? 'IP UNSET ⚠1' : `IP = ${r.inf.ip}`, `m = ${r.inf.m} · ${r.inf.fired.length} BRANCH${r.inf.fired.length === 1 ? '' : 'ES'} FIRED${r.inf.skipped ? ' · NEXT ⚠2' : ''}`, true);
    if (r.inf.overwritten && !all) add('ipsel', [IPX(r.inf.firstIp), RAIL.y + 0.2, RAIL.z], -30, -70, `⚠1 FIRST BRANCH SAID ${r.inf.firstIp}`, `OVERWRITTEN BY ${r.inf.ip}`);
  }
  if (focus === 'gates' || all) {
    if (r.out.winner >= 0) add('gates', [GATE.x0 + r.out.winner * GATE.dx, 0.6, GATE.z], 20, -50, `${r.out.rule.id} OPENS FIRST`, r.out.rule.cond.toUpperCase(), true);
    if (!all) add('gates', [GATE.x0 + 9 * GATE.dx, 0.1, GATE.z + 0.25], 30, 50, 'CHECKED IN ORDER R1 → R10', 'READS ONLY IP AND S1–S5');
  }
  if (focus === 'output' || all) {
    if (r.out.pred) add('output', [DIAL.x + DIAL.r * 0.8, DIAL.y + 0.5, DIAL.z], 40, -30, `${r.out.pred.toUpperCase()} · GRADE ${r.out.grade}`, `QT ${r.out.window[0]}–${r.out.window[1]} MS`, true);
    if (!all) add('output', [DIAL.x - DIAL.r, DIAL.y - 0.3, DIAL.z], -60, 40, '⚠5 GRADE ≠ PROBABILITY', 'POSITION ON THE COLOUR SCALE');
  }
  if (focus === 'c50' || all) {
    add('c50', [BENCH.x + 0.25, 1.05, BENCH.z], 30, -50, 'C5.0 · RULES = TRUE', '⚠6 SPLITS: LEARNED FROM DATA, NOT AVAILABLE', true);
    if (!all) {
      add('c50', [BENCH.x - 1.2, 0.55, BENCH.z], -60, -30, `${C50.features.length} INPUTS`, 'S1–S5 + IP, SAME AS THE RULES');
      add('c50', [BENCH.x - 0.6, 0.2, BENCH.z + 1.15], -40, 50, '5-FOLD CV', 'TEST 1 FOLD, TRAIN ON 4, ×5');
    }
  }
  return out;
}
