/* VOID FISHING — procedural audio.
   Everything is synthesised at runtime. The chain is:

     voices -> musicBus / sfxBus -> master -> limiter -> warmth -> out
                       \-> reverb send -> convolver -> master

   The limiter is what keeps overlapping effects from turning brittle, and the
   warmth filter rolls off the top end so nothing sounds like a test tone. */
(function (VF) {
  'use strict';

  const U = VF.util;

  let ac = null;
  let ready = false;
  let master, limiter, warmth, musicBus, sfxBus, verb, verbSend, sfxVerbSend;
  let beds = null;
  let music = null;
  let reelLoop = null;
  let ducking = 0;
  let fightDuck = 0;   // eases the ambient bed back while a fish is on the line

  /* ------------------------------------------------------------- buffers */
  let noiseWhite = null, noiseBrown = null, noisePink = null;

  function makeNoise(kind) {
    const len = ac.sampleRate * 4;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    } else if (kind === 'pink') {
      // Voss-McCartney: warmer than white, less rumbly than brown
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return b;
  }

  /* A reverb tail with a short pre-delay and a darkening sweep, which reads as
     a large soft space rather than a metallic spring. */
  function makeImpulse(seconds, decay) {
    const rate = ac.sampleRate;
    const len = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.02);
    const b = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        if (i < pre) { d[i] = 0; continue; }
        const t = (i - pre) / (len - pre);
        const env = Math.pow(1 - t, decay);
        // one-pole lowpass that closes as the tail decays
        const cut = 0.42 - t * 0.34;
        lp += cut * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * env;
      }
    }
    return b;
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }

    noiseWhite = makeNoise('white');
    noiseBrown = makeNoise('brown');
    noisePink = makeNoise('pink');

    /* --- output chain --- */
    warmth = ac.createBiquadFilter();
    warmth.type = 'highshelf';
    warmth.frequency.value = 4200;
    warmth.gain.value = -4.0;
    warmth.connect(ac.destination);

    limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 22;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.22;
    limiter.connect(warmth);

    master = ac.createGain();
    master.gain.value = VF.state.data.settings.master;
    master.connect(limiter);

    verb = ac.createConvolver();
    verb.buffer = makeImpulse(4.6, 2.2);
    const verbReturn = ac.createGain();
    verbReturn.gain.value = 0.85;
    verb.connect(verbReturn);
    verbReturn.connect(master);

    verbSend = ac.createGain();
    verbSend.gain.value = 0.55;
    verbSend.connect(verb);

    sfxVerbSend = ac.createGain();
    sfxVerbSend.gain.value = 0.16;
    sfxVerbSend.connect(verb);

    musicBus = ac.createGain();
    musicBus.gain.value = VF.state.data.settings.music;
    musicBus.connect(master);
    musicBus.connect(verbSend);

    sfxBus = ac.createGain();
    sfxBus.gain.value = VF.state.data.settings.sfx;
    sfxBus.connect(master);
    sfxBus.connect(sfxVerbSend);

    buildBeds();
    buildMusic();
    ready = true;
    return true;
  }

  function pan(v) {
    if (!ac.createStereoPanner) return null;
    const p = ac.createStereoPanner();
    p.pan.value = v;
    return p;
  }

  function loopSource(buffer, rate) {
    const s = ac.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start();
    return s;
  }

  /* ------------------------------------------------------- ambient beds */

  function buildBeds() {
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(sfxBus);

    /* water: two brown-noise layers at different rates, each breathing on its
       own slow filter, so the surface never settles into a loop */
    const wGain = ac.createGain(); wGain.gain.value = 0;
    wGain.connect(out);
    for (let i = 0; i < 2; i++) {
      const src = loopSource(noiseBrown, 0.85 + i * 0.35);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340 + i * 220;
      lp.Q.value = 0.5;
      const g = ac.createGain();
      g.gain.value = i ? 0.55 : 1;
      const p = pan(i ? 0.35 : -0.35);
      src.connect(lp); lp.connect(g);
      if (p) { g.connect(p); p.connect(wGain); } else { g.connect(wGain); }

      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.055 + i * 0.031;
      const lfoG = ac.createGain(); lfoG.gain.value = 130;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();

      // slow swell, so the water breathes
      const amp = ac.createOscillator();
      amp.frequency.value = 0.07 + i * 0.04;
      const ampG = ac.createGain(); ampG.gain.value = 0.28;
      amp.connect(ampG); ampG.connect(g.gain); amp.start();
    }

    /* wind: pink noise through a wandering bandpass */
    const nSrc = loopSource(noisePink);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 560; bp.Q.value = 0.7;
    const nGain = ac.createGain(); nGain.gain.value = 0;
    nSrc.connect(bp); bp.connect(nGain); nGain.connect(out);
    const lfo2 = ac.createOscillator();
    lfo2.frequency.value = 0.037;
    const lfo2G = ac.createGain(); lfo2G.gain.value = 260;
    lfo2.connect(lfo2G); lfo2G.connect(bp.frequency); lfo2.start();

    /* rain: bright noise, softened so it hisses rather than sizzles */
    const rSrc = loopSource(noisePink, 1.6);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1300;
    const rlp = ac.createBiquadFilter();
    rlp.type = 'lowpass'; rlp.frequency.value = 6200;
    const rGain = ac.createGain(); rGain.gain.value = 0;
    rSrc.connect(hp); hp.connect(rlp); rlp.connect(rGain); rGain.connect(out);

    /* the deep drone that grows as the locations get further out */
    const dGain = ac.createGain(); dGain.gain.value = 0;
    dGain.connect(master);
    const dLp = ac.createBiquadFilter();
    dLp.type = 'lowpass'; dLp.frequency.value = 180;
    dLp.connect(dGain);
    const dOsc = ac.createOscillator();
    dOsc.type = 'sine'; dOsc.frequency.value = 42;
    dOsc.connect(dLp); dOsc.start();
    const dOsc2 = ac.createOscillator();
    dOsc2.type = 'sine'; dOsc2.frequency.value = 42 * 1.5;
    const d2g = ac.createGain(); d2g.gain.value = 0.28;
    dOsc2.connect(d2g); d2g.connect(dLp); dOsc2.start();

    beds = { water: wGain, wind: nGain, rain: rGain, drone: dGain, droneOsc: dOsc, droneOsc2: dOsc2 };
  }

  /* -------------------------------------------------------------- music */

  function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  /* Two banks of voices. A chord change crossfades between them instead of
     gliding, which avoids the dissonant sweep of retuning a sounding note. */
  function makeBank(dest) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(dest);
    const voices = [];
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = 110;
      const vg = ac.createGain();
      vg.gain.value = i === 0 ? 0.62 : 0.30;
      const p = pan((i - 1) * 0.45);
      o.connect(vg);
      if (p) { vg.connect(p); p.connect(g); } else { vg.connect(g); }
      // each voice drifts on its own slow detune, which is what keeps a pad
      // from sounding like an organ
      const drift = ac.createOscillator();
      drift.frequency.value = 0.05 + i * 0.023;
      const driftG = ac.createGain();
      driftG.gain.value = 4 + i * 2.5;
      drift.connect(driftG); driftG.connect(o.detune);
      drift.start();
      o.start();
      voices.push(o);
    }
    return { gain: g, voices: voices };
  }

  /* Two modulated delay lines, panned apart: cheap, wide, and very smooth. */
  function makeChorus(input, output) {
    for (let i = 0; i < 2; i++) {
      const d = ac.createDelay(0.08);
      d.delayTime.value = 0.016 + i * 0.011;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.11 + i * 0.06;
      const lg = ac.createGain();
      lg.gain.value = 0.0035;
      lfo.connect(lg); lg.connect(d.delayTime); lfo.start();
      const p = pan(i ? 0.7 : -0.7);
      const wet = ac.createGain();
      wet.gain.value = 0.42;
      input.connect(d); d.connect(wet);
      if (p) { wet.connect(p); p.connect(output); } else { wet.connect(output); }
    }
  }

  function buildMusic() {
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(musicBus);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.35;
    lp.connect(out);
    makeChorus(lp, out);

    const banks = [makeBank(lp), makeBank(lp)];
    banks[0].gain.gain.value = 1;

    /* a sub an octave below the root, felt more than heard */
    const sub = ac.createOscillator();
    sub.type = 'sine';
    const subG = ac.createGain(); subG.gain.value = 0;
    sub.connect(subG); subG.connect(musicBus); sub.start();

    music = {
      out: out, lp: lp, banks: banks, active: 0, sub: sub, subG: subG,
      nextChord: 0.5, nextNote: 3, tension: 0
    };
  }

  const CHORD_FADE = 5.0;

  function setChord() {
    if (!music) return;
    const loc = VF.locations.current();
    const sc = loc.music.scale;
    const root = loc.music.root + (VF.rng.g() < 0.28 ? 12 : 0);
    const off = VF.rng.g.int(0, sc.length - 1);
    const next = 1 - music.active;
    const bank = music.banks[next];
    const degs = [0, 2, 4];
    for (let i = 0; i < bank.voices.length; i++) {
      const di = off + degs[i];
      const d = sc[di % sc.length] + 12 * Math.floor(di / sc.length);
      bank.voices[i].frequency.setValueAtTime(midiHz(root + d), ac.currentTime);
    }
    const now = ac.currentTime;
    bank.gain.gain.setTargetAtTime(1, now, CHORD_FADE * 0.4);
    music.banks[music.active].gain.gain.setTargetAtTime(0, now, CHORD_FADE * 0.4);
    music.active = next;
    music.sub.frequency.setTargetAtTime(midiHz(root - 12 + sc[off % sc.length]), now, 3.5);
  }

  /* A struck tone with a second partial and a soft attack — closer to a
     marimba than a test sine. */
  function bell(note, when, gainAmt, decay, panPos, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gainAmt, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, when);
    lp.frequency.exponentialRampToValueAtTime(700, when + decay * 0.7);
    g.connect(lp);

    /* Route through a bus, never straight to the reverb send: a direct connect
       leaks past the volume that is supposed to control it. */
    const out = dest || sfxBus;
    const p = pan(panPos === undefined ? 0 : panPos);
    if (p) { lp.connect(p); p.connect(out); } else { lp.connect(out); }

    const partials = [[1, 1], [2.01, 0.26], [3.02, 0.09]];
    for (let i = 0; i < partials.length; i++) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiHz(note) * partials[i][0];
      const pg = ac.createGain();
      pg.gain.value = partials[i][1];
      o.connect(pg); pg.connect(g);
      o.start(when);
      o.stop(when + decay + 0.1);
    }
  }

  /* --------------------------------------------------------------- tick */

  function tick(dt) {
    if (!ready || ac.state !== 'running') return;
    const now = ac.currentTime;
    const loc = VF.locations.current();

    const wet = VF.weather.rain();
    const wind = VF.weather.wind();
    const depth = VF.locations.index(loc.id) / 7;
    const duck = 1 - ducking * 0.8;

    fightDuck = U.approach(fightDuck, reelLoop ? 1 : 0, 0.05, dt);
    const bedDuck = duck * (1 - fightDuck * 0.42);
    beds.water.gain.setTargetAtTime(0.20 * bedDuck * (1 - depth * 0.32), now, 0.7);
    beds.wind.gain.setTargetAtTime((0.014 + wind * 0.05) * bedDuck, now, 1.0);
    beds.rain.gain.setTargetAtTime(wet * 0.055 * duck, now, 0.8);
    beds.drone.gain.setTargetAtTime((0.010 + depth * 0.055) * duck, now, 1.8);
    const dh = 38 - depth * 12;
    beds.droneOsc.frequency.setTargetAtTime(dh, now, 4);
    beds.droneOsc2.frequency.setTargetAtTime(dh * 1.5, now, 4);

    music.nextChord -= dt;
    if (music.nextChord <= 0) {
      music.nextChord = 13 + VF.rng.g() * 11;
      setChord();
    }
    music.out.gain.setTargetAtTime(0.105 * loc.music.pad * duck, now, 3.0);
    music.subG.gain.setTargetAtTime(0.038 * loc.music.pad * duck, now, 3.0);
    music.lp.frequency.setTargetAtTime(760 + depth * 340 + music.tension * 700, now, 1.4);

    music.nextNote -= dt;
    if (music.nextNote <= 0) {
      music.nextNote = 4.5 + VF.rng.g() * 10 / (0.4 + loc.music.tempo * 4);
      const sc = loc.music.scale;
      const oct = VF.rng.g() < 0.32 ? 36 : 24;
      const n = loc.music.root + oct + sc[VF.rng.g.int(0, sc.length - 1)];
      const p = VF.rng.g.range(-0.55, 0.55);
      bell(n, now + 0.02, 0.068, 3.0 + VF.rng.g() * 2.6, p, musicBus);
      // an answering note, quieter and off to the other side
      if (VF.rng.g() < 0.4) {
        const n2 = n + sc[VF.rng.g.int(0, sc.length - 1)] - sc[0];
        bell(n2, now + 0.55 + VF.rng.g() * 0.5, 0.038, 2.6, -p, musicBus);
      }
    }

    ducking = Math.max(0, ducking - dt * 0.45);
  }

  /* --------------------------------------------------------------- sfx
     Every envelope opens and closes on a ramp. Instant starts and stops are
     what make small synthesised effects sound like clicks. */

  function env(node, when, attack, decay, peak, dest) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0004, when + attack + decay);
    g.gain.linearRampToValueAtTime(0, when + attack + decay + 0.02);
    node.connect(g);
    g.connect(dest || sfxBus);
    return g;
  }

  function noiseBurst(when, dur, filterType, freq, peak, sweepTo, opts) {
    opts = opts || {};
    const s = ac.createBufferSource();
    s.buffer = opts.pink === false ? noiseWhite : noisePink;
    s.playbackRate.value = 0.75 + Math.random() * 0.5;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.Q.value = opts.q === undefined ? 0.8 : opts.q;
    f.frequency.setValueAtTime(freq, when);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), when + dur);
    s.connect(f);
    let node = f;
    if (opts.pan !== undefined) {
      const p = pan(opts.pan);
      if (p) { f.connect(p); node = p; }
    }
    env(node, when, opts.attack === undefined ? 0.012 : opts.attack, dur, peak, opts.dest);
    s.start(when);
    s.stop(when + dur + 0.12);
  }

  function tone(when, freq, dur, type, peak, sweepTo, opts) {
    opts = opts || {};
    const o = ac.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, when);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), when + dur);
    let node = o;
    if (opts.lp) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.lp;
      o.connect(f); node = f;
    }
    if (opts.pan !== undefined) {
      const p = pan(opts.pan);
      if (p) { node.connect(p); node = p; }
    }
    env(node, when, opts.attack === undefined ? 0.014 : opts.attack, dur, peak, opts.dest);
    o.start(when);
    o.stop(when + dur + 0.12);
    return o;
  }

  const SFX = {
    click: function () { tone(ac.currentTime, 880, 0.07, 'sine', 0.05, 660, { attack: 0.004, lp: 2600 }); },
    hover: function () { tone(ac.currentTime, 1320, 0.045, 'sine', 0.016, 1180, { attack: 0.004, lp: 3200 }); },
    back:  function () { tone(ac.currentTime, 620, 0.10, 'sine', 0.045, 420, { attack: 0.006, lp: 2000 }); },
    error: function () {
      const n = ac.currentTime;
      tone(n, 196, 0.20, 'triangle', 0.045, 150, { lp: 900 });
      tone(n + 0.04, 165, 0.22, 'triangle', 0.030, 130, { lp: 800 });
    },
    buy: function () {
      const n = ac.currentTime;
      bell(76, n, 0.07, 0.9, -0.2);
      bell(83, n + 0.075, 0.06, 1.3, 0.2);
    },
    charge: function () {
      const n = ac.currentTime;
      return tone(n, 150, VF.fishing.CAST_CHARGE_TIME * 1.05, 'triangle', 0.020, 460,
                  { attack: 0.08, lp: 1400 });
    },
    cast: function (power) {
      const n = ac.currentTime;
      // air moving past the blank, then the line paying out
      noiseBurst(n, 0.30 + power * 0.20, 'bandpass', 700 + power * 700, 0.085, 220,
                 { q: 1.1, attack: 0.05, pan: -0.25 });
      tone(n, 280 + power * 180, 0.20, 'sine', 0.022, 160, { attack: 0.03, lp: 900 });
    },
    splash: function (size) {
      const n = ac.currentTime;
      size = size === undefined ? 1 : size;
      noiseBurst(n, 0.11 * size, 'lowpass', 2200, 0.13 * size, 480, { attack: 0.004 });
      noiseBurst(n + 0.03, 0.42 * size, 'bandpass', 620, 0.075 * size, 190, { q: 0.9, attack: 0.02 });
      tone(n, 175, 0.24 * size, 'sine', 0.045 * size, 85, { attack: 0.006, lp: 500 });
    },
    nibble: function () {
      noiseBurst(ac.currentTime, 0.07, 'bandpass', 1500, 0.030, 800, { q: 1.4, attack: 0.006 });
    },
    bite: function (rank) {
      const n = ac.currentTime;
      noiseBurst(n, 0.24, 'lowpass', 1200, 0.16, 280, { attack: 0.005 });
      tone(n, 140, 0.36, 'sine', 0.10, 72, { attack: 0.006, lp: 600 });
      tone(n + 0.015, 470, 0.26, 'triangle', 0.038, 820, { attack: 0.008, lp: 2400 });
      if (rank >= 4) {
        tone(n + 0.05, 82, 1.2, 'sine', 0.095, 52, { attack: 0.04, lp: 300 });
        ducking = 0.85;
      }
    },

    /* A ratchet, not a whistle: filtered noise gated by an audio-rate LFO so
       it clicks, with a little body underneath. */
    reelStart: function () {
      if (reelLoop) return;
      const s = loopSource(noiseWhite, 0.7);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.6;
      const gate = ac.createGain(); gate.gain.value = 0.5;
      const lfo = ac.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 26;
      const lfoG = ac.createGain(); lfoG.gain.value = 0.5;
      lfo.connect(lfoG); lfoG.connect(gate.gain); lfo.start();
      const out = ac.createGain(); out.gain.value = 0;
      out.gain.setTargetAtTime(0.095, ac.currentTime, 0.06);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 4200;
      s.connect(bp); bp.connect(gate); gate.connect(lp); lp.connect(out); out.connect(sfxBus);

      const body = ac.createOscillator();
      body.type = 'triangle'; body.frequency.value = 92;
      const bodyG = ac.createGain(); bodyG.gain.value = 0;
      bodyG.gain.setTargetAtTime(0.030, ac.currentTime, 0.1);
      body.connect(bodyG); bodyG.connect(sfxBus); body.start();

      reelLoop = { src: s, out: out, filt: bp, lfo: lfo, body: body, bodyG: bodyG };
    },
    reelStop: function () {
      if (!reelLoop) return;
      const r = reelLoop; reelLoop = null;
      const n = ac.currentTime;
      r.out.gain.setTargetAtTime(0, n, 0.05);
      r.bodyG.gain.setTargetAtTime(0, n, 0.05);
      setTimeout(function () {
        try { r.src.stop(); r.lfo.stop(); r.body.stop(); } catch (e) { /* already stopped */ }
      }, 320);
    },
    reelTension: function (v) {
      if (!reelLoop) return;
      const n = ac.currentTime;
      reelLoop.filt.frequency.setTargetAtTime(1100 + v * 2200, n, 0.10);
      reelLoop.lfo.frequency.setTargetAtTime(18 + v * 30, n, 0.10);
      reelLoop.out.gain.setTargetAtTime(0.080 + v * 0.120, n, 0.10);
      reelLoop.body.frequency.setTargetAtTime(80 + v * 55, n, 0.12);
    },
    strain: function (v) {
      tone(ac.currentTime, 700 + v * 500, 0.18, 'triangle', 0.018 * v, null, { attack: 0.05, lp: 2000 });
    },
    snap: function () {
      const n = ac.currentTime;
      noiseBurst(n, 0.09, 'highpass', 2400, 0.20, null, { attack: 0.002, pink: false });
      tone(n, 1150, 0.10, 'triangle', 0.055, 220, { attack: 0.002, lp: 4000 });
      tone(n + 0.04, 120, 0.65, 'sine', 0.05, 62, { attack: 0.01, lp: 400 });
    },
    surge: function () {
      const n = ac.currentTime;
      noiseBurst(n, 0.5, 'lowpass', 700, 0.075, 200, { attack: 0.06 });
      tone(n, 104, 0.55, 'sine', 0.055, 66, { attack: 0.05, lp: 400 });
    },

    stinger: function (kind, rank) {
      const n = ac.currentTime;
      const loc = VF.locations.current();
      const root = loc.music.root + 12;
      const sc = loc.music.scale;
      if (kind === 'soft') {
        bell(root + 12 + sc[0], n, 0.075, 1.8, -0.25);
        bell(root + 12 + sc[2], n + 0.10, 0.060, 2.2, 0.25);
      } else if (kind === 'bright') {
        for (let i = 0; i < 4; i++) {
          bell(root + 12 + sc[i % sc.length] + (i > 2 ? 12 : 0), n + i * 0.085, 0.075, 2.4,
               (i % 2 ? 0.4 : -0.4));
        }
      } else if (kind === 'grand') {
        ducking = 1;
        for (let i = 0; i < 6; i++) {
          bell(root + sc[i % sc.length] + 12 * Math.floor(i / sc.length), n + i * 0.10, 0.085, 3.6,
               (i / 5 - 0.5) * 1.1);
        }
        tone(n, 62, 2.6, 'sine', 0.085, 46, { attack: 0.06, lp: 260 });
      } else if (kind === 'void') {
        ducking = 1;
        tone(n, 46, 3.8, 'sine', 0.12, 32, { attack: 0.15, lp: 220 });
        for (let i = 0; i < 5; i++) {
          bell(root - 12 + sc[i % sc.length], n + i * 0.19, 0.095, 5.0, (i / 4 - 0.5) * 1.2);
        }
        noiseBurst(n, 2.0, 'lowpass', 340, 0.05, 80, { attack: 0.5 });
      } else {
        ducking = 1;
        for (let i = 0; i < 8; i++) {
          tone(n + i * 0.05, 180 + Math.random() * 1800, 0.10, 'triangle', 0.040,
               null, { attack: 0.004, lp: 3000, pan: Math.random() * 1.6 - 0.8 });
        }
        tone(n, 39, 3.2, 'sine', 0.12, 28, { attack: 0.1, lp: 200 });
      }
    },
    levelUp: function () {
      const n = ac.currentTime;
      const sc = VF.locations.current().music.scale;
      const root = VF.locations.current().music.root + 24;
      for (let i = 0; i < 4; i++) bell(root + sc[i % sc.length], n + i * 0.085, 0.085, 2.2, (i - 1.5) * 0.35);
    },
    discover: function () {
      const n = ac.currentTime;
      tone(n, 760, 0.4, 'sine', 0.050, 1420, { attack: 0.05, lp: 3000, pan: -0.3 });
      tone(n + 0.14, 1140, 0.6, 'sine', 0.036, 1900, { attack: 0.06, lp: 3600, pan: 0.3 });
    },
    achievement: function () {
      const n = ac.currentTime;
      bell(72, n, 0.075, 1.6, -0.3); bell(76, n + 0.09, 0.075, 1.9, 0);
      bell(79, n + 0.18, 0.085, 2.8, 0.3);
    },
    encounter: function () {
      const n = ac.currentTime;
      ducking = 1;
      tone(n, 55, 5.0, 'sine', 0.14, 34, { attack: 0.5, lp: 240 });
      noiseBurst(n + 0.2, 3.0, 'lowpass', 240, 0.06, 60, { attack: 0.9 });
    },
    thunder: function (delay) {
      const n = ac.currentTime + (delay || 2);
      noiseBurst(n, 3.0, 'lowpass', 200, 0.070, 48, { attack: 0.25, pan: VF.rng.g.range(-0.6, 0.6) });
      tone(n + 0.15, 42, 2.8, 'sine', 0.048, 28, { attack: 0.3, lp: 160 });
    },
    /* the case reel: a short mechanical tick that lengthens as it slows */
    caseTick: function (k) {
      const n = ac.currentTime;
      const soft = Math.min(1, 0.35 + k * 0.9);
      noiseBurst(n, 0.035 + k * 0.04, 'bandpass', 2600 - k * 900, 0.030 * soft, null,
                 { q: 3.2, attack: 0.002, pink: false });
      if (k > 0.82) tone(n, 520 - k * 120, 0.07, 'triangle', 0.020, null, { attack: 0.003, lp: 2400 });
    },
    caseRoll: function () {
      const n = ac.currentTime;
      noiseBurst(n, 0.5, 'lowpass', 1600, 0.055, 500, { attack: 0.02 });
      tone(n, 180, 0.5, 'sine', 0.030, 320, { attack: 0.04, lp: 900 });
    },
    /* the shape passing underneath: felt more than heard */
    wrongShape: function () {
      const n = ac.currentTime;
      ducking = 1;
      tone(n, 31, 6.0, 'sine', 0.16, 22, { attack: 1.2, lp: 140 });
      noiseBurst(n + 0.6, 4.0, 'lowpass', 160, 0.045, 40, { attack: 1.4 });
    },
    sell: function () {
      const n = ac.currentTime;
      bell(84, n, 0.055, 0.8, -0.15);
      bell(91, n + 0.065, 0.045, 1.1, 0.15);
    },
    release: function () {
      const n = ac.currentTime;
      noiseBurst(n, 0.42, 'lowpass', 1400, 0.075, 380, { attack: 0.02 });
      tone(n, 620, 0.55, 'sine', 0.032, 1180, { attack: 0.08, lp: 2400 });
    }
  };

  /* Public wrappers: audio must never be able to break gameplay. */
  const api = {};
  Object.keys(SFX).forEach(function (k) {
    api[k] = function () {
      if (!ready || !ac || ac.state !== 'running') return;
      try { return SFX[k].apply(null, arguments); }
      catch (e) { /* ignore */ }
    };
  });

  function unlock() {
    if (!init()) return false;
    if (ac.state === 'suspended') ac.resume();
    if (music && music.nextChord > 0.4) { music.nextChord = 0; }
    return true;
  }

  function setVolumes() {
    if (!ready) return;
    const s = VF.state.data.settings;
    const n = ac.currentTime;
    master.gain.setTargetAtTime(s.master, n, 0.06);
    musicBus.gain.setTargetAtTime(s.music, n, 0.06);
    sfxBus.gain.setTargetAtTime(s.sfx, n, 0.06);
  }

  /* A parallel analyser on the output. It is a leaf, so it observes without
     affecting what is heard — useful for verifying the engine is actually
     producing signal, and for anything audio-reactive later. */
  let analyser = null;
  function tap() {
    if (!ready) return null;
    if (!analyser) {
      analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      limiter.connect(analyser);
    }
    return analyser;
  }

  function setTension(v) { if (music) music.tension = v; }
  function duck(a) { ducking = Math.max(ducking, a); }

  VF.audio = Object.assign(api, {
    unlock: unlock, tick: tick, setVolumes: setVolumes,
    setTension: setTension, duck: duck, tap: tap,
    isReady: function () { return ready && ac && ac.state === 'running'; }
  });
})(window.VF = window.VF || {});
