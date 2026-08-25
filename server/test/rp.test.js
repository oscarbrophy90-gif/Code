import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rankedResult, rpWindow, winnerFromScore, RP_RULES } from '../rp.js';

/**
 * The ranked maths, which lives on the server because RP a browser can compute
 * is RP a browser can award itself.
 */

test('an even match trades the standard amount, both ways', () => {
  const r = rankedResult(900, 900);
  assert.equal(r.winner.delta, 16);
  assert.equal(r.loser.delta, -16);
  assert.equal(r.winner.delta, -r.loser.delta, 'what one gains the other loses');
});

test('beating somebody far below you is barely worth the trip', () => {
  const r = rankedResult(1842, 620);
  assert.equal(r.winner.delta, RP_RULES.MIN_CHANGE);
  assert.equal(r.loser.delta, -RP_RULES.MIN_CHANGE);
});

test('beating somebody far above you is a real scalp, and not a jackpot', () => {
  const r = rankedResult(620, 1842);
  assert.ok(r.winner.delta > 25, `an upset should pay well, got ${r.winner.delta}`);
  assert.ok(r.winner.delta <= RP_RULES.MAX_CHANGE, 'and never more than the cap');
  assert.equal(r.loser.delta, -r.winner.delta);
});

test('the reward shrinks monotonically as the gap opens in your favour', () => {
  let last = Infinity;
  for (const gap of [0, 100, 200, 400, 800, 1600]) {
    const gain = rankedResult(1000 + gap, 1000).winner.delta;
    assert.ok(gain <= last, `a wider gap must never pay more (gap ${gap})`);
    last = gain;
  }
});

test('no result is worth nothing, and none is worth a whole rank', () => {
  for (const [w, l] of [[0, 5000], [5000, 0], [0, 0], [50, 51], [3000, 2999]]) {
    const r = rankedResult(w, l);
    assert.ok(r.winner.delta >= RP_RULES.MIN_CHANGE, `${w} vs ${l}: floor`);
    assert.ok(r.winner.delta <= RP_RULES.MAX_CHANGE, `${w} vs ${l}: cap`);
    assert.ok(Math.abs(r.loser.delta) <= RP_RULES.MAX_CHANGE);
  }
});

test('the ladder never goes negative, and the winner is paid regardless', () => {
  const r = rankedResult(900, 3);
  assert.equal(r.loser.after, 0, 'a player at 3 RP loses 3, not 32');
  assert.equal(r.loser.delta, -3);
  assert.ok(r.winner.delta >= RP_RULES.MIN_CHANGE, "what the loser can afford is not the winner's problem");
});

test('farming a mismatch cannot outpace playing your own level', () => {
  let farmed = 1500;
  for (let i = 0; i < 10; i++) farmed = rankedResult(farmed, 500).winner.after;
  let honest = 1500;
  for (let i = 0; i < 10; i++) honest = rankedResult(honest, honest).winner.after;
  assert.ok(honest - 1500 > (farmed - 1500) * 2, `farming ${farmed - 1500} must be far worse than ${honest - 1500}`);
});

test('sitting on a rank by only playing far below you is punished, not rewarded', () => {
  const win = rankedResult(1800, 700).winner.delta;
  const loss = rankedResult(700, 1800).loser.delta;
  assert.ok(Math.abs(loss) > win * 4, `a loss (${loss}) must dwarf the win (${win})`);
});

// ------------------------------------------------------------- the win rule

test('the server decides the winner from the score, by all three rules', () => {
  const rules = { targetScore: 11, winBy: 2, maxScore: 15 };
  assert.equal(winnerFromScore([11, 9], rules), 0, 'first to 11 by two');
  assert.equal(winnerFromScore([9, 11], rules), 1);
  assert.equal(winnerFromScore([11, 10], rules), null, 'eleven-ten is not won yet');
  assert.equal(winnerFromScore([13, 11], rules), 0, 'deuce resolves at two clear');
  // The hard cap: a game that keeps going deuce has to end somewhere, and a
  // server that only knows the target would never settle this one.
  assert.equal(winnerFromScore([15, 14], rules), 0, 'the cap ends it without the margin');
  assert.equal(winnerFromScore([14, 15], rules), 1);
  assert.equal(winnerFromScore([0, 0], rules), null);
  assert.equal(winnerFromScore([10, 8], rules), null);
});

test('the win rule never names both players, at any score', () => {
  const rules = { targetScore: 11, winBy: 2, maxScore: 15 };
  for (let a = 0; a <= 20; a++) {
    for (let b = 0; b <= 20; b++) {
      const w = winnerFromScore([a, b], rules);
      if (w === null) continue;
      // Whoever it names must be the one actually ahead.
      const ahead = a > b ? 0 : b > a ? 1 : -1;
      assert.equal(w, ahead, `${a}-${b} named ${w}`);
    }
  }
});

// ------------------------------------------------- the matchmaking window

test('the ranked window starts tight and opens the longer you wait', () => {
  assert.equal(rpWindow(0), 150, 'a division at first ask');
  assert.ok(rpWindow(5000) > rpWindow(0), 'and it only ever grows');
  assert.ok(rpWindow(30_000) >= 3000, 'half a minute should reach across most of the ladder');
  assert.ok(rpWindow(90_000) >= 10_000, 'a minute and a half takes anybody');
  // Monotonic, so a longer wait is never a worse offer.
  let last = -1;
  for (let ms = 0; ms <= 120_000; ms += 2500) {
    const w = rpWindow(ms);
    assert.ok(w >= last, `window shrank at ${ms}ms`);
    last = w;
  }
  assert.equal(rpWindow(-1000), 150, 'a clock skew cannot narrow it below the floor');
});
