"use strict";
/* Fair Sudoku engine: human-technique solver + certified generator.
   The fairness guarantee lives here: generate() only returns puzzles that
   solveHuman() completes with techniques at or below the chosen tier. */

const R = i => Math.floor(i / 9), C = i => i % 9, B = i => 3 * Math.floor(R(i) / 3) + Math.floor(C(i) / 3);

const UNITS = []; const UNIT_NAME = [];
for (let r = 0; r < 9; r++) { UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c)); UNIT_NAME.push("row " + (r + 1)); }
for (let c = 0; c < 9; c++) { UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c)); UNIT_NAME.push("column " + (c + 1)); }
const BOXPOS = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3, u = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) u.push((br + r) * 9 + bc + c);
  UNITS.push(u); UNIT_NAME.push("the " + BOXPOS[b] + " box");
}
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  UNITS.forEach(u => { if (u.includes(i)) u.forEach(j => { if (j !== i) s.add(j); }); });
  return [...s];
});
const cellName = i => "R" + (R(i) + 1) + "C" + (C(i) + 1);

/* `name` is the traditional technique name (used in the proof's teaching layer);
   `plain` is the jargon-free one-liner shown wherever a casual player might meet it. */
const TECHS = [
  { id: "NS", name: "Naked single", tier: 1, plain: "Only one number can fit in a square." },
  { id: "HS", name: "Hidden single", tier: 1, plain: "A number has only one place it can go in a row, column, or box." },
  { id: "NP", name: "Naked pair", tier: 2, plain: "Two squares can only hold the same two numbers, so their neighbors can’t." },
  { id: "HP", name: "Hidden pair", tier: 2, plain: "Two numbers only fit in the same two squares, so those squares hold nothing else." },
  { id: "PP", name: "Pointing pair", tier: 3, plain: "A box’s only spots for a number line up, ruling it out along that line." },
  { id: "BL", name: "Box–line reduction", tier: 3, plain: "A line’s only spots for a number sit in one box, ruling out the rest of that box." },
  { id: "XW", name: "X-Wing", tier: 4, plain: "Four squares in a rectangle pin a number down to two lines." },
  { id: "XY", name: "XY-Wing", tier: 4, plain: "Three linked two-option squares squeeze a number out of everything they all see." },
  { id: "XYZ", name: "XYZ-Wing", tier: 4, plain: "A three-option square and two partners squeeze out a shared number." },
  { id: "SF", name: "Swordfish", tier: 4, plain: "The rectangle idea, stretched across three rows and columns." },
  { id: "SK", name: "Skyscraper", tier: 4, plain: "Two lines share one spot for a number, so one of the two far ends must take it." },
  { id: "WW", name: "W-Wing", tier: 4, plain: "Two matching two-option squares, linked so one of them is forced." },
];
/* `label` is the player-facing level name (plain); `plain` describes the level's
   logic in everyday words; `desc` keeps the technical composition for the
   optional details layer and the checker. */
const LEVELS = [
  { id: 1, label: "Beginner", desc: "naked & hidden singles", plain: "the simplest step-by-step logic" },
  { id: 2, label: "Casual", desc: "singles plus naked & hidden pairs", plain: "everyday step-by-step logic" },
  { id: 3, label: "Skilled", desc: "singles, pairs, and line intersections", plain: "sharper step-by-step logic" },
  { id: 4, label: "Expert", desc: "singles, pairs, intersections, and advanced patterns (X-Wing, XY-Wing, XYZ-Wing, Swordfish, Skyscraper, W-Wing)", plain: "the deepest logic that still never guesses" },
];

function initCands(board) {
  const cands = Array.from({ length: 81 }, () => null);
  for (let i = 0; i < 81; i++) {
    if (board[i]) continue;
    const s = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    PEERS[i].forEach(p => { if (board[p]) s.delete(board[p]); });
    cands[i] = s;
  }
  return cands;
}
function place(board, cands, i, d) {
  board[i] = d; cands[i] = null;
  PEERS[i].forEach(p => { if (cands[p]) cands[p].delete(d); });
}

/* Find the next applicable step at or below `tier`.
   Steps are either placements or candidate eliminations; every returned
   elimination makes progress, so the solve loop terminates. */
