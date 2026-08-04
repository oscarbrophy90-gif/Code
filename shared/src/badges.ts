import { BADGE_TIERS, type AttributeKey, type Attributes, type BadgeCategory, type BadgeState, type BadgeTier } from './types.ts';

export interface BadgeDef {
  id: string;
  name: string;
  category: BadgeCategory;
  description: string;
  /** attribute that gates how high the badge can climb */
  gate: AttributeKey;
  /** attribute value required to reach each tier */
  gateThresholds: [number, number, number, number, number]; // bronze..legend
  /** progress points required to reach each tier */
  cost: [number, number, number, number, number];
  /** how the badge is fed by play */
  earnedBy: string;
}

const T = (b: number, s: number, g: number, h: number, l: number): [number, number, number, number, number] => [b, s, g, h, l];

/**
 * Badges level up purely by using the related skill. `earnedBy` names the sim
 * event that awards progress (see `awardBadgeProgress`).
 */
export const BADGES: BadgeDef[] = [
  // ---------------------------------------------------------------- shooting
  { id: 'deadeye', name: 'Deadeye', category: 'shooting', gate: 'threePoint', description: 'Shrinks the penalty applied by a defender contesting your jumper.', gateThresholds: T(62, 70, 78, 86, 93), cost: T(400, 1000, 2100, 3800, 6200), earnedBy: 'contestedMake' },
  { id: 'greenMachine', name: 'Green Machine', category: 'shooting', gate: 'threePoint', description: 'Consecutive greens widen the green window until you miss.', gateThresholds: T(64, 72, 80, 88, 94), cost: T(450, 1100, 2300, 4100, 6600), earnedBy: 'greenStreak' },
  { id: 'setShooter', name: 'Set Shooter', category: 'shooting', gate: 'midRange', description: 'Wider green window when you shoot from a standstill.', gateThresholds: T(60, 68, 76, 84, 91), cost: T(350, 900, 1900, 3400, 5600), earnedBy: 'setMake' },
  { id: 'stepbackSniper', name: 'Stepback Sniper', category: 'shooting', gate: 'threePoint', description: 'Boosts shots taken straight out of a stepback or fade.', gateThresholds: T(63, 71, 79, 87, 93), cost: T(420, 1050, 2200, 3900, 6400), earnedBy: 'stepbackMake' },
  { id: 'coldBlooded', name: 'Cold Blooded', category: 'shooting', gate: 'midRange', description: 'Timing is steadier in the final minute and on game point.', gateThresholds: T(62, 70, 78, 86, 92), cost: T(400, 1000, 2100, 3700, 6000), earnedBy: 'clutchMake' },
  { id: 'deepRange', name: 'Deep Range', category: 'shooting', gate: 'threePoint', description: 'Reduces the distance falloff on shots far behind the arc.', gateThresholds: T(70, 77, 84, 90, 95), cost: T(500, 1200, 2500, 4400, 7000), earnedBy: 'deepMake' },
  { id: 'quickDraw', name: 'Quick Draw', category: 'shooting', gate: 'midRange', description: 'Speeds up your release without shrinking the green window.', gateThresholds: T(60, 69, 77, 85, 92), cost: T(380, 950, 2000, 3500, 5800), earnedBy: 'anyMake' },
  { id: 'ironLungs', name: 'Iron Lungs', category: 'shooting', gate: 'stamina', description: 'Cuts how much low stamina shrinks your green window.', gateThresholds: T(60, 68, 76, 84, 91), cost: T(350, 880, 1850, 3300, 5400), earnedBy: 'tiredMake' },
  { id: 'heatCheck', name: 'Heat Check', category: 'shooting', gate: 'threePoint', description: 'Every made shot in a row adds a small make bonus.', gateThresholds: T(65, 73, 81, 88, 94), cost: T(430, 1080, 2250, 4000, 6500), earnedBy: 'streakMake' },
  { id: 'freeSpirit', name: 'Free Spirit', category: 'shooting', gate: 'midRange', description: 'Improves shots taken while drifting or fading sideways.', gateThresholds: T(61, 69, 77, 85, 92), cost: T(370, 930, 1950, 3450, 5700), earnedBy: 'movingMake' },

  // --------------------------------------------------------------- finishing
  { id: 'contactFinisher', name: 'Contact Finisher', category: 'finishing', gate: 'dunk', description: 'Raises the chance of triggering a contact dunk through a defender.', gateThresholds: T(70, 78, 85, 91, 96), cost: T(500, 1250, 2600, 4600, 7400), earnedBy: 'contactDunk' },
  { id: 'softTouch', name: 'Soft Touch', category: 'finishing', gate: 'closeShot', description: 'Widens the green window on layups and floaters.', gateThresholds: T(60, 68, 77, 85, 92), cost: T(360, 900, 1900, 3400, 5600), earnedBy: 'layupMake' },
  { id: 'acrobat', name: 'Acrobat', category: 'finishing', gate: 'layup', description: 'Improves reverse, spin and off-hand finishes under the rim.', gateThresholds: T(64, 72, 80, 87, 93), cost: T(400, 1000, 2100, 3700, 6000), earnedBy: 'acrobaticMake' },
  { id: 'riseUp', name: 'Rise Up', category: 'finishing', gate: 'dunk', description: 'Better standing dunks in traffic from a short gather.', gateThresholds: T(68, 76, 84, 90, 95), cost: T(460, 1150, 2400, 4200, 6800), earnedBy: 'dunkMake' },
  { id: 'bully', name: 'Bully', category: 'finishing', gate: 'strength', description: 'Wins more bumps when driving into a set defender.', gateThresholds: T(66, 74, 82, 89, 94), cost: T(420, 1050, 2200, 3900, 6300), earnedBy: 'bumpWin' },
  { id: 'euroKing', name: 'Euro King', category: 'finishing', gate: 'layup', description: 'Extends the lateral reach and speed of the eurostep.', gateThresholds: T(65, 73, 81, 88, 94), cost: T(430, 1080, 2250, 3950, 6400), earnedBy: 'euroFinish' },
  { id: 'putbackArtist', name: 'Putback Artist', category: 'finishing', gate: 'offensiveRebound', description: 'Faster gather and better finish off an offensive board.', gateThresholds: T(64, 72, 80, 87, 93), cost: T(400, 1000, 2100, 3700, 6000), earnedBy: 'putback' },
  { id: 'noFear', name: 'No Fear', category: 'finishing', gate: 'dunk', description: 'Reduces the finishing penalty from a rim protector.', gateThresholds: T(69, 77, 84, 90, 95), cost: T(470, 1180, 2450, 4300, 6900), earnedBy: 'contestedFinish' },
  { id: 'giantSlayer', name: 'Giant Slayer', category: 'finishing', gate: 'vertical', description: 'Finishes better against taller defenders.', gateThresholds: T(66, 74, 82, 88, 94), cost: T(410, 1030, 2150, 3800, 6100), earnedBy: 'finishOverTaller' },
  { id: 'hopStepper', name: 'Hop Stepper', category: 'finishing', gate: 'layup', description: 'Improves hop-jumper and gather-step finishes.', gateThresholds: T(62, 70, 78, 86, 92), cost: T(380, 950, 2000, 3500, 5700), earnedBy: 'hopFinish' },

  // -------------------------------------------------------------- playmaking
  { id: 'ankleTaker', name: 'Ankle Taker', category: 'playmaking', gate: 'ballHandle', description: 'Raises the odds a dribble combo drops the defender.', gateThresholds: T(70, 78, 85, 91, 96), cost: T(520, 1300, 2700, 4800, 7600), earnedBy: 'ankleBreaker' },
  { id: 'quickFirstStep', name: 'Quick First Step', category: 'playmaking', gate: 'acceleration', description: 'Bigger burst out of a launch or blow-by.', gateThresholds: T(66, 74, 82, 89, 95), cost: T(450, 1120, 2350, 4100, 6600), earnedBy: 'blowBy' },
  { id: 'tightHandles', name: 'Tight Handles', category: 'playmaking', gate: 'ballHandle', description: 'Faster dribble-move chaining with less speed loss.', gateThresholds: T(64, 72, 80, 88, 94), cost: T(430, 1080, 2250, 3950, 6400), earnedBy: 'comboChain' },
  { id: 'unpluckable', name: 'Unpluckable', category: 'playmaking', gate: 'ballHandle', description: 'Much harder to strip while dribbling.', gateThresholds: T(62, 71, 79, 87, 93), cost: T(400, 1000, 2100, 3700, 6000), earnedBy: 'stealDefended' },
  { id: 'handlesForDays', name: 'Handles For Days', category: 'playmaking', gate: 'stamina', description: 'Cuts the stamina drain of dribble moves.', gateThresholds: T(62, 70, 78, 86, 92), cost: T(380, 950, 2000, 3500, 5700), earnedBy: 'moveChainLong' },
  { id: 'floorGeneral', name: 'Floor General', category: 'playmaking', gate: 'passAccuracy', description: 'Raises teammate grade and assist value in team modes.', gateThresholds: T(65, 73, 81, 88, 94), cost: T(420, 1050, 2200, 3900, 6300), earnedBy: 'assist' },
  { id: 'dimer', name: 'Dimer', category: 'playmaking', gate: 'passAccuracy', description: 'Passes out of a drive boost the shooter briefly.', gateThresholds: T(68, 76, 83, 90, 95), cost: T(450, 1130, 2350, 4150, 6700), earnedBy: 'assist' },
  { id: 'needleThreader', name: 'Needle Threader', category: 'playmaking', gate: 'passAccuracy', description: 'Tight-window passes complete far more often.', gateThresholds: T(70, 78, 85, 91, 96), cost: T(470, 1180, 2450, 4300, 6900), earnedBy: 'tightPass' },
  { id: 'speedBooster', name: 'Speed Booster', category: 'playmaking', gate: 'speed', description: 'Higher top speed while attacking with the ball.', gateThresholds: T(68, 76, 84, 90, 95), cost: T(460, 1150, 2400, 4200, 6800), earnedBy: 'driveSpeed' },
  { id: 'sizeUpSpecialist', name: 'Size-Up Specialist', category: 'playmaking', gate: 'ballHandle', description: 'Size-ups sway the defender further out of position.', gateThresholds: T(66, 74, 82, 89, 94), cost: T(440, 1100, 2300, 4050, 6500), earnedBy: 'sizeUp' },

  // ----------------------------------------------------------------- defense
  { id: 'clamps', name: 'Clamps', category: 'defense', gate: 'perimeterDefense', description: 'Better cut-off speed and bump recovery on the ball.', gateThresholds: T(68, 76, 84, 90, 96), cost: T(500, 1250, 2600, 4600, 7400), earnedBy: 'stopBall' },
  { id: 'chaseDownArtist', name: 'Chase-Down Artist', category: 'defense', gate: 'block', description: 'Extends the window and reach for chase-down blocks.', gateThresholds: T(70, 78, 85, 91, 96), cost: T(510, 1280, 2650, 4700, 7500), earnedBy: 'chaseDownBlock' },
  { id: 'rimProtector', name: 'Rim Protector', category: 'defense', gate: 'interiorDefense', description: 'Stronger contests on shots at the rim.', gateThresholds: T(68, 76, 84, 90, 95), cost: T(480, 1200, 2500, 4400, 7100), earnedBy: 'rimContest' },
  { id: 'pickPocket', name: 'Pick Pocket', category: 'defense', gate: 'steal', description: 'Higher strip success with a lower reach-in risk.', gateThresholds: T(66, 74, 82, 89, 95), cost: T(460, 1150, 2400, 4200, 6800), earnedBy: 'steal' },
  { id: 'interceptor', name: 'Interceptor', category: 'defense', gate: 'steal', description: 'Wider deflection cone on passes and loose balls.', gateThresholds: T(64, 72, 80, 88, 94), cost: T(430, 1080, 2250, 3950, 6400), earnedBy: 'deflection' },
  { id: 'boxOut', name: 'Box Out', category: 'defense', gate: 'defensiveRebound', description: 'Better position battles under the rim.', gateThresholds: T(64, 72, 80, 87, 93), cost: T(410, 1030, 2150, 3800, 6100), earnedBy: 'boxOut' },
  { id: 'reboundChaser', name: 'Rebound Chaser', category: 'defense', gate: 'offensiveRebound', description: 'Tracks long caroms and expands your tip range.', gateThresholds: T(66, 74, 82, 89, 94), cost: T(440, 1100, 2300, 4050, 6500), earnedBy: 'rebound' },
  { id: 'immovable', name: 'Immovable', category: 'defense', gate: 'strength', description: 'Holds ground against drives and backdowns.', gateThresholds: T(68, 76, 84, 90, 95), cost: T(470, 1180, 2450, 4300, 6900), earnedBy: 'bumpHold' },
  { id: 'menace', name: 'Menace', category: 'defense', gate: 'perimeterDefense', description: 'Smothering close-outs drain the ball handler faster.', gateThresholds: T(70, 78, 85, 91, 96), cost: T(490, 1230, 2550, 4500, 7200), earnedBy: 'smother' },
  { id: 'anchor', name: 'Anchor', category: 'defense', gate: 'block', description: 'Blocks stay in-bounds and recover more often.', gateThresholds: T(69, 77, 84, 90, 95), cost: T(480, 1200, 2500, 4400, 7100), earnedBy: 'block' },
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export const TIER_INDEX: Record<BadgeTier, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  hallOfFame: 4,
  legend: 5,
};

