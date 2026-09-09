"use strict";
/* Fair Sudoku UI: board, pad, pencil marks, daily/practice modes,
   ceiling selector, certificate, proof ladder, share card. */

let tier = 2;
let mode = "daily"; // "daily" | "free"
let puzzle = [], solution = [], givens = [], entries = [], certTrace = [];
let notes = [];      // Set of pencil-mark digits per cell
let notesMode = false;
let proofsAsked = 0; // proofs built this puzzle (for the share card)
let selected = -1;
let proof = null; // {stage, ladder:{elims, place}} | {stage, error:[cells]} | {stage, stuck:true}
let history = [], future = []; // snapshots of {entries, notes} for undo/redo

const grid = document.getElementById("grid"), pad = document.getElementById("pad");
const cells = [];
for (let i = 0; i < 81; i++) {
  const el = document.createElement("div");
  el.className = "cell"; el.setAttribute("role", "gridcell"); el.tabIndex = -1;
  if (C(i) === 2 || C(i) === 5) el.classList.add("br3");
  if (R(i) === 2 || R(i) === 5) el.classList.add("bb3");
  el.addEventListener("click", () => { select(i); });
  grid.appendChild(el); cells.push(el);
}
grid.tabIndex = 0;
grid.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    if (e.shiftKey) redo(); else undo();
    e.preventDefault(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) { redo(); e.preventDefault(); return; }
  if (e.key === "n" || e.key === "N") { toggleNotes(); e.preventDefault(); return; }
  if (selected < 0) { if (e.key.startsWith("Arrow")) { select(0); e.preventDefault(); } return; }
  let i = selected;
  if (e.key === "ArrowUp" && R(i) > 0) i -= 9; else if (e.key === "ArrowDown" && R(i) < 8) i += 9;
  else if (e.key === "ArrowLeft" && C(i) > 0) i -= 1; else if (e.key === "ArrowRight" && C(i) < 8) i += 1;
  else if (/^[1-9]$/.test(e.key)) { enter(+e.key); e.preventDefault(); return; }
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { enter(0); e.preventDefault(); return; }
  else return;
  select(i); e.preventDefault();
});

for (let d = 1; d <= 9; d++) {
  const b = document.createElement("button");
  b.innerHTML = `<span>${d}</span><span class="rem" id="rem${d}">9</span>`;
  b.addEventListener("click", () => enter(d));
  pad.appendChild(b);
}
const eb = document.createElement("button");
eb.innerHTML = `<span>⌫</span><span class="rem">erase</span>`;
eb.addEventListener("click", () => enter(0));
pad.appendChild(eb);

const seg = document.getElementById("levelSeg");
LEVELS.forEach(L => {
  const b = document.createElement("button"); b.textContent = L.label; b.dataset.id = L.id;
  b.addEventListener("click", () => { tier = L.id; newPuzzle(mode); });
  seg.appendChild(b);
});

function announce(msg) { const el = document.getElementById("srStatus"); if (el) el.textContent = msg; }

function board() { const b = puzzle.slice(); for (let i = 0; i < 81; i++) if (entries[i]) b[i] = entries[i]; return b; }
function select(i) { selected = i; render(); cells[i].focus({ preventScroll: true }); }

function toggleNotes() {
  notesMode = !notesMode;
  const b = document.getElementById("notesBtn");
  b.classList.toggle("on", notesMode);
  b.setAttribute("aria-pressed", String(notesMode));
}
document.getElementById("notesBtn").addEventListener("click", toggleNotes);

/* Auto-candidate mode: pencil marks are derived from the board and kept live
   as you place/erase, so no manual bookkeeping. Your manual notes are preserved
   (hidden while auto is on) and return when you switch it off. */
let autoCandidates = (() => { try { return localStorage.getItem("fs-autocand") === "1"; } catch (_) { return false; } })();
function setAutoCandidates(on) {
  autoCandidates = on;
  try { localStorage.setItem("fs-autocand", on ? "1" : "0"); } catch (_) {}
  const b = document.getElementById("autoCandBtn");
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  const nb = document.getElementById("notesBtn");
  nb.disabled = on; // manual notes are derived while auto is on
  if (on && notesMode) toggleNotes();
  render();
}
document.getElementById("autoCandBtn").addEventListener("click", () => setAutoCandidates(!autoCandidates));

