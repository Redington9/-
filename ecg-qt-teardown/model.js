// The pseudo-colour QT machine as pure functions of one input: q, the QT interval (ms) of one synthetic beat.
// No three.js and no DOM in here. Every part, panel and label on the page reads from run(q).
//
// The blueprint is the four R scripts. Where a comment in them disagrees with the code, this file follows the code:
//   1 - Pseudo-colouring application.R                      strip, R peaks, RR, HR, nomogram, paint
//   2 - Calculating AUC second derivative and inflection.R   trapezoids, 9 colour areas, D, S, inflection point
//   3 - Expert rules.R                                       10 rules -> Normal / Abnormal, grade, QT window, text
//   Decision_tree.R                                          C5.0 on the same 6 features (splits not available)

// ------------------------------------------------------------------------------------------------ constants
import {NOMOGRAM_ROWS} from './nomogram.js';

export const N = 10000; // samples in the strip: 10 s at 1 ms per sample (script 1: length(colourVector) <- 10000)
export const LIFT = 0.12; // mv <- ECG$mv + 0.12  (script 1)
export const R_KEEP = 0.7; // DF_Rpeaks$R_mv >= 0.7  (the comment above it says 0.8)
export const FLAT_MIN = 0.6; // second findpeaks pass, minpeakheight = 0.6
export const RR_DROP = 500; // a peak is dropped when the next one is < 500 samples later
export const RR_MIN = 500;
export const RR_MAX = 1600;
export const PAINT_LEAD = 28; // index <- R_peaks_time[R] - 28  (when the peak is at >= 100)
export const GREY = 800; // unpainted samples
export const SQUARE = 40; // one colour bin = 40 ms = one small ECG square at 25 mm/s
export const PAPER_SPEED = 25; // mm/s, standard ECG paper: 1 mm = 1000 / 25 = 40 ms = SQUARE
export const UPPER_SQ = 2; // UpperColourLimit = QT_value + 40 * 2
export const LOWER_SQ = 6; // LowerColourlimit = QT_value - 40 * 6
export const HR_FAST = 85; // if (HR >= 85) maximumColourVector <- QT_value + 40
export const FAST_SQ = 1;
export const R_KEEP_COMMENT = 0.8; // what script 1's comment above the 0.7 line says
export const RULE_RATIO = 0.5; // S_a / (S_a + S_b) > 0.5 in rules 2, 4, 7, 9
export const SAMPLE_MS = 1; // 1 sample = 1 ms (10,000 samples for a 10 s strip)
export const STRIP_S = 10;
export const LOUPE_BEAT = 4; // the beat the loupe and the ECG chart magnify (1-based)

/** R's round(): halves go to the even neighbour (IEC 60559), unlike Math.round. */
export const roundR = (x) => {
  const f = Math.floor(x);
  const d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
};
// The nomogram, from QTnomogram.xlsx (nomogram.js). Script 1: index_HR <- which.min(abs(HR_nomogram - HR)), the
// first row nearest to HR; QT_value <- round(QT_nomogram[index_HR]).
export const NOMOGRAM = {
  placeholder: false,
  source: `QTnomogram.xlsx · Sheet1 · ${NOMOGRAM_ROWS.length} rows`,
  rows: NOMOGRAM_ROWS,
  row(hr) {
    let k = 0;
    for (let i = 1; i < NOMOGRAM_ROWS.length; i++) if (Math.abs(NOMOGRAM_ROWS[i][0] - hr) < Math.abs(NOMOGRAM_ROWS[k][0] - hr)) k = i;
    return {index: k + 1, excelRow: k + 2, hr: NOMOGRAM_ROWS[k][0], qtPred: NOMOGRAM_ROWS[k][1]};
  },
  lookup(hr) {
    return this.row(hr).qtPred;
  },
};

// The synthetic strip. INVENTED for illustration, not from any file: 10 identical beats, R peaks every 1000 ms
// (HR 60), P/Q/R/S Gaussian bumps and a T wave that ends exactly q ms after QRS onset (= R - 28 ms).
export const BEAT = {
  invented: true,
  firstR: 400, // sample index of the first R peak (1-based, as in R)
  rr: 1000,
  beats: 10,
  p: {at: -150, amp: 0.12, sd: 18},
  q: {at: -14, amp: -0.08, sd: 4},
  r: {at: 0, amp: 1.0, sd: 6},
  s: {at: 14, amp: -0.2, sd: 5},
  t: {amp: 0.3, durK: 0.42, skew: 1.4}, // T lasts 0.42 q, peaks 61 % of the way through (w^1.4 = 0.5)
};
// The brief: q swept from QT_nom - 200 to QT_nom + 100, at the fixed HR of the synthetic beat (RR = BEAT.rr)
export const QT_NOM = roundR(NOMOGRAM.lookup(60000 / BEAT.rr));
export const Q_RANGE = [QT_NOM - 200, QT_NOM + 100];

