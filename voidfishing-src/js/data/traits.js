/* VOID FISHING — traits.
   A catch can carry several at once. Most are rolled independently, so
   combinations fall out naturally and get rarer the more of them stack.
   `size` traits are not rolled at all — they are read off the size percentile,
   which is why a Massive fish is always genuinely one of the biggest. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const LIST = [
    { id: 'tiny', name: 'Tiny', tier: 1, mult: 5, weight: 0, size: 'small',
      color: '#9fd8e8', tint: '#d8f4ff', shrink: 0.72,
      desc: 'Small enough that landing it at all is the achievement.' },

    { id: 'glowing', name: 'Glowing', tier: 1, mult: 3, weight: 100,
      color: '#7ff0d0', tint: '#9ffbe2', glow: 0.55,
      desc: 'Lit from within by something that will not go out.' },

    { id: 'aggressive', name: 'Aggressive', tier: 2, mult: 2.5, weight: 55,
      color: '#ff8a5a', tint: '#ffc0a0',
      fight: { power: 1.42, surge: 1.65, stamina: 1.2 },
      desc: 'It came for the hook. It would have come for the boat.' },

    { id: 'shimmering', name: 'Shimmering', tier: 2, mult: 4, weight: 62,
      color: '#c8e8ff', tint: '#ffffff', shimmer: 1,
      desc: 'The colour will not hold still long enough to be written down.' },

    { id: 'massive', name: 'Massive', tier: 3, mult: 6, weight: 0, size: 'large',
      color: '#ffb03a', tint: '#ffdc9a', grow: 1.22,
      fight: { power: 1.25, stamina: 1.3 },
      desc: 'Records will be rewritten. Doorways will be a problem.' },

    { id: 'golden', name: 'Golden', tier: 3, mult: 8, weight: 30,
      color: '#ffc94a', tint: '#ffe9a8', metal: 1,
      desc: 'Scales of struck gold. Heavier than it has any business being.' },

    { id: 'crystal', name: 'Crystal', tier: 4, mult: 14, weight: 14,
      color: '#9fe6ff', tint: '#d6f6ff', facet: 1,
      desc: 'Rendered in slow glass. It rings when touched.' },

    { id: 'shadow', name: 'Shadow', tier: 5, mult: 22, weight: 6,
      color: '#5b4d78', tint: '#2a2140', darken: 0.8,
      desc: 'Casts no reflection. Your hands feel colder holding it.' },

    { id: 'ancient', name: 'Ancient', tier: 6, mult: 36, weight: 2.2,
      color: '#c98a54', tint: '#e8c79a', crust: 1,
      desc: 'Older than the water it swam in. Barnacled with dead stars.' },

    { id: 'voidtouched', name: 'Void-Touched', tier: 7, mult: 70, weight: 0.5,
      color: '#a86bff', tint: '#e0c6ff', glow: 0.7, fracture: 1,
      desc: 'Something reached out and marked it. It remembers being marked.' }
  ];

  const BY_ID = U.byId(LIST);
  const ROLLABLE = LIST.filter(function (t) { return t.weight > 0; });

  /* Tuned so roughly 2.5% of catches carry a trait with no luck at all, rising
     to about 16% fully kitted out — and multi-trait catches stay genuinely rare. */
  const BASE = 0.025 / ROLLABLE.reduce(function (a, t) { return a + t.weight; }, 0);
  const MAX_TRAITS = 4;
  /* Read against the raw uniform draw, so these mean exactly what they say:
     the top and bottom slivers of every roll, whatever the luck curve is doing. */
  const LARGE_AT = 0.985;
  const SMALL_AT = 0.012;

  /* Each trait is rolled on its own, so combinations are the product of their
     odds rather than a special case. */
  function roll(luck, u, rnd, boost) {
    const k = (1 + luck * 0.9) * (boost || 1);
    const out = [];
    for (let i = 0; i < ROLLABLE.length; i++) {
      const t = ROLLABLE[i];
      if (rnd() < BASE * t.weight * k) out.push(t.id);
    }
    if (u >= LARGE_AT) out.push('massive');
    else if (u <= SMALL_AT) out.push('tiny');

    if (out.length > MAX_TRAITS) {
      // keep the rarest, they are the ones worth having
      out.sort(function (a, b) { return BY_ID[b].tier - BY_ID[a].tier; });
      out.length = MAX_TRAITS;
    }
    return sort(out);
  }

  /* Lowest tier first, so a name reads "ancient golden massive moonfish". */
  function sort(ids) {
    return ids.slice().sort(function (a, b) {
      return (BY_ID[b] ? BY_ID[b].tier : 0) - (BY_ID[a] ? BY_ID[a].tier : 0);
    });
  }

  /* Stacking traits is worth more than the sum of its parts. */
  function multiplier(ids) {
    if (!ids || !ids.length) return 1;
    let m = 1;
    for (let i = 0; i < ids.length; i++) {
      const t = BY_ID[ids[i]];
      if (t) m *= t.mult;
    }
    return m * (1 + (ids.length - 1) * 0.6);
  }

  function prefix(ids) {
    if (!ids || !ids.length) return '';
    return ids.map(function (id) { return BY_ID[id] ? BY_ID[id].name : id; }).join(' ') + ' ';
  }

  /* Most species are a bare noun phrase and take the traits in front:
     Massive Golden Silver Pike. Some are not — the last tier is full of names
     that already start with a determiner or are not words at all, and
     "Massive Your Fishing Hook" is not a sentence. Those keep their own name;
     the trait chips under it are already saying which traits landed. */
  const DETERMINED = /^(a|an|the|your|my|somebody|last|four|zero|all|itself|you)\b/i;

  function title(ids, name) {
    if (!ids || !ids.length) return name;
    if (DETERMINED.test(name) || !/^[A-Za-z]/.test(name)) return name;
    return prefix(ids) + name;
  }

  /* The colour a combination reads as: the rarest trait, warmed by the rest. */
  function color(ids) {
    if (!ids || !ids.length) return null;
    let best = null;
    for (let i = 0; i < ids.length; i++) {
      const t = BY_ID[ids[i]];
      if (t && (!best || t.tier > best.tier)) best = t;
    }
    return best ? best.color : null;
  }

  /* Combined fight modifiers. */
  function fight(ids) {
    const out = { power: 1, surge: 1, stamina: 1 };
    if (!ids) return out;
    for (let i = 0; i < ids.length; i++) {
      const f = BY_ID[ids[i]] && BY_ID[ids[i]].fight;
      if (!f) continue;
      out.power *= f.power || 1;
      out.surge *= f.surge || 1;
      out.stamina *= f.stamina || 1;
    }
    return out;
  }

  /* How much the traits push the weight roll around. */
  function sizeScale(ids) {
    let s = 1;
    if (!ids) return s;
    for (let i = 0; i < ids.length; i++) {
      const t = BY_ID[ids[i]];
      if (!t) continue;
      if (t.grow) s *= t.grow;
      if (t.shrink) s *= t.shrink;
    }
    return s;
  }

  function get(id) { return BY_ID[id] || null; }
  function rarestTier(ids) {
    let r = 0;
    if (!ids) return r;
    for (let i = 0; i < ids.length; i++) {
      const t = BY_ID[ids[i]];
      if (t && t.tier > r) r = t.tier;
    }
    return r;
  }

  /* Combinations are scored so records can rank them against each other. */
  function comboScore(ids) {
    if (!ids || !ids.length) return 0;
    return Math.round(Math.log(multiplier(ids)) * 100 + ids.length * 40);
  }

  VF.traits = {
    list: LIST, rollable: ROLLABLE, get: get, roll: roll, sort: sort,
    multiplier: multiplier, prefix: prefix, title: title, color: color, fight: fight,
    sizeScale: sizeScale, rarestTier: rarestTier, comboScore: comboScore,
    MAX_TRAITS: MAX_TRAITS
  };

  /* Older saves stored a single mutation; the ids line up one to one. */
  VF.mutations = {
    list: LIST,
    get: get,
    roll: function (luck, rnd) {
      const ids = roll(luck, 0.5, rnd);
      return ids.length ? BY_ID[ids[0]] : null;
    }
  };
})(window.VF = window.VF || {});
