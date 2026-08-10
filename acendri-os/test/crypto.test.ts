/**
 * Proof that the hand-rolled crypto is the real thing.
 *
 * The fallback exists because a file:// document is not a secure context
 * everywhere, so an account created against WebCrypto in one browser has to
 * open against the JavaScript path in another. Held against Node's native
 * implementations, both must agree byte for byte.
 */

import './setup.ts';

import { createHash, pbkdf2Sync } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  constantTimeEqual,
  fromBase64,
  hashPassword,
  pbkdf2Js,
  randomId,
  sha256,
  toBase64,
  verifyPassword,
} from '../src/core/hash.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);
const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

test('sha256 matches the published FIPS-180-4 vectors', () => {
  assert.equal(
    hex(sha256(utf8(''))),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    hex(sha256(utf8('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    hex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('sha256 handles the lengths that straddle a block boundary', () => {
  // 55, 56 and 64 bytes are where the padding rules change: at 56 the length
  // field no longer fits and a whole extra block is needed. An off-by-one there
  // is invisible on short inputs and wrong on everything else.
  for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const input = utf8('x'.repeat(length));
    const expected = createHash('sha256').update(input).digest('hex');
    assert.equal(hex(sha256(input)), expected, `length ${length}`);
  }
});

test('the JavaScript PBKDF2 matches native PBKDF2 byte for byte', async () => {
  const cases: Array<{ password: string; salt: string; iterations: number }> = [
    { password: 'password', salt: 'salt', iterations: 1 },
    { password: 'password', salt: 'salt', iterations: 2 },
    { password: 'password', salt: 'salt', iterations: 4096 },
    { password: 'a much longer passphrase than the block size of sha-256 hmac keys', salt: 'NaCl', iterations: 1000 },
    { password: 'pässwörd — with unicode 🔐', salt: 'sødium', iterations: 777 },
  ];

  for (const { password, salt, iterations } of cases) {
    const mine = await pbkdf2Js(utf8(password), utf8(salt), iterations);
    const theirs = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    assert.equal(hex(mine), theirs.toString('hex'), `${password} / ${iterations}`);
  }
});

test('base64 survives a round trip, including high bytes', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  assert.equal(hex(fromBase64(toBase64(bytes))), hex(bytes));
});

test('constantTimeEqual compares contents, not identity', () => {
  assert.ok(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])));
  assert.ok(!constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])));
  assert.ok(!constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])));
});

test('randomId is url-safe and does not repeat', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const id = randomId();
    assert.match(id, /^[A-Za-z0-9_-]+$/);
    assert.ok(!seen.has(id), 'ids must not collide');
    seen.add(id);
  }
});

test('a hashed password verifies, and a near-miss does not', async () => {
  const record = await hashPassword('correct horse battery staple');
  assert.equal(record.alg, 'pbkdf2-sha256');
  assert.ok(record.iterations >= 25_000);
  assert.ok(await verifyPassword('correct horse battery staple', record));
  assert.ok(!(await verifyPassword('correct horse battery stapl', record)));
  assert.ok(!(await verifyPassword('Correct horse battery staple', record)));
  assert.ok(!(await verifyPassword('', record)));
});

test('two accounts with the same password get different hashes', async () => {
  const a = await hashPassword('same-password-1234');
  const b = await hashPassword('same-password-1234');
  assert.notEqual(a.salt, b.salt, 'each account must get its own salt');
  assert.notEqual(a.hash, b.hash);
});

test('a record made on the fallback backend verifies against the native one', async () => {
  // The exact cross-browser case: hashed with the JavaScript PBKDF2, checked by
  // whatever `verifyPassword` picks (WebCrypto, under Node).
  const salt = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6]);
  const derived = await pbkdf2Js(utf8('portable-password'.normalize('NFKC')), salt, 25_000);
  const record = {
    alg: 'pbkdf2-sha256' as const,
    iterations: 25_000,
    salt: toBase64(salt),
    hash: toBase64(derived),
  };
  assert.ok(await verifyPassword('portable-password', record));
  assert.ok(!(await verifyPassword('portable-passwerd', record)));
});

test('verifyPassword refuses a record it does not understand', async () => {
  const record = { alg: 'scrypt', iterations: 1, salt: 'AA==', hash: 'AA==' } as never;
  assert.equal(await verifyPassword('anything', record), false);
});
