/**
 * The ranked maths. Server-side only, and deliberately so.
 *
 * The browser never computes a single point of RP. It is handed a number and it
 * draws it; if somebody edits their client all they can change is what their own
 * screen says, because the value that persists is the one this file produced on
 * the server from the result the server decided.
 *
 * The shape is Elo. Expectation comes from the RP gap, and the winner takes what
 * the result was worth as a surprise: beating somebody far above you is worth a
 * lot, beating somebody far below you is worth almost nothing, and two players
 * of the same standing trade the standard amount. Because the loser's loss is
 * the same magnitude as the winner's gain, that one rule gives every case the
 * game needs without a table of special cases:
 *
 *   Grand Champion beats Bronze : +5  / -5   (barely worth the trip)
 *   even match                  : +16 / -16  (the standard)
 *   Bronze beats Grand Champion : +32 / -32  (a real scalp, not a jackpot)
 *
 * The clamps are what stop the exploits. Nobody can farm a huge swing by
 * arranging a mismatch, because the top of the range is bounded; and nobody can
 * sit on a rank by only playing people far below them, because a win against
 * them is worth almost nothing while a loss to them costs the full amount.
 */

/** How much a single result can move the ladder, before clamping. */
const K_FACTOR = 32;

/** No result is worth nothing, and none is worth a rank. */
const MIN_CHANGE = 5;
const MAX_CHANGE = 40;

/** The ladder does not go negative. */
const RP_FLOOR = 0;

/** Chance the first player was expected to win, from the RP gap alone. */
function expectedScore(rp, oppRp) {
  return 1 / (1 + Math.pow(10, (oppRp - rp) / 400));
}

/**
 * What one ranked result is worth to both players.
 *
 * Returns the signed change for the winner and for the loser. The loser's floor
 * is applied last, so a player at 3 RP loses 3 rather than going negative — and
 * the winner still gets their full gain, because what the loser can afford is
 * not the winner's problem.
 */
export function rankedResult(winnerRp, loserRp) {
  const expected = expectedScore(winnerRp, loserRp);
  const raw = K_FACTOR * (1 - expected);
  const change = Math.max(MIN_CHANGE, Math.min(MAX_CHANGE, Math.round(raw)));
  const winnerAfter = winnerRp + change;
  const loserAfter = Math.max(RP_FLOOR, loserRp - change);
  return {
    change,
    winner: { before: winnerRp, after: winnerAfter, delta: winnerAfter - winnerRp },
    loser: { before: loserRp, after: loserAfter, delta: loserAfter - loserRp },
  };
}

export const RP_RULES = { K_FACTOR, MIN_CHANGE, MAX_CHANGE, RP_FLOOR };


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
