/* VOID FISHING — achievements. `test(d)` reads the save data and returns true when earned.
   Hidden achievements show as ?????? until unlocked. */
(function (VF) {
  'use strict';

  function dexCount(d) { return Object.keys(d.fishdex).length; }
  function dexOf(d, rarity) {
    let n = 0;
    for (const id in d.fishdex) {
      const f = VF.fish.byId(id);
      if (f && f.rarity === rarity) n++;
    }
    return n;
  }

  const LIST = [
    { id: 'first_catch', name: 'First Catch', desc: 'Land your first fish.', reward: 50,
      test: function (d) { return d.stats.catches >= 1; } },
    { id: 'ten', name: 'Ten Fish', desc: 'Land 10 fish.', reward: 150,
      test: function (d) { return d.stats.catches >= 10; } },
    { id: 'hundred', name: 'A Hundred Fish', desc: 'Land 100 fish.', reward: 2000,
      test: function (d) { return d.stats.catches >= 100; } },
    { id: 'thousand', name: 'A Thousand Fish', desc: 'Land 1,000 fish.', reward: 120000,
      test: function (d) { return d.stats.catches >= 1000; } },

    { id: 'big_catch', name: 'Big Catch', desc: 'Land something over 50 kg.', reward: 400,
      test: function (d) { return d.stats.biggestKg >= 50; } },
    { id: 'huge_catch', name: 'Considerable Catch', desc: 'Land something over 500 kg.', reward: 6000,
      test: function (d) { return d.stats.biggestKg >= 500; } },
    { id: 'record_breaker', name: 'Record Breaker', desc: 'Break 25 personal size records.', reward: 3000,
      test: function (d) { return d.stats.recordsBroken >= 25; } },
    { id: 'giant', name: 'Absolute Unit', desc: 'Land a catch in the top 1% of its species.', reward: 2500,
      test: function (d) { return !!d.flags.caughtGiant; } },

    { id: 'rare_1', name: 'Something Worth Keeping', desc: 'Land a Rare fish.', reward: 300,
      test: function (d) { return !!d.flags.rare_rare; } },
    { id: 'epic_1', name: 'Uncommonly Lucky', desc: 'Land an Epic fish.', reward: 1200,
      test: function (d) { return !!d.flags.rare_epic; } },
    { id: 'legendary', name: 'Legendary', desc: 'Land a Legendary fish.', reward: 9000,
      test: function (d) { return d.stats.legendaryCatches >= 1; } },
    { id: 'mythic', name: 'Told In Whispers', desc: 'Land a Mythic fish.', reward: 60000,
      test: function (d) { return !!d.flags.rare_mythic; } },
    { id: 'void_walker', name: 'Void Walker', desc: 'Land a Void fish.', reward: 500000,
      test: function (d) { return d.stats.voidCatches >= 1; } },
    { id: 'nessie', name: '??????', desc: 'Land the one everybody has a photograph of.', hidden: true, reward: 40000000,
      test: function (d) { return !!d.fishdex.nessie; } },
    { id: 'oscar', name: '??????', desc: 'Land the man the money is named after.', hidden: true, reward: 40000000,
      test: function (d) { return !!d.fishdex.oscar_brophy; } },
    { id: 'both_unknown', name: '?', desc: 'Land both of them.', hidden: true, reward: 500000000,
      test: function (d) { return !!d.fishdex.nessie && !!d.fishdex.oscar_brophy; } },
    { id: 'glitch', name: '??????', desc: 'Land something that should not exist.', hidden: true, reward: 4000000,
      test: function (d) { return !!d.flags.rare_glitch; } },

    { id: 'mutation_1', name: 'Not Standard Issue', desc: 'Land a mutated fish.', reward: 800,
      test: function (d) { return d.stats.mutationsFound >= 1; } },
    { id: 'mutation_10', name: 'Collector of Oddities', desc: 'Land 10 mutated fish.', reward: 15000,
      test: function (d) { return d.stats.mutationsFound >= 10; } },
    { id: 'voidtouched', name: 'Marked', desc: 'Land a Void-Touched fish.', hidden: true, reward: 250000,
      test: function (d) { return !!d.flags.mut_voidtouched; } },

    { id: 'collector_10', name: 'Collector', desc: 'Discover 10 species.', reward: 400,
      test: function (d) { return dexCount(d) >= 10; } },
    { id: 'collector_30', name: 'Serious Collector', desc: 'Discover 30 species.', reward: 5000,
      test: function (d) { return dexCount(d) >= 30; } },
    { id: 'collector_50', name: 'Cataloguer', desc: 'Discover 50 species.', reward: 80000,
      test: function (d) { return dexCount(d) >= 50; } },
    { id: 'collector_all', name: 'The Complete Record', desc: 'Discover every species.', reward: 25000000,
      // every species the record admits to having — a tier nobody can know
      // about is not something to be asked for
      test: function (d) { return dexCount(d) >= VF.fish.knownCount(); } },
    { id: 'all_common', name: 'Thorough', desc: 'Discover every Common species.', reward: 1500,
      test: function (d) { return dexOf(d, 'common') >= VF.fish.byRarity('common').length; } },

    { id: 'rich_1k', name: 'Pocket Money', desc: 'Earn 1,000 Brophys in total.', reward: 100,
      test: function (d) { return d.stats.earned >= 1000; } },
    { id: 'rich_100k', name: 'Comfortable', desc: 'Earn 100,000 Brophys in total.', reward: 4000,
      test: function (d) { return d.stats.earned >= 100000; } },
    { id: 'millionaire', name: 'Millionaire', desc: 'Earn 1,000,000 Brophys in total.', reward: 50000,
      test: function (d) { return d.stats.earned >= 1000000; } },
    { id: 'billionaire', name: 'Absurdly Wealthy', desc: 'Earn 1,000,000,000 Brophys in total.', reward: 20000000,
      test: function (d) { return d.stats.earned >= 1e9; } },

    { id: 'level_10', name: 'Getting The Hang Of It', desc: 'Reach level 10.', reward: 600,
      test: function (d) { return d.level >= 10; } },
    { id: 'level_25', name: 'Old Hand', desc: 'Reach level 25.', reward: 12000,
      test: function (d) { return d.level >= 25; } },
    { id: 'level_50', name: 'Lifer', desc: 'Reach level 50.', reward: 400000,
      test: function (d) { return d.level >= 50; } },

    { id: 'traveller', name: 'Traveller', desc: 'Unlock 4 fishing spots.', reward: 2500,
      test: function (d) { return d.unlockedLocations.length >= 4; } },
    { id: 'end_of_map', name: 'The End Of The Map', desc: 'Reach BENEATH.', hidden: true, reward: 1000000,
      test: function (d) { return d.unlockedLocations.indexOf('beneath') >= 0; } },

    { id: 'conservationist', name: 'Conservationist', desc: 'Release 50 fish.', reward: 3000,
      test: function (d) { return d.stats.released >= 50; } },
    { id: 'perfect_10', name: 'Steady Hands', desc: 'Land 10 fish without the tension ever entering the red.', reward: 2000,
      test: function (d) { return d.stats.perfectReels >= 10; } },
    { id: 'snapped', name: 'It Happens', desc: 'Snap your line. Everyone does eventually.', reward: 50,
      test: function (d) { return d.stats.linesSnapped >= 1; } },
    { id: 'chosen_stars', name: 'Chosen by the Stars', desc: 'Take the Heavens Rod out of the sky it fell from.',
      hidden: true, reward: 250000,
      test: function (d) { return !!(d.quests.heavens && d.quests.heavens.done); } },
    { id: 'above_weather', name: 'Above the Weather', desc: 'Land something in the water above the clouds.',
      hidden: true, reward: 120000,
      test: function (d) {
        return !!(d.fishdex.cloudrunner || d.fishdex.stratus_ray ||
                  d.fishdex.sunspear || d.fishdex.astra_koi);
      } },
    { id: 'encounters', name: 'Something Is Below You', desc: 'Survive 5 legendary encounters.', reward: 30000,
      test: function (d) { return d.stats.encounters >= 5; } },
    { id: 'patient', name: 'Patient', desc: 'Spend two hours at the water.', reward: 5000,
      test: function (d) { return d.stats.playSeconds >= 7200; } },
    { id: 'best_rod', name: 'Nothing Left To Buy', desc: 'Own every rod.', hidden: true, reward: 100000000,
      test: function (d) { return d.ownedRods.length >= VF.rods.list.length; } },

    /* --- traits --- */
    { id: 'trait_golden', name: 'Struck Gold', desc: 'Land a Golden fish.', reward: 6000,
      test: function (d) { return !!d.flags.trait_golden; } },
    { id: 'trait_ancient', name: 'Older Than The Water', desc: 'Land an Ancient fish.', reward: 60000,
      test: function (d) { return !!d.flags.trait_ancient; } },
    { id: 'trait_massive', name: 'Massive', desc: 'Land a Massive fish.', reward: 9000,
      test: function (d) { return !!d.flags.trait_massive; } },
    { id: 'multi_2', name: 'Two At Once', desc: 'Land a fish carrying two traits.', reward: 25000,
      test: function (d) { return d.stats.multiTrait >= 1; } },
    { id: 'multi_3', name: 'Improbable', desc: 'Land a fish carrying three traits.', hidden: true, reward: 900000,
      test: function (d) { return !!d.flags.combo3; } },
    { id: 'multi_4', name: 'Statistically Rude', desc: 'Land a fish carrying four traits.', hidden: true, reward: 12000000,
      test: function (d) { return !!d.flags.combo4; } },
    { id: 'traits_all', name: 'Every Variation', desc: 'Record all ten traits.', reward: 3000000,
      test: function (d) { return Object.keys(d.traitsSeen).length >= VF.traits.list.length; } },

    /* --- salvage and secrets --- */
    { id: 'treasure_1', name: 'Not A Fish', desc: 'Pull something else out of the water.', reward: 400,
      test: function (d) { return d.stats.treasuresFound >= 1; } },
    { id: 'treasure_50', name: 'Salvager', desc: 'Pull up 50 objects.', reward: 40000,
      test: function (d) { return d.stats.treasuresFound >= 50; } },
    { id: 'relic_1', name: 'It Does Something', desc: 'Find your first relic.', reward: 20000,
      test: function (d) { return d.charms.some(function (id) {
        const c = VF.charms.get(id); return c && c.kind === 'relic'; }); } },
    { id: 'secret_1', name: 'Off The Chart', desc: 'Find water nobody put on a map.', hidden: true, reward: 120000,
      test: function (d) { return d.stats.secretsFound >= 1; } },
    { id: 'secret_all', name: 'Everywhere There Is', desc: 'Find every hidden spot.', hidden: true, reward: 40000000,
      test: function (d) { return d.stats.secretsFound >= VF.secrets.list.length; } },
    { id: 'wrong_1', name: '??????', desc: 'Be there when it stops.', hidden: true, reward: 250000,
      test: function (d) { return d.stats.wrongEvents >= 1; } },

    /* --- people and the record --- */
    { id: 'met_all', name: 'Everyone Who Is Here', desc: 'Speak to all five of them.', reward: 15000,
      test: function (d) {
        // having a record is not the same as having talked to them
        return VF.npcs.list.every(function (n) { return VF.npcs.met(n.id); });
      } },
    { id: 'journal_10', name: 'Keeping Notes', desc: 'Write ten journal entries.', reward: 8000,
      test: function (d) { return d.journal.length >= 10; } },
    { id: 'streak_25', name: 'Not One Lost', desc: 'Land 25 in a row without losing one.', reward: 30000,
      test: function (d) { return d.records.bestStreak >= 25; } },

    /* --- cosmetics --- */
    { id: 'case_1', name: 'Purely Decorative', desc: 'Open your first case.', reward: 2000,
      test: function (d) { return d.stats.casesOpened >= 1; } },
    { id: 'case_25', name: 'A Serious Habit', desc: 'Open 25 cases.', reward: 90000,
      test: function (d) { return d.stats.casesOpened >= 25; } },
    { id: 'cos_15', name: 'Dressed For It', desc: 'Own 15 cosmetics.', reward: 25000,
      test: function (d) { return d.cosmetics.length >= 15; } },
    { id: 'cos_all', name: 'The Whole Wardrobe', desc: 'Own every cosmetic.', hidden: true, reward: 60000000,
      test: function (d) { return VF.cosmetics.completion().pct >= 1; } },

    /* --- the end --- */
    { id: 'the_last', name: '??????????', desc: 'Reach the last water.', hidden: true, reward: 250000000,
      test: function (d) { return VF.secrets.found('the_last_water'); } }
  ];

  const BY_ID = VF.util.byId(LIST);

  VF.achievementData = {
    list: LIST,
    get: function (id) { return BY_ID[id] || null; }
  };
})(window.VF = window.VF || {});
