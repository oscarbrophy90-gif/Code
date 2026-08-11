import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, type AttributeXp, type Profile } from './types.ts';

export const MIN_RATING = 25;
export const MAX_RATING = 99;

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  /** Two or three words for tight spaces like the radar chart. */
  short: string;
  icon: string;
  accent: string;
  blurb: string;
  /** What the number is actually measuring, shown on the attribute detail. */
  measures: string;
}

export const ATTRIBUTE_META: Record<AttributeKey, AttributeMeta> = {
  fitness: {
    key: 'fitness',
    label: 'Fitness',
    short: 'Fitness',
    icon: '🏋️',
    accent: '#ff6b4a',
    blurb: 'Training, sport and moving your body on purpose.',
    measures: 'Sessions trained, distance covered, sport practised.',
  },
  education: {
    key: 'education',
    label: 'Education',
    short: 'Education',
    icon: '📚',
    accent: '#4aa3ff',
    blurb: 'Study, homework, revision and getting better at your subjects.',
    measures: 'Focused study time, work handed in, material actually revised.',
  },
  discipline: {
    key: 'discipline',
    label: 'Discipline',
    short: 'Discipline',
    icon: '⛓️',
    accent: '#c9a227',
    blurb: 'Doing the thing you said you would do, when you said it.',
    measures: 'Promises kept, hard things done first, streaks held.',
  },
  health: {
    key: 'health',
    label: 'Health',
    short: 'Health',
    icon: '💚',
    accent: '#3ef07a',
    blurb: 'Water, food, daylight and looking after the machine.',
    measures: 'Hydration, meals, sunlight, movement breaks, recovery.',
  },
  sleep: {
    key: 'sleep',
    label: 'Sleep',
    short: 'Sleep',
    icon: '🌙',
    accent: '#8f7bff',
    blurb: 'Enough hours, at hours that repeat.',
    measures: 'Hours slept, bedtime consistency, wind-down routine.',
  },
  productivity: {
    key: 'productivity',
    label: 'Productivity',
    short: 'Output',
    icon: '⚡',
    accent: '#ffc53d',
    blurb: 'Deep work, clean spaces and finished tasks.',
    measures: 'Focus blocks, tasks closed out, environment kept in order.',
  },
  social: {
    key: 'social',
    label: 'Social',
    short: 'Social',
    icon: '🤝',
    accent: '#ff5c8a',
    blurb: 'The people around you, and the effort you put into them.',
    measures: 'Conversations started, people helped, plans actually made.',
  },
  skills: {
    key: 'skills',
    label: 'Skills',
    short: 'Skills',
    icon: '🎯',
    accent: '#2fd4c4',
    blurb: 'The craft you are building — instrument, code, art, language.',
    measures: 'Deliberate practice, projects shipped, things learned.',
  },
  mindset: {
    key: 'mindset',
    label: 'Mindset',
    short: 'Mindset',
    icon: '🧠',
    accent: '#a06bff',
    blurb: 'Reflection, calm, and how you talk to yourself after a bad day.',
    measures: 'Journalling, breathing, reframes, time away from the screen.',
  },
};

export const ATTRIBUTE_LIST = ATTRIBUTE_KEYS.map((key) => ATTRIBUTE_META[key]);

export function emptyAttributeXp(): AttributeXp {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as AttributeXp;
}

export function attributesOf(value: number): Attributes {
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, value])) as Attributes;
}

/**
 * XP needed to go from `rating` to `rating + 1`.
 *
 * Deliberately cheap at the bottom and brutal at the top: someone starting at
 * 40 fitness should feel a rating tick within their first couple of sessions,
 * while dragging an 88 to an 89 is meant to be weeks of work. Anchors, roughly:
 * 45 → 46 costs ~100 XP (two decent sessions), 70 → 71 costs ~750, 90 → 91
 * costs ~1750.
 */
export function stepCost(rating: number): number {
  const over = Math.max(0, rating - 40);
  return Math.round(70 + 3 * Math.pow(over, 1.6));
}

export interface AttributeProgress {
  rating: number;
  /** XP banked toward the next point. */
  into: number;
  /** XP the next point costs in total. */
  needed: number;
  /** 0..1 for progress bars. */
  fraction: number;
}

/**
 * Walks a seed rating up by spending banked XP. Ratings are derived, never
 * stored — so a tuning change to `stepCost` re-rates everyone consistently
 * instead of leaving old saves on an old curve.
 */
