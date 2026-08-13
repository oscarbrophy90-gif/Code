import { ONLINE_TIERS, onlineRank } from './onlinerank.ts';
import { STORE_BY_ID, STORE_ITEMS } from './data/cosmetics.ts';
import { ALL_TITLES, TITLE_BY_ID } from './data/titles.ts';
import { JUMPSHOTS, JUMPSHOT_BY_ID } from './shooting.ts';
import { DUNK_PACKAGES, DUNK_PACKAGE_BY_ID } from './sim/moves.ts';
import { seasonByIndex, seasonForTime, type SeasonDef } from './seasons.ts';
import {
  ACCESSORY_POOL,
  EMOTE_POOL,
  SHOT_POOL,
  THREE_POOL,
  THEME_BY_KEY,
  SEASON_THEMES,
  WIN_POOL,
  type SeasonTheme,
} from './data/seasonthemes.ts';
import { hashString, Rng } from './rng.ts';
import type { StoreCategory, StoreItem } from './economy.ts';
import type { JumpshotDef } from './shooting.ts';
import type { DunkPackageDef } from './sim/moves.ts';
import type { TitleDef } from './data/titles.ts';

/**
 * The ranked path: what each rank pays out when the season ends.
 *
 * Rewards are settled at the end of a season, not the moment you hit the rank,
 * and they are settled against the *highest* rank you held during it. That is
 * deliberate on both counts. Paying on arrival would mean a player who touched
 * Gold and slid back to Silver keeps the Gold reward and the Gold title, which
 * makes the title a lie; paying against your final rank instead would mean one
 * bad night on the last evening of a season costs you a month of work. Peak
 * rank, paid at the end, is the only version of this that is honest and not
 * cruel.
 *
 * Everything below a rank pays out too — reaching Diamond gives you Bronze
 * through Diamond. The path is a path, not a lottery.
 *
 * **The path belongs to the season.** It used to be one fixed list of items, so
 * the moment a season rolled over the new path was already ticked off from
 * top to bottom and there was nothing left to climb for — the reset wiped your
 * rank and gave you back nothing you did not already own. Every season now
 * builds its own path, named after itself, with its own ids: Concrete Break's
 * Diamond jersey and Frost Line's Diamond jersey are two different things you
 * can own at once, and neither ever shows up pre-claimed.
 */

export interface RankRewardTier {
  /** the tier id from ONLINE_TIERS */
  tierId: string;
  tierName: string;
  color: string;
  /** the name this rank gives its holders */
  alias: string;
  coins: number;
  titleId: string;
  /** store item ids, in the order the path shows them */
  items: string[];
}

/**
 * What each rank is called, independent of the season.
 *
 * These describe the *rank*, not the theme — a Bronze player is a rising hooper
 * in every season there has ever been — so they are the one part of the path
 * that does not get renamed every twenty days.
 */
const TIER_ALIAS = [
  'Rising Hooper',
  'Street Baller',
  'Certified Bucket',
  'Hoop Specialist',
  'Elite Hooper',
  'Court Dominator',
  'Superstar',
  'Champion',
  'King of the Court',
];

/** 10k at Bronze up to 90k at Grand Champ; 450,000 for the whole ladder. */
const TIER_COINS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000];

interface Slot {
  category: StoreCategory;
  /** a name with {word} placeholders, filled from the season's vocabulary */
  name: string;
}

/**
 * The shape of the path: which rank pays which kinds of thing, and what each is
 * called once the season's words are in it.
 *
 * The shape is fixed and the words are not. That is the point — a player who
 * has climbed before knows Sapphire pays a dunk package, a release, shoes, an
 * accessory, a celebration and a court, and does not know what any of them are
 * called until the season starts. The alternative, generating the shape too,
 * would mean a season that happened to pay four jerseys and no shoes.
 */
