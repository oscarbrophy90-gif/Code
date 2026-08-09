import { DIFFICULTIES, type Difficulty } from './types.ts';
import { ONLINE_TIERS, onlineRank } from './onlinerank.ts';

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
 * What a result does to your standing.
 *
 * A win is worth one, a loss costs one, and the floor is zero — Bronze 3 with
 * nothing on it is the bottom and you cannot fall out of the ladder. Because the
 * rank is derived from this number, losing at the bottom of a division drops you
 * into the top of the one below without any special case: 5 wins is Bronze 2
 * with nothing on it, and 4 is Bronze 3 with four of five.
 *
 * That is the whole rule. A ladder you can only climb is a ladder that measures
 * how long you played rather than how well.
 */
export function applyRankedResult(wins: number, won: boolean): number {
  return Math.max(0, wins + (won ? 1 : -1));
}

/**
 * Whether a result moved you between divisions, and which way.
 *
 * Compared as ranks rather than as win counts, because that is what a player
 * notices: four wins to five is a promotion and five to six is nothing at all.
 */
export function rankChange(before: number, after: number): 'promoted' | 'demoted' | 'none' {
  const from = onlineRank(before);
  const to = onlineRank(after);
  if (from.tier.id === to.tier.id && from.division === to.division && from.grandChamp === to.grandChamp) {
    return 'none';
  }
  return after > before ? 'promoted' : 'demoted';
}

export interface RankedOpponent {
  /** overall rating to build the CPU at */
  overall: number;
  /** how hard they play */
  difficulty: Difficulty;
}

/**
 * Who you face at a given rank.
 *
 * Both knobs move together and both are tied to the tier rather than the raw win
 * count, so a rank-up is a real step in what you are playing against instead of
 * a number creeping by one. Division nudges the overall a little inside a tier
 * so Bronze 1 is not identical to Bronze 3.
 */
export function rankedOpponent(wins: number): RankedOpponent {
  const rank = onlineRank(wins);
  const tierIndex = ONLINE_TIERS.findIndex((t) => t.id === rank.tier.id);

  // Bronze starts at a genuine rookie and the top of the ladder is a max build.
  const OVERALL_BY_TIER = [62, 68, 73, 78, 83, 87, 91, 99];
  const DIFFICULTY_BY_TIER: Difficulty[] = [
    'rookie',
    'semiPro',
    'pro',
    'pro',
    'allStar',
    'allStar',
    'superstar',
    // The top of the ladder is the one difficulty you cannot select from the
    // Play menu, and it is harder than Hall of Fame.
    'grandChamp',
  ];

  const base = OVERALL_BY_TIER[tierIndex] ?? 62;
  const next = OVERALL_BY_TIER[tierIndex + 1] ?? base + 4;
  // Divisions count down, so division 3 is the bottom of the tier and 1 the top.
  const through = rank.grandChamp ? 1 : (3 - rank.division) / 3;
  const overall = Math.round(base + (next - base) * through * 0.6);

  return {
    overall: Math.max(60, Math.min(99, overall)),
    difficulty: DIFFICULTY_BY_TIER[tierIndex] ?? 'rookie',
  };
}

/** Every rung of the ladder and what it puts in front of you, for the UI. */
export function rankedLadderPreview(): { tier: string; overall: number; difficulty: Difficulty }[] {
  return ONLINE_TIERS.map((tier, i) => {
    const wins = i * 15;
    const opp = rankedOpponent(i === ONLINE_TIERS.length - 1 ? 105 : wins);
    return { tier: tier.name, overall: opp.overall, difficulty: opp.difficulty };
  });
}

/** Guard so a difficulty id from data always resolves to a real one. */
export function safeDifficulty(id: string): Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(id) ? (id as Difficulty) : 'pro';
}
