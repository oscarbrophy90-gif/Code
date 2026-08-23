/* VOID FISHING — the long threads.
   A quest is an ordered list of chapters. A chapter is either somewhere to go
   and someone to talk to, or something to do out on the water; the engine in
   js/systems/quests.js decides which and watches for it.

   Nothing here blocks anything. A quest is a reason to go somewhere you were
   already able to go, and the fish do not know it is happening. */
(function (VF) {
  'use strict';

  /* The five who hold the compass. Each wants something different, and none of
     them will discuss it until they have it — the requirement is the whole
     conversation, so the player finds out what it was by satisfying it. */
  const COMPASS = [
    { npc: 'keeper',
      want: 'six rods on your rack. he does favours for customers, not for strangers',
      test: function (d) { return d.ownedRods.length >= 6; } },
    { npc: 'archivist',
      want: 'forty species in the record. she trades in what is written down',
      test: function (d) { return Object.keys(d.fishdex).length >= 40; } },
    { npc: 'fisherman',
      want: 'three legendary catches. he wants to see you hold something that fights',
      test: function (d) { return d.stats.legendaryCatches >= 3; } },
    { npc: 'drifter',
      want: 'the lantern he left somewhere. he will not say one word until you have it',
      test: function (d) { return VF.charms.owned('lantern'); } },
    { npc: 'collector',
      want: 'sixteen useless things in the wardrobe. he deals only in those',
      test: function (d) { return d.cosmetics.length >= 16; } }
  ];

  function compassHave(d) {
    let n = 0;
    for (let i = 0; i < COMPASS.length; i++) if (d.quests.heavens &&
      d.quests.heavens.flags['compass_' + COMPASS[i].npc]) n++;
    return n;
  }

  /* The three the Astronomer sets. Each is a way of catching a fish rather
     than a fish to catch, so they are read off the fight that just ended. */
  const TRIALS = [
    { id: 'patience', name: 'Patience',
      task: 'land a fish without ever letting it out of the white bar' },
    { id: 'precision', name: 'Precision',
      task: 'land a fish whose white bar is a fifth of the track or narrower' },
    { id: 'fortune', name: 'Fortune',
      task: 'land something rare at a spot he picks for you' }
  ];

  const PRECISION_BAR = 0.20;

  const LIST = [
    /* ==================================================================
       COUNT BACKWARDS
       The note in the bottle said count backwards and everybody who read it
       counted years. The archivist counted shores. It is the game's own map
       read as a timeline, which is a thing the player has been looking at
       for forty levels without being told what it was. */
    {
      id: 'firstshore',
      name: 'Count Backwards',
      giver: 'archivist',
      blurb: 'The plate lists the same eleven names four hundred years apart.',
      difficulty: 'long',
      rumour: 'The archivist has had the same plate out on her table for a week.',
      /* Late enough that the player has been down the map and pulled a couple
         of things out of it, so the claim lands on something they have seen. */
      needs: function (d) {
        return [
          { label: 'reach level 30', have: d.level, need: 30 },
          { label: 'bring up two objects', note: 'anything that is not a fish',
            have: d.stats.treasuresFound | 0, need: 2 },
          { label: 'record 55 species', have: Object.keys(d.fishdex).length, need: 55 }
        ];
      },

      chapters: [
        { id: 'plate', name: 'The Same Names Twice',
          talk: 'archivist',
          task: 'go and see the archivist',
          text: 'She has had the plate out on the table for a week and she has stopped ' +
                'pretending she is filing it.' },

        { id: 'fourshores', name: 'The Order Of Shores',
          task: 'fish the first four waters, one catch from each',
          where: 'the quiet shore, the basin, the flats, the trench',
          text: 'She wants a fish out of each of the first four, and she will not say ' +
                'why. She says a chart can be argued with and a catch cannot.',
          checklist: function (q) {
            const want = ['shore', 'basin', 'flats', 'trench'];
            return want.map(function (id) {
              return { name: VF.locations.get(id).name, done: !!q.flags['shore_' + id] };
            });
          },
          onCatch: function (q, c) {
            if (c.kind !== 'fish') return;
            const want = ['shore', 'basin', 'flats', 'trench'];
            if (want.indexOf(c.location) < 0) return;
            if (q.flags['shore_' + c.location]) return;
            q.flags['shore_' + c.location] = 1;
            VF.bus.emit('quest:item', { quest: 'firstshore',
              name: VF.locations.get(c.location).name + ' — recorded',
              have: want.filter(function (id) { return q.flags['shore_' + id]; }).length,
              need: 4 });
          },
          done: function (q) {
            return ['shore', 'basin', 'flats', 'trench']
              .every(function (id) { return !!q.flags['shore_' + id]; });
          },
          onDone: function () { VF.journal.add('shores'); } },

        { id: 'ancient', name: 'Older Than The Water',
          task: 'land something carrying the Ancient trait',
          where: 'deeper water turns them up more often, and so does patience',
          text: 'A chart is one person writing down what they saw. She wants something ' +
                'that was there before anybody was writing anything down.',
          onCatch: function (q, c) {
            if (c.kind !== 'fish' || !c.traits) return;
            if (c.traits.indexOf('ancient') < 0) return;
            q.flags.ancient = 1;
          },
          done: function (q) { return !!q.flags.ancient; } },

        { id: 'objects', name: 'What Else Is Down There',
          task: 'bring up three objects',
          where: 'anything that is not a fish counts. the lantern helps',
          text: 'Fish leave nothing behind. She wants the things that do — the ones ' +
                'somebody dropped, at whichever shore they were standing on.',
          goal: function (q) {
            return { have: Math.min(3, q.counts.objects | 0), need: 3, unit: 'objects' };
          },
          onCatch: function (q, c) {
            if (c.kind !== 'treasure') return;
            q.counts.objects = Math.min(3, (q.counts.objects | 0) + 1);
            VF.bus.emit('quest:item', { quest: 'firstshore', name: c.treasure.name,
              have: q.counts.objects, need: 3 });
          },
          done: function (q) { return (q.counts.objects | 0) >= 3; } },

        { id: 'dates', name: 'The Third List',
          talk: 'archivist',
          task: 'take it all back to the archivist',
          text: 'Four catches, one old thing and three objects, laid out on a table that ' +
                'has not had this much on it in years.' },

        { id: 'deepthree', name: 'The Ones That Are Not Shores',
          task: 'fish the last three waters, one catch from each',
          where: 'the cradle, the nowhere sea, and the one under it',
          text: 'If the shore is the newest of them then the bottom is the oldest, and ' +
                'she wants to know whether anything is still living at that end of the count.',
          checklist: function (q) {
            const want = ['cradle', 'nowhere', 'beneath'];
            return want.map(function (id) {
              return { name: VF.locations.get(id).name, done: !!q.flags['deep_' + id] };
            });
          },
          onCatch: function (q, c) {
            if (c.kind !== 'fish') return;
            const want = ['cradle', 'nowhere', 'beneath'];
            if (want.indexOf(c.location) < 0 || q.flags['deep_' + c.location]) return;
            q.flags['deep_' + c.location] = 1;
            VF.bus.emit('quest:item', { quest: 'firstshore',
              name: VF.locations.get(c.location).name + ' — recorded',
              have: want.filter(function (id) { return q.flags['deep_' + id]; }).length,
              need: 3 });
          },
          done: function (q) {
            return ['cradle', 'nowhere', 'beneath']
              .every(function (id) { return !!q.flags['deep_' + id]; });
          } },

        { id: 'counted', name: 'Eight',
          talk: 'archivist',
          task: 'she has finished counting',
          text: 'She has the eight of them written down in order and she is not looking ' +
                'at the list. She is looking at the space under the last one.' }
      ],

      onComplete: function () {
        VF.charms.grant('olderplate');
        VF.journal.add('countback');
        VF.journal.add('plategift');
        VF.achievements.check();
      }
    },

    /* ==================================================================
       WHAT THE DRIFTER LEFT
       He is the only one who moves between the spots, and the lantern turns
       up wherever he has been. The thread is what he is doing, which he does
       not entirely know either. */
    {
      id: 'errand',
      name: "What The Drifter Left",
      giver: 'drifter',
      blurb: 'He did not lose the lantern. He put it down where it would be found.',
      difficulty: 'long',
      rumour: 'The drifter left something behind, and somebody is going to find it.',
      needs: function (d) {
        return [
          { label: 'reach level 42', have: d.level, need: 42 },
          { label: "hold the drifter's lantern",
            note: 'it comes up out of deeper water, on its own schedule',
            have: VF.charms.owned('lantern') ? 1 : 0, need: 1 }
        ];
      },

      chapters: [
        { id: 'found', name: 'It Was Not Lost',
          talk: 'drifter',
          task: 'find the drifter and tell him you have his lantern',
          text: 'He does not ask for it back. He asks where you found it, and then he ' +
                'asks it again slightly differently, as though checking an answer.' },

        { id: 'hidden', name: 'Where The Light Falls',
          task: 'find water that is not on the map',
          where: 'the lantern is for this. wear it',
          text: 'He says the flame points, and that it has been pointing the whole time ' +
                'you have been carrying it, and that you will not notice until you do.',
          done: function () { return VF.secrets.countFound() >= 1; },
          onDone: function () { VF.journal.add('errand'); } },

        { id: 'darkfish', name: 'The Ones That Wait',
          task: 'land four fish in fog or after dark',
          where: 'anywhere. it is the light that matters, not the water',
          text: 'Whatever the lantern keeps away, he wants to know what it keeps away ' +
                'from. That means fishing where it would have been the only light.',
          goal: function (q) {
            return { have: Math.min(4, q.counts.dark | 0), need: 4, unit: 'in the dark' };
          },
          onCatch: function (q, c) {
            if (c.kind !== 'fish') return;
            if (c.weather !== 'fog' && c.time !== 'night') return;
            q.counts.dark = Math.min(4, (q.counts.dark | 0) + 1);
            VF.bus.emit('quest:item', { quest: 'errand', name: c.fish.name,
              have: q.counts.dark, need: 4 });
          },
          done: function (q) { return (q.counts.dark | 0) >= 4; } },

        { id: 'unbroken', name: 'Nothing Dropped',
          task: 'land six in a row without losing one',
          where: 'the run resets the moment one gets off the hook',
          text: 'He says he has never once put the lantern down badly. He says it the way ' +
                'somebody says a thing they have been accused of.',
          goal: function (q, d) {
            return { have: Math.min(6, d.streak | 0), need: 6, unit: 'in a row' };
          },
          done: function (q, d) { return (d.streak | 0) >= 6; } },

        { id: 'name', name: 'A Name That Is Not His',
          talk: 'drifter',
          task: 'go back to the drifter',
          text: 'He has remembered something between the last time and this one, which ' +
                'has not happened before.' },

        { id: 'thelast', name: 'The Last Errand',
          task: 'land something Mythic or beyond',
          where: 'the deep end, with everything you have on',
          text: 'He wants one more thing out of the water and he will not say what it is ' +
                'for. He says he will know it when you are holding it.',
          onCatch: function (q, c) {
            if (c.kind !== 'fish') return;
            if (VF.rarities.rank(c.rarity) < 5) return;
            q.flags.last = 1;
          },
          done: function (q) { return !!q.flags.last; } },

        { id: 'given', name: 'Keep It',
          talk: 'drifter',
          task: 'he is waiting where you first met him',
          text: 'He is standing still, which is the first time you have seen him do it.' }
      ],

      onComplete: function () {
        VF.charms.grant('nightglass');
        VF.journal.add('driftname');
        VF.journal.add('nightglass');
        VF.achievements.check();
      }
    },

    {
      id: 'heavens',
      name: 'The Fallen Star',
      giver: 'fisherman',
      blurb: 'Something fell out of the sky a long time ago, and it was not a meteor.',
      difficulty: 'extreme',
      rumour: 'The old fisherman keeps saying he will tell you something when you ' +
              'have put in the hours.',
      /* Offered once there is enough behind the player that Elias will bother
         telling them — and said out loud in the log, because a thread that
         opens in silence is one nobody knows to go and start. */
      needs: function (d) {
        return [
          { label: 'reach level 22', have: d.level, need: 22 },
          { label: 'land 120 fish', have: d.stats.catches, need: 120 },
          { label: 'get the old fisherman talking, twice',
            note: 'he has more to say each time you have done something new',
            have: (d.npcs.fisherman && d.npcs.fisherman.stage) | 0, need: 2 }
        ];
      },

      chapters: [
        /* ------------------------------------------------------- 0 */
        { id: 'elias', name: 'The Old Fisherman',
          talk: 'fisherman',
          task: 'go and see the old fisherman',
          text: 'He has been at the far end of the shore for as long as anyone remembers, ' +
                'and today he is facing the water instead of away from it.' },

        /* ------------------------------------------------------- 1 */
        { id: 'moonlit', name: 'Fishing Under The Moon',
          task: 'gather three celestial scales from moonlit fish',
          where: 'moonlit fish rise on clear nights, in water that has a moon over it',
          text: 'Elias says the sky does not give up its secrets easily, and to start ' +
                'with what swims beneath the moon. Not every moonlit fish is carrying a scale. ' +
                'Most are not.',
          goal: function (q) { return { have: q.counts.scales | 0, need: 3, unit: 'celestial scales' }; },
          onCatch: function (q, c) {
            if (c.kind !== 'fish' || c.id !== 'moonlit') return;
            q.counts.moonlit = (q.counts.moonlit | 0) + 1;
            // roughly one in two carries one, and the tenth is a mercy
            const sure = (q.counts.moonlit | 0) >= 10 && (q.counts.scales | 0) < 3;
            if (sure || VF.rng.g() < 0.52) {
              q.counts.scales = Math.min(3, (q.counts.scales | 0) + 1);
              VF.bus.emit('quest:item', { quest: 'heavens', name: 'Celestial Scale',
                have: q.counts.scales, need: 3,
                note: 'it is warm, and it is not reflecting anything that is here' });
            } else {
              VF.bus.emit('quest:note', { text: 'no scale on this one' });
            }
          },
          done: function (q) { return (q.counts.scales | 0) >= 3; } },

        /* ------------------------------------------------------- 2 */
        { id: 'constellation', name: 'The Constellation',
          talk: 'fisherman',
          task: 'take the three scales back to elias',
          text: 'Laid side by side on the stone, the scales are not three scales. ' +
                'They are three points of one shape.' },

        /* ------------------------------------------------------- 3 */
        { id: 'astronomer', name: 'The Astronomer',
          talk: 'astronomer',
          task: 'find the astronomer',
          where: 'up where the ground runs out, under a roof that opens',
          text: 'Elias has not said that name out loud in fifty years. He says it now ' +
                'the way you say the name of somebody you owe money to.' },

        /* ------------------------------------------------------- 4 */
        { id: 'trials', name: 'Three Proofs',
          task: 'pass the astronomer’s three trials',
          text: 'He does not believe the rod is a treasure. He believes it is a test, ' +
                'and he is not going to help somebody who would fail it.',
          onEnter: function (q, d) {
            /* Fortune is fortune: the spot is drawn when the trial is set, and
               it is drawn from water the player can actually reach. */
            const open = d.unlockedLocations.filter(function (id) {
              return VF.locations.isRegistered(id);
            });
            q.flags.fortuneLoc = open.length ? VF.rng.g.pick(open) : 'shore';
          },
          goal: function (q) {
            let n = 0;
            for (let i = 0; i < TRIALS.length; i++) if (q.flags['trial_' + TRIALS[i].id]) n++;
            return { have: n, need: TRIALS.length, unit: 'trials passed' };
          },
          checklist: function (q) {
            return TRIALS.map(function (t) {
              let task = t.task;
              if (t.id === 'fortune') {
                const l = VF.locations.get(q.flags.fortuneLoc);
                task = 'land something rare at ' + (l ? l.name : 'the shore');
              }
              return { label: t.name, task: task, done: !!q.flags['trial_' + t.id] };
            });
          },
          onCatch: function (q, c, fight, d) {
            if (c.kind !== 'fish') return;
            function pass(id) {
              if (q.flags['trial_' + id]) return;
              q.flags['trial_' + id] = Date.now();
              const t = VF.util.byId(TRIALS)[id];
              VF.bus.emit('quest:trial', { quest: 'heavens', id: id, name: t ? t.name : id });
            }
            // patience: it never once left the bar
            if (fight.perfect) pass('patience');
            // precision: the bar was a fifth of the track or narrower
            if (fight.barW && fight.barW <= PRECISION_BAR) pass('precision');
            // fortune: something rare, at the spot the sky picked
            if (VF.rarities.rank(c.rarity) >= 2 && c.location === q.flags.fortuneLoc) pass('fortune');
          },
          done: function (q) {
            for (let i = 0; i < TRIALS.length; i++) if (!q.flags['trial_' + TRIALS[i].id]) return false;
            return true;
          } },

        /* ------------------------------------------------------- 5 */
        { id: 'skyfalldepths', name: 'The Skyfall Depths',
          talk: 'astronomer',
          task: 'hear what the constellation points at',
          text: 'Three proofs, and he still has not said he will help. He has only ' +
                'stopped saying he will not.' },

        /* ------------------------------------------------------- 6 */
        { id: 'compass', name: 'The Broken Compass',
          task: 'recover the five pieces of the celestial compass',
          text: 'It was broken on purpose, by somebody who thought it should stay broken. ' +
                'The pieces went to five people who each had a reason to keep one, and none ' +
                'of them will hand it over for the asking.',
          goal: function (q, d) { return { have: compassHave(d), need: 5, unit: 'compass pieces' }; },
          checklist: function (q, d) {
            return COMPASS.map(function (c) {
              const npc = VF.npcs.get(c.npc);
              return { label: npc ? VF.npcs.name(c.npc) : c.npc, task: c.want,
                       done: !!q.flags['compass_' + c.npc] };
            });
          },
          done: function (q, d) { return compassHave(d) >= 5; } },

        /* ------------------------------------------------------- 7 */
        { id: 'itpointsup', name: 'It Points Up',
          talk: 'astronomer',
          task: 'take the five pieces to the astronomer',
          text: 'Five pieces of brass and glass, and the needle in the middle of them ' +
                'has not had anywhere to point for four hundred years.' },

        /* ------------------------------------------------------- 8 */
        { id: 'skyfall', name: 'Skyfall',
          task: 'fish through a skyfall and land the celestial guardian',
          where: 'skyfall comes to the deeper water, and it does not last long',
          onEnter: function () { if (VF.conditions) VF.conditions.hasten(40); },
          text: 'The compass does not point across the water. It points at the sky, ' +
                'and the astronomer says the sky answers — occasionally, and on its own schedule.',
          goal: function (q) { return { have: q.counts.guardian | 0, need: 1, unit: 'celestial guardian' }; },
          onCatch: function (q, c) {
            if (c.kind === 'fish' && c.id === 'celestial_guardian') {
              q.counts.guardian = 1;
              VF.journal.add('guardian');
            }
          },
          done: function (q) { return (q.counts.guardian | 0) >= 1; } },

        /* ------------------------------------------------------- 9 */
        { id: 'message', name: 'The Message In The Scale',
          talk: 'astronomer',
          task: 'take the guardian’s scale to the astronomer',
          text: 'There is writing inside the scale. It is not on the scale. It is inside it.' },

        /* ------------------------------------------------------ 10 */
        { id: 'trial', name: 'Heaven’s Trial',
          task: 'cast, and hold on through all four phases',
          where: 'anywhere. it will find you',
          text: '“Only the fisherman who can control the heavens may claim what fell ' +
                'from them.” Four phases. The storm, the lightning, the void, and then ' +
                'the heavens themselves. Nothing else is on the end of the line until it is over.',
          armsTrial: true,
          goal: function (q) { return { have: q.counts.leviathan | 0, need: 1, unit: 'celestial leviathan' }; },
          onCatch: function (q, c) {
            if (c.kind === 'fish' && c.id === 'celestial_leviathan') q.counts.leviathan = 1;
          },
          done: function (q) { return (q.counts.leviathan | 0) >= 1; } }
      ],

      /* Heaven's Trial. Four phases, gated on the meter rather than a clock,
         and it does not stop between them. The numbers here are the shape of
         each phase; js/systems/loot.js applies the player's rod and charms on
         top, so the loadout still counts for something at the very top. */
      trial: {
        fish: 'celestial_leviathan',
        phases: [
          /* the bar is wide and the fish is slow: this phase is here to be
             survived while the player works out what the fight is */
          { at: 0.00, name: 'The Storm',     start: 0.30,
            barW: 0.235, barSpeed: 1.15, fishSpeed: 0.55, fishTurn: 0.70, dart: 0.30,
            fill: 0.200, drain: 0.235 },
          /* it stops drifting and starts jumping */
          { at: 0.30, name: 'The Lightning',
            barW: 0.205, barSpeed: 1.30, fishSpeed: 0.70, fishTurn: 0.30, dart: 0.65,
            fill: 0.190, drain: 0.260 },
          /* the zone closes to two thirds of what it was */
          { at: 0.56, name: 'The Void',
            barW: 0.150, barSpeed: 1.40, fishSpeed: 0.76, fishTurn: 0.42, dart: 0.48,
            fill: 0.178, drain: 0.285 },
          /* everything at once, and it reads the bar — but the meter climbs
             fastest here, so the last fifth is a sprint rather than a wall */
          { at: 0.80, name: 'The Heavens',
            barW: 0.128, barSpeed: 1.55, fishSpeed: 0.90, fishTurn: 0.24, dart: 0.70,
            evade: 0.18, fill: 0.250, drain: 0.330 }
        ]
      },

      /* The rod does not get handed over. It arrives. */
      onComplete: function () {
        const d = VF.state.data;
        if (d.ownedRods.indexOf('heavens') < 0) d.ownedRods.push('heavens');
        d.rod = 'heavens';
        VF.bus.emit('gear:changed');
        VF.secrets.discover('the_heavens');
        d.flags.heavensRod = true;
        VF.journal.add('heavensrod');
        VF.achievements.check();
      }
    }
  ];

  const BY_ID = VF.util.byId(LIST);

  VF.questData = {
    list: LIST,
    get: function (id) { return BY_ID[id] || null; },
    COMPASS: COMPASS,
    TRIALS: TRIALS,
    PRECISION_BAR: PRECISION_BAR
  };
})(window.VF = window.VF || {});
