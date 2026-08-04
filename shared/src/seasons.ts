import { hashString, Rng } from './rng.ts';
import type { ChallengeState } from './types.ts';

export const SEASON_LENGTH_WEEKS = 8;
export const SEASON_LENGTH_MS = SEASON_LENGTH_WEEKS * 7 * 24 * 60 * 60 * 1000;
/** First season tipped off at this instant; every season is measured from it. */
export const SEASON_EPOCH = Date.UTC(2026, 0, 5, 0, 0, 0);

export interface SeasonDef {
  index: number;
  id: string;
  name: string;
  theme: string;
  startsAt: number;
  endsAt: number;
  accent: string;
  accentAlt: string;
}

const SEASON_NAMES: [string, string, string, string][] = [
  ['Concrete Rise', 'Cracked asphalt, chain nets, city lights.', '#ff7a3d', '#ffd23d'],
  ['Neon Circuit', 'Night courts wired with reactive lighting.', '#3dd6ff', '#a03dff'],
  ['Salt & Sand', 'Beach runs, sun glare, barefoot handles.', '#ffd98a', '#3dbfa0'],
  ['Skyline', 'Rooftop hoops above the traffic.', '#8ab4ff', '#ff5c8a'],
  ['Ironworks', 'Old gym, cold air, heavy iron.', '#c0c6d0', '#e05b3d'],
  ['Midnight Green', 'The season of the perfect release.', '#3ef07a', '#0f6b3a'],
];

export function seasonForTime(time: number): SeasonDef {
  const index = Math.max(0, Math.floor((time - SEASON_EPOCH) / SEASON_LENGTH_MS));
  const [name, theme, accent, accentAlt] = SEASON_NAMES[index % SEASON_NAMES.length];
  const startsAt = SEASON_EPOCH + index * SEASON_LENGTH_MS;
  return {
    index,
    id: `S${index + 1}`,
    name: `Season ${index + 1}: ${name}`,
    theme,
    startsAt,
    endsAt: startsAt + SEASON_LENGTH_MS,
    accent,
    accentAlt,
  };
}

export function seasonTimeRemaining(time: number): { days: number; hours: number; minutes: number; percent: number } {
  const season = seasonForTime(time);
  const remaining = Math.max(0, season.endsAt - time);
  return {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    percent: 1 - remaining / SEASON_LENGTH_MS,
  };
}

// --------------------------------------------------------------- battle pass

export const BATTLE_PASS_TIERS = 40;
export const XP_PER_TIER = 2400;

export interface PassReward {
  tier: number;
  track: 'free' | 'premium';
  kind: 'currency' | 'cosmetic' | 'animation' | 'boost' | 'court' | 'title';
  name: string;
  amount?: number;
  itemId?: string;
}

/**
 * The free track carries currency and enough cosmetics that a non-paying
 * player still finishes a season with new gear. The premium track is cosmetic
 * and convenience only — never attributes or badges.
 */
export function buildBattlePass(season: SeasonDef): PassReward[] {
  const rng = new Rng(hashString(season.id));
  const rewards: PassReward[] = [];
  for (let tier = 1; tier <= BATTLE_PASS_TIERS; tier++) {
    const milestone = tier % 10 === 0;
    rewards.push(
      milestone
        ? { tier, track: 'free', kind: 'cosmetic', name: `${season.name.split(': ')[1]} Jersey ${tier / 10}`, itemId: `bp-${season.id}-free-jersey-${tier}` }
        : tier % 5 === 0
          ? { tier, track: 'free', kind: 'currency', name: `${1500 + tier * 25} Court Credits`, amount: 1500 + tier * 25 }
          : { tier, track: 'free', kind: 'currency', name: `${400 + tier * 15} Court Credits`, amount: 400 + tier * 15 },
    );

    const premiumKind: PassReward['kind'] =
      tier % 10 === 0 ? 'court' : tier % 7 === 0 ? 'animation' : tier % 4 === 0 ? 'cosmetic' : rng.chance(0.3) ? 'boost' : 'currency';
    const premiumName =
      premiumKind === 'court'
        ? `${season.name.split(': ')[1]} Court ${tier / 10}`
        : premiumKind === 'animation'
          ? `Signature Celebration ${Math.ceil(tier / 7)}`
          : premiumKind === 'cosmetic'
            ? `${season.name.split(': ')[1]} Drop ${Math.ceil(tier / 4)}`
            : premiumKind === 'boost'
              ? 'Double XP (1 hour)'
              : `${900 + tier * 30} Court Credits`;
    rewards.push({
      tier,
      track: 'premium',
      kind: premiumKind,
      name: premiumName,
      amount: premiumKind === 'currency' ? 900 + tier * 30 : undefined,
      itemId: premiumKind === 'currency' || premiumKind === 'boost' ? undefined : `bp-${season.id}-prem-${tier}`,
    });
  }
  return rewards;
}

