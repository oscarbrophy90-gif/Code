/* VOID FISHING — tiny event bus. Keeps systems decoupled without a framework. */
(function (VF) {
  'use strict';

  const listeners = Object.create(null);

  function on(evt, fn) {
    (listeners[evt] || (listeners[evt] = [])).push(fn);
    return function off() { emitterOff(evt, fn); };
  }
  function emitterOff(evt, fn) {
    const l = listeners[evt];
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  function emit(evt, payload) {
    const l = listeners[evt];
    if (!l || !l.length) return;
    // iterate over a copy so handlers may unsubscribe safely
    const copy = l.slice();
    for (let i = 0; i < copy.length; i++) {
      try { copy[i](payload); }
      catch (err) { console.error('[bus] handler failed for "' + evt + '"', err); }
    }
  }

  VF.bus = { on: on, off: emitterOff, emit: emit };
})(window.VF = window.VF || {});
