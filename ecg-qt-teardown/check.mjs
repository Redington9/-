// Prints the hand check and the q sweep from the same model the page draws.   node check.mjs
import {beatAt, QT_NOM, run} from './model.js';

const f = (v, d = 3) => v.toFixed(d);
const r = run(QT_NOM);
const R0 = r.det.R[0];
console.log(`--- q = ${QT_NOM} (QT_nom from QTnomogram.xlsx, Excel row ${r.nom.row.excelRow}: HR ${r.nom.row.hr.toFixed(3)} → QT_pred ${r.nom.row.qtPred}) ---`);
console.log('samples', r.raw.length, '| R raw', f(r.det.kept[0].mv), 'mV | R peaks', r.det.R.join(' '), '| dropped', r.det.dropped.length);
console.log('RR', r.gov.kept.length, 'x', r.gov.rr, 'ms | HR', r.gov.hr, '| HR window', 60000 / 1600, '-', 60000 / 500);
console.log('upper', r.nom.upper, 'lower', r.nom.lower, 'maxPaint', r.nom.maxPaint);
console.log('paint: sample', R0 - 27, '=', r.paint[R0 - 28], '| sample', R0, '=', r.paint[R0 - 1], '| sample', R0 - 28 + r.nom.maxPaint, '=', r.paint[R0 - 28 + r.nom.maxPaint - 1], '| next', r.paint[R0 - 28 + r.nom.maxPaint]);
console.log('edges', r.ruler.cc[0] - 40, ...r.ruler.cc, '| samples per bin per beat', r.integ.count.map((n) => n / r.det.R.length).join(' '));
const ind = r.ruler.bins.map((b) => {
  let s = 0;
  const h = 0.002;
  for (let c = b.lo + 1; c < b.hi + 1; c += h) s += Math.abs(beatAt(c + h / 2 - 28, QT_NOM)) * h;
  return 10 * s;
});
console.log('A (trapezoids)', r.integ.A.map((a) => f(a)).join(' '));
console.log('A (integral)  ', ind.map((a) => f(a)).join(' '));
console.log('S', r.inf.S.map((a) => f(a)).join(' '), '| m', r.inf.m, '| IP', r.inf.ip, '|', r.out.rule.id, r.out.pred, 'grade', r.out.grade, 'window', r.out.window.join('-'));
console.log('\n--- sweep ---\n   q   m   IP  fired     rule  pred      grade window    q-in  row');
for (let q = QT_NOM - 200; q <= QT_NOM + 100; q += 10) {
  const x = run(q);
  console.log(String(q).padStart(4), String(x.inf.m).padStart(3), String(x.inf.ip).padStart(4), x.inf.fired.map((b) => b.val).join('>').padEnd(9), (x.out.rule?.id ?? '-').padEnd(5), (x.out.pred ?? '-').padEnd(9), String(x.out.grade).padStart(5), (x.out.window?.join('-') ?? '-').padEnd(9), x.within ? 'yes ' : 'no  ', x.inf.skipped ? 'SKIPPED (next)' : 'written');
}