/* ---------- undo / redo ---------- */
function snapshot() { return { entries: entries.slice(), notes: notes.map(s => new Set(s)) }; }
function restore(snap) { entries = snap.entries.slice(); notes = snap.notes.map(s => new Set(s)); }
function pushHistory() {
  history.push(snapshot());
  if (history.length > 200) history.shift();
  future = [];
  updateUndoButtons();
}
function updateUndoButtons() {
  document.getElementById("undoBtn").disabled = history.length === 0;
  document.getElementById("redoBtn").disabled = future.length === 0;
}
function undo() {
  if (!history.length) return;
  future.push(snapshot());
  restore(history.pop());
  proof = null; render(); checkDone(); saveDaily(); updateUndoButtons();
}
function redo() {
  if (!future.length) return;
  history.push(snapshot());
  restore(future.pop());
  proof = null; render(); checkDone(); saveDaily(); updateUndoButtons();
}
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);

function placeEntry(i, d) {
  entries[i] = d; notes[i] = new Set();
  PEERS[i].forEach(p => notes[p].delete(d));
}
function enter(d) {
  if (selected < 0 || givens[selected]) return;
  pushHistory();
  if (notesMode && d !== 0 && !entries[selected]) {
    if (notes[selected].has(d)) notes[selected].delete(d); else notes[selected].add(d);
  } else if (d === 0) {
    if (entries[selected]) entries[selected] = 0; else notes[selected] = new Set();
  } else if (entries[selected] === d) {
    entries[selected] = 0;
  } else {
    placeEntry(selected, d);
  }
  proof = null;
  render();
  checkDone();
  saveDaily();
}

function conflicts(bd) {
  const bad = new Set();
  UNITS.forEach(u => {
    const seen = {};
    u.forEach(i => { const v = bd[i]; if (!v) return; if (seen[v] !== undefined) { bad.add(i); bad.add(seen[v]); } seen[v] = i; });
  });
  return bad;
}

function render() {
  const bd = board(), bad = conflicts(bd);
  const autoCands = autoCandidates ? initCands(bd) : null;
  const selVal = selected >= 0 ? bd[selected] : 0;
  const counts = {}; for (let d = 1; d <= 9; d++) counts[d] = 0;
  bd.forEach(v => { if (v) counts[v]++; });
  for (let d = 1; d <= 9; d++) {
    const el = document.getElementById("rem" + d);
    const remaining = 9 - counts[d];
    el.textContent = remaining; el.parentElement.classList.toggle("done", counts[d] >= 9);
    el.parentElement.setAttribute("aria-label", `Enter ${d}, ${remaining} remaining`);
  }
  for (let i = 0; i < 81; i++) {
    const el = cells[i]; const v = bd[i];
    el.setAttribute("aria-label",
      `Row ${R(i) + 1}, column ${C(i) + 1}: ${v ? v + (givens[i] ? ", given" : "") : "empty"}`);
    el.className = "cell" + (C(i) === 2 || C(i) === 5 ? " br3" : "") + (R(i) === 2 || R(i) === 5 ? " bb3" : "");
    const marks = autoCands ? (autoCands[i] || null) : (notes[i].size ? notes[i] : null);
    if (v) {
      el.textContent = v;
      if (givens[i]) el.classList.add("given"); else el.classList.add("entry");
    } else if (marks) {
      el.innerHTML = `<div class="marks">` +
        Array.from({ length: 9 }, (_, k) => `<span>${marks.has(k + 1) ? k + 1 : ""}</span>`).join("") + `</div>`;
    } else {
      el.textContent = "";
    }
    if (i === selected) el.classList.add("sel");
    if (selVal && v === selVal && i !== selected) el.classList.add("same");
    if (bad.has(i)) el.classList.add("conflict");
  }
  renderProof();
}

/* ---------- proof ladder ---------- */
const stageLabel = document.getElementById("stageLabel");
const stages = [document.getElementById("stage1"), document.getElementById("stage2"), document.getElementById("stage3")];
const proofActions = document.getElementById("proofActions");
const proveBtn = document.getElementById("proveBtn");

