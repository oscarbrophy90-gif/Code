/* VOID FISHING — the small cast.
   Nobody here has a quest log. They have opinions, and the opinions change as
   you get further out. Their later lines are where the endgame is hidden. */
(function (VF) {
  'use strict';

  /* Each NPC has stages. A stage unlocks when its `at` test passes, and the
     player has to actually go and talk to them to hear it.

     `quest[]` is a second, independent track. Lore stages are strictly ordered
     and stop at the first one the player has not earned — which is right for
     lore and fatal for a quest, because an unrelated late-game lore gate would
     silently make a quest step unreachable. Quest stages are counted
     separately and are what somebody says first when they have both. */
  const LIST = [
    { id: 'keeper', name: 'The Keeper', role: 'shop', color: '#c8a870',
      where: 'behind the counter, always',
      blurb: 'Sells what you need. Buys what you would rather not carry.',
      stages: [
        { at: function () { return true; },
          lines: ['rods on the left. bait on the right. do not ask about the third shelf.',
                  'you will lose more line than you expect. everybody does. it is not a reflection on you.'] },
        { at: function (d) { return d.stats.catches >= 25; },
          lines: ['you have been at it a while now. the water notices that sort of thing.',
                  'somebody brought me a key once. brass. i still have the box it opens and no interest in opening it.'] },
        { at: function (d) { return !!d.treasures.key; },
          lines: ['that key. yes. i will take it — i have a box of things nobody claimed, and you may as well have one.',
                  'do not thank me. i want it out of the shop.'],
          gives: 'case' },
        { at: function (d) { return d.stats.voidCatches >= 1; },
          lines: ['you brought that up on purpose, did you.',
                  'the archivist will want to hear about it. i would rather you did not tell me.'] },
        { at: function (d) { return VF.secrets.found('the_last_water'); },
          lines: ['so you found it.', 'close the door behind you on the way out. it will not matter, but close it anyway.'] },
        { at: function (d) { return VF.secrets.found('the_last_water') && d.level >= 84; },
          lines: ['under the counter. it has been under the counter since before you walked in the first time.',
                  'one light at the tip, one at your hand, and the dark in between is the rod. i have never put it on a shelf and i never will.',
                  'i was waiting to see if you would come back. you kept coming back. take it.'],
          gives: 'rod:twinsun' }
      ],
      quest: [
        { at: function (d) { return VF.quests.reached('heavens', 6) && d.ownedRods.length >= 6; },
          lines: ['the third shelf. i said not to ask about the third shelf.',
                  'yes, i have a piece of it. brass, curved, no use to anybody. it came in with a box of tackle forty years ago and i could never sell it.',
                  'six rods you have bought off me. that makes you a customer, and i do favours for customers. take it and stop looking at the shelf.'],
          quest: { id: 'heavens', flag: 'compass_keeper' } }
      ] },

    { id: 'archivist', name: 'The Archivist', role: 'lore', color: '#8fb8e8',
      where: 'a room of shelves nobody remembers building',
      blurb: 'Catalogues everything. Has never once been surprised.',
      stages: [
        { at: function (d) { return d.stats.catches >= 5; },
          lines: ['you are the one filling in the record. good. it has been mostly blank for a long time.',
                  'name a species and i will tell you what we know. it is usually less than you would hope.'] },
        { at: function (d) { return Object.keys(d.fishdex).length >= 18; },
          lines: ['eighteen. the previous record was eleven, and he stopped for reasons he did not write down.',
                  'the entries are not in the order they were caught. they are in the order they started existing.'] },
        { at: function (d) { return !!d.treasures.plate; },
          lines: ['the plate. the same names on both dates, four hundred years apart, and the second list is longer.',
                  'i have not been able to decide whether that is a record of who drowned or of who was here. it may not be two questions.'],
          journal: 'plate' },
        { at: function (d) { return d.stats.voidCatches >= 1; },
          lines: ['you understand that it should not have a weight.',
                  'and yet the scale gave you a number, and you wrote it down, and now it does. be careful what you measure.'],
          journal: 'firstvoid' },
        { at: function (d) { return VF.charms.owned('eye'); },
          lines: ['take it out of here.', 'i am not being dramatic. i am being specific. take it out of this room.'] }
      ],
      quest: [
        { at: function (d) { return VF.quests.reached('heavens', 6) && Object.keys(d.fishdex).length >= 40; },
          lines: ['forty species. forty. i have been asking people to do that for a very long time and they keep going fishing instead.',
                  'the glass wedge from the compass, yes. it is catalogued under objects that point at things. it is the only entry in that category.',
                  'i am giving it to you because you filled in the record, not because of what you intend to do with it. i want that on the record as well.'],
          quest: { id: 'heavens', flag: 'compass_archivist' } }
      ] },

    { id: 'fisherman', name: 'The Old Fisherman', role: 'clue', color: '#a8c890',
      where: 'the far end of the shore, facing away',
      blurb: 'Has been here longer than the shore has.',
      stages: [
        { at: function (d) { return d.stats.catches >= 12; },
          lines: ['keep it in the bar. that is all of it. everything else is decoration.',
                  'and you do not lose them because the fish is strong. you lose them because you chased it instead of waiting for it to come back.'] },
        { at: function (d) { return VF.locations.index(d.location) >= 3 || d.level >= 18; },
          lines: ['the trench, is it. mm.',
                  'it has no bottom. people say that meaning it is very deep. i say it meaning it has no bottom.'] },
        { at: function (d) { return d.stats.encounters >= 2; },
          lines: ['when the water goes flat like a held breath — that is not calm. that is something large staying very still.',
                  'the flatness is the shape of its back. you have been fishing on top of it.'],
          journal: 'stillness' },
        { at: function (d) { return d.unlockedLocations.indexOf('beneath') >= 0; },
          lines: ['so you went under the nowhere sea. not many do.',
                  'and you noticed it goes further. of course you did. that is why you came to tell me.'],
          journal: 'beneath' },
        { at: function (d) { return VF.charms.owned('eye') && VF.journal.hintCount() >= 2; },
          lines: ['one more, then. under everything, where the map is not a map of anything but a lid.',
                  'you will not find it by going deeper. you find it by already knowing it is there. i have told you. now you know.'],
          journal: 'thelast' },
        { at: function (d) { return VF.charms.owned('eye') && VF.journal.hintCount() >= 2 && d.level >= 45; },
          lines: ['take it. no, take it — my hands have stopped being any use for it.',
                  'sixty years of binding, one turn of cord at a time. the cord is not cord. i knew that by the second year and i kept binding.',
                  'it will hold anything you are foolish enough to hook. that is not encouragement.'],
          gives: 'rod:redthread' }
      ],
      alt: function () { return VF.quests.started('heavens') ? 'Elias' : null; },
      quest: [
        { at: function () { return VF.quests.started('heavens'); },
          lines: ['you have caught plenty of fish. you have never once caught anything that came from the sky.',
                  'no, sit down. long ago something fell out of the heavens and went into the ocean, and it was not a meteor. it was a rod.',
                  'a fisherman called astra made it. they say he could fish anywhere at all — over the trench, over the cloud, over places with no water in them to speak of. then he dropped it, or it was taken off him, and it came down.',
                  'my name is elias, by the way. you have never asked, and i have been sat here a long time.',
                  'the sky does not give up its secrets easily. start by catching what swims beneath the moon.'],
          quest: { id: 'heavens', advance: true }, journal: 'astra' },

        { at: function () { return VF.quests.reached('heavens', 2); },
          lines: ['put them on the stone. side by side. no — that way up.',
                  '...that is it. that is it, i have not seen that shape since i was a boy and a man who is dead now drew it in the sand for me.',
                  'it is not a picture of anything in the water. it is a bearing, and i cannot read it. i know exactly one person who can and i have not spoken to him in fifty years.',
                  'the astronomer. up where the ground runs out. tell him elias sent you and then stand well back.'],
          quest: { id: 'heavens', advance: true }, journal: 'scales' },

        { at: function (d) { return VF.quests.reached('heavens', 6) && d.stats.legendaryCatches >= 3; },
          lines: ['a piece of the compass. yes. i have had it in a tin since before you were born.',
                  'i was not keeping it from you. i was keeping it from the version of you that had never held anything that fought back.',
                  'three legendaries. that version of you is gone. here.'],
          quest: { id: 'heavens', flag: 'compass_fisherman' } },

        { at: function () { return VF.quests.complete('heavens'); },
          lines: ['so it finally chose someone.',
                  'do not look at me like that. i have been waiting to find out who, that is all.',
                  'if the heavens have chosen you...',
                  'then the ocean will come looking for you. it is not a threat. it is a schedule.',
                  'go home. rest the arm. it will not be long.'],
          journal: 'callofdeep' }
      ] },

    { id: 'drifter', name: 'The Drifter', role: 'wander', color: '#b8a8e8',
      where: 'wherever you were not looking a moment ago',
      blurb: 'Turns up. Does not arrive.',
      stages: [
        { at: function (d) { return d.stats.casts >= 40; },
          lines: ['oh — you are real. good. i lose track.',
                  'i left a lantern somewhere. if it turns up, it is not a gift, it is just where it ended up.'] },
        { at: function (d) { return Object.keys(d.secrets).length >= 1; },
          lines: ['you found one of the quiet ones. they move, you know.',
                  'not fast. but they are not where they were, and they were not where they are.'] },
        { at: function (d) { return VF.conditions && !!d.flags.sawThinPlace; },
          lines: ['thin places. yes. the water gets uncommitted.',
                  'i think they are looking for something as well. i have never worked out whether we are looking for the same thing.'],
          journal: 'thinplace' },
        { at: function (d) { return d.stats.wrongEvents >= 1; },
          lines: ['it stopped for you too, then.',
                  'do not tell the archivist. she will want to know for how long, and the answer is the frightening part.'],
          journal: 'firstwrong' },
        { at: function (d) { return VF.secrets.found('the_last_water'); },
          lines: ['ah.', 'i will not be coming with you. i have been. that is why i drift.'] }
      ],
      quest: [
        { at: function (d) { return VF.quests.reached('heavens', 6) && VF.charms.owned('lantern'); },
          lines: ['you have got it. the lantern. i wondered where that had ended up and now i know, which is worse.',
                  'i was not going to say a word about the compass. not to you, not to anybody. i have been not saying a word about it for a very long time.',
                  'but you went and found the one thing of mine that proves i was there when it was broken. so.',
                  'the needle. i have the needle. take it and do not tell the astronomer i was the one who had it.'],
          quest: { id: 'heavens', flag: 'compass_drifter' } }
      ] },

    /* Only turns up in the list once elias has said the name out loud. Every
       stage after the first is a chapter of the fallen star, so his dialogue
       and the quest cannot get out of step with one another. */
    { id: 'astronomer', name: 'The Astronomer', role: 'quest', color: '#ffd88a',
      where: 'up where the ground runs out, under a roof that opens',
      blurb: 'Watches the one part of the sky nothing is supposed to come out of.',
      stages: [],
      quest: [
        { at: function () { return VF.quests.reached('heavens', 3); },
          lines: ['no. i know what elias told you and the answer is no.',
                  'the heavens rod is not a treasure. it is a test, and i have watched it fail people who were better at this than you are.',
                  'so. three things. patience, precision, and fortune — and fortune is not luck, it is what you do with a spot you did not choose.',
                  'land one without ever letting it out of the bar. land one on a bar barely wide enough to be called one. and land something rare where i tell you to, not where you would rather.'],
          quest: { id: 'heavens', advance: true }, journal: 'astra' },

        { at: function () { return VF.quests.reached('heavens', 5); },
          lines: ['three. good. i did not expect three.',
                  'your scales are a constellation and the constellation is a bearing, and the bearing is to a place called the skyfall depths.',
                  'no, you cannot get there. nobody can. that is not pessimism, it is arithmetic — you need the celestial compass and the celestial compass was broken on purpose, into five pieces, by somebody who thought that was the responsible thing to do.',
                  'five people have them. i am not going to tell you which five. you already know all of them.'],
          quest: { id: 'heavens', advance: true } },

        { at: function () { return VF.quests.reached('heavens', 7); },
          lines: ['put them on the table. do not hand them to me.',
                  '...',
                  'it is not pointing north. it is not pointing at anything on the water at all.',
                  'it is pointing up. wait for a skyfall — the sky answers occasionally, and only in the deep water. fish through it. something will come down that did not fall.'],
          quest: { id: 'heavens', advance: true }, journal: 'compass' },

        { at: function () { return VF.quests.reached('heavens', 9); },
          lines: ['there is writing inside the scale. inside it. not on it.',
                  '"only the fisherman who can control the heavens may claim what fell from them."',
                  'i have read that sentence for forty years as a riddle. it is not a riddle. it is an instruction.',
                  'go and cast. it will find you — the storm first, then the lightning, then the void, and then the heavens themselves. four of them, and it does not stop between.'],
          quest: { id: 'heavens', advance: true } },

        { at: function () { return VF.quests.complete('heavens'); },
          lines: ['you did not find the heavens rod.',
                  'you proved you were worthy of it. those are not the same sentence and i would like you to remember which one this was.',
                  'there is water above the cloud now. the rod knows the way and it will not explain it to you. i have stopped asking things to explain themselves.',
                  'go on. i need to sit down.'] },

        { at: function (d) { return VF.quests.complete('heavens') && d.level >= 71; },
          lines: ['sit down. there is one more and i was never going to mention it until the sky was settled.',
                  'astra made two. everybody remembers the one that fell. this is the other one, and it did not fall, ' +
                  'it was left — with me, by somebody who did not say why, forty years ago.',
                  'rings of standing fire and a pair of wings at the hand. i have not been able to look straight at it since.',
                  'you are the one it is for. i am reasonably sure that was the arrangement.'],
          gives: 'rod:seraph' }
      ] },

    { id: 'collector', name: 'The Collector', role: 'cosmetic', color: '#e8a0c8',
      where: 'a stall of things that do nothing',
      blurb: 'Deals only in the useless. Very serious about it.',
      stages: [
        { at: function (d) { return d.level >= 4; },
          lines: ['none of this helps you fish. that is the entire appeal.',
                  'a case, if you like. brophys only. i have no interest in what you pull out of the water.'] },
        { at: function (d) { return d.stats.casesOpened >= 5; },
          lines: ['you are getting a feel for it. most people stop at two and pretend they were never interested.',
                  'the odds are printed. i print them because people assume i do not.'] },
        { at: function (d) { return d.cosmetics.length >= 12; },
          lines: ['twelve. good. there are some i do not sell, you understand — they turn up in the water.',
                  'no, i will not tell you which. that would ruin the only interesting part.'] },
        { at: function (d) { return d.cosmetics.length >= 26; },
          lines: ['at this point you have better taste than i do, which is professionally humiliating.',
                  'take this one. it was never for sale.'],
          gives: 'cosmetic' },
        { at: function (d) { return d.cosmetics.length >= 26 && d.level >= 65; },
          lines: ['there is a lead box behind the stall. there has always been a lead box behind the stall.',
                  'what is in it is not useless, which is why i have never once tried to sell it, and why it has been ' +
                  'behind the stall and not on it.',
                  'it lights the inside of your hand from the wrong side. i would like it out of my premises.'],
          gives: 'rod:halflife' }
      ],
      quest: [
        { at: function (d) { return VF.quests.reached('heavens', 6) && d.cosmetics.length >= 16; },
          lines: ['a compass piece. yes. it is the most useless object i own and i own a great deal of competition.',
                  'it does nothing. it points nowhere. it is a piece of a thing that has been broken longer than it was ever whole. i adore it.',
                  'sixteen useless things in your wardrobe. you understand the appeal now, which means i can part with it without feeling that it has gone somewhere unappreciative.',
                  'take it. do not put it back together in front of me.'],
          quest: { id: 'heavens', flag: 'compass_collector' } }
      ] }
  ];

  const BY_ID = VF.util.byId(LIST);

  const NOBODY = { met: 0, stage: 0, heard: [] };

  /* Read-only. Asking whether somebody has something to say must not create a
     record for them — that is a write, and it made "speak to all five of them"
     true for a player who had spoken to none of them. */
  function peek(id) {
    return VF.state.data.npcs[id] || NOBODY;
  }

  /* Writable. Only called when something actually happens with that person. */
  function rec(id) {
    const d = VF.state.data;
    if (!d.npcs[id]) d.npcs[id] = { met: 0, stage: 0, heard: [] };
    return d.npcs[id];
  }

  /* The highest entry in a track whose condition is satisfied. */
  function availableIn(list) {
    const d = VF.state.data;
    let n = -1;
    for (let i = 0; i < list.length; i++) {
      let ok = false;
      try { ok = list[i].at(d); } catch (e) { ok = false; }
      if (ok) n = i; else break;
    }
    return n;
  }
  function availableStage(npc) { return availableIn(npc.stages || []); }
  function availableQuest(npc) { return npc.quest ? availableIn(npc.quest) : -1; }

  function hasNew(id) {
    const npc = BY_ID[id];
    if (!npc) return false;
    const r = peek(id);
    if (availableQuest(npc) > (r.qstage | 0) - 1) return true;
    return availableStage(npc) > r.stage - 1;
  }

  /* Some people are introduced before they are named. */
  function nameOf(id) {
    const npc = BY_ID[id];
    if (!npc) return '';
    if (npc.alt) { try { return npc.alt(VF.state.data) || npc.name; } catch (e) { /* ignore */ } }
    return npc.name;
  }

  function anyNew() {
    for (let i = 0; i < LIST.length; i++) if (hasNew(LIST[i].id)) return true;
    return false;
  }

  /* Talking is what actually advances things — being eligible is not enough.

     Consuming the stage and handing over what it carries — a journal entry, a
     key, a quest step — happen together, in `commit`, which the visit calls
     once the conversation is over (or the moment the player walks away from
     it). They used to be separate: the counter moved when the conversation
     STARTED and the payload arrived at the end, so closing the tab halfway
     through burned the stage and delivered nothing. On a quest step that is
     unrecoverable — the log says go and see them and they have nothing left
     to say — and the autosave writes the broken state within eight seconds. */
  function talk(id, opts) {
    const npc = BY_ID[id];
    if (!npc) return null;
    const r = rec(id);
    // a thread that is actually running is what they lead with
    const qa = availableQuest(npc);
    const onQuest = qa >= (r.qstage | 0);
    const list = onQuest ? npc.quest : (npc.stages || []);
    const avail = onQuest ? qa : availableStage(npc);
    if (avail < 0) return null;
    const cur = onQuest ? (r.qstage | 0) : r.stage;
    const stage = Math.min(avail, cur);
    const def = list[stage];
    if (!def) return null;
    const first = stage >= cur;
    r.met++;
    let done = false;
    function commit() {
      if (done || !first) return;
      done = true;
      if (onQuest) {
        r.qstage = stage + 1;
      } else {
        r.stage = stage + 1;
        if (r.heard.indexOf(stage) < 0) r.heard.push(stage);
      }
      if (def.journal) VF.journal.add(def.journal);
      if (def.quest && VF.quests) VF.quests.fromNpc(def.quest);
      if (def.gives) VF.bus.emit('npc:gives', { npc: npc, gives: def.gives });
      VF.bus.emit('npc:advanced', { npc: npc, stage: stage });
      VF.save.save();
    }
    const res = { npc: npc, stage: stage, lines: def.lines, fresh: first, commit: commit };
    if (!(opts && opts.defer)) commit();
    return res;
  }

  function unlocked(id) {
    const npc = BY_ID[id];
    if (!npc) return false;
    return availableStage(npc) >= 0 || availableQuest(npc) >= 0 || peek(id).met > 0;
  }

  VF.npcs = {
    list: LIST,
    get: function (id) { return BY_ID[id] || null; },
    rec: rec, peek: peek, talk: talk, hasNew: hasNew, anyNew: anyNew,
    met: function (id) { return peek(id).met > 0; },
    name: nameOf,
    unlocked: unlocked, availableStage: availableStage, availableQuest: availableQuest
  };
})(window.VF = window.VF || {});