// The 9 hoppers in script 2's order (green before lime; script 1's comments put lime before green).
export const BINS = [
  {key: 'purple', name: 'PURPLE', col: '#6a51a3'},
  {key: 'blue', name: 'BLUE', col: '#2b7bba'},
  {key: 'green', name: 'GREEN', col: '#2ca25f'},
  {key: 'lime', name: 'LIME', col: '#9ccc4a'},
  {key: 'yellow', name: 'YELLOW', col: '#f2c418'},
  {key: 'orange', name: 'ORANGE', col: '#f5962f'},
  {key: 'darkorange', name: 'DARK ORANGE', col: '#e05a12'},
  {key: 'red', name: 'RED', col: '#cf2a1d'},
  {key: 'darkred', name: 'DARK RED', col: '#8c0a10'},
];
export const S_NAMES = ['Purple_Blue_Green', 'Blue_Green_Lime', 'Green_Lime_Yellow', 'Lime_Yellow_Orange', 'Yellow_Orange_DarkOrange', 'Orange_DarkOrange_Red', 'DarkOrange_Red_DarkRed'];

// ------------------------------------------------------------------------------------------------ stage 0: the strip
const gauss = (u, b) => b.amp * Math.exp(-0.5 * ((u - b.at) / b.sd) ** 2);
/** Lifted amplitude (baseline 0 mV) u ms after an R peak, for a beat whose T wave ends q ms after QRS onset. */
export function beatAt(u, q) {
  const B = BEAT;
  let y = gauss(u, B.p) + gauss(u, B.q) + gauss(u, B.r) + gauss(u, B.s);
  const te = q - PAINT_LEAD; // T end, ms after R
  const td = B.t.durK * q;
  const w = (u - (te - td)) / td;
  if (w > 0 && w < 1) y += B.t.amp * Math.sin(Math.PI * Math.pow(w, B.t.skew)) ** 2;
  return y;
}
export const tWave = (q) => {
  const te = q - PAINT_LEAD;
  const td = BEAT.t.durK * q;
  return {start: te - td, end: te, peak: te - td + td * Math.pow(0.5, 1 / BEAT.t.skew), dur: td};
};
/** The raw strip as the CSV would hold it (baseline at -0.12 mV), x[0] is sample 1. */
export function strip(q) {
  const x = new Float64Array(N);
  const B = BEAT;
  for (let s = 1; s <= N; s++) {
    // the nearest R peak decides (beats never overlap at RR 1000)
    const k = Math.round((s - B.firstR) / B.rr);
    const R = B.firstR + k * B.rr;
    x[s - 1] = beatAt(s - R, q) - LIFT;
  }
  return x;
}

// ------------------------------------------------------------------------------------------------ stage 1: R peaks
/** pracma::findpeaks, the parts script 1 uses. Returns rows [height, index, start, end] with 1-based indices. */
export function findpeaks(x, {peakpat = null, minpeakheight = -Infinity, nups = 1, ndowns = 1} = {}) {
  let xc = '';
  for (let i = 0; i < x.length - 1; i++) {
    const d = x[i + 1] - x[i];
    xc += d > 0 ? '+' : d < 0 ? '-' : '0';
  }
  const pat = new RegExp(peakpat ?? `[+]{${nups},}[-]{${ndowns},}`, 'g');
  const out = [];
  let m;
  while ((m = pat.exec(xc))) {
    const x1 = m.index + 1; // gregexpr is 1-based
    const x2 = x1 + m[0].length;
    let xp = x1;
    for (let j = x1; j <= x2; j++) if (x[j - 1] > x[xp - 1]) xp = j; // which.max: first maximum
    const xv = x[xp - 1];
    if (xv >= minpeakheight && xv - Math.max(x[x1 - 1], x[x2 - 1]) >= 0) out.push([xv, xp, x1, x2]);
  }
  return out;
}

