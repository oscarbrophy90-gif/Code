import { badgeLevel } from './badges.ts';
import type { Attributes, BadgeState } from './types.ts';
import { RANK_JUMPSHOTS } from './data/rankpack.ts';

export type ShotType =
  | 'jumper'
  | 'stepback'
  | 'fade'
  | 'hopJumper'
  | 'layup'
  | 'floater'
  | 'euroLayup'
  | 'dunk'
  | 'contactDunk'
  | 'freeThrow';

export interface JumpshotDef {
  id: string;
  name: string;
  blurb: string;
  /** seconds from launch to the ideal release */
  releaseTime: number;
  /** base half-width of the green window, in seconds */
  greenWindow: number;
  /** how quickly make% falls off outside the green window (higher = harsher) */
  falloff: number;
  /** how much the shot is disturbed by movement */
  driftPenalty: number;
  /** unlock cost in currency; 0 = owned from the start */
  price: number;
  timingCue: 'setPoint' | 'release' | 'jumpApex';
  /**
   * The rank that pays this shot out, when it is a season reward rather than
   * something you buy. A free price with no gate would land it in the default
   * unlocks, which would hand every new player a Perfect Release.
   */
  rankReward?: string;
}

/**
 * Every jump shot trades window size against speed. A slow, forgiving base
 * animation is easy to time but easy to contest; a whip-quick release beats
 * closeouts but demands precision.
 */
export const JUMPSHOTS: JumpshotDef[] = [
  { id: 'base-rise', name: 'Base Rise', blurb: 'Balanced, forgiving. The default every build starts on.', releaseTime: 0.62, greenWindow: 0.023, falloff: 1.0, driftPenalty: 1.0, price: 0, timingCue: 'setPoint' },
  { id: 'quick-trigger', name: 'Quick Trigger', blurb: 'Fastest release in the game with the tightest window.', releaseTime: 0.44, greenWindow: 0.0135, falloff: 1.35, driftPenalty: 1.15, price: 12000, timingCue: 'release' },
  { id: 'high-tower', name: 'High Tower', blurb: 'Slow, sky-high release that shrugs off contests.', releaseTime: 0.78, greenWindow: 0.029, falloff: 0.88, driftPenalty: 1.2, price: 9000, timingCue: 'jumpApex' },
  { id: 'silk', name: 'Silk', blurb: 'Smooth mid-speed release, very stable while drifting.', releaseTime: 0.58, greenWindow: 0.0205, falloff: 1.05, driftPenalty: 0.75, price: 10500, timingCue: 'setPoint' },
  { id: 'whip', name: 'Whip', blurb: 'Snappy sidearm flick. Great off stepbacks.', releaseTime: 0.5, greenWindow: 0.0165, falloff: 1.22, driftPenalty: 0.85, price: 13500, timingCue: 'release' },
  { id: 'metronome', name: 'Metronome', blurb: 'Widest window in the game, but slow enough to contest.', releaseTime: 0.84, greenWindow: 0.034, falloff: 0.8, driftPenalty: 1.35, price: 8000, timingCue: 'jumpApex' },
  ...RANK_JUMPSHOTS,
];

export const JUMPSHOT_BY_ID: Record<string, JumpshotDef> = Object.fromEntries(JUMPSHOTS.map((j) => [j.id, j]));

export interface ShotInput {
  attrs: Attributes;
  badges: BadgeState[];
  jumpshotId: string;
  shotType: ShotType;
  /** feet from the rim, on the floor plane */
  distance: number;
  /** true if the shot is from beyond the three point line */
  isThree: boolean;
  /** 0 = wide open, 1 = smothered with a hand in the face */
  contest: number;
  /** 0..1 remaining stamina */
  stamina: number;
  /** speed of the shooter at launch in ft/s (drift) */
  driftSpeed: number;
  /** consecutive greens this possession/game */
  greenStreak: number;
  /** consecutive makes this game */
  makeStreak: number;
  /** true in the last minute or on game point */
  clutch: boolean;
  /** defender's height advantage in inches (positive = defender taller) */
  heightDelta: number;
}

