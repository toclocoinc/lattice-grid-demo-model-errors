#!/usr/bin/env python3
"""Precompute the predictions this demo serves (BACKLOG-1624).

Trains a gradient-boosted classifier on UCI Adult's training split and scores
the held-out test split, writing data/adult-predictions.json. Deterministic:
fixed seed, no shuffling, single thread, probabilities rounded to 4 places, so
running it twice produces byte-identical output (tools/check-repro.sh proves it).

    python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
    .venv/bin/python tools/predict.py

The model never sees `sex` or `race` (or fnlwgt): the point is to slice the
errors by them afterwards, not to feed them in.
"""
import csv, json, os, sys
os.environ.setdefault("OMP_NUM_THREADS", "1")  # single-threaded: reproducible
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import OrdinalEncoder

SEED = 0
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "data", "raw")
OUT = os.path.join(HERE, "..", "data", "adult-predictions.json")
COLS = ["age", "workclass", "fnlwgt", "education", "education_num", "marital_status", "occupation",
        "relationship", "race", "sex", "capital_gain", "capital_loss", "hours_per_week", "native_country", "income"]
CATS = ["workclass", "education", "marital_status", "occupation", "relationship", "native_country"]
NUMS = ["age", "education_num", "capital_gain", "capital_loss", "hours_per_week"]
THRESHOLD = 0.5


def load(name):
    """Read one raw Adult file into a list of dicts (strings stripped, '?' kept as 'Unknown')."""
    rows = []
    with open(os.path.join(RAW, name), newline="") as f:
        for rec in csv.reader(f, skipinitialspace=True):
            if len(rec) != 15:
                continue  # the '|1x3 Cross validator' banner and the trailing blank line
            r = dict(zip(COLS, [v.strip() for v in rec]))
            r["income"] = r["income"].rstrip(".")  # adult.test labels end in '.'
            for k in r:
                if r[k] == "?":
                    r[k] = "Unknown"
            rows.append(r)
    return rows


def band(age):
    """Age band used for slicing."""
    return "<25" if age < 25 else "25-34" if age < 35 else "35-44" if age < 45 else "45-54" if age < 55 else "55+"


def main():
    train, test = load("adult.data"), load("adult.test")
    enc = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1).fit([[r[c] for c in CATS] for r in train])

    def matrix(rows):
        cat = enc.transform([[r[c] for c in CATS] for r in rows])
        num = np.array([[float(r[c]) for c in NUMS] for r in rows])
        return np.hstack([num, cat])

    y_train = np.array([r["income"] == ">50K" for r in train], dtype=int)
    model = HistGradientBoostingClassifier(
        max_iter=120, learning_rate=0.1, max_leaf_nodes=15, early_stopping=False, random_state=SEED,
        categorical_features=list(range(len(NUMS), len(NUMS) + len(CATS))))
    model.fit(matrix(train), y_train)
    score = model.predict_proba(matrix(test))[:, 1]

    out = []
    for i, (r, s) in enumerate(zip(test, score)):
        s = round(float(s), 4)
        actual = int(r["income"] == ">50K")
        pred = int(s >= THRESHOLD)
        out.append({
            "id": i + 1, "age": int(r["age"]), "age_band": band(int(r["age"])), "sex": r["sex"], "race": r["race"],
            "education": r["education"], "marital_status": r["marital_status"], "occupation": r["occupation"],
            "hours_per_week": int(r["hours_per_week"]), "actual": ">50K" if actual else "<=50K",
            "predicted": ">50K" if pred else "<=50K", "outcome": {(0, 0): "TN", (1, 0): "FN", (0, 1): "FP", (1, 1): "TP"}[(actual, pred)],
            "label": actual, "score": s, "error": round(s - actual, 4),
        })
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    acc = sum(o["actual"] == o["predicted"] for o in out) / len(out)
    print(f"wrote {OUT}: {len(out)} rows, accuracy {acc:.4f} at threshold {THRESHOLD}", file=sys.stderr)


if __name__ == "__main__":
    main()
