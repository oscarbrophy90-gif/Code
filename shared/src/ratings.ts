import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, type BuildSpec, type Position } from './types.ts';

export const MIN_ATTRIBUTE = 25;
export const MIN_OVERALL = 60;
export const MAX_OVERALL = 99;

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  group: 'finishing' | 'shooting' | 'playmaking' | 'defense' | 'physicals';
  blurb: string;
}

export const ATTRIBUTE_META: Record<AttributeKey, AttributeMeta> = {
  closeShot: { key: 'closeShot', label: 'Close Shot', group: 'finishing', blurb: 'Hooks, floaters and touch shots inside ten feet.' },
  layup: { key: 'layup', label: 'Layup', group: 'finishing', blurb: 'Control and touch on drives to the rim.' },
  dunk: { key: 'dunk', label: 'Dunk', group: 'finishing', blurb: 'Throw-down power and contact-dunk trigger rate.' },
  midRange: { key: 'midRange', label: 'Mid Range', group: 'shooting', blurb: 'Green window and make rate inside the arc.' },
  threePoint: { key: 'threePoint', label: 'Three Point', group: 'shooting', blurb: 'Green window and make rate beyond the arc.' },
  freeThrow: { key: 'freeThrow', label: 'Free Throw', group: 'shooting', blurb: 'Green window at the stripe after a shooting foul.' },
  ballHandle: { key: 'ballHandle', label: 'Ball Handle', group: 'playmaking', blurb: 'Dribble speed, combo chaining, ankle-breaker odds.' },
  passAccuracy: { key: 'passAccuracy', label: 'Pass Accuracy', group: 'playmaking', blurb: 'Pass speed and accuracy. Reserved for team modes.' },
  speed: { key: 'speed', label: 'Speed', group: 'physicals', blurb: 'Top movement speed with and without the ball.' },
  acceleration: { key: 'acceleration', label: 'Acceleration', group: 'physicals', blurb: 'Burst out of a stop or a change of direction.' },
  strength: { key: 'strength', label: 'Strength', group: 'physicals', blurb: 'Bump resistance, backdowns, contact finishes.' },
  vertical: { key: 'vertical', label: 'Vertical', group: 'physicals', blurb: 'Jump height for dunks, blocks and boards.' },
  stamina: { key: 'stamina', label: 'Stamina', group: 'physicals', blurb: 'Energy pool and recovery rate.' },
  perimeterDefense: { key: 'perimeterDefense', label: 'Perimeter Defense', group: 'defense', blurb: 'Staying attached on the ball outside the paint.' },
  interiorDefense: { key: 'interiorDefense', label: 'Interior Defense', group: 'defense', blurb: 'Contesting finishes inside the paint.' },
  steal: { key: 'steal', label: 'Steal', group: 'defense', blurb: 'Pokes, digs and interception timing.' },
  block: { key: 'block', label: 'Block', group: 'defense', blurb: 'Swat timing and chase-down reach.' },
  offensiveRebound: { key: 'offensiveRebound', label: 'Offensive Rebound', group: 'defense', blurb: 'Crashing your own miss for a second chance.' },
  defensiveRebound: { key: 'defensiveRebound', label: 'Defensive Rebound', group: 'defense', blurb: 'Boxing out and closing the possession.' },
};

/** Position weights used for the overall rating. */
const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  PG: { ballHandle: 1.5, passAccuracy: 1.3, speed: 1.3, acceleration: 1.2, threePoint: 1.35, midRange: 1.05, layup: 1.05, steal: 1.15, perimeterDefense: 1.15, stamina: 1.05, freeThrow: 1.05, closeShot: 0.9, offensiveRebound: 0.7, defensiveRebound: 0.8 },
  SG: { threePoint: 1.5, midRange: 1.25, ballHandle: 1.2, speed: 1.15, acceleration: 1.1, layup: 1.1, perimeterDefense: 1.2, steal: 1.05, dunk: 1.05, stamina: 1.05, freeThrow: 1.05, offensiveRebound: 0.8, defensiveRebound: 0.85 },
  SF: { threePoint: 1.25, midRange: 1.15, layup: 1.2, dunk: 1.2, closeShot: 1.1, ballHandle: 1.05, perimeterDefense: 1.2, interiorDefense: 1.05, offensiveRebound: 1.05, defensiveRebound: 1.1, strength: 1.1, vertical: 1.1 },
  PF: { dunk: 1.35, layup: 1.2, closeShot: 1.25, offensiveRebound: 1.3, defensiveRebound: 1.35, interiorDefense: 1.3, strength: 1.3, block: 1.2, vertical: 1.15, midRange: 1.05, threePoint: 0.95, ballHandle: 0.9 },
  C: { dunk: 1.4, closeShot: 1.35, offensiveRebound: 1.45, defensiveRebound: 1.5, interiorDefense: 1.45, block: 1.4, strength: 1.4, layup: 1.15, vertical: 1.1, threePoint: 0.8, ballHandle: 0.8, speed: 0.85, freeThrow: 0.85 },
};

export function emptyAttributes(value = MIN_ATTRIBUTE): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = value;
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Attribute caps are derived from the physical build. Taller/heavier builds
 * trade perimeter skill for interior presence, so every build has a real
 * identity instead of one dominant meta build.
 */
