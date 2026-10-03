/**
 * Open the page in real headless Chrome and check the headline numbers.
 *   node tools/verify.mjs [--shots <dir>]
 * Needs Chrome and puppeteer-core; set CHROME and PUPPETEER to point at them.
 */
import { mkdir } from 'node:fs/promises';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PUPPETEER = process.env.PUPPETEER
  || '/home/latticeprodmgr/.npm/_npx/8003d8991b0d346b/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const shots = arg('--shots');
const { default: puppeteer } = await import(PUPPETEER);
const { startServer } = await import('./serve.mjs');
const { server, port } = await startServer(0);
const failures = [];
const check = (ok, label, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
if (shots) await mkdir(shots, { recursive: true });

/** Parse "rgb(r, g, b)" into [r,g,b]. */
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 800 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /\[lattice\]/.test(m.text()) && !/no licence key/.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/?theme=${theme}&t=${Date.now()}`, { waitUntil: 'networkidle0' });
    await sleep(800);
    /** Segment -> the chart labels and the label colour/background contrast. */
    const read = async (field, seg) => {
      await page.select('#field', field); await sleep(300);
      await page.select('#seg', seg); await sleep(900);
      return page.evaluate(() => {
        const texts = (id) => [...document.querySelectorAll('#' + id + ' svg text')].map((t) => t.textContent.trim());
        const label = (id, re) => { const t = [...document.querySelectorAll('#' + id + ' svg text')].find((x) => re.test(x.textContent)); if (!t) return null;
          return { text: t.textContent.trim(), color: getComputedStyle(t).fill, bg: (() => { for (let e = t; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/, 0\)$/.test(c) && c !== 'transparent') return c; } return 'rgb(255, 255, 255)'; })() }; };
        return { summary: document.getElementById('summary').textContent, version: LatticeGrid.version(),
          roc: label('roc', /AUC/), pr: label('pr', /AP/), watermark: !!document.querySelector('[class*="watermark"]') };
      });
    };
    const all = await read('sex', '');
    const f = await read('sex', 'Female');
    await page.select('#field', 'age_band'); await sleep(300);
    const ages = await page.evaluate(() => [...document.querySelectorAll('#seg option')].map((o) => o.value));
    const old = await read('age_band', ages.find((v) => /55/.test(v)));
    const num = (r, k) => Number((r[k]?.text.match(/-?\d*\.\d+/) || [])[0]);
    check(all.version === '1.86.2', `${theme}: grid is 1.86.2`, all.version);
    check(num(all, 'roc') === 0.927 && num(f, 'roc') === 0.945 && num(old, 'roc') === 0.894, `${theme}: ROC AUC all/Female/55+ = 0.927/0.945/0.894`, [all, f, old].map((r) => r.roc?.text).join(' | '));
    check(num(all, 'pr') === 0.825 && num(f, 'pr') === 0.775, `${theme}: PR AP all/Female = 0.825/0.775 (sklearn average precision)`, [all, f].map((r) => r.pr?.text).join(' | '));
    for (const k of ['roc', 'pr']) {
      const c = contrast(rgb(all[k].color), rgb(all[k].bg));
      check(c >= 4.5, `${theme}: ${k} label contrast >= 4.5:1`, `${c.toFixed(2)} (${all[k].color} on ${all[k].bg})`);
    }
    if (shots) await page.screenshot({ path: `${shots}/model-errors-${theme}.png` });
    check(errors.length === 0, `${theme}: console clean`, errors.join(' | ').slice(0, 500));
    await page.close();
  }
} finally { await browser.close(); server.close(); }
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
