/* VOID FISHING — cosmetic cases.
   Bought with Brophys, contain cosmetics and nothing else, and the odds are
   printed on the front because hiding them would be the only dishonest part. */
(function (VF) {
  'use strict';

  /* Odds are per case and sum to 1. They are shown to the player verbatim. */
  const ODDS = {
    common: 0.6000,
    uncommon: 0.2600,
    rare: 0.1000,
    epic: 0.0320,
    legendary: 0.0072,
    mythic: 0.0008
  };

  const LIST = [
    { id: 'harbour', name: 'Harbour Case', cost: 12000, level: 4,
      blurb: 'Ordinary things, well made. The starting collection.',
      color: '#7fa8c8',
      pool: ['rod_bone', 'rod_tar', 'rod_verd', 'rod_rose',
             'bob_slate', 'bob_buoy', 'bob_pearl', 'bob_lantern',
             'line_copper', 'line_glow', 'spl_gold', 'spl_ink',
             'cast_dust', 'cast_spark', 'catch_motes', 'catch_coin',
             'ui_paper', 'ui_tide', 'fit_hood', 'fit_scarf', 'rod_frost',
             'rod_orbit', 'catch_halo', 'line_thread'] },

    { id: 'deepwater', name: 'Deepwater Case', cost: 90000, level: 16,
      blurb: 'Recovered from further down than anybody sells from.',
      color: '#5fd0e0',
      pool: ['rod_verd', 'rod_ember', 'rod_frost', 'rod_orbit',
             'bob_pearl', 'bob_lantern', 'bob_eye',
             'line_glow', 'line_pulse', 'spl_ink', 'spl_bloom',
             'cast_spark', 'cast_comet', 'catch_coin', 'catch_halo',
             'ui_tide', 'ui_ember', 'ui_void', 'fit_scarf', 'fit_lamp'] },

    { id: 'cradle', name: 'Cradle Case', cost: 640000, level: 30,
      blurb: 'Salvage from the ring. Most of it should not still work.',
      color: '#ffd08a',
      pool: ['rod_ember', 'rod_orbit', 'rod_null',
             'bob_lantern', 'bob_eye', 'bob_star',
             'line_pulse', 'line_thread', 'spl_bloom', 'spl_shatter',
             'cast_comet', 'catch_halo', 'catch_rift',
             'ui_ember', 'ui_void', 'fit_lamp', 'fit_starlit'] },

    { id: 'nothing', name: 'Case Of Nothing', cost: 4800000, level: 46,
      blurb: 'The collector will not say where these come from.',
      color: '#a86bff',
      pool: ['rod_orbit', 'rod_null', 'bob_eye', 'bob_star',
             'line_thread', 'spl_shatter', 'cast_comet',
             'catch_halo', 'catch_rift', 'ui_void', 'fit_starlit', 'fit_lamp'] }
  ];

  const BY_ID = VF.util.byId(LIST);

  /* Pick a rarity by the printed odds, then a cosmetic of that rarity from the
     case's pool. If a case has nothing at the drawn rarity it steps down. */
  function rollFrom(caseDef, rnd) {
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    let r = rnd(), acc = 0, picked = 'common';
    for (let i = order.length - 1; i >= 0; i--) {
      acc += ODDS[order[i]] || 0;
      if (r <= acc) { picked = order[i]; break; }
    }
    const items = caseDef.pool.map(function (id) { return VF.cosmetics.get(id); })
                              .filter(function (c) { return !!c; });
    for (let step = order.indexOf(picked); step < order.length; step++) {
      const tier = order[step];
      const at = items.filter(function (c) { return c.rarity === tier; });
      if (at.length) return { item: at[Math.floor(rnd() * at.length)], rarity: tier };
    }
    return { item: items[0], rarity: items[0] ? items[0].rarity : 'common' };
  }

  /* The strip the opening animation scrolls through: mostly filler, with the
     real result parked at a known index. */
  function buildStrip(caseDef, result, rnd) {
    const items = caseDef.pool.map(function (id) { return VF.cosmetics.get(id); })
                              .filter(function (c) { return !!c; });
    const STRIP = 48;
    const WIN = 42;
    const strip = [];
    for (let i = 0; i < STRIP; i++) {
      if (i === WIN) { strip.push(result.item); continue; }
      // filler skews common, with the occasional glimpse of something good
      const r = rnd();
      const tier = r < 0.62 ? 'common' : r < 0.86 ? 'uncommon' : r < 0.96 ? 'rare' : r < 0.994 ? 'epic' : 'legendary';
      let at = items.filter(function (c) { return c.rarity === tier; });
      if (!at.length) at = items;
      strip.push(at[Math.floor(rnd() * at.length)]);
    }
    return { strip: strip, winIndex: WIN };
  }

  /* A case cannot pay out a tier it does not stock, so the odds shown are the
     odds after those tiers fold down into the next one they can actually fill. */
  function effectiveOdds(caseDef) {
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    const have = Object.create(null);
    caseDef.pool.forEach(function (id) {
      const c = VF.cosmetics.get(id);
      if (c) have[c.rarity] = true;
    });
    const out = Object.create(null);
    order.forEach(function (t) { out[t] = 0; });
    order.forEach(function (t) {
      let target = t;
      for (let i = order.indexOf(t); i < order.length; i++) {
        if (have[order[i]]) { target = order[i]; break; }
        target = order[order.length - 1];
      }
      out[target] += ODDS[t] || 0;
    });
    return out;
  }

  function completion(caseId) {
    const c = BY_ID[caseId];
    if (!c) return { have: 0, total: 0, pct: 0 };
    let have = 0;
    for (let i = 0; i < c.pool.length; i++) if (VF.cosmetics.owned(c.pool[i])) have++;
    return { have: have, total: c.pool.length, pct: have / c.pool.length };
  }

  VF.cases = {
    list: LIST, ODDS: ODDS,
    get: function (id) { return BY_ID[id] || null; },
    rollFrom: rollFrom, buildStrip: buildStrip, completion: completion,
    effectiveOdds: effectiveOdds
  };
})(window.VF = window.VF || {});
