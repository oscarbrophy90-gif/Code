import type { AttributeKey } from '../types.ts';
import type { StoreItem } from '../economy.ts';
import { GENERATED_DUNKS } from '../data/catalogue.ts';
import { PACK_DUNKS } from '../data/dunkpack.ts';
import { PACK_DUNKS_2 } from '../data/dunkpack2.ts';
import { RANK_DUNKS } from '../data/rankpack.ts';

export type DribbleMoveId =
  | 'crossover'
  | 'behindBack'
  | 'betweenLegs'
  | 'hesitation'
  | 'sizeUp'
  | 'spin'
  | 'stepback'
  | 'euro'
  | 'hopJumper'
  | 'doubleCross'
  | 'shamgod'
  | 'snatchBack';

export interface DribbleMoveDef {
  id: DribbleMoveId;
  name: string;
  /** seconds the animation owns the player */
  duration: number;
  /** fraction of the animation before the player can cancel into a shot */
  cancelPoint: number;
  /** forward burst in ft/s applied at the end of the move */
  burst: number;
  /** lateral displacement in feet, applied along the chosen direction */
  lateral: number;
  /** backward displacement (stepbacks / snatch backs) */
  retreat: number;
  /** stamina drained, 0..1 scale */
  staminaCost: number;
  /** base chance the defender is broken down before ratings are applied */
  ankleBase: number;
  /** how strongly the move punishes a defender moving the wrong way */
  misdirection: number;
  gate: AttributeKey;
  /** minimum ball handle to unlock */
  requires: number;
  /** shot this move naturally cancels into */
  followUp?: 'stepback' | 'fade' | 'hopJumper' | 'euroLayup';
  signature: boolean;
}

export const DRIBBLE_MOVES: DribbleMoveDef[] = [
  { id: 'crossover', name: 'Crossover', duration: 0.34, cancelPoint: 0.55, burst: 5.5, lateral: 2.4, retreat: 0, staminaCost: 0.018, ankleBase: 0.034, misdirection: 1.0, gate: 'ballHandle', requires: 0, signature: false },
  { id: 'betweenLegs', name: 'Between the Legs', duration: 0.4, cancelPoint: 0.5, burst: 4.2, lateral: 1.6, retreat: 0, staminaCost: 0.015, ankleBase: 0.024, misdirection: 0.8, gate: 'ballHandle', requires: 0, signature: false },
  { id: 'behindBack', name: 'Behind the Back', duration: 0.44, cancelPoint: 0.5, burst: 5.0, lateral: 2.8, retreat: 0.4, staminaCost: 0.022, ankleBase: 0.040, misdirection: 1.15, gate: 'ballHandle', requires: 62, signature: false },
  { id: 'hesitation', name: 'Hesitation', duration: 0.3, cancelPoint: 0.62, burst: 7.5, lateral: 0.6, retreat: 0, staminaCost: 0.016, ankleBase: 0.030, misdirection: 1.3, gate: 'acceleration', requires: 0, signature: false },
  { id: 'sizeUp', name: 'Size-Up', duration: 0.5, cancelPoint: 0.45, burst: 2.0, lateral: 1.2, retreat: 0, staminaCost: 0.012, ankleBase: 0.018, misdirection: 1.5, gate: 'ballHandle', requires: 0, signature: false },
  { id: 'doubleCross', name: 'Double Crossover', duration: 0.52, cancelPoint: 0.6, burst: 6.8, lateral: 3.4, retreat: 0, staminaCost: 0.03, ankleBase: 0.058, misdirection: 1.45, gate: 'ballHandle', requires: 74, signature: true },
  { id: 'shamgod', name: 'Fake Pull-Through', duration: 0.56, cancelPoint: 0.58, burst: 6.2, lateral: 3.0, retreat: 0.6, staminaCost: 0.032, ankleBase: 0.072, misdirection: 1.6, gate: 'ballHandle', requires: 82, signature: true },
  { id: 'spin', name: 'Spin', duration: 0.5, cancelPoint: 0.55, burst: 6.0, lateral: 2.2, retreat: 0, staminaCost: 0.028, ankleBase: 0.048, misdirection: 1.2, gate: 'ballHandle', requires: 68, signature: true },
  { id: 'stepback', name: 'Stepback', duration: 0.42, cancelPoint: 0.35, burst: 0, lateral: 1.4, retreat: 4.6, staminaCost: 0.026, ankleBase: 0.015, misdirection: 0.5, gate: 'ballHandle', requires: 0, followUp: 'stepback', signature: false },
  { id: 'snatchBack', name: 'Snatch Back', duration: 0.38, cancelPoint: 0.4, burst: 0, lateral: 0.8, retreat: 5.6, staminaCost: 0.03, ankleBase: 0.021, misdirection: 0.7, gate: 'ballHandle', requires: 78, followUp: 'stepback', signature: true },
  { id: 'euro', name: 'Eurostep', duration: 0.46, cancelPoint: 0.3, burst: 5.4, lateral: 4.2, retreat: 0, staminaCost: 0.03, ankleBase: 0.018, misdirection: 0.9, gate: 'layup', requires: 0, followUp: 'euroLayup', signature: false },
  { id: 'hopJumper', name: 'Hop Jumper', duration: 0.36, cancelPoint: 0.3, burst: 1.5, lateral: 3.2, retreat: 0.8, staminaCost: 0.024, ankleBase: 0.012, misdirection: 0.6, gate: 'ballHandle', requires: 0, followUp: 'hopJumper', signature: false },
];

