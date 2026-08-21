/* VOID FISHING — levels, XP and unlocks.
   Curve is tuned so the early game moves fast and the deep locations arrive
   at a steady clip rather than after an hour of grinding. */
(function (VF) {
  'use strict';

  const MAX_LEVEL = 99;

  function xpForLevel(n) {
    return Math.round(30 * Math.pow(n, 1.72));
  }
  function xpToNext() { return xpForLevel(VF.state.data.level); }

  function addXp(amount) {
    const d = VF.state.data;
    if (d.level >= MAX_LEVEL) return { levels: 0 };
    d.xp += amount;
    let gained = 0;
    while (d.level < MAX_LEVEL && d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level++;
      gained++;
    }
    if (gained) {
      const unlocked = checkUnlocks();
      VF.bus.emit('level:up', { level: d.level, gained: gained, unlocked: unlocked });
    }
    return { levels: gained };
  }

  /* Returns the list of things that became available at the new level. */
  function checkUnlocks() {
    const d = VF.state.data;
    const out = { locations: [], rods: [], baits: [] };
    for (let i = 0; i < VF.locations.list.length; i++) {
      const l = VF.locations.list[i];
      if (d.level >= l.level && d.unlockedLocations.indexOf(l.id) < 0) {
        d.unlockedLocations.push(l.id);
        out.locations.push(l);
      }
    }
    for (let i = 0; i < VF.rods.list.length; i++) {
      const r = VF.rods.list[i];
      if (d.level === r.level) out.rods.push(r);
    }
    for (let i = 0; i < VF.bait.list.length; i++) {
      const b = VF.bait.list[i];
      if (d.level === b.level) out.baits.push(b);
    }
    return out;
  }

  /* Aggregate luck from rod + bait + weather + reputation. Feeds size & mutation rolls. */
  function luck() {
    const d = VF.state.data;
    const rod = VF.rods.get(d.rod);
    const bait = VF.bait.get(d.bait);
    const rep = Math.min(1.2, d.reputation * 0.0025);
    return rod.luck + bait.luck + VF.weather.luck() + rep;
  }

  /* Aggregate rare-tier multiplier. */
  function rareMult() {
    const d = VF.state.data;
    return VF.rods.get(d.rod).rare * VF.bait.get(d.bait).rare *
           VF.weather.rare() * VF.locations.current().rarityBoost;
  }

  VF.progression = {
    MAX_LEVEL: MAX_LEVEL,
    xpForLevel: xpForLevel,
    xpToNext: xpToNext,
    addXp: addXp,
    checkUnlocks: checkUnlocks,
    luck: luck,
    rareMult: rareMult
  };
})(window.VF = window.VF || {});
