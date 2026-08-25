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
 *
 * The implementation lives in `buildrules.js` rather than here, because the
 * server has to apply exactly these caps to decide whether a submitted build is
 * real — and a second copy of this maths on the server would drift and start
 * rejecting legitimate players. One function, two importers.
 */
import { computeCaps } from './buildrules.js';
export { computeCaps };

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