export const TIER_LABEL: Record<BadgeTier, string> = {
  none: 'Locked',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  hallOfFame: 'Hall of Fame',
  legend: 'Legend',
};

export const TIER_COLOR: Record<BadgeTier, string> = {
  none: '#3b4252',
  bronze: '#c07a3e',
  silver: '#b8c1cc',
  gold: '#e3b23c',
  hallOfFame: '#7b5cff',
  legend: '#ff5c8a',
};

/** Multiplicative strength of a badge, used by the sim. 0 when unearned. */
export function badgeStrength(tier: BadgeTier): number {
  return [0, 0.2, 0.4, 0.62, 0.82, 1][TIER_INDEX[tier]];
}

export function freshBadges(): BadgeState[] {
  return BADGES.map((b) => ({ id: b.id, tier: 'none' as BadgeTier, progress: 0 }));
}

export function badgeTierOf(states: BadgeState[], id: string): BadgeTier {
  return states.find((s) => s.id === id)?.tier ?? 'none';
}

/** Convenience accessor: 0..1 strength of a badge on a player. */
export function badgeLevel(states: BadgeState[], id: string): number {
  return badgeStrength(badgeTierOf(states, id));
}

export interface BadgeUpgrade {
  id: string;
  from: BadgeTier;
  to: BadgeTier;
}

