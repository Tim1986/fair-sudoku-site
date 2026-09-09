"use strict";
/* Thin async wrapper over the engine. Uses a Web Worker when available so heavy
   generation/verdict work never blocks the UI; falls back to the synchronous
   in-page engine (engine.js, loaded before this file) when it isn't — so the
   worst case is exactly the old behavior, never a broken one. */

const _worker = (() => {
  if (typeof Worker === "undefined") return null;
  try { return new Worker("js/worker.js"); } catch (_) { return null; }
})();

let _seq = 0;
const _pending = new Map();

if (_worker) {
  _worker.onmessage = e => {
    const { id, result, error } = e.data;
    const p = _pending.get(id);
    if (!p) return;
    _pending.delete(id);
    if (error) p.reject(new Error(error)); else p.resolve(result);
  };
  // If the worker ever dies, fail open: pending calls reject and callers fall
  // back to synchronous generation on the main thread.
  _worker.onerror = () => {
    for (const [, p] of _pending) p.reject(new Error("worker error"));
    _pending.clear();
  };
}

function _call(cmd, payload, syncFn) {
  if (!_worker) return Promise.resolve(syncFn());
  return new Promise((resolve, reject) => {
    const id = ++_seq;
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ id, cmd, ...payload });
  }).catch(() => syncFn()); // any worker failure → synchronous fallback
}

function generateAsync(tier) { return _call("generate", { tier }, () => generate(tier)); }
function dailyGenerateAsync(tier) { return _call("daily", { tier }, () => dailyGenerate(tier)); }
function verdictAsync(puzzle) { return _call("verdict", { puzzle }, () => verdict(puzzle)); }