function buildProof() {
  const wrong = []; for (let i = 0; i < 81; i++) if (entries[i] && entries[i] !== solution[i]) wrong.push(i);
  if (wrong.length) return { stage: 1, error: wrong };
  const b = board().slice(), cands = initCands(b), elims = [];
  while (true) {
    const st = findStep(b, cands, tier);
    if (!st) return { stage: 1, stuck: true };
    if (st.kind === "place") return { stage: 1, ladder: { elims, place: st } };
    elims.push(st); applyStep(b, cands, st);
  }
}
proveBtn.addEventListener("click", () => {
  if (!proof) { proof = buildProof(); if (proof.ladder) { proofsAsked++; saveDaily(); } }
  else if (proof.stage < 3 && !proof.error && !proof.stuck) proof.stage++;
  render();
  announceProof();
});
function announceProof() {
  if (!proof) return;
  if (proof.error) { announce(`Proof blocked: ${proof.error.map(cellName).join(", ")} contradict the solution. Clear them and ask again.`); return; }
  if (proof.stuck) { announce("No further placements are needed."); return; }
  const pl = proof.ladder.place;
  if (proof.stage === 1) announce(`Proof stage 1 of 3: the next provable cell is row ${R(pl.cell) + 1}, column ${C(pl.cell) + 1}.`);
  else if (proof.stage === 2) announce("Proof stage 2 of 3: the evidence cells are highlighted.");
  else announce(`Proof stage 3 of 3. ${pl.why}`);
}

function renderProof() {
  stages.forEach(s => s.classList.remove("show"));
  proofActions.innerHTML = "";
  const panelEl = document.getElementById("proofPanel");
  if (!proof) {
    stageLabel.textContent = "No proof requested";
    proveBtn.textContent = "Prove it";
    panelEl.hidden = true;
    return;
  }
  panelEl.hidden = false;
  if (proof.error) {
    stageLabel.textContent = "Proof blocked";
    stages[2].classList.add("show"); stages[2].classList.add("err");
    stages[2].innerHTML = `A proof can’t be built from here: <strong>${proof.error.map(cellName).join(", ")}</strong> ${proof.error.length > 1 ? "contradict" : "contradicts"} the certified solution. Fair Sudoku never lies to you — clear the flagged ${proof.error.length > 1 ? "cells" : "cell"} and ask again.`;
    proof.error.forEach(i => cells[i].classList.add("p-wrong"));
    proveBtn.textContent = "Prove it";
    return;
  }
  if (proof.stuck) {
    stageLabel.textContent = "Board complete?";
    stages[2].classList.add("show");
    stages[2].textContent = "No further placements are needed — the remaining cells are forced. If the board isn’t full, this is a bug worth reporting.";
    return;
  }
  stages[2].classList.remove("err");
  const { elims, place: pl } = proof.ladder;
  stageLabel.textContent = "Stage " + proof.stage + " of 3";
  proveBtn.textContent = proof.stage === 1 ? "Show the evidence" : proof.stage === 2 ? "Show the reasoning" : "Prove it";
  cells[pl.cell].classList.add("p-target");
  stages[0].classList.add("show");
  if (proof.stage >= 2) {
    pl.unit.forEach(i => { if (i !== pl.cell) cells[i].classList.add("p-unit"); });
    pl.evidence.forEach(i => { if (i !== pl.cell) cells[i].classList.add("p-evidence"); });
    elims.forEach(st => st.evidence.forEach(i => cells[i].classList.add("p-evidence")));
    stages[1].classList.add("show");
  }
  if (proof.stage >= 3) {
    const t = TECHS.find(t => t.id === pl.tech);
    let html = `<div class="tech-name">${t.name}</div><div>${pl.why}</div>`;
    if (elims.length) {
      html += `<div style="margin-top:8px; color:var(--muted); font-size:.82rem;">First, ${elims.length} supporting elimination${elims.length > 1 ? "s" : ""}: ` +
        elims.map(st => `<em>${TECHS.find(x => x.id === st.tech).name.toLowerCase()}</em> removing ${st.digits.join(", ")} in ${st.cells.map(cellName).join(", ")}`).join("; ") + ".</div>";
    }
    stages[2].innerHTML = html; stages[2].classList.add("show");
    const b = document.createElement("button");
    b.className = "btn primary"; b.textContent = `Place the ${pl.digit} in ${cellName(pl.cell)}`;
    b.addEventListener("click", () => { pushHistory(); placeEntry(pl.cell, pl.digit); proof = null; render(); checkDone(); saveDaily(); });
    proofActions.appendChild(b);
  }
}

