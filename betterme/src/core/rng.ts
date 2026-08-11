/**
 * Deterministic PRNG.
 *
 * Every day's plan is generated from a seed built out of the profile id and the
 * date, which means reopening the app mid-morning rebuilds the exact same list
 * instead of quietly rerolling the tasks you already half-finished.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxExclusive: number): number {
    return Math.floor(this.range(min, maxExclusive));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher-Yates on a copy, so callers can shuffle without mutating catalogue data. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/** FNV-1a. Turns "profile-id:2026-08-11" into a stable 32-bit seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function rngFor(...parts: (string | number)[]): Rng {
  return new Rng(hashSeed(parts.join(':')));
}