export interface ShotProfile {
  /** total meter travel time, seconds */
  meterDuration: number;
  /** normalised 0..1 position of the perfect release on the meter */
  idealPoint: number;
  /** half-width of the green window in normalised meter units */
  greenHalfWidth: number;
  /** half-width of the "excellent" band — still an automatic make */
  excellentHalfWidth: number;
  /** half-width of the "slightly early / slightly late" band */
  slightHalfWidth: number;
  /** half-width of the "early / late" band; beyond this is very early / late */
  earlyHalfWidth: number;
  /** make chance on a perfect release. Always 1. */
  greenMakeChance: number;
  /** make chance on a slightly early or late release, if you are wide open */
  slightMakeChance: number;
  /** falloff exponent inside the slight band */
  falloff: number;
  /** true when the contest is heavy enough to have collapsed the window */
  heavilyContested: boolean;
  jumpshot: JumpshotDef;
}

/**
 * Release grades, best to worst. Green and Excellent always score; a slightly
 * early or late release can drop if nobody is contesting; early, late and the
 * very early / very late releases are misses.
 */
export type ShotGrade =
  | 'green'
  | 'excellent'
  | 'slightlyEarly'
  | 'slightlyLate'
  | 'early'
  | 'late'
  | 'veryEarly'
  | 'veryLate';

