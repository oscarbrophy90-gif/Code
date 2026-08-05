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
  ballHandle: { key: 'ballHandle', label: 'Ball Handle', group: 'playmaking', blurb: 'How clean your handle is: how rarely you fumble a move, and how badly a move shakes the defender.' },
  speedWithBall: { key: 'speedWithBall', label: 'Speed With Ball', group: 'playmaking', blurb: 'How fast you move and how quickly you can chain moves. High enough and you can spam through-the-legs into ankle breakers.' },
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
  offensiveRebound: { key: 'offensiveRebound', label: 'Offensive Rebound', group: 'defense', blurb: 'Chasing your own miss off the rim. A high rating both wins the ball and holds on to it.' },
  defensiveRebound: { key: 'defensiveRebound', label: 'Defensive Rebound', group: 'defense', blurb: 'Closing out a possession off the glass. Low ratings tip it away and have to go again.' },
};

export interface PositionRules {
  /** inclusive height range in inches */
  minHeightIn: number;
  maxHeightIn: number;
  /** the height the position most commonly sits at */
  typicalHeightIn: number;
  /** typical playing weight at the middle of the height range */
  typicalWeightLb: number;
  /** wingspan advantage over height, in inches */
  wingspanBonus: number;
  /** what raises overall fastest here */
  strengths: string[];
  /** what this position gives up */
  weaknesses: string[];
  blurb: string;
}

/**
 * Height is gated per position so you cannot build a 7-foot point guard who
 * shoots like a guard and rebounds like a centre. Each position also grows its
 * overall from a different set of attributes.
 */
export const POSITION_RULES: Record<Position, PositionRules> = {
  PG: {
    minHeightIn: 70, maxHeightIn: 77, typicalHeightIn: 74, typicalWeightLb: 185, wingspanBonus: 2,
    strengths: ['Ball Handle', 'Pass Accuracy', 'Three Point', 'Speed', 'Acceleration'],
    weaknesses: ['Low Strength', 'Poor Interior Defense', 'Poor Rebounding', 'Limited Shot Blocking'],
    blurb: 'Runs the show. Fastest hands and feet on the floor, but gives up everything physical.',
  },
  SG: {
    minHeightIn: 75, maxHeightIn: 79, typicalHeightIn: 77, typicalWeightLb: 205,
    wingspanBonus: 3,
    strengths: ['Three Point', 'Mid Range', 'Dunk', 'Layup', 'Ball Handle'],
    weaknesses: ['Average Passing', 'Average Interior Defense', 'Limited Rebounding', 'Less physical than forwards'],
    blurb: 'The scorer. Best pure shot-maker in the game, inside and out.',
  },
  SF: {
    minHeightIn: 78, maxHeightIn: 82, typicalHeightIn: 80, typicalWeightLb: 220,
    wingspanBonus: 4,
    strengths: ['Balanced across shooting, finishing, defense, athleticism and playmaking'],
    weaknesses: ['No single elite skill', 'Average Ball Handling', 'Slower than guards', 'Less dominant inside than bigs'],
    blurb: 'The all-rounder. Does everything well and nothing best.',
  },
  PF: {
    minHeightIn: 80, maxHeightIn: 84, typicalHeightIn: 82, typicalWeightLb: 240,
    wingspanBonus: 5,
    strengths: ['Interior Defense', 'Block', 'Offensive & Defensive Rebound', 'Strength', 'Dunk'],
    weaknesses: ['Slower Speed', 'Lower Ball Handle', 'Average Three Point', 'Limited Playmaking'],
    blurb: 'The enforcer. Owns the glass and the paint on both ends.',
  },
  C: {
    minHeightIn: 82, maxHeightIn: 89, typicalHeightIn: 85, typicalWeightLb: 265,
    wingspanBonus: 6,
    strengths: ['Interior Defense', 'Block', 'Offensive & Defensive Rebound', 'Strength', 'Close Shot', 'Dunk'],
    weaknesses: ['Slowest position', 'Weak Ball Handling', 'Poor Perimeter Defense', 'Low Three Point', 'Struggles with fast guards'],
    blurb: 'The anchor. Nothing gets to the rim, but do not ask him to dribble.',
  },
};

export function heightRangeFor(position: Position): { min: number; max: number } {
  const r = POSITION_RULES[position];
  return { min: r.minHeightIn, max: r.maxHeightIn };
}

export function clampHeightToPosition(position: Position, heightIn: number): number {
  const { min, max } = heightRangeFor(position);
  return Math.max(min, Math.min(max, Math.round(heightIn)));
}

/**
 * Wingspan is derived rather than chosen. Asking a player to pick it added a
 * slider without adding a decision — taller positions simply have longer arms.
 */
export function wingspanFor(position: Position, heightIn: number): number {
  return heightIn + POSITION_RULES[position].wingspanBonus;
}

/** Sensible weight band for a height, so the slider cannot make a 7'5" 160lb. */
export function weightRangeFor(position: Position, heightIn: number): { min: number; max: number } {
  const base = POSITION_RULES[position].typicalWeightLb + (heightIn - POSITION_RULES[position].typicalHeightIn) * 6;
  return { min: Math.round(base - 30), max: Math.round(base + 40) };
}

export function defaultBuildFor(position: Position): BuildSpec {
  const r = POSITION_RULES[position];
  return {
    position,
    jerseyNumber: 23,
    heightIn: r.typicalHeightIn,
    weightLb: r.typicalWeightLb,
    wingspanIn: wingspanFor(position, r.typicalHeightIn),
  };
}

