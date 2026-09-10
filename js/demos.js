"use strict";
/* Tap-to-learn technique demos. Any element with data-tech-info="<TECH id>"
   opens a modal showing the technique on a REAL board position (mined by
   tools/build-demos.mjs): the pattern cells highlighted, the little candidate
   numbers it rules out struck through, and the same plain-English reasoning
   the proof ladder uses. Requires engine.js (TECHS/LEVELS) on the page. */
(function () {
  let loading = null;
  function loadDemos() {
    if (loading) return loading;
    loading = fetch("puzzles/demos.json").then(r => r.ok ? r.json() : null).catch(() => null);
    return loading;
  }

  const scrim = document.createElement("div");
  scrim.className = "modal-scrim"; scrim.hidden = true; scrim.id = "demoScrim";
  scrim.innerHTML = `<div class="modal demo-modal" role="dialog" aria-modal="true" aria-labelledby="demoTitle" aria-describedby="demoPlain">
    <div class="ob-eyebrow" id="demoLevel"></div>
    <h2 id="demoTitle"></h2>
    <p class="demo-plain" id="demoPlain"></p>
    <div class="demo-grid" id="demoGrid" aria-hidden="true"></div>
    <p class="demo-why" id="demoWhy"></p>
    <div class="ob-actions demo-actions"><span></span><button class="btn primary" id="demoClose" type="button">Got it</button></div>
  </div>`;
  document.body.appendChild(scrim);
  const q = sel => scrim.querySelector(sel);
  let lastFocus = null;

  function close() {
    scrim.hidden = true;
    document.removeEventListener("keydown", onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  q("#demoClose").addEventListener("click", close);
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });

  function renderBoard(demo) {
    const grid = q("#demoGrid"); grid.innerHTML = "";
    const board = [...demo.board].map(Number);
    const st = demo.step;
    const ev = new Set(st.evidence || []);
    const vic = new Set(st.cells || []);
    for (let i = 0; i < 81; i++) {
      const c = document.createElement("div");
      c.className = "d-cell" + ((i % 9 === 2 || i % 9 === 5) ? " d-br" : "") + ((Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5) ? " d-bb" : "");
      if (ev.has(i) && !vic.has(i)) c.classList.add("d-ev");
      if (vic.has(i)) c.classList.add("d-vic");
      const v = board[i];
      if (v) { c.textContent = v; c.classList.add("d-given"); }
      else if (st.kind === "place" && st.cell === i) { c.textContent = st.digit; c.classList.add("d-place"); }
      else {
        const cands = demo.cands[i] || [];
        const m = document.createElement("div"); m.className = "d-marks";
        for (let k = 1; k <= 9; k++) {
          const s = document.createElement("span");
          if (cands.includes(k)) {
            s.textContent = k;
            const cut = vic.has(i) && (st.kind === "elim" ? st.digits.includes(k) : st.kind === "reduce" ? !st.digits.includes(k) : false);
            if (cut) s.classList.add("d-cut");
            else if (ev.has(i) && st.digits && st.digits.includes(k)) s.classList.add("d-key");
          }
          m.appendChild(s);
        }
        c.appendChild(m);
      }
      grid.appendChild(c);
    }
  }

  async function openTechDemo(id) {
    const t = (typeof TECHS !== "undefined" ? TECHS : []).find(x => x.id === id);
    if (!t) return;
    const L = (typeof LEVELS !== "undefined" ? LEVELS : []).find(l => l.id === t.tier);
    lastFocus = document.activeElement;
    q("#demoLevel").textContent = L ? `${/^[AEIOU]/i.test(L.label) ? "An" : "A"} ${L.label}-level move` : "";
    q("#demoTitle").textContent = t.name;
    q("#demoPlain").textContent = t.plain || "";
    q("#demoWhy").textContent = "Finding a real example…";
    q("#demoGrid").innerHTML = "";
    scrim.hidden = false;
    document.addEventListener("keydown", onKey);
    q("#demoClose").focus();
    const data = await loadDemos();
    const demo = data && data.demos && data.demos[id];
    if (!demo) { q("#demoWhy").textContent = "Example unavailable offline — the description above is the idea."; return; }
    renderBoard(demo);
    const caption = demo.step.kind === "place"
      ? " On this real board: the gold square is where the number must go; the tinted squares are the evidence."
      : " On this real board: the outlined squares form the pattern, and the struck-through little numbers are exactly what it rules out.";
    q("#demoWhy").textContent = demo.step.why + caption;
  }

  window.openTechDemo = openTechDemo;
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-tech-info]");
    if (el) { e.preventDefault(); openTechDemo(el.dataset.techInfo); }
  });
})();
