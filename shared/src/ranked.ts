import { DIFFICULTIES, type Difficulty } from './types.ts';
import { DIVISIONS_PER_TIER, ONLINE_TIERS, POINTS_PER_DIVISION, onlineRank } from './onlinerank.ts';

/**
 * Ranked play.
 *
 * A ranked match puts you against a CPU built to your rank: the higher you
 * climb, the better the opponent's build and the harder they play. That is the
 * whole progression — Bronze is a rookie on Rookie difficulty, Grand Champ is a
 * ninety-something on Hall of Fame — so climbing is felt rather than announced.
 */

/** How long you have to wait before changing your username again. */
export const USERNAME_COOLDOWN_DAYS = 30;
export const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/**
 * Whether a username is allowed, and why not if it is not.
 *
 * Deliberately narrow: letters, numbers and a few separators. A name that is
 * mostly punctuation is a name nobody can read on a leaderboard row.
 */
export function validateUsername(raw: string): { ok: boolean; reason?: string } {
  const name = raw.trim();
  if (name.length < USERNAME_MIN) return { ok: false, reason: `At least ${USERNAME_MIN} characters` };
  if (name.length > USERNAME_MAX) return { ok: false, reason: `At most ${USERNAME_MAX} characters` };
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return { ok: false, reason: 'Letters, numbers, dots, dashes and underscores only' };
  if (!/[A-Za-z0-9]/.test(name)) return { ok: false, reason: 'Needs at least one letter or number' };
  return { ok: true };
}

/** Milliseconds until the username can change again, 0 when it is free. */
export function usernameCooldownLeft(changedAt: number, now: number): number {
  if (!changedAt) return 0;
  return Math.max(0, changedAt + USERNAME_COOLDOWN_MS - now);
}

/** "12 days" — how long is left on the cooldown, for the settings copy. */
export function formatCooldown(ms: number): string {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days > 1) return `${days} days`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return hours > 1 ? `${hours} hours` : 'less than an hour';
}

/**
 * How much a win is worth, and how much a loss costs, per tier.
 *
 * Both slide the same way as you climb: wins shrink, losses grow. At Bronze a
 * win is a third of a division and a loss is a sixth, so a beginner who wins
 * half their games still climbs. At Champion a win is worth less than a loss
 * costs, which means holding the rank needs a winning record and climbing needs
 * a good one — roughly 61% at Champion and 65% at Grand Champ.
 *
 * That asymmetry is the whole point. A ladder where every win is one rung
 * measures how many games you played; this one measures how often you win them.
 */
const WIN_POINTS = [34, 30, 26, 24, 22, 20, 18, 16, 14];
const LOSS_POINTS = [16, 18, 19, 20, 21, 22, 24, 25, 26];

export interface RankedResult {
  /** ranked points before the match */
  points: number;
  won: boolean;
  /** final score difference, positive when you won; ignored when absent */
  margin?: number;
  /** win streak going into this match */
  streak?: number;
}

export interface RankedMove {
  before: number;
  after: number;
  delta: number;
}

/**
 * What a result does to your standing.
 *
 * Zero is the floor: Bronze 3 with nothing on it is the bottom and you cannot
 * fall out of the ladder.
 */
export function applyRankedResult(result: RankedResult): RankedMove {
  const before = Math.max(0, Math.floor(result.points));
  const tier = tierIndexFor(before);

  let delta: number;
  if (result.won) {
    delta = WIN_POINTS[tier];
    // A streak is worth a little, not a lot. Enough that a run feels like it is
    // going somewhere, not so much that it becomes the fastest way up.
    const streak = Math.max(0, result.streak ?? 0);
    if (streak >= 2) delta += Math.min(9, (streak - 1) * 3);
    // Winning comfortably counts for slightly more than scraping through.
    if (result.margin !== undefined) delta += Math.min(6, Math.max(0, Math.floor(result.margin / 2)));
  } else {
    delta = -LOSS_POINTS[tier];
  }

  const after = Math.max(0, before + delta);
  return { before, after, delta: after - before };
}

/**
 * Whether a result moved you between divisions, and which way.
 *
 * Compared as ranks rather than as point totals, because that is what a player
 * notices: crossing a hundred is a promotion and moving 40 to 60 is nothing.
 */
export function rankChange(before: number, after: number): 'promoted' | 'demoted' | 'none' {
  const from = onlineRank(before);
  const to = onlineRank(after);
  if (from.tier.id === to.tier.id && from.division === to.division && from.grandChamp === to.grandChamp) {
    return 'none';
  }
  return after > before ? 'promoted' : 'demoted';
}

function tierIndexFor(points: number): number {
  const index = ONLINE_TIERS.findIndex((t) => t.id === onlineRank(points).tier.id);
  return Math.max(0, Math.min(WIN_POINTS.length - 1, index));
}

