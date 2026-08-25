/**
 * The ranked maths for online play. Server-side only, and deliberately so.
 *
 * The browser never computes a single point of RP. It is handed a number and it
 * draws it; if somebody edits their client all they can change is what their own
 * screen says, because the value that persists is the one this file produced on
 * the server from the result the server decided.
 *
 * THE BASELINE IS THE CPU LADDER. What a win is worth against the computer is
 * already tuned — wins shrink and losses grow as you climb, so holding a high
 * rank needs a winning record — and online reuses those exact numbers rather
 * than inventing a second economy that would feel like a different game. The
 * table below is the one from shared/src/ranked.ts, sampled across the six
 * online tiers instead of the nine on the CPU ladder.
 *
 * On top of that sits the only thing online has that the CPU ladder cannot:
 * an opponent with a rank of their own. The gap between the two decides how
 * surprising the result was, and the payout scales with the surprise:
 *
 *   Grand Champion beats Bronze : the floor, both ways. Nothing was proved.
 *   two players of a rank       : the CPU baseline, unchanged.
 *   Bronze beats Grand Champion : roughly double the baseline, and no more.
 *
 * The clamps are what stop the exploits. A lower-ranked player cannot farm a
 * fortune off one upset because the ceiling is a fraction of a division; a
 * higher-ranked player cannot be drained by one bad night for the same reason;
 * and nobody can sit on a rank by only playing far below them, because a win
 * there is worth the floor while a loss costs the full amount.
 */

/**
 * What a win is worth and what a loss costs, per tier — the CPU ladder's own
 * numbers (WIN_POINTS / LOSS_POINTS in shared/src/ranked.ts), sampled from its
 * nine tiers onto the six online ones.
 *
 * Bronze wins big and loses little so a beginner who wins half their games
 * still climbs; Grand Champion is the reverse.
 */
const BASE_WIN = [34, 26, 24, 20, 18, 14];
const BASE_LOSS = [16, 19, 20, 22, 24, 26];

/** Online ladder shape, mirroring shared/src/pvprank.ts. */
const POINTS_PER_DIVISION = 100;
const DIVISIONS_PER_TIER = 3;
const TIER_COUNT = 6;

/** No result is worth nothing, and none is worth half a division. */
const MIN_CHANGE = 5;
const MAX_CHANGE = 45;

/** The ladder does not go negative. */
const RP_FLOOR = 0;

/** Which of the six online tiers this RP total sits in. */
export function tierIndexFor(rp) {
  const points = Math.max(0, Math.floor(rp));
  const step = Math.floor(points / POINTS_PER_DIVISION);
  return Math.min(TIER_COUNT - 1, Math.floor(step / DIVISIONS_PER_TIER));
}

/** Chance the first player was expected to win, from the RP gap alone. */
function expectedScore(rp, oppRp) {
  return 1 / (1 + Math.pow(10, (oppRp - rp) / 400));
}

/**
 * What one ranked result is worth to both players.
 *
 * Each side's baseline comes from their OWN tier, the way the CPU ladder does
 * it, and both are then scaled by how surprising the result was. `surprise` is
 * 1 for an even match, tends to 0 when the winner was a lock, and tends to 2 on
 * a full upset — so an even game pays exactly the CPU baseline and the extremes
 * are bounded before the clamps even apply.
 */
export function rankedResult(winnerRp, loserRp) {
  const winnerBefore = Math.max(0, Math.floor(winnerRp));
  const loserBefore = Math.max(0, Math.floor(loserRp));

  const surprise = (1 - expectedScore(winnerBefore, loserBefore)) * 2;
  const gain = clampChange(BASE_WIN[tierIndexFor(winnerBefore)] * surprise);
  const cost = clampChange(BASE_LOSS[tierIndexFor(loserBefore)] * surprise);

  const winnerAfter = winnerBefore + gain;
  const loserAfter = Math.max(RP_FLOOR, loserBefore - cost);
  return {
    change: gain,
    surprise,
    winner: { before: winnerBefore, after: winnerAfter, delta: winnerAfter - winnerBefore },
    loser: { before: loserBefore, after: loserAfter, delta: loserAfter - loserBefore },
  };
}

function clampChange(raw) {
  return Math.max(MIN_CHANGE, Math.min(MAX_CHANGE, Math.round(raw)));
}

export const RP_RULES = { BASE_WIN, BASE_LOSS, MIN_CHANGE, MAX_CHANGE, RP_FLOOR };


/**
 * Which side has won, from the score alone.
 *
 * The server works this out for itself rather than being told, so "I won" is
 * not a sentence a client can say. Three rules, and all three matter: first to
 * the target, by the required margin — and the hard cap, which ends a game that
 * has gone deuce after deuce. Leaving the cap out is how a 15-14 finish ends on
 * both screens and never settles on the ladder.
 */
export function winnerFromScore(score, rules) {
  const [a, b] = score;
  const target = rules?.targetScore ?? 11;
  const winBy = rules?.winBy ?? 2;
  const cap = rules?.maxScore ?? 15;
  if (a >= cap && a > b) return 0;
  if (b >= cap && b > a) return 1;
  if (a >= target && a - b >= winBy) return 0;
  if (b >= target && b - a >= winBy) return 1;
  return null;
}


/**
 * How far apart two Ranked players may be, in RP, after waiting this long.
 *
 * It opens up rather than holding out for a perfect match: a tight window is
 * the right first offer and the wrong final one, because a queue nobody comes
 * out of is worse for everybody than a slightly lopsided game. Roughly a
 * division immediately, two more every five seconds, anybody after a minute and
 * a half.
 */
export function rpWindow(waitedMs) {
  return 150 + (Math.max(0, waitedMs) / 1000) * 120;
}
