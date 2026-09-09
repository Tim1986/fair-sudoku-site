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

function board() { const b = puzzle.slice(); for (let i = 0; i < 81; i++) if (entries[i]) b[i] = entries[i]; return b; }
function select(i) { selected = i; render(); cells[i].focus({ preventScroll: true }); }

function toggleNotes() {
  notesMode = !notesMode;
  const b = document.getElementById("notesBtn");
  b.classList.toggle("on", notesMode);
  b.setAttribute("aria-pressed", String(notesMode));
}
document.getElementById("notesBtn").addEventListener("click", toggleNotes);
document.getElementById("autoNotesBtn").addEventListener("click", () => {
  const cands = initCands(board());
  for (let i = 0; i < 81; i++) if (cands[i]) notes[i] = new Set(cands[i]);
  render(); saveDaily();
});

function placeEntry(i, d) {
  entries[i] = d; notes[i] = new Set();
  PEERS[i].forEach(p => notes[p].delete(d));
}
function enter(d) {
  if (selected < 0 || givens[selected]) return;
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
  const selVal = selected >= 0 ? bd[selected] : 0;
  const counts = {}; for (let d = 1; d <= 9; d++) counts[d] = 0;
  bd.forEach(v => { if (v) counts[v]++; });
  for (let d = 1; d <= 9; d++) {
    const el = document.getElementById("rem" + d);
    el.textContent = (9 - counts[d]); el.parentElement.classList.toggle("done", counts[d] >= 9);
  }
  for (let i = 0; i < 81; i++) {
    const el = cells[i]; const v = bd[i];
    el.className = "cell" + (C(i) === 2 || C(i) === 5 ? " br3" : "") + (R(i) === 2 || R(i) === 5 ? " bb3" : "");
    if (v) {
      el.textContent = v;
      if (givens[i]) el.classList.add("given"); else el.classList.add("entry");
    } else if (notes[i].size) {
      el.innerHTML = `<div class="marks">` +
        Array.from({ length: 9 }, (_, k) => `<span>${notes[i].has(k + 1) ? k + 1 : ""}</span>`).join("") + `</div>`;
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
});

function renderProof() {
  stages.forEach(s => s.classList.remove("show"));
  proofActions.innerHTML = "";
  if (!proof) {
    stageLabel.textContent = "No proof requested";
    proveBtn.textContent = "Prove it";
    return;
  }
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
    b.addEventListener("click", () => { placeEntry(pl.cell, pl.digit); proof = null; render(); checkDone(); saveDaily(); });
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
  document.getElementById("certStamp").textContent =
    `Verified before you saw it: ${certTrace.length} logical steps, ceiling “${L.label}”.`;
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
    if (!Array.isArray(s.entries) || s.entries.length !== 81) return false;
    entries = s.entries.map(Number);
    notes = s.notes.map(a => new Set(a));
    proofsAsked = s.proofsAsked || 0;
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

function newPuzzle(nextMode) {
  if (nextMode === "free" && !requirePremium("Unlimited practice puzzles")) return;
  mode = nextMode;
  const g = mode === "daily" ? dailyGenerate(tier) : generate(tier);
  puzzle = g.puzzle; solution = g.solution; certTrace = g.trace;
  givens = puzzle.map(v => !!v);
  entries = new Array(81).fill(0);
  notes = Array.from({ length: 81 }, () => new Set());
  proofsAsked = 0;
  selected = -1; proof = null;
  if (mode === "daily") loadDaily();
  document.getElementById("dailyBtn").classList.toggle("on", mode === "daily");
  renderCert(); render(); checkDone();
}
document.getElementById("dailyBtn").addEventListener("click", () => newPuzzle("daily"));
document.getElementById("newBtn").addEventListener("click", () => newPuzzle("free"));
document.getElementById("qedNew").addEventListener("click", () => newPuzzle("free"));
renderStats();
newPuzzle("daily");