export function tierForPassXp(xp: number): { tier: number; into: number; percent: number } {
  const tier = Math.min(BATTLE_PASS_TIERS, Math.floor(xp / XP_PER_TIER) + 1);
  const into = xp % XP_PER_TIER;
  return { tier, into, percent: tier >= BATTLE_PASS_TIERS ? 1 : into / XP_PER_TIER };
}

// ---------------------------------------------------------------- challenges

export type ChallengeScope = 'daily' | 'weekly' | 'seasonal';

export interface ChallengeDef {
  id: string;
  scope: ChallengeScope;
  name: string;
  description: string;
  target: number;
  /** stat key incremented by the match summary */
  metric: ChallengeMetric;
  currency: number;
  xp: number;
  expiresAt: number;
}

export type ChallengeMetric =
  | 'wins'
  | 'games'
  | 'points'
  | 'greens'
  | 'threes'
  | 'steals'
  | 'blocks'
  | 'rebounds'
  | 'ankleBreakers'
  | 'contactDunks'
  | 'chaseDownBlocks'
  | 'assists';

interface Template {
  metric: ChallengeMetric;
  name: string;
  description: (n: number) => string;
  range: [number, number];
}

const TEMPLATES: Template[] = [
  { metric: 'wins', name: 'Take the Court', description: (n) => `Win ${n} games in any playlist.`, range: [1, 4] },
  { metric: 'games', name: 'Run It Back', description: (n) => `Play ${n} games.`, range: [2, 6] },
  { metric: 'greens', name: 'Perfect Release', description: (n) => `Land ${n} green releases.`, range: [4, 14] },
  { metric: 'threes', name: 'From Deep', description: (n) => `Make ${n} shots from behind the arc.`, range: [3, 12] },
  { metric: 'points', name: 'Bucket Getter', description: (n) => `Score ${n} total points.`, range: [20, 70] },
  { metric: 'steals', name: 'Sticky Hands', description: (n) => `Record ${n} steals.`, range: [2, 8] },
  { metric: 'blocks', name: 'Not In My House', description: (n) => `Record ${n} blocks.`, range: [2, 7] },
  { metric: 'rebounds', name: 'Clean the Glass', description: (n) => `Pull down ${n} rebounds.`, range: [5, 20] },
  { metric: 'ankleBreakers', name: 'Shake and Bake', description: (n) => `Break down ${n} defenders.`, range: [1, 6] },
  { metric: 'contactDunks', name: 'Through Contact', description: (n) => `Finish ${n} contact dunks.`, range: [1, 4] },
  { metric: 'chaseDownBlocks', name: 'Track Meet', description: (n) => `Land ${n} chase-down blocks.`, range: [1, 3] },
];

function dayIndex(time: number): number {
  return Math.floor(time / 86400000);
}

function weekIndex(time: number): number {
  return Math.floor(time / (7 * 86400000));
}

/**
 * Challenges are generated deterministically from the calendar, so every
 * player worldwide sees the same board without needing a server round-trip.
 */