/** Position weights used for the overall rating. */
const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  // Overall climbs fastest from handles, passing, range and burst.
  PG: {
    ballHandle: 1.75, speedWithBall: 1.7, passAccuracy: 1.6, threePoint: 1.6, speed: 1.5, acceleration: 1.45,
    freeThrow: 1.1, midRange: 1.1, layup: 1.05, steal: 1.1, perimeterDefense: 1.05, stamina: 1.05,
    strength: 0.5, interiorDefense: 0.45, offensiveRebound: 0.4, defensiveRebound: 0.5, block: 0.4, closeShot: 0.8, dunk: 0.7,
  },
  // A pure scorer: range, mid, and finishing at the rim.
  SG: {
    threePoint: 1.75, midRange: 1.55, dunk: 1.4, layup: 1.4, ballHandle: 1.35, speedWithBall: 1.3,
    freeThrow: 1.15, speed: 1.15, acceleration: 1.1, perimeterDefense: 1.05, closeShot: 1.05,
    passAccuracy: 0.75, interiorDefense: 0.6, offensiveRebound: 0.55, defensiveRebound: 0.6, strength: 0.7, block: 0.55,
  },
  // Deliberately flat: the most versatile position, elite at nothing.
  SF: {
    threePoint: 1.1, midRange: 1.1, closeShot: 1.1, layup: 1.1, dunk: 1.1,
    ballHandle: 1.0, speedWithBall: 1.0, passAccuracy: 1.0, speed: 1.0, acceleration: 1.0, vertical: 1.1,
    strength: 1.05, stamina: 1.05, perimeterDefense: 1.1, interiorDefense: 1.05,
    steal: 1.05, block: 1.05, offensiveRebound: 1.05, defensiveRebound: 1.05, freeThrow: 1.0,
  },
  // Paint and glass.
  PF: {
    interiorDefense: 1.65, block: 1.55, offensiveRebound: 1.6, defensiveRebound: 1.65, strength: 1.5, dunk: 1.45,
    closeShot: 1.25, layup: 1.15, vertical: 1.15,
    speed: 0.6, ballHandle: 0.55, speedWithBall: 0.5, threePoint: 0.65, passAccuracy: 0.6, acceleration: 0.65,
  },
  // Same as PF but with close-range touch and even less perimeter value.
  C: {
    interiorDefense: 1.75, block: 1.7, offensiveRebound: 1.7, defensiveRebound: 1.75, strength: 1.6,
    closeShot: 1.5, dunk: 1.45, vertical: 1.1, layup: 1.15,
    speed: 0.5, ballHandle: 0.4, speedWithBall: 0.35, threePoint: 0.45, perimeterDefense: 0.5, passAccuracy: 0.55, acceleration: 0.5, freeThrow: 0.7,
  },
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
  set('ballHandle', 99 - h * 34 - Math.max(0, w) * 16);
  set('speedWithBall', 99 - h * 30 - Math.max(0, w) * 20);
  set('passAccuracy', 99 - h * 16 - Math.max(0, w) * 6);
  set('speed', 99 - h * 26 - Math.max(0, w) * 18);
  set('acceleration', 99 - h * 25 - Math.max(0, w) * 20);
  set('strength', 66 + h * 16 + w * 26);
  set('vertical', 92 - Math.max(0, w) * 22 + Math.max(0, -h) * 6);
  set('stamina', 96 - Math.max(0, h) * 18 - Math.max(0, w) * 14);
  set('perimeterDefense', 99 - h * 24 - Math.max(0, w) * 12 + span * 5);
  set('interiorDefense', 66 + h * 24 + w * 14 + span * 6);
  set('offensiveRebound', 60 + h * 28 + w * 15 + span * 8);
  set('defensiveRebound', 64 + h * 27 + w * 13 + span * 8);
  set('steal', 96 - h * 16 - Math.max(0, w) * 10 + span * 4);
  set('block', 60 + h * 28 + span * 12 + Math.max(0, -w) * 4);

  // Position bias: a build's declared position nudges a few caps so position
  // choice matters without letting one position dominate.
  const bias: Record<Position, Partial<Record<AttributeKey, number>>> = {
    PG: { ballHandle: 5, speedWithBall: 5, passAccuracy: 5, speed: 3, freeThrow: 3, offensiveRebound: -7, defensiveRebound: -5, interiorDefense: -5 },
    SG: { threePoint: 4, midRange: 3, freeThrow: 3, steal: 2, offensiveRebound: -5, defensiveRebound: -3, strength: -3 },
    SF: { layup: 3, perimeterDefense: 3, dunk: 2, closeShot: 2 },
    PF: { offensiveRebound: 4, defensiveRebound: 4, closeShot: 3, interiorDefense: 4, strength: 3, ballHandle: -4, speedWithBall: -4, threePoint: -3 },
    C: { block: 6, offensiveRebound: 5, defensiveRebound: 5, closeShot: 4, interiorDefense: 5, ballHandle: -8, speedWithBall: -8, speed: -4, threePoint: -6, freeThrow: -4 },
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

/** Absolute limits across all positions; each position narrows them further. */
export const HEIGHT_RANGE = { min: 70, max: 89 } as const;
export const WEIGHT_RANGE = { min: 155, max: 330 } as const;

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