const PATH: Slot[][] = [
  // Bronze
  [
    { category: 'emote', name: '{emote0}' },
    { category: 'threeCelebration', name: '{three0}' },
  ],
  // Silver
  [
    { category: 'clothing', name: '{ground} Hoodie' },
    { category: 'emote', name: '{emote1}' },
    { category: 'hairstyle', name: '{street} Fade' },
  ],
  // Gold
  [
    { category: 'jumpshot', name: '{shot0}' },
    { category: 'shoes', name: '{ground} Runners' },
    { category: 'celebration', name: '{win0}' },
  ],
  // Platinum
  [
    { category: 'dunkPackage', name: '{key} Crush' },
    { category: 'accessory', name: '{acc0}' },
    { category: 'clothing', name: '{arena} Compression Set' },
    { category: 'emote', name: '{emote2}' },
    { category: 'court', name: '{broken} {arena}' },
  ],
  // Emerald
  [
    { category: 'dunkPackage', name: '{edge} Finish' },
    { category: 'jumpshot', name: '{ghost} Release' },
    { category: 'shoes', name: '{edge} Runners' },
    { category: 'emote', name: '{emote3}' },
    { category: 'threeCelebration', name: '{three1}' },
  ],
  // Sapphire
  [
    { category: 'dunkPackage', name: 'Rim {shatter}' },
    { category: 'jumpshot', name: '{hunter} Release' },
    { category: 'shoes', name: '{assassin} 1s' },
    { category: 'accessory', name: '{ground} Headband' },
    { category: 'celebration', name: '{win1}' },
    { category: 'court', name: '{under} Court' },
  ],
  // Diamond
  [
    { category: 'dunkPackage', name: '{quake}' },
    { category: 'jumpshot', name: '{shot1}' },
    { category: 'shoes', name: '{legend} 1s' },
    { category: 'jersey', name: '{street} {legend} Jersey' },
    { category: 'hairstyle', name: '{legend} Locs' },
    { category: 'emote', name: '{emote4}' },
    { category: 'threeCelebration', name: 'Ice In The {key}' },
    { category: 'celebration', name: '{win2}' },
  ],
  // Champion
  [
    { category: 'dunkPackage', name: 'Rim {destroy}' },
    { category: 'jumpshot', name: "{king}'s Release" },
    { category: 'shoes', name: '{king} 1s' },
    { category: 'jersey', name: '{key} {king} Jersey' },
    { category: 'accessory', name: "{king}'s Sleeve" },
    { category: 'hairstyle', name: '{royal} Braids' },
    { category: 'emote', name: '{emote5}' },
    { category: 'threeCelebration', name: '{crown} The Three' },
    { category: 'celebration', name: 'Take The {throne}' },
    { category: 'court', name: 'The {key} Arena' },
  ],
  // Grand Champ
  [
    { category: 'dunkPackage', name: '{apex}' },
    { category: 'jumpshot', name: '{storm}' },
    { category: 'shoes', name: '{arena} {gods}' },
    { category: 'jersey', name: 'Grand {arena} Jersey' },
    { category: 'hairstyle', name: '{crown} Locs' },
    { category: 'accessory', name: 'Grand Champion {crown}' },
    { category: 'emote', name: '{emote6}' },
    { category: 'threeCelebration', name: 'Rain From The Sky' },
    { category: 'celebration', name: "The {king}'s Entrance" },
    { category: 'court', name: 'The {forbidden} {arena}' },
    { category: 'aura', name: '{broken} Energy' },
    { category: 'nameEffect', name: 'Animated {key} Name' },
    { category: 'banner', name: '{king} of the {arena}' },
    { category: 'animation', name: '{key} Breaker' },
  ],
];

/** Rarity climbs with the rank, so the path looks like a path in the Locker. */
const TIER_RARITY: StoreItem['rarity'][] = [
  'rare', 'rare', 'epic', 'epic', 'epic', 'legendary', 'legendary', 'legendary', 'mythic',
];

// ------------------------------------------------------------------ the words

/**
 * The season's whole vocabulary: the theme's words plus the performance names
 * drawn from the pools.
 *
 * A theme may name its own performances instead — Concrete Break does — and
 * where it has, those win. Everywhere else the pools are dealt from without
 * replacement, so no season hands you the same emote twice.
 */
