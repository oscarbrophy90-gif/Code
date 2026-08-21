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
    {
      id: 'heavens',
      name: 'The Fallen Star',
      giver: 'fisherman',
      blurb: 'Something fell out of the sky a long time ago, and it was not a meteor.',
      difficulty: 'extreme',
      /* Offered once there is enough behind the player that the old fisherman
         will bother telling them. */
      start: function (d) {
        return d.level >= 22 && d.stats.catches >= 120 &&
               (d.npcs.fisherman && d.npcs.fisherman.stage >= 2);
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
