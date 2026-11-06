// What each subsystem is, which R it stands for, its warnings, and the callouts it hangs on the machine.
// Every number here is read from res = run(q) or from model.js's named constants; none is typed into a label.
import {BINS, C50, FAST_SQ, FLAT_MIN, GREY, HR_FAST, LIFT, LOWER_SQ, N, NOMOGRAM, PAINT_LEAD, R_KEEP, R_KEEP_COMMENT, RR_DROP, RR_MAX, RR_MIN, RULE_RATIO, RULES, S_NAMES, SAMPLE_MS, SQUARE, STRIP_S, UPPER_SQ} from './model.js';
import {BENCH, CAM, DIAL, DG, DX, GATE, GOV, HOP, HX, IPX, LOUPE, LX, LY, RAIL, SG, STRIP, SX, SXp, SY} from './machine.js';

export const f1 = (v) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));
const nf = (v) => v.toLocaleString('en-US');
export const HR_LO = 60000 / RR_MAX;
export const HR_HI = 60000 / RR_MIN;
export const GRADES = Math.max(...RULES.map((x) => x.grade));
const PH = NOMOGRAM.placeholder ? ' · PLACEHOLDER' : '';
const LOW_EDGE = -(LOWER_SQ + 1) * SQUARE; // purple's open lower edge, relative to QT_nom
const HIGH_EDGE = UPPER_SQ * SQUARE;

