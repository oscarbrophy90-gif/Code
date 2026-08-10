/**
 * The promise the product makes: sign up once, sign in once, and stay signed in
 * until you say otherwise. These tests act out the device — reloading the page,
 * closing the tab, restarting the browser — and check what survives each one.
 */

import { closeTab, localStorageStub, resetDevice, sessionStorageStub } from './setup.ts';

import { strict as assert } from 'node:assert';
import { beforeEach, test } from 'node:test';

import {
  changePassword,
  currentUser,
  deleteAccount,
  emailIsTaken,
  hasAnyAccount,
  isSignedIn,
  listAccounts,
  lockoutRemaining,
  onAuthChange,
  recoveryQuestionFor,
  resetWithRecovery,
  sessionInfo,
  setRecovery,
  signIn,
  signOut,
  signUp,
  touchSession,
  updatePreferences,
  updateProfile,
} from '../src/core/auth.ts';

const ADA = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'analytical-engine-1843' };

beforeEach(() => resetDevice());

// ------------------------------------------------------------------ sign up

test('signing up creates the account and signs you straight in', async () => {
  assert.equal(hasAnyAccount(), false);

  const result = await signUp(ADA);
  assert.ok(result.ok, 'sign up should succeed');
  assert.equal(result.account.name, 'Ada Lovelace');
  assert.equal(result.account.email, 'ada@example.com', 'stored lower-cased');
  assert.equal(result.account.emailTyped, 'Ada@Example.com', 'shown as typed');

  assert.ok(isSignedIn());
  assert.equal(currentUser()?.id, result.account.id);
  assert.equal(hasAnyAccount(), true);
});

test('the password is never stored, in any readable form', async () => {
  await signUp(ADA);
  const dump = JSON.stringify(localStorageStub) + serialise(localStorageStub);
  assert.ok(!dump.includes(ADA.password), 'the plaintext password must not be on disk');

  const raw = localStorageStub.getItem('acendri.os.v1.accounts')!;
  assert.ok(!raw.includes(ADA.password));
  const [stored] = JSON.parse(raw);
  assert.equal(stored.password.alg, 'pbkdf2-sha256');
  assert.ok(stored.password.salt.length > 0);
  assert.ok(stored.password.hash.length > 0);
  assert.equal(stored.plainPassword, undefined);
});

test('the same email cannot be taken twice, whatever the casing', async () => {
  await signUp(ADA);
  signOut();

  const again = await signUp({ ...ADA, email: 'ADA@EXAMPLE.COM', name: 'Impostor' });
  assert.equal(again.ok, false);
  if (!again.ok) {
    assert.equal(again.field, 'email');
    assert.match(again.error, /already/i);
  }
  assert.equal(listAccounts().length, 1);
  assert.ok(emailIsTaken('ada@example.com'));
});

test('sign up rejects a bad name, address or password before hashing anything', async () => {
  const badName = await signUp({ ...ADA, name: 'A' });
  assert.equal(badName.ok, false);
  if (!badName.ok) assert.equal(badName.field, 'name');

  const badEmail = await signUp({ ...ADA, email: 'not-an-address' });
  assert.equal(badEmail.ok, false);
  if (!badEmail.ok) assert.equal(badEmail.field, 'email');

  const shortPassword = await signUp({ ...ADA, password: 'short' });
  assert.equal(shortPassword.ok, false);
  if (!shortPassword.ok) assert.equal(shortPassword.field, 'password');

  assert.equal(hasAnyAccount(), false, 'nothing should have been written');
});

// ------------------------------------------------------------------ sign in

test('signing in needs the right password', async () => {
  await signUp(ADA);
  signOut();
  assert.equal(isSignedIn(), false);

  const wrong = await signIn({ email: ADA.email, password: 'not-it-at-all' });
  assert.equal(wrong.ok, false);
  assert.equal(isSignedIn(), false);

  const right = await signIn({ email: ADA.email, password: ADA.password });
  assert.ok(right.ok);
  assert.equal(currentUser()?.email, 'ada@example.com');
});

test('the email is case-insensitive at sign in', async () => {
  await signUp(ADA);
  signOut();
  const result = await signIn({ email: '  ADA@example.COM ', password: ADA.password });
  assert.ok(result.ok);
});

test('an unknown address gives the same answer as a wrong password', async () => {
  await signUp(ADA);
  signOut();

  const unknown = await signIn({ email: 'nobody@example.com', password: 'whatever-123' });
  const wrong = await signIn({ email: ADA.email, password: 'whatever-123' });

  assert.equal(unknown.ok, false);
  assert.equal(wrong.ok, false);
  if (!unknown.ok && !wrong.ok) {
    assert.equal(unknown.error, wrong.error, 'must not reveal which addresses exist');
  }
});

// ----------------------------------------------------------- saved sign-ins

test('a remembered sign-in survives a browser restart', async () => {
  await signUp(ADA, undefined);
  signOut();
  await signIn({ email: ADA.email, password: ADA.password, remember: true });

  // Closing the browser drops the tab store and keeps the device store.
  closeTab();

  assert.ok(isSignedIn(), 'still signed in after a restart');
  assert.equal(currentUser()?.email, 'ada@example.com');
  assert.equal(sessionInfo()?.remember, true);
});