function findStep(board, cands, tier) {
  for (let i = 0; i < 81; i++) {
    if (cands[i] && cands[i].size === 1) {
      const d = [...cands[i]][0];
      const evidence = PEERS[i].filter(p => board[p]);
      return { kind: "place", tech: "NS", cell: i, digit: d, evidence, unit: PEERS[i].concat([i]),
        why: `${cellName(i)} has exactly one candidate left: ${d}. Every other digit 1–9 already appears somewhere in its row, column, or box.` };
    }
  }
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter(i => cands[i] && cands[i].has(d));
      if (spots.length === 1 && !UNITS[u].some(i => board[i] === d)) {
        const i = spots[0];
        const evidence = UNITS[u].filter(j => j !== i && !board[j]);
        return { kind: "place", tech: "HS", cell: i, digit: d, evidence, unit: UNITS[u],
          why: `In ${UNIT_NAME[u]}, the digit ${d} fits in only one cell: ${cellName(i)}. Every other empty cell in that house is blocked by a ${d} it can see.` };
      }
    }
  }
  if (tier < 2) return null;
  for (let u = 0; u < 27; u++) {
    const twos = UNITS[u].filter(i => cands[i] && cands[i].size === 2);
    for (let a = 0; a < twos.length; a++) for (let b = a + 1; b < twos.length; b++) {
      const A = cands[twos[a]], Bc = cands[twos[b]];
      if ([...A].every(d => Bc.has(d))) {
        const ds = [...A];
        const victims = UNITS[u].filter(i => i !== twos[a] && i !== twos[b] && cands[i] && ds.some(d => cands[i].has(d)));
        if (victims.length) {
          return { kind: "elim", tech: "NP", cells: victims, digits: ds, evidence: [twos[a], twos[b]], unit: UNITS[u],
            why: `In ${UNIT_NAME[u]}, ${cellName(twos[a])} and ${cellName(twos[b])} can each only be ${ds[0]} or ${ds[1]}. Between them they claim both digits, so ${ds[0]} and ${ds[1]} can be removed from the rest of the house.` };
        }
      }
    }
  }
  for (let u = 0; u < 27; u++) {
    const pos = {};
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter(i => cands[i] && cands[i].has(d));
      if (spots.length === 2) pos[d] = spots;
    }
    const ds = Object.keys(pos).map(Number);
    for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++) {
      const [d1, d2] = [ds[a], ds[b]];
      if (pos[d1][0] === pos[d2][0] && pos[d1][1] === pos[d2][1]) {
        const [i1, i2] = pos[d1];
        if (cands[i1].size > 2 || cands[i2].size > 2) {
          return { kind: "reduce", tech: "HP", cells: [i1, i2], digits: [d1, d2], evidence: [i1, i2], unit: UNITS[u],
            why: `In ${UNIT_NAME[u]}, the digits ${d1} and ${d2} can only go in ${cellName(i1)} and ${cellName(i2)}. Those two cells must hold that pair, so their other candidates can be erased.` };
        }
      }
    }
  }
  if (tier < 3) return null;
  for (let b = 0; b < 9; b++) {
    const u = UNITS[18 + b];
    for (let d = 1; d <= 9; d++) {
      const spots = u.filter(i => cands[i] && cands[i].has(d));
      if (spots.length < 2 || spots.length > 3) continue;
      const rows = new Set(spots.map(R)), cols = new Set(spots.map(C));
      let line = null, lname = "";
      if (rows.size === 1) { line = UNITS[[...rows][0]]; lname = "row " + ([...rows][0] + 1); }
      else if (cols.size === 1) { line = UNITS[9 + [...cols][0]]; lname = "column " + ([...cols][0] + 1); }
      if (line) {
        const victims = line.filter(i => !spots.includes(i) && cands[i] && cands[i].has(d));
        if (victims.length) {
          return { kind: "elim", tech: "PP", cells: victims, digits: [d], evidence: spots, unit: u,
            why: `In ${UNIT_NAME[18 + b]}, every possible home for ${d} sits in ${lname}. Wherever it lands, it uses up that line’s ${d} — so ${d} can be removed from the rest of ${lname}.` };
        }
      }
    }
  }
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter(i => cands[i] && cands[i].has(d));
      if (spots.length < 2 || spots.length > 3) continue;
      const boxes = new Set(spots.map(B));
      if (boxes.size === 1) {
        const b = [...boxes][0];
        const victims = UNITS[18 + b].filter(i => !spots.includes(i) && cands[i] && cands[i].has(d));
        if (victims.length) {
          return { kind: "elim", tech: "BL", cells: victims, digits: [d], evidence: spots, unit: UNITS[u],
            why: `In ${UNIT_NAME[u]}, every possible home for ${d} falls inside ${UNIT_NAME[18 + b]}. That box’s ${d} is spoken for, so ${d} can be removed from the box’s other cells.` };
        }
      }
    }
  }
  if (tier < 4) return null;
  // X-Wing: for a digit d, two lines whose only d-candidates share the same two
  // cross-lines lock d into those cross-lines — remove d elsewhere along them.
  for (const orient of ["row", "col"]) {
    const lineOf = orient === "row" ? R : C;
    const crossOf = orient === "row" ? C : R;
    const lineUnit = k => UNITS[orient === "row" ? k : 9 + k];
    const crossUnit = k => UNITS[orient === "row" ? 9 + k : k];
    for (let d = 1; d <= 9; d++) {
      const rowsByCross = [];
      for (let k = 0; k < 9; k++) {
        const spots = lineUnit(k).filter(i => cands[i] && cands[i].has(d));
        if (spots.length === 2) rowsByCross.push({ k, crosses: spots.map(crossOf).sort((a, b) => a - b) });
      }
      for (let a = 0; a < rowsByCross.length; a++) for (let b = a + 1; b < rowsByCross.length; b++) {
        const A = rowsByCross[a], Bx = rowsByCross[b];
        if (A.crosses[0] === Bx.crosses[0] && A.crosses[1] === Bx.crosses[1]) {
          const evidence = [];
          [A.k, Bx.k].forEach(lk => A.crosses.forEach(ck => {
            evidence.push(orient === "row" ? lk * 9 + ck : ck * 9 + lk);
          }));
          const victims = [];
          A.crosses.forEach(ck => crossUnit(ck).forEach(i => {
            if (!evidence.includes(i) && cands[i] && cands[i].has(d)) victims.push(i);
          }));
          if (victims.length) {
            return { kind: "elim", tech: "XW", cells: victims, digits: [d], evidence,
              unit: evidence.slice(),
              why: `${d} forms an X-Wing: in two ${orient === "row" ? "rows" : "columns"} it sits only in the same two ${orient === "row" ? "columns" : "rows"}. Those two ${orient === "row" ? "columns" : "rows"} must use their ${d} inside the rectangle, so ${d} can be removed from them elsewhere.` };
          }
        }
      }
    }
  }
  // XY-Wing: a pivot {X,Y} sees two bivalue cells {X,Z} and {Y,Z}; any cell
  // seeing both wings cannot be Z.
  const bivalue = [];
  for (let i = 0; i < 81; i++) if (cands[i] && cands[i].size === 2) bivalue.push(i);
  const sees = (i, j) => PEERS[i].includes(j);
  for (const pivot of bivalue) {
    const [X, Y] = [...cands[pivot]];
    const wings = bivalue.filter(w => w !== pivot && sees(pivot, w));
    for (let a = 0; a < wings.length; a++) for (let b = 0; b < wings.length; b++) {
      if (a === b) continue;
      const w1 = wings[a], w2 = wings[b];
      const c1 = [...cands[w1]], c2 = [...cands[w2]];
      if (!c1.includes(X) || c2.includes(X)) continue;      // w1 = {X,Z}
      if (!c2.includes(Y) || c1.includes(Y)) continue;      // w2 = {Y,Z}
      const Z1 = c1.find(z => z !== X), Z2 = c2.find(z => z !== Y);
      if (Z1 !== Z2 || Z1 === X || Z1 === Y) continue;
      const Z = Z1;
      const victims = [];
      for (let i = 0; i < 81; i++) {
        if (i === pivot || i === w1 || i === w2) continue;
        if (cands[i] && cands[i].has(Z) && sees(i, w1) && sees(i, w2)) victims.push(i);
      }
      if (victims.length) {
        return { kind: "elim", tech: "XY", cells: victims, digits: [Z], evidence: [pivot, w1, w2],
          unit: [pivot, w1, w2],
          why: `XY-Wing: pivot ${cellName(pivot)} {${X},${Y}} links wings ${cellName(w1)} {${X},${Z}} and ${cellName(w2)} {${Y},${Z}}. Whichever value the pivot takes, one wing becomes ${Z} — so any cell seeing both wings cannot be ${Z}.` };
      }
    }
  }
  // XYZ-Wing: a trivalue pivot {X,Y,Z} with two bivalue wings {X,Z} and {Y,Z}
  // it can see; a cell seeing the pivot AND both wings cannot be Z.
  const trivalue = [];
  for (let i = 0; i < 81; i++) if (cands[i] && cands[i].size === 3) trivalue.push(i);
  for (const pivot of trivalue) {
    const pc = [...cands[pivot]];
    const wingCells = bivalue.filter(w => sees(pivot, w) && [...cands[w]].every(x => pc.includes(x)));
    for (let a = 0; a < wingCells.length; a++) for (let b = a + 1; b < wingCells.length; b++) {
      const w1 = wingCells[a], w2 = wingCells[b];
      const c1 = [...cands[w1]], c2 = [...cands[w2]];
      if (new Set([...c1, ...c2]).size !== 3) continue;  // wings must span the pivot's three
      const common = c1.filter(x => c2.includes(x));
      if (common.length !== 1) continue;
      const Z = common[0];
      const victims = [];
      for (let i = 0; i < 81; i++) {
        if (i === pivot || i === w1 || i === w2) continue;
        if (cands[i] && cands[i].has(Z) && sees(i, pivot) && sees(i, w1) && sees(i, w2)) victims.push(i);
      }
      if (victims.length) {
        return { kind: "elim", tech: "XYZ", cells: victims, digits: [Z], evidence: [pivot, w1, w2],
          unit: [pivot, w1, w2],
          why: `XYZ-Wing: pivot ${cellName(pivot)} {${pc.join(",")}} with wings ${cellName(w1)} and ${cellName(w2)}, both able to be ${Z}. One of the three must be ${Z}, so a cell seeing all three cannot be ${Z}.` };
      }
    }
  }
  // Swordfish: the three-line generalization of X-Wing. Three lines whose
  // candidates for d are confined to the same three cross-lines lock d into the
  // rectangle grid, so d is removed from those cross-lines elsewhere.
  for (const orient of ["row", "col"]) {
    const lineUnit = k => UNITS[orient === "row" ? k : 9 + k];
    const crossUnit = k => UNITS[orient === "row" ? 9 + k : k];
    const crossOf = orient === "row" ? C : R;
    const lineOf = orient === "row" ? R : C;
    const mk = (lk, ck) => orient === "row" ? lk * 9 + ck : ck * 9 + lk;
    for (let d = 1; d <= 9; d++) {
      const lines = [];
      for (let k = 0; k < 9; k++) {
        const spots = lineUnit(k).filter(i => cands[i] && cands[i].has(d));
        if (spots.length >= 2 && spots.length <= 3) lines.push({ k, crosses: spots.map(crossOf) });
      }
      for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) for (let c = b + 1; c < lines.length; c++) {
        const union = new Set([...lines[a].crosses, ...lines[b].crosses, ...lines[c].crosses]);
        if (union.size !== 3) continue;
        const baseLines = [lines[a].k, lines[b].k, lines[c].k];
        const cols = [...union];
        const victims = [];
        cols.forEach(ck => crossUnit(ck).forEach(i => {
          if (!baseLines.includes(lineOf(i)) && cands[i] && cands[i].has(d)) victims.push(i);
        }));
        if (victims.length) {
          const evidence = [];
          baseLines.forEach(lk => cols.forEach(ck => { const i = mk(lk, ck); if (cands[i] && cands[i].has(d)) evidence.push(i); }));
          return { kind: "elim", tech: "SF", cells: victims, digits: [d], evidence, unit: evidence.slice(),
            why: `${d} forms a Swordfish: across three ${orient === "row" ? "rows" : "columns"} it is confined to the same three ${orient === "row" ? "columns" : "rows"}. Those ${orient === "row" ? "columns" : "rows"} must place their ${d} inside the pattern, so ${d} can be removed from them elsewhere.` };
        }
      }
    }
  }
  // Skyscraper: two lines each with exactly two candidates for d that share one
  // cross-line (the base). Since the two base cells share a house, at most one is
  // d; combined with each line's strong link, at least one of the two far "roof"
  // cells must be d — so any cell seeing both roofs cannot be d.
  for (const orient of ["row", "col"]) {
    const lineUnit = k => UNITS[orient === "row" ? k : 9 + k];
    const crossOf = orient === "row" ? C : R;
    for (let d = 1; d <= 9; d++) {
      const twos = [];
      for (let k = 0; k < 9; k++) {
        const spots = lineUnit(k).filter(i => cands[i] && cands[i].has(d));
        if (spots.length === 2) twos.push(spots);
      }
      for (let a = 0; a < twos.length; a++) for (let b = a + 1; b < twos.length; b++) {
        const A = twos[a], B = twos[b];
        const Acr = A.map(crossOf), Bcr = B.map(crossOf);
        const shared = Acr.filter(c => Bcr.includes(c));
        if (shared.length !== 1) continue; // exactly one shared cross-line = the base
        const base = shared[0];
        const roofA = A[Acr[0] === base ? 1 : 0], roofB = B[Bcr[0] === base ? 1 : 0];
        if (crossOf(roofA) === crossOf(roofB)) continue;
        const victims = [];
        for (let i = 0; i < 81; i++) {
          if (i === roofA || i === roofB) continue;
          if (cands[i] && cands[i].has(d) && PEERS[i].includes(roofA) && PEERS[i].includes(roofB)) victims.push(i);
        }
        if (victims.length) {
          return { kind: "elim", tech: "SK", cells: victims, digits: [d], evidence: [A[0], A[1], B[0], B[1]], unit: [A[0], A[1], B[0], B[1]],
            why: `${d} forms a Skyscraper: two ${orient === "row" ? "rows" : "columns"} hold ${d} in only two cells each and share one ${orient === "row" ? "column" : "row"}. One of the two far cells must be ${d}, so any cell seeing both can’t be ${d}.` };
        }
      }
    }
  }
  // W-Wing: two non-peer bivalue cells with the same pair {X,Y}, joined by a
  // conjugate pair on Y (one end sees one cell, the other end sees the other).
  // The strong link forces at least one of the pair to be X, so X is removed
  // from any cell seeing both.
  for (let a = 0; a < bivalue.length; a++) for (let b = a + 1; b < bivalue.length; b++) {
    const A = bivalue[a], B = bivalue[b];
    if (sees(A, B)) continue;
    const ca = [...cands[A]], cb = [...cands[B]];
    if (!(ca.length === 2 && cb.length === 2 && ca.every(x => cb.includes(x)))) continue;
    let done = false;
    for (const [X, Y] of [[ca[0], ca[1]], [ca[1], ca[0]]]) {
      if (done) break;
      for (let u = 0; u < 27; u++) {
        const spots = UNITS[u].filter(i => cands[i] && cands[i].has(Y));
        if (spots.length !== 2) continue;
        const [L1, L2] = spots;
        if (L1 === A || L1 === B || L2 === A || L2 === B) continue;
        const linkOK = (sees(L1, A) && sees(L2, B)) || (sees(L1, B) && sees(L2, A));
        if (!linkOK) continue;
        const victims = [];
        for (let i = 0; i < 81; i++) {
          if (i === A || i === B) continue;
          if (cands[i] && cands[i].has(X) && sees(i, A) && sees(i, B)) victims.push(i);
        }
        if (victims.length) {
          return { kind: "elim", tech: "WW", cells: victims, digits: [X], evidence: [A, B, L1, L2], unit: [A, B, L1, L2],
            why: `W-Wing: ${cellName(A)} and ${cellName(B)} are both {${X},${Y}}, and a ${Y} must sit in one of two linked cells — one seeing each. So at least one of them is ${X}, and any cell seeing both can’t be ${X}.` };
        }
      }
    }
  }
  return null;
}

