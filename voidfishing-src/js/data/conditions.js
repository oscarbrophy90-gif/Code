/* VOID FISHING — temporary conditions at a spot.
   Weather is the sky; a condition is what the water itself is doing. They come
   and go on their own, last a few minutes, and are always worth having. */
(function (VF) {
  'use strict';

  const LIST = [
    { id: 'migration', name: 'Migration', weight: 26, dur: [150, 320],
      blurb: 'a great many of one thing, all going the same way',
      mods: { bite: 0.62, rare: 0.94 }, shoal: 1,
      tint: '#7fd8c0' },

    { id: 'glowwater', name: 'Glowing Water', weight: 20, dur: [140, 280],
      blurb: 'the water has started making its own light',
      mods: { rare: 1.35, trait: 1.9 }, glow: 1,
      tint: '#6fe8c8' },

    { id: 'stillness', name: 'Dead Calm', weight: 18, dur: [110, 220],
      blurb: 'not one ripple. the fish are listening to something',
      mods: { bite: 1.35, rare: 1.6, encounter: 1.9 }, calm: 0.75,
      tint: '#8fa8d8' },

    { id: 'activity', name: 'Feeding Frenzy', weight: 22, dur: [90, 180],
      blurb: 'everything down there is eating at once',
      mods: { bite: 0.5, rare: 1.1, value: 0.9 }, splash: 1,
      tint: '#ffb87a' },

    { id: 'bloom', name: 'Drift Bloom', weight: 16, dur: [160, 300],
      blurb: 'soft things have risen from somewhere very deep',
      mods: { rare: 1.28, treasure: 1.9 }, motes: 1,
      tint: '#c8a8ff' },

    { id: 'runoff', name: 'Cold Runoff', weight: 15, dur: [120, 240],
      blurb: 'a colder current has arrived from further out',
      mods: { size: 1.3, bite: 1.15 },
      tint: '#8fc8e8' },

    { id: 'shoalfire', name: 'Shoalfire', weight: 9, dur: [90, 170],
      blurb: 'something burning is moving under the surface',
      mods: { rare: 1.75, trait: 1.4, bite: 1.1 }, ember: 1,
      tint: '#ff9a5a', minLoc: 3 },

    { id: 'thinplace', name: 'Thin Place', weight: 5, dur: [80, 150],
      blurb: 'the water is not entirely committed to being here',
      mods: { rare: 2.6, encounter: 2.4, secret: 2.2, 'void': 1.8 }, warp: 1,
      tint: '#a86bff', minLoc: 4 },

    { id: 'lowtide', name: 'Low Water', weight: 14, dur: [130, 260],
      blurb: 'the level has dropped and left things exposed',
      mods: { treasure: 3.0, secret: 1.8, rare: 0.9 },
      tint: '#c8b890' },

    /* Not in the rotation until the sky has been given a reason to answer.
       `test` is the gate; everything above it has none and is always eligible.
       Common while somebody is waiting on one, and an occasional event
       afterwards — the sky is not on a schedule, but it is not cruel either. */
    { id: 'skyfall', name: 'Skyfall',
      weight: function () { return VF.quests.at('heavens', 8) ? 150 : 26; },
      dur: [165, 280],
      blurb: 'things are coming down, and they are still lit when they land',
      // only bite, rare, treasure and secret are read off a condition — the
      // other NEUTRAL keys have no consumer, so listing them would be a lie
      mods: { rare: 1.85, bite: 0.78, treasure: 1.4, secret: 1.3 },
      skyfall: 1,
      tint: '#ffd88a', minLoc: 3,
      test: function () { return VF.quests && VF.quests.reached('heavens', 8); } }
  ];

  const BY_ID = VF.util.byId(LIST);

  VF.conditionData = {
    list: LIST,
    get: function (id) { return BY_ID[id] || null; }
  };
})(window.VF = window.VF || {});
