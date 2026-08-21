/* VOID FISHING — deciding what is on the end of the line.
   Fish are drawn directly (not tier-then-species) so a tier with no local species
   simply never comes up, and preference tags shift the odds inside a tier. */
(function (VF) {
  'use strict';

  const U = VF.util;

  /* Combined "rarity power". Additive over sources so stacking every bonus is
     strong but never runaway-exponential. */
  function rarityPower(opts) {
    const d = VF.state.data;
    const rod = VF.rods.get(d.rod);
    const bait = VF.bait.get(d.bait);
    const loc = VF.locations.current();
    const build = VF.build ? VF.build.stats() : null;
    const cond = VF.conditions ? VF.conditions.mods() : null;
    const sum = Math.max(0,
      (rod.rare - 1) +
      (bait.rare - 1) +
      (VF.weather.rare() - 1) +
      (loc.rarityBoost - 1) +
      (build ? build.rare - 1 : 0) +
      (cond ? cond.rare - 1 : 0) +
      VF.progression.luck() * 0.5
    );
    // diminishing returns: stacking every bonus is strong, never runaway
    let rp = 1 + Math.pow(sum, 0.82);
    if (opts && opts.rareBoost) rp *= opts.rareBoost;
    return Math.max(1, rp);
  }

  /* Species not native to a spot can still stray in from one or two locations
     away, at heavily reduced odds. Keeps every tier populated everywhere without
     making the deep spots feel like the shallow ones. */
  const STRAY = [1, 0.22, 0.045, 0];

  function strayFactor(f, locIdx) {
    if (!f.locs.length) return 1;                 // "anywhere" species
    let best = 99;
    for (let i = 0; i < f.locs.length; i++) {
      // a spot nobody has discovered yet is not a spot: locations.index()
      // answers 0 for an unknown id, which would put its fish on the shore
      if (!VF.locations.isRegistered(f.locs[i])) continue;
      const d = Math.abs(VF.locations.index(f.locs[i]) - locIdx);
      if (d < best) best = d;
    }
    if (best === 99) return 0;
    if (f.strict) return best === 0 ? 1 : 0;      // never one spot over
    return best < STRAY.length ? STRAY[best] : 0;
  }

  /* Pool for a location: every species with a non-zero presence, plus the
     summed presence per rarity so tier probability stays independent of how
     many species happen to sit in that tier. */
  function buildPool(locId) {
    const locIdx = VF.locations.index(locId);
    const pool = [];
    const perRarity = Object.create(null);
    const prefTotal = Object.create(null);
    for (let i = 0; i < VF.fish.list.length; i++) {
      const f = VF.fish.list[i];
      const s = strayFactor(f, locIdx);
      if (s <= 0) continue;
      pool.push({ f: f, stray: s });
      perRarity[f.rarity] = (perRarity[f.rarity] || 0) + s;
    }
    return { pool: pool, perRarity: perRarity, prefTotal: prefTotal };
  }

  const poolCache = Object.create(null);
  function pool(locId) {
    return poolCache[locId] || (poolCache[locId] = buildPool(locId));
  }

  /* Preference tags steer WHICH species inside a tier, not how likely the tier
     is — tier odds are bait.rare's job. So the bonus is normalised against the
     tier average before it is applied. */
  function prefBonus(f) {
    const d = VF.state.data;
    let k = 1;
    if (f.baits.length) k *= (f.baits.indexOf(d.bait) >= 0) ? 3.0 : 0.55;
    if (f.time.length) k *= (f.time.indexOf(VF.time.phase()) >= 0) ? 1.8 : 0.6;
    if (f.weather.length) k *= (f.weather.indexOf(VF.weather.id()) >= 0) ? 2.2 : 0.7;
    return k;
  }

  /* Mean preference bonus per rarity, recomputed whenever the inputs change. */
  let prefKey = '';
  let prefMean = Object.create(null);
  function prefMeans(p, locId) {
    const d = VF.state.data;
    const key = locId + '|' + d.bait + '|' + VF.time.phase() + '|' + VF.weather.id();
    if (key === prefKey) return prefMean;
    const sum = Object.create(null), cnt = Object.create(null);
    for (let i = 0; i < p.pool.length; i++) {
      const e = p.pool[i];
      sum[e.f.rarity] = (sum[e.f.rarity] || 0) + prefBonus(e.f) * e.stray;
      cnt[e.f.rarity] = (cnt[e.f.rarity] || 0) + e.stray;
    }
    const m = Object.create(null);
    for (const r in sum) m[r] = cnt[r] > 0 ? sum[r] / cnt[r] : 1;
    prefKey = key; prefMean = m;
    return m;
  }

  /* Pick a species. `opts.minRank` forces the draw up to a tier (legendary encounters). */
  function pickFish(opts) {
    opts = opts || {};
    const loc = VF.locations.current();
    const p = pool(loc.id);
    const rp = rarityPower(opts);
    const minRank = opts.minRank || 0;

    // event species are not in the water unless their event is happening, so
    // the pool is filtered per cast rather than per location
    const candidates = p.pool.filter(function (e) {
      if (e.f.event && !(VF.quests && VF.quests.eventActive(e.f.event))) return false;
      if (minRank && VF.rarities.rank(e.f.rarity) < minRank) return false;
      return true;
    });
    if (!candidates.length) return VF.fish.byId('smallmouth') || VF.fish.list[0];

    const counts = Object.create(null);
    for (let i = 0; i < candidates.length; i++) {
      counts[candidates[i].f.rarity] = (counts[candidates[i].f.rarity] || 0) + candidates[i].stray;
    }
    const means = prefMeans(p, loc.id);

    const chosen = VF.rng.weighted(candidates, function (e) {
      const r = VF.rarities.get(e.f.rarity);
      const n = counts[e.f.rarity] || 1;
      const mean = means[e.f.rarity] || 1;
      // presence < 1 means this tier only drifts in from elsewhere — damp it
      const presence = Math.min(1, n);
      let w = (VF.rarities.weightAt(r, rp) * presence * e.stray / n) * (prefBonus(e.f) / mean);
      // an event is only an event if the things it brings actually turn up
      if (e.f.event && e.f.evWeight) w *= e.f.evWeight;
      return w;
    }, VF.rng.g);

    return chosen ? chosen.f : candidates[0].f;
  }

  /* Size roll. Low exponent = the tail gets fatter, so luck genuinely produces
     bigger fish rather than just more of them. */
  function rollSize(f, luck, scale) {
    const exp = U.clamp(2.45 - luck * 0.30, 1.15, 2.45);
    const u = VF.rng.g();          // the raw draw, before the curve is applied
    let t = Math.pow(u, exp);
    // rare "surge" roll: a small chance to re-roll high, creating trophy moments
    if (VF.rng.g() < 0.012 + luck * 0.006) t = Math.max(t, Math.pow(VF.rng.g(), 0.35));
    t = U.clamp(t, 0, 1);

    const kMin = Math.max(f.kg[0], 1e-4), kMax = Math.max(f.kg[1], kMin * 1.0001);
    const mMin = Math.max(f.m[0], 1e-4), mMax = Math.max(f.m[1], mMin * 1.0001);
    // exponential interpolation keeps most catches modest and makes the top end feel earned
    const sc = scale || 1;
    const kg = kMin * Math.pow(kMax / kMin, t) * sc;
    const m = mMin * Math.pow(mMax / mMin, U.clamp(t + VF.rng.g.range(-0.06, 0.06), 0, 1)) * Math.pow(sc, 0.4);
    return { kg: kg, m: m, pct: t, u: u };
  }

  /* Build the full catch record. */
  function roll(opts) {
    opts = opts || {};
    const d = VF.state.data;
    const loc = VF.locations.current();
    const luck = VF.progression.luck();

    const f = opts.forceFish ? (VF.fish.byId(opts.forceFish) || pickFish(opts)) : pickFish(opts);
    const build = VF.build ? VF.build.stats() : null;

    // traits are rolled against the size percentile, then the size is nudged by
    // whichever of them changes how big the fish is
    let size = rollSize(f, luck);
    const traitBoost = (1 + (opts.traitBoost || 0)) * (build ? build.traitChance : 1);
    const traits = VF.traits.roll(luck + (opts.mutBoost || 0), size.u, VF.rng.g, traitBoost);
    const scale = VF.traits.sizeScale(traits);
    if (scale !== 1) size = { kg: size.kg * scale, m: size.m * Math.pow(scale, 0.4), pct: size.pct, u: size.u };

    const rarity = VF.rarities.get(f.rarity);
    const traitMult = VF.traits.multiplier(traits);

    const sizeValue = 0.55 + size.pct * 1.75;
    const value = Math.max(1, Math.round(
      f.value * sizeValue * traitMult * loc.valueBoost * (build ? build.value : 1)
    ));
    const xp = Math.max(1, Math.round(
      rarity.xp * (0.8 + size.pct * 0.6) * loc.xpBoost * (build ? build.xp : 1)
    ));

    const prev = d.fishdex[f.id];
    const isNew = !prev;
    const isRecord = !!prev && size.kg > (prev.record ? prev.record.kg : 0);
    const isGiant = size.pct >= 0.985 || traits.indexOf('massive') >= 0;

    return {
      id: f.id, fish: f, rarity: f.rarity, rarityDef: rarity,
      traits: traits,
      mutation: traits.length ? traits[0] : null,     // kept for older save data
      kg: size.kg, m: size.m, pct: size.pct,
      value: value, xp: xp,
      isNew: isNew, isRecord: isRecord, isGiant: isGiant,
      location: loc.id, time: VF.time.phase(), weather: VF.weather.id(),
      at: Date.now()
    };
  }

  /* However slow a loadout asks the bar to be, it still has to be able to run
     the fish down. This is that guarantee, as a multiple of the fish's speed. */
  const BAR_FLOOR = 1.08;

  /* What the rod and the worn charms are worth to the white bar, pulled out on
     its own so a scripted fight can apply the same loadout to numbers it wrote
     itself. Gear has to matter in the heaven's trial too, or the trial is not
     a test of the player, it is a test of a constant. */
  function loadout() {
    const rod = VF.rods.get(VF.state.data.rod);
    const b = (VF.build ? VF.build.stats() : null) ||
              { line: 1, reel: 1, barSize: 1, barSpeed: 1 };
    const q = U.clamp((rod.reel * b.reel - 0.40) / 2.70, 0, 1.25);

    /* One rule for every rod. Width comes from line strength and steadiness
       from reel force, exactly as it always has — and a rod may then declare
       its own bar numbers on top of that, which the wanderer's stock does.
       Those are a specialty, not a replacement: a rod that says +14% bar is
       a rod of its tier and then fourteen per cent more, which is why his
       epics beat the shop's best rather than trailing them. */
    const lineTotal = Math.max(0.25, rod.line * b.line);
    return {
      q: q,
      rodBar: (1 + 0.155 * (Math.log(lineTotal) / Math.LN2)) * (rod.barSize || 1),
      barSize: b.barSize,
      barMul: U.clamp(b.barSpeed * (1 - 0.20 * q) * (rod.barSpeed || 1), 0.30, 2.2),
      fillMul: (1 + 0.35 * q) * (rod.barFill || 1)
    };
  }

  /* One phase of a scripted fight. The phase writes the shape of it; the
     loadout still moves the numbers, on exactly the same terms as a normal
     fight, so a better rod is a better rod all the way to the top. */
  function trialParams(ph) {
    const L = loadout();
    const stiff = ph.fishStiff || 24;
    const barTop = Math.max(0.80, ph.fishSpeed * 1.55) * (ph.barSpeed || 1);
    return {
      diff: 1.15,
      barW: U.clamp(ph.barW * L.rodBar * L.barSize, 0.050, 0.46),
      barSpeed: Math.max(ph.fishSpeed * BAR_FLOOR, barTop * L.barMul),
      barTau: 0.170 / (1 + 0.60 * L.q),
      fishSpeed: ph.fishSpeed,
      fishStiff: stiff,
      fishDrag: 1.10 * Math.sqrt(stiff),
      fishTurn: ph.fishTurn,
      dart: ph.dart,
      evade: ph.evade || 0,
      wobble: ph.wobble || 0.045,
      fill: ph.fill * L.fillMul,
      drain: ph.drain,
      start: ph.start || 0.30
    };
  }

  function fightParams(c) {
    const L = loadout();
    const f = c.fish;
    const rank = VF.rarities.rank(c.rarity);
    const tf = VF.traits.fight(c.traits);

    /* One difficulty number, 0 at the easiest common and 1 at the worst thing
       in the catalogue. Traits push past 1, which is the point of them. */
    const raw = f.diff * 0.55 + rank * 0.100 + c.pct * 0.16;
    const D = U.clamp(((raw - 0.05) / 1.25) * Math.pow(tf.power, 0.55), 0, 1.15);

    const stam = U.clamp(tf.stamina, 0.7, 1.7);
    const surge = U.clamp(tf.surge, 0.6, 2.2);

    const fishSpeed = 0.30 + 0.66 * D;
    const stiff = 9 + 17 * D;

    /* The bar's top speed. Charms that slow it make it steadier — but a stack
       of them must never drop it below the fish it has to chase, or the fight
       stops being a question of control and becomes one of arithmetic. */
    /* The headroom between the baseline and the floor matters as much as the
       floor does. At 1.45 against a 1.20 floor everything below 0.83 collapsed
       onto the floor, so fifty-three of the wanderer's rods moved the bar at
       exactly the same speed on any rare-or-better fish and the slow-versus-
       fast axis they are built around did nothing. */
    const barTop = Math.max(0.74, fishSpeed * 1.55);

    return {
      diff: D,

      /* --- the white bar ---
         The bar is always faster than the fish. That is the whole contract of
         the minigame: a rarer fish is harder to *hold*, never impossible to
         *reach*, so losing one is a mistake the player made rather than a
         race the numbers had already decided. */
      barW: U.clamp((0.300 - 0.195 * D) * L.rodBar * L.barSize, 0.055, 0.52),
      barSpeed: Math.max(fishSpeed * BAR_FLOOR, barTop * L.barMul), // track widths / second
      barTau: 0.170 / (1 + 0.60 * L.q),                            // seconds to reach it

      /* --- the fish --- */
      fishSpeed: fishSpeed,                             // top speed of the indicator
      fishStiff: stiff,                                 // how hard it drives at its target
      fishDrag: 1.10 * Math.sqrt(stiff),                // damped the same at every difficulty
      fishTurn: (1.05 - 0.77 * D) / surge,              // seconds between direction changes
      dart: U.clamp((0.10 + 0.45 * D) * surge, 0, 0.85),// chance a turn is a hard run
      evade: U.clamp((D - 0.55) / 0.45, 0, 1) * 0.40,   // only the rarest read the bar
      wobble: 0.020 + 0.040 * D,

      /* --- the progress bar --- */
      fill: (0.400 - 0.170 * D) / stam * L.fillMul,
      drain: 0.230 + 0.260 * D,
      start: 0.33
    };
  }

  VF.loot = {
    roll: roll,
    pickFish: pickFish,
    fightParams: fightParams,
    trialParams: trialParams,
    loadout: loadout,
    rarityPower: rarityPower,
    invalidatePool: function () { for (const k in poolCache) delete poolCache[k]; prefKey = ''; }
  };
})(window.VF = window.VF || {});
