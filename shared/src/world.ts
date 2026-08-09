import { POSITIONS, type Position } from './types.ts';
import { Rng } from './rng.ts';
import { DIVISIONS_PER_TIER, ONLINE_TIERS, WINS_PER_DIVISION, WINS_TO_GRAND_CHAMP, onlineRank } from './onlinerank.ts';

/**
 * The ranked world.
 *
 * There is no server and no other people, so the ladder you climb is a fixed
 * population of ranked players generated from a constant seed. Fixed matters
 * more than it sounds: because the seed never changes, the field is identical
 * every time the game runs, so a player at position 312 is at 312 tomorrow and
 * climbing past them means something. A randomly reshuffled ladder would make
 * your position noise rather than progress.
 *
 * These are CPU players and the game says so. What they are *not* is fake in the
 * way a padded number is fake — each one is a real build with real attributes
 * that the match screen can actually play against, so the name above you on the
 * board is somebody you can go and beat.
 */

export const WORLD_SIZE = 600;

/** Deterministic and arbitrary. Changing it reshuffles the whole ladder. */
const WORLD_SEED = 0x48_4f_4f_50;

const FIRST = [
  'Ace', 'Ax', 'Blaze', 'Bolt', 'Breeze', 'Cash', 'Chase', 'Cipher', 'Clutch', 'Coda',
  'Comet', 'Crux', 'Dagger', 'Dash', 'Deuce', 'Drift', 'Duke', 'Echo', 'Ember', 'Fable',
  'Flint', 'Flux', 'Forge', 'Frost', 'Gale', 'Ghost', 'Glide', 'Grit', 'Halo', 'Haze',
  'Hollow', 'Ink', 'Iron', 'Jet', 'Jinx', 'Kite', 'Knox', 'Lark', 'Ledge', 'Lumen',
  'Maverick', 'Mercury', 'Mirage', 'Neon', 'Nomad', 'Nova', 'Onyx', 'Orbit', 'Pace', 'Pike',
  'Prism', 'Pulse', 'Quill', 'Quartz', 'Rally', 'Rebel', 'Relay', 'Ridge', 'Rogue', 'Rook',
  'Saber', 'Scout', 'Shade', 'Sierra', 'Slate', 'Spark', 'Static', 'Steel', 'Storm', 'Surge',
  'Talon', 'Tempo', 'Thorn', 'Tide', 'Torch', 'Trace', 'Vault', 'Vector', 'Verve', 'Vex',
  'Volt', 'Wander', 'Warden', 'Whistle', 'Wilder', 'Wire', 'Wisp', 'Zenith', 'Zephyr', 'Zone',
];

const SECOND = [
  '', '', '', '', '',
  'x', 'HD', 'TV', '23', '00', '01', '07', '11', '21', '32', '45', '99',
  'Hooper', 'Bucket', 'Handles', 'Range', 'Iso', 'Fade', 'Splash', 'Lockdown', 'Rim',
  'Deep', 'Cold', 'Quick', 'Smooth', 'Silent', 'Prime', 'Live', 'Real', 'OG', 'Jr',
];

const TAGS = ['', '', '', '', '_', '.', '-'];

export interface WorldPlayer {
  id: string;
  username: string;
  /** park wins, which is the whole of their rank */
  wins: number;
  losses: number;
  /** every build they have, oldest first */
  builds: WorldBuild[];
  /** 1-based world position, filled in by `worldLadder` */
  position: number;
}

export interface WorldBuild {
  name: string;
  position: Position;
  heightIn: number;
  weightLb: number;
  overall: number;
  /** career line for this build alone */
  games: number;
  wins: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  greenRate: number;
  bestStreak: number;
}

const BUILD_NAMES = [
  'The Closer', 'Main', 'Second', 'Old Faithful', 'Range Rat', 'Paint Beast', 'Point Forward',
  'The Lab', 'Sharp', 'Rim Runner', 'Two Way', 'Iso Guard', 'Stretch', 'Slasher', 'Anchor',
];

/**
 * How many of the world sit in each tier, top first.
 *
 * Written down rather than derived from a curve. A curve that looked right at
 * the top put a third of the world in Grand Champ, which makes the top rank
 * meaningless — the shape of a ladder is the point of it, so the shape is stated
 * and the win counts are fitted to it rather than the other way round.
 */
const TIER_POPULATION: { tier: string; count: number }[] = [
  { tier: 'grandchamp', count: 38 },
  { tier: 'champion', count: 44 },
  { tier: 'sapphire', count: 52 },
  { tier: 'emerald', count: 62 },
  { tier: 'platinum', count: 74 },
  { tier: 'gold', count: 88 },
  { tier: 'silver', count: 110 },
  { tier: 'bronze', count: 132 },
];

/** Wins that put you at the bottom of each tier. */
function tierFloor(tierId: string): number {
  const index = ONLINE_TIERS.findIndex((t) => t.id === tierId);
  return index * DIVISIONS_PER_TIER * WINS_PER_DIVISION;
}

/**
 * The whole ladder, best first.
 *
 * Built tier by tier to the population above, so the pyramid is a pyramid: a few
 * dozen Grand Champs, a crowded Bronze, and everything in between filled in
 * proportionally. Within a tier, win counts are spread across its band so
 * players sit at every division rather than bunching on the floor of each one.
 */