function vocabularyFor(season: SeasonDef): Record<string, string> {
  const first = season.title.split(' ')[0];
  const theme: SeasonTheme = THEME_BY_KEY[first] ?? SEASON_THEMES[season.index % SEASON_THEMES.length];
  const rng = new Rng(hashString(`hoops-path-${season.id}`));

  const deal = (pool: readonly string[], count: number, given: string[] | undefined): string[] => {
    if (given && given.length >= count) return given.slice(0, count);
    const bag = [...pool];
    const out = given ? [...given] : [];
    while (out.length < count && bag.length > 0) {
      const pick = bag.splice(rng.int(0, bag.length), 1)[0];
      if (!out.includes(pick)) out.push(pick);
    }
    return out;
  };

  const words: Record<string, string> = { ...(theme as unknown as Record<string, string>) };
  delete words.emotes;
  delete words.threes;
  delete words.wins;
  delete words.shots;
  delete words.accessories;

  deal(EMOTE_POOL, 7, theme.emotes).forEach((n, i) => (words[`emote${i}`] = n));
  deal(THREE_POOL, 2, theme.threes).forEach((n, i) => (words[`three${i}`] = n));
  deal(WIN_POOL, 3, theme.wins).forEach((n, i) => (words[`win${i}`] = n));
  deal(SHOT_POOL, 2, theme.shots).forEach((n, i) => (words[`shot${i}`] = n));
  deal(ACCESSORY_POOL, 1, theme.accessories).forEach((n, i) => (words[`acc${i}`] = n));
  return words;
}

function fill(template: string, words: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => words[key] ?? whole);
}

// ------------------------------------------------------------------- the ids

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The renderer reads what to draw out of the second segment of an id, so a
 * season's hoodie has to say "hoodie" in its id or it renders as shorts. Read
 * off the name, because the name is the only thing that knows.
 */
function clothingKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('compression')) return 'compression';
  if (n.includes('tracksuit') || n.includes('jacket')) return 'tracksuit';
  if (n.includes('hoodie')) return 'hoodie';
  if (n.includes('long')) return 'longshorts';
  if (n.includes('tee') || n.includes('cut')) return 'cutoff';
  return 'shorts';
}

function accessoryKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('crown')) return 'crown';
  if (n.includes('headband') || n.includes('band')) return 'headband';
  if (n.includes('sleeve')) return 'armsleeve';
  if (n.includes('goggle') || n.includes('visor')) return 'goggles';
  if (n.includes('knee') || n.includes('ankle')) return 'kneepad';
  if (n.includes('chain') || n.includes('pendant')) return 'chain';
  return 'wristbands';
}

function hairKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('locs')) return 'locs';
  if (n.includes('braids')) return 'braids';
  if (n.includes('cornrows')) return 'cornrows';
  if (n.includes('afro')) return 'afro';
  if (n.includes('waves')) return 'waves';
  if (n.includes('knot')) return 'topknot';
  return 'fade';
}

/** The id prefix for a slot, carrying the kind where the renderer needs one. */
function prefixFor(category: StoreCategory, name: string): string {
  switch (category) {
    case 'clothing':
      return `cloth-${clothingKind(name)}`;
    case 'accessory':
      return `acc-${accessoryKind(name)}`;
    case 'hairstyle':
      return `hair-${hairKind(name)}`;
    case 'celebration':
      return 'celeb';
    case 'threeCelebration':
      return 'three';
    case 'nameEffect':
      return 'name';
    case 'animation':
      return 'anim';
    default:
      return category;
  }
}

// -------------------------------------------------------- shots and packages

/**
 * The six ranked releases, one per rank from Gold up.
 *
 * The feel of each rank's shot is fixed and the numbers wobble a little each
 * season, so a returning player knows roughly what Sapphire's release is going
 * to ask of them without it being literally last season's shot with a new name.
 * None of them is a straight upgrade: the Grand Champion release is the fastest
 * in the game *and* the smallest window in the game, and a player who cannot
 * hit it shoots worse on it than on the free one.
 */