// ------------------------------------------------------------ the opponent

export interface RankedOpponentSpec {
  /** overall rating to build the CPU at */
  overall: number;
  /** which preset drives their decision making */
  difficulty: Difficulty;
  /**
   * Extra sharpening on top of the preset, 0 to 1.
   *
   * The six difficulties are coarse — a whole tier of the ladder can sit inside
   * one of them — so this is what makes Gold 1 harder than Gold 3 without
   * jumping the CPU a whole level. It tightens reactions, release timing and
   * contest reads proportionally.
   */
  edge: number;
}

export interface RankedContext {
  /** ranked points, which is the rank */
  points: number;
  /** the overall of the build about to play */
  playerOverall: number;
  /** account level */
  level: number;
  /** current win streak */
  streak: number;
}

/** Base overall per tier, before the player's own build is taken into account. */
const OVERALL_BY_TIER = [62, 67, 72, 76, 80, 84, 88, 92, 96];

const DIFFICULTY_BY_TIER: Difficulty[] = [
  'rookie',
  'semiPro',
  'pro',
  'pro',
  'allStar',
  'allStar',
  'superstar',
  'hallOfFame',
  'grandChamp',
];

/**
 * How much a win streak is allowed to raise the difficulty, per tier.
 *
 * Deliberately tiny at the bottom. A new player who wins two games should not
 * suddenly meet somebody who beats them for the next hour — that is how people
 * stop playing. By Champion a streak is worth a lot, because at that point the
 * ladder is supposed to be looking for a reason to stop you.
 */
const STREAK_CAP_BY_TIER = [0.12, 0.16, 0.22, 0.26, 0.32, 0.38, 0.45, 0.5, 0.55];

/**
 * Who you face in a ranked match.
 *
 * Four inputs, in order of how much they matter: your rank, your build's
 * overall, your win streak, and your level. Rank sets the shape of the
 * opponent; the rest adjust it so a 62-overall rookie at Gold is not handed the
 * same player as a 90-overall at Gold.
 */
export function rankedOpponent(ctx: RankedContext): RankedOpponentSpec {
  const rank = onlineRank(ctx.points);
  const tier = tierIndexFor(ctx.points);

  // Where you sit inside the tier: division 3 is the floor, 1 the top.
  const within = rank.grandChamp ? 1 : (DIVISIONS_PER_TIER - rank.division) / DIVISIONS_PER_TIER;
  const base = OVERALL_BY_TIER[tier];
  const next = OVERALL_BY_TIER[Math.min(OVERALL_BY_TIER.length - 1, tier + 1)];
  let overall = base + (next - base) * within * 0.7;

  // Meet the player's own build partway. Without this a maxed build strolls
  // through Bronze and a starter build gets nothing but blowouts at Gold — the
  // rank says what the fight should look like, the build says what it can be.
  overall = overall * 0.7 + ctx.playerOverall * 0.3;

  // A high-level account has been playing a while; nudge, do not swing.
  overall += Math.min(3, ctx.level / 12);

  // The streak. Capped hard at low ranks so two wins never turns into a wall.
  const streakCap = STREAK_CAP_BY_TIER[tier];
  const streakPressure = Math.min(streakCap, Math.max(0, ctx.streak - 1) * 0.09);
  overall += streakPressure * 14;

  // Never more than a little above the player, and never below the tier floor —
  // a ranked opponent should always be a real test, but not a hopeless one.
  overall = Math.max(base - 2, Math.min(ctx.playerOverall + 7, overall));

  // The edge: position inside the tier plus whatever the streak has added,
  // again capped by tier so the bottom of the ladder stays fair.
  const edge = Math.max(0, Math.min(1, within * 0.45 + streakPressure * 1.3 + tier * 0.03));

  return {
    overall: Math.round(Math.max(58, Math.min(99, overall))),
    difficulty: DIFFICULTY_BY_TIER[tier] ?? 'rookie',
    edge: Math.round(edge * 100) / 100,
  };
}

/** Every rung of the ladder and what it puts in front of you, for the UI. */
export function rankedLadderPreview(playerOverall = 75, level = 1): { tier: string; overall: number; difficulty: Difficulty }[] {
  return ONLINE_TIERS.map((tier, i) => {
    const points = i * DIVISIONS_PER_TIER * POINTS_PER_DIVISION;
    const opp = rankedOpponent({ points, playerOverall, level, streak: 0 });
    return { tier: tier.name, overall: opp.overall, difficulty: opp.difficulty };
  });
}

/** Guard so a difficulty id from data always resolves to a real one. */
export function safeDifficulty(id: string): Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(id) ? (id as Difficulty) : 'pro';
}
