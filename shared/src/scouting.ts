import type { Attributes, AttributeKey } from './types.ts';

/**
 * Skill groups used on the walkout screen. These are what a scout would say
 * about a player out loud — "he shoots, he can't defend" — rather than a wall
 * of nineteen numbers.
 */
export interface SkillGroup {
  id: string;
  label: string;
  keys: AttributeKey[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  { id: 'threes', label: 'Three-point shooting', keys: ['threePoint'] },
  { id: 'midrange', label: 'Mid-range game', keys: ['midRange', 'freeThrow'] },
  { id: 'finishing', label: 'Finishing at the rim', keys: ['layup', 'closeShot'] },
  { id: 'power', label: 'Dunking', keys: ['dunk', 'vertical'] },
  { id: 'handle', label: 'Ball handling', keys: ['ballHandle'] },
  { id: 'speed', label: 'Speed and burst', keys: ['speed', 'acceleration'] },
  { id: 'strength', label: 'Strength', keys: ['strength'] },
  { id: 'perimeter', label: 'Perimeter defense', keys: ['perimeterDefense', 'steal'] },
  { id: 'interior', label: 'Interior defense', keys: ['interiorDefense', 'block'] },
  { id: 'boards', label: 'Rebounding', keys: ['offensiveRebound', 'defensiveRebound'] },
  { id: 'motor', label: 'Conditioning', keys: ['stamina'] },
];

export interface ScoutLine {
  id: string;
  label: string;
  rating: number;
}

/** Every skill group scored for one player, highest first. */
export function scoutGroups(attrs: Attributes): ScoutLine[] {
  return SKILL_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    rating: Math.round(g.keys.reduce((sum, k) => sum + attrs[k], 0) / g.keys.length),
  })).sort((a, b) => b.rating - a.rating);
}

export interface ScoutReport {
  strengths: ScoutLine[];
  weaknesses: ScoutLine[];
}

/**
 * The three things this player does best and the three worst, measured
 * against their own average so the report says something even for a player
 * whose ratings are all high or all low.
 */
export function scoutReport(attrs: Attributes, count = 3): ScoutReport {
  const lines = scoutGroups(attrs);
  return {
    strengths: lines.slice(0, count),
    weaknesses: lines.slice(-count).reverse(),
  };
}

/** Colour band for a group rating, matched to the rest of the UI. */
export function ratingColor(rating: number): string {
  if (rating >= 90) return '#3ef07a';
  if (rating >= 80) return '#9de84f';
  if (rating >= 70) return '#ffc53d';
  if (rating >= 60) return '#ff7a3d';
  return '#ff5c6a';
}


/**
 * A one-word name for what a build actually is.
 *
 * Bots are handed an archetype when they are generated — "Paint Beast", "Lockdown"
 * — but a player's own build has never had one, because nobody picks an
 * archetype in the creator: you move sliders and a player comes out. So this
 * reads the sliders back and says what you made.
 *
 * Derived, never stored. A build that gets rebalanced in the Locker is a
 * different player the moment the numbers change, and a label saved at creation
 * would keep insisting it was a Sharpshooter long after the three-point rating
 * went to the rebounding.
 */
export function buildLabel(attrs: Attributes): string {
  const shooting = (attrs.threePoint * 2 + attrs.midRange) / 3;
  const finishing = (attrs.dunk + attrs.layup + attrs.closeShot) / 3;
  const playmaking = (attrs.ballHandle * 2 + attrs.passAccuracy + attrs.speedWithBall) / 4;
  const defence = (attrs.perimeterDefense + attrs.interiorDefense + attrs.steal + attrs.block) / 4;
  const boards = (attrs.offensiveRebound + attrs.defensiveRebound + attrs.strength) / 3;

  const ranked: [string, number][] = [
    ['Sharpshooter', shooting],
    ['Slasher', finishing],
    ['Playmaker', playmaking],
    ['Lockdown', defence],
    ['Glass Cleaner', boards],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const [topName, top] = ranked[0];
  const [secondName, second] = ranked[1];

  // Nothing stands out: a build with no peak is a two-way player, not a bad
  // Sharpshooter. Naming the highest of five near-identical numbers would be
  // reading noise.
  if (top - ranked[ranked.length - 1][1] < 6) return 'Two-Way';
  // Two peaks together earn the pairing rather than an arbitrary winner.
  if (top - second < 3) {
    if (topName === 'Sharpshooter' && secondName === 'Slasher') return 'Shot Creator';
    if (topName === 'Slasher' && secondName === 'Sharpshooter') return 'Shot Creator';
    if (topName === 'Lockdown' || secondName === 'Lockdown') return `Two-Way ${topName === 'Lockdown' ? secondName : topName}`;
  }
  return topName;
}