export function worldLadder(): WorldPlayer[] {
  if (cached) return cached;

  const rng = new Rng(WORLD_SEED);
  const players: WorldPlayer[] = [];
  const usedNames = new Set<string>();
  let made = 0;

  for (const { tier, count } of TIER_POPULATION) {
    const floor = tierFloor(tier);
    for (let i = 0; i < count; i++) {
      // Where in this tier's band the player sits, 0 at the bottom.
      const within = count === 1 ? 0 : i / (count - 1);
      let wins: number;
      if (tier === 'grandchamp') {
        // Grand Champ has no ceiling, so it stretches: the top of the world is
        // far clear of the bottom of it, which is what makes #1 worth chasing.
        wins = Math.round(floor + Math.pow(1 - within, 2.4) * 260 + rng.range(0, 6));
      } else {
        // A full tier is three divisions of five wins. Spread across all of it.
        const span = DIVISIONS_PER_TIER * WINS_PER_DIVISION - 1;
        wins = Math.round(floor + (1 - within) * span);
      }
      wins = Math.max(1, wins);

      // Better players lose less often, but everyone loses.
      const standing = made / WORLD_SIZE;
      const lossRate = 0.3 + standing * 0.55 + rng.range(-0.06, 0.06);
      const losses = Math.max(0, Math.round(wins * Math.max(0.14, lossRate)));

      let username = makeName(rng);
      let guard = 0;
      while (usedNames.has(username.toLowerCase()) && guard++ < 60) username = makeName(rng);
      usedNames.add(username.toLowerCase());

      players.push({
        id: `w${made}`,
        username,
        wins,
        losses,
        builds: makeBuilds(rng, wins, losses),
        position: 0,
      });
      made++;
    }
  }

  // Sort by the same rule the board uses, then stamp positions on.
  players.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.id.localeCompare(b.id));
  players.forEach((p, i) => {
    p.position = i + 1;
  });

  cached = players;
  return players;
}

let cached: WorldPlayer[] | null = null;

function makeName(rng: Rng): string {
  const first = FIRST[rng.int(0, FIRST.length)];
  const second = SECOND[rng.int(0, SECOND.length)];
  if (!second) return first;
  const tag = TAGS[rng.int(0, TAGS.length)];
  return `${first}${tag}${second}`;
}

/**
 * A player's builds. Most people have one; some have three.
 *
 * Their per-build records add up to the account's total, because a leaderboard
 * where the builds do not sum to the headline number is a leaderboard nobody
 * trusts the second they check.
 */
function makeBuilds(rng: Rng, totalWins: number, totalLosses: number): WorldBuild[] {
  const count = rng.next() < 0.45 ? 1 : rng.next() < 0.75 ? 2 : 3;
  const weights: number[] = [];
  for (let i = 0; i < count; i++) weights.push(rng.range(0.4, 1));
  const sum = weights.reduce((s, v) => s + v, 0);

  const builds: WorldBuild[] = [];
  let winsLeft = totalWins;
  let lossesLeft = totalLosses;

  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const share = weights[i] / sum;
    const wins = last ? winsLeft : Math.min(winsLeft, Math.round(totalWins * share));
    const losses = last ? lossesLeft : Math.min(lossesLeft, Math.round(totalLosses * share));
    winsLeft -= wins;
    lossesLeft -= losses;

    const position = POSITIONS[rng.int(0, POSITIONS.length)];
    const heightIn = heightFor(position, rng);
    // Overall tracks the account's standing: the ladder is climbed by people who
    // built something that works, so a top-100 account is not running a 62.
    const standing = Math.min(1, totalWins / (WINS_TO_GRAND_CHAMP * 2));
    const overall = Math.round(62 + standing * 32 + rng.range(-3, 3));
    const games = wins + losses;

    builds.push({
      name: BUILD_NAMES[rng.int(0, BUILD_NAMES.length)],
      position,
      heightIn,
      weightLb: Math.round(170 + (heightIn - 72) * 6 + rng.range(-12, 12)),
      overall: Math.max(60, Math.min(99, overall)),
      games,
      wins,
      points: Math.round(games * rng.range(6.5, 11.5)),
      rebounds: Math.round(games * rng.range(1.4, 4.2)),
      assists: Math.round(games * rng.range(0.6, 2.4)),
      steals: Math.round(games * rng.range(0.4, 1.6)),
      blocks: Math.round(games * rng.range(0.1, 1.2)),
      greenRate: rng.range(0.16, 0.16 + standing * 0.4),
      bestStreak: Math.max(1, Math.round(rng.range(1, 3 + standing * 12))),
    });
  }

  return builds.filter((b, i) => i === 0 || b.games > 0);
}

function heightFor(position: Position, rng: Rng): number {
  const base: Record<Position, [number, number]> = {
    PG: [69, 76],
    SG: [72, 79],
    SF: [76, 81],
    PF: [78, 83],
    C: [80, 87],
  };
  const [lo, hi] = base[position];
  return rng.int(lo, hi + 1);
}

/**
 * Where a win total sits in the world, 1-based.
 *
 * Your own position is worked out against the same field, so climbing the board
 * is the same act as climbing the ranks — there is one ordering, not two.
 */
export function worldPositionFor(wins: number, losses: number): number {
  const ladder = worldLadder();
  let ahead = 0;
  for (const p of ladder) {
    if (p.wins > wins || (p.wins === wins && p.losses < losses)) ahead++;
  }
  return ahead + 1;
}

/** The board around a given position, so you can be shown in context. */
export function ladderSlice(centre: number, span: number): WorldPlayer[] {
  const ladder = worldLadder();
  const from = Math.max(0, centre - Math.floor(span / 2));
  return ladder.slice(from, from + span);
}

/** How many in the world hold a given tier, for the rank screen's context line. */
export function tierPopulation(tierId: string): number {
  return worldLadder().filter((p) => onlineRank(p.wins).tier.id === tierId).length;
}
