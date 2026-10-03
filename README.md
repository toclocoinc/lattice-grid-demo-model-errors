# Model error analysis on UCI Adult

A [Lattice Grid](https://latticegrid.dev) demo. A gradient-boosted model, trained
offline on the UCI Adult training split, scores the 16,281 held-out people.
The page shows where it is wrong and for whom.

## What it shows

- **Error colour scale.** Each row's `error` is `score - truth` (-1..1). Red cells are
  false alarms (predicted high, actually <=50K), blue cells are misses.
- **Actual x predicted pivot.** A second grid over the same rows: actual down, predicted
  across, counts in the cells (the confusion matrix).
- **Segment slicing.** Pick a field (sex, race, age band, education, marital status,
  occupation) and a segment. The main grid groups by the field and both grids filter to
  the segment.
- **ROC, precision-recall and calibration** are `chart-roc` charts bound to the row grid,
  so they redraw for whatever the grid shows. All rows: AUC 0.927. Female: 0.945.
  Age 55+: 0.894 (the same numbers `sklearn.metrics.roc_auc_score` gives).

Library: `@toclocoinc/lattice-grid@1.86.3` from jsDelivr. Keyless, no analytics.
`?theme=dark` for dark.

## Run locally

    python3 -m http.server
    # open http://localhost:8000/

## Data

[UCI Adult (Census Income)](https://archive.ics.uci.edu/dataset/2/adult), Becker and
Kohavi (1996), licence **CC BY 4.0**. The three raw files are in `data/raw/` (about 6 MB).

## What is precomputed, and how to reproduce it

`data/adult-predictions.json` (4.3 MB, 16,281 rows) is made by `tools/predict.py`:
`HistGradientBoostingClassifier` (120 iterations, learning rate 0.1, 15 leaves, seed 0,
single thread) fit on `adult.data`, scoring `adult.test`, threshold 0.5, scores rounded
to 4 places. The model never sees `sex`, `race` or `fnlwgt`; they are there to slice by.
Accuracy on the test split: 0.8732.

    python3 -m venv .venv                     # gitignored
    .venv/bin/pip install -r tools/requirements.txt
    .venv/bin/python tools/predict.py         # rewrites data/adult-predictions.json
    tools/check-repro.sh                      # re-runs it and compares sha256


## Check it

    node tools/verify.mjs [--shots dir]     # Node 22+, real headless Chrome; checks AUC, AP, label contrast, console

## Licence

Demo code: MIT, see `LICENSE`. Lattice Grid is loaded from the CDN under its own licence; the page carries the
public-demo licence for `toclocoinc.github.io`, so no watermark shows there.
