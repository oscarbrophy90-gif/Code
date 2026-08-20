import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MyPlayer, Profile } from '@hoops/shared';
import { COIN_GRANTS, applyCoinGrants } from '../src/state/grants.ts';

/**
 * One-off coin grants.
 *
 * The whole point of a grant is that it is aimed: one account, one build, once.
 * These tests are mostly about who does NOT get paid.
 */

function build(name: string, currency = 0): MyPlayer {
  return { name, currency, grants: [] } as unknown as MyPlayer;
}

function profile(username: string, builds: MyPlayer[]): Profile {
  return { username, players: builds } as unknown as Profile;
}

const GRANT = COIN_GRANTS[0];

test('the named account gets the million on the named build', () => {
  const eli = build('eli simmnos');
  const p = profile('BucketMerchant99', [eli]);
  assert.equal(applyCoinGrants(p), true);
  assert.equal(eli.currency, 1_000_000);
  assert.deepEqual(eli.grants, [GRANT.id]);
});

test('it pays exactly once, however many times the profile is loaded', () => {
  const eli = build('eli simmnos');
  const p = profile('BucketMerchant99', [eli]);
  applyCoinGrants(p);
  applyCoinGrants(p);
  applyCoinGrants(p);
  assert.equal(eli.currency, 1_000_000, 'a reload must not pay again');
});

test('coins earned afterwards are kept, and the grant still never repeats', () => {
  const eli = build('eli simmnos');
  const p = profile('BucketMerchant99', [eli]);
  applyCoinGrants(p);
  eli.currency -= 250_000; // spent in the store
  eli.currency += 4_000; // won a few games
  applyCoinGrants(p);
  assert.equal(eli.currency, 754_000, 'the grant must not top the balance back up');
});

test('nobody else gets it — not another username, not another build', () => {
  // Every other username, including near-misses.
  for (const name of [
    'BucketMerchant',
    'BucketMerchant9',
    'BucketMerchant999',
    'BucketMerchant98',
    'Bucket Merchant99',
    'xBucketMerchant99',
    'BucketMerchant99x',
    'HoopKing23',
    '',
    '   ',
  ]) {
    const eli = build('eli simmnos');
    const p = profile(name, [eli]);
    assert.equal(applyCoinGrants(p), false, `"${name}" must not be paid`);
    assert.equal(eli.currency, 0, `"${name}" must not be paid`);
  }

  // The right account, but any other build on it.
  for (const buildName of ['Eli', 'eli simmons', 'eli simmnos 2', 'Tester', '']) {
    const other = build(buildName);
    const p = profile('BucketMerchant99', [other]);
    assert.equal(applyCoinGrants(p), false, `build "${buildName}" must not be paid`);
    assert.equal(other.currency, 0, `build "${buildName}" must not be paid`);
  }
});

test('only the named build is paid when the account has several', () => {
  const eli = build('eli simmnos');
  const guard = build('Tester');
  const big = build('Paint Beast');
  const p = profile('BucketMerchant99', [guard, eli, big]);
  applyCoinGrants(p);
  assert.equal(eli.currency, 1_000_000);
  assert.equal(guard.currency, 0);
  assert.equal(big.currency, 0);
});

test('capitalisation and stray spaces are the same identity, since a username is one', () => {
  for (const name of ['bucketmerchant99', 'BUCKETMERCHANT99', '  BucketMerchant99  ']) {
    for (const buildName of ['Eli Simmnos', 'ELI SIMMNOS', ' eli simmnos ']) {
      const eli = build(buildName);
      const p = profile(name, [eli]);
      assert.equal(applyCoinGrants(p), true, `${name} / ${buildName} should be paid`);
      assert.equal(eli.currency, 1_000_000);
    }
  }
});

test('a build carrying an unrelated grant id still gets this one', () => {
  const eli = build('eli simmnos');
  eli.grants = ['some-other-grant'];
  const p = profile('BucketMerchant99', [eli]);
  assert.equal(applyCoinGrants(p), true);
  assert.equal(eli.currency, 1_000_000);
  assert.deepEqual(eli.grants, ['some-other-grant', GRANT.id]);
});

test('a build with no ledger at all (an older save) is handled', () => {
  const eli = { name: 'eli simmnos', currency: 500 } as unknown as MyPlayer;
  const p = profile('BucketMerchant99', [eli]);
  assert.equal(applyCoinGrants(p), true);
  assert.equal(eli.currency, 1_000_500, 'the grant adds to what was already there');
  applyCoinGrants(p);
  assert.equal(eli.currency, 1_000_500);
});

test('there is exactly one grant, and it is the one that was asked for', () => {
  assert.equal(COIN_GRANTS.length, 1);
  assert.equal(GRANT.username, 'BucketMerchant99');
  assert.equal(GRANT.build, 'eli simmnos');
  assert.equal(GRANT.amount, 1_000_000);
});