export function progressFor(seed: number, xp: number): AttributeProgress {
  let rating = clampRating(seed);
  let left = Math.max(0, xp);
  while (rating < MAX_RATING) {
    const cost = stepCost(rating);
    if (left < cost) return { rating, into: left, needed: cost, fraction: left / cost };
    left -= cost;
    rating++;
  }
  return { rating: MAX_RATING, into: 0, needed: 0, fraction: 1 };
}

export function ratingFor(seed: number, xp: number): number {
  return progressFor(seed, xp).rating;
}

export function clampRating(value: number): number {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(value)));
}

export function currentAttributes(profile: Profile): Attributes {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, ratingFor(profile.seedAttributes[key], profile.attributeXp[key])]),
  ) as Attributes;
}

/**
 * Weights used for Overall. Everything counts, but the areas you said you cared
 * about count half again as much — so the number on your card moves when you
 * move the thing you came here to move.
 */
export function overallWeights(focus: AttributeKey[]): Record<AttributeKey, number> {
  const set = new Set(focus);
  return Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, set.has(k) ? 1.5 : 1])) as Record<AttributeKey, number>;
}

export function computeOverall(attributes: Attributes, focus: AttributeKey[]): number {
  const weights = overallWeights(focus);
  let sum = 0;
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    sum += attributes[key] * weights[key];
    total += weights[key];
  }
  return clampRating(sum / total);
}

export function overallOf(profile: Profile): number {
  return computeOverall(currentAttributes(profile), profile.traits.focus);
}

/* ------------------------------------------------------------------ *
 * Tiers of player, by Overall — the badge on the profile card.
 * ------------------------------------------------------------------ */

export interface RankTier {
  id: string;
  label: string;
  min: number;
  /** Face colour of the badge. */
  color: string;
  /** Darker edge colour, for the metal gradient. */
  shade: string;
  blurb: string;
}

/**
 * The badge ladder.
 *
 * Below 70 the badges are plain metal — you are climbing toward the ladder, not
 * on it. From 70 up every five points is its own colour, which is what makes an
 * Overall worth chasing past the point where the habits are already working.
 */
export const RANK_TIERS: RankTier[] = [
  { id: 'rookie', label: 'Rookie', min: 0, color: '#6f7a8c', shade: '#333b49', blurb: 'Everyone starts here. The first week is the whole game.' },
  { id: 'prospect', label: 'Prospect', min: 55, color: '#8a94a6', shade: '#414a5a', blurb: 'The habits are showing up. Keep them boring and repeatable.' },
  { id: 'starter', label: 'Starter', min: 62, color: '#aab4c6', shade: '#525c6e', blurb: 'You are reliable now. Time to raise the weakest area.' },
  { id: 'bronze', label: 'Bronze', min: 70, color: '#d08b4a', shade: '#6d3d16', blurb: 'On the ladder. Seventy is further than most people ever get.' },
  { id: 'silver', label: 'Silver', min: 75, color: '#dfe6f0', shade: '#6f7a8c', blurb: 'Real, visible change. People have started to notice.' },
  { id: 'gold', label: 'Gold', min: 80, color: '#ffc53d', shade: '#8f5c07', blurb: 'Strong across the board and it is no longer an accident.' },
  { id: 'amethyst', label: 'Amethyst', min: 85, color: '#b06bff', shade: '#4b2288', blurb: 'Elite consistency. The routine runs you now.' },
  { id: 'diamond', label: 'Diamond', min: 90, color: '#6fc0ff', shade: '#14538f', blurb: 'Ninety. There is barely anyone up here.' },
  { id: 'ruby', label: 'Ruby', min: 95, color: '#ff4d5e', shade: '#7c0f1c', blurb: 'Ninety-five. A different person to the one who filled in that survey.' },
  { id: 'legend', label: 'Legend', min: 99, color: '#ffd75e', shade: '#9a6f08', blurb: 'The top of the ladder. Nothing left but holding it.' },
];

export function rankTierFor(overall: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const candidate of RANK_TIERS) if (overall >= candidate.min) tier = candidate;
  return tier;
}

export function nextRankTier(overall: number): RankTier | null {
  return RANK_TIERS.find((t) => t.min > overall) ?? null;
}

/** Ordered weakest first — what the generator leans on to pick the day's work. */
export function weakestAttributes(attributes: Attributes): AttributeKey[] {
  return [...ATTRIBUTE_KEYS].sort((a, b) => attributes[a] - attributes[b]);
}

export function strongestAttribute(attributes: Attributes): AttributeKey {
  return weakestAttributes(attributes)[ATTRIBUTE_KEYS.length - 1];
}