const SHOT_LINE: Record<string, Omit<JumpshotDef, 'id' | 'name' | 'blurb' | 'rankReward' | 'price'>> = {
  gold: { releaseTime: 0.64, greenWindow: 0.024, falloff: 0.95, driftPenalty: 0.75, timingCue: 'setPoint' },
  emerald: { releaseTime: 0.6, greenWindow: 0.0225, falloff: 1.0, driftPenalty: 0.7, timingCue: 'setPoint' },
  sapphire: { releaseTime: 0.41, greenWindow: 0.0125, falloff: 1.4, driftPenalty: 1.1, timingCue: 'release' },
  diamond: { releaseTime: 0.74, greenWindow: 0.0255, falloff: 0.82, driftPenalty: 1.05, timingCue: 'jumpApex' },
  champion: { releaseTime: 0.56, greenWindow: 0.0275, falloff: 0.95, driftPenalty: 0.85, timingCue: 'setPoint' },
  grandchamp: { releaseTime: 0.38, greenWindow: 0.011, falloff: 1.5, driftPenalty: 0.9, timingCue: 'release' },
};

const DUNK_LINE: Record<string, { requires: number; requiresVertical: number; contactCapable: boolean; duration: number; rarity: StoreItem['rarity'] }> = {
  platinum: { requires: 76, requiresVertical: 72, contactCapable: false, duration: 0.74, rarity: 'rare' },
  emerald: { requires: 80, requiresVertical: 76, contactCapable: false, duration: 0.78, rarity: 'epic' },
  sapphire: { requires: 86, requiresVertical: 82, contactCapable: true, duration: 0.96, rarity: 'epic' },
  diamond: { requires: 90, requiresVertical: 86, contactCapable: true, duration: 1.02, rarity: 'legendary' },
  champion: { requires: 92, requiresVertical: 88, contactCapable: true, duration: 1.06, rarity: 'legendary' },
  grandchamp: { requires: 95, requiresVertical: 92, contactCapable: true, duration: 1.14, rarity: 'mythic' },
};

const SHOT_BLURB: Record<string, string> = {
  gold: 'A short wind and an honest window. The first ranked shot worth keeping.',
  emerald: 'Even tempo the whole way up, and it barely notices a drift.',
  sapphire: 'Out of your hands before the contest arrives. Tiny window.',
  diamond: 'High set point over everything. Slow, and it does not care.',
  champion: 'Wide window and a level release. Punishes nothing.',
  grandchamp: 'The fastest release in the game and the smallest window in the game.',
};

const DUNK_BLURB: Record<string, string> = {
  platinum: 'Two hands, straight down, no ceremony.',
  emerald: 'Everything finished with the wrist over the cylinder.',
  sapphire: 'Goes straight through a set defender, every time.',
  diamond: 'Off one foot at full speed, reversed at the apex.',
  champion: 'Cocked behind the head and brought down on the front iron.',
  grandchamp: 'Hangs at the apex a beat longer than anybody else can.',
};

// ------------------------------------------------------------------- the path

const pathCache = new Map<string, RankRewardTier[]>();

/**
 * One season's ranked path, built once and remembered.
 *
 * Building it registers everything it names — store items, titles, releases and
 * dunk packages — with the catalogues the rest of the game looks things up in.
 * That is a side effect and it is on purpose: a reward the Locker cannot resolve
 * is a reward you cannot wear, and generating the path without registering it
 * would give you exactly that.
 */
