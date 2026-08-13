import { DIFFICULTIES, type Difficulty } from './types.ts';
import { hashString, Rng } from './rng.ts';
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
  /** true when the win-streak band is what picked that difficulty */
  streakActive: boolean;
  /** the coin multiplier a win would pay: 1, or 2 on an Emerald+ streak */
  coinBonus: number;
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
  /** seeds the draw inside a band, so the same standing draws the same fight */
  seed?: number;
}

/** Base overall per tier, before the player's own build is taken into account. */
const OVERALL_BY_TIER = [62, 67, 72, 76, 80, 84, 88, 92, 96];

/**
 * Where the streak system stops.
 *
 * Bronze through Platinum, and nowhere else. Below Emerald the ladder is still
 * teaching you the game, so a run of wins is the signal that it should stop
 * going easy — that is what the streak band is for. From Emerald up there is
 * nothing to signal: the floor is already Hall of Fame and the difficulty is
 * the rank, permanently. Stacking a streak bonus on top of that would take an
 * already brutal tier and make it arbitrary.
 */
export const STREAK_DIFFICULTY_TOP_TIER = 3; // platinum

/** How many wins in a row it takes before the ladder starts pushing back. */
export const STREAK_THRESHOLD = 2;

/** Where the doubled coin reward starts. */
export const STREAK_BONUS_MIN_TIER = 4; // emerald

/**
 * A band of difficulty: the floor, the ceiling, and how often you meet the
 * ceiling rather than the floor at the bottom and the top of the tier.
 *
 * Two levels with a chance between them, rather than one level per tier,
 * because a whole tier of the ladder is a lot of games to spend against exactly
 * one opponent. Bronze 3 is nearly all Rookie and Bronze 1 is nearly all
 * Semi-Pro, and the games in between are a mix.
 */
interface Band {
  floor: Difficulty;
  ceiling: Difficulty;
  /** chance of the ceiling at the bottom of the tier */
  atFloorOfTier: number;
  /** chance of the ceiling at the top of the tier */
  atTopOfTier: number;
}

/**
 * The normal ladder, with no streak running.
 *
 * Bronze Rookie to Semi-Pro, Silver Pro to All-Star, Gold Superstar, Platinum
 * Superstar with Hall of Fame showing up for the players near the top of it.
 * Then Emerald, where Hall of Fame stops being the ceiling and becomes the
 * floor, and everything above it is its own rung.
 */
const NORMAL_BAND: Band[] = [
  { floor: 'rookie', ceiling: 'semiPro', atFloorOfTier: 0.05, atTopOfTier: 0.8 },       // Bronze
  { floor: 'pro', ceiling: 'allStar', atFloorOfTier: 0.1, atTopOfTier: 0.8 },           // Silver
  { floor: 'superstar', ceiling: 'superstar', atFloorOfTier: 0, atTopOfTier: 0 },       // Gold
  { floor: 'superstar', ceiling: 'hallOfFame', atFloorOfTier: 0, atTopOfTier: 0.35 },   // Platinum
  { floor: 'hallOfFame', ceiling: 'hallOfFame', atFloorOfTier: 0, atTopOfTier: 0 },     // Emerald
  { floor: 'legend', ceiling: 'legend', atFloorOfTier: 0, atTopOfTier: 0 },             // Sapphire
  { floor: 'immortal', ceiling: 'immortal', atFloorOfTier: 0, atTopOfTier: 0 },         // Diamond
  { floor: 'untouchable', ceiling: 'untouchable', atFloorOfTier: 0, atTopOfTier: 0 },   // Champion
  { floor: 'grandChamp', ceiling: 'grandChamp', atFloorOfTier: 0, atTopOfTier: 0 },     // Grand Champ
];

/**
 * The band while a streak is running, Bronze through Platinum only.
 *
 * A player who can win four in a row at Bronze is not a Bronze player yet, and
 * the fastest way to find that out is to stop handing them Rookies. The band
 * jumps a clear step: Bronze meets Pro and All-Star, Silver meets Superstar,
 * Gold and Platinum meet Hall of Fame. Lose once and the streak is zero and
 * this table stops applying on the very next game.
 */
