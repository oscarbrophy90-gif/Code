/* VOID FISHING — the loadout.
   One place that folds rod, bait, charms, relics and conditions into the
   numbers the rest of the game reads. Recomputed only when something changes,
   because the loot roll asks for it on every cast. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const BASE = {
    luck: 0,        // additive
    rare: 1, value: 1, xp: 1, bite: 1, reel: 1, line: 1,
    size: 1, trait: 1, treasure: 1, encounter: 1, secret: 1, void: 1,
    /* the catch minigame reads these two directly */
    barSize: 1,     // how wide the white bar is
    barSpeed: 1     // how fast the white bar travels
  };

  let cache = null;
  let key = '';

  function currentKey() {
    const d = VF.state.data;
    return d.rod + '|' + d.bait + '|' + d.charmSlots.join(',') + '|' +
           VF.time.phase() + '|' + d.level;
  }

  function compute() {
    const d = VF.state.data;
    const s = Object.assign({}, BASE);

    const rod = VF.rods.get(d.rod);
    const bait = VF.bait.get(d.bait);
    s.luck += rod.luck + bait.luck;
    s.rare *= rod.rare * bait.rare;
    s.bite *= bait.bite;

    const max = VF.charms.slotCount();
    for (let i = 0; i < max; i++) {
      const c = VF.charms.get(d.charmSlots[i]);
      if (!c) continue;
      const st = c.stats || {};
      for (const k in st) {
        if (k === 'luck') s.luck += st.luck;
        else if (s[k] !== undefined) s[k] *= st[k];
      }
      if (c.dynamic) { try { c.dynamic(s); } catch (e) { /* a charm must not break a cast */ } }
    }

    // keep the extremes sane no matter how the build is stacked
    s.bite = U.clamp(s.bite, 0.35, 2.6);
    s.line = U.clamp(s.line, 0.4, 3.0);
    s.reel = U.clamp(s.reel, 0.5, 2.5);
    s.rare = Math.max(0.3, s.rare);
    s.value = Math.max(0.4, s.value);
    // five stacked size charms should be a real build, not an auto-win
    s.barSize = U.clamp(s.barSize, 0.6, 2.4);
    s.barSpeed = U.clamp(s.barSpeed, 0.5, 2.0);
    return s;
  }

  function stats() {
    const k = currentKey();
    if (k !== key || !cache) { key = k; cache = compute(); }
    return cache;
  }

  /* What the worn charms alone are doing. The rod and the bait have their own
     tabs; folding them in here made the summary read as nonsense. */
  function charmStats() {
    const d = VF.state.data;
    const s = Object.assign({}, BASE);
    const max = VF.charms.slotCount();
    for (let i = 0; i < max; i++) {
      const c = VF.charms.get(d.charmSlots[i]);
      if (!c) continue;
      const st = c.stats || {};
      for (const kk in st) {
        if (kk === 'luck') s.luck += st.luck;
        else if (s[kk] !== undefined) s[kk] *= st[kk];
      }
      if (c.dynamic) { try { c.dynamic(s); } catch (e) { /* ignore */ } }
    }
    return s;
  }

  function invalidate() { key = ''; cache = null; }

  /* A short human summary of what this loadout is for — shown in the bag. */
  function describe() {
    const s = charmStats();
    const parts = [];
    if (s.rare >= 1.25) parts.push('rarity');
    if (s.size >= 1.2) parts.push('size');
    if (s.trait >= 1.3) parts.push('traits');
    if (s.value >= 1.3) parts.push('value');
    if (s.bite <= 0.8) parts.push('speed');
    if (s.treasure >= 1.6) parts.push('salvage');
    if (s.encounter >= 1.4) parts.push('encounters');
    if (s.secret >= 1.5) parts.push('discovery');
    if (s['void'] >= 1.5) parts.push('the deep');
    if (s.barSize >= 1.18) parts.push('the white bar');
    if (s.barSpeed <= 0.93) parts.push('a steady bar');
    else if (s.barSpeed >= 1.12) parts.push('a quick bar');
    if (!parts.length) return 'balanced';
    return parts.slice(0, 3).join(' · ');
  }

  VF.build = { stats: stats, charmStats: charmStats, invalidate: invalidate,
               describe: describe, BASE: BASE };

  VF.bus.on('charm:changed', invalidate);
  VF.bus.on('gear:changed', invalidate);
  VF.bus.on('bait:changed', invalidate);
  VF.bus.on('rod:bought', invalidate);
  VF.bus.on('level:up', invalidate);
  VF.bus.on('time:phase', invalidate);
})(window.VF = window.VF || {});