/**
 * Awards progress to every badge fed by `event`, then promotes tiers as long
 * as the gating attribute allows. Returns the promotions for UI toasts.
 */
export function awardBadgeProgress(
  states: BadgeState[],
  attrs: Attributes,
  event: string,
  amount = 1,
): BadgeUpgrade[] {
  const upgrades: BadgeUpgrade[] = [];
  for (const def of BADGES) {
    if (def.earnedBy !== event) continue;
    const state = states.find((s) => s.id === def.id);
    if (!state) continue;
    const idx = TIER_INDEX[state.tier];
    if (idx >= 5) continue;
    state.progress += amount * 100;
    let cursor = idx;
    while (cursor < 5 && state.progress >= def.cost[cursor] && attrs[def.gate] >= def.gateThresholds[cursor]) {
      state.progress -= def.cost[cursor];
      cursor++;
    }
    if (cursor !== idx) {
      const from = state.tier;
      state.tier = BADGE_TIERS[cursor];
      upgrades.push({ id: def.id, from, to: state.tier });
    }
  }
  return upgrades;
}

/** Highest tier this badge can currently reach given the player's attributes. */
export function badgeCeiling(def: BadgeDef, attrs: Attributes): BadgeTier {
  let cursor = 0;
  while (cursor < 5 && attrs[def.gate] >= def.gateThresholds[cursor]) cursor++;
  return BADGE_TIERS[cursor];
}

export function badgeProgressPercent(state: BadgeState): number {
  const def = BADGE_BY_ID[state.id];
  const idx = TIER_INDEX[state.tier];
  if (!def || idx >= 5) return 1;
  return Math.min(1, state.progress / def.cost[idx]);
}
