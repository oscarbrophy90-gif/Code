import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeMatchReward, emptyStats, type Playlist } from '../src/index.ts';

/**
 * The CPU Ranked coin cut, and the modes it must not touch.
 */

function reward(playlist: Playlist | 'event') {
  const stats = emptyStats();
  stats.points = 11;
  stats.fgm = 6;
  stats.fga = 10;
  stats.greens = 3;
  stats.rebounds = 4;
  stats.steals = 2;
  return computeMatchReward({
    won: true,
    playlist,
    stats,
    scoreFor: 11,
    scoreAgainst: 7,
    durationSeconds: 300,
    greenRate: 0.3,
    xpMultiplier: 1,
    premiumPass: false,
    winStreak: 0,
  });
}

test('CPU Ranked pays exactly half, and says so on the results screen', () => {
  const ranked = reward('ranked');
  const line = ranked.breakdown.find((b) => b.label.includes('Ranked coin rate'));
  assert.ok(line, 'the cut has to be visible, not silent');
  assert.ok(line!.currency < 0);
  // The stated total is what the breakdown adds up to.
  const summed = ranked.breakdown.reduce((n, b) => n + b.currency, 0);
  assert.ok(Math.abs(summed - ranked.currency) <= 1, `breakdown ${summed} vs total ${ranked.currency}`);
  // And it really is half: the pre-cut figure is the total plus the cut back on.
  const before = ranked.currency - line!.currency;
  assert.equal(ranked.currency, before - (before - Math.round(before * 0.5)));
  assert.ok(Math.abs(ranked.currency / before - 0.5) < 0.01, `${ranked.currency} of ${before} is not half`);
});

test('casual and event coins are untouched', () => {
  for (const playlist of ['casual', 'private', 'event'] as const) {
    const r = reward(playlist);
    assert.equal(
      r.breakdown.some((b) => b.label.includes('Ranked coin rate')),
      false,
      `${playlist} must not be cut`,
    );
  }
});

test('XP is not touched — the cut is coins only', () => {
  const ranked = reward('ranked');
  const casual = reward('casual');
  // Ranked still carries its 1.3 playlist multiplier on XP, so it stays ahead.
  assert.ok(ranked.xp > casual.xp, 'ranked XP should still beat casual');
  assert.equal(ranked.breakdown.filter((b) => b.label.includes('Ranked coin rate'))[0].xp, 0);
});

test('a ranked game that paid nothing does not go negative', () => {
  const stats = emptyStats();
  stats.turnovers = 40;
  const r = computeMatchReward({
    won: false, playlist: 'ranked', stats, scoreFor: 0, scoreAgainst: 11,
    durationSeconds: 20, greenRate: 0, xpMultiplier: 1, premiumPass: false, winStreak: 0,
  });
  assert.ok(r.currency >= 0, `paid ${r.currency}`);
});
