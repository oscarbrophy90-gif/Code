/* VOID FISHING — things on the hook that are not fish.
   Most sell. A few are keys to something else, and those are the point. */
(function (VF) {
  'use strict';

  const LIST = [
    /* Ordinary salvage belongs to a stretch of water rather than to all of it.
       `minLoc` is where it starts turning up and `maxLoc` is where it stops:
       without the second one, a handful of shore coins kept coming up at the
       bottom of the map, and every spot pulled the same junk as every other. */
    { id: 'coins', name: 'Handful Of Coins', rarity: 'common', maxLoc: 2, weight: 100, value: [40, 260],
      icon: 'coin', color: '#d8b45c',
      desc: 'Currency from somewhere with a mint and an opinion about kings.' },

    { id: 'bottle', name: 'Sealed Bottle', rarity: 'common', maxLoc: 3, weight: 74, value: [60, 340],
      icon: 'bottle', color: '#8fc0b0', journal: 'bottle',
      desc: 'Still corked. There is paper inside and it is still dry.' },

    { id: 'shell', name: 'Spiral Shell', rarity: 'common', maxLoc: 2, weight: 82, value: [30, 200],
      icon: 'shell', color: '#e0cba8',
      desc: 'Hold it to your ear and you hear a room, not a sea.' },

    { id: 'hookbox', name: 'Tin Of Old Hooks', rarity: 'common', maxLoc: 3, weight: 60, value: [80, 420],
      icon: 'box', color: '#a89880',
      desc: 'Somebody else lost all of these. Now you have them.' },

    { id: 'jewel', name: 'Salt-Worn Jewellery', rarity: 'uncommon', minLoc: 1, maxLoc: 4, weight: 34, value: [900, 5200],
      icon: 'ring', color: '#ffd88a',
      desc: 'Gold does not corrode, which is how it outlasted whoever wore it.' },

    { id: 'fossil', name: 'Fossil', rarity: 'uncommon', minLoc: 2, maxLoc: 5, weight: 30, value: [1200, 7000],
      icon: 'fossil', color: '#c8b490', journal: 'fossil',
      desc: 'Pressed flat by an amount of time that is difficult to hold in mind.' },

    { id: 'crystal', name: 'Growing Crystal', rarity: 'rare', maxLoc: 6, weight: 16, value: [6000, 34000],
      icon: 'crystal', color: '#a8d8ff', minLoc: 3,
      desc: 'It is very slightly larger than when you pulled it out.' },

    { id: 'key', name: 'Brass Key', rarity: 'rare', maxLoc: 4, weight: 9, value: [0, 0], token: 1,
      icon: 'key', color: '#e0b060', journal: 'key',
      desc: 'Fits nothing you own. The shopkeeper will know what to do with it.' },

    { id: 'plate', name: 'Engraved Plate', rarity: 'rare', maxLoc: 6, weight: 12, value: [4000, 22000],
      icon: 'plate', color: '#b0c0d0', journal: 'plate', minLoc: 2,
      desc: 'A list of names, then a date, then a much later date.' },

    { id: 'lens', name: 'Clouded Lens', rarity: 'epic', weight: 5, value: [30000, 140000],
      icon: 'lens', color: '#c8b8ff', minLoc: 4, journal: 'lens',
      desc: 'Look through it at the water and the water is not where you left it.' },

    { id: 'chart', name: 'Ruined Chart', rarity: 'epic', maxLoc: 5, weight: 4.5, value: [18000, 90000],
      icon: 'chart', color: '#d8c8a0', minLoc: 2, journal: 'chart', hint: 1,
      desc: 'Most of it has dissolved. One marked position survived.' },

    /* ------------------------------------------------ what a place leaves
       One object per water, found there and nowhere else. A spot is its fish
       and its weather and its light, and now it is also the one thing that
       only it gives up. */
    { id: 'sig_shore', name: 'Somebody Else\'s Float', rarity: 'common', locs: ['shore'],
      weight: 46, value: [120, 700], icon: 'bottle', color: '#c8804a',
      desc: 'Cork, painted red once. The line above it was cut, not snapped — whoever owned it decided to stop.' },

    { id: 'sig_basin', name: 'Moon-Struck Stone', rarity: 'uncommon', locs: ['basin'],
      weight: 30, value: [1400, 6800], icon: 'shard', color: '#cdd8f0',
      desc: 'Warm on the side that was facing up. It has been down there long enough that this should not be true.' },

    { id: 'sig_flats', name: 'Pane Of Still Water', rarity: 'rare', locs: ['flats'],
      weight: 14, value: [9000, 42000], icon: 'lens', color: '#bfe4e0',
      desc: 'A sheet of the flats, lifted out intact. It has not stopped being flat and it has not started being wet.' },

    { id: 'sig_trench', name: 'The Cut Sounding Line', rarity: 'rare', locs: ['trench'],
      weight: 12, value: [11000, 52000], icon: 'box', color: '#8a97a8',
      desc: 'A lead weight and four hundred fathoms of cord, cut clean at the far end. Somebody stopped measuring on purpose.' },

    { id: 'sig_abyss', name: 'Grown-Over Lamp', rarity: 'epic', locs: ['abyss'],
      weight: 5.5, value: [70000, 300000], icon: 'crystal', color: '#9fd0ff',
      desc: 'The crystal has closed around a lamp and kept its shape. The lamp is still lit, in there, at whatever rate the crystal allows.' },

    { id: 'sig_cradle', name: 'A Piece Of The Ring', rarity: 'epic', locs: ['cradle'],
      weight: 4.2, value: [110000, 480000], icon: 'plate', color: '#d8c2f0',
      desc: 'Curved, and the curve does not stop. Laid on a table it insists on being part of something ninety miles across.' },

    { id: 'sig_nowhere', name: 'A Log With No Positions', rarity: 'legendary', locs: ['nowhere'],
      weight: 1.3, value: [900000, 4200000], icon: 'chart', color: '#b8a8e8', journal: 'nolog',
      desc: 'Every entry has a date, a depth and a catch. Not one of them has a position. The hand is steady the whole way through.' },

    { id: 'sig_beneath', name: 'The Other Hook', rarity: 'mythic', locs: ['beneath'],
      weight: 0.42, value: [6000000, 26000000], icon: 'key', color: '#c9a8ff', journal: 'otherhook',
      desc: 'The same shape as yours and a great deal larger. The barb has been used and the shank has been worn smooth by something holding it.' },

    { id: 'voidfrag', name: 'Void Fragment', rarity: 'legendary', weight: 1.1, value: [0, 0],
      icon: 'shard', color: '#a86bff', minLoc: 5, relic: 'voidfrag', journal: 'voidfrag',
      desc: 'A piece of the place where the water stops being water.' },

    { id: 'relic_lantern', name: "A Drifter's Lantern", rarity: 'legendary', weight: 0.9, value: [0, 0],
      icon: 'lantern', color: '#ffd08a', minLoc: 3, relic: 'lantern', journal: 'lantern',
      desc: 'Still lit. Whoever was carrying it is not on the end of the line.' },

    { id: 'relic_ring', name: 'Ring Of Hooks', rarity: 'legendary', weight: 0.9, value: [0, 0],
      icon: 'ring', color: '#c0c8d0', minLoc: 2, relic: 'hookring',
      desc: 'Twelve hooks welded into a circle. All of them have been used.' },

    { id: 'relic_fossil', name: 'Fossil Heart', rarity: 'legendary', weight: 0.7, value: [0, 0],
      icon: 'fossil', color: '#e08a6a', minLoc: 4, relic: 'fossil', journal: 'fossilheart',
      desc: 'Still faintly warm. It has been down there a very long time.' },

    { id: 'relic_coin', name: 'Tideworn Coin', rarity: 'legendary', weight: 1.4, value: [0, 0],
      icon: 'coin', color: '#ffd07a', relic: 'coin',
      desc: 'Currency of somewhere that no longer takes payment.' },

    { id: 'rod_pyrewing', name: 'A Bundle Wrapped In Cloth', rarity: 'mythic', weight: 0.30, value: [0, 0],
      icon: 'strange', color: '#ff3a2a', minLoc: 5, rod: 'pyrewing',
      desc: 'Heavy, and warm through the cloth. The cloth is not burnt and has never been burnt.' },

    { id: 'rod_longfeather', name: 'Something Long, Wrapped', rarity: 'mythic', weight: 0.22, value: [0, 0],
      icon: 'strange', color: '#d88aff', minLoc: 6, rod: 'longfeather',
      desc: 'Longer than the boat. Whatever moulted it was going somewhere and did not come back for it.' },

    { id: 'relic_eye', name: 'The Unknown Eye', rarity: 'mythic', weight: 0.16, value: [0, 0],
      icon: 'eye', color: '#e8d0ff', minLoc: 6, relic: 'eye', journal: 'eye',
      desc: 'It is open. It was open when you found it.' },

    { id: 'strange', name: 'Something Unidentifiable', rarity: 'mythic', weight: 0.4, value: [200000, 900000],
      icon: 'strange', color: '#ff8fd0', minLoc: 5, journal: 'strange',
      desc: 'The archivist will want to see this. You are not sure you want her to.' },

  ];

  const BY_ID = VF.util.byId(LIST);

  /* Base odds that a cast brings up an object instead of a fish. */
  const BASE_CHANCE = 0.035;

  function chance() {
    const build = VF.build ? VF.build.stats() : null;
    const cond = VF.conditions ? VF.conditions.mods() : null;
    const k = (build ? build.treasure : 1) * (cond ? cond.treasure : 1);
    return VF.util.clamp(BASE_CHANCE * k, 0, 0.45);
  }

  /* Weighted draw, with relics excluded once you already own them. */
  function roll() {
    const li = VF.locations.index(VF.state.data.location);
    const here = VF.state.data.location;
    const pool = LIST.filter(function (t) {
      // an object that belongs to one water comes from that water only
      if (t.locs && t.locs.indexOf(here) < 0) return false;
      if (t.minLoc && li < t.minLoc) return false;
      if (t.maxLoc !== undefined && li > t.maxLoc) return false;
      if (t.relic && VF.charms.owned(t.relic)) return false;
      if (t.rod && VF.rods.owned(t.rod)) return false;
      if (t.rodGift && VF.rods.owned(t.rodGift)) return false;
      return true;
    });
    if (!pool.length) return null;
    const build = VF.build ? VF.build.stats() : null;
    // gear nudges the tier, it does not decide it — a relic stays a rare day
    const lux = VF.util.clamp(1 + (build ? (build.rare - 1) * 0.10 + (build.luck || 0) * 0.06 : 0), 1, 4);
    return VF.rng.weighted(pool, function (t) {
      const rank = VF.rarities.rank(t.rarity);
      return t.weight * Math.pow(lux, rank * 0.30);
    }, VF.rng.g);
  }

  /* What can come up in one water. Same test the roll uses, so the index
     cannot advertise something the hook will never find. */
  function nativeTo(locId) {
    const li = VF.locations.index(locId);
    return LIST.filter(function (t) {
      if (t.locs && t.locs.indexOf(locId) < 0) return false;
      if (t.minLoc && li < t.minLoc) return false;
      if (t.maxLoc !== undefined && li > t.maxLoc) return false;
      return true;
    });
  }

  VF.treasureData = {
    nativeTo: nativeTo,
    list: LIST,
    get: function (id) { return BY_ID[id] || null; },
    chance: chance, roll: roll, BASE_CHANCE: BASE_CHANCE
  };
})(window.VF = window.VF || {});