function applyStep(board, cands, st) {
  if (st.kind === "place") place(board, cands, st.cell, st.digit);
  else if (st.kind === "elim") st.cells.forEach(i => st.digits.forEach(d => cands[i].delete(d)));
  else if (st.kind === "reduce") st.cells.forEach(i => { [...cands[i]].forEach(d => { if (!st.digits.includes(d)) cands[i].delete(d); }); });
}

function solveHuman(startBoard, tier) {
  const board = startBoard.slice(), cands = initCands(board), steps = [];
  while (true) {
    if (board.every(v => v)) return { solved: true, steps };
    const st = findStep(board, cands, tier);
    if (!st) return { solved: false, steps };
    steps.push(st); applyStep(board, cands, st);
  }
}

/* Fisher–Yates with an injectable RNG so daily puzzles are deterministic. */
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fullGrid(rand) {
  const board = new Array(81).fill(0);
  function fill(i) {
    if (i === 81) return true;
    const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    for (const d of ds) {
      if (PEERS[i].every(p => board[p] !== d)) { board[i] = d; if (fill(i + 1)) return true; board[i] = 0; }
    }
    return false;
  }
  fill(0); return board;
}

/* Certified generation: remove clues (symmetrically) only while the
   human solver, capped at `tier`, still finishes the puzzle. Retries a few
   times to find a puzzle that actually exercises the top allowed tier. */