export interface ShotResult {
  made: boolean;
  grade: ShotGrade;
  /** signed normalised timing error; negative = early, positive = late */
  timingError: number;
  makeChance: number;
  points: number;
  /** roll used, kept so the server can re-verify a client-reported outcome */
  roll: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Which attribute governs this shot. */
export function shotAttribute(input: Pick<ShotInput, 'shotType' | 'isThree' | 'distance'>): keyof Attributes {
  switch (input.shotType) {
    case 'freeThrow':
      return 'freeThrow';
    case 'dunk':
    case 'contactDunk':
      return 'dunk';
    case 'layup':
    case 'euroLayup':
      return 'layup';
    case 'floater':
      return 'closeShot';
    default:
      // Inside ten feet a jumper is a close shot, not a mid-range look.
      if (input.isThree) return 'threePoint';
      return input.distance <= 10 ? 'closeShot' : 'midRange';
  }
}

const SHOT_TYPE_MOD: Record<ShotType, { window: number; time: number; base: number }> = {
  jumper: { window: 1.0, time: 1.0, base: 1.0 },
  stepback: { window: 0.86, time: 1.05, base: 0.95 },
  fade: { window: 0.82, time: 1.02, base: 0.92 },
  hopJumper: { window: 0.94, time: 0.96, base: 0.98 },
  layup: { window: 1.28, time: 0.82, base: 1.0 },
  floater: { window: 1.05, time: 0.9, base: 0.97 },
  euroLayup: { window: 1.15, time: 0.86, base: 0.99 },
  dunk: { window: 1.6, time: 0.72, base: 1.0 },
  contactDunk: { window: 1.4, time: 0.8, base: 1.0 },
  freeThrow: { window: 2.2, time: 1.15, base: 1.15 },
};

/**
 * Builds the shot meter profile. This is the single source of truth for
 * shooting — the client renders the meter from it and the server re-derives it
 * from authoritative state to validate reported outcomes.
 */
export function computeShotProfile(input: ShotInput): ShotProfile {
  const js = JUMPSHOT_BY_ID[input.jumpshotId] ?? JUMPSHOTS[0];
  const mod = SHOT_TYPE_MOD[input.shotType];
  const attrKey = shotAttribute(input);
  const rating = input.attrs[attrKey];

  // Rating maps to a window multiplier of 0.55 (25 rated) .. 1.55 (99 rated).
  const ratingMult = 0.55 + clamp01((rating - 25) / 74) * 1.0;

  // Stamina: below 55% the window starts collapsing. Iron Lungs claws it back.
  const ironLungs = badgeLevel(input.badges, 'ironLungs');
  const staminaDeficit = Math.max(0, 0.55 - input.stamina) / 0.55;
  const staminaMult = 1 - staminaDeficit * 0.45 * (1 - ironLungs * 0.6);

  // Contest squeezes the window; Deadeye softens it. This is now the *only*
  // thing a contest does to a perfect release — hitting green always scores,
  // so a hand in your face has to make green harder to hit, not luckier.
  const deadeye = badgeLevel(input.badges, 'deadeye');
  const contestMult = 1 - input.contest * (0.68 * (1 - deadeye * 0.55));

  // Drift: standing still is best. Set Shooter rewards it, Free Spirit and a
  // low-drift animation forgive movement.
  const setShooter = badgeLevel(input.badges, 'setShooter');
  const freeSpirit = badgeLevel(input.badges, 'freeSpirit');
  const driftAmount = clamp01(input.driftSpeed / 16);
  const driftMult =
    1 - driftAmount * 0.3 * js.driftPenalty * (1 - freeSpirit * 0.5) + (1 - driftAmount) * setShooter * 0.12;

  // Situational badges.
  let badgeMult = 1;
  if (input.shotType === 'stepback' || input.shotType === 'fade') badgeMult += badgeLevel(input.badges, 'stepbackSniper') * 0.18;
  if (input.shotType === 'hopJumper') badgeMult += badgeLevel(input.badges, 'hopStepper') * 0.15;
  if (input.shotType === 'layup' || input.shotType === 'floater') badgeMult += badgeLevel(input.badges, 'softTouch') * 0.16;
  if (input.shotType === 'euroLayup') badgeMult += badgeLevel(input.badges, 'euroKing') * 0.16;
  if (input.clutch) badgeMult += badgeLevel(input.badges, 'coldBlooded') * 0.15;
  badgeMult += Math.min(3, input.greenStreak) * badgeLevel(input.badges, 'greenMachine') * 0.05;

  // Going up at somebody who has left their feet is the hardest timing in the
  // game — the window collapses beyond what an ordinary contest would do.
  const dunking = input.shotType === 'dunk' || input.shotType === 'contactDunk';
  const airborneSqueeze = dunking ? 1 - input.contest * 0.45 : 1;

  const greenSeconds =
    js.greenWindow * mod.window * ratingMult * staminaMult * contestMult * driftMult * badgeMult * airborneSqueeze;

  // Quick Draw shortens the animation without touching the window.
  const quickDraw = badgeLevel(input.badges, 'quickDraw');
  const meterDuration = js.releaseTime * mod.time * (1 - quickDraw * 0.12);

  // The ideal release sits late on the meter so the bar reads like a real
  // shooting motion — you release near the top of the jump, not at the start.
  const idealPoint = 0.86;
  const greenHalfWidth = clamp01(greenSeconds / meterDuration);
  // Bands step outward from the green window. Excellent is the shot you very
  // nearly perfected; slight is the one you felt go wrong as you let it go.
  const excellentHalfWidth = Math.min(0.3, greenHalfWidth + 0.035);
  const slightHalfWidth = Math.min(0.42, excellentHalfWidth + 0.06);
  const earlyHalfWidth = Math.min(0.6, slightHalfWidth + 0.12);

  // --- make chances -------------------------------------------------------
  // A green release ALWAYS goes in. No exceptions, no hidden roll: if the
  // player hit the window, the ball drops. Difficulty lives entirely in how
  // hard that window is to hit, which is what contest, stamina, drift and
  // ratings already control above.
  const greenMakeChance = 1;
  // Kept for the HUD: a smothered shot turns the band amber to warn that the
  // window has collapsed, not that a green might miss.
  const heavilyContested = input.contest > 0.72;

  // Distance falloff on non-green shots.
  const deepRange = badgeLevel(input.badges, 'deepRange');
  const rangeLimit = 22 + (rating / 99) * 12 + deepRange * 8;
  const distanceMult = clamp01(1 - Math.max(0, input.distance - rangeLimit) / 16);

  // A slightly early or late release is the only shot in the game decided by a
  // roll, and being open is what decides it. A hand in your face takes it to
  // nothing; wide open, a good shooter still gets most of them.
  const ratingBase = 0.42 + clamp01((rating - 25) / 74) * 0.5; // 0.42 .. 0.92
  const openness = clamp01(1 - input.contest * (1.55 * (1 - deadeye * 0.4)));
  const heatCheck = Math.min(4, input.makeStreak) * badgeLevel(input.badges, 'heatCheck') * 0.025;

  const slightMakeChance = clamp01(
    (ratingBase + heatCheck) * openness * distanceMult * mod.base * staminaMult,
  );

  return {
    meterDuration,
    idealPoint,
    greenHalfWidth,
    excellentHalfWidth,
    slightHalfWidth,
    earlyHalfWidth,
    greenMakeChance,
    slightMakeChance,
    falloff: js.falloff,
    heavilyContested,
    jumpshot: js,
  };
}

/**
 * Resolves a release. `releasePoint` is the normalised meter position at the
 * moment the shoot button came up. `roll` is a deterministic 0..1 value.
 */
export function resolveShot(profile: ShotProfile, releasePoint: number, roll: number, isThree: boolean): ShotResult {
  const error = releasePoint - profile.idealPoint;
  const absError = Math.abs(error);
  const early = error < 0;

  let grade: ShotGrade;
  let makeChance: number;

  if (absError <= profile.greenHalfWidth) {
    // Perfect. Goes in, every time.
    grade = 'green';
    makeChance = 1;
  } else if (absError <= profile.excellentHalfWidth) {
    // Near enough to perfect that it also goes in, every time.
    grade = 'excellent';
    makeChance = 1;
  } else if (absError <= profile.slightHalfWidth) {
    // The only shot in the game that is a coin toss, and being open is the coin.
    const t = (absError - profile.excellentHalfWidth) / Math.max(1e-4, profile.slightHalfWidth - profile.excellentHalfWidth);
    grade = early ? 'slightlyEarly' : 'slightlyLate';
    makeChance = profile.slightMakeChance * (1 - Math.pow(t, profile.falloff) * 0.45);
  } else if (absError <= profile.earlyHalfWidth) {
    // You felt this one leave wrong. It does not go in.
    grade = early ? 'early' : 'late';
    makeChance = 0;
  } else {
    grade = early ? 'veryEarly' : 'veryLate';
    makeChance = 0;
  }

  const made = makeChance >= 1 || roll < makeChance;
  return {
    made,
    grade,
    timingError: error,
    makeChance,
    points: made ? (isThree ? 2 : 1) : 0, // streetball 1s and 2s
    roll,
  };
}

export const GRADE_LABEL: Record<ShotGrade, string> = {
  green: 'GREEN',
  excellent: 'EXCELLENT',
  slightlyEarly: 'SLIGHTLY EARLY',
  slightlyLate: 'SLIGHTLY LATE',
  early: 'EARLY',
  late: 'LATE',
  veryEarly: 'VERY EARLY',
  veryLate: 'VERY LATE',
};

/**
 * The meter fills with this colour on release, so the bar tells you what you
 * did before the ball lands: green means it is in, white means it is live,
 * orange and red mean it is not.
 */
export const GRADE_COLOR: Record<ShotGrade, string> = {
  green: '#3ef07a',
  excellent: '#3ef07a',
  slightlyEarly: '#f2f6fb',
  slightlyLate: '#f2f6fb',
  early: '#ff8a3d',
  late: '#ff8a3d',
  veryEarly: '#ff3b4e',
  veryLate: '#ff3b4e',
};

/** True for the two grades that always score. */
export function isAutomatic(grade: ShotGrade): boolean {
  return grade === 'green' || grade === 'excellent';
}

/**
 * Contest strength from defender geometry. Shared so the server can recompute
 * it from authoritative positions rather than trusting the client.
 */
export function computeContest(opts: {
  defenderDistance: number;
  defenderHandUp: boolean;
  defenderAirborne: boolean;
  defenderFacing: number; // dot product of defender facing vs shooter, -1..1
  defenderStagger: number; // 0..1, 1 = fully broken down
  shooterHeightAdv: number; // inches, positive = shooter taller
  interiorShot: boolean;
  defenderAttrs: Attributes;
  defenderBadges: BadgeState[];
}): number {
  const {
    defenderDistance,
    defenderHandUp,
    defenderAirborne,
    defenderFacing,
    defenderStagger,
    shooterHeightAdv,
    interiorShot,
    defenderAttrs,
    defenderBadges,
  } = opts;

  // Beyond 8 feet a defender contests nothing.
  const proximity = clamp01(1 - defenderDistance / 8);
  if (proximity <= 0) return 0;

  const defRating = interiorShot ? defenderAttrs.interiorDefense : defenderAttrs.perimeterDefense;
  const ratingMult = 0.55 + clamp01((defRating - 25) / 74) * 0.75;

  const badgeMult =
    1 +
    (interiorShot ? badgeLevel(defenderBadges, 'rimProtector') : badgeLevel(defenderBadges, 'clamps')) * 0.25 +
    badgeLevel(defenderBadges, 'menace') * 0.12;

  const handMult = defenderHandUp ? 1 : 0.55;
  const airMult = defenderAirborne ? 1.18 : 1;
  const facingMult = 0.6 + clamp01((defenderFacing + 1) / 2) * 0.4;
  const staggerMult = 1 - defenderStagger * 0.9;
  const heightMult = clamp01(1 - shooterHeightAdv / 14) * 0.5 + 0.75;

  return clamp01(
    Math.pow(proximity, 1.35) * ratingMult * badgeMult * handMult * airMult * facingMult * staggerMult * heightMult,
  );
}
