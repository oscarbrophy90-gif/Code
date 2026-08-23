/* VOID FISHING — levels, XP and unlocks.
   Curve is tuned so the early game moves fast and the deep locations arrive
   at a steady clip rather than after an hour of grinding. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const MAX_LEVEL = 99;
  /* Releasing pays into luck up to here — 480 reputation, a couple of hundred
     fish — and then stops. It is worth being able to see that coming. */
  const REP_LUCK_CAP = 1.2;
  const REP_FULL = REP_LUCK_CAP / 0.0025;

  function xpForLevel(n) {
    return Math.round(30 * Math.pow(n, 1.72));
  }
  function xpToNext() { return xpForLevel(VF.state.data.level); }

  /* Past 99 the experience keeps arriving and there is nothing left to spend
     it on, so it used to be dropped on the floor: the bar froze part-filled at
     whatever it happened to hold and never moved again, which reads as broken
     rather than as finished. It buys fathoms instead — a slow count of how far
     down you have been, each one worth a little luck, with the returns
     flattening so it stays a long tail and not a second ladder. */
  const FATHOM_XP = 250000;
  const FATHOM_LUCK = 1.60;
  const FATHOM_SOFT = 12;

  function fathomLuck(n) {
    if (!(n > 0)) return 0;
    return FATHOM_LUCK * (1 - Math.exp(-n / FATHOM_SOFT));
  }

  function addXp(amount) {
    const d = VF.state.data;
    amount = Math.max(0, amount | 0);
    if (!amount) return { levels: 0, fathoms: 0 };

    if (d.level >= MAX_LEVEL) {
      d.fathomXp = (d.fathomXp | 0) + amount;
      let deep = 0;
      while (d.fathomXp >= FATHOM_XP) { d.fathomXp -= FATHOM_XP; d.fathoms = (d.fathoms | 0) + 1; deep++; }
      if (deep) VF.bus.emit('fathom:reached', { fathoms: d.fathoms, gained: deep });
      return { levels: 0, fathoms: deep };
    }

    const from = d.level;
    d.xp += amount;
    let gained = 0;
    while (d.level < MAX_LEVEL && d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level++;
      gained++;
    }
    // whatever is left over at the cap is the first of the deep water
    if (d.level >= MAX_LEVEL && d.xp > 0) { d.fathomXp = (d.fathomXp | 0) + d.xp; d.xp = 0; }
    if (gained) {
      const unlocked = checkUnlocks(from);
      VF.bus.emit('level:up', { level: d.level, gained: gained, unlocked: unlocked });
    }
    return { levels: gained, fathoms: 0 };
  }

  /* Everything that came into reach between the level you were and the level
     you are. A single catch can cross a dozen at once — the ? tier is 260,000
     experience, which from a standing start is thirty-six levels — and asking
     `level === rod.level` announced only whatever happened to sit on the exact
     level you landed on. From level 1 that was none of the eight rods you had
     just earned, and nothing said so.

     Called with no argument it reports nothing new, which is what the callers
     that only want the side effect (unlocking locations on load) want. */
  function checkUnlocks(fromLevel) {
    const d = VF.state.data;
    const from = fromLevel === undefined ? d.level : fromLevel;
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
      if (r.level > from && d.level >= r.level && !r.admin && !r.merchant) out.rods.push(r);
    }
    for (let i = 0; i < VF.bait.list.length; i++) {
      const b = VF.bait.list[i];
      if (b.level > from && d.level >= b.level) out.baits.push(b);
    }
    return out;
  }

  /* What a run of clean catches is worth. It tops out at half again, which is
     reached at twenty-five in a row — the same number the achievement asks
     for — so the ceiling is somewhere a good session actually gets to rather
     than a theoretical one. Losing a fish takes all of it. */
  const STREAK_STEP = 0.02;
  const STREAK_CAP = 0.50;

  function streakMult() {
    const n = VF.state.data.streak | 0;
    return 1 + Math.min(STREAK_CAP, Math.max(0, n) * STREAK_STEP);
  }

  /* Aggregate luck from rod + bait + weather + reputation. Feeds size & mutation rolls. */
  function luck() {
    const d = VF.state.data;
    const rod = VF.rods.get(d.rod);
    const bait = VF.bait.get(d.bait);
    const rep = Math.min(REP_LUCK_CAP, d.reputation * 0.0025);
    return rod.luck + bait.luck + VF.weather.luck() + rep + fathomLuck(d.fathoms | 0);
  }

  /* Aggregate rare-tier multiplier. */
  function rareMult() {
    const d = VF.state.data;
    return VF.rods.get(d.rod).rare * VF.bait.get(d.bait).rare *
           VF.weather.rare() * VF.locations.current().rarityBoost;
  }

  VF.progression = {
    MAX_LEVEL: MAX_LEVEL,
    FATHOM_XP: FATHOM_XP,
    REP_FULL: REP_FULL,
    fathomLuck: fathomLuck,
    streakMult: streakMult,
    STREAK_CAP: STREAK_CAP,
    /* How far into the deep water, as a fraction, for the bar to draw. */
    fathomPct: function () {
      return U.clamp((VF.state.data.fathomXp | 0) / FATHOM_XP, 0, 1);
    },
    xpForLevel: xpForLevel,
    xpToNext: xpToNext,
    addXp: addXp,
    checkUnlocks: checkUnlocks,
    luck: luck,
    rareMult: rareMult
  };
})(window.VF = window.VF || {});
