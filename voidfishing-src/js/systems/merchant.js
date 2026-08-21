/* VOID FISHING — the one who walks up the shore.

   He is not a shop. He is a person who turns up, stands next to you while you
   fish with a countdown over his head, and goes again whether or not you
   bought anything. What he is carrying is rolled fresh every visit out of a
   hundred rods that are on no shelf anywhere.

   Timing is wall-clock, not play-time, so the wait passes while the game is
   closed — coming back after an evening should mean he is due, not that the
   clock stood still. */
(function (VF) {
  'use strict';

  const AWAY = 30 * 60 * 1000;   // between visits
  const STAY = 30 * 60 * 1000;   // how long he stands there
  const STOCK = 20;              // rods he carries, out of the hundred

  /* Share of a single draw that goes to each tier. Divided by how many rods
     that tier holds, because the draw is per rod and the tiers are wildly
     different sizes — forty-five epics against two of the last kind. At these
     shares a void rod is in roughly a quarter of visits and one of the last
     two in about one in nine, which is the "sometimes". */
  const SHARE = { epic: 0.660, legendary: 0.245, mythic: 0.072, 'void': 0.017, glitch: 0.006 };
  const COUNT = Object.create(null);
  function weightOf(rod) {
    if (!COUNT[rod.rarity]) {
      COUNT[rod.rarity] = VF.merchantRods.list.filter(function (r) {
        return r.rarity === rod.rarity;
      }).length || 1;
    }
    return (SHARE[rod.rarity] || 0.001) / COUNT[rod.rarity];
  }

  function rec() {
    const d = VF.state.data;
    if (!d.merchant) d.merchant = { until: 0, next: 0, stock: [], sold: [], visits: 0 };
    const m = d.merchant;
    if (!Array.isArray(m.stock)) m.stock = [];
    if (!Array.isArray(m.sold)) m.sold = [];
    return m;
  }

  function here() { const m = rec(); return m.until > Date.now(); }
  function leavesIn() { return Math.max(0, rec().until - Date.now()); }
  function arrivesIn() { const m = rec(); return here() ? 0 : Math.max(0, m.next - Date.now()); }

  /* Twenty rods, no repeats, nothing already on the rack. */
  function rollStock() {
    const owned = VF.state.data.ownedRods;
    const pool = VF.merchantRods.list.filter(function (r) { return owned.indexOf(r.id) < 0; });
    const out = [];
    const taken = Object.create(null);
    let guard = 0;
    while (out.length < STOCK && guard++ < 900) {
      const left = pool.filter(function (r) { return !taken[r.id]; });
      if (!left.length) break;
      const pick = VF.rng.weighted(left, weightOf, VF.rng.g);
      if (!pick) break;
      taken[pick.id] = 1;
      out.push(pick.id);
    }
    // best first, so the row that matters is the one you see
    out.sort(function (a, b) {
      return VF.rarities.rank(VF.rods.get(b).rarity) - VF.rarities.rank(VF.rods.get(a).rarity) ||
             VF.rods.get(b).cost - VF.rods.get(a).cost;
    });
    return out;
  }

  function arrive() {
    const m = rec();
    m.stock = rollStock();
    m.sold = [];
    m.until = Date.now() + STAY;
    m.next = 0;
    m.visits++;
    VF.bus.emit('merchant:arrive', m);
    VF.save.save();
  }

  function leave() {
    const m = rec();
    if (!m.until) return;
    m.until = 0;
    m.stock = [];
    m.sold = [];
    m.next = Date.now() + AWAY;
    VF.bus.emit('merchant:leave', m);
    VF.save.save();
  }

  /* Rolled on a slow beat; nothing here needs to be frame-accurate. */
  let acc = 0;
  function tick(dt) {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    const m = rec();
    const now = Date.now();
    if (m.until) { if (now >= m.until) leave(); return; }
    if (!m.next) { m.next = now + AWAY; VF.save.save(); return; }
    // a save that sat closed for a week should not owe the player six visits
    if (now >= m.next) arrive();
  }

  function stock() {
    const m = rec();
    if (!here()) return [];
    return m.stock.map(function (id) { return VF.rods.get(id); })
                  .filter(function (r) { return r && r.merchant; });
  }
  function sold(id) { return rec().sold.indexOf(id) >= 0; }

  function buy(id) {
    const m = rec();
    if (!here() || m.stock.indexOf(id) < 0 || sold(id)) return false;
    const rod = VF.rods.get(id);
    if (!rod || !rod.merchant) return false;
    if (!VF.economy.spend(rod.cost, 'rod')) return false;
    const d = VF.state.data;
    if (d.ownedRods.indexOf(id) < 0) d.ownedRods.push(id);
    m.sold.push(id);
    VF.bus.emit('merchant:bought', rod);
    VF.bus.emit('rod:bought', rod);
    VF.save.save();
    return true;
  }

  /* Used by the settings panel's reset and by anything that wants him gone. */
  function reset() {
    const d = VF.state.data;
    d.merchant = { until: 0, next: Date.now() + AWAY, stock: [], sold: [], visits: 0 };
  }

  VF.merchant = {
    tick: tick, here: here, stock: stock, buy: buy, sold: sold,
    leavesIn: leavesIn, arrivesIn: arrivesIn, leave: leave, reset: reset,
    rec: rec, STAY: STAY, AWAY: AWAY, STOCK: STOCK,
    /* dev: bring him now */
    summon: function () { rec().next = Date.now() - 1; arrive(); }
  };
})(window.VF = window.VF || {});
