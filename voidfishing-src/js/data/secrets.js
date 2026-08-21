/* VOID FISHING — hidden water.
   Secret spots are never listed until found. Each has a condition the player
   has to be standing in, and none of them announce themselves in advance —
   the journal and the NPCs are the only places the hints live. */
(function (VF) {
  'use strict';

  /* `test(d)` decides whether a cast is even eligible; `chance` is then rolled
     per cast, so finding one is a moment rather than a checklist tick. */
  const LIST = [
    { id: 'lantern_isle', name: 'Lantern Isle', level: 0, chance: 0.09,
      loc: { id: 'lantern_isle', name: 'Lantern Isle', level: 0,
        tag: 'somebody left a light on',
        desc: 'A rock barely above the water with a lamp on it, still burning. Whoever lit it has not been back, and the fish here have got used to the light.',
        hint: 'a light out on the water',
        rarityBoost: 1.85, valueBoost: 1.60, xpBoost: 5.0, biteBoost: 0.90,
        sky: ['#0d1626', '#2a3a58'], water: ['#17263c', '#050a14'], glow: '#ffd08a',
        fog: '#2a3a56', fogAmt: 0.36, stars: 0.8, starTint: '#ffeecc',
        horizon: 'moon', silhouette: 'spires', depth: 0.44,
        weather: ['clear', 'fog', 'rain', 'overcast'],
        music: { root: 55, scale: [0, 2, 5, 7, 9], tempo: 0.15, pad: 0.62 } },
      found: 'a lamp burning on a rock that is not on any chart.',
      test: function (d) {
        return VF.weather.id() === 'fog' && VF.locations.index(d.location) >= 1;
      } },

    { id: 'sunken_arch', name: 'The Sunken Arch', level: 0, chance: 0.075,
      loc: { id: 'sunken_arch', name: 'The Sunken Arch', level: 0,
        tag: 'a doorway, underwater, to nowhere',
        desc: 'The top of an arch breaks the surface. The rest of it goes down further than the light does, and there is a room on the other side.',
        hint: 'something built, under the water',
        rarityBoost: 2.40, valueBoost: 2.05, xpBoost: 14.0, biteBoost: 0.93,
        sky: ['#0a0f1c', '#1e2a44'], water: ['#12203a', '#03060f'], glow: '#8fc8d8',
        fog: '#1c2a48', fogAmt: 0.44, stars: 0.65, starTint: '#d0e8f0',
        horizon: 'arch', silhouette: 'ruins', depth: 0.50,
        weather: ['fog', 'overcast', 'storm', 'eclipse'],
        music: { root: 50, scale: [0, 1, 5, 7, 10], tempo: 0.09, pad: 0.85 } },
      found: 'the top of an arch, breaking the surface where the chart says there is nothing.',
      test: function (d) {
        return VF.journal.has('chart') && VF.locations.index(d.location) >= 3;
      } },

    { id: 'glass_shallows', name: 'The Glass Shallows', level: 0, chance: 0.085,
      loc: { id: 'glass_shallows', name: 'The Glass Shallows', level: 0,
        tag: 'ankle deep, and bottomless',
        desc: 'Water so clear and so shallow you could wade it, over a floor that is not there. Things swim past your feet at a depth of several kilometres.',
        hint: 'shallow water with nothing under it',
        rarityBoost: 2.10, valueBoost: 1.85, xpBoost: 9.0, biteBoost: 0.88,
        sky: ['#101c22', '#3c5e68'], water: ['#26505c', '#0a1c24'], glow: '#aef0e8',
        fog: '#2e5a62', fogAmt: 0.20, stars: 0.9, starTint: '#e8fffc',
        horizon: 'crystal', silhouette: 'crystals', depth: 0.36,
        weather: ['clear', 'aurora', 'meteor', 'fog'],
        music: { root: 57, scale: [0, 2, 4, 7, 9], tempo: 0.13, pad: 0.70 } },
      found: 'shallow water you can see straight through, with nothing underneath it at all.',
      test: function (d) {
        return VF.conditions.has('lowtide') || VF.conditions.has('thinplace');
      } },

    { id: 'drowned_hall', name: 'The Drowned Hall', level: 0, chance: 0.055,
      loc: { id: 'drowned_hall', name: 'The Drowned Hall', level: 0,
        tag: 'somebody used to live here',
        desc: 'A long room with the roof gone and the furniture still where it was left. The water fills it exactly to the height of a person standing.',
        hint: 'a room, filled precisely to the brim',
        rarityBoost: 2.95, valueBoost: 2.55, xpBoost: 24.0, biteBoost: 0.92,
        sky: ['#0c0a16', '#241c38'], water: ['#150f28', '#030209'], glow: '#c8a8e8',
        fog: '#221a3a', fogAmt: 0.52, stars: 0.5, starTint: '#e0d0ff',
        horizon: 'monolith', silhouette: 'ruins', depth: 0.54,
        weather: ['fog', 'eclipse', 'voidsurge', 'overcast'],
        music: { root: 46, scale: [0, 3, 5, 6, 10], tempo: 0.07, pad: 0.95 } },
      found: 'a room with the roof gone, filled exactly to the height of a standing person.',
      test: function (d) {
        return VF.charms.owned('lantern') && VF.locations.index(d.location) >= 4;
      } },

    /* Above the clouds. Never rolled for — the fallen star quest hands it over
       when the rod arrives, and `test` exists only so tryFind ignores it. */
    { id: 'the_heavens', name: 'THE HEAVENS', level: 0, chance: 0, journal: 'theheavens',
      loc: { id: 'the_heavens', name: 'THE HEAVENS', level: 0,
        tag: 'above the weather, and there is water up here',
        desc: 'A flat calm sheet of light lying on top of the cloud, going out further than the sea does. ' +
              'The rod knows the way. You did not, and it did not need you to.',
        hint: 'above all of it',
        rarityBoost: 3.40, valueBoost: 4.00, xpBoost: 48.0, biteBoost: 0.90,
        sky: ['#2a1c3e', '#f0c07a'], water: ['#e8d6b0', '#8a6f52'], glow: '#ffe6a8',
        fog: '#c8a878', fogAmt: 0.30, stars: 1.0, starTint: '#fff4d8',
        horizon: 'ring', silhouette: 'none', depth: 0.34,
        weather: ['clear', 'aurora', 'meteor'],
        music: { root: 60, scale: [0, 4, 7, 9, 11], tempo: 0.15, pad: 0.55 } },
      found: 'water lying on top of the cloud, with nothing under it but weather.',
      test: function () { return false; } },

    /* The end of the game. Not a level unlock — you have to have been told. */
    { id: 'the_last_water', name: 'THE LAST WATER', level: 0, chance: 1,
      loc: { id: 'the_last_water', name: 'THE LAST WATER', level: 0,
        tag: 'there is nothing under this one',
        desc: 'Not a place so much as the underside of the idea of one. The rod feels correct here for the first time. Everything you have caught was practice.',
        hint: 'one more, under everything',
        rarityBoost: 6.20, valueBoost: 12.0, xpBoost: 110.0, biteBoost: 0.82,
        sky: ['#000000', '#0a0410'], water: ['#040110', '#000000'], glow: '#e0c8ff',
        fog: '#100628', fogAmt: 0.72, stars: 0.22, starTint: '#e8d8ff',
        horizon: 'eye', silhouette: 'none', depth: 0.62,
        weather: ['voidsurge', 'eclipse'],
        music: { root: 40, scale: [0, 1, 3, 6, 7], tempo: 0.05, pad: 1.0 } },
      found: 'the place all of it was pointing at.',
      final: true,
      test: function (d) {
        // every thread has to have been pulled: the deepest water, the eye,
        // enough of the journal, and the old fisherman's last word
        return d.location === 'beneath' &&
               VF.charms.owned('eye') &&
               VF.journal.hintCount() >= 3 &&
               (d.npcs.fisherman && d.npcs.fisherman.stage >= 4);
      } }
  ];

  const BY_ID = VF.util.byId(LIST);

  function found(id) { return !!VF.state.data.secrets[id]; }

  function discover(id) {
    const s = BY_ID[id];
    if (!s || found(id)) return false;
    const d = VF.state.data;
    d.secrets[id] = Date.now();
    d.stats.secretsFound++;
    if (d.unlockedLocations.indexOf(s.loc.id) < 0) d.unlockedLocations.push(s.loc.id);
    VF.locations.register(s.loc);
    VF.journal.add(s.journal || (s.final ? 'thelast' : 'beneath'));
    VF.bus.emit('secret:found', s);
    VF.save.save();
    return true;
  }

  /* Rolled once per cast that comes up empty-handed. */
  function tryFind() {
    const d = VF.state.data;
    const build = VF.build ? VF.build.stats() : null;
    const cond = VF.conditions ? VF.conditions.mods() : null;
    const k = (build ? build.secret : 1) * (cond ? cond.secret : 1);
    for (let i = 0; i < LIST.length; i++) {
      const s = LIST[i];
      if (found(s.id)) continue;
      let ok = false;
      try { ok = s.test(d); } catch (e) { ok = false; }
      if (!ok) continue;
      if (VF.rng.g() < s.chance * k) { discover(s.id); return s; }
    }
    return null;
  }

  /* Locations that came from a discovery, so the map can list them apart. */
  function registerFound() {
    const d = VF.state.data;
    for (let i = 0; i < LIST.length; i++) {
      if (d.secrets[LIST[i].id]) VF.locations.register(LIST[i].loc);
    }
  }

  VF.secrets = {
    list: LIST,
    get: function (id) { return BY_ID[id] || null; },
    found: found, discover: discover, tryFind: tryFind, registerFound: registerFound,
    isSecretLoc: function (locId) {
      for (let i = 0; i < LIST.length; i++) if (LIST[i].loc.id === locId) return true;
      return false;
    },
    countFound: function () { return Object.keys(VF.state.data.secrets).length; }
  };
})(window.VF = window.VF || {});