export function detectR(x) {
  const peaks1 = findpeaks(x, {nups: 1, ndowns: 1});
  const peaks2 = findpeaks(x, {minpeakheight: FLAT_MIN, peakpat: '[+]{1,}[0]{1,}[-]{1,}'});
  const all = [...peaks1, ...peaks2].map(([h, i]) => ({mv: h, at: i})).sort((a, b) => a.at - b.at);
  const kept = all.filter((p) => p.mv >= R_KEEP);
  // the drop loop, as written: R evaluates 1:length(R_peaks_time) once, then shrinks the vector inside the loop
  let R = kept.map((p) => p.at);
  const dropped = [];
  const n0 = R.length;
  for (let i = 1; i <= n0; i++) {
    const d = R[i] !== undefined && R[i - 1] !== undefined ? R[i] - R[i - 1] : NaN; // R[i+1] - R[i], 1-based
    if (!Number.isNaN(d) && d < RR_DROP) {
      const v = R[i - 1];
      dropped.push(v);
      R = R.filter((t) => t !== v);
    }
  }
  return {pass1: peaks1.length, pass2: peaks2.length, candidates: all, kept, dropped, R};
}

// ------------------------------------------------------------------------------------------------ stage 2: RR, HR
export function rrGovernor(R) {
  // for (i in 1:length(R_peaks_time)-1)  is  (1:n) - 1 = 0:(n-1); i = 0 assigns to index 0, a silent no-op
  const raw = [];
  for (let i = 1; i <= R.length - 1; i++) raw.push(R[i] - R[i - 1]);
  const kept = raw.filter((d) => d >= RR_MIN && d <= RR_MAX);
  const rr = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : NaN;
  return {raw, kept, rr, hr: 60000 / rr};
}

// ------------------------------------------------------------------------------------------------ stage 3: nomogram
export function nomogramCam(hr) {
  const row = NOMOGRAM.row(hr);
  const qt = roundR(row.qtPred);
  const upper = qt + UPPER_SQ * SQUARE; // UpperColourLimit
  const lower = qt - LOWER_SQ * SQUARE; // LowerColourlimit
  const maxPaint = hr >= HR_FAST ? qt + FAST_SQ * SQUARE : upper; // maximumColourVector
  return {qt, upper, lower, maxPaint, row};
}

// ------------------------------------------------------------------------------------------------ stage 4: paint
export function paintHead(R, nom) {
  const cv = new Float64Array(N + nom.maxPaint + 1).fill(NaN); // index 0 unused, 1-based like R
  const starts = [];
  for (const r of R) {
    const index = r >= 100 ? r - PAINT_LEAD : r;
    starts.push(index);
    for (let i = 1; i <= nom.maxPaint; i++) cv[index + i] = i;
  }
  const paint = new Float64Array(N);
  for (let s = 1; s <= N; s++) {
    let v = cv[s];
    if (Number.isNaN(v)) v = GREY;
    if (v > nom.upper && v < GREY) v = nom.upper;
    paint[s - 1] = v;
  }
  return {paint, starts};
}

// ------------------------------------------------------------------------------------------------ stage 5: ruler
/** Bin edges as script 2 builds them: colorcodesValues[1] = LowerColourlimit, the rest from UpperColourLimit. */
export function ruler(nom) {
  const cc = [nom.lower, ...[7, 6, 5, 4, 3, 2, 1, 0].map((k) => nom.upper - SQUARE * k)];
  // purple is (cc1 - 40, cc1) open at both ends; every other bin is (cc[k-1], cc[k]]
  const bins = BINS.map((b, k) =>
    k === 0 ? {...b, lo: cc[0] - SQUARE, hi: cc[0], openHi: true} : {...b, lo: cc[k - 1], hi: cc[k], openHi: false},
  );
  const binOf = (v) => {
    for (let k = 0; k < bins.length; k++) {
      const b = bins[k];
      if (v > b.lo && (b.openHi ? v < b.hi : v <= b.hi)) return k;
    }
    return -1;
  };
  return {cc, bins, binOf};
}

// ------------------------------------------------------------------------------------------------ stage 6: trapezoids
export function integrator(mv, paint, binOf) {
  const area = new Float64Array(N);
  const bin = new Int8Array(N).fill(-1);
  const A = new Array(9).fill(0);
  const count = new Array(9).fill(0);
  let naLast = false;
  for (let i = 0; i < N; i++) {
    if (paint[i] < GREY) {
      if (i + 1 >= N) {
        naLast = true; // mv[i+1] is NA past the end; na.omit drops that row
        area[i] = NaN;
        continue;
      }
      area[i] = (Math.abs(mv[i]) + Math.abs(mv[i + 1])) / 2; // x 1 ms
    }
    const k = binOf(paint[i]);
    bin[i] = k;
    if (k >= 0 && !Number.isNaN(area[i])) {
      A[k] += area[i];
      count[k]++;
    }
  }
  return {area, bin, A, count, naLast};
}

