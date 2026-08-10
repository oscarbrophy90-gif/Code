/**
 * The interface tick, synthesised rather than shipped as a file — it keeps the
 * single-file build to one document and costs nothing to download.
 *
 * Browsers refuse to start audio until the user has interacted with the page,
 * so the context is created lazily on the first tick, which is by definition
 * inside a gesture.
 */

let context: AudioContext | null = null;
let enabled = false;

/** Settings calls this; nothing plays until it has been turned on. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

type Tone = 'tick' | 'done' | 'warn';

const TONES: Record<Tone, { from: number; to: number; seconds: number; gain: number }> = {
  tick: { from: 880, to: 880, seconds: 0.045, gain: 0.05 },
  done: { from: 660, to: 1180, seconds: 0.14, gain: 0.06 },
  warn: { from: 320, to: 200, seconds: 0.16, gain: 0.06 },
};

export function play(tone: Tone): void {
  if (!enabled) return;

  try {
    context ??= new (window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    // Autoplay policy can leave a context suspended even after a gesture.
    if (context.state === 'suspended') void context.resume();

    const { from, to, seconds, gain } = TONES[tone];
    const now = context.currentTime;

    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, now);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, now + seconds);

    // A hard stop clicks; a short ramp to near-silence does not.
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

    osc.connect(envelope).connect(context.destination);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  } catch {
    // No audio device, or the browser said no. Not worth telling anyone about.
  }
}
