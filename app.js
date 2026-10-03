// Wiring only. Predictions come from data/adult-predictions.json, made by tools/predict.py.
// One filter on two grids (the row grid and a confusion pivot) is the "segment"; the three
// ROC-family charts are bound to the row grid and so redraw whenever its rows change.
const { createGrid, createChart } = LatticeGrid;
const el = (id) => document.getElementById(id);
const dark = document.documentElement.dataset.theme === 'dark';
el('version').textContent = LatticeGrid.getVersion ? LatticeGrid.getVersion() : '';
const FIELDS = ['sex', 'race', 'age_band', 'education', 'marital_status', 'occupation'];

const rows = await (await fetch('data/adult-predictions.json?v=20261003u')).json();

// Error = score - truth, in [-1, 1]: blue (missed a >50K), neutral, red (false alarm).
const errorScale = { min: -1, max: 1, mid: 0, colours: dark ? ['#3b7bd8', '#2a2f33', '#d8503b'] : ['#4f8fe0', '#f6f6f6', '#e0674f'] };
const cols = [
  { field: 'id', type: 'number', layout: { hidden: true } }, { field: 'label', type: 'number', layout: { hidden: true } },
  ...FIELDS.map((field) => ({ field, layout: { hidden: true } })), // the segment fields; the grouped one shows as the group column
  { field: 'age', type: 'number', layout: { width: 50 } },
  { field: 'actual', layout: { width: 70 } }, { field: 'predicted', layout: { width: 70 } }, { field: 'outcome', layout: { width: 66 } },
  { field: 'score', type: 'number', layout: { width: 70 }, format: { decimals: 3 } },
  { field: 'error', type: 'number', layout: { width: 90 }, format: { decimals: 3 } },
];

const grid = createGrid(el('grid'), {
  rowKey: 'id', rows, columns: cols, columnDefaults: { layout: { width: 90 } }, source: { mode: 'memory' }, selection: 'single',
  formatting: { error: [{ label: 'error colour scale', scale: errorScale }] },
});

// The confusion pivot: its own grid over the same rows; actual down, predicted across, counts.
const pivot = createGrid(el('pivot'), {
  rowKey: 'id', rows, columnDefaults: { layout: { width: 90 } }, source: { mode: 'memory' }, pivot: { enabled: true },
  columns: [
    { field: 'id', type: 'number', total: 'count', title: 'people', layout: { hidden: true } },
    { field: 'actual', group: { enabled: true, index: 0 }, title: 'actual' },
    { field: 'predicted', pivot: { enabled: true, index: 0 }, layout: { width: 90 } },
    ...FIELDS.map((field) => ({ field, layout: { hidden: true } })),
  ],
});

for (const curve of ['roc', 'pr', 'calibration']) {
  const container = el(curve === 'calibration' ? 'cal' : curve);
  createChart({ grid, container, type: 'roc', label: 'label', score: 'score', curve, scheme: dark ? 'dark' : undefined });
}

/** Group the row grid by the chosen field and fill the segment list. */
function chooseField() {
  const field = el('field').value;
  grid.columns.group(field);
  const values = [...new Set(rows.map((r) => r[field]))].sort();
  el('seg').replaceChildren(new Option('All rows', ''), ...values.map((v) => new Option(v, v)));
  chooseSegment();
}

/** Apply the segment as one filter on both grids and report its headline numbers. */
function chooseSegment() {
  const field = el('field').value;
  const value = el('seg').value;
  const filter = value ? { col: field, op: 'eq', value } : null;
  grid.filters.set(filter);
  pivot.filters.set(filter);
  const n = grid.rows.matchCount();
  el('summary').textContent = `${value || 'All rows'}: ${n.toLocaleString()} people`;
}

el('field').replaceChildren(...FIELDS.map((f) => new Option(f.replace('_', ' '), f)));
el('field').addEventListener('change', chooseField);
el('seg').addEventListener('change', chooseSegment);
chooseField();
window.__demo = { grid, pivot, rows };
