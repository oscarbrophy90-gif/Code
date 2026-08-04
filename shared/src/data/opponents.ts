import { computeCaps, computeOverall, emptyAttributes } from '../ratings.ts';
import { freshBadges } from '../badges.ts';
import { hashString, Rng } from '../rng.ts';
import { BADGE_TIERS, type BadgeState, type BuildSpec, type Position } from '../types.ts';
import { TEAMS } from './teams.ts';
import type { SimPlayerConfig } from '../sim/state.ts';

const FIRST = [
  'Dez', 'Kobi', 'Ari', 'Trell', 'Jules', 'Nico', 'Sav', 'Rook', 'Bez', 'Quan',
  'Maro', 'Tay', 'Isa', 'Ren', 'Dax', 'Omari', 'Silas', 'Kai', 'Bram', 'Zeke',
  'Rio', 'Cass', 'Marek', 'Idris', 'Levi', 'Tobi', 'Jarek', 'Emeka', 'Sol', 'Vance',
];

const LAST = [
  'Vance', 'Okafor', 'Brix', 'Salter', 'Moreau', 'Ibe', 'Kessler', 'Nightingale', 'Duval', 'Aoki',
  'Reyes', 'Bello', 'Traore', 'Sandoval', 'Whitlock', 'Nakamura', 'Osei', 'Lindqvist', 'Carrasco', 'Adeyemi',
  'Farrow', 'Petrov', 'Cardoso', 'Mensah', 'Halloran', 'Bergstrom', 'Nunes', 'Ibarra', 'Tan', 'Rowe',
];

const BUILD_TEMPLATES: { name: string; position: Position; heightIn: number; weightLb: number; wingspanIn: number; focus: string[] }[] = [
  { name: 'Shot Creator', position: 'PG', heightIn: 74, weightLb: 185, wingspanIn: 78, focus: ['ballHandle', 'threePoint', 'speed', 'acceleration'] },
  { name: 'Two-Way Guard', position: 'SG', heightIn: 77, weightLb: 200, wingspanIn: 82, focus: ['threePoint', 'perimeterDefense', 'steal', 'midRange'] },
  { name: 'Slasher', position: 'SF', heightIn: 79, weightLb: 215, wingspanIn: 84, focus: ['layup', 'dunk', 'acceleration', 'strength'] },
  { name: 'Stretch Big', position: 'PF', heightIn: 82, weightLb: 235, wingspanIn: 87, focus: ['threePoint', 'defensiveRebound', 'interiorDefense', 'strength'] },
  { name: 'Paint Beast', position: 'C', heightIn: 85, weightLb: 265, wingspanIn: 91, focus: ['dunk', 'offensiveRebound', 'defensiveRebound', 'block', 'interiorDefense'] },
  { name: 'Lockdown Wing', position: 'SF', heightIn: 80, weightLb: 210, wingspanIn: 86, focus: ['perimeterDefense', 'steal', 'block', 'layup'] },
];

/** Builds a believable bot opponent scaled to a target overall rating. */
export function generateOpponent(targetOverall: number, seed: number): SimPlayerConfig {
  const rng = new Rng(seed >>> 0 || 7);
  const template = rng.pick(BUILD_TEMPLATES);
  const build: BuildSpec = {
    position: template.position,
    jerseyNumber: rng.int(0, 100),
    heightIn: template.heightIn + rng.int(-1, 2),
    weightLb: template.weightLb + rng.int(-8, 9),
    wingspanIn: template.wingspanIn + rng.int(-1, 2),
  };
  const caps = computeCaps(build);
  const attrs = emptyAttributes(40);

  // Push focus attributes toward the cap, then balance the rest until the
  // overall lands near the target.
  for (const key of template.focus) {
    const k = key as keyof typeof attrs;
    attrs[k] = Math.min(caps[k], Math.round(caps[k] * rng.range(0.86, 0.99)));
  }
  let guard = 0;
  while (computeOverall(attrs, build.position) < targetOverall && guard++ < 400) {
    const keys = Object.keys(attrs) as (keyof typeof attrs)[];
    const key = rng.pick(keys);
    if (attrs[key] < caps[key]) attrs[key]++;
  }
  guard = 0;
  while (computeOverall(attrs, build.position) > targetOverall && guard++ < 400) {
    const keys = Object.keys(attrs) as (keyof typeof attrs)[];
    const key = rng.pick(keys);
    if (attrs[key] > 30) attrs[key]--;
  }

  // Badges scale with the bot's overall so higher ladders feel different.
  const badges: BadgeState[] = freshBadges();
  const badgeCeil = Math.max(0, Math.min(5, Math.round((targetOverall - 62) / 7)));
  for (const b of badges) {
    if (rng.chance(0.42)) {
      b.tier = BADGE_TIERS[Math.max(0, rng.int(1, badgeCeil + 1))];
    }
  }

  const team = rng.pick(TEAMS);
  const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;

  return {
    id: `bot-${seed}`,
    name,
    attrs,
    badges,
    heightIn: build.heightIn,
    weightLb: build.weightLb,
    wingspanIn: build.wingspanIn,
    jumpshotId: rng.pick(['base-rise', 'silk', 'quick-trigger', 'high-tower', 'whip', 'metronome']),
    dunkPackageId: attrs.dunk > 82 ? 'poster' : attrs.dunk > 74 ? 'rim-hang' : attrs.dunk > 68 ? 'tomahawk' : 'basic-slam',
    jerseyPrimary: team.primary,
    jerseySecondary: team.accent,
    skinTone: rng.int(0, 8),
    isBot: true,
  };
}

export function opponentForRank(rankPoints: number, salt = 'q'): SimPlayerConfig {
  const overall = Math.round(62 + Math.min(1, rankPoints / 4600) * 34);
  return generateOpponent(overall, hashString(`${salt}-${Math.floor(Date.now() / 1000)}-${rankPoints}`));
}

export { BUILD_TEMPLATES };