// The six warnings asked for, then the further problems found in the code. on(res): does it apply at this q.
// sub: the subsystem it hangs on.
export const WARN = [
  {id: 1, sub: 'ipsel', title: 'IP: a later true branch overwrites', on: (r) => r.inf.overwritten || r.inf.unset || (r.real && r.inf.codeIp !== r.inf.fileIp),
    short: (r) => (r.real ? `AS WRITTEN: IP ${r.inf.codeIp ?? 'UNSET'} · FIRST MATCH: ${r.inf.firstIp ?? '—'} · FILE: ${r.inf.fileIp}` : r.inf.unset ? 'NO BRANCH FIRED · IP KEEPS THE LAST ECG’S VALUE' : r.inf.overwritten ? `FIRST BRANCH SAID ${r.inf.firstIp}, LAST SAYS ${r.inf.ip}` : 'SEPARATE IFs: THE LAST TRUE ONE WINS'),
    text: () => 'Script 2’s inflection selector is a run of separate ifs, not else-if. A later true branch overwrites an earlier one: for m = 1 the last positive among S2–S5 wins, not the first. If no branch fires, inflectionPoint keeps the previous ECG’s value (or the first ECG fails with “object not found”).'},
  {id: 2, sub: 'ipsel', title: '`next` skips the CSV row', on: (r) => r.inf.skipped,
    short: (r) => (r.real && r.inf.skipped ? 'SCRIPT 2 AS WRITTEN WOULD SKIP THIS ROW · THE FILE HAS IT' : r.inf.skipped ? 'THIS ECG’S ROW IS NOT WRITTEN' : '(m = 2, S5 > 0) AND (m = 6, S7 > 0) SKIP THE ROW'),
    text: () => 'The `next` in the (m = 2, S5 > 0) and (m = 6, S7 > 0) branches jumps to the next file, so that ECG’s row is never written to All_ECGs_with_coloured_AUC_and_second_derivative.csv and script 3 never sees it. The machine still shows what the rules would have done.'},
  {id: 3, sub: 'rpeak', title: `R threshold: comment ${R_KEEP_COMMENT}, code ${R_KEEP}`, on: () => true,
    short: () => `COMMENT SAYS ${R_KEEP_COMMENT} mV · CODE KEEPS ≥ ${R_KEEP}`,
    text: () => `Script 1: the comment says “any peak larger than ${R_KEEP_COMMENT} mv”; the next line keeps R_mv >= ${R_KEEP}. The machine uses ${R_KEEP} (raw mV, before the +${LIFT} lift).`},
  {id: 4, sub: 'ruler', title: 'Lime/green order differs', on: () => true,
    short: () => 'SCRIPT 1 COMMENTS: LIME, GREEN · SCRIPT 2 CODE: GREEN, LIME',
    text: () => 'Script 1’s comments list purple, blue, lime, green…; script 2’s comments also say cc3 = lime, cc4 = green, but its area loops and feature names use green (cc2, cc3] before lime (cc3, cc4]. The machine follows script 2’s code.'},
  {id: 5, sub: 'output', title: '“Confidence rate” is a position', on: () => true,
    short: () => 'GRADE = POSITION ON THE COLOUR SCALE, NOT A PROBABILITY',
    text: () => `Script 3’s confidence_rate is a grade from 1 to ${GRADES}: where on the colour scale the T wave is judged to end. It is not a probability or a confidence measure.`},
  {id: 6, sub: 'c50', title: 'C5.0 splits not available', on: () => true,
    short: () => 'SPLITS: LEARNED FROM DATA, NOT AVAILABLE',
    text: () => `Decision_tree.R learns its rules from UnbalancedData.xlsx, which is not attached. The bench shows the ${C50.features.length} inputs and the ${C50.folds}-fold CV procedure; its thresholds are marked “learned from data, not available” and nothing is invented.`},
];
export const EXTRA = [
  {sub: 'ruler', title: `Purple holds ${SQUARE - 1}, not ${SQUARE}`, text: () => `Purple is (QT_nom${LOW_EDGE}, QT_nom${LOW_EDGE + SQUARE}), open at both ends; every other bin is (lo, hi]. So purple counts ${SQUARE - 1} samples per beat, and paint value QT_nom${LOW_EDGE + SQUARE} falls in no hopper. “Every bin holds exactly ${SQUARE}” is true for ${BINS.length - 1} of the ${BINS.length}.`},
  {sub: 'nomo', title: 'Nomogram HR column out of order', text: () => `QTnomogram.xlsx has ${NOMOGRAM.rows.length} rows; its HR column steps back once (Excel row 33). which.min scans every row, so the lookup is unaffected; a lookup that assumed a sorted column would not be.`},
  {sub: 'gov', title: 'RR loop index 0:(n−1)', text: () => '`for (i in 1:length(R_peaks_time)-1)` is (1:n)−1 = 0:(n−1). The i = 0 pass assigns to index 0, a silent no-op, so the RR list comes out right by accident.'},
  {sub: 'feeder', title: 'Loops use undefined ID and f', text: () => 'Scripts 1 and 2 loop over 1:length(ID) and read myfiles[f]; neither ID nor f is defined, so as written they stop at the first read. The machine runs one pass on one strip.'},
  {sub: 'feeder', title: 'Two parse errors', text: () => 'Script 1 ends with an unmatched `}`. Script 3, rule 10, has a stray `.` after round(HR[i])). R will not parse either file as written.'},
  {sub: 'paint', title: 'The saved picture uses other colours', text: () => `Script 1’s ggplot fill is a continuous Spectral gradient limited to QT_nom${LOW_EDGE + SQUARE + 1} … QT_nom+${HIGH_EDGE - 1}; values outside, including the whole purple bin, render grey. Its dashed line sits at R + QT_nom, ${PAINT_LEAD} ms later than paint value QT_nom. The picture is not used downstream; the machine paints script 2’s nine bins.`},
  {sub: 'paint', title: 'CSV time column off by one', text: () => `\`time <- time[-1]\` makes time ${nf(N - 1)} long; cbind recycles it, so the written time column is shifted one sample and its last row wraps to the first value. Areas use mv and colour only, so they are unaffected.`},
  {sub: 'output', title: 'Header repeated on every row', text: () => 'Script 2 appends with col.names = !file.exists("myDF.csv"), a file that never exists, so the header is written again before every ECG.'},
  {sub: 'c50', title: 'ROC section cannot run', text: () => 'Decision_tree.R uses Test2 and Outcome2, which are never defined, and has a bare `Plot` line. The “train on 80 %” comment fits only if the Training sheet is that 80 %.'},
];

