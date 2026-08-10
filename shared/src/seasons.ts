import { hashString, Rng } from './rng.ts';
import type { ChallengeState } from './types.ts';

/**
 * How long a season runs.
 *
 * Twenty days. Short enough that a rank reset is an event you take part in
 * rather than something that happens to you twice a year, and long enough to
 * climb the whole ladder if you are good enough to.
 */
export const SEASON_LENGTH_DAYS = 20;
export const SEASON_LENGTH_MS = SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000;
/** First season tipped off at this instant; every season is measured from it. */
export const SEASON_EPOCH = Date.UTC(2026, 0, 5, 0, 0, 0);

export interface SeasonDef {
  index: number;
  id: string;
  /** "Season 7: Neon Circuit" */
  name: string;
  /** just the title half — "Neon Circuit" */
  title: string;
  theme: string;
  startsAt: number;
  endsAt: number;
  accent: string;
  accentAlt: string;
  /**
   * Which cover art the season wears, 0-5. Drawn procedurally by the client
   * from this plus the two accents, so every season looks like its own thing
   * without shipping a single image.
   */
  cover: number;
}

/**
 * Season names are generated rather than listed.
 *
 * A fixed list runs out, and a season that reuses last year's name is a season
 * nobody believes is new. Two halves and a seeded pick gives a few thousand
 * combinations, and seeding off the season index means everybody on every copy
 * of the game is in the same season with the same name.
 */
const SEASON_FIRST = [
  'Concrete', 'Neon', 'Salt', 'Skyline', 'Iron', 'Midnight', 'Chrome', 'Ember',
  'Static', 'Glass', 'Cobalt', 'Rust', 'Velvet', 'Frost', 'Amber', 'Crimson',
  'Shadow', 'Solar', 'Marble', 'Onyx', 'Copper', 'Violet', 'Storm', 'Ash',
];

const SEASON_SECOND = [
  'Rise', 'Circuit', 'Coast', 'Reign', 'Works', 'Green', 'Hour', 'Run',
  'Signal', 'House', 'Court', 'Season', 'Line', 'Break', 'Light', 'Cut',
  'District', 'Heights', 'Nights', 'Standard',
];

const SEASON_THEMES = [
  'Cracked asphalt, chain nets, city lights.',
  'Night courts wired with reactive lighting.',
  'Sun glare, salt air, barefoot handles.',
  'Rooftop hoops above the traffic.',
  'Old gym, cold air, heavy iron.',
  'The season of the perfect release.',
  'Nobody warms up. Everybody runs it back.',
  'Twenty days to prove where you belong.',
];

const SEASON_ACCENTS: [string, string][] = [
  ['#ff7a3d', '#ffd23d'],
  ['#3dd6ff', '#a03dff'],
  ['#ffd98a', '#3dbfa0'],
  ['#8ab4ff', '#ff5c8a'],
  ['#c0c6d0', '#e05b3d'],
  ['#3ef07a', '#0f6b3a'],
  ['#ff5c8a', '#ffb347'],
  ['#8ff2ff', '#5b8cff'],
];

/** How many distinct cover designs the client knows how to draw. */
export const SEASON_COVERS = 6;

export function seasonForTime(time: number): SeasonDef {
  const index = Math.max(0, Math.floor((time - SEASON_EPOCH) / SEASON_LENGTH_MS));
  const rng = new Rng(hashString(`hoops-season-${index}`));
  // Drawn in a fixed order so the same index always builds the same season.
  const first = SEASON_FIRST[rng.int(0, SEASON_FIRST.length)];
  const second = SEASON_SECOND[rng.int(0, SEASON_SECOND.length)];
  const theme = SEASON_THEMES[rng.int(0, SEASON_THEMES.length)];
  const [accent, accentAlt] = SEASON_ACCENTS[rng.int(0, SEASON_ACCENTS.length)];
  const cover = rng.int(0, SEASON_COVERS);

  const title = `${first} ${second}`;
  const startsAt = SEASON_EPOCH + index * SEASON_LENGTH_MS;
  return {
    index,
    id: `S${index + 1}`,
    name: `Season ${index + 1}: ${title}`,
    title,
    theme,
    startsAt,
    endsAt: startsAt + SEASON_LENGTH_MS,
    accent,
    accentAlt,
    cover,
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
        ? { tier, track: 'free', kind: 'cosmetic', name: `${season.title} Jersey ${tier / 10}`, itemId: `bp-${season.id}-free-jersey-${tier}` }
        : tier % 5 === 0
          ? { tier, track: 'free', kind: 'currency', name: `${1500 + tier * 25} Coins`, amount: 1500 + tier * 25 }
          : { tier, track: 'free', kind: 'currency', name: `${400 + tier * 15} Coins`, amount: 400 + tier * 15 },
    );

    const premiumKind: PassReward['kind'] =
      tier % 10 === 0 ? 'court' : tier % 7 === 0 ? 'animation' : tier % 4 === 0 ? 'cosmetic' : rng.chance(0.3) ? 'boost' : 'currency';
    const premiumName =
      premiumKind === 'court'
        ? `${season.title} Court ${tier / 10}`
        : premiumKind === 'animation'
          ? `Signature Celebration ${Math.ceil(tier / 7)}`
          : premiumKind === 'cosmetic'
            ? `${season.title} Drop ${Math.ceil(tier / 4)}`
            : premiumKind === 'boost'
              ? 'Double XP (1 hour)'
              : `${900 + tier * 30} Coins`;
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
  /** store item or title granted on top of the coins and XP */
  itemReward?: string;
  expiresAt: number;
}

/**
 * Item rewards are held here as plain ids so the challenge generator stays
 * free of the cosmetics catalogue. Weeklies pay a piece of kit, seasonals pay
 * a title or something you would otherwise have to save up for.
 */
const WEEKLY_REWARDS = [
  'acc-headband',
  'acc-armsleeve',
  'acc-goggles',
  'acc-chain',
  'shoes-lowrider',
  'shoes-anvil',
  'cloth-compression',
  'cloth-hoodie',
  'emote-clap',
  'emote-bow',
  'celeb-shrug',
  'hair-waves',
  'tat-sleeve-left',
];

const SEASONAL_REWARDS = [
  'title-grinder',
  'title-collector',
  'title-bucket',
  'title-cold',
  'title-problem',
  'title-him',
  'shoes-flare',
  'celeb-crown',
  'court-hardwood',
  'jersey-midnight',
];

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
      itemReward: WEEKLY_REWARDS[(week + i * 5) % WEEKLY_REWARDS.length],
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
      itemReward: SEASONAL_REWARDS[(hashString(season.id) + i * 3) % SEASONAL_REWARDS.length],
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
