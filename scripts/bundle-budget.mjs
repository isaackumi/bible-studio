// What each window loads at start, checked against a budget, after a desktop build
// (TAURI_ENV_PLATFORM=linux npm run build). CI fails when a change makes an output window or the
// desk heavier than its budget, or puts the browser version's Bibles back into the desktop app.
//
//   node scripts/bundle-budget.mjs          check (exit 1 over budget)
//   node scripts/bundle-budget.mjs --json   the numbers, for a report

import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROOT = ".svelte-kit/output/client/";
const KB = 1024;

// Gzipped JavaScript and raw CSS each window loads before it shows anything. Output windows run
// once per screen, through the whole service, so they get the tightest budgets. A language's lines
// load only when it is chosen (i18n/core.ts), so no window carries French or Spanish it does not show.
const BUDGETS = {
  OperatorShell: { js: 600 * KB, css: 520 * KB },
  AudienceOutput: { js: 140 * KB, css: 70 * KB },
  StageOutput: { js: 60 * KB, css: 45 * KB },
  SecondOutput: { js: 105 * KB, css: 70 * KB },
  ScreenOutput: { js: 140 * KB, css: 70 * KB },
  RemotePad: { js: 50 * KB, css: 40 * KB },
};
/**
 * All the desktop app's JavaScript together, loaded at start or not (it once carried 20 MB of Bibles
 * it never used). Files loaded only when needed count here too: the icon set (studio picker, ~410 KB)
 * and hls.js (HLS streams where the engine cannot play them, ~560 KB).
 */
const DESKTOP_TOTAL_JS = 5 * 1024 * KB;

const manifest = JSON.parse(readFileSync(`${ROOT}.vite/manifest.json`, "utf8"));

function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const next of manifest[key].imports ?? []) closure(next, seen);
  return seen;
}

const base = new Set();
for (const key of Object.keys(manifest).filter((key) => manifest[key].isEntry)) closure(key, base);

function weigh(keys) {
  let js = 0;
  let css = 0;
  for (const key of keys) {
    js += gzipSync(readFileSync(ROOT + manifest[key].file)).length;
    for (const sheet of manifest[key].css ?? []) css += statSync(ROOT + sheet).size;
  }
  return { js, css };
}

const rows = [];
for (const [name, budget] of Object.entries(BUDGETS)) {
  const key = Object.keys(manifest).find((entry) => entry.endsWith(`components/${name}.svelte`));
  if (!key) {
    rows.push({ name, missing: true });
    continue;
  }
  rows.push({ name, ...weigh(closure(key, new Set(base))), budget });
}
const totalJs = Object.values(manifest)
  .filter((entry) => entry.file.endsWith(".js"))
  .reduce((sum, entry) => sum + statSync(ROOT + entry.file).size, 0);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ windows: rows, totalJs }, null, 2));
  process.exit(0);
}

let over = false;
const show = (bytes) => `${Math.round(bytes / KB)} KB`;
for (const row of rows) {
  if (row.missing) {
    console.log(`✗ ${row.name}: not found in the build`);
    over = true;
    continue;
  }
  const bad = row.js > row.budget.js || row.css > row.budget.css;
  over ||= bad;
  console.log(`${bad ? "✗" : "✓"} ${row.name.padEnd(15)} JS ${show(row.js).padStart(7)} gz / ${show(row.budget.js)}   CSS ${show(row.css).padStart(7)} / ${show(row.budget.css)}`);
}
const heavy = totalJs > DESKTOP_TOTAL_JS;
over ||= heavy;
console.log(`${heavy ? "✗" : "✓"} All desktop JavaScript ${show(totalJs)} / ${show(DESKTOP_TOTAL_JS)}${heavy ? " (are the bundled Bibles back? see __BUNDLED_BIBLES__)" : ""}`);
process.exit(over ? 1 : 0);
