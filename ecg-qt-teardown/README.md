# Pseudo-colour QT machine

The four R scripts of the pseudo-colour ECG QT / TdP-risk pipeline as an interactive 3D machine:
pseudo-colouring → coloured area under the curve → second difference and inflection point → 10 expert rules,
with the C5.0 decision tree on a comparison bench. Open `ecg-qt-machine.html` (offline, one file).

One input drives everything: **q**, the QT interval of one synthetic beat (QT_nom − 200 … QT_nom + 100 ms, HR fixed
at 60 bpm, the beat repeated 10× across a 10 s strip). Every part, panel and label reads from `run(q)` in `model.js`.

| File | Job |
|---|---|
| `nomogram.js` | `QTnomogram.xlsx` Sheet1 (HR, QT_pred, 154 rows), copied verbatim. At the beat's HR 60 the nearest row is Excel row 16 (HR 59.53) → QT_nom = 484 ms. |
| `model.js` | The pipeline as pure functions, implemented as the R code is written (not as its comments say). |
| `check.mjs` | `node check.mjs` prints the hand check and the q sweep from the same model. |
| `machine.js`, `stage.js` | The 3D parts and how `run(q)` poses them. |
| `console.js` | The 1600×900 console: live QT and verdict, the pseudo-coloured ECG with the 10 s strip, QT ruler, hopper bars, S1–S7 with m and IP, the 2D schematic, subsystem buttons (isolate / cut / alone), camera buttons, the explanation and the fired rule with its numbers. |
| `notes.js` | Callouts with live values, the six warnings (amber callouts) and the other code findings. |
| `tour.js`, `live.js` | The auto tour and the page you drive. |

Not from the attached files, and labelled on screen:
- **The beat's shape is invented** (P, QRS and T curves and amplitudes).
- **The C5.0 splits are not available.** They are learned from `UnbalancedData.xlsx`, which was not attached.

Rebuild with the teardown skill: `node "$SKILL_DIR/sims/build.mjs" ./ecg-qt-teardown`.
