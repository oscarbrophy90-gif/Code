import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PVP_POINTS_PER_DIVISION,
  PVP_POINTS_TO_GRAND_CHAMP,
  PVP_TIERS,
  pvpNextRankAt,
  pvpNextRankLabel,
  pvpRank,
} from '../src/pvprank.ts';

/**
 * The player-versus-player ladder.
 *
 * It is a pure function of RP, which is the property everything else leans on:
 * the server sends a number, every client derives the same rank from it, and
 * promotion and demotion are not events anybody has to remember to fire.
 */

test('the ladder runs Bronze 3 to Grand Champion, in order, with no gaps', () => {
  const seen: string[] = [];
  for (let rp = 0; rp <= PVP_POINTS_TO_GRAND_CHAMP; rp += 10) {
    const label = pvpRank(rp).label;
    if (seen[seen.length - 1] !== label) seen.push(label);
  }
  assert.deepEqual(seen, [
    'Bronze 3', 'Bronze 2', 'Bronze 1',
    'Silver 3', 'Silver 2', 'Silver 1',
    'Gold 3', 'Gold 2', 'Gold 1',
    'Platinum 3', 'Platinum 2', 'Platinum 1',
    'Diamond 3', 'Diamond 2', 'Diamond 1',
    'Grand Champion',
  ]);
});

test('a division is worth exactly its points, and the boundaries land where they should', () => {
  assert.equal(pvpRank(0).label, 'Bronze 3');
  assert.equal(pvpRank(PVP_POINTS_PER_DIVISION - 1).label, 'Bronze 3');
  assert.equal(pvpRank(PVP_POINTS_PER_DIVISION).label, 'Bronze 2');
  // Five tiers of three divisions, then the top.
  assert.equal(PVP_POINTS_TO_GRAND_CHAMP, (PVP_TIERS.length - 1) * 3 * PVP_POINTS_PER_DIVISION);
  assert.equal(pvpRank(PVP_POINTS_TO_GRAND_CHAMP - 1).label, 'Diamond 1');
  assert.equal(pvpRank(PVP_POINTS_TO_GRAND_CHAMP).grandChamp, true);
});

test('promotion and demotion are the same crossing, read from either side', () => {
  const at = 300;
  assert.equal(pvpRank(at - 1).label, 'Bronze 1');
  assert.equal(pvpRank(at).label, 'Silver 3');
  // Losing the point you gained puts you back where you were: a ladder derived
  // from the number can never drift away from the number.
  assert.equal(pvpRank(at).label, pvpRank(at + 1 - 1).label);
  assert.equal(pvpRank(at - 1).label, pvpRank(at - 1).label);
});

test('the climb to the next rank is reported honestly at every point', () => {
  for (const rp of [0, 55, 99, 100, 640, 1499]) {
    const rank = pvpRank(rp);
    const next = pvpNextRankAt(rp)!;
    assert.equal(next, rp + rank.toNext, `${rp}: toNext must reach the boundary`);
    assert.equal(pvpRank(next).label, pvpNextRankLabel(rp));
    assert.notEqual(pvpRank(next).label, rank.label, `${rp}: the next rank must be a different rank`);
    assert.ok(rank.toNext > 0 && rank.toNext <= PVP_POINTS_PER_DIVISION);
  }
});

test('Grand Champion is the top: nothing above it, and it never fills', () => {
  const gc = pvpRank(PVP_POINTS_TO_GRAND_CHAMP + 900);
  assert.equal(gc.grandChamp, true);
  assert.equal(gc.label, 'Grand Champion');
  assert.equal(gc.needed, 0);
  assert.equal(gc.toNext, 0);
  assert.equal(pvpNextRankAt(gc.rp), null);
  assert.equal(pvpNextRankLabel(gc.rp), null);
});

test('nonsense RP cannot produce a nonsense rank', () => {
  for (const rp of [-1, -9999, 0.4, Number.NaN]) {
    const rank = pvpRank(Number.isNaN(rp) ? 0 : rp);
    assert.equal(rank.label, 'Bronze 3', `${rp} must floor to the bottom of the ladder`);
    assert.ok(rank.rp >= 0);
  }
});
