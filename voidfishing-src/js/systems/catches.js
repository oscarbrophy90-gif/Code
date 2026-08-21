/* VOID FISHING — what happens after the fish is on the bank.
   Sell for money, keep for the collection, or release for reputation. */
(function (VF) {
  'use strict';

  const KEEP_LIMIT = 200;

  function last() { return VF.fishing.S.lastResult; }

  function sell() {
    const c = last();
    if (!c) return null;
    const d = VF.state.data;
    VF.economy.earn(c.value, 'catch');
    d.stats.sold++;
    VF.audio.sell();
    VF.bus.emit('catch:sold', c);
    VF.fishing.resolveCatch();
    VF.save.save();
    return c.value;
  }

  function keep() {
    const c = last();
    if (!c) return false;
    const d = VF.state.data;
    d.kept.push({
      id: c.id, kg: c.kg, m: c.m, pct: c.pct,
      mutation: c.mutation, value: c.value, at: c.at, location: c.location
    });
    if (d.kept.length > KEEP_LIMIT) d.kept.shift();
    VF.audio.click();
    VF.bus.emit('catch:kept', c);
    VF.fishing.resolveCatch();
    VF.save.save();
    return true;
  }

  /* Releasing trades money for reputation, which quietly raises luck.
     Occasionally the void says thank you. */
  function release() {
    const c = last();
    if (!c) return null;
    const d = VF.state.data;
    const rank = VF.rarities.rank(c.rarity);
    const rep = 1 + rank * 2;
    d.reputation += rep;
    d.stats.released++;
    VF.audio.release();

    let bonus = null;
    const roll = VF.rng.g();
    if (roll < 0.07) {
      // a handful of whatever bait the player can currently use
      const usable = VF.bait.list.filter(function (b) { return !b.unlimited && d.level >= b.level; });
      if (usable.length) {
        const b = usable[Math.min(usable.length - 1, VF.rng.g.int(Math.max(0, usable.length - 3), usable.length - 1))];
        const n = b.pack;
        VF.bait.add(b.id, n);
        bonus = { kind: 'bait', text: n + ' x ' + b.name };
      }
    } else if (roll < 0.13) {
      const amt = Math.round(c.value * VF.rng.g.range(0.25, 0.6));
      if (amt > 0) { VF.economy.earn(amt, 'gratitude'); bonus = { kind: 'money', amount: amt }; }
    }

    VF.bus.emit('catch:released', { catch: c, rep: rep, bonus: bonus });
    VF.fishing.resolveCatch();
    VF.save.save();
    return { rep: rep, bonus: bonus };
  }

  /* Selling from the Bag, after the fact. */
  function sellKept(index) {
    const d = VF.state.data;
    if (index < 0 || index >= d.kept.length) return 0;
    const k = d.kept.splice(index, 1)[0];
    VF.economy.earn(k.value, 'kept');
    d.stats.sold++;
    VF.audio.sell();
    VF.save.save();
    return k.value;
  }

  function sellAllKept() {
    const d = VF.state.data;
    let total = 0;
    for (let i = 0; i < d.kept.length; i++) total += d.kept[i].value;
    if (!total) return 0;
    d.stats.sold += d.kept.length;
    d.kept.length = 0;
    VF.economy.earn(total, 'kept');
    VF.audio.sell();
    VF.save.save();
    return total;
  }

  VF.catches = { sell: sell, keep: keep, release: release, sellKept: sellKept, sellAllKept: sellAllKept, KEEP_LIMIT: KEEP_LIMIT };
})(window.VF = window.VF || {});