function generate(tier, rand = Math.random) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const sol = fullGrid(rand); const puzzle = sol.slice();
    const idxs = shuffle(Array.from({ length: 41 }, (_, i) => i), rand);
    for (const i of idxs) {
      const j = 80 - i, a = puzzle[i], b = puzzle[j];
      if (!a) continue;
      puzzle[i] = 0; if (j !== i) puzzle[j] = 0;
      if (!solveHuman(puzzle, tier).solved) { puzzle[i] = a; if (j !== i) puzzle[j] = b; }
    }
    const trace = solveHuman(puzzle, tier);
    if (!trace.solved) continue;
    const usedTopTier = trace.steps.some(s => TECHS.find(t => t.id === s.tech).tier === tier);
    if (tier === 1 || usedTopTier || attempt >= 9)
      return { puzzle, solution: sol, trace: trace.steps };
  }
  const sol = fullGrid(rand); return { puzzle: sol.slice(), solution: sol, trace: [] };
}

/* ---------- Fairness Checker: verdicts on arbitrary puzzles ---------- */

/* Count solutions by backtracking, stopping at `cap`. Used for validity, never for play. */
function countSolutions(startBoard, cap = 2) {
  const board = startBoard.slice();
  let count = 0;
  function bestCell() {
    let best = -1, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      let n = 0; const seen = new Set();
      PEERS[i].forEach(p => { if (board[p]) seen.add(board[p]); });
      n = 9 - seen.size;
      if (n < bestN) { bestN = n; best = i; if (n <= 1) break; }
    }
    return best;
  }
  function go() {
    if (count >= cap) return;
    const i = bestCell();
    if (i === -1) { count++; return; }
    const blocked = new Set();
    PEERS[i].forEach(p => { if (board[p]) blocked.add(board[p]); });
    for (let d = 1; d <= 9; d++) {
      if (blocked.has(d)) continue;
      board[i] = d; go(); board[i] = 0;
      if (count >= cap) return;
    }
  }
  go();
  return count;
}

