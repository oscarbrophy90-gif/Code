/* VOID FISHING — the things that happen while you are just sitting there.
   Small ambient events keep the water alive; rare legendary encounters break
   the calm completely. Both are on long timers so neither wears out. */
(function (VF) {
  'use strict';

  const U = VF.util;

  let ambientTimer = 22;
  let encTimer = 75;
  let calm = 0;            // 0..1, how still the water has gone
  let calmTarget = 0;
  let encPhase = null;     // null | 'still' | 'reveal' | 'waiting'
  let encT = 0;
  let encData = null;

  const LINES = [
    'something is below you',
    'the water has stopped',
    'it noticed the light',
    'do not reel yet',
    'it has been waiting',
    'something is looking up'
  ];

  /* ------------------------------------------------------- ambient events */

  const AMBIENT = [
    { id: 'splash', w: 22, run: function () {
        const L = VF.scene.L;
        const x = L.w * VF.rng.g.range(0.15, 0.92);
        const y = L.horizonY + L.waterH * VF.rng.g.range(0.06, 0.4);
        VF.fx.ripple(x, y, L.w * 0.09, 2.4);
        VF.fx.ripple(x, y, L.w * 0.055, 1.7);
        VF.particles.burst(x, y, 9, { color: [200, 226, 245], angle: -Math.PI / 2, spread: 1.5,
          speedMin: 25, speedMax: 80, sizeMax: 2, grav: 190, lifeMax: 0.7 });
        VF.audio.splash(0.5);
      } },
    { id: 'shadow', w: 20, run: function () {
        VF.scene.addShadow({ x: -0.2, y: VF.rng.g.range(0.18, 0.55), sp: VF.rng.g.range(0.035, 0.075),
          size: VF.rng.g.range(0.9, 2.2), alpha: 0.42, life: 22, max: 22 });
      } },
    { id: 'glow', w: 16, run: function () {
        const loc = VF.locations.current();
        VF.scene.addShadow({ x: -0.15, y: VF.rng.g.range(0.2, 0.5), sp: VF.rng.g.range(0.02, 0.045),
          size: VF.rng.g.range(0.7, 1.4), alpha: 0.34, life: 26, max: 26, glow: loc.glow });
        VF.audio.nibble();
      } },
    { id: 'swarm', w: 11, run: function () {
        for (let i = 0; i < 6; i++) {
          VF.scene.addShadow({ x: -0.25 - i * 0.06, y: VF.rng.g.range(0.2, 0.45),
            sp: 0.10 + VF.rng.g() * 0.05, size: 0.24 + VF.rng.g() * 0.2, alpha: 0.30, life: 16, max: 16 });
        }
      } },
    { id: 'meteorfall', w: 9, run: function () {
        const L = VF.scene.L;
        VF.scene.spawnMeteor();
        setTimeout(function () {
          const x = L.w * VF.rng.g.range(0.3, 0.9);
          const y = L.horizonY + L.waterH * VF.rng.g.range(0.05, 0.25);
          VF.fx.ripple(x, y, L.w * 0.14, 3.0, [255, 220, 170], 1.8);
          VF.particles.burst(x, y, 16, { color: [255, 220, 160], angle: -Math.PI / 2, spread: 1.8,
            speedMin: 40, speedMax: 150, sizeMax: 2.4, grav: 200 });
          VF.audio.splash(0.85);
          VF.fx.shake(2.2);
        }, 900);
      } },
    { id: 'drift', w: 10, run: function () {
        const L = VF.scene.L;
        VF.scene.addShadow({ x: -0.1, y: VF.rng.g.range(0.1, 0.28), sp: 0.014,
          size: VF.rng.g.range(0.5, 0.9), alpha: 0.28, life: 60, max: 60 });
      } },
    { id: 'whisper', w: 7, run: function () {
        VF.audio.duck(0.5);
        VF.bus.emit('ui:whisper');
      } },
    { id: 'ringlight', w: 8, run: function () {
        const L = VF.scene.L;
        const x = L.w * VF.rng.g.range(0.3, 0.85);
        const y = L.horizonY + L.waterH * VF.rng.g.range(0.15, 0.5);
        const loc = VF.locations.current();
        const col = U.hexToRgb(loc.glow);
        for (let i = 0; i < 3; i++) {
          setTimeout(function () { VF.fx.ripple(x, y, L.w * 0.10, 3.2, col, 1.1); }, i * 420);
        }
        VF.audio.nibble();
      } }
  ];

  function fireAmbient() {
    const ev = VF.rng.weighted(AMBIENT, function (e) { return e.w; }, VF.rng.g);
    if (!ev) return;
    try { ev.run(); } catch (e) { console.warn('[encounters] ambient failed', e); }
    VF.bus.emit('ambient:event', ev.id);
  }

  /* ---------------------------------------------------- legendary encounter */

  function encounterChance() {
    const d = VF.state.data;
    const loc = VF.locations.current();
    const base = 0.050 + VF.locations.index(loc.id) * 0.012;
    return U.clamp(base * VF.weather.encounter() * (1 + VF.progression.luck() * 0.10), 0, 0.25);
  }

  function tryStartEncounter() {
    if (encPhase) return false;
    if (VF.fishing.state() !== 'waiting') return false;
    if (VF.fishing.S.encounterActive) return false;
    const loc = VF.locations.current();
    const li = VF.locations.index(loc.id);
    // the guaranteed tier scales with how deep you are fishing
    const minRank = U.clamp(3 + Math.floor(li / 2), 3, 6);
    encData = { minRank: minRank, line: VF.rng.g.pick(LINES) };
    encPhase = 'still';
    encT = 0;
    calmTarget = 1;
    VF.audio.encounter();
    VF.state.data.stats.encounters++;
    VF.bus.emit('encounter:start', encData);
    return true;
  }

  function abortEncounter() {
    encPhase = null; encData = null; calmTarget = 0;
    VF.bus.emit('encounter:end');
  }

  function updateEncounter(dt) {
    encT += dt;
    if (VF.fishing.state() !== 'waiting' && encPhase !== 'done') {
      if (VF.fishing.state() === 'reeling' || VF.fishing.state() === 'bite') {
        // handed over to the fight — fade the stillness out
        encPhase = 'done'; calmTarget = 0;
        VF.bus.emit('encounter:hooked');
        return;
      }
      abortEncounter();
      return;
    }
    if (encPhase === 'still' && encT > 1.6) {
      encPhase = 'reveal'; encT = 0;
      const loc = VF.locations.current();
      // something very large, and something faintly lit inside it
      VF.scene.addShadow({ x: -0.45, y: 0.34, sp: 0.062, size: 9.5, alpha: 0.86, life: 15, max: 15 });
      VF.scene.addShadow({ x: -0.40, y: 0.30, sp: 0.062, size: 3.2, alpha: 0.5, life: 15, max: 15, glow: loc.glow });
      VF.fx.pulse(0.7);
      VF.bus.emit('encounter:reveal', encData);
    } else if (encPhase === 'reveal' && encT > 2.6) {
      encPhase = 'waiting'; encT = 0;
      VF.fishing.queueEncounter({ minRank: encData.minRank, delay: 1.4, mutBoost: 0.8, rareBoost: 1.35 });
    } else if (encPhase === 'waiting' && encT > 9) {
      abortEncounter();
    } else if (encPhase === 'done' && encT > 2.5) {
      encPhase = null; encData = null;
      VF.bus.emit('encounter:end');
    }
  }

  /* ---------------------------------------------------------------- tick */

  function tick(dt) {
    calm = U.approach(calm, calmTarget, 0.06, dt);

    if (encPhase) { updateEncounter(dt); return; }

    const st = VF.fishing.state();
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      ambientTimer = VF.rng.g.range(26, 74) / U.clamp(VF.weather.encounter(), 0.5, 3);
      fireAmbient();
    }

    if (st === 'waiting') {
      encTimer -= dt;
      if (encTimer <= 0) {
        encTimer = VF.rng.g.range(80, 190);
        if (VF.rng.g() < encounterChance()) tryStartEncounter();
      }
    }
  }

  function reset() {
    ambientTimer = 22; encTimer = 75;
    encPhase = null; encData = null; calm = 0; calmTarget = 0;
  }

  VF.encounters = {
    tick: tick, reset: reset,
    calm: function () { return calm; },
    active: function () { return !!encPhase; },
    force: tryStartEncounter
  };
})(window.VF = window.VF || {});