export function computeCaps(build: BuildSpec): Attributes {
  const caps = emptyAttributes(99);
  // Normalised build descriptors, all roughly -1..1.
  const h = (build.heightIn - 78) / 12; // 6'6" is neutral
  const w = (build.weightLb - 215) / 75;
  const span = (build.wingspanIn - build.heightIn) / 9; // 0 .. 1 for +0" .. +9"

  const set = (key: AttributeKey, value: number) => {
    caps[key] = clamp(Math.round(value), 55, 99);
  };

  set('closeShot', 92 + h * 8 + Math.max(0, w) * 4 - Math.max(0, -h) * 10);
  set('freeThrow', 99 - h * 14 - Math.max(0, w) * 6);
  set('threePoint', 99 - h * 26 - Math.max(0, w) * 10);
  set('midRange', 99 - h * 16 - Math.max(0, w) * 7);
  set('layup', 99 - Math.max(0, h) * 12 - Math.max(0, w) * 8);
  set('dunk', 72 + h * 22 + w * 12 + span * 6);
  set('ballHandle', 99 - h * 30 - Math.max(0, w) * 14);
  set('passAccuracy', 99 - h * 16 - Math.max(0, w) * 6);
  set('speed', 99 - h * 18 - Math.max(0, w) * 16);
  set('acceleration', 99 - h * 17 - Math.max(0, w) * 18);
  set('strength', 66 + h * 16 + w * 26);
  set('vertical', 92 - Math.max(0, w) * 22 + Math.max(0, -h) * 6);
  set('stamina', 96 - Math.max(0, h) * 8 - Math.max(0, w) * 12);
  set('perimeterDefense', 99 - h * 20 - Math.max(0, w) * 12 + span * 5);
  set('interiorDefense', 66 + h * 24 + w * 14 + span * 6);
  set('offensiveRebound', 60 + h * 28 + w * 15 + span * 8);
  set('defensiveRebound', 64 + h * 27 + w * 13 + span * 8);
  set('steal', 96 - h * 16 - Math.max(0, w) * 10 + span * 4);
  set('block', 60 + h * 28 + span * 12 + Math.max(0, -w) * 4);

  // Position bias: a build's declared position nudges a few caps so position
  // choice matters without letting one position dominate.
  const bias: Record<Position, Partial<Record<AttributeKey, number>>> = {
    PG: { ballHandle: 5, passAccuracy: 5, speed: 3, freeThrow: 3, offensiveRebound: -7, defensiveRebound: -5, interiorDefense: -5 },
    SG: { threePoint: 4, midRange: 3, freeThrow: 3, steal: 2, offensiveRebound: -5, defensiveRebound: -3, strength: -3 },
    SF: { layup: 3, perimeterDefense: 3, dunk: 2, closeShot: 2 },
    PF: { offensiveRebound: 4, defensiveRebound: 4, closeShot: 3, interiorDefense: 4, strength: 3, ballHandle: -4, threePoint: -3 },
    C: { block: 6, offensiveRebound: 5, defensiveRebound: 5, closeShot: 4, interiorDefense: 5, ballHandle: -8, speed: -4, threePoint: -6, freeThrow: -4 },
  };
  for (const [key, delta] of Object.entries(bias[build.position]) as [AttributeKey, number][]) {
    caps[key] = clamp(caps[key] + delta, 55, 99);
  }
  return caps;
}

function spreadAt(caps: Attributes, fraction: number): Attributes {
  const attrs = emptyAttributes();
  for (const key of ATTRIBUTE_KEYS) {
    attrs[key] = clamp(Math.round(MIN_ATTRIBUTE + (caps[key] - MIN_ATTRIBUTE) * fraction), MIN_ATTRIBUTE, caps[key]);
  }
  return attrs;
}

/**
 * Starting spread for a fresh build. Every build begins at exactly 60 overall,
 * so no body type gets a head start — the shape of the spread differs, the
 * total does not. The fraction toward each cap is solved per build rather than
 * fixed, because a 7-footer and a guard have very different cap profiles.
 */
export function startingAttributes(build: BuildSpec): Attributes {
  const caps = computeCaps(build);

  let lo = 0;
  let hi = 1;
  let best = spreadAt(caps, 0.28);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const attrs = spreadAt(caps, mid);
    const overall = computeOverall(attrs, build.position);
    best = attrs;
    if (overall === MIN_OVERALL) return attrs;
    if (overall < MIN_OVERALL) lo = mid;
    else hi = mid;
  }
  return best;
}

export function computeOverall(attrs: Attributes, position: Position): number {
  const weights = POSITION_WEIGHTS[position];
  let total = 0;
  let weightSum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] ?? 1;
    total += attrs[key] * w;
    weightSum += w;
  }
  const weighted = total / weightSum;
  // A rookie spread sits near 41 weighted and a fully maxed build near 92, so
  // that band is what maps onto the 60..99 overall scale players actually see.
  const overall = MIN_OVERALL + clamp((weighted - 41) / (92 - 41), 0, 1) * (MAX_OVERALL - MIN_OVERALL);
  return clamp(Math.round(overall), MIN_OVERALL, MAX_OVERALL);
}

/**
 * Upgrade cost curve. Costs rise steeply near the cap so the last few points
 * are a real commitment, and every point is earned through play — never bought.
 */
export function upgradeCost(current: number, cap: number): number {
  if (current >= cap) return Infinity;
  const next = current + 1;
  // Tuned so a focused build reaches its ceiling in roughly 150 games, and a
  // fully maxed one in a season of steady play.
  const base = 120 + Math.pow(Math.max(0, next - 40), 1.85) * 0.85;
  const capPressure = 1 + Math.max(0, 1 - (cap - current) / 12) * 1.35;
  return Math.round((base * capPressure) / 10) * 10;
}

export function totalUpgradeCost(from: number, to: number, cap: number): number {
  let sum = 0;
  for (let v = from; v < to; v++) sum += upgradeCost(v, cap);
  return sum;
}

export const HEIGHT_RANGE = { min: 68, max: 90 } as const;
export const WEIGHT_RANGE = { min: 160, max: 290 } as const;

export function wingspanRange(heightIn: number): { min: number; max: number } {
  return { min: heightIn - 4, max: heightIn + 9 };
}

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
