/**
 * Account level. Separate from Overall on purpose:
 *
 *   Overall  = how good your life currently is, and it can plateau.
 *   Level    = how much work you have put in, and it only ever goes up.
 *
 * That split is what stops a bad fortnight from feeling like it erased you.
 */

/** XP required to move from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(200 + 140 * Math.pow(Math.max(1, level), 1.22));
}

export interface LevelProgress {
  level: number;
  into: number;
  needed: number;
  fraction: number;
  /** Total XP banked at the start of the current level. */
  levelStartXp: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  let level = 1;
  let left = Math.max(0, Math.floor(totalXp));
  let consumed = 0;
  // Hard stop well past anything a human reaches, so a corrupt save cannot hang.
  while (level < 999) {
    const needed = xpToNext(level);
    if (left < needed) return { level, into: left, needed, fraction: needed === 0 ? 1 : left / needed, levelStartXp: consumed };
    left -= needed;
    consumed += needed;
    level++;
  }
  return { level, into: 0, needed: xpToNext(level), fraction: 0, levelStartXp: consumed };
}

export function levelForXp(totalXp: number): number {
  return levelProgress(totalXp).level;
}

export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Flavour attached to level bands, shown on the level-up screen. */
const LEVEL_TITLES: { min: number; title: string }[] = [
  { min: 1, title: 'Day One' },
  { min: 3, title: 'Getting Going' },
  { min: 5, title: 'Committed' },
  { min: 8, title: 'Locked In' },
  { min: 12, title: 'Relentless' },
  { min: 16, title: 'Machine' },
  { min: 22, title: 'Unrecognisable' },
  { min: 30, title: 'Different Person' },
  { min: 40, title: 'Built From Scratch' },
  { min: 55, title: 'Living Proof' },
];

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const band of LEVEL_TITLES) if (level >= band.min) title = band.title;
  return title;
}