// ------------------------------------------------------------------------------------------------ stage 7: D, S, IP
export function inflection(A) {
  const D = A.slice(1).map((a, k) => a - A[k]); // First_derivative_1..8
  const S = D.slice(1).map((d, j) => d - D[j]); // Second_derivative_1..7 = A_j - 2 A_j+1 + A_j+2
  let m = 1;
  for (let j = 2; j <= 7; j++) if (S[j - 1] < S[m - 1]) m = j; // which.min: first minimum
  const s = (j) => S[j - 1];
  // script 2's chain of separate ifs, in order; a later true one overwrites an earlier one
  const CHAIN = [
    [1, () => s(2) > 0, 1.5],
    [1, () => s(3) > 0, 2.5],
    [1, () => s(4) > 0, 3.5],
    [1, () => s(5) > 0, 4.5],
    [2, () => s(3) > 0, 2.5],
    [2, () => s(4) > 0, 3.5],
    [2, () => s(5) > 0, 4.5, 'next'],
    [3, () => s(4) > 0, 3.5],
    [3, () => s(5) > 0, 4.5],
    [4, () => s(5) > 0, 4.5],
    [4, () => s(5) < 0 && s(6) > 0, 5.5],
    [4, () => s(5) < 0 && s(6) < 0 && s(7) > 0, 6.5],
    [4, () => s(5) < 0 && s(6) < 0 && s(7) < 0, 7.5],
    [5, () => s(6) > 0, 5.5],
    [5, () => s(6) < 0 && s(7) > 0, 6.5],
    [5, () => s(6) < 0 && s(7) < 0, 7.5],
    [6, () => s(7) > 0, 6.5, 'next'],
    [6, () => s(7) < 0, 7.5],
    [7, () => true, 7.5],
  ];
  let ip = null;
  const fired = [];
  let skipped = false;
  for (let b = 0; b < CHAIN.length; b++) {
    const [mm, cond, val, nx] = CHAIN[b];
    if (mm === m && cond()) {
      ip = val;
      fired.push({branch: b, val});
      if (nx) {
        skipped = true; // `next`: the rest of this ECG's iteration, including its CSV row, is skipped
        break;
      }
    }
  }
  // the first branch that fired is what an else-if chain (or a reader of the comments) would have taken
  const first = fired.length ? fired[0].val : null;
  return {D, S, m, ip, fired, overwritten: fired.length > 1 && first !== ip, firstIp: first, skipped, unset: ip === null};
}

