/* VOID FISHING — day/night cycle.
   One full day is DAY_LENGTH real seconds and transitions continuously, so the
   scene is never abruptly repainted. Phases are named windows on that cycle. */
(function (VF) {
  'use strict';

  const DAY_LENGTH = 560;

  const PHASES = [
    { id: 'dawn',   name: 'Dawn',   from: 0.00, to: 0.18 },
    { id: 'day',    name: 'Day',    from: 0.18, to: 0.48 },
    { id: 'sunset', name: 'Sunset', from: 0.48, to: 0.64 },
    { id: 'night',  name: 'Night',  from: 0.64, to: 1.00 }
  ];

  let cycle = 0.66;   // start just into night — the game reads best at night
  let phaseId = 'night';

  function tick(dt) {
    const prev = phaseId;
    cycle = (cycle + dt / DAY_LENGTH) % 1;
    for (let i = 0; i < PHASES.length; i++) {
      if (cycle >= PHASES[i].from && cycle < PHASES[i].to) { phaseId = PHASES[i].id; break; }
    }
    if (phaseId !== prev) VF.bus.emit('time:phase', phaseId);
  }

  /* Sun elevation: 0 at deep night, 1 at midday. Drives global scene brightness. */
  function elevation() {
    // peak at cycle 0.33, trough at 0.83
    return VF.util.clamp(0.5 + 0.5 * Math.cos((cycle - 0.33) * VF.util.TAU), 0, 1);
  }

  /* Clock string for the HUD — cosmetic, mapped onto a 24h face. */
  function clock() {
    const total = ((cycle + 0.25) % 1) * 24;
    const h = Math.floor(total);
    const m = Math.floor((total - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function phase() { return phaseId; }
  function phaseName() {
    for (let i = 0; i < PHASES.length; i++) if (PHASES[i].id === phaseId) return PHASES[i].name;
    return 'Night';
  }
  function setCycle(c) { cycle = c % 1; }

  VF.time = {
    tick: tick,
    phase: phase,
    phaseName: phaseName,
    elevation: elevation,
    clock: clock,
    cycle: function () { return cycle; },
    setCycle: setCycle,
    DAY_LENGTH: DAY_LENGTH,
    PHASES: PHASES
  };
})(window.VF = window.VF || {});
