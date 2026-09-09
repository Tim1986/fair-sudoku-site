"use strict";
/* Fairness Checker page: NYT auto-verdicts + paste-anything trial. */

function verdictSummary(v) {
  if (!v.valid) return { fair: false, head: "Invalid puzzle", detail: `Not a proper Sudoku: ${v.reason}.` };
  if (v.fairTier) {
    const L = LEVELS.find(l => l.id === v.fairTier);
    return {
      fair: true,
      head: `FAIR — solvable with ${L.label.toLowerCase().replace("+ ", "")}`,
      detail: `${v.givens} givens. Pure logic all the way down: every cell is reachable with techniques at the “${L.label}” ceiling. No guessing required.`,
    };
  }
  return {
    fair: false,
    head: "UNFAIR — humane logic runs out",
    detail: `${v.givens} givens. The full toolkit places ${v.stuck.placed} cell${v.stuck.placed === 1 ? "" : "s"}, then stalls with ${v.stuck.remaining} still empty. Finishing requires chain logic or bifurcation — guessing, by another name.`,
  };
}

function tierRows(v) {
  if (!v.valid || !v.tiers) return "";
  return v.tiers.map(t => {
    const used = Object.entries(t.counts)
      .map(([id, n]) => `${TECHS.find(x => x.id === id).name.toLowerCase()} ×${n}`).join(", ");
    return `<tr class="${t.solved ? "ok" : "fail"}">
      <td>${t.solved ? "✓" : "✗"}</td><td>${t.label}</td>
      <td>${t.solved ? `solves it — ${used}` : "stalls"}</td></tr>`;
  }).join("");
}

/* ---------- pasted puzzles ---------- */
const panel = document.getElementById("verdictPanel");
document.getElementById("checkBtn").addEventListener("click", async () => {
  if (!requirePremium("The paste-anything checker")) return;
  const btn = document.getElementById("checkBtn");
  const raw = document.getElementById("pasteBox").value;
  const p = parsePuzzle(raw);
  panel.hidden = false;
  if (!p) {
    document.getElementById("verdictStamp").className = "verdict-stamp bad";
    document.getElementById("verdictStamp").textContent = "Can’t read that";
    document.getElementById("verdictBody").textContent =
      `Found ${(raw || "").replace(/[^0-9.]/g, "").length} digits/blanks — a puzzle needs exactly 81 (use 0 or “.” for empty cells).`;
    document.getElementById("tierTable").innerHTML = "";
    return;
  }
  btn.disabled = true; btn.textContent = "Deliberating…";
  const v = await verdictAsync(p);
  btn.disabled = false; btn.textContent = "Deliver the verdict";
  showVerdict(v);
});

function showVerdict(v) {
  const s = verdictSummary(v);
  const stamp = document.getElementById("verdictStamp");
  stamp.className = "verdict-stamp " + (s.fair ? "good" : "bad");
  stamp.textContent = s.head;
  document.getElementById("verdictBody").textContent = s.detail;
  document.getElementById("tierTable").innerHTML = tierRows(v);
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- NYT auto-check ---------- */
const NYT_LEVELS = ["easy", "medium", "hard"];
async function loadNYT() {
  const cardsEl = document.getElementById("nytCards");
  let data = null;
  try {
    const res = await fetch("data/nyt-today.json", { cache: "no-store" });
    if (res.ok) data = await res.json();
  } catch (_) {}
  if (!data) {
    document.getElementById("nytSub").innerHTML =
      `No NYT feed found. Fetch today’s puzzles with <span class="mono">node tools/nyt-check.mjs</span>
       (writes <span class="mono">data/nyt-today.json</span>; run it from a daily job in production).`;
    return;
  }
  document.getElementById("nytSub").textContent =
    `Verdicts for The New York Times’ Sudoku of ${data.displayDate || data.date} — computed by the Fair Sudoku engine, not the NYT.`;
  cardsEl.innerHTML = "";
  for (const lv of NYT_LEVELS) {
    const p = data.puzzles && data.puzzles[lv];
    if (!p) continue;
    const v = await verdictAsync(p);
    const s = verdictSummary(v);
    const card = document.createElement("button");
    card.className = "nyt-card " + (s.fair ? "good" : "bad");
    card.innerHTML = `<div class="nyt-tier">${lv}</div>
      <div class="nyt-verdict">${s.fair ? "FAIR" : "UNFAIR"}</div>
      <div class="nyt-detail">${s.fair
        ? "ceiling: " + LEVELS.find(l => l.id === v.fairTier).label.toLowerCase()
        : "stalls with " + v.stuck.remaining + " cells left"}</div>`;
    card.addEventListener("click", () => showVerdict(v));
    cardsEl.appendChild(card);
  }
}
loadNYT();
