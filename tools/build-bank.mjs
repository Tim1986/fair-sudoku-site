#!/usr/bin/env node
/* Pre-generate a bank of certified puzzles per ceiling, tagged with a difficulty
   score/band, and write puzzles/bank.json. Practice mode serves from this bank
   for instant, curated play; live generation is only a fallback.

   Usage: node tools/build-bank.mjs [perTier]   (default 60)
   Deterministic: uses seeded RNG so the bank is reproducible in review/CI. */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const E = require(join(root, "js/engine.js"));

const perTier = Number(process.argv[2]) || 60;
const s = a => a.join("");
const bank = { generated: new Date().toISOString().slice(0, 10), perTier, tiers: {} };
const dist = {};

for (const L of E.LEVELS) {
  const tier = L.id;
  const seen = new Set();
  const puzzles = [];
  let seed = tier * 1_000_000;
  let guard = 0;
  while (puzzles.length < perTier && guard < perTier * 200) {
    guard++;
    const g = E.generate(tier, E.mulberry32(++seed));
    const key = s(g.puzzle);
    if (seen.has(key)) continue;
    const r = E.solveHuman(g.puzzle, tier);
    const v = E.verdict(g.puzzle);
    // Only bank puzzles whose MINIMAL fair tier is exactly this ceiling, so each
    // tier's bank is honest about the reasoning it actually requires.
    if (!r.solved || v.fairTier !== tier) continue;
    seen.add(key);
    const score = E.difficultyScore(r.steps);
    puzzles.push({ p: key, s: s(g.solution), sc: score, st: r.steps.length });
  }
  puzzles.sort((a, b) => a.sc - b.sc);
  puzzles.forEach(pz => { pz.band = E.difficultyBand(pz.sc, tier); });
  bank.tiers[tier] = puzzles;
  dist[L.label] = {
    count: puzzles.length,
    scoreMin: puzzles[0]?.sc, scoreMax: puzzles.at(-1)?.sc,
    median: puzzles[Math.floor(puzzles.length / 2)]?.sc,
    bands: puzzles.reduce((m, p) => (m[p.band] = (m[p.band] || 0) + 1, m), {}),
  };
}

mkdirSync(join(root, "puzzles"), { recursive: true });
writeFileSync(join(root, "puzzles/bank.json"), JSON.stringify(bank));

console.log(`Puzzle bank — ${perTier} per ceiling\n`);
for (const [label, d] of Object.entries(dist)) {
  console.log(`  ${label.padEnd(16)} n=${d.count}  score ${d.scoreMin}–${d.scoreMax} (median ${d.median})  ${JSON.stringify(d.bands)}`);
}
console.log(`\nWrote puzzles/bank.json`);
