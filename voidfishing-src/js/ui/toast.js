/* VOID FISHING — transient notifications on the right edge. */
(function (VF) {
  'use strict';

  const U = VF.util;
  let host = null;
  const live = [];
  const MAX = 4;

  function init() { host = document.getElementById('toasts'); }

  function show(text, kind, ms) {
    if (!host) return;
    while (live.length >= MAX) remove(live[0]);
    const el = U.el('div', 'toast' + (kind ? ' ' + kind : ''));
    el.appendChild(U.el('div', 't-mark'));
    const body = U.el('div', 't-body');
    body.innerHTML = text;   // callers pass pre-escaped, markup-limited strings
    el.appendChild(body);
    host.appendChild(el);
    const rec = { el: el, timer: setTimeout(function () { remove(rec); }, ms || 3400) };
    live.push(rec);
    return rec;
  }

  function remove(rec) {
    const i = live.indexOf(rec);
    if (i < 0) return;
    live.splice(i, 1);
    clearTimeout(rec.timer);
    rec.el.classList.add('out');
    setTimeout(function () { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); }, 340);
  }

  function plain(text, kind, ms) { return show(U.esc(text), kind, ms); }

  VF.toast = { init: init, show: show, plain: plain };
})(window.VF = window.VF || {});