/* ---------- certificate ---------- */
function renderCert() {
  const table = document.getElementById("certTable");
  const counts = {}; certTrace.forEach(s => counts[s.tech] = (counts[s.tech] || 0) + 1);
  table.innerHTML = TECHS.filter(t => t.tier <= tier).map(t =>
    `<tr><td>${t.name}</td><td>${counts[t.id] || 0}</td></tr>`).join("");
  const L = LEVELS.find(L => L.id === tier);
  const band = difficultyBand(difficultyScore(certTrace), tier);
  document.getElementById("certStamp").textContent =
    `Verified before you saw it: ${certTrace.length} logical steps · ceiling “${L.label}” · ${band} for this level.`;
  document.getElementById("contractText").textContent =
    `This puzzle is certified solvable with ${L.desc} — nothing harder. If you’re ever stuck, don’t guess: demand the proof.`;
  const list = document.getElementById("techList");
  list.innerHTML = TECHS.map(t => `<li class="${t.tier <= tier ? "" : "off"}">${t.name}</li>`).join("");
  seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.id === tier));
  const chip = document.getElementById("modeChip");
  if (mode === "daily") { chip.textContent = `Daily #${dailyNumber()} · ${dailyDateStr()}`; chip.classList.remove("free"); }
  else { chip.textContent = "Practice"; chip.classList.add("free"); }
}

function checkDone() {
  const bd = board();
  const done = bd.every((v, i) => v === solution[i]);
  const panel = document.getElementById("qedPanel");
  panel.classList.toggle("show", done);
  if (done) {
    document.getElementById("qedText").textContent =
      `Solved with pure logic — ${proofsAsked === 0 ? "no proofs needed" : proofsAsked + " proof" + (proofsAsked > 1 ? "s" : "") + " asked"}, 0 guesses.`;
    document.getElementById("shareBtn").hidden = (mode !== "daily");
    recordDailyResult();
    announce("Solved with pure logic. Not a single guess.");
  }
  return done;
}

/* ---------- share card ---------- */
function shareText() {
  const L = LEVELS.find(L => L.id === tier);
  const st = streaks();
  const lines = [
    `Fair Sudoku · Daily #${dailyNumber()}`,
    `Ceiling: ${L.label}`,
    `Solved by pure logic · ${proofsAsked === 0 ? "no proofs asked" : proofsAsked + " proof" + (proofsAsked > 1 ? "s" : "") + " asked"} · 0 guesses`,
  ];
  if (st.current >= 2) lines.push(`🔥 ${st.current}-day streak`);
  return lines.join("\n");
}
document.getElementById("shareBtn").addEventListener("click", async e => {
  const btn = e.currentTarget, text = shareText();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {}
  if (!ok) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
  }
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => { btn.textContent = "Share result"; }, 1600);
});

/* ---------- daily persistence (per date + tier, per browser) ---------- */
function dailyKey() { return `fs-daily-${dailyDateStr()}-t${tier}`; }
function saveDaily() {
  if (mode !== "daily") return;
  try {
    localStorage.setItem(dailyKey(), JSON.stringify({
      entries, notes: notes.map(s => [...s]), proofsAsked,
    }));
  } catch (_) {}
}
function loadDaily() {
  try {
    const raw = localStorage.getItem(dailyKey());
    if (!raw) return false;
    const s = JSON.parse(raw);
    // Validate everything before committing any of it, so a corrupt or
    // old-format save can never leave the board in a half-loaded state.
    if (!Array.isArray(s.entries) || s.entries.length !== 81) return false;
    if (!Array.isArray(s.notes) || s.notes.length !== 81) return false;
    const loadedEntries = s.entries.map(v => Number(v) || 0);
    const loadedNotes = s.notes.map(a => new Set(Array.isArray(a) ? a.map(Number) : []));
    entries = loadedEntries;
    notes = loadedNotes;
    proofsAsked = Number(s.proofsAsked) || 0;
    return true;
  } catch (_) { return false; }
}

/* ---------- stats & streaks ---------- */
function loadStats() {
  try { return JSON.parse(localStorage.getItem("fs-stats")) || { results: {} }; }
  catch (_) { return { results: {} }; }
}
function recordDailyResult() {
  if (mode !== "daily") return;
  const s = loadStats();
  if (s.results[dailyDateStr()]) return; // first completion of the day counts
  s.results[dailyDateStr()] = { tier, proofsAsked };
  try { localStorage.setItem("fs-stats", JSON.stringify(s)); } catch (_) {}
  renderStats();
}
function streaks() {
  const s = loadStats();
  const dates = Object.keys(s.results).sort();
  let best = 0, run = 0, prev = null;
  dates.forEach(d => {
    const t = Date.parse(d + "T00:00:00Z");
    run = (prev !== null && t - prev === 86400000) ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  });
  let current = 0;
  for (let t = todayUTC(); ; t -= 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (s.results[d]) current++;
    else if (t === todayUTC()) continue; // today not solved yet doesn't break the streak
    else break;
  }
  const all = Object.values(s.results);
  return { current, best, solved: all.length, flawless: all.filter(r => !r.proofsAsked).length };
}
function renderStats() {
  const st = streaks();
  document.getElementById("statsRow").innerHTML = [
    [st.current, "day streak"], [st.best, "best streak"],
    [st.solved, "dailies solved"], [st.flawless, "flawless"],
  ].map(([n, l]) => `<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`).join("");
}

