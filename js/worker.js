"use strict";
/* Off-main-thread engine. Generation and the checker's uniqueness count are the
   only expensive operations; running them here keeps the board responsive.
   The page still loads engine.js directly for the fast, synchronous work
   (proof ladder, conflict checks) and as the fallback when Workers are absent. */
importScripts("engine.js");

onmessage = function (e) {
  const { id, cmd, tier, puzzle } = e.data;
  let result = null;
  try {
    if (cmd === "generate") result = generate(tier);
    else if (cmd === "daily") result = dailyGenerate(tier);
    else if (cmd === "verdict") result = verdict(puzzle);
    postMessage({ id, result });
  } catch (err) {
    postMessage({ id, error: String(err && err.message || err) });
  }
};
