"use strict";
/* The free/premium seam. Premium = unlimited practice puzzles at any ceiling
   + the paste-anything Fairness Checker. Free = today's daily with the full
   toolkit (never crippled) + NYT verdicts.
   During beta everything is unlocked; flip BETA_UNLOCK when payments land. */
const BETA_UNLOCK = true;

function isPremium() {
  if (BETA_UNLOCK) return true;
  try { return localStorage.getItem("fs-premium") === "1"; } catch (_) { return false; }
}

/* Returns true when the caller may proceed; otherwise shows the upsell. */
function requirePremium(feature) {
  if (isPremium()) return true;
  alert(`${feature} is part of the Fair Toolkit — $4/month or $24/year.\n` +
    `Your daily puzzle stays free, full toolkit included, forever. No ads, ever.`);
  return false;
}