/* Full fairness verdict for an arbitrary puzzle:
   validity/uniqueness, the minimal tier whose techniques finish it,
   and — when no tier does — exactly where humane logic runs out. */
function verdict(puzzle) {
  const givens = puzzle.filter(v => v).length;
  const conflict = UNITS.some(u => {
    const seen = new Set();
    return u.some(i => { const v = puzzle[i]; if (!v) return false; if (seen.has(v)) return true; seen.add(v); return false; });
  });
  if (conflict) return { givens, valid: false, reason: "contradictory givens" };
  const solutions = countSolutions(puzzle, 2);
  if (solutions === 0) return { givens, valid: false, reason: "no solution exists" };
  if (solutions > 1) return { givens, valid: false, reason: "multiple solutions — not a proper puzzle" };
  const tiers = LEVELS.map(L => {
    const r = solveHuman(puzzle, L.id);
    const counts = {};
    r.steps.forEach(s => counts[s.tech] = (counts[s.tech] || 0) + 1);
    return { id: L.id, label: L.label, solved: r.solved, counts, steps: r.steps.length };
  });
  const fair = tiers.find(t => t.solved) || null;
  let stuck = null;
  if (!fair) {
    const r = solveHuman(puzzle, 3);
    const placed = r.steps.filter(s => s.kind === "place").length;
    stuck = { placed, remaining: 81 - givens - placed };
  }
  return { givens, valid: true, tiers, fairTier: fair ? fair.id : null, stuck };
}