export function rankRewardsFor(season: SeasonDef): RankRewardTier[] {
  const cached = pathCache.get(season.id);
  if (cached) return cached;

  const words = vocabularyFor(season);
  const sid = season.id.toLowerCase();
  const rng = new Rng(hashString(`hoops-path-stats-${season.id}`));
  // ±6%, so a season's Sapphire release is recognisably Sapphire's release and
  // still not last season's to the millisecond.
  const jitter = (v: number, amount = 0.06) => v * (1 + (rng.next() * 2 - 1) * amount);

  const tiers: RankRewardTier[] = ONLINE_TIERS.map((tier, index) => {
    const items: string[] = [];
    const rarity = TIER_RARITY[index];

    for (const slot of PATH[index]) {
      const name = fill(slot.name, words);
      const base = `${sid}-${tier.id}-${slug(name)}`;

      if (slot.category === 'jumpshot') {
        const line = SHOT_LINE[tier.id];
        const def: JumpshotDef = {
          id: base,
          name,
          blurb: SHOT_BLURB[tier.id] ?? 'A ranked release.',
          releaseTime: Math.round(jitter(line.releaseTime) * 1000) / 1000,
          greenWindow: Math.round(jitter(line.greenWindow) * 10000) / 10000,
          falloff: Math.round(jitter(line.falloff, 0.08) * 100) / 100,
          driftPenalty: Math.round(jitter(line.driftPenalty, 0.08) * 100) / 100,
          price: 0,
          timingCue: line.timingCue,
          rankReward: `${tier.name} in ${season.title}`,
        };
        registerJumpshot(def, tier.name, season, rarity);
        items.push(`jumpshot-${def.id}`);
        continue;
      }

      if (slot.category === 'dunkPackage') {
        const line = DUNK_LINE[tier.id];
        const def: DunkPackageDef = {
          id: base,
          name,
          blurb: DUNK_BLURB[tier.id] ?? 'A ranked package.',
          requires: Math.round(line.requires + (rng.next() * 4 - 2)),
          requiresVertical: Math.round(line.requiresVertical + (rng.next() * 4 - 2)),
          contactCapable: line.contactCapable,
          price: 0,
          duration: Math.round(jitter(line.duration, 0.05) * 100) / 100,
          rarity: line.rarity,
          rankReward: `${tier.name} in ${season.title}`,
        };
        registerDunk(def, tier.name, season);
        items.push(`dunk-${def.id}`);
        continue;
      }

      const id = `${prefixFor(slot.category, name)}-${base}`;
      registerItem({
        id,
        name,
        category: slot.category,
        price: 0,
        rarity,
        colors: [tier.color, index >= 6 ? season.accentAlt : season.accent],
        requirement: `Reach ${tier.name} in ${season.title} and finish the season`,
        description: `${season.title} ranked path, ${tier.name}.`,
      });
      items.push(id);
    }

    const titleId = `title-rank-${sid}-${tier.id}`;
    registerTitle({
      id: titleId,
      // What the rank was and which season it was — which is the whole claim a
      // ranked title makes, and it cannot be checked if it does not say both.
      name: `${season.title} — ${tier.name}`,
      description: `Finished ${season.title} in ${tier.name}.`,
      price: 0,
      rarity,
      color: tier.color,
      earn: `Reach ${tier.name} in ${season.title} and finish the season`,
    });

    return {
      tierId: tier.id,
      tierName: tier.name,
      color: tier.color,
      alias: TIER_ALIAS[index],
      coins: TIER_COINS[index],
      titleId,
      items,
    };
  });

  pathCache.set(season.id, tiers);
  return tiers;
}

/** The path for the season running right now. */
export function currentRankRewards(now = Date.now()): RankRewardTier[] {
  return rankRewardsFor(seasonForTime(now));
}

// ------------------------------------------------------------- registration

function registerItem(item: StoreItem): void {
  if (STORE_BY_ID[item.id]) return;
  STORE_ITEMS.push(item);
  STORE_BY_ID[item.id] = item;
}

function registerTitle(title: TitleDef): void {
  if (TITLE_BY_ID[title.id]) return;
  ALL_TITLES.push(title);
  TITLE_BY_ID[title.id] = title;
  registerItem({
    id: title.id,
    name: title.name,
    category: 'title',
    price: 0,
    rarity: title.rarity,
    colors: [title.color, '#101018'],
    requirement: title.earn,
    description: title.description,
  });
}