const STREAK_BAND: (Band | null)[] = [
  { floor: 'pro', ceiling: 'allStar', atFloorOfTier: 0.15, atTopOfTier: 0.7 },          // Bronze
  { floor: 'superstar', ceiling: 'superstar', atFloorOfTier: 0, atTopOfTier: 0 },       // Silver
  { floor: 'hallOfFame', ceiling: 'hallOfFame', atFloorOfTier: 0, atTopOfTier: 0 },     // Gold
  { floor: 'hallOfFame', ceiling: 'hallOfFame', atFloorOfTier: 0, atTopOfTier: 0 },     // Platinum
  null, null, null, null, null,                                                          // Emerald and up
];

/**
 * Who you face in a ranked match.
 *
 * Rank picks the band; where you sit inside the tier and how long your streak
 * is decide where in the band you land. The streak part only exists below
 * Emerald — see `STREAK_DIFFICULTY_TOP_TIER`.
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

  const streak = Math.max(0, ctx.streak);
  const streaking = streak >= STREAK_THRESHOLD && tier <= STREAK_DIFFICULTY_TOP_TIER;
  // How far into the streak, 0 to 1. Four wins past the threshold is as hard as
  // it gets — the longer the run, the more consistently the ceiling comes up.
  const heat = streaking ? Math.min(1, (streak - STREAK_THRESHOLD + 1) / 4) : 0;

  const band = (streaking ? STREAK_BAND[tier] : null) ?? NORMAL_BAND[tier];

  // Chance of the top of the band: position inside the tier, then the streak
  // pushing it the rest of the way up.
  const positional = band.atFloorOfTier + (band.atTopOfTier - band.atFloorOfTier) * within;
  const ceilingChance = Math.min(1, positional + heat * (1 - positional) * 0.85);
  // Deterministic: the same standing draws the same opponent, so backing out of
  // a match and coming back cannot re-roll an easier one.
  const roll = new Rng(hashString(`ranked-draw-${ctx.seed ?? 0}-${ctx.points}-${streak}`)).next();
  const difficulty = roll < ceilingChance ? band.ceiling : band.floor;

  // The streak still nudges the opponent's build below Emerald, so a run feels
  // like it is being answered even in the games that stay on the band's floor.
  overall += streaking ? heat * 4 : 0;

  // Never more than a little above the player, and never below the tier floor —
  // a ranked opponent should always be a real test, but not a hopeless one.
  // Emerald and up are allowed further above you, because that is the point of
  // them, but the ceiling is still a ceiling.
  const headroom = tier >= STREAK_BONUS_MIN_TIER ? 11 : 7;
  overall = Math.max(base - 2, Math.min(ctx.playerOverall + headroom, overall));

  // The edge sharpens *within* a difficulty, so Sapphire 1 is meaningfully
  // harder than Sapphire 3 without jumping a whole rung.
  //
  // Two things it deliberately does *not* do. It carries no flat per-tier term:
  // the tier already chose the difficulty, and adding sharpening on top of that
  // was charging for the same climb twice — measured, it left a rank-appropriate
  // player winning 28% at Gold against a break-even of 42%, which is a ladder
  // nobody gets off. And on a streak it only applies where the band has a single
  // level in it, because that is the only case where "the harder end of the
  // range" has nowhere else to live. Where the streak already jumped the
  // difficulty a whole rung — Gold meeting Hall of Fame — sharpening on top of
  // the jump made those games essentially unwinnable rather than merely hard.
  const singleLevel = band.floor === band.ceiling;
  const edge = Math.max(0, Math.min(1, within * 0.45 + (singleLevel && streaking ? heat * 0.3 : 0)));

  return {
    overall: Math.round(Math.max(58, Math.min(99, overall))),
    difficulty,
    edge: Math.round(edge * 100) / 100,
    streakActive: streaking,
    coinBonus: coinBonusFor(ctx.points, ctx.streak),
  };
}

/**
 * Whether a win right now pays double.
 *
 * Emerald and above, with a streak already running when the match starts. The
 * streak going *into* the game is what counts, so the first win after a loss
 * pays normally and every win after that is doubled for as long as the run
 * lasts. One loss and it is gone the same instant the streak is.
 */
export function coinBonusFor(points: number, streakBefore: number): number {
  const tier = tierIndexFor(points);
  if (tier < STREAK_BONUS_MIN_TIER) return 1;
  return streakBefore >= 1 ? 2 : 1;
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
