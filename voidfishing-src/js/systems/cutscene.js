/* VOID FISHING — the two sequences.

   Nothing in the game stops to show you something. These two do, because
   there are only ever two of them and the point of the tier is that landing
   one is an event rather than an entry.

   A sequence is a list of beats. A beat holds a duration, a line to put on
   screen, and the values the scene should be easing toward while it runs —
   how dark the frame is, how much of the shape is out of the water, how big
   the shadow underneath is. The module eases; the renderer reads; neither
   knows anything about the other's business.

   It can always be skipped, and skipping is not a lesser version: the catch
   card is the same card either way and the record is already written. */
(function (VF) {
  'use strict';

  const U = VF.util;

  const SCENES = {
    nessie: {
      audio: 'void',
      /* box  how much of the frame the figure may fill, [of height, of width]
         top  reach above its own centre, in half-heights — what must be in shot
         bot  reach below it
         surf where its waterline sits down the water band                    */
      frame: { box: [1.10, 1.15], top: 1.00, bot: 0.50, surf: 0.62, sink: 0.36 },
      beats: [
        { dur: 2.0, dark: 0.55, shadow: 0.0, rise: 0,
          text: 'the water goes flat. all the way out to the horizon, flat.' },
        { dur: 2.6, dark: 0.72, shadow: 1.0, rise: 0,
          text: 'something the width of the bay passes underneath you, and keeps passing.' },
        { dur: 3.2, dark: 0.58, shadow: 0.45, rise: 0.62, shake: 1,
          text: 'and then it stops. and then it comes up.' },
        { dur: 3.0, dark: 0.30, shadow: 0.10, rise: 1, lit: 1, flash: 1,
          name: 1, text: 'Nessie' },
        { dur: 2.4, dark: 0.20, shadow: 0, rise: 1, lit: 1,
          text: 'nobody is going to believe you. you were not going to tell them.' }
      ]
    },
    oscar: {
      audio: 'grand',
      frame: { box: [0.76, 0.55], top: 0.90, bot: 0.95, surf: 0.58 },
      beats: [
        { dur: 2.0, dark: 0.50, shadow: 0, rise: 0,
          text: 'the line comes up light. far too light for what it is holding.' },
        { dur: 2.6, dark: 0.62, shadow: 0.30, rise: 0.28,
          text: 'a hand breaks the surface. then a shoulder. then he stands up.' },
        { dur: 3.0, dark: 0.34, shadow: 0.10, rise: 0.86, lit: 0.6,
          text: 'he is dry. he has been down there and he is dry.' },
        { dur: 3.0, dark: 0.18, shadow: 0, rise: 1, lit: 1, flash: 1,
          name: 1, text: 'Oscar Brophy' },
        { dur: 3.0, dark: 0.14, shadow: 0, rise: 1, lit: 1,
          text: 'every coin you have ever been paid has his name on it. ' +
                'nobody at the mint has ever been able to say why.' }
      ]
    }
  };

  /* Everything from the void tier up comes up in front of you rather than
     straight onto the card. These run every time one is landed, so they are
     short, and they are written to fit any species in their tier — the name
     beat takes the name off whatever was actually caught. */
  SCENES.voidcatch = {
    audio: 'void',
    frame: { box: [0.66, 0.56], top: 0.88, bot: 0.88, surf: 0.60 },
    beats: [
      { dur: 1.5, dark: 0.56, shadow: 0.42, rise: 0,
        text: 'the water goes quiet in a circle around the line.' },
      { dur: 2.1, dark: 0.44, shadow: 0.12, rise: 0.92, lit: 0.55, shake: 1,
        text: 'it does not thrash. it arrives.' },
      { dur: 2.0, dark: 0.24, shadow: 0, rise: 1, lit: 1, flash: 1, name: 1 }
    ]
  };

  SCENES.glitchcatch = {
    audio: 'glitch',
    frame: { box: [0.62, 0.54], top: 0.86, bot: 0.86, surf: 0.58 },
    beats: [
      { dur: 1.4, dark: 0.64, shadow: 0.30, rise: 0,
        text: 'the line reads a weight. nothing else agrees.' },
      { dur: 2.0, dark: 0.48, shadow: 0.10, rise: 0.94, lit: 0.5, shake: 1,
        text: 'it is on the stone before it is out of the water.' },
      { dur: 2.0, dark: 0.22, shadow: 0, rise: 1, lit: 1, flash: 1, name: 1 }
    ]
  };

  /* Which sequence a catch gets when the species does not name its own. */
  function forCatch(c) {
    if (!c || c.kind !== 'fish' || !c.fish) return null;
    if (c.fish.cutscene) return c.fish.cutscene;
    const rank = VF.rarities.rank(c.rarity);
    if (rank >= 7) return 'glitchcatch';
    if (rank >= 6) return 'voidcatch';
    return null;
  }

  const S = {
    id: null, def: null, i: 0, t: 0, elapsed: 0,
    dark: 0, shadow: 0, rise: 0, lit: 0,
    fish: null, done: null, closing: 0
  };

  let el = null, textEl = null, moreEl = null;

  function dom() {
    if (el) return;
    el = document.getElementById('cutscene');
    textEl = document.getElementById('cutsceneText');
    moreEl = document.getElementById('cutsceneMore');
  }

  function active() { return !!S.id; }

  function play(id, fish, onDone) {
    const def = SCENES[id];
    if (!def) { if (onDone) onDone(); return false; }
    dom();
    S.id = id; S.def = def; S.i = 0; S.t = 0; S.elapsed = 0;
    S.dark = 0; S.shadow = 0; S.rise = 0; S.lit = 0; S.closing = 0;
    S.fish = fish || null;
    S.done = onDone || null;
    VF.state.rt.panelOpen = 'cutscene';
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('gone');
    if (el) el.classList.remove('hidden', 'out');
    beat(0);
    VF.audio.duck(1);
    VF.audio.stinger(def.audio, 7);
    VF.bus.emit('cutscene:start', { id: id });
    return true;
  }

  function beat(n) {
    S.i = n; S.t = 0;
    const b = S.def.beats[n];
    if (!b) return;
    if (textEl) {
      // a name beat with no line of its own says what was actually landed
      textEl.textContent = b.text ||
        (b.name && S.fish && S.fish.fish ? S.fish.fish.name : '');
      /* The rest of the game is lowercase on purpose. A name is the one place
         that reads as a shrug rather than a style, so the two reveal beats
         opt out of it. */
      textEl.classList.toggle('cut-name', !!b.name);
      // restart the entry animation for each line
      textEl.style.animation = 'none';
      void textEl.offsetWidth;
      textEl.style.animation = '';
    }
    if (b.flash) {
      VF.fx.flash('rgba(255,246,220,0.55)', 0.9, 1.4);
      VF.fx.pulse(0.8);
      VF.audio.stinger('grand', 6);
    }
    if (b.shake) VF.fx.shake(7, 2.4);
    VF.bus.emit('cutscene:beat', { id: S.id, index: n });
  }

  function finish() {
    const cb = S.done;
    const hud = document.getElementById('hud');
    if (hud) hud.classList.remove('gone');
    if (el) el.classList.add('hidden');
    S.id = null; S.def = null; S.fish = null; S.done = null;
    S.dark = 0; S.shadow = 0; S.rise = 0; S.lit = 0;
    VF.state.rt.panelOpen = null;
    VF.bus.emit('cutscene:end', {});
    if (cb) cb();
  }

  /* A skip is not a shortcut past the reward — the catch is already recorded
     and the card is the same card. It only stops the waiting. */
  function skip() {
    if (!S.id || S.closing) return false;
    if (S.elapsed < 0.6) return true;   // swallow the press that opened it
    S.closing = 0.35;
    if (el) el.classList.add('out');
    return true;
  }

  function tick(dt) {
    if (!S.id) return;
    S.elapsed += dt;
    if (S.closing > 0) {
      S.closing -= dt;
      if (S.closing <= 0) finish();
      return;
    }
    const b = S.def.beats[S.i];
    if (!b) { finish(); return; }
    S.t += dt;

    S.dark = U.approach(S.dark, b.dark || 0, 0.02, dt);
    S.shadow = U.approach(S.shadow, b.shadow || 0, 0.05, dt);
    S.rise = U.approach(S.rise, b.rise || 0, 0.12, dt);
    S.lit = U.approach(S.lit, b.lit || 0, 0.08, dt);

    // the prompt only offers itself once the line has had time to be read
    if (moreEl) moreEl.style.opacity = S.elapsed > 1.8 ? '1' : '0';

    if (S.t >= b.dur) {
      if (S.i + 1 >= S.def.beats.length) { S.closing = 0.5; if (el) el.classList.add('out'); return; }
      beat(S.i + 1);
    }
  }

  VF.cutscene = {
    play: play, tick: tick, skip: skip, active: active,
    scenes: SCENES, forCatch: forCatch,
    /* What the renderer reads. */
    state: function () {
      return S.id ? { id: S.id, fish: S.fish, frame: S.def.frame, dark: S.dark,
                      shadow: S.shadow, rise: S.rise, lit: S.lit, t: S.elapsed } : null;
    }
  };
})(window.VF = window.VF || {});
