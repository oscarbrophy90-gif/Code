import { POSITIONS, type Position } from './types.ts';
import { Rng } from './rng.ts';
import { DIVISIONS_PER_TIER, ONLINE_TIERS, WINS_PER_DIVISION, WINS_TO_GRAND_CHAMP, onlineRank } from './onlinerank.ts';

/**
 * The ranked world.
 *
 * A fixed population of ranked players generated from a constant seed, so the
 * field is the same every time the game runs — a name at position 312 is the
 * same name tomorrow, and climbing past it means something. A randomly
 * reshuffled ladder would make your position noise rather than progress.
 *
 * They also play while you are away. Each has a rate and a ceiling, and their
 * wins grow toward it over real elapsed time, so the board you come back to on
 * Friday is not the board you left on Monday. The curve tapers rather than
 * running away: a ladder where everyone climbs forever is one you can never
 * catch, which is worse than one that never moves at all.
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
  /** ranked wins right now, which is the whole of their rank */
  wins: number;
  losses: number;
  /** what they had when the ladder was first seen, before any time passed */
  baseWins: number;
  /** where their wins level off however long you leave the game */
  ceilingWins: number;
  /** how quickly they approach it, in days */
  paceDays: number;
  /** every build they have, oldest first */
  builds: WorldBuild[];
  /** 1-based position, filled in by `worldLadder` */
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
/**
 * The ladder as it stands after `elapsedMs` of play time.
 *
 * Time is passed in rather than read from the clock so the same input always
 * gives the same board — the caller owns when the world started, and every
 * screen asking the same question gets the same answer.
 */
export function worldLadder(elapsedMs = 0): WorldPlayer[] {
  const roster = buildRoster();
  const days = Math.max(0, elapsedMs) / (24 * 60 * 60 * 1000);

  // Grown, then re-sorted: people overtake each other as they play, which is the
  // whole point of the board moving.
  const grown = roster.map((p) => {
    const wins = winsAfter(p, days);
    // Losses keep pace with wins, or a player who climbed fifty places would
    // look like they had never lost a game in their life.
    const extra = wins - p.baseWins;
    return { ...p, wins, losses: p.losses + Math.round(extra * 0.42) };
  });

  grown.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.id.localeCompare(b.id));
  grown.forEach((p, i) => {
    p.position = i + 1;
  });
  return grown;
}

/**
 * Where a player's wins have got to after so many days.
 *
 * Exponential approach to a ceiling: quick at first, slower as they near it, and
 * bounded. Somebody four hundred wins clear of you after a fortnight away would
 * make the board pointless.
 */
function winsAfter(p: WorldPlayer, days: number): number {
  if (days <= 0) return p.baseWins;
  const room = p.ceilingWins - p.baseWins;
  return p.baseWins + Math.floor(room * (1 - Math.exp(-days / p.paceDays)));
}

function buildRoster(): WorldPlayer[] {
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

      // Everyone is still improving, but the further up you are the less room
      // there is above you — the top of a ladder is where progress slows.
      const headroom = 0.55 - (made / WORLD_SIZE) * 0.34;
      const ceilingWins = Math.round(wins * (1 + Math.max(0.12, headroom + rng.range(-0.1, 0.1))));
      players.push({
        id: `w${made}`,
        username,
        wins,
        baseWins: wins,
        ceilingWins,
        // Some grind daily, some turn up at the weekend.
        paceDays: rng.range(9, 46),
        losses,
        builds: makeBuilds(rng, wins, losses),
        position: 0,
      });
      made++;
    }
  }

  players.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.id.localeCompare(b.id));
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

/** How many generated players hold a given tier, for the rank screen's copy. */
export function tierPopulation(tierId: string, elapsedMs = 0): number {
  return worldLadder(elapsedMs).filter((p) => onlineRank(p.wins).tier.id === tierId).length;
}