/* Difficulty scoring. A solve trace's cost is the sum of per-technique weights
   (roughly how much human effort each move demands). The band buckets that
   score for a human-facing label. Thresholds calibrated from the puzzle bank's
   score distribution (see tools/build-bank.mjs). */
const TECH_WEIGHT = { NS: 1, HS: 3, NP: 8, HP: 10, PP: 12, BL: 12, XW: 25, XY: 30, XYZ: 34, SF: 40, SK: 26, WW: 30 };
function difficultyScore(steps) {
  return steps.reduce((s, st) => s + (TECH_WEIGHT[st.tech] || 0), 0);
}
// Tier-relative terciles (score cut-points), so "difficulty" means difficulty
// *within the chosen ceiling* — a hard Singles puzzle and a hard Expert puzzle
// each read as "Tough" for their level. Calibrated from the bank distribution.
const DIFFICULTY_CUTS = { 1: [67, 78], 2: [86, 99], 3: [107, 127], 4: [131, 165] };
function difficultyBand(score, tier) {
  const [t33, t67] = DIFFICULTY_CUTS[tier] || DIFFICULTY_CUTS[4];
  return score <= t33 ? "Gentle" : score <= t67 ? "Steady" : "Tough";
}

/* Brute-force solver returning the first complete solution (or null).
   Ground truth for tests and verdict cross-checks; never used during play. */
