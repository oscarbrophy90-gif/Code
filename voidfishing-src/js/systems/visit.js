/* VOID FISHING — going to see somebody.

   Talking used to be a panel. Now the rod goes down, you stand up, they walk
   in along the shore, and the two of you have the conversation where the
   player can see it, one line at a time at the bottom of the frame. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const S = {
    phase: 'idle',        // idle | out | talk | back
    npc: null,
    lines: [],
    index: 0,
    lineT: 0,             // how long the current line has been up
    walk: 0,              // 0..1 how much stride the figures have
    k: 0,                 // 0..1 progress along the current walk
    anglerK: 0,
    result: null,
    fade: 0               // caption opacity
  };

  const WALK_OUT = 1.45, WALK_BACK = 1.25;
  const MIN_LINE = 0.55;  // a line cannot be skipped instantly

  function canVisit() {
    const st = VF.fishing.S.state;
    return st === 'idle' || st === 'waiting' || st === 'bite';
  }

  function start(id) {
    if (S.phase !== 'idle') return false;
    if (!canVisit()) {
      VF.toast.show('reel in first — you cannot walk away mid-fight', null, 2600);
      return false;
    }
    const res = VF.npcs.talk(id, { defer: true });
    if (!res) return false;

    VF.fishing.hardReset();
    S.phase = 'out';
    S.npc = res.npc;
    S.result = res;
    S.lines = res.lines.slice();
    S.index = 0;
    S.lineT = 0;
    S.k = 0;
    S.anglerK = 0;
    S.walk = 0;
    S.fade = 0;
    VF.bus.emit('visit:start', { npc: res.npc });
    VF.audio.click();
    return true;
  }

  /* Click, tap or space moves the conversation on. */
  function advance() {
    if (S.phase !== 'talk') return false;
    if (S.lineT < MIN_LINE) return true;      // swallow the input, do not leave
    S.index++;
    S.lineT = 0;
    if (S.index >= S.lines.length) {
      S.phase = 'back';
      S.k = 0;
      // whatever they were going to give you, they give you now
      if (S.result && S.result.commit) S.result.commit();
      VF.audio.back();
      VF.bus.emit('visit:end', { npc: S.npc });
    } else {
      VF.audio.click();
    }
    return true;
  }

  /* Walking off early still counts — you heard them, you just did not stay. */
  function leave() {
    if (S.phase === 'idle' || S.phase === 'back') return;
    S.phase = 'back';
    S.k = 0;
    if (S.result && S.result.commit) S.result.commit();
    VF.bus.emit('visit:end', { npc: S.npc });
  }

  function tick(dt) {
    if (S.phase === 'idle') return;
    if (S.phase === 'out') {
      S.k = Math.min(1, S.k + dt / WALK_OUT);
      S.walk = U.clamp(S.k < 0.12 ? S.k / 0.12 : (S.k > 0.90 ? (1 - S.k) / 0.10 : 1), 0, 1);
      if (S.k >= 1) { S.phase = 'talk'; S.walk = 0; S.lineT = 0; }
    } else if (S.phase === 'talk') {
      S.lineT += dt;
      S.fade = U.clamp(S.fade + dt * 3.2, 0, 1);
    } else if (S.phase === 'back') {
      S.fade = U.clamp(S.fade - dt * 4.5, 0, 1);
      S.k = Math.min(1, S.k + dt / WALK_BACK);
      S.walk = U.clamp(S.k < 0.12 ? S.k / 0.12 : (S.k > 0.88 ? (1 - S.k) / 0.12 : 1), 0, 1);
      if (S.k >= 1) {
        S.phase = 'idle';
        S.walk = 0;
        S.npc = null;
        S.lines = [];
        VF.bus.emit('visit:done', {});
        VF.achievements.check();
        VF.save.save();
      }
    }
  }

  function line() {
    if (S.phase !== 'talk') return null;
    return S.lines[S.index] || null;
  }

  function hardReset() {
    S.phase = 'idle'; S.npc = null; S.lines = []; S.index = 0;
    S.k = 0; S.walk = 0; S.fade = 0; S.result = null;
  }

  VF.visit = {
    S: S,
    start: start, advance: advance, leave: leave, tick: tick,
    line: line, canVisit: canVisit, hardReset: hardReset,
    active: function () { return S.phase !== 'idle'; },
    talking: function () { return S.phase === 'talk'; },
    npc: function () { return S.npc; }
  };
})(window.VF = window.VF || {});
