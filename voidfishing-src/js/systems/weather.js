/* VOID FISHING — weather system.
   Weather changes on a slow timer and cross-fades over BLEND seconds so the
   scene never snaps. `intensity` is the live 0..1 blend used by the renderer. */
(function (VF) {
  'use strict';

  const MIN_HOLD = 95;
  const MAX_HOLD = 210;
  const BLEND = 9;

  let current = 'clear';
  let next = null;
  let hold = 60;
  let blend = 1;      // 1 = fully settled on `current`

  function allowed() {
    const loc = VF.locations.current();
    return loc.weather && loc.weather.length ? loc.weather : ['clear'];
  }

  function pick() {
    const pool = allowed().map(function (id) { return VF.weatherData.get(id); });
    const avoid = current;
    const chosen = VF.rng.weighted(pool, function (w) {
      return w.id === avoid ? w.weight * 0.12 : w.weight;
    }, VF.rng.g);
    return chosen ? chosen.id : 'clear';
  }

  function tick(dt) {
    if (next) {
      blend += dt / BLEND;
      if (blend >= 1) { current = next; next = null; blend = 1; VF.bus.emit('weather:changed', current); }
      return;
    }
    hold -= dt;
    if (hold <= 0) {
      hold = VF.rng.g.range(MIN_HOLD, MAX_HOLD);
      const n = pick();
      if (n !== current) { next = n; blend = 0; }
    }
  }

  /* Re-roll immediately when the player moves somewhere the weather cannot follow. */
  function reconcile() {
    const ok = allowed();
    if (ok.indexOf(current) < 0) { current = ok[0]; next = null; blend = 1; VF.bus.emit('weather:changed', current); }
    if (next && ok.indexOf(next) < 0) { next = null; blend = 1; }
  }

  function force(id) {
    if (!VF.weatherData.get(id)) return;
    next = id; blend = 0; hold = VF.rng.g.range(MIN_HOLD, MAX_HOLD);
  }

  /* Numeric field lookup blended between outgoing and incoming weather. */
  function field(key, dflt) {
    const a = VF.weatherData.get(current);
    const av = (a[key] === undefined ? dflt : a[key]);
    if (!next) return av;
    const b = VF.weatherData.get(next);
    const bv = (b[key] === undefined ? dflt : b[key]);
    return VF.util.lerp(av, bv, VF.util.smoothstep(blend));
  }

  /* Whoever changes the location, the weather follows. */
  VF.bus.on('location:changed', function () { reconcile(); });

  VF.weather = {
    tick: tick, reconcile: reconcile, force: force, field: field,
    id: function () { return blend < 0.5 && next ? current : (next && blend >= 0.5 ? next : current); },
    data: function () { return VF.weatherData.get(VF.weather.id()); },
    name: function () { return VF.weather.data().name; },
    /* Modifiers the fishing systems read — always the settled-ish value. */
    bite: function () { return field('bite', 1); },
    rare: function () { return field('rare', 1); },
    luck: function () { return field('luck', 0); },
    encounter: function () { return field('encounter', 1); },
    /* Render fields */
    fog: function () { return field('fog', 0); },
    rain: function () { return field('rain', 0); },
    wind: function () { return field('wind', 0.3); },
    light: function () { return field('light', 1); },
    meteors: function () { return field('meteors', 0); },
    aurora: function () { return field('aurora', 0); },
    surge: function () { return field('surge', 0); },
    shakeAmt: function () { return field('shake', 0); },
    tint: function () {
      const a = VF.weatherData.get(current);
      if (!next) return a.tint ? { c: a.tint, k: 1 } : null;
      const b = VF.weatherData.get(next);
      const t = VF.util.smoothstep(blend);
      if (!a.tint && !b.tint) return null;
      if (!a.tint) return { c: b.tint, k: t };
      if (!b.tint) return { c: a.tint, k: 1 - t };
      return { c: VF.util.rgbToCss(VF.util.mixRgb(VF.util.hexToRgb(a.tint), VF.util.hexToRgb(b.tint), t)), k: 1 };
    }
  };
})(window.VF = window.VF || {});
