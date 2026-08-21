/* VOID FISHING — fishing spots.
   Colours are base tones; js/render/palette.js layers time-of-day and weather on top.
   horizon/silhouette pick which procedural backdrop the scene renderer draws. */
(function (VF) {
  'use strict';

  const LIST = [
    { id: 'shore', name: 'The Quiet Shore', level: 1,
      tag: 'where everyone starts',
      desc: 'A short stretch of pale stone at the edge of the water. Behind you there is nothing worth turning around for.',
      hint: 'Somewhere to sit.',
      rarityBoost: 1.00, valueBoost: 1.00, xpBoost: 1.0, biteBoost: 1.00,
      sky: ['#141c2a', '#243448'], water: ['#1b2836', '#080d14'], glow: '#7fa8c8',
      fog: '#2a3a4e', fogAmt: 0.30, stars: 0.55, starTint: '#dce8f5',
      horizon: 'moon', silhouette: 'rocks', depth: 0.42,
      weather: ['clear', 'overcast', 'rain', 'fog'],
      music: { root: 55, scale: [0, 3, 5, 7, 10], tempo: 0.16, pad: 0.5 } },

    { id: 'basin', name: 'Moonlit Basin', level: 5,
      tag: 'the water remembers a moon',
      desc: 'A wide still bowl of water beneath a moon that has never once moved. Its reflection is a half-second late.',
      hint: 'The light out there is coming from something.',
      rarityBoost: 1.14, valueBoost: 1.15, xpBoost: 1.9, biteBoost: 1.02,
      sky: ['#0f1830', '#2b3c66'], water: ['#1a2a48', '#060a16'], glow: '#b8cfff',
      fog: '#33456e', fogAmt: 0.34, stars: 0.75, starTint: '#e6efff',
      horizon: 'moon', silhouette: 'trees', depth: 0.44,
      weather: ['clear', 'overcast', 'rain', 'fog', 'meteor'],
      music: { root: 53, scale: [0, 2, 3, 7, 9], tempo: 0.14, pad: 0.6 } },

    { id: 'flats', name: 'The Glass Flats', level: 10,
      tag: 'perfectly, unnervingly flat',
      desc: 'Water without a single ripple, stretching further than it should. Everything above is doubled below.',
      hint: 'Reported to be extremely flat.',
      rarityBoost: 1.30, valueBoost: 1.35, xpBoost: 3.4, biteBoost: 0.96,
      sky: ['#101a24', '#3a5a68'], water: ['#22414c', '#08151c'], glow: '#9fe8e0',
      fog: '#2e4e58', fogAmt: 0.22, stars: 0.9, starTint: '#dffaff',
      horizon: 'arch', silhouette: 'spires', depth: 0.38,
      weather: ['clear', 'fog', 'aurora', 'meteor', 'overcast'],
      music: { root: 57, scale: [0, 2, 4, 7, 11], tempo: 0.12, pad: 0.7 } },

    { id: 'trench', name: 'Deepwater Trench', level: 16,
      tag: 'no measured bottom',
      desc: 'A seam in the water where the dark starts immediately. The line goes out and keeps going.',
      hint: 'Something opened, further out.',
      rarityBoost: 1.55, valueBoost: 1.70, xpBoost: 6.2, biteBoost: 0.92,
      sky: ['#0a1018', '#1b2c3a'], water: ['#0e1d28', '#01040a'], glow: '#5fa8c0',
      fog: '#16303f', fogAmt: 0.48, stars: 0.5, starTint: '#b8d8e8',
      horizon: 'monolith', silhouette: 'rocks', depth: 0.52,
      weather: ['overcast', 'rain', 'storm', 'fog', 'eclipse'],
      music: { root: 48, scale: [0, 1, 5, 7, 8], tempo: 0.10, pad: 0.8 } },

    { id: 'abyss', name: 'Crystal Abyss', level: 24,
      tag: 'it grows down there',
      desc: 'Enormous slow-growing structures rise out of the deep and stop just below the surface. They are warm.',
      hint: 'A light under the water, and it has edges.',
      rarityBoost: 1.90, valueBoost: 2.30, xpBoost: 11.0, biteBoost: 0.94,
      sky: ['#120c22', '#2e2050'], water: ['#1d1440', '#050318'], glow: '#c8a0ff',
      fog: '#2c1f52', fogAmt: 0.40, stars: 0.85, starTint: '#efe0ff',
      horizon: 'crystal', silhouette: 'crystals', depth: 0.48,
      weather: ['clear', 'fog', 'aurora', 'eclipse', 'meteor'],
      music: { root: 50, scale: [0, 3, 5, 6, 10], tempo: 0.11, pad: 0.85 } },

    { id: 'cradle', name: 'The Cradle', level: 33,
      tag: 'a broken ring, and a sea inside it',
      desc: 'The remains of something vast and circular hang overhead. Water pools in the wreck of it. You fish in the pool.',
      hint: 'There is a ring up there. Most of one.',
      rarityBoost: 2.35, valueBoost: 2.50, xpBoost: 20.0, biteBoost: 0.98,
      sky: ['#0d1226', '#3a3060'], water: ['#1a2050', '#04061a'], glow: '#ffd08a',
      fog: '#2a2c5e', fogAmt: 0.32, stars: 1.0, starTint: '#fff2d8',
      horizon: 'ring', silhouette: 'ruins', depth: 0.40,
      weather: ['clear', 'aurora', 'meteor', 'eclipse', 'storm'],
      music: { root: 52, scale: [0, 2, 5, 7, 9], tempo: 0.13, pad: 0.75 } },

    { id: 'nowhere', name: 'The Nowhere Sea', level: 45,
      tag: 'no coordinates were recorded',
      desc: 'You arrived here. You cannot describe the journey. The water is fine and the fishing is excellent.',
      hint: 'The charts stop. The water does not.',
      rarityBoost: 3.10, valueBoost: 3.40, xpBoost: 36.0, biteBoost: 0.90,
      sky: ['#08060f', '#1a1030'], water: ['#100a24', '#020106'], glow: '#9f7fff',
      fog: '#1c1236', fogAmt: 0.55, stars: 0.68, starTint: '#d8c8ff',
      horizon: 'tear', silhouette: 'bones', depth: 0.55,
      weather: ['fog', 'eclipse', 'voidsurge', 'storm', 'aurora'],
      music: { root: 46, scale: [0, 1, 3, 7, 8], tempo: 0.08, pad: 0.95 } },

    { id: 'beneath', name: 'BENEATH', level: 58,
      tag: 'you are the one being fished',
      desc: 'There is no shore. There is no surface. There is a place to sit and a line going down and something on the other end of it that has been waiting.',
      hint: 'Below the Nowhere Sea there is one more thing.',
      rarityBoost: 4.60, valueBoost: 4.50, xpBoost: 65.0, biteBoost: 0.86,
      sky: ['#020104', '#0e0620'], water: ['#080418', '#000000'], glow: '#b48aff',
      fog: '#140a28', fogAmt: 0.68, stars: 0.35, starTint: '#c8a8ff',
      horizon: 'eye', silhouette: 'none', depth: 0.60,
      weather: ['voidsurge', 'eclipse', 'fog'],
      music: { root: 43, scale: [0, 1, 4, 6, 7], tempo: 0.06, pad: 1.0 } }
  ];

  const BY_ID = VF.util.byId(LIST);

  function isUnlocked(id) { return VF.state.data.unlockedLocations.indexOf(id) >= 0; }
  function current() { return BY_ID[VF.state.data.location] || LIST[0]; }

  /* Locations the player has heard of: unlocked, plus the next one as a teaser. */
  function visible() {
    const out = [];
    for (let i = 0; i < LIST.length; i++) {
      const l = LIST[i];
      if (isUnlocked(l.id)) { out.push({ loc: l, known: true }); }
      else { out.push({ loc: l, known: false }); if (out.length && !isUnlocked(l.id)) break; }
    }
    return out;
  }

  /* Secret spots are appended once discovered, so everything that walks the
     location list — pools, the map, the palette — sees them automatically. */
  function register(loc) {
    if (BY_ID[loc.id]) return false;
    BY_ID[loc.id] = loc;
    LIST.push(loc);
    if (VF.loot) VF.loot.invalidatePool();
    return true;
  }

  VF.locations = {
    list: LIST,
    register: register,
    isRegistered: function (id) { return !!BY_ID[id]; },
    get: function (id) { return BY_ID[id] || LIST[0]; },
    isUnlocked: isUnlocked,
    current: current,
    visible: visible,
    index: function (id) { for (let i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i; return 0; }
  };
})(window.VF = window.VF || {});
