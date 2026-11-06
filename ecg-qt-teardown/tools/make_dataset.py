"""Builds dataset.js (git-ignored) from All_ECGs_with_pseudo-colouring_features.xlsx, keeping only what the machine
needs and dropping every identifier (ECG IDs, patient ID, sex, age).

    python3 tools/make_dataset.py path/to/All_ECGs_with_pseudo-colouring_features.xlsx > dataset.js
"""
import json
import sys

import openpyxl

AN = ['purple', 'blue', 'green', 'lime', 'yellow', 'orange', 'dark_orange', 'red', 'dark_red']
CATS = ['Normal', 'Borderline', 'between borderline and nomogram', 'On the nomogram', 'Above the nomogram']

ws = openpyxl.load_workbook(sys.argv[1], data_only=True).worksheets[0]
rows = list(ws.iter_rows(values_only=True))
hdr, data = rows[1], rows[2:]  # row 1 holds group titles, row 2 the column names
ix = {h: i for i, h in enumerate(hdr)}
drugs = sorted({r[ix['Drug']] for r in data})


def num(v, d):
    return None if v == 'NA' else round(float(v), d)


out = [[num(r[ix['QT']], 0), num(r[ix['HR']], 3), r[ix['NomogramValue']], 1 if r[ix['Nomogram']] == 'On/Above' else 0,
        CATS.index(r[ix['Output/Nomogram']]), drugs.index(r[ix['Drug']]), *[num(r[ix[a]], 4) for a in AN], r[ix['InflectionPoint']]]
       for r in data]
print(f'// All_ECGs_with_pseudo-colouring_features.xlsx, Sheet1, {len(out)} ECGs, DE-IDENTIFIED: no ECG/patient IDs, sex or age.')
print('// Per row: QT (ms, null where the file says NA), HR, NomogramValue, Nomogram (0 Below, 1 On/Above), Output/Nomogram')
print('// (index into CATS), Drug (index into DRUGS), the nine colour areas A1..A9 (mV.ms), InflectionPoint as recorded in the file.')
print(f'export const DRUGS = {json.dumps(drugs)};')
print(f'export const CATS = {json.dumps(CATS)};')
print(f"export const ROWS = {json.dumps(out, separators=(',', ':'))};")