function fullSolve(startBoard) {
  const board = startBoard.slice();
  function go() {
    let best = -1, bestN = 10, bestBlocked = null;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const blocked = new Set();
      PEERS[i].forEach(p => { if (board[p]) blocked.add(board[p]); });
      const n = 9 - blocked.size;
      if (n < bestN) { bestN = n; best = i; bestBlocked = blocked; if (n <= 1) break; }
    }
    if (best === -1) return true;
    for (let d = 1; d <= 9; d++) {
      if (bestBlocked.has(d)) continue;
      board[best] = d; if (go()) return true; board[best] = 0;
    }
    return false;
  }
  return go() ? board : null;
}

/* Parse a pasted puzzle: keeps digits and blank markers (0 or .), ignores
   everything else. Returns an 81-length array or null. */
function parsePuzzle(text) {
  const chars = (text || "").replace(/[^0-9.]/g, "");
  if (chars.length !== 81) return null;
  return [...chars].map(c => c === "." ? 0 : +c);
}

/* Deterministic RNG (mulberry32) + daily seed helpers. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const EPOCH_UTC = Date.UTC(2026, 8, 9); // Daily #1 = 2026-09-09
function todayUTC() { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); }
function dailyNumber() { return Math.floor((todayUTC() - EPOCH_UTC) / 86400000) + 1; }
function dailyDateStr() { return new Date(todayUTC()).toISOString().slice(0, 10); }
function dailyGenerate(tier) {
  return generate(tier, mulberry32(dailyNumber() * 7919 + tier * 104729));
}

/* Node compatibility for tools/ and tests. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TECHS, LEVELS, PEERS, UNITS, cellName,
    initCands, findStep, applyStep, solveHuman,
    generate, dailyGenerate, dailyNumber, mulberry32,
    verdict, parsePuzzle, countSolutions, fullSolve,
    difficultyScore, difficultyBand,
  };
}
