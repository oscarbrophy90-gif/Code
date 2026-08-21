/* VOID FISHING — "something is wrong".
   Very rare, entirely harmless, and never explained. The water stops, the
   music cuts, the interface goes, something passes underneath, and then it is
   all exactly as it was. Nothing is dropped, nothing is lost, nothing is said. */
(function (VF) {
  'use strict';

  const U = VF.util;

  /* Long timers on purpose. If a player sees two in a session it has failed. */
  const MIN_GAP = 1500;      // seconds of play before another can happen
  const CHECK = 45;

  let sinceLast = 620;       // a while before the first is even possible
  let check = CHECK;
  let phase = null;          // null | 'still' | 'wrong' | 'shape' | 'restore'
  let t = 0;
  let intensity = 0;

  function chance() {
    const d = VF.state.data;
    // slightly likelier the deeper you are and the longer you have played
    const li = VF.locations.index(d.location);
    return U.clamp(0.02 + li * 0.006, 0, 0.09);
  }

  function begin() {
    if (phase) return false;
    phase = 'still';
    t = 0;
    sinceLast = 0;
    VF.state.data.stats.wrongEvents++;
    VF.bus.emit('wrong:begin');
    return true;
  }

  function tick(dt) {
    if (!phase) {
      sinceLast += dt;
      check -= dt;
      if (check <= 0) {
        check = CHECK;
        const st = VF.fishing.state();
        const quiet = st === 'idle' || st === 'waiting';
        if (quiet && sinceLast > MIN_GAP && !VF.encounters.active() && VF.rng.g() < chance()) begin();
      }
      intensity = Math.max(0, intensity - dt * 1.5);
      return;
    }

    t += dt;
    if (phase === 'still') {
      intensity = U.clamp(t / 1.2, 0, 1);
      if (t > 1.4) { phase = 'wrong'; t = 0; VF.bus.emit('wrong:peak'); }
    } else if (phase === 'wrong') {
      intensity = 1;
      if (t > 3.2) { phase = 'shape'; t = 0; VF.bus.emit('wrong:shape'); }
    } else if (phase === 'shape') {
      intensity = 1;
      if (t > 5.0) { phase = 'restore'; t = 0; VF.bus.emit('wrong:restore'); }
    } else if (phase === 'restore') {
      intensity = U.clamp(1 - t / 2.6, 0, 1);
      if (t > 2.8) {
        phase = null; t = 0; intensity = 0;
        VF.journal.add('firstwrong');
        VF.bus.emit('wrong:end');
        VF.save.save();
      }
    }
  }

  function reset() { phase = null; t = 0; intensity = 0; }

  VF.wrong = {
    tick: tick, begin: begin, reset: reset,
    active: function () { return !!phase; },
    phase: function () { return phase; },
    intensity: function () { return intensity; }
  };
})(window.VF = window.VF || {});
