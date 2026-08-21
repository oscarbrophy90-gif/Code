/* VOID FISHING — buying and opening a case.
   The roll is decided up front and the animation is then arranged around it,
   which is the only honest way to build one of these. */
(function (VF) {
  'use strict';

  function canBuy(caseId) {
    const c = VF.cases.get(caseId);
    const d = VF.state.data;
    if (!c) return { ok: false, why: 'missing' };
    if (d.level < c.level) return { ok: false, why: 'level' };
    if (d.caseTokens > 0) return { ok: true, free: true };
    if (!VF.economy.canAfford(c.cost)) return { ok: false, why: 'money' };
    return { ok: true };
  }

  /* Returns everything the animation needs: the strip, where the winner sits,
     and whether it was already owned. */
  function buy(caseId) {
    const c = VF.cases.get(caseId);
    const d = VF.state.data;
    const check = canBuy(caseId);
    if (!check.ok) return null;

    if (check.free) d.caseTokens--;
    else if (!VF.economy.spend(c.cost, 'case')) return null;

    const result = VF.cases.rollFrom(c, VF.rng.g);
    const strip = VF.cases.buildStrip(c, result, VF.rng.g);
    const dupe = VF.cosmetics.owned(result.item.id);
    // duplicates are refunded, so a case is never simply wasted
    const refund = dupe ? Math.round(c.cost * refundRate(result.rarity)) : 0;

    d.cases[caseId] = (d.cases[caseId] | 0) + 1;
    d.stats.casesOpened++;
    if (!dupe) VF.cosmetics.grant(result.item.id);
    if (refund) VF.economy.earn(refund, 'duplicate');

    VF.save.save();
    return {
      caseDef: c, item: result.item, rarity: result.rarity,
      strip: strip.strip, winIndex: strip.winIndex,
      duplicate: dupe, refund: refund
    };
  }

  function refundRate(rarity) {
    return { common: 0.30, uncommon: 0.40, rare: 0.55, epic: 0.75,
             legendary: 1.10, mythic: 1.80 }[rarity] || 0.3;
  }

  VF.caseOpen = { buy: buy, canBuy: canBuy, refundRate: refundRate };
})(window.VF = window.VF || {});
