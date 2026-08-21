/* VOID FISHING — the condition currently affecting this spot.
   At most one at a time, on a long timer, cross-faded so the water changes
   rather than snaps. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const IDLE_MIN = 210;
  const IDLE_MAX = 460;
  const FADE = 7;

  let active = null;      // condition def
  let remain = 0;
  let idle = 90;
  let blend = 0;          // 0..1 presence

  const NEUTRAL = { bite: 1, rare: 1, value: 1, size: 1, trait: 1, treasure: 1,
                    encounter: 1, secret: 1, 'void': 1 };

  function available() {
    const li = VF.locations.index(VF.state.data.location);
    const d = VF.state.data;
    return VF.conditionData.list.filter(function (c) {
      if (c.minLoc && li < c.minLoc) return false;
      // some water does not do a thing until it has been given a reason to
      if (c.test) { try { return !!c.test(d); } catch (e) { return false; } }
      return true;
    });
  }

  function start(id) {
    const pool = available();
    const c = id ? VF.conditionData.get(id)
      : VF.rng.weighted(pool, function (x) {
          return typeof x.weight === 'function' ? x.weight() : x.weight;
        }, VF.rng.g);
    if (!c) return false;
    active = c;
    remain = VF.rng.g.range(c.dur[0], c.dur[1]);
    VF.bus.emit('condition:start', c);
    return true;
  }

  function end() {
    if (!active) return;
    const was = active;
    active = null;
    remain = 0;
    idle = VF.rng.g.range(IDLE_MIN, IDLE_MAX);
    VF.bus.emit('condition:end', was);
  }

  function tick(dt) {
    if (active) {
      remain -= dt;
      blend = U.clamp(Math.min(blend + dt / FADE, remain / FADE), 0, 1);
      if (remain <= 0) end();
    } else {
      blend = Math.max(0, blend - dt / FADE);
      idle -= dt;
      if (idle <= 0) {
        idle = VF.rng.g.range(IDLE_MIN, IDLE_MAX);
        // conditions favour the deeper water, where things are less settled
        const li = VF.locations.index(VF.state.data.location);
        if (VF.rng.g() < 0.45 + li * 0.05) start();
      }
    }
  }

  /* Modifiers, eased in and out so nothing changes abruptly mid-cast. */
  function mods() {
    if (!active || blend <= 0.001) return NEUTRAL;
    const k = U.smoothstep(blend);
    const out = {};
    for (const key in NEUTRAL) {
      const v = active.mods[key];
      out[key] = v === undefined ? 1 : U.lerp(1, v, k);
    }
    return out;
  }

  function reset() { active = null; remain = 0; blend = 0; idle = 90; }

  /* Bring the next roll forward without forcing a particular condition — the
     sky still decides, it just decides sooner. */
  function hasten(sec) {
    if (active) return false;
    idle = Math.min(idle, Math.max(8, sec || 30));
    return true;
  }

  VF.conditions = {
    tick: tick, mods: mods, start: start, end: end, reset: reset, hasten: hasten,
    current: function () { return active; },
    name: function () { return active ? active.name : null; },
    strength: function () { return active ? U.smoothstep(blend) : 0; },
    has: function (id) { return !!active && active.id === id; },
    flag: function (f) { return active && active[f] ? U.smoothstep(blend) : 0; }
  };

  VF.bus.on('location:changed', reset);

  /* A skyfall that came and went without giving up what somebody was waiting
     for should not mean another hour of ordinary water. */
  VF.bus.on('condition:end', function (c) {
    if (c && c.id === 'skyfall' && VF.quests && VF.quests.at('heavens', 8)) hasten(75);
  });
})(window.VF = window.VF || {});