test('without "remember me" the session dies with the tab but survives a reload', async () => {
  await signUp(ADA);
  signOut();
  await signIn({ email: ADA.email, password: ADA.password, remember: false });

  assert.ok(isSignedIn(), 'signed in for this tab');
  assert.equal(localStorageStub.getItem('acendri.os.v1.session'), null, 'nothing on the device');
  assert.ok(sessionStorageStub.getItem('acendri.os.v1.session'), 'held in the tab');

  // A reload keeps sessionStorage; only closing the tab clears it.
  assert.ok(isSignedIn());
  closeTab();
  assert.equal(isSignedIn(), false);
});

test('signing up leaves you signed in after a restart by default', async () => {
  await signUp(ADA);
  closeTab();
  assert.ok(isSignedIn(), 'a new account should not have to sign in again immediately');
});

test('an expired session is not a session', async () => {
  await signUp(ADA);
  const raw = JSON.parse(localStorageStub.getItem('acendri.os.v1.session')!);
  raw.expiresAt = Date.now() - 1;
  localStorageStub.setItem('acendri.os.v1.session', JSON.stringify(raw));

  assert.equal(isSignedIn(), false);
  assert.equal(localStorageStub.getItem('acendri.os.v1.session'), null, 'and it is cleaned up');
});

test('opening the app pushes a remembered expiry back out', async () => {
  await signUp(ADA);
  const before = sessionInfo()!.expiresAt;

  const raw = JSON.parse(localStorageStub.getItem('acendri.os.v1.session')!);
  raw.expiresAt = Date.now() + 60_000; // nearly up
  localStorageStub.setItem('acendri.os.v1.session', JSON.stringify(raw));

  touchSession();
  assert.ok(sessionInfo()!.expiresAt > before - 1000, 'expiry renewed on open');
});

test('a session pointing at a deleted account is dropped', async () => {
  await signUp(ADA);
  localStorageStub.setItem('acendri.os.v1.accounts', '[]');
  assert.equal(currentUser(), null);
  assert.equal(localStorageStub.getItem('acendri.os.v1.session'), null);
});

test('signing out keeps the account but drops the session', async () => {
  await signUp(ADA);
  signOut();
  assert.equal(isSignedIn(), false);
  assert.equal(listAccounts().length, 1, 'the account is still on the device');

  const back = await signIn({ email: ADA.email, password: ADA.password });
  assert.ok(back.ok);
});

test('two accounts can live on one device, most recent first', async () => {
  await signUp(ADA);
  signOut();
  await signUp({ name: 'Grace Hopper', email: 'grace@example.com', password: 'compiler-1952!' });

  const accounts = listAccounts();
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].email, 'grace@example.com', 'the newest sign-in leads');
  assert.equal(currentUser()?.email, 'grace@example.com');
});

// ----------------------------------------------------------------- throttle

test('five wrong passwords pause the account, and a good one clears it', async () => {
  await signUp(ADA);
  signOut();

  for (let i = 0; i < 5; i++) {
    const attempt = await signIn({ email: ADA.email, password: `wrong-${i}` });
    assert.equal(attempt.ok, false);
  }

  assert.ok(lockoutRemaining(ADA.email) > 0, 'locked after five');
  const locked = await signIn({ email: ADA.email, password: ADA.password });
  assert.equal(locked.ok, false, 'even the right password waits');
  if (!locked.ok) assert.match(locked.error, /too many attempts/i);

  // Serve the pause.
  const throttle = JSON.parse(localStorageStub.getItem('acendri.os.v1.throttle')!);
  throttle['ada@example.com'].lockedUntil = Date.now() - 1;
  localStorageStub.setItem('acendri.os.v1.throttle', JSON.stringify(throttle));

  const ok = await signIn({ email: ADA.email, password: ADA.password });
  assert.ok(ok.ok);
  assert.equal(lockoutRemaining(ADA.email), 0, 'a clean sign-in wipes the record');
});

// ------------------------------------------------------- account management

test('the profile can be renamed and given an avatar', async () => {
  await signUp(ADA);
  const result = updateProfile({ name: 'Ada King', avatar: '🛰️' });
  assert.ok(result.ok);
  assert.equal(currentUser()?.name, 'Ada King');
  assert.equal(currentUser()?.avatar, '🛰️');

  const bad = updateProfile({ name: ' ' });
  assert.equal(bad.ok, false);
  assert.equal(currentUser()?.name, 'Ada King', 'unchanged after a rejected edit');
});

test('preferences are saved per account and survive a restart', async () => {
  await signUp(ADA);
  updatePreferences({ theme: 'light', accent: 'ember', reduceMotion: true });
  closeTab();

  const prefs = currentUser()!.preferences;
  assert.equal(prefs.theme, 'light');
  assert.equal(prefs.accent, 'ember');
  assert.equal(prefs.reduceMotion, true);
  assert.equal(prefs.sounds, false, 'untouched preferences keep their default');
});

