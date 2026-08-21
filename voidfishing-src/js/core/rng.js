/* VOID FISHING — random number generation */
(function (VF) {
  'use strict';

  /* mulberry32 — small, fast, deterministic when seeded */
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    function rnd() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    rnd.range = function (lo, hi) { return lo + rnd() * (hi - lo); };
    rnd.int = function (lo, hi) { return Math.floor(lo + rnd() * (hi - lo + 1)); };
    rnd.pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    rnd.chance = function (p) { return rnd() < p; };
    rnd.sign = function () { return rnd() < 0.5 ? -1 : 1; };
    /* Approximately gaussian via sum of uniforms; mean 0, sd ~1 */
    rnd.gauss = function () { return (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) / 0.707; };
    rnd.shuffle = function (arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    rnd.seed = function (s) { a = (s >>> 0) || 0x9e3779b9; };
    return rnd;
  }

  /* Weighted pick. `items` is an array; weightFn returns a non-negative number. */
  function weighted(items, weightFn, rnd) {
    let total = 0;
    const w = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const v = Math.max(0, weightFn(items[i], i));
      w[i] = v; total += v;
    }
    if (total <= 0) return null;
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) {
      r -= w[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  const global = makeRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);

  VF.rng = { make: makeRng, weighted: weighted, g: global };
})(window.VF = window.VF || {});