// ------------------------------------------------------------------------------------------------ stage 8: rules
// Each rule as script 3 writes it: its clauses (joined with R's vectorised &), pred, confidence_rate, the QT window
// relative to the nomogram value, and the two halves of its paste() text.
// clause kinds: ['ip', '=' | '>=', v], ['lt0', j] S_j < 0, ['gt0', j] S_j > 0, ['ratio', a, b] S_a/(S_a+S_b) > RULE_RATIO,
// ['gtabs', a, b] S_a > |S_b|
const RULE_DATA = [
  ['R1', [['ip', '=', 1.5]], 'Normal', 1, -160, -120,
    'The QT-interval of this ECG is very likely normal, and the patient is not considered at risk for TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are cool (purple to blue to green), with a greater amount of blue than green, indicating a normal QT-interval. The T-wave probably ends within the green colour region, which indicates that the QT/HR falls below the nomogram line by approximately 120 ms or more, showing no risk of TdP.'],
  ['R2', [['ip', '=', 2.5], ['lt0', 1], ['ratio', 1, 2]], 'Normal', 1, -160, -120,
    'The QT-interval of this ECG is very likely normal, and the patient is not considered at risk for TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are cool (purple to blue to green), with a greater amount of blue than green, indicating a normal QT-interval. The T-wave probably ends within the green-lime colour region, which indicates that the QT/HR falls below the nomogram line by approximately 120 ms or more, showing no risk of TdP.'],
  ['R3', [['ip', '=', 2.5]], 'Normal', 2, -120, -80,
    'The QT-interval of this ECG is probably normal, and the patient is not considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are cool (purple to blue to green), with a greater amount of green than blue, indicating a normal QT-interval. The T-wave probably ends within the lime-yellow colour region, which indicates that the QT/HR falls below the nomogram line by approximately 80 ms or more, showing no risk of TdP.'],
  ['R4', [['ip', '=', 3.5], ['lt0', 2], ['ratio', 2, 3]], 'Normal', 2, -120, -80,
    'The QT-interval of this ECG is probably normal, and the patient is not considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are cool (purple to blue to green), with a greater amount of green than blue, indicating a normal QT-interval. The T-wave probably ends within the lime-yellow colour region, which indicates that the QT/HR falls below the nomogram line by approximately 80 ms or more, showing no risk of TdP.'],
  ['R5', [['ip', '=', 3.5]], 'Normal', 3, -80, -40,
    'The QT-interval of this ECG is possibly normal, and the patient is not considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are blue to green to yellow, with a greater amount of green than yellow, indicating a normal QT-interval. The T-wave is probably ended within the yellow region, which indicates that the QT/HR falls below the nomogram line by approximately 40 ms or more, showing no risk for TdP.'],
  ['R6', [['ip', '=', 4.5], ['lt0', 1], ['gt0', 2], ['gtabs', 2, 1]], 'Abnormal', 4, -40, 0,
    'The QT-interval of this ECG is possibly abnormal, and the patient is considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are warm colours (green to yellow to orange), with a greater amount of yellow than green, indicating an abnormal QT-interval. It looks like there is an ST-elevation as there is a purple-blue wave before the T-wave. The T-wave probably ends within the yellow-orange region, which indicates that the QT/HR falls on or very close to the nomogram line, showing risk of TdP.'],
  ['R7', [['ip', '=', 4.5], ['lt0', 3], ['ratio', 3, 4]], 'Normal', 3, -80, -40,
    'The QT-interval of this ECG is possibly normal, and the patient is not considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are green to yellow, with a greater amount of green than yellow, indicating a normal QT-interval. The T-wave is probably ended within the yellow region, which indicates that the QT/HR falls below the nomogram line by approximately 40 ms or more, showing no risk for TdP.'],
  ['R8', [['ip', '=', 4.5]], 'Abnormal', 4, -40, 0,
    'The QT-interval of this ECG is possibly abnormal, and the patient is considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are warm (green to yellow to orange), with a greater amount of yellow than green, indicating an abnormal QT-interval. The T-wave is probably ended within the yellow-orange region, which indicates that the QT/HR falls on or very close to the nomogram line, showing risk for TdP.'],
  ['R9', [['ip', '=', 5.5], ['lt0', 4], ['ratio', 4, 5]], 'Abnormal', 5, 0, 40,
    'The QT-interval of this ECG is probably abnormal, and the patient is considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are warm (yellow to orange), with a greater amount of yellow than orange, indicating an abnormal QT-interval. The T-wave probably ends within the yellow-orange region, which indicates that the QT/HR falls above the nomogram line, showing risk of TdP.'],
  ['R10', [['ip', '>=', 5.5]], 'Abnormal', 6, 40, 80,
    'The QT-interval of this ECG is very likely abnormal, and the patient is considered at risk of TdP.',
    'The maximum concave down in the pseudo-coloured area was considered to be the T-wave, and most of its colours are warm colours (orange to red), indicating an abnormal QT-interval. The T-wave probably ends within the orange-red region, which indicates that the QT/HR falls above the nomogram line, showing risk of TdP.'],
];
const fmtS = (v) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));
/** One clause at this IP and S (1-based S_j = S[j-1]): {sym, txt (numbers substituted), ok: true | false | null (NA)}. */
export function clause(c, ip, S) {
  const s = (j) => S[j - 1];
  const [kind, a, b] = c;
  if (kind === 'ip') {
    const op = a === '=' ? '=' : '≥';
    return {sym: `IP ${op} ${b}`, txt: `IP ${ip ?? 'NA'} ${op} ${b}`, ok: ip === null ? null : a === '=' ? ip === b : ip >= b};
  }
  if (kind === 'lt0') return {sym: `S${a} < 0`, txt: `S${a} ${fmtS(s(a))} < 0`, ok: s(a) < 0};
  if (kind === 'gt0') return {sym: `S${a} > 0`, txt: `S${a} ${fmtS(s(a))} > 0`, ok: s(a) > 0};
  if (kind === 'gtabs') return {sym: `S${a} > |S${b}|`, txt: `S${a} ${fmtS(s(a))} > |S${b}| ${fmtS(Math.abs(s(b)))}`, ok: s(a) > Math.abs(s(b))};
  const r = s(a) / (s(a) + s(b));
  return {sym: `S${a}/(S${a}+S${b}) > ${RULE_RATIO}`, txt: `S${a}/(S${a}+S${b}) = ${fmtS(s(a))}/${fmtS(s(a) + s(b))} = ${Number.isFinite(r) ? r.toFixed(3) : 'NaN'} > ${RULE_RATIO}`, ok: Number.isNaN(r) ? null : r > RULE_RATIO};
}
/** R's `&` over the clauses: FALSE if any is FALSE, else NA if any is NA (if() would stop), else TRUE. */
const andR = (oks) => (oks.includes(false) ? false : oks.includes(null) ? null : true);
const T_HEAD = 'This decision has been made based on the assumption that the QT-interval is considered normal when the area under the T-wave contains cool pseudo-colours (purple to blue to green), and prolonged with risk of TdP when it contains warm pseudo-colours (yellow to orange to red).';
const T_TAIL = 'Based on the pseudo-colouring scale, the estimated value of the QT-interval ranges from';
export const RULES = RULE_DATA.map(([id, need, pred, grade, lo, hi, lead, body]) => ({
  id, need, pred, grade, lo, hi, lead, body,
  cond: need.map((c) => clause(c, 0, [0, 0, 0, 0, 0, 0, 0]).sym).join(' & '),
  test: (ip, S) => andR(need.map((c) => clause(c, ip, S).ok)),
}));

