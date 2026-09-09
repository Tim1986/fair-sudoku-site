#!/usr/bin/env node
/* Fetch today's NYT Sudoku (easy/medium/hard), write data/nyt-today.json for the
   Fairness Checker page, and print verdicts to the terminal.
   Run daily (cron/CI) in production; the checker page reads the JSON same-origin. */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { LEVELS, verdict } = require(join(root, "js/engine.js"));

const res = await fetch("https://www.nytimes.com/puzzles/sudoku/easy", {
  headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
});
if (!res.ok) { console.error(`NYT fetch failed: HTTP ${res.status}`); process.exit(1); }
const html = await res.text();
const m = html.match(/window\.gameData\s*=\s*(\{.*?\})<\/script>/s);
if (!m) { console.error("Could not find gameData in the NYT page — layout may have changed."); process.exit(1); }
const game = JSON.parse(m[1]);

const out = { date: new Date().toISOString().slice(0, 10), displayDate: game.displayDate, puzzles: {} };
for (const lv of ["easy", "medium", "hard"]) {
  const p = game[lv]?.puzzle_data?.puzzle ?? game[lv]?.puzzle;
  if (!Array.isArray(p) || p.length !== 81) { console.error(`No puzzle array for ${lv}`); continue; }
  out.puzzles[lv] = p;
}

mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "data/nyt-today.json"), JSON.stringify(out));

console.log(`NYT Sudoku — ${out.displayDate || out.date}\n`);
for (const [lv, p] of Object.entries(out.puzzles)) {
  const v = verdict(p);
  let line;
  if (!v.valid) line = `INVALID (${v.reason})`;
  else if (v.fairTier) line = `FAIR — solvable at "${LEVELS.find(l => l.id === v.fairTier).label}" (${v.givens} givens)`;
  else line = `UNFAIR — full toolkit places ${v.stuck.placed}, stalls with ${v.stuck.remaining} cells left`;
  console.log(`  ${lv.padEnd(6)} ${line}`);
}
console.log(`\nWrote data/nyt-today.json`);