function registerJumpshot(def: JumpshotDef, tierName: string, season: SeasonDef, rarity: StoreItem['rarity']): void {
  if (JUMPSHOT_BY_ID[def.id]) return;
  JUMPSHOTS.push(def);
  JUMPSHOT_BY_ID[def.id] = def;
  registerItem({
    id: `jumpshot-${def.id}`,
    name: `Jump Shot: ${def.name}`,
    category: 'jumpshot',
    price: 0,
    rarity,
    colors: ['#3ef07a', '#0f6b3a'],
    requirement: `Reach ${tierName} in ${season.title} and finish the season`,
    description: def.blurb,
  });
}

function registerDunk(def: DunkPackageDef, tierName: string, season: SeasonDef): void {
  if (DUNK_PACKAGE_BY_ID[def.id]) return;
  DUNK_PACKAGES.push(def);
  DUNK_PACKAGE_BY_ID[def.id] = def;
  registerItem({
    id: `dunk-${def.id}`,
    name: `Dunk Package: ${def.name}`,
    category: 'dunkPackage',
    price: 0,
    rarity: def.rarity ?? 'epic',
    colors: ['#ff7a3d', '#ffd23d'],
    requirement: `Reach ${tierName} in ${season.title} and finish the season`,
    description: `${def.blurb} Requires ${def.requires} Dunk / ${def.requiresVertical} Vertical.`,
  });
}

/**
 * Makes sure every season a player could be carrying rewards from is resolvable.
 *
 * A save from four seasons ago holds ids nothing in the catalogue has heard of
 * until that season's path is built, and an unresolvable id is an item that
 * silently disappears from the Locker. So the season indices are read straight
 * back out of the ids the player owns, plus the current one and the one before
 * it, and those paths are built. Cheap, and it never builds a season nobody has
 * touched.
 */
export function registerOwnedSeasons(ownedIds: readonly string[], now = Date.now()): void {
  const current = seasonForTime(now);
  const indices = new Set<number>([current.index, Math.max(0, current.index - 1)]);
  for (const id of ownedIds) {
    const m = /-s(\d+)-/.exec(id);
    if (m) indices.add(Math.max(0, Number(m[1]) - 1));
  }
  for (const index of indices) rankRewardsFor(seasonByIndex(index));
}

// ------------------------------------------------------------------- payouts

/** What a points total is worth: every tier at or below the rank it reaches. */
export function rewardsUpTo(points: number, season: SeasonDef): RankRewardTier[] {
  const reached = ONLINE_TIERS.findIndex((t) => t.id === onlineRank(points).tier.id);
  if (reached < 0) return [];
  return rankRewardsFor(season).slice(0, reached + 1);
}

export interface SeasonPayout {
  /** the peak rank the payout was settled against */
  tierId: string;
  tierName: string;
  coins: number;
  /** everything unlocked, including the titles */
  items: string[];
  titles: string[];
}

/**
 * What a season ending pays a player who peaked at `peakPoints`.
 *
 * `owned` is passed in so a second season at the same rank pays the coins again
 * but does not re-list cosmetics you already have — the coins are the recurring
 * part, the gear is the once. In practice nothing repeats any more, because a
 * season's gear belongs to that season; the check stays because a player who
 * has already been handed a report and reads it twice should not be paid twice.
 */
export function seasonPayout(peakPoints: number, season: SeasonDef, owned: readonly string[] = []): SeasonPayout | null {
  const tiers = rewardsUpTo(peakPoints, season);
  if (tiers.length === 0) return null;
  const have = new Set(owned);
  const top = tiers[tiers.length - 1];

  const items: string[] = [];
  const titles: string[] = [];
  let coins = 0;
  for (const tier of tiers) {
    coins += tier.coins;
    for (const id of tier.items) if (!have.has(id)) items.push(id);
    if (!have.has(tier.titleId)) titles.push(tier.titleId);
  }

  return { tierId: top.tierId, tierName: top.tierName, coins, items, titles };
}
