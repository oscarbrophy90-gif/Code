/* VOID FISHING — core utilities */
(function (VF) {
  'use strict';

  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }
  function easeOutBack(t) { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  /* Frame-rate independent approach-to-target. `rate` = fraction remaining per second. */
  function approach(cur, target, rate, dt) {
    return target + (cur - target) * Math.pow(rate, dt);
  }

  /* --- colour helpers: colours are [r,g,b] arrays 0..255 --- */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToCss(c, a) {
    if (a === undefined) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  function shade(c, amt) {
    // amt > 0 lightens toward white, < 0 darkens toward black
    return amt >= 0 ? mixRgb(c, [255, 255, 255], amt) : mixRgb(c, [0, 0, 0], -amt);
  }

  /* --- number formatting --- */
  const UNITS = [
    { v: 1e15, s: 'Q' }, { v: 1e12, s: 'T' }, { v: 1e9, s: 'B' }, { v: 1e6, s: 'M' }
  ];
  function money(n) {
    n = Math.floor(n);
    const neg = n < 0; n = Math.abs(n);
    let out;
    if (n >= 1e6) {
      let u = UNITS.find(function (x) { return n >= x.v; });
      const q = n / u.v;
      out = (q < 10 ? q.toFixed(2) : q < 100 ? q.toFixed(1) : Math.floor(q).toString()) + u.s;
    } else {
      out = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return (neg ? '-' : '') + out;
  }
  function commas(n) {
    return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function weight(kg) {
    if (kg < 0.1) return (kg * 1000).toFixed(0) + ' g';
    if (kg < 1) return kg.toFixed(2) + ' kg';
    if (kg < 100) return kg.toFixed(1) + ' kg';
    return commas(Math.round(kg)) + ' kg';
  }
  function length(m) {
    if (m < 1) return (m * 100).toFixed(0) + ' cm';
    return m.toFixed(2) + ' m';
  }
  function duration(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }
  function pct(t, digits) { return (t * 100).toFixed(digits === undefined ? 1 : digits) + '%'; }

  /* Describe where a catch sits in its species' size range.
     Only genuinely large fish get the flattering "top n%" phrasing. */
  function ordinalPercentile(p) {
    const top = (1 - p) * 100;
    if (top < 0.15) return 'top 0.1%';
    if (top < 1) return 'top ' + top.toFixed(1) + '%';
    if (top < 25) return 'top ' + Math.max(1, Math.round(top)) + '%';
    if (p < 0.12) return 'runt';
    if (p < 0.35) return 'small';
    if (p < 0.65) return 'average';
    return 'large';
  }

  /* --- dom helpers --- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* Escape for safe innerHTML use (we mostly avoid innerHTML, but data-driven strings need it). */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* --- misc --- */
  function deepClone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(deepClone);
    const out = {};
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = deepClone(o[k]);
    return out;
  }
  function byId(list) {
    const m = Object.create(null);
    for (let i = 0; i < list.length; i++) m[list[i].id] = list[i];
    return m;
  }
  function now() { return performance.now() / 1000; }

  VF.util = {
    TAU, clamp, lerp, invLerp, smoothstep, smootherstep,
    easeOutCubic, easeInCubic, easeOutBack, easeInOutSine, approach,
    hexToRgb, rgbToCss, mixRgb, shade,
    money, commas, weight, length, duration, pct, ordinalPercentile,
    el, qs, qsa, clear, esc, deepClone, byId, now
  };
})(window.VF = window.VF || {});
