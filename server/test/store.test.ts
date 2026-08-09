import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The store is loaded fresh per test with its own data directory, because it is
 * a module-level singleton that reads `HOOPS_DATA_DIR` once at import. A cache
 * buster on the specifier is what lets each test get its own.
 */
async function freshStore(dir: string) {
  process.env.HOOPS_DATA_DIR = dir;
  const mod = await import(`../src/store.ts?t=${Math.random()}`);
  return mod.store as typeof import('../src/store.ts').store;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hoops-store-'));
}

test('a result written to the store survives a restart', async () => {
  // This is the whole point of the store, and it is what was broken: results
  // were computed and sent to the client but never written, so a rank existed
  // only for as long as the socket did.
  const dir = tempDir();
  const first = await freshStore(dir);
  first.account('u1', 'Winner', 'na-east');
  first.account('u2', 'Loser', 'na-east');
  first.update('u1', { rankPoints: 41, wins: 1, losses: 0, winStreak: 1 });
  first.update('u2', { rankPoints: 0, wins: 0, losses: 1, winStreak: 0 });
  first.close();

  const second = await freshStore(dir);
  const ladder = second.leaderboard('world');
  assert.equal(ladder.length, 2, 'both accounts came back');
  assert.equal(ladder[0].displayName, 'Winner');
  assert.equal(ladder[0].rankPoints, 41, 'rank points survived');
  assert.equal(ladder[0].wins, 1);
  assert.equal(ladder[1].losses, 1, 'and so did the loss');
  second.close();
});

test('a half-written database falls back to the backup instead of starting empty', async () => {
  const dir = tempDir();
  const first = await freshStore(dir);
  first.account('u1', 'Established', 'eu-west');
  first.update('u1', { rankPoints: 900, wins: 12 });
  first.close();

  // A second write is what produces a backup of the first.
  const second = await freshStore(dir);
  second.account('u2', 'Newer', 'eu-west');
  second.close();

  // Now truncate the live file the way a process killed mid-write would.
  const dbPath = join(dir, 'db.json');
  const good = readFileSync(dbPath, 'utf8');
  writeFileSync(dbPath, good.slice(0, Math.floor(good.length / 2)), 'utf8');

  const third = await freshStore(dir);
  const names = third.leaderboard('world').map((e) => e.displayName);
  // The backup predates 'Newer', so that one is lost — but 'Established' and its
  // twelve wins are not, which is the difference between losing one write and
  // losing the whole ladder.
  assert.ok(names.includes('Established'), 'the backup was used rather than starting from nothing');
  const restored = third.leaderboard('world').find((e) => e.displayName === 'Established');
  assert.equal(restored?.rankPoints, 900);
  assert.equal(restored?.wins, 12);
  third.close();

  // The unreadable file is kept rather than silently overwritten.
  assert.ok(
    readdirSync(dir).some((f) => f.includes('corrupt')),
    'the damaged file is kept for inspection',
  );
});

test('writes are atomic: no temporary file is left behind', async () => {
  const dir = tempDir();
  const store = await freshStore(dir);
  store.account('u1', 'Someone', 'na-east');
  store.close();
  assert.ok(existsSync(join(dir, 'db.json')), 'the database is written');
  assert.ok(!existsSync(join(dir, 'db.json.tmp')), 'the temporary file is renamed away, never left');
  store.close();
});

test('a save blob round-trips and refuses to go backwards', async () => {
  const dir = tempDir();
  const store = await freshStore(dir);
  store.account('u1', 'Cloud', 'na-east');

  assert.equal(store.saveProfile('u1', 'blob-v2', 2), true);
  assert.deepEqual(store.loadProfile('u1'), { blob: 'blob-v2', revision: 2 });

  // An older revision arriving late must not clobber a newer save.
  assert.equal(store.saveProfile('u1', 'blob-v1', 1), false);
  assert.equal(store.loadProfile('u1').blob, 'blob-v2', 'the newer save stands');

  assert.equal(store.saveProfile('nobody', 'x', 1), false, 'an unknown account saves nothing');
  store.close();
});