/* ---------- puzzle bank (practice mode) ---------- */
let bank = null, bankLoad = null;
let usedPuzzles = (() => { try { return new Set(JSON.parse(localStorage.getItem("fs-used") || "[]")); } catch (_) { return new Set(); } })();
let practiceBand = "Any";
const BANDS = ["Any", "Gentle", "Steady", "Tough"];

function loadBank() {
  if (bankLoad) return bankLoad;
  bankLoad = fetch("puzzles/bank.json").then(r => r.ok ? r.json() : null).catch(() => null).then(b => { bank = b; return b; });
  return bankLoad;
}
function saveUsed() {
  try { localStorage.setItem("fs-used", JSON.stringify([...usedPuzzles].slice(-2000))); } catch (_) {}
}
function pickFromBank(t, band) {
  if (!bank || !bank.tiers || !bank.tiers[t]) return null;
  let pool = bank.tiers[t];
  if (band && band !== "Any") pool = pool.filter(p => p.band === band);
  if (!pool.length) return null;
  const fresh = pool.filter(p => !usedPuzzles.has(p.p));
  const choose = fresh.length ? fresh : pool; // recycle once exhausted
  const pz = choose[Math.floor(Math.random() * choose.length)];
  usedPuzzles.add(pz.p); saveUsed();
  return { puzzle: [...pz.p].map(Number), solution: [...pz.s].map(Number) };
}

const diffPills = document.getElementById("diffPills");
BANDS.forEach(b => {
  const el = document.createElement("button");
  el.className = "diff-pill"; el.textContent = b; el.dataset.band = b;
  el.addEventListener("click", () => { practiceBand = b; updateDiffPills(); newPuzzle("free"); });
  diffPills.appendChild(el);
});
function updateDiffPills() {
  diffPills.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.band === practiceBand));
}
function togglePracticeControls() {
  document.getElementById("diffRow").hidden = (mode !== "free");
  updateDiffPills();
}

let genToken = 0; // guards against stale results when ceilings are switched quickly
async function newPuzzle(nextMode) {
  if (nextMode === "free" && !requirePremium("Unlimited practice puzzles")) return;
  mode = nextMode;
  document.getElementById("dailyBtn").classList.toggle("on", mode === "daily");
  togglePracticeControls();

  const myToken = ++genToken;
  const reqTier = tier;
  grid.classList.add("loading");
  let g;
  if (mode === "daily") {
    g = await dailyGenerateAsync(reqTier);
  } else {
    await loadBank();
    if (myToken !== genToken) return;
    g = pickFromBank(reqTier, practiceBand) || await generateAsync(reqTier); // fallback if bank missing
  }
  // A newer request superseded this one (user switched ceilings/mode) — drop it.
  if (myToken !== genToken) return;
  grid.classList.remove("loading");

  puzzle = g.puzzle; solution = g.solution;
  // Recompute the trace so the certificate + difficulty work for banked puzzles too.
  certTrace = solveHuman(puzzle, reqTier).steps;
  givens = puzzle.map(v => !!v);
  entries = new Array(81).fill(0);
  notes = Array.from({ length: 81 }, () => new Set());
  proofsAsked = 0;
  selected = -1; proof = null;
  history = []; future = []; updateUndoButtons();
  if (mode === "daily") loadDaily();
  renderCert(); render(); checkDone();
  const L = LEVELS.find(l => l.id === reqTier);
  const band = difficultyBand(difficultyScore(certTrace), reqTier);
  announce(`${mode === "daily" ? "Daily puzzle" : "Practice puzzle"} loaded. ${L.label} ceiling, ${band} for this level.`);
}
document.getElementById("dailyBtn").addEventListener("click", () => newPuzzle("daily"));
document.getElementById("newBtn").addEventListener("click", () => newPuzzle("free"));
document.getElementById("qedNew").addEventListener("click", () => newPuzzle("free"));
renderStats();
// Reflect the saved auto-candidate preference on the controls (newPuzzle renders the board).
(() => {
  const b = document.getElementById("autoCandBtn");
  b.classList.toggle("on", autoCandidates);
  b.setAttribute("aria-pressed", String(autoCandidates));
  document.getElementById("notesBtn").disabled = autoCandidates;
})();
newPuzzle("daily");
