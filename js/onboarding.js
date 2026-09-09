"use strict";
/* First-run onboarding: a 3-slide explainer of the fairness promise, the proof
   ladder, and the logic ceiling. Shows once (localStorage fs-onboarded); the
   "How it works" link in the footer reopens it any time. */
(function () {
  const scrim = document.getElementById("onboardScrim");
  if (!scrim) return;
  const slides = [...scrim.querySelectorAll(".ob-slide")];
  const dotsWrap = document.getElementById("obDots");
  const nextBtn = document.getElementById("obNext");
  const skipBtn = document.getElementById("obSkip");
  let idx = 0;
  let lastFocus = null;

  slides.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "ob-dot";
    dotsWrap.appendChild(d);
  });
  const dots = [...dotsWrap.children];

  function show(i) {
    idx = i;
    slides.forEach((s, n) => { s.hidden = n !== i; });
    dots.forEach((d, n) => d.classList.toggle("on", n === i));
    nextBtn.textContent = i === slides.length - 1 ? "Start playing" : "Next";
    skipBtn.hidden = i === slides.length - 1;
    scrim.querySelector(".ob-slide:not([hidden]) h2")?.focus?.();
  }
  function open() {
    lastFocus = document.activeElement;
    scrim.hidden = false;
    show(0);
    nextBtn.focus();
    document.addEventListener("keydown", onKey);
  }
  function close() {
    scrim.hidden = true;
    document.removeEventListener("keydown", onKey);
    try { localStorage.setItem("fs-onboarded", "1"); } catch (_) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Tab") { // simple focus containment
      const f = scrim.querySelectorAll("button");
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  }

  nextBtn.addEventListener("click", () => { if (idx < slides.length - 1) show(idx + 1); else close(); });
  skipBtn.addEventListener("click", close);
  scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
  document.getElementById("howItWorks")?.addEventListener("click", open);

  let seen = false;
  try { seen = localStorage.getItem("fs-onboarded") === "1"; } catch (_) {}
  if (!seen) open();
})();
