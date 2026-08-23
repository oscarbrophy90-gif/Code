/* VOID FISHING — rods.
   cast   0..1 relative cast distance (drives how far out the bobber lands)
   reel   reel force — steadies the white bar, sharpens how fast it answers the
          key, and fills the catch meter quicker
   line   line strength — how wide the white bar is in the catch minigame
   rare   multiplier on high-rarity draw weights
   luck   drives mutation chance and size rolls
   Every rod is a visible upgrade: the on-screen rod changes shape and colour. */
(function (VF) {
  'use strict';

  const LIST = [
    { id: 'wood', name: 'Old Wooden Rod', cost: 0, level: 1,
      cast: 0.22, reel: 0.40, line: 1.00, rare: 1.00, luck: 0.00,
      desc: 'Somebody left it at the shore a long time ago. It still works, mostly.',
      art: { c1: '#7a5c3a', c2: '#4a3722', grip: '#3b2a18', tip: '#c8a878', len: 0.78, curve: 0.10, glow: 0, style: 'plain' } },

    { id: 'fiber', name: 'Fiberglass Rod', cost: 250, level: 2,
      cast: 0.34, reel: 0.52, line: 1.25, rare: 1.10, luck: 0.06,
      desc: 'Flexible, forgiving, and utterly without character. A genuine improvement.',
      art: { c1: '#3f4d58', c2: '#232c34', grip: '#1c2228', tip: '#8fa4b2', len: 0.86, curve: 0.13, glow: 0, style: 'plain' } },

    { id: 'carbon', name: 'Carbon Rod', cost: 1100, level: 5,
      cast: 0.45, reel: 0.66, line: 1.55, rare: 1.26, luck: 0.14,
      desc: 'Light enough to forget you are holding it. Stiff enough to argue with a pike.',
      art: { c1: '#2b2f36', c2: '#131519', grip: '#0e1013', tip: '#6f7a86', len: 0.92, curve: 0.11, glow: 0.05, style: 'wrap' } },

    { id: 'composite', name: 'Reinforced Composite', cost: 4500, level: 9,
      cast: 0.55, reel: 0.80, line: 1.95, rare: 1.45, luck: 0.24,
      desc: 'Braided with wire recovered from something that sank a very long way down.',
      art: { c1: '#4a4038', c2: '#241f1a', grip: '#3a2f22', tip: '#c0a070', len: 0.98, curve: 0.10, glow: 0.08, style: 'wrap' } },

    { id: 'deepwater', name: 'Deepwater Rod', cost: 16000, level: 14,
      cast: 0.66, reel: 0.96, line: 2.45, rare: 1.70, luck: 0.36,
      desc: 'Rated to depths the trench does not admit to having. The guides are ceramic.',
      art: { c1: '#1f3b48', c2: '#0c1c24', grip: '#0a1418', tip: '#5fc0d8', len: 1.04, curve: 0.09, glow: 0.18, style: 'runic' } },

    { id: 'abyss', name: 'Abyss Rod', cost: 62000, level: 20,
      cast: 0.76, reel: 1.14, line: 3.10, rare: 2.05, luck: 0.52,
      desc: 'Cold at both ends. The line pays out on its own if you leave it alone too long.',
      art: { c1: '#20182e', c2: '#0b0814', grip: '#100c1a', tip: '#8f6fd8', len: 1.10, curve: 0.08, glow: 0.30, style: 'runic' } },

    { id: 'lunar', name: 'Lunar Rod', cost: 240000, level: 27,
      cast: 0.86, reel: 1.34, line: 3.90, rare: 2.50, luck: 0.72,
      desc: 'Carved from something that used to orbit. Faintly bright on its own account.',
      art: { c1: '#cfd2c4', c2: '#8a8d80', grip: '#5e6157', tip: '#ffffff', len: 1.16, curve: 0.07, glow: 0.45, style: 'lunar' } },

    { id: 'celestial', name: 'Celestial Rod', cost: 950000, level: 35,
      cast: 0.94, reel: 1.58, line: 4.90, rare: 3.05, luck: 0.96,
      desc: 'The guides hold small stationary stars. They do not appear to be decorative.',
      art: { c1: '#2c3a72', c2: '#111637', grip: '#0d1128', tip: '#a8c8ff', len: 1.22, curve: 0.06, glow: 0.62, style: 'celestial' } },

    { id: 'aether', name: 'Aetherglass Rod', cost: 3800000, level: 43,
      cast: 1.02, reel: 1.86, line: 6.10, rare: 3.70, luck: 1.26,
      desc: 'Visible only when it is under load. Otherwise you are holding a suggestion.',
      art: { c1: '#bfe8f5', c2: '#6f9db0', grip: '#3f5f6e', tip: '#ffffff', len: 1.28, curve: 0.05, glow: 0.78, style: 'glass' } },

    { id: 'void', name: 'Void Rod', cost: 40000000, level: 52,
      cast: 1.12, reel: 2.20, line: 7.60, rare: 4.60, luck: 1.65,
      desc: 'It does not cast the line so much as agree with the line about where it should be.',
      art: { c1: '#160e28', c2: '#04030a', grip: '#0a0714', tip: '#b48aff', len: 1.34, curve: 0.04, glow: 0.92, style: 'void', apex: true } },

    { id: 'singularity', name: 'Singularity Rod', cost: 300000000, level: 62,
      cast: 1.24, reel: 2.62, line: 9.40, rare: 5.80, luck: 2.15,
      desc: 'Fishes a small radius of collapsed space. Reel speed is technically negative and it works anyway.',
      art: { c1: '#0a0812', c2: '#000000', grip: '#0f0c18', tip: '#ff5fa2', len: 1.40, curve: 0.03, glow: 1.0, style: 'singularity', apex: true, reach: 0.4 } },

    /* ------------------------------------------------- the strange shelf
       Ten rods that are not a straight continuation of the ladder. They
       interleave with the tiers above and below them, so taking the long way
       round is a real alternative to saving up — and six of them are never
       for sale at any price: somebody hands them over, or the water does. */

    { id: 'frostpoint', name: 'The Frozen Instant', cost: 520000, level: 31,
      requiresSecret: 'glass_shallows',
      cast: 0.90, reel: 1.46, line: 4.35, rare: 2.75, luck: 0.84,
      desc: 'A single moment of water, taken while it was freezing and never allowed to finish. ' +
            'The blade at the top is still growing, very slowly, in the direction of your hand.',
      art: { c1: '#7fd8f0', c2: '#2a6a8c', grip: '#1a3f56', tip: '#eaffff',
             len: 1.19, curve: 0.065, glow: 0.75, style: 'glacier', reach: 0.30 } },

    { id: 'shatterhour', name: 'The Shattered Hour', cost: 1900000, level: 39,
      requiresTreasure: 'crystal',
      cast: 0.98, reel: 1.71, line: 5.45, rare: 3.35, luck: 1.10,
      desc: 'It broke a long time ago and the pieces have not agreed to fall yet. ' +
            'They orbit the break at the speed of an hour going past.',
      art: { c1: '#9a8cf0', c2: '#2e2450', grip: '#1a1430', tip: '#e8d8ff',
             len: 1.25, curve: 0.055, glow: 0.85, style: 'shatter', reach: 0.30 } },

    { id: 'redthread', name: 'Red Thread', cost: 0, level: 45, noShop: true,
      notForSale: 'Not for sale. The old fisherman is still using it.',
      cast: 1.04, reel: 1.94, line: 6.50, rare: 3.90, luck: 1.35,
      desc: 'The old fisherman bound this himself, one turn of cord at a time, for sixty years. ' +
            'The cord is not cord. He knows that. He kept binding.',
      art: { c1: '#2a2f44', c2: '#12141f', grip: '#3a1418', tip: '#ff5a5a',
             len: 1.29, curve: 0.05, glow: 0.50, style: 'corded' } },

    { id: 'ninearms', name: 'Nine Arms', cost: 22000000, level: 50,
      requiresSpecies: 'nine_tide',
      cast: 1.09, reel: 2.10, line: 7.20, rare: 4.35, luck: 1.55,
      desc: 'Eight of them hold the blank. The ninth holds the line, and it is better at it than you are.',
      art: { c1: '#8e2f34', c2: '#3c1216', grip: '#2a0e12', tip: '#ff8a7a',
             len: 1.32, curve: 0.045, glow: 0.45, style: 'kraken' } },

    { id: 'pyrewing', name: 'Pyrewing', cost: 0, level: 55, noShop: true,
      notForSale: 'Not for sale. It came up on the line wrapped in cloth, and the cloth was not burnt.',
      cast: 1.15, reel: 2.30, line: 8.10, rare: 4.90, luck: 1.78,
      desc: 'The fire on it is not flame. It is feathered, it lies along the blank the way plumage does, ' +
            'and it does not consume the black underneath.',
      art: { c1: '#8a1420', c2: '#14060a', grip: '#2a0a0e', tip: '#ff3a2a',
             len: 1.36, curve: 0.04, glow: 0.88, style: 'pyre', apex: true } },

    { id: 'thunderstruck', name: 'Thunderstruck', cost: 180000000, level: 60,
      requiresSpecies: 'stormcaller',
      cast: 1.21, reel: 2.52, line: 8.95, rare: 5.50, luck: 2.02,
      desc: 'Struck once, all the way through, and the strike is still in there looking for the ground. ' +
            'It will not find it. You are holding the only way out.',
      art: { c1: '#4a3418', c2: '#0f0a06', grip: '#241708', tip: '#ffc23a',
             len: 1.39, curve: 0.035, glow: 1.0, style: 'thunder', apex: true } },

    { id: 'halflife', name: 'Halflife', cost: 0, level: 65, noShop: true,
      notForSale: 'Not for sale. The collector deals only in the useless, and this is not that.',
      cast: 1.28, reel: 2.72, line: 9.90, rare: 6.15, luck: 2.32,
      desc: 'The collector kept it behind the stall in a lead box and never once tried to sell it. ' +
            'It lights the inside of your hand from the wrong side.',
      art: { c1: '#12201a', c2: '#040806', grip: '#0a1410', tip: '#5cff8a',
             len: 1.42, curve: 0.03, glow: 1.0, style: 'neon', apex: true } },

    { id: 'seraph', name: 'Seraph', cost: 0, level: 71, noShop: true,
      requiresQuest: 'heavens',
      notForSale: 'Not for sale. The astronomer will not discuss it until the sky has been settled.',
      cast: 1.36, reel: 2.95, line: 11.2, rare: 6.95, luck: 2.65,
      desc: 'Rings of standing fire down the blank and a pair of wings opened at your hand. ' +
            'The astronomer had it the whole time and would not say so until you had proved the point.',
      art: { c1: '#f4ead0', c2: '#a88a48', grip: '#6a5424', tip: '#ffb14a',
             len: 1.45, curve: 0.025, glow: 1.0, style: 'seraph', apex: true } },

    { id: 'longfeather', name: 'The Long Feather', cost: 0, level: 77, noShop: true,
      notForSale: 'Not for sale. It is still in the water, and it is not the only one down there.',
      cast: 1.45, reel: 3.25, line: 13.2, rare: 8.20, luck: 3.15,
      desc: 'Moulted, not cut. Whatever dropped it was going somewhere and did not come back for it, ' +
            'and every colour is in the shaft rather than on it.',
      art: { c1: '#e8e2f4', c2: '#8a7aa8', grip: '#4a3f66', tip: '#d88aff',
             len: 1.49, curve: 0.02, glow: 0.95, style: 'plume', apex: true, reach: 1.0 } },

    { id: 'twinsun', name: 'Two Small Suns', cost: 0, level: 84, noShop: true,
      notForSale: 'Not for sale. The keeper has never once put it on a shelf.',
      cast: 1.58, reel: 3.70, line: 16.2, rare: 10.2, luck: 3.90,
      desc: 'One at the tip and one at your hand, and the dark between them is the rod. ' +
            'The keeper had it under the counter the entire time. He was waiting to see if you would come back.',
      art: { c1: '#1a1a20', c2: '#050506', grip: '#101014', tip: '#ffffff',
             len: 1.55, curve: 0.015, glow: 1.0, style: 'twinsun', apex: true } },

    /* ------------------------------------------------- the apex six
       Not a continuation of the shelf above, and not really of anything. Each
       one breaks the outline of a fishing rod somewhere — a head past the tip,
       rings standing off the blank, a chain going round it — because past a
       certain point one more brighter line does not mean anything to anybody.
       Five of them want something out of the water first. The sixth only ever
       wanted the money, and it has never once pretended otherwise. */

    { id: 'drownedcrown', name: 'The Drowned Crown', cost: 96000000, level: 58,
      requiresSecret: 'drowned_hall',
      cast: 1.18, reel: 2.41, line: 8.52, rare: 5.18, luck: 1.90,
      desc: 'Three points, and whatever the argument was it was settled a long way down and a long time ago. ' +
            'It was on the wall of the hall, above where the chair had been. Nobody has come up to ask for it back.',
      art: { c1: '#2e5a6e', c2: '#0c1e28', grip: '#0a161d', tip: '#8fe0f0',
             metal: '#cfe4ee', stone: '#5fd8ff',
             len: 1.33, curve: 0.045, glow: 0.90, style: 'trident', apex: true, reach: 1 } },

    { id: 'orrery', name: 'Something Is Keeping Time', cost: 620000000, level: 68,
      requiresTreasure: 'plate',
      cast: 1.31, reel: 2.81, line: 10.40, rare: 6.45, luck: 2.45,
      desc: 'Brass on three periods, and not one of them is a day. The wheel at your hand ticks rather than turns. ' +
            'The plate said what it was counting and the plate was wrong, or else the plate was early.',
      art: { c1: '#4a3a1e', c2: '#161009', grip: '#2a1f0e', tip: '#ffcf7a',
             metal: '#d8a44e', stone: '#ffd98a',
             len: 1.40, curve: 0.035, glow: 0.88, style: 'orrery', apex: true } },

    { id: 'chainrod', name: 'What The Chain Was For', cost: 3200000000, level: 75,
      requiresTreasure: 'relic_ring',
      cast: 1.42, reel: 3.17, line: 12.60, rare: 7.78, luck: 3.02,
      desc: 'Somebody wound sixty feet of chain down a fishing rod, and then went into the water to see whether it held. ' +
            'It held. The last link is not on the rod, and it has not been still since.',
      art: { c1: '#2b3742', c2: '#0a1016', grip: '#131a21', tip: '#5fe8c0',
             metal: '#7d8894', stone: '#5fe8c0',
             len: 1.44, curve: 0.028, glow: 0.90, style: 'leviathan', apex: true } },

    { id: 'ninenights', name: 'Nine Nights', cost: 5600000000, level: 81,
      requiresSecret: 'lantern_isle',
      cast: 1.51, reel: 3.46, line: 14.60, rare: 9.10, luck: 3.48,
      desc: 'The sky over the isle did this for nine nights running and then stopped, and one of the nine did not go back up. ' +
            'It hangs off the blank in curtains. It is cold to stand next to and it is worth standing next to.',
      art: { c1: '#16243a', c2: '#050a12', grip: '#0b121c', tip: '#8affd0',
             metal: '#9fd8e8', stone: '#8affd0',
             len: 1.51, curve: 0.020, glow: 1.0, style: 'aurora', apex: true } },

    { id: 'whitelight', name: 'White Light, Split', cost: 9000000000, level: 86,
      requiresTreasure: 'lens',
      cast: 1.66, reel: 3.95, line: 18.00, rare: 11.40, luck: 4.35,
      desc: 'One white line goes in at your hand and the whole of it comes back out sideways, sorted. ' +
            'The lens was the last piece of it. Nobody has been able to say where the white is arriving from.',
      art: { c1: '#e8f0f8', c2: '#8fa4b8', grip: '#3f4a58', tip: '#ffffff',
             metal: '#dce8f2', stone: '#ff5f9e',
             len: 1.56, curve: 0.015, glow: 1.0, style: 'prism', apex: true } },

    { id: 'gilded', name: 'Everything He Touched', cost: 15000000000, level: 96,
      cast: 1.84, reel: 4.40, line: 21.60, rare: 14.50, luck: 5.30,
      desc: 'Gold the whole way through and still setting, four hundred years after the hand that did it stopped being a hand. ' +
            'There is no thread to finish and nothing to find first. It costs what it costs. ' +
            'Nobody has ever argued it was worth that, and everybody who could has paid it.',
      art: { c1: '#c9922e', c2: '#4a3208', grip: '#5a4212', tip: '#ffe9a8',
             metal: '#e8b445', stone: '#ff4d6a',
             len: 1.60, curve: 0.012, glow: 1.0, style: 'gilded', apex: true } },

    { id: 'unknown', name: '??? Rod', cost: 2500000000, level: 74, requiresVoidCatch: true,
      cast: 1.40, reel: 3.10, line: 12.0, rare: 7.40, luck: 2.90,
      desc: 'It was already in your hands. Check the photographs. It was always in your hands.',
      art: { c1: '#ffffff', c2: '#1a1a1a', grip: '#2a2a2a', tip: '#66ffe0', len: 1.46, curve: 0.02, glow: 1.0, style: 'glitch', apex: true } },

    /* ------------------------------------------------- the end of the list
       Not for sale at any price and not on the ladder — which is why it sits
       here rather than in the middle of it. Eleven chapters, ending in a
       four-phase fight with a void-tier animal, and it comes out second only
       to the rod that asks for nothing but money. */

    { id: 'heavens', name: 'Heavens Rod', cost: 0, level: 88, quest: 'heavens',
      cast: 1.74, reel: 4.16, line: 19.60, rare: 12.20, luck: 4.78,
      secondChance: true,
      perk: 'Second chance: the first time a fish breaks the line or throws the hook, it does not.',
      desc: 'Made by somebody who could fish anywhere, and dropped from a height four hundred years ago. ' +
            'It is warm, and it has been waiting. Nothing gets away from it the first time — ' +
            'the line goes, and then it has not gone, and the fish is still on the end of it.',
      art: { c1: '#f6dc92', c2: '#8a6620', grip: '#5a4214', tip: '#fff6d0',
             metal: '#f0cf78', stone: '#fff0b8',
             len: 1.58, curve: 0.05, glow: 1.0, style: 'heavens', apex: true, reach: 0.55 } },

    /* ------------------------------------------------- and then this
       Not in the game. It is not sold, nobody carries it, no thread hands it
       over and no level reaches it — the shop skips it, the wanderer never
       stocks it, and `blocked` refuses it outright. It exists so the person
       who built the game can hold the thing, and the only way in is to ask
       for it from the console: VF.rods.admin() */

    { id: 'm_abyssal_dragon', name: 'Abyssal Dragon', admin: true, noShop: true,
      cost: 0, level: 0,
      cast: 9.99, reel: 9.99, line: 999, rare: 999, luck: 999,
      barSize: 4.31917, barSpeed: 0.10, barFill: 6.46471,
      /* The fight's own numbers floor out a long way short of this — bar
         movement is a reduction and cannot pass −100%, and the key sharpness
         comes off reel force through a term that goes negative. Every rod that
         can be bought states what the fight will actually do. This one is not
         a rod that can be bought. */
      barNote: 'white bar +999% · bar movement −999% · 999% sharper on the key · progress +999%',
      /* Rarity power alone cannot do this. Void's exponent is 3.40 against
         glitch's 2.80, so however far the multiplier is pushed the void tier
         outruns both of the ones above it — at x999 rare it was already 66%
         void against half a per cent glitch and a fortieth of a per cent of
         the tier above that. So the draw is leant on directly instead. */
      tierBoost: { glitch: 420, unknown: 7600 },
      perk: 'Admin. Every number on it is 999%, and it is not obtainable.',
      notForSale: 'Not for sale, not carried, not given. It is not in the game.',
      desc: 'An amethyst thing the length of the sky, wound down a rod somebody was rude enough to build. ' +
            'It has six wings, it has a head, and the head has an opinion about the water. ' +
            'Nothing in the record accounts for it because nothing in the record was asked.',
      art: { c1: '#7a3fd6', c2: '#1a0a34', grip: '#2a1148', tip: '#e0b0ff',
             metal: '#c89aff', stone: '#ff5fe0',
             len: 1.72, curve: 0.010, glow: 1.0, style: 'amethyst', apex: true, reach: 1.15 } }
  ];

  /* The shelf is a ladder: every rod on it beats the one below it at
     everything. The bar numbers were the exception — six rods carried them and
     the other twenty-three were a flat 1.00, so those six leapfrogged their
     neighbours and the curve had teeth in it. They come off ladder position
     now, which is the only way to keep it monotonic while rods are still being
     added to the middle. Trade-offs are the wanderer's business, not the
     shelf's; his stock states what it costs you and this does not have to. */
  (function fitLadder() {
    const shelf = LIST.filter(function (r) { return !r.admin; })
                      .sort(function (a, b) { return a.level - b.level; });
    const n = Math.max(1, shelf.length - 1);
    for (let i = 0; i <= n; i++) {
      const u = Math.pow(i / n, 0.95);
      shelf[i].barSize  = Math.round((1.00 + 0.34 * u) * 1000) / 1000;
      shelf[i].barSpeed = Math.round((1.00 - 0.15 * u) * 1000) / 1000;
      shelf[i].barFill  = Math.round((1.00 + 0.12 * u) * 1000) / 1000;
    }
  })();

  /* The order of this list is the order rods are shown in everywhere — the
     shop, the bag, the previews. Cheapest first, so the shelf reads like a
     shelf and the row below the one you have is the next thing to save for.

     Nine rods have no price: the one you start with, the ones that come out of
     the long threads, and the one that is not in the game. A rod without a
     price still has a place on the ladder, so it borrows one — what the shelf
     is charging at the level it arrives at. That keeps the wooden rod at the
     top where it belongs rather than down among the endgame with everything
     else that happens to be free. */
  function priceRungs() {
    /* The shelf's own prices, and only those. The wanderer's hundred rods are
       all level 0 — he does not care what level you are — so letting them into
       the curve puts a rod that unlocks at level 1 next to one that costs two
       million. They still sort by what he charges; they just do not get a vote
       on what a level is worth. */
    return LIST.filter(function (r) { return !r.admin && !r.merchant && r.cost > 0; })
               .map(function (r) { return { level: r.level, cost: r.cost }; })
               .sort(function (a, b) { return a.level - b.level; });
  }

  function priceKey(rod, rungs) {
    if (rod.admin) return Infinity;              // never sold, at any price
    if (rod.cost > 0) return rod.cost;
    if (!rungs.length) return rod.level;
    if (rod.level <= rungs[0].level) return rungs[0].cost * 0.5;
    for (let i = 1; i < rungs.length; i++) {
      if (rod.level <= rungs[i].level) {
        /* Between two priced rods, and the shelf's prices climb by multiples
           rather than by steps, so the walk between them is a log one. */
        const a = rungs[i - 1], b = rungs[i];
        const u = b.level === a.level ? 1 : (rod.level - a.level) / (b.level - a.level);
        return Math.exp(Math.log(a.cost) + (Math.log(b.cost) - Math.log(a.cost)) * u);
      }
    }
    return rungs[rungs.length - 1].cost * 1.5;
  }

  function sortByPrice() {
    const rungs = priceRungs();
    const keyed = LIST.map(function (r, i) {
      return { r: r, k: priceKey(r, rungs), i: i };
    });
    // ties keep the order they were written in
    keyed.sort(function (a, b) { return a.k - b.k || a.i - b.i; });
    LIST.length = 0;
    for (let i = 0; i < keyed.length; i++) LIST.push(keyed[i].r);
  }
  sortByPrice();

  let BY_ID = VF.util.byId(LIST);

  /* Every requirement a rod can carry, in one place, so the shop and the till
     never disagree about why something is out of reach. Returns null when the
     rod is available, or { why, note } when it is not. */
  function blocked(rod) {
    const d = VF.state.data;
    if (rod.admin) return { why: 'admin', note: 'Not in the game.' };
    if (d.level < rod.level) return { why: 'level', note: 'Requires level ' + rod.level };
    if (rod.requiresVoidCatch && d.stats.voidCatches < 1) {
      return { why: 'void', note: 'Requires a Void-tier catch' };
    }
    if (rod.requiresGlitchCatch && (d.stats.glitchCatches | 0) < 1) {
      return { why: 'glitch', note: 'Requires a !@#$%^&$# catch' };
    }
    if (rod.requiresUnknownCatch && (d.stats.unknownCatches | 0) < 1) {
      return { why: 'unknown', note: 'Requires something the record has no tier for' };
    }
    if (rod.requiresSecret && !VF.secrets.found(rod.requiresSecret)) {
      const s = VF.secrets.get(rod.requiresSecret);
      return { why: 'secret', note: s && !s.final ? 'Requires water that is not on the map'
                                                  : 'Requires what is under the last water' };
    }
    if (rod.requiresTreasure && !d.treasures[rod.requiresTreasure]) {
      const t = VF.treasureData.get(rod.requiresTreasure);
      return { why: 'treasure', note: 'Requires ' + (t ? t.name.toLowerCase() : 'something from the water') };
    }
    if (rod.requiresSpecies && !d.fishdex[rod.requiresSpecies]) {
      const f = VF.fish.byId(rod.requiresSpecies);
      return { why: 'species', note: 'Requires ' + (f ? f.name : 'a catch you have not made') +
                                     ' in the record' };
    }
    if (rod.requiresQuest && !VF.quests.complete(rod.requiresQuest)) {
      const q = VF.questData.get(rod.requiresQuest);
      return { why: 'quest', note: 'Requires ' + (q ? q.name.toLowerCase() : 'a thread') + ' finished' };
    }
    return null;
  }

  /* Owning a rod and being able to swing it are two different things. Only the
     one at the end of the long thread makes use of that: it can be earned a
     long way before the level it belongs at, and without this it would hand
     the player the second best rod in the game at level fifty and make the
     rest of the ladder pointless. */
  function canEquip(rod) {
    return !rod || VF.state.data.level >= (rod.level || 0);
  }

  /* Handed over rather than bought: an NPC gift, or something the water gave
     back. Equipping it immediately is the point of being given a rod — unless
     it is one you are not up to yet, in which case it waits in the bag. */
  function grant(id) {
    const rod = BY_ID[id];
    const d = VF.state.data;
    if (!rod || d.ownedRods.indexOf(id) >= 0) return false;
    d.ownedRods.push(id);
    if (canEquip(rod)) d.rod = id;
    VF.bus.emit('rod:granted', rod);
    VF.bus.emit('gear:changed');
    if (VF.save) VF.save.save();
    return true;
  }

  /* The console door. Nothing in the game calls this and nothing ever should:
     it is here so the game's owner can hold the admin rod. */
  function admin() {
    const rod = BY_ID.m_abyssal_dragon;
    if (!rod) return false;
    const d = VF.state.data;
    if (d.ownedRods.indexOf(rod.id) < 0) d.ownedRods.push(rod.id);
    d.rod = rod.id;
    VF.bus.emit('rod:granted', rod);
    VF.bus.emit('gear:changed');
    if (VF.save) VF.save.save();
    return rod.name;
  }

  VF.rods = {
    list: LIST,
    admin: admin,
    /* The wanderer's stock is appended to this list at load, so the index has
       to be rebuildable — everything that draws, prices, equips or compares a
       rod then handles those without knowing they came from anywhere else. */
    reindex: function () { sortByPrice(); BY_ID = VF.util.byId(LIST); },
    get: function (id) { return BY_ID[id] || BY_ID.wood; },
    index: function (id) { for (let i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i; return 0; },
    blocked: blocked,
    canEquip: canEquip,
    grant: grant,
    owned: function (id) { return VF.state.data.ownedRods.indexOf(id) >= 0; }
  };
})(window.VF = window.VF || {});
