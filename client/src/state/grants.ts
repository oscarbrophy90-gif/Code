import type { Profile } from '@hoops/shared';

/**
 * One-off coin grants to named accounts.
 *
 * A grant is aimed at exactly one username and exactly one build on it. It is
 * checked every time a profile loads, so each one carries an id that is written
 * into the build's ledger the moment it pays out — otherwise it would pay again
 * on every launch.
 *
 * Matching is case- and whitespace-insensitive on both the username and the
 * build name. That is not looseness: a username is an identity, and
 * "BucketMerchant99" and "bucketmerchant99" are the same person everywhere
 * usernames exist. Nothing else about the comparison is fuzzy — any other
 * username, or the right username on the wrong build, is not a match.
 */
export interface CoinGrant {
  /** written into the build's ledger once paid, so it pays exactly once */
  id: string;
  /** the only account this grant will ever pay */
  username: string;
  /** the only build on that account it will ever pay */
  build: string;
  amount: number;
}

export const COIN_GRANTS: CoinGrant[] = [
  { id: 'grant-bucketmerchant99-eli-1m', username: 'BucketMerchant99', build: 'eli simmnos', amount: 1_000_000 },
];

/** Identity comparison for a user-typed name. */
function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Pays any grant this profile is owed. Pure over the profile it is handed and
 * safe to call as often as you like: a grant already in a build's ledger is
 * never paid twice. Returns true when something was actually paid.
 */
export function applyCoinGrants(profile: Profile, grants: CoinGrant[] = COIN_GRANTS): boolean {
  const username = profile.username ?? '';
  if (username.trim() === '') return false;

  let paid = false;
  for (const grant of grants) {
    if (!same(username, grant.username)) continue;
    for (const build of profile.players ?? []) {
      if (!same(build.name ?? '', grant.build)) continue;
      const ledger = build.grants ?? (build.grants = []);
      if (ledger.includes(grant.id)) continue;
      build.currency += grant.amount;
      ledger.push(grant.id);
      paid = true;
    }
  }
  return paid;
}