export function generateChallenges(time: number): ChallengeDef[] {
  const out: ChallengeDef[] = [];
  const day = dayIndex(time);
  const week = weekIndex(time);
  const season = seasonForTime(time);

  const dailyRng = new Rng(hashString(`daily-${day}`));
  const dayEnd = (day + 1) * 86400000;
  for (let i = 0; i < 3; i++) {
    const t = dailyRng.pick(TEMPLATES);
    const target = Math.round(dailyRng.range(t.range[0], t.range[1]));
    out.push({
      id: `d-${day}-${i}`,
      scope: 'daily',
      name: t.name,
      description: t.description(target),
      target,
      metric: t.metric,
      currency: 450 + target * 25,
      xp: 400 + target * 22,
      expiresAt: dayEnd,
    });
  }

  const weeklyRng = new Rng(hashString(`weekly-${week}`));
  const weekEnd = (week + 1) * 7 * 86400000;
  for (let i = 0; i < 3; i++) {
    const t = weeklyRng.pick(TEMPLATES);
    const target = Math.round(weeklyRng.range(t.range[0], t.range[1]) * 4);
    out.push({
      id: `w-${week}-${i}`,
      scope: 'weekly',
      name: `Weekly: ${t.name}`,
      description: t.description(target),
      target,
      metric: t.metric,
      currency: 2200 + target * 40,
      xp: 2000 + target * 35,
      expiresAt: weekEnd,
    });
  }

  const seasonRng = new Rng(hashString(`season-${season.id}`));
  for (let i = 0; i < 4; i++) {
    const t = seasonRng.pick(TEMPLATES);
    const target = Math.round(seasonRng.range(t.range[0], t.range[1]) * 18);
    out.push({
      id: `s-${season.id}-${i}`,
      scope: 'seasonal',
      name: `${season.id}: ${t.name}`,
      description: t.description(target),
      target,
      metric: t.metric,
      currency: 9000 + target * 30,
      xp: 8000 + target * 28,
      expiresAt: season.endsAt,
    });
  }

  return out;
}

export function syncChallengeStates(defs: ChallengeDef[], states: ChallengeState[]): ChallengeState[] {
  const byId = new Map(states.map((s) => [s.id, s]));
  return defs.map((d) => byId.get(d.id) ?? { id: d.id, progress: 0, claimed: false, expiresAt: d.expiresAt });
}

// -------------------------------------------------------------------- events

export interface LiveEventDef {
  id: string;
  name: string;
  blurb: string;
  kind: 'kingOfTheCourt' | 'tournament' | 'rush' | 'doubleXp' | 'championship';
  /** day-of-week the event runs, 0 = Sunday; -1 = always on */
  day: number;
  startHourUtc: number;
  durationHours: number;
  accent: string;
}

export const LIVE_EVENTS: LiveEventDef[] = [
  { id: 'kotc', name: 'King of the Court', blurb: 'Hold the court. Every win extends your reign and your multiplier.', kind: 'kingOfTheCourt', day: -1, startHourUtc: 0, durationHours: 24, accent: '#ffd23d' },
  { id: 'rush', name: '1v1 Rush', blurb: 'First to 5, 12-second shot clock, back-to-back queues.', kind: 'rush', day: -1, startHourUtc: 0, durationHours: 24, accent: '#3dd6ff' },
  { id: 'weekend-cup', name: 'Weekend Tournament', blurb: '32-player single elimination for the weekend crown.', kind: 'tournament', day: 6, startHourUtc: 16, durationHours: 8, accent: '#a06bff' },
  { id: 'double-xp', name: 'Double XP Weekend', blurb: 'Every game pays double XP toward level and season pass.', kind: 'doubleXp', day: 5, startHourUtc: 18, durationHours: 54, accent: '#3ef07a' },
  { id: 'season-champs', name: 'Seasonal Championship', blurb: 'The top 256 of each region play for the season banner.', kind: 'championship', day: 0, startHourUtc: 18, durationHours: 6, accent: '#ff5c8a' },
];

export function isEventLive(event: LiveEventDef, time: number): boolean {
  if (event.day === -1) return true;
  const d = new Date(time);
  const startOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const eventDayOffset = (event.day - d.getUTCDay() + 7) % 7;
  const start = startOfDay + eventDayOffset * 86400000 + event.startHourUtc * 3600000;
  const prevStart = start - 7 * 86400000;
  const within = (s: number) => time >= s && time < s + event.durationHours * 3600000;
  return within(start) || within(prevStart);
}

export function activeXpMultiplier(time: number): number {
  const dx = LIVE_EVENTS.find((e) => e.kind === 'doubleXp');
  return dx && isEventLive(dx, time) ? 2 : 1;
}