export const MOVE_BY_ID: Record<DribbleMoveId, DribbleMoveDef> = Object.fromEntries(
  DRIBBLE_MOVES.map((m) => [m.id, m]),
) as Record<DribbleMoveId, DribbleMoveDef>;

export interface DunkPackageDef {
  id: string;
  name: string;
  blurb: string;
  /** minimum dunk rating */
  requires: number;
  /** minimum vertical */
  requiresVertical: number;
  contactCapable: boolean;
  price: number;
  /** seconds of animation */
  duration: number;
  /** rotation-only top tier */
  mythic?: boolean;
  /**
   * Shop tier, when the package states one.
   *
   * The older packages leave it off and their tier is inferred from price, which
   * only works while every package costs something — a free package would infer
   * as common and land in the default unlocks. The pack states it outright so a
   * cheap common stays a common.
   */
  rarity?: StoreItem['rarity'];
  /** the rank that pays this package out, when it is a season reward */
  rankReward?: string;
}

const CORE_DUNKS: DunkPackageDef[] = [
  { id: 'basic-slam', name: 'Basic Slam', blurb: 'Two-hand flush. Available to every build.', requires: 0, requiresVertical: 0, contactCapable: false, price: 0, duration: 0.62 },
  { id: 'tomahawk', name: 'Tomahawk', blurb: 'One-hand wind-up off two feet.', requires: 72, requiresVertical: 70, contactCapable: false, price: 6500, duration: 0.72 },
  { id: 'rim-hang', name: 'Rim Hang', blurb: 'Cocked back with a hang on the rim.', requires: 78, requiresVertical: 74, contactCapable: true, price: 11000, duration: 0.86 },
  { id: 'poster', name: 'Poster Pack', blurb: 'Full contact finishes over a set defender.', requires: 85, requiresVertical: 80, contactCapable: true, price: 18000, duration: 0.95 },
  { id: 'reverse-flush', name: 'Reverse Flush', blurb: 'Baseline reverses and under-the-rim spins.', requires: 74, requiresVertical: 68, contactCapable: false, price: 8500, duration: 0.7 },
];

/** The five originals, the generated rest, the pack, and the ranked rewards. */
export const DUNK_PACKAGES: DunkPackageDef[] = [...CORE_DUNKS, ...GENERATED_DUNKS, ...PACK_DUNKS, ...PACK_DUNKS_2, ...RANK_DUNKS];

/**
 * How long a package hangs on the iron after an emphatic make.
 *
 * Read off the package rather than stored on it, because a hundred-odd packs
 * predate the field. Rarity sets the base — the top of the catalogue is sold
 * partly on hang time — and a name that promises a hang gets one. Bounded hard:
 * under 0.4s reads as a bounce off the rim, and past 1.6s the game is waiting
 * on a pose.
 */
export function dunkHangTime(pkg: DunkPackageDef): number {
  const rarity = pkg.rarity ?? (pkg.mythic ? 'mythic' : pkg.price > 12000 ? 'legendary' : pkg.price > 8000 ? 'epic' : pkg.price > 0 ? 'rare' : 'common');
  let hang =
    rarity === 'mythic' ? 1.25 : rarity === 'legendary' ? 1.05 : rarity === 'epic' ? 0.85 : rarity === 'rare' ? 0.65 : 0.5;
  const key = `${pkg.id} ${pkg.name}`.toLowerCase();
  if (key.includes('hang') || key.includes('finale') || key.includes('ascension')) hang += 0.35;
  if (key.includes('quick') || key.includes('fast')) hang -= 0.15;
  return Math.max(0.4, Math.min(1.6, hang));
}

export const DUNK_PACKAGE_BY_ID: Record<string, DunkPackageDef> = Object.fromEntries(
  DUNK_PACKAGES.map((d) => [d.id, d]),
);