// the subsystem catalogue, in pipeline order (the C5.0 bench last, beside it)
export const SUBS = [
  {key: 'feeder', label: 'STRIP FEEDER', short: 'FEEDER', code: 'script 1 · read_csv, mv + 0.12', val: (r) => `${nf(r.raw.length)} × ${SAMPLE_MS} ms · +${LIFT} mV`},
  {key: 'rpeak', label: 'R-PEAK DETECTOR', short: 'R PEAKS', code: 'script 1 · findpeaks ×2', val: (r) => `${r.det.kept.length} of ${r.det.candidates.length} ≥ ${R_KEEP} mV`},
  {key: 'gov', label: 'RR GOVERNOR', short: 'RR → HR', code: 'script 1 · RR window, 60000/RR', val: (r) => `RR ${r.gov.rr.toFixed(0)} · HR ${r.gov.hr.toFixed(1)}`},
  {key: 'nomo', label: 'NOMOGRAM CAM', short: 'NOMOGRAM', code: 'script 1 · nearest HR row', val: (r) => `QT_nom ${r.nom.qt} · xlsx row ${r.nom.row.excelRow}`},
  {key: 'paint', label: 'PAINT HEAD', short: 'PAINT', code: 'script 1 · colourVector', val: (r) => `1 → ${r.nom.maxPaint} ms`},
  {key: 'ruler', label: 'COLOUR RULER', short: 'RULER', code: 'script 2 · colorcodesValues', val: (r) => `${BINS.length} × ${SQUARE} ms · ${r.ruler.bins[0].lo}–${r.ruler.bins[BINS.length - 1].hi}`},
  {key: 'integ', label: 'TRAPEZOID INTEGRATOR', short: 'TRAPEZOIDS', code: 'script 2 · (|mv_i|+|mv_i+1|)/2', val: (r) => `Σ ${f1(r.integ.A.reduce((a, b) => a + b, 0))} mV·ms`},
  {key: 'hoppers', label: 'AREA HOPPERS', short: 'HOPPERS A', code: 'script 2 · sum_of_<colour>_area', val: (r) => {
    const k = r.integ.A.indexOf(Math.max(...r.integ.A));
    return `max A${k + 1} ${f1(r.integ.A[k])}`;
  }},
  {key: 'dgears', label: 'FIRST-DIFF GEARS', short: 'D GEARS', code: 'script 2 · First_derivative', val: (r) => `D ${f1(Math.min(...r.inf.D))} … ${f1(Math.max(...r.inf.D))}`},
  {key: 'sgears', label: 'SECOND-DIFF GEARS', short: 'S GEARS', code: 'script 2 · Second_derivative', val: (r) => `m = ${r.inf.m} · S${r.inf.m} ${f1(r.inf.S[r.inf.m - 1])}`},
  {key: 'ipsel', label: 'INFLECTION SELECTOR', short: 'INFLECTION', code: 'script 2 · if-chain on m', val: (r) => (r.inf.unset ? 'IP unset' : `IP ${r.inf.ip}${r.inf.skipped ? ' · row skipped' : ''}`)},
  {key: 'gates', label: 'RULE GATE BANK', short: 'RULE GATES', code: 'script 3 · rules 1–10', val: (r) => (r.out.rule ? `${r.out.rule.id} opens` : 'none opens')},
  {key: 'output', label: 'OUTPUT DIAL', short: 'OUTPUT', code: 'script 3 · pred, grade, QTRange', val: (r) => (r.out.pred ? `${r.out.pred} · ${r.out.grade} · ${r.out.window.join('–')}` : '—')},
  {key: 'c50', label: 'C5.0 BENCH', short: 'C5.0', code: 'Decision_tree.R', val: () => 'splits N/A'},
];
export const SUB = Object.fromEntries(SUBS.map((s) => [s.key, s]));

