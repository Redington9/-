# Pseudo-colour QT machine

The four R scripts of the pseudo-colour ECG QT / TdP-risk pipeline as an interactive 3D machine:
pseudo-colouring → coloured area under the curve → second difference and inflection point → 10 expert rules,
with the C5.0 decision tree on a comparison bench. Open `ecg-qt-machine.html` (offline, one file).

One input drives everything: **q**, the QT interval of one synthetic beat (QT_nom − 200 … QT_nom + 100 ms, HR fixed
at 60 bpm, the beat repeated 10× across a 10 s strip). Every part, panel and label reads from `run(q)` in `model.js`.

| File | Job |
|---|---|
| `nomogram.js` | `QTnomogram.xlsx` Sheet1 (HR, QT_pred, 154 rows), copied verbatim. At the beat's HR 60 the nearest row is Excel row 16 (HR 59.53) → QT_nom = 484 ms. |
| `tools/make_dataset.py` | Builds `dataset.js` from `All_ECGs_with_pseudo-colouring_features.xlsx` (5,232 ECGs), keeping QT, HR, the nomogram value and label, drug, the nine areas and the file's IP, and dropping every identifier. `dataset.js` is git-ignored; generate it before building. |
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

## The real dataset

With **REAL ECG** the machine runs one ECG of the dataset from its measured colour areas onward. The raw ECG is not in
the file, so the strip, R peaks and paint are the synthetic beat redrawn at that ECG's QT and HR. **IP FROM** switches
between the IP recorded in the file and script 2's chain as written. **DATASET** opens the comparison. `node check.mjs`
prints it:

- the nomogram lookup gives the file's NomogramValue for 5,219 of 5,219 ECGs with a QT;
- script 2 as written reproduces the file's IP for only 551 of them; the first true branch (else-if) for 5,207; and as
  written it would skip 2,670 rows that are in the file. The file was not made by the attached script 2;
- the 10 rules against the file's Nomogram label (On/Above vs Below): 97.7 % agreement with the file's IP
  (177 TP, 108 FP, 4,924 TN, 10 FN), 43.5 % with IP as written.

The data is de-identified but patient-level, and this repository is public, so neither `dataset.js` nor the page built
with it (`ecg-qt-machine-data.html`) is committed. `ecg-qt-machine.html` here is the build without the dataset.
