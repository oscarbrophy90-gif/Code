import { Rng, hashString } from '../rng.ts';
import { DIVISIONS_PER_TIER, ONLINE_TIERS, POINTS_PER_DIVISION, onlineRank } from '../onlinerank.ts';

/**
 * The offline leaderboard.
 *
 * There is no server and no other people: these are generated rivals, and the
 * game says so rather than dressing them up as accounts. What they are for is
 * giving the ladder a shape — a rank with nobody else on it is a number, and a
 * rank with eighty names above and below it is a position.
 *
 * Generated from a constant seed, so the board is the same every launch. A
 * leaderboard that reshuffles itself between sessions makes your own movement
 * meaningless, because you can never tell whether you passed somebody or they
 * simply moved.
 */

export interface LadderRival {
  id: string;
  name: string;
  /** ranked points, which is the rank */
  points: number;
  overall: number;
  level: number;
  wins: number;
  losses: number;
  streak: number;
}

/** How many rivals populate the board. */
export const LADDER_SIZE = 90;

/**
 * Name parts.
 *
 * Two halves and a seeded pick: a few thousand combinations, all of them the
 * sort of thing somebody would actually call themselves on a park court.
 */
const NAME_HEAD = [
  'Clutch', 'Hoop', 'Green', 'Bucket', 'Dime', 'Ankle', 'Splash', 'Rim', 'Iso', 'Fade',
  'Handle', 'Corner', 'Range', 'Paint', 'Glass', 'Chase', 'Lock', 'Deep', 'Cold', 'Quick',
  'Silk', 'Steel', 'Night', 'Storm', 'Shadow', 'Neon', 'Blitz', 'Vault', 'Prime', 'Swish',
  'Crossover', 'Poster', 'Triple', 'Money', 'Ice', 'Fast', 'Sky', 'Street', 'Court', 'Elbow',
];

const NAME_TAIL = [
  'King', 'Demon', 'Machine', 'Boy', 'Lord', 'Breaker', 'God', 'Reaper', 'Master', 'Killer',
  'Hunter', 'Sniper', 'General', 'Merchant', 'Wizard', 'Beast', 'Menace', 'Prodigy', 'Savant', 'Legend',
  'Runner', 'Assassin', 'Closer', 'Architect', 'Surgeon', 'Technician', 'Anchor', 'Phantom', 'Specialist', 'Artist',
];

/** Occasionally a number gets tacked on, the way they really do. */
const NAME_SUFFIX = ['', '', '', '', '', '', '23', '11', '00', '01', '99', '7', 'x', 'HD', 'TV'];

/** One generated name, in the park style: two words jammed together. */
export function generateLadderName(rng: Rng): string {
  const head = NAME_HEAD[rng.int(0, NAME_HEAD.length)];
  const tail = NAME_TAIL[rng.int(0, NAME_TAIL.length)];
  const suffix = NAME_SUFFIX[rng.int(0, NAME_SUFFIX.length)];
  return `${head}${tail}${suffix}`;
}

/** A name for the player's own profile, from any seed. */
export function generatePlayerName(seed = Date.now()): string {
  return generateLadderName(new Rng(hashString(`player-${seed}`)));
}

/**
 * How many rivals sit in each tier, top first.
 *
 * Written down rather than derived from a curve, so the board is a pyramid: a
 * handful of Grand Champs, a crowded Bronze, and everything in between. An
 * earlier version of this idea used a curve that looked right at the top and
 * put a third of the population in the highest rank, which makes the highest
 * rank mean nothing.
 */
const TIER_POPULATION: { tier: string; count: number }[] = [
  { tier: 'grandchamp', count: 3 },
  { tier: 'champion', count: 5 },
  { tier: 'diamond', count: 7 },
  { tier: 'sapphire', count: 9 },
  { tier: 'emerald', count: 11 },
  { tier: 'platinum', count: 13 },
  { tier: 'gold', count: 15 },
  { tier: 'silver', count: 15 },
  { tier: 'bronze', count: 12 },
];

const LADDER_SEED = 0x48_4f_4f_50;

let cached: LadderRival[] | null = null;

/** The rivals, best first. Built once and reused. */
export function ladderRivals(): LadderRival[] {
  if (cached) return cached;

  const rng = new Rng(LADDER_SEED);
  const rivals: LadderRival[] = [];
  const used = new Set<string>();
  let made = 0;

  for (const { tier, count } of TIER_POPULATION) {
    const tierIndex = ONLINE_TIERS.findIndex((t) => t.id === tier);
    const floor = tierIndex * DIVISIONS_PER_TIER * POINTS_PER_DIVISION;
    for (let i = 0; i < count; i++) {
      const within = count === 1 ? 0 : i / (count - 1);
      // Grand Champ has no ceiling, so it stretches — the top of the board is
      // well clear of the bottom of it, which is what makes #1 worth chasing.
      const span = tier === 'grandchamp' ? 900 : DIVISIONS_PER_TIER * POINTS_PER_DIVISION - 1;
      const points = Math.round(floor + (1 - within) * span + rng.range(0, 20));

      let name = generateLadderName(rng);
      let guard = 0;
      while (used.has(name.toLowerCase()) && guard++ < 60) name = generateLadderName(rng);
      used.add(name.toLowerCase());

      // Standing drives everything else: the people at the top have played more,
      // won more of what they played, and built better.
      const standing = 1 - made / LADDER_SIZE;
      const games = Math.round(28 + standing * 150 + rng.range(0, 40));
      const winRate = 0.4 + standing * 0.28 + rng.range(-0.05, 0.05);
      const wins = Math.max(1, Math.round(games * winRate));

      rivals.push({
        id: `r${made}`,
        name,
        points,
        overall: Math.round(60 + standing * 36 + rng.range(-2, 2)),
        level: Math.max(1, Math.round(3 + standing * 45 + rng.range(-3, 3))),
        wins,
        losses: Math.max(0, games - wins),
        streak: rng.next() < 0.25 ? rng.int(2, 3 + Math.round(standing * 6)) : 0,
      });
      made++;
    }
  }

  rivals.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  cached = rivals;
  return rivals;
}

/** What the board shows: a rival or the player, in one shape. */
export interface LadderRow extends LadderRival {
  position: number;
  /** true for the row that is you */
  me: boolean;
  rankLabel: string;
  rankColor: string;
}

/**
 * The whole board with the player spliced in by points.
 *
 * The player is placed in the same ordering as everybody else rather than
 * pinned anywhere, which is what makes climbing visible: you pass names, and
 * the names you passed are still there underneath you.
 */
export function ladderBoard(player: {
  name: string;
  points: number;
  overall: number;
  level: number;
  wins: number;
  losses: number;
  streak: number;
}): LadderRow[] {
  const rows = [...ladderRivals(), { ...player, id: 'me' }];
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  return rows.map((row, i) => {
    const rank = onlineRank(row.points);
    return {
      ...row,
      position: i + 1,
      me: row.id === 'me',
      rankLabel: rank.grandChamp ? `Grand Champ #${i + 1}` : rank.label,
      rankColor: rank.tier.color,
    };
  });
}