/** The fired rule's clauses with the numbers in: "IP 5.5 ≥ 5.5 ✓". */
export const firedText = (r) => (r.out.winner < 0 ? 'no gate opens' : r.out.clauses[r.out.winner].map((c) => `${c.txt} ${c.ok ? '✓' : '✗'}`).join(' & '));

// callouts: {g (group, for the exploded offset), p: [x, y, z] anchor, dx, dy (label offset, px), t: title, s: sub, kind}
// kind: 'acc' the part working right now, 'warn' an amber code warning, '' plain
export function callouts(r, ctx) {
  const out = [];
  const add = (g, p, dx, dy, t, s, kind = '') => out.push({g, p, dx, dy, t, s, kind});
  const R = r.det.R;
  const {focus, cam} = ctx;
  const hero = !focus && cam === 'hero';
  const on = (k, ...cams) => focus === k || (!focus && cams.includes(cam));
  const warn = (id, g, p, dx, dy) => {
    const w = WARN[id - 1];
    if (id <= 2 && !w.on(r) && hero) return;
    add(g, p, dx, dy, `⚠${id} ${w.title.toUpperCase()}`, w.short(r), 'warn');
  };
  let kmax = 0;
  r.integ.A.forEach((a, k) => (a > r.integ.A[kmax] ? (kmax = k) : 0));

  if (on('feeder', 'front')) {
    add('feeder', [STRIP.x0 + 0.3, STRIP.y1, STRIP.z], -40, -40, 'STRIP FEEDER', `${nf(r.raw.length)} SAMPLES × ${SAMPLE_MS} MS = ${STRIP_S} S`);
    add('feeder', [STRIP.x1 - 0.2, STRIP.y0, STRIP.z], 30, 40, `LIFT +${LIFT} mV`, 'mv <- ECG$mv + LIFT · BASELINE TO 0');
  }
  if (on('rpeak', 'front')) {
    add('rpeak', [SXp(R[0]), 4.42, STRIP.z + 0.06], 20, -46, `${R.length} R PEAKS KEPT`, `PASS 1: ${r.det.pass1} · PASS 2 (FLAT ≥ ${FLAT_MIN}): ${r.det.pass2} · DROPPED (< ${RR_DROP} MS): ${r.det.dropped.length}`, 'acc');
  }
  if (on('rpeak', 'front')) warn(3, 'rpeak', [SXp(R[Math.min(2, R.length - 1)]) + 0.45, SY(R_KEEP + LIFT), STRIP.z + 0.02], hero ? -60 : 40, hero ? -46 : 50);
  if (on('gov', 'hero')) add('gov', [GOV.x, 1.75, GOV.z], hero ? -10 : 60, -50, 'RR GOVERNOR', `MEAN RR ${r.gov.rr.toFixed(0)} MS (${r.gov.kept.length} IN ${RR_MIN}–${RR_MAX}) · HR ${r.gov.hr.toFixed(1)}`, focus === 'gov' ? 'acc' : '');
  if (focus === 'gov') add('gov', [GOV.x + 0.4, 0.12, GOV.z], 60, 30, `HR = 60000 / ${r.gov.rr.toFixed(0)}`, `ALLOWED ${HR_LO}–${HR_HI} BPM`);
  if (on('nomo', 'hero')) add('nomo', [CAM.x, CAM.y + CAM.r + 0.62, CAM.z], hero ? 30 : 70, hero ? 30 : -30, `QT_nom ${r.nom.qt}${PH}`, NOMOGRAM.placeholder ? `${NOMOGRAM.source.toUpperCase()}` : `XLSX ROW ${r.nom.row.excelRow}: HR ${r.nom.row.hr.toFixed(2)} → QT_pred ${r.nom.row.qtPred}`, NOMOGRAM.placeholder ? 'warn' : 'acc');
  if (focus === 'nomo') add('nomo', [CAM.x - 0.3, CAM.y - 0.3, CAM.z + 0.03], -60, 50, `HR ${r.gov.hr.toFixed(1)} → NEAREST OF ${NOMOGRAM.rows.length} ROWS`, `UPPER ${r.nom.upper} · LOWER ${r.nom.lower}`);
  if (on('paint', 'hero', 'front')) {
    const lim = r.gov.hr >= HR_FAST ? `QT_nom + ${FAST_SQ * SQUARE} (HR ≥ ${HR_FAST})` : `QT_nom + ${UPPER_SQ * SQUARE}`;
    add('paint', [LX(r.nom.maxPaint), LOUPE.y1 + 0.2, LOUPE.z + 0.17], 30, -40, `PAINT ${r.nom.maxPaint} MS`, `= ${lim} · FROM R − ${PAINT_LEAD} MS`, focus === 'paint' ? 'acc' : '');
    if (!hero) add('paint', [LX(r.q), LY(0.6), LOUPE.z], -40, -50, `q = ${Math.round(r.q)} MS`, 'T WAVE ENDS HERE · SHAPE INVENTED', 'acc');
  }
  if (on('ruler', 'top', 'hero')) {
    if (!hero) add('ruler', [HX(BINS.length - 1), 0.2, LOUPE.z + 0.2], 40, -40, `${BINS.length} BINS × ${SQUARE} MS`, `${r.ruler.bins[0].lo} … ${r.ruler.bins[BINS.length - 1].hi} = QT_nom${LOW_EDGE} … +${HIGH_EDGE}`);
    if (!hero) add('ruler', [HX(0), 0.2, LOUPE.z + 0.2], -30, -46, `PURPLE (${r.ruler.bins[0].lo}, ${r.ruler.bins[0].hi}) OPEN`, `${r.integ.count[0] / R.length} SAMPLES PER BEAT, NOT ${SQUARE}`);
    if (!hero) warn(4, 'ruler', [HX(3), 0.25, LOUPE.z + 0.2], 0, 70);
  }
  if (focus === 'integ') {
    add('integ', [HX(4), 0.3, -1.18], 30, -60, 'TRAPEZOID INTEGRATOR', `(|mv_i| + |mv_i+1|) / 2 × ${SAMPLE_MS} MS · Σ ${f1(r.integ.A.reduce((a, b) => a + b, 0))}`, 'acc');
    add('integ', [HX(0), 0.2, -1.0], -40, 50, `GREY (${GREY}) ADDS 0`, `PAINT ≤ ${r.ruler.bins[0].lo} (QRS) REACHES NO HOPPER`);
  }
  if (on('hoppers', 'top')) r.integ.A.forEach((a, k) => add('hoppers', [HX(k), 0.12 + HOP.h, HOP.z], 0, cam === 'top' && !focus ? 34 + (k % 2) * 28 : -24 - (k % 2) * 28, `A${k + 1}`, `${f1(a)} mV·MS`, k === kmax ? 'acc' : ''));
  if (focus === 'dgears') r.inf.D.forEach((d, k) => add('dgears', [DX(k), DG.y + DG.r, DG.z], 0, -22 - (k % 2) * 26, `D${k + 1}`, f1(d)));
  if (on('sgears', 'side')) r.inf.S.forEach((s, j) => add('sgears', [SX(j), SG.y + SG.r, SG.z], 0, cam === 'side' && !focus ? 40 + (j % 2) * 26 : -24 - (j % 2) * 26, `S${j + 1}${j + 1 === r.inf.m ? ' = m' : ''}`, f1(s), j + 1 === r.inf.m ? 'acc' : ''));
  if (hero) add('sgears', [SX(r.inf.m - 1), SG.y + SG.r, SG.z], 40, -60, `m = ${r.inf.m} · S${r.inf.m} ${f1(r.inf.S[r.inf.m - 1])}`, `MAX CONCAVE DOWN = T WAVE · ${S_NAMES[r.inf.m - 1].toUpperCase()}`, 'acc');
  if (on('ipsel', 'hero', 'side')) {
    const x = r.inf.ip === null ? IPX(1.5) - 0.3 : IPX(r.inf.ip);
    add('ipsel', [x, RAIL.y + 0.2, RAIL.z], hero ? 20 : 30, hero ? 50 : 46, r.inf.ip === null ? 'IP UNSET' : `IP = ${r.inf.ip}`, `m = ${r.inf.m} · BRANCHES FIRED: ${r.inf.fired.map((b) => b.val).join(' → ') || 'NONE'}`, 'acc');
    if (!hero || WARN[0].on(r)) warn(1, 'ipsel', [r.inf.overwritten ? IPX(r.inf.firstIp) : x, RAIL.y + 0.15, RAIL.z], -50, hero ? 70 : -70);
    if (!hero || WARN[1].on(r)) warn(2, 'ipsel', [x + 0.1, RAIL.y + 0.1, RAIL.z], 60, hero ? 90 : 80);
  }
  if (on('gates', 'hero', 'inside')) {
    const w = r.out.winner;
    if (w >= 0) add('gates', [GATE.x0 + w * GATE.dx, 0.6, GATE.z], hero ? 10 : 20, hero ? -70 : -60, `${r.out.rule.id} OPENS FIRST`, firedText(r).toUpperCase(), 'acc');
    else add('gates', [GATE.x0, 0.4, GATE.z], 20, -60, 'NO GATE OPENS', r.out.stopsNA ? 'NA IN A CLAUSE: if() STOPS R' : 'IP UNSET');
    if (!hero && w > 0) add('gates', [GATE.x0 + ((w - 1) / 2) * GATE.dx, 0.2, GATE.z + 0.25], -20, 60, `R1–R${w} CHECKED, SHUT`, 'IN ORDER, BEFORE THE WINNER');
  }
  if (on('output', 'hero')) {
    if (r.out.pred) add('output', [DIAL.x + DIAL.r * 0.8, DIAL.y + 0.5, DIAL.z], 30, hero ? -20 : -30, `${r.out.pred.toUpperCase()} · GRADE ${r.out.grade}`, `QT WINDOW ${r.out.window[0]}–${r.out.window[1]} MS · q ${r.within ? 'INSIDE' : 'OUTSIDE'}`, focus === 'output' ? 'acc' : '');
    warn(5, 'output', [DIAL.x - DIAL.r, DIAL.y - 0.3, DIAL.z], hero ? -20 : -40, hero ? 70 : 50);
  }
  if (on('c50', 'hero')) {
    if (!hero) add('c50', [BENCH.x + 0.25, 1.05, BENCH.z], 30, -50, 'C5.0 · RULES = TRUE', `${C50.features.length} INPUTS: S1–S5 + IP · ${C50.folds}-FOLD CV`, 'acc');
    warn(6, 'c50', [BENCH.x + 0.6, 1.0, BENCH.z], hero ? -40 : 40, hero ? -60 : 40);
    if (!hero) add('c50', [BENCH.x - 0.6, 0.2, BENCH.z + 1.15], -40, 50, `${C50.folds}-FOLD CV`, `TEST 1 FOLD, TRAIN ON ${C50.folds - 1}, × ${C50.folds}`);
  }
  return out;
}

// numbers the hand check and the console show next to the constants they come from
export const K = {SQUARE, R_KEEP, RR_MIN, RR_MAX, RR_DROP, LIFT, PAINT_LEAD, GREY, HR_FAST, UPPER_SQ, LOWER_SQ, FAST_SQ, RULE_RATIO, LOW_EDGE, HIGH_EDGE};
