import { DRIBBLE_WAV_BASE64 } from './dribblesound.ts';

/**
 * Audio. Everything except the dribble is synthesised at runtime; the dribble is
 * a ten-kilobyte slice of a supplied recording, inlined as base64 so the
 * standalone build still ships as one file.
 */
export type Sfx =
  | 'dribble'
  | 'swish'
  | 'rim'
  | 'green'
  | 'whistle'
  | 'block'
  | 'steal'
  | 'dunk'
  | 'ankle'
  | 'ui'
  | 'levelUp'
  | 'buzzer';

class AudioEngine {
  /** The supplied dribble sample, decoded once and reused for every bounce. */
  private dribbleBuf: AudioBuffer | null = null;
  private dribbleLoading = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  masterVolume = 0.8;
  sfxVolume = 0.9;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.master) this.master.gain.value = this.masterVolume;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    return this.ctx;
  }

  /** Call from a user gesture so autoplay policies let audio through. */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx || this.dribbleBuf || this.dribbleLoading) return;
    this.dribbleLoading = true;
    const raw = atob(DRIBBLE_WAV_BASE64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    void ctx
      .decodeAudioData(bytes.buffer)
      .then((buf) => {
        this.dribbleBuf = buf;
      })
      .catch(() => {
        // A browser that will not decode it falls back to the synthesised thump.
        this.dribbleBuf = null;
      });
  }

  /**
   * One dribble bounce. Called the instant the ball reaches the bottom of its
   * bounce, so the sample's attack and the ball touching the floor are the same
   * moment — no scheduling, no lookahead, nothing to drift.
   *
   * `distance` is how far away the bouncer is, which only sets the level.
   */
  dribble(distance = 0, pitch = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const level = 0.85 / (1 + distance * 0.06);
    if (!this.dribbleBuf) {
      // Still decoding, or it failed: the old synthesised thump keeps the beat.
      this.thump(ctx, ctx.currentTime, 130 * pitch, 0.09, 0.22 * level);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.dribbleBuf;
    // A little variation so a long possession does not turn into a metronome.
    src.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
  }

  play(sound: Sfx, pitch = 1): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;

    switch (sound) {
      case 'dribble':
        this.thump(ctx, t, 130 * pitch, 0.09, 0.22);
        break;
      case 'swish':
        this.noise(ctx, t, 0.22, 2600, 0.3);
        break;
      case 'rim':
        this.tone(ctx, t, 420 * pitch, 0.16, 'square', 0.16);
        this.tone(ctx, t + 0.02, 620 * pitch, 0.1, 'square', 0.08);
        break;
      case 'green':
        this.tone(ctx, t, 880, 0.09, 'sine', 0.22);
        this.tone(ctx, t + 0.07, 1320, 0.14, 'sine', 0.2);
        this.tone(ctx, t + 0.14, 1760, 0.2, 'sine', 0.16);
        break;
      case 'whistle':
        this.tone(ctx, t, 2100, 0.22, 'sine', 0.14);
        break;
      case 'block':
        this.thump(ctx, t, 90, 0.16, 0.4);
        this.noise(ctx, t, 0.14, 1200, 0.24);
        break;
      case 'steal':
        this.noise(ctx, t, 0.1, 3400, 0.2);
        break;
      case 'dunk':
        this.thump(ctx, t, 70, 0.3, 0.5);
        this.tone(ctx, t + 0.04, 300, 0.24, 'sawtooth', 0.16);
        this.noise(ctx, t + 0.05, 0.24, 900, 0.22);
        break;
      case 'ankle':
        this.noise(ctx, t, 0.18, 700, 0.24);
        this.tone(ctx, t, 160, 0.24, 'sawtooth', 0.12);
        break;
      case 'ui':
        this.tone(ctx, t, 660, 0.05, 'triangle', 0.08);
        break;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(ctx, t + i * 0.08, f, 0.22, 'triangle', 0.16));
        break;
      case 'buzzer':
        this.tone(ctx, t, 200, 0.7, 'square', 0.2);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    at: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.sfxGain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private thump(ctx: AudioContext, at: number, freq: number, dur: number, gain: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.35), at + dur);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.sfxGain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(ctx: AudioContext, at: number, dur: number, cutoff: number, gain: number): void {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain!);
    src.start(at);
  }
}

export const audio = new AudioEngine();