test('changing the password needs the old one and takes effect', async () => {
  await signUp(ADA);

  const wrong = await changePassword('nope-nope-nope', 'brand-new-password-9');
  assert.equal(wrong.ok, false);

  const same = await changePassword(ADA.password, ADA.password);
  assert.equal(same.ok, false, 'reusing the current password is refused');

  const changed = await changePassword(ADA.password, 'brand-new-password-9');
  assert.ok(changed.ok);
  assert.ok(isSignedIn(), 'you stay signed in on this device');

  signOut();
  assert.equal((await signIn({ email: ADA.email, password: ADA.password })).ok, false);
  assert.ok((await signIn({ email: ADA.email, password: 'brand-new-password-9' })).ok);
});

test('changing the password issues a new session token', async () => {
  await signUp(ADA);
  const before = sessionInfo()!.token;
  await changePassword(ADA.password, 'another-good-password-2');
  assert.notEqual(sessionInfo()!.token, before, 'the old token must stop working');
});

test('deleting an account requires the password and removes everything', async () => {
  await signUp(ADA);

  const refused = await deleteAccount('guessing');
  assert.equal(refused.ok, false);
  assert.equal(listAccounts().length, 1, 'a wrong password deletes nothing');

  const gone = await deleteAccount(ADA.password);
  assert.ok(gone.ok);
  assert.equal(listAccounts().length, 0);
  assert.equal(isSignedIn(), false);
});

// ----------------------------------------------------------------- recovery

test('a recovery question can reset the password without a server', async () => {
  await signUp(ADA);
  const set = await setRecovery('First computer you used?', '  Difference   Engine ');
  assert.ok(set.ok);
  assert.ok(currentUser()!.hasRecovery);
  signOut();

  assert.equal(recoveryQuestionFor(ADA.email), 'First computer you used?');
  assert.equal(recoveryQuestionFor('nobody@example.com'), null);

  const wrong = await resetWithRecovery(ADA.email, 'a guess', 'replacement-pass-77');
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.field, 'answer');

  // Casing and spacing should not stand between you and your account.
  const ok = await resetWithRecovery(ADA.email, 'difference engine', 'replacement-pass-77');
  assert.ok(ok.ok);
  assert.ok(isSignedIn(), 'a reset signs you in');

  signOut();
  assert.ok((await signIn({ email: ADA.email, password: 'replacement-pass-77' })).ok);
});

test('recovery is refused for an account that never set one up', async () => {
  await signUp(ADA);
  signOut();
  const result = await resetWithRecovery(ADA.email, 'anything', 'replacement-pass-77');
  assert.equal(result.ok, false);
});

// ------------------------------------------------------------------- events

test('subscribers hear about sign-in and sign-out', async () => {
  const seen: (string | null)[] = [];
  const stop = onAuthChange((user) => seen.push(user?.name ?? null));

  await signUp(ADA);
  signOut();
  stop();
  await signIn({ email: ADA.email, password: ADA.password });

  assert.deepEqual(seen, ['Ada Lovelace', null], 'and stop() actually stops it');
});

test('subscribers are not woken by ordinary edits', async () => {
  await signUp(ADA);

  let calls = 0;
  const stop = onAuthChange(() => calls++);

  // The app re-renders on this event. Firing it for a rename, a preference or a
  // password change would tear down the very form the edit was made in.
  updateProfile({ name: 'Ada King' });
  updatePreferences({ theme: 'light' });
  await changePassword(ADA.password, 'a-different-password-1');
  await setRecovery('First computer you used?', 'Difference Engine');
  assert.equal(calls, 0);

  signOut();
  assert.equal(calls, 1, 'but a sign-out still counts');
  stop();
});

test('a sign-out is announced even when the session was restored from a past visit', async () => {
  // `announcedUserId` is seeded at module load, which happened before this test
  // wrote anything. Signing in and out inside one test would hide a bug where
  // that seed is missing, so this one checks the transition it protects.
  await signUp(ADA);
  let sawNull = false;
  const stop = onAuthChange((user) => {
    if (user === null) sawNull = true;
  });
  signOut();
  stop();
  assert.ok(sawNull);
});

// ------------------------------------------------------------- damaged data

test('a corrupted account list does not lock the device', async () => {
  localStorageStub.setItem('acendri.os.v1.accounts', '{not json at all');
  assert.deepEqual(listAccounts(), []);
  assert.ok((await signUp(ADA)).ok, 'you can still make an account');
});

test('one unreadable account does not take the others with it', async () => {
  await signUp(ADA);
  const accounts = JSON.parse(localStorageStub.getItem('acendri.os.v1.accounts')!);
  accounts.push({ id: 'broken' }); // no email, no password record
  localStorageStub.setItem('acendri.os.v1.accounts', JSON.stringify(accounts));

  assert.equal(listAccounts().length, 1);
  assert.equal(listAccounts()[0].email, 'ada@example.com');
});

/** localStorage is not a plain object, so JSON.stringify alone would miss it. */
function serialise(store: Storage): string {
  let out = '';
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)!;
    out += `${key}=${store.getItem(key)}\n`;
  }
  return out;
}
