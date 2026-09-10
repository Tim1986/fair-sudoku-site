#!/usr/bin/env node
/* Mine one real example of every technique for the in-app "tap to learn" demos.
   For each technique we save the exact mid-solve position (placed digits + the
   live candidate grid) and the step the engine found there, so the app can show
   the pattern on a real board with the same explanation the proof ladder gives.
   Deterministic (seeded); writes puzzles/demos.json. */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const E = require(join(root, "js/engine.js"));

const wanted = new Set(E.TECHS.map(t => t.id));
const demos = {};

outer:
for (let seed = 1; seed <= 400 && wanted.size; seed++) {
  const g = E.generate(4, E.mulberry32(seed));
  const board = g.puzzle.slice(), cands = E.initCands(board);
  for (let guard = 0; guard < 500; guard++) {
    const st = E.findStep(board, cands, 4);
    if (!st) continue outer;
    if (wanted.has(st.tech)) {
      wanted.delete(st.tech);
      demos[st.tech] = {
        board: board.join(""),
        cands: cands.map(s => s ? [...s] : null),
        step: {
          kind: st.kind, tech: st.tech, why: st.why,
          cells: st.cells || (st.cell != null ? [st.cell] : []),
          digits: st.digits || (st.digit != null ? [st.digit] : []),
          evidence: st.evidence || [],
          cell: st.cell ?? null, digit: st.digit ?? null,
        },
      };
    }
    E.applyStep(board, cands, st);
    if (board.every(v => v)) continue outer;
  }
}

if (wanted.size) {
  console.error("Missing demos for:", [...wanted].join(", "));
  process.exit(1);
}

mkdirSync(join(root, "puzzles"), { recursive: true });
writeFileSync(join(root, "puzzles/demos.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), demos }));
console.log(`Wrote puzzles/demos.json with ${Object.keys(demos).length} technique demos:`);
for (const t of E.TECHS) console.log(`  ${t.id.padEnd(4)} ${t.name}`);
