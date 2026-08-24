/* VOID FISHING — journal entries.
   Written by the game as things happen. Read in order they tell you what this
   place is, and eventually where the last of it is. */
(function (VF) {
  'use strict';

  const ENTRIES = {
    bottle: { title: 'the note in the bottle', kind: 'find',
      text: 'the handwriting is careful and the ink is not wet. it reads: "the shore is not the first shore. count backwards." there is no signature.' },
    fossil: { title: 'on the fossil', kind: 'find',
      text: 'nothing here has bones like this. the archivist would say that means it did not come from here. she would then ask where it did come from, and wait.' },
    key: { title: 'the brass key', kind: 'find',
      text: 'the keeper turned it over twice and said he had a box it might open, and that the box was full of things nobody had claimed. he took it and gave you nothing, which felt fair at the time.' },
    plate: { title: 'the engraved plate', kind: 'lore',
      text: 'a list of names. then a date. then, much further down and in a different hand, a second date roughly four hundred years later. the same names.' },
    chart: { title: 'the ruined chart', kind: 'lore', hint: 1,
      text: 'most of it has dissolved. one marked position survives, well past the trench, in water the current charts leave blank. somebody drew a small circle there and did not write anything next to it.' },
    lens: { title: 'the clouded lens', kind: 'lore',
      text: 'looking through it at the water, the water is about a metre to the left of where it is. looking through it at the sky is not recommended and you will only do it once.' },
    voidfrag: { title: 'the fragment', kind: 'lore',
      text: 'it is cold in a way that has nothing to do with temperature. holding it, the sense of down gets much stronger, and points somewhere the trench does not go.' },
    lantern: { title: "the drifter's lantern", kind: 'lore',
      text: 'still lit. the flame is the wrong colour and does not move when you do. the drifter said he had left it somewhere, once, and did not seem surprised to hear where it turned up.' },
    fossilheart: { title: 'the warm fossil', kind: 'lore',
      text: 'stone all the way through, and warm. it beats, if you are patient and hold it long enough, about once every four minutes.' },
    eye: { title: 'the eye', kind: 'lore',
      text: 'it is open. it does not blink, it does not track, and it is definitely looking. the archivist would not take it and asked you to keep it somewhere she was not.' },
    strange: { title: 'the unidentifiable thing', kind: 'lore',
      text: 'you can describe every part of it. the parts do not add up to anything. writing this down has not helped.' },

    firstvoid: { title: 'the first void catch', kind: 'event',
      text: 'it came up wrong. not damaged — wrong, in the way a sentence can be grammatical and still mean nothing. it is in the fishdex now, which is the only reason you believe it happened.' },
    firstwrong: { title: 'the quiet minute', kind: 'event',
      text: 'the water stopped. not calmed — stopped, entirely, like a held frame. it lasted under a minute and then went back to being water. nothing was on the line before or after.' },
    stillness: { title: 'on dead calm', kind: 'event',
      text: 'the old fisherman says the water goes flat like that when something large is holding still underneath it, and that the flatness is the shape of its back.' },
    thinplace: { title: 'thin places', kind: 'event',
      text: 'the water gets uncommitted. you can see through it to somewhere that is not the bottom. the drifter calls these thin places and says they move, and that they are looking for something too.' },

    /* --- the fallen star --- */
    astra: { title: 'what elias said', kind: 'lore',
      text: 'long ago something came down out of the sky and went into the water, and it was not a meteor. it was a rod. it belonged to a fisherman called astra, who is supposed to have been able to fish anywhere at all, including places with no water in them. elias was told this by somebody who was old when elias was young.' },
    scales: { title: 'three scales', kind: 'find',
      text: 'laid out side by side on the stone they stop being three scales and start being three points. elias put a finger between them and drew the rest of it from memory, and then sat down, which he does not do.' },
    compass: { title: 'the celestial compass', kind: 'lore',
      text: 'brass, glass, and five pieces that were separated on purpose by somebody who thought it was better off broken. assembled, the needle does not lie down. it stands up.' },
    guardian: { title: 'the writing in the scale', kind: 'event',
      text: 'the guardian was not falling. it came down on purpose and it waited. inside the largest scale, not on it, there is a line of text: "only the fisherman who can control the heavens may claim what fell from them." the astronomer read it once and went very quiet.' },
    heavensrod: { title: 'the rod that came back down', kind: 'event',
      text: 'the light went out of everything for about two seconds. then a single column of it, and the rod at the bottom of the column, coming down slowly enough to catch. the astronomer said you had not found it. he said you had proved you were worthy of it, and then he asked you to leave, politely, because he needed to sit down.' },
    theheavens: { title: 'above the weather', kind: 'lore', hint: 1,
      text: 'there is water above the cloud. flat, lit from underneath, going out further than the sea does. the rod knows the way up and does not appear to need you to agree.' },
    callofdeep: { title: 'what elias said afterwards', kind: 'lore', hint: 1,
      text: 'he looked at the rod for a long time and did not touch it. "so it finally chose someone," he said, and then: "if the heavens have chosen you, the ocean will come looking for you." he would not say any more than that and he has gone back to facing away.' },

    beneath: { title: 'below the nowhere sea', kind: 'lore', hint: 1,
      text: 'the charts stop at the nowhere sea because the people drawing them stopped. it goes further. the old fisherman has been once and will not say how, only that you have to already know it is there.' },
    thelast: { title: 'the last water', kind: 'lore', hint: 2,
      text: 'every clue points the same direction and none of them name it. the chart circle, the plate\'s second date, the fragment\'s sense of down. there is one more place. it is not on the map because the map is what it is under.' },

    /* ---- what a place leaves ---- */
    nolog: { title: 'a log with no positions', kind: 'find',
      text: 'four hundred pages. a date, a depth and a catch on every one of them, and not one position anywhere. whoever kept it knew where they were and did not think it needed saying, or knew that saying it would not have helped.' },
    otherhook: { title: 'the other hook', kind: 'find', hint: 1,
      text: 'the same shape as the one on your line and about the size of a chair. the barb has been used. the shank is worn smooth in one place, the way a handle wears, which means something held it there for a long time and held it often.' },

    /* ---- count backwards ---- */
    shores: { title: 'the order of shores', kind: 'lore',
      text: 'the archivist laid the four charts out end to end and did not explain them. the coastline in the last one is the coastline in the first one, worn down by exactly as much as four hundred years would wear it. she said: you have been fishing the same shore the whole time. you have been fishing it at different ages.' },
    oldnames: { title: 'the same names twice', kind: 'lore',
      text: 'the plate lists eleven names, then a date. four hundred and six years further down, in a hand that is trying very hard to look like the first hand, the same eleven names again. she has a third list. she will not say where the third list is from and she will not say what the date on it is.' },
    countback: { title: 'count backwards', kind: 'lore',
      text: 'the note in the bottle said count backwards and everyone who read it counted years. the archivist counted shores. there are eight. she says the eighth is not a shore, it is where a shore stops being possible, and that whoever wrote the note got there before we did and came back to leave it.' },
    plategift: { title: 'the older plate', kind: 'find',
      text: 'she gave it to you face down and asked you not to turn it over in front of her. the names on it are not finished. there is room left at the bottom and the room is not accidental.' },

    /* ---- what the drifter left ---- */
    driftname: { title: 'a name that is not his', kind: 'lore',
      text: 'the drifter remembered a name today. he said it twice, carefully, the way you say something you have been keeping. then he asked whose it was. it was not his. he has been carrying somebody else\'s name for long enough to have forgotten it was borrowed.' },
    errand: { title: "the drifter's errand", kind: 'lore',
      text: 'he did not leave the lantern behind. he put it down where it would be found, which is a different thing, and he has done it before, and he will not say how many times. he says the light does not go out. he says that is the problem.' },
    nightglass: { title: 'night glass', kind: 'find',
      text: 'a disc of something that is not glass, ground flat on one side. held up to a dark window it shows the same dark, a little closer. he said keep it, and then he said he was sorry, and he would not say which one he meant.' }
  };

  /* Add an entry once. Later entries never overwrite earlier ones. */
  function add(id, extra) {
    const d = VF.state.data;
    const def = ENTRIES[id];
    if (!def) return false;
    for (let i = 0; i < d.journal.length; i++) if (d.journal[i].id === id) return false;
    d.journal.push({
      id: id, title: def.title, text: extra ? def.text + ' ' + extra : def.text,
      kind: def.kind, hint: def.hint || 0, at: Date.now()
    });
    if (d.journal.length > 300) d.journal.shift();
    VF.bus.emit('journal:entry', def);
    return true;
  }

  function has(id) {
    const d = VF.state.data;
    for (let i = 0; i < d.journal.length; i++) if (d.journal[i].id === id) return true;
    return false;
  }

  /* How many of the entries that actually point somewhere the player has. */
  function hintCount() {
    const d = VF.state.data;
    let n = 0;
    for (let i = 0; i < d.journal.length; i++) n += d.journal[i].hint || 0;
    return n;
  }

  VF.journal = { entries: ENTRIES, add: add, has: has, hintCount: hintCount };
})(window.VF = window.VF || {});