export function ruleBank(ip, S, qtNom, hr) {
  // every gate is evaluated here so the console can show it; script 3 stops at the first TRUE (`next`)
  const res = RULES.map((r) => r.test(ip, S));
  const open = res.map((v) => v === true);
  const w = open.indexOf(true);
  const na = res.findIndex((v) => v === null);
  const stopsNA = na >= 0 && (w < 0 || na < w); // if (NA) stops R with an error before any rule fires
  const clauses = RULES.map((r) => r.need.map((c) => clause(c, ip, S)));
  if (w < 0 || stopsNA) return {open, res, clauses, winner: -1, stopsNA, pred: null, grade: null, window: null, text: null};
  const r = RULES[w];
  const window = [qtNom + r.lo, qtNom + r.hi];
  const text = `${r.lead} ${T_HEAD} ${r.body} ${T_TAIL} ${window[0]} to ${window[1]} ms, and the HR is ${Math.round(hr)}`;
  return {open, res, clauses, winner: w, stopsNA, rule: r, pred: r.pred, grade: r.grade, window, text};
}

// ------------------------------------------------------------------------------------------------ the C5.0 bench
export const C50 = {
  features: ['Purble_Blue_Green', 'Blue_Green_Lime', 'Green_Lime_Yellow', 'Lime_Yellow_Orange', 'Yellow_Orange_DarkOrange', 'InflectionPoint'],
  formula: 'Outcome ~ Purble_Blue_Green + Blue_Green_Lime + Green_Lime_Yellow + Lime_Yellow_Orange + Yellow_Orange_DarkOrange + InflectionPoint',
  folds: 5,
  splits: null, // learned from UnbalancedData.xlsx (not attached): not available, not invented
};

// ------------------------------------------------------------------------------------------------ the whole machine
const cache = new Map();
/** Everything, from q alone. Memoised on q rounded to 0.25 ms. */
export function run(qIn) {
  const q = Math.round(qIn * 4) / 4;
  if (cache.has(q)) return cache.get(q);
  const raw = strip(q);
  const det = detectR(raw);
  const gov = rrGovernor(det.R);
  const nom = nomogramCam(gov.hr);
  const mv = raw.map((v) => v + LIFT);
  const {paint, starts} = paintHead(det.R, nom);
  const rul = ruler(nom);
  const integ = integrator(mv, paint, rul.binOf);
  const inf = inflection(integ.A);
  const out = ruleBank(inf.ip, inf.S, nom.qt, gov.hr);
  const res = {
    q, raw, mv, det, gov, nom, paint, starts, ruler: rul, integ, inf, out,
    tw: tWave(q),
    dif: q - nom.qt,
    within: out.window ? q >= out.window[0] && q <= out.window[1] : null,
  };
  if (cache.size > 600) cache.delete(cache.keys().next().value);
  cache.set(q, res);
  return res;
}
