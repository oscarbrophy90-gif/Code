/* VOID FISHING — a light touch of teaching.
   Six short hints, each tied to the moment the player needs it, then it stops
   talking forever. Nothing is gated or blocked. */
(function (VF) {
  'use strict';

  const STEPS = [
    { id: 0, text: 'Hold Space — or press and hold on the water — to charge a cast. Let go to send it out. Fill the meter into the gold band for a better cast.' },
    { id: 1, text: 'Now wait. Watch the bobber. The void takes its time.' },
    { id: 2, text: 'Something is on. Press now to set the hook.' },
    { id: 3, text: 'Hold Space — or press and hold anywhere — to drive the white bar right. Let go and it runs back left. Keep the fish inside the bar and the bottom meter fills; let it out and the meter drains. Empty it and the fish is gone.' },
    { id: 4, text: 'Sell it for Brophys, keep it for the collection, or release it for reputation.' },
    { id: 5, text: 'Spend what you earn in the Shop. Better rods reach further and find stranger things.' }
  ];

  let shown = -1;

  function init() {
    const t = VF.state.data.tutorial;
    if (t.done) return;
    VF.bus.on('fishing:state', onState);
    VF.bus.on('fishing:landed', function () { advance(4); });
    VF.bus.on('catch:sold', function () { advance(5); });
    VF.bus.on('catch:kept', function () { advance(5); });
    VF.bus.on('catch:released', function () { advance(5); });
    VF.bus.on('rod:bought', finish);
    setTimeout(function () { advance(0); }, 1400);
  }

  function onState(s) {
    const t = VF.state.data.tutorial;
    if (t.done) return;
    if (s === 'waiting') advance(1);
    else if (s === 'bite') advance(2);
    else if (s === 'reeling') advance(3);
  }

  function advance(step) {
    const t = VF.state.data.tutorial;
    if (t.done || step < t.step || step === shown) return;
    const s = STEPS[step];
    if (!s) return;
    shown = step;
    t.step = step + 1;
    VF.hud.hint(s.text, step === 2 ? 2.2 : 9);
    if (step >= STEPS.length - 1) {
      t.done = true;
      VF.save.save();
    }
  }

  function finish() {
    const t = VF.state.data.tutorial;
    if (t.done) return;
    t.done = true;
    VF.save.save();
  }

  function reset() {
    shown = -1;
    VF.state.data.tutorial = { step: 0, done: false };
    setTimeout(function () { advance(0); }, 900);
  }

  VF.tutorial = { init: init, reset: reset, advance: advance };
})(window.VF = window.VF || {});
