import type { AttributeKey } from '../types.ts';

/**
 * Training drills. Each one is a timed rep count against a specific skill, and
 * each pays out on how many reps you land — so a bad run still pays something
 * and a great one pays properly.
 */
export type DrillMode = 'shooting' | 'finishing' | 'takeaway' | 'stops';

export interface DrillDef {
  id: string;
  name: string;
  /** one line on the card */
  blurb: string;
  /** what counts as a rep, in the player's words */
  goal: string;
  mode: DrillMode;
  durationSeconds: number;
  /** rep counts for bronze / silver / gold */
  tiers: [number, number, number];
  /** coins per rep */
  coinsPerRep: number;
  /** xp per rep */
  xpPerRep: number;
  /** the attributes this drill trains, shown on the card */
  trains: AttributeKey[];
  color: string;
  /** free shooting: no reps, no medals, no payout — just a rim */
  freeplay?: boolean;
}

/**
 * The shoot-around. It reuses the drill runtime for its parked bot and its
 * exit, but there is nothing to count and nothing to win.
 */
export const SHOOT_AROUND: DrillDef = {
  id: 'drill-shootaround',
  name: 'Shoot Around',
  blurb: 'Free shooting, nobody guarding you.',
  goal: 'Shoot as long as you like',
  mode: 'shooting',
  durationSeconds: 3600,
  tiers: [0, 0, 0],
  coinsPerRep: 0,
  xpPerRep: 0,
  trains: [],
  color: '#8a93a6',
  freeplay: true,
};

export const DRILLS: DrillDef[] = [
  {
    id: 'drill-three',
    name: 'Three-Point Drill',
    blurb: 'Nobody guarding you. Get behind the line and shoot.',
    goal: 'Make threes — a green release counts double',
    mode: 'shooting',
    durationSeconds: 75,
    tiers: [6, 12, 20],
    coinsPerRep: 26,
    xpPerRep: 14,
    trains: ['threePoint'],
    color: '#3ef07a',
  },
  {
    id: 'drill-layup',
    name: 'Layup Drill',
    blurb: 'Attack the rim from the wing and finish. No help defence.',
    goal: 'Finish at the rim — dunks and greens count double',
    mode: 'finishing',
    durationSeconds: 75,
    tiers: [8, 15, 24],
    coinsPerRep: 22,
    xpPerRep: 12,
    trains: ['layup', 'closeShot', 'dunk'],
    color: '#ff7a3d',
  },
  {
    id: 'drill-takeaway',
    name: 'Blocking & Stealing Drill',
    blurb: 'The CPU attacks over and over. Take the ball off them.',
    goal: 'Block a shot or strip the handle',
    mode: 'takeaway',
    durationSeconds: 90,
    tiers: [2, 5, 9],
    coinsPerRep: 90,
    xpPerRep: 40,
    trains: ['block', 'steal', 'vertical'],
    color: '#4aa3ff',
  },
  {
    id: 'drill-defense',
    name: 'Defending Drill',
    blurb: 'Stay in front. Every possession the CPU comes at you again.',
    goal: 'Get a stop — a miss, a turnover or a shot-clock violation',
    mode: 'stops',
    durationSeconds: 90,
    tiers: [4, 8, 13],
    coinsPerRep: 55,
    xpPerRep: 26,
    trains: ['perimeterDefense', 'interiorDefense', 'strength'],
    color: '#a06bff',
  },
];

export const DRILL_BY_ID: Record<string, DrillDef> = Object.fromEntries(DRILLS.map((d) => [d.id, d]));

export type DrillMedal = 'none' | 'bronze' | 'silver' | 'gold';

export const MEDAL_COLOR: Record<DrillMedal, string> = {
  none: '#8a93a6',
  bronze: '#c98a4b',
  silver: '#cfd8e6',
  gold: '#ffd23d',
};

export function drillMedal(def: DrillDef, reps: number): DrillMedal {
  if (def.freeplay) return 'none';
  if (reps >= def.tiers[2]) return 'gold';
  if (reps >= def.tiers[1]) return 'silver';
  if (reps >= def.tiers[0]) return 'bronze';
  return 'none';
}

/** Coins and XP for a finished drill run, with a bonus at each medal. */
export function drillReward(def: DrillDef, reps: number): { currency: number; xp: number; medal: DrillMedal } {
  const medal = drillMedal(def, reps);
  const bonus = medal === 'gold' ? 1.6 : medal === 'silver' ? 1.3 : medal === 'bronze' ? 1.1 : 1;
  return {
    currency: Math.round(reps * def.coinsPerRep * bonus),
    xp: Math.round(reps * def.xpPerRep * bonus),
    medal,
  };
}
