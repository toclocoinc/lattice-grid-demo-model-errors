#!/bin/sh
# Re-run the prediction script and prove the output is byte-identical to the committed file.
set -e
cd "$(dirname "$0")/.."
before=$(sha256sum data/adult-predictions.json | cut -d' ' -f1)
.venv/bin/python tools/predict.py
after=$(sha256sum data/adult-predictions.json | cut -d' ' -f1)
echo "before $before"; echo "after  $after"
[ "$before" = "$after" ] && echo "REPRODUCIBLE: identical" || { echo "DIFFERENT"; exit 1; }
