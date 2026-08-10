/**
 * Sign up, sign in, sign out, and the saved session that means you only do it
 * once.
 *
 * The rule the whole app leans on: after a successful sign-in, closing the tab,
 * closing the browser or restarting the device brings you back signed in. That
 * is a token in localStorage with an expiry, re-checked against the account
 * list on boot — a session whose account has since been deleted is not a
 * session.
 *
 * "Remember me" chooses *where* the token lives, not whether one exists:
 *   on  -> localStorage, thirty days, survives a restart
 *   off -> sessionStorage, survives a reload, gone when the tab closes
 *
 * Everything is local to the device for now. Nothing here calls a server, and
 * the shapes are the ones a server would use later so that swap is additive.
 */

import type { Account, PublicAccount, Preferences } from './accounts.ts';
import {
  findByEmail,
  findById,
  loadAccounts,
  newAccount,
  publicView,
  saveAccounts,
} from './accounts.ts';
import type { PasswordRecord } from './hash.ts';
import { hashPassword, randomId, verifyPassword } from './hash.ts';
import { readJSON, remove, writeJSON, storageIsPersistent } from './storage.ts';
import type { Durability } from './storage.ts';
import { checkEmail, checkName, checkPassword, normaliseEmail } from './validate.ts';

const SESSION_KEY = 'session';
const THROTTLE_KEY = 'throttle';

const REMEMBERED_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** Wrong tries before the account pauses, and how long the pause is. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export type Session = {
  userId: string;
  token: string;
  issuedAt: number;
  /** Absolute ms timestamp; 0 means it lasts as long as the tab does. */
  expiresAt: number;
  remember: boolean;
};

export type AuthResult =
  | { ok: true; account: PublicAccount }
  | { ok: false; error: string; field?: 'name' | 'email' | 'password' | 'confirm' | 'answer' };

type Progress = (fraction: number) => void;

// ------------------------------------------------------------------- events

type Listener = (user: PublicAccount | null) => void;
const listeners = new Set<Listener>();

/**
 * Who the listeners were last told about. Signing in, signing out and deleting
 * an account change this; renaming yourself or changing your password do not.
 */
let announcedUserId: string | null = null;

/**
 * Subscribe to *who is signed in*, not to every edit. The app re-renders on
 * this, so firing it for an ordinary profile or preference change would tear
 * down the form the change was made in — taking the success message and the
 * keyboard focus with it. Screens that make those edits redraw themselves.
 *
 * Returns the unsubscribe function.
 */
export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  const user = currentUser();
  const id = user?.id ?? null;
  if (id === announcedUserId) return;
  announcedUserId = id;
  for (const listener of [...listeners]) listener(user);
}

// ------------------------------------------------------------------ session

/** Sessions live in exactly one of the two stores; look in both. */
function readSession(): { session: Session; where: Durability } | null {
  for (const where of ['device', 'tab'] as const) {
    const found = readJSON<Session | null>(SESSION_KEY, null, where);
    if (found && typeof found.userId === 'string' && typeof found.token === 'string') {
      return { session: found, where };
    }
  }
  return null;
}

function clearSession(): void {
  remove(SESSION_KEY, 'device');
  remove(SESSION_KEY, 'tab');
}

function startSession(account: Account, remember: boolean): Session {
  const now = Date.now();
  const session: Session = {
    userId: account.id,
    token: randomId(24),
    issuedAt: now,
    expiresAt: remember ? now + REMEMBERED_DAYS * DAY : 0,
    remember,
  };
  // Only ever one live session per device, so clear before writing rather than
  // leaving a stale copy in the store we are not using this time.
  clearSession();
  writeJSON(SESSION_KEY, session, remember ? 'device' : 'tab');
  return session;
}

/**
 * The signed-in account, or null. Re-derived from storage every call rather
 * than cached, so a sign-out in another tab is noticed here too.
 */
export function currentUser(): PublicAccount | null {
  const found = readSession();
  if (!found) return null;

  const { session } = found;
  if (session.expiresAt !== 0 && Date.now() > session.expiresAt) {
    clearSession();
    return null;
  }

  const account = findById(loadAccounts(), session.userId);
  if (!account) {
    // The account was deleted — on this device or in another tab. The token is
    // meaningless now.
    clearSession();
    return null;
  }
  return publicView(account);
}

export function isSignedIn(): boolean {
  return currentUser() !== null;
}

export function sessionInfo(): Session | null {
  return readSession()?.session ?? null;
}

/**
 * Pushes a remembered session's expiry back out to the full window. Called on
 * app open so someone who uses Acendri weekly is never signed out, while a
 * device left alone for a month is.
 */
export function touchSession(): void {
  const found = readSession();
  if (!found || !found.session.remember) return;
  const session = { ...found.session, expiresAt: Date.now() + REMEMBERED_DAYS * DAY };
  writeJSON(SESSION_KEY, session, 'device');
}

// ----------------------------------------------------------------- throttle

type Throttle = Record<string, { fails: number; lockedUntil: number }>;

function loadThrottle(): Throttle {
  return readJSON<Throttle>(THROTTLE_KEY, {});
}

/** Milliseconds left on the lockout for this address, or 0 when it is open. */
export function lockoutRemaining(email: string): number {
  const entry = loadThrottle()[normaliseEmail(email)];
  if (!entry) return 0;
  return Math.max(0, entry.lockedUntil - Date.now());
}

function recordFailure(email: string): number {
  const key = normaliseEmail(email);
  const throttle = loadThrottle();
  const entry = throttle[key] ?? { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.fails = 0;
  }
  throttle[key] = entry;
  writeJSON(THROTTLE_KEY, throttle);
  return entry.lockedUntil > Date.now() ? entry.lockedUntil - Date.now() : 0;
}

function clearFailures(email: string): void {
  const throttle = loadThrottle();
  delete throttle[normaliseEmail(email)];
  writeJSON(THROTTLE_KEY, throttle);
}

// -------------------------------------------------------------------- flows

export function listAccounts(): PublicAccount[] {
  return loadAccounts()
    .map(publicView)
    .sort((a, b) => b.lastSignInAt - a.lastSignInAt);
}

export function hasAnyAccount(): boolean {
  return loadAccounts().length > 0;
}

export function emailIsTaken(email: string): boolean {
  return findByEmail(loadAccounts(), email) !== undefined;
}

export async function signUp(
  fields: { name: string; email: string; password: string; remember?: boolean },
  onProgress?: Progress,
): Promise<AuthResult> {
  const nameError = checkName(fields.name);
  if (nameError) return { ok: false, error: nameError, field: 'name' };

  const emailError = checkEmail(fields.email);
  if (emailError) return { ok: false, error: emailError, field: 'email' };

  const passwordError = checkPassword(fields.password);
  if (passwordError) return { ok: false, error: passwordError, field: 'password' };

  const accounts = loadAccounts();
  if (findByEmail(accounts, fields.email)) {
    return {
      ok: false,
      error: 'There is already an account on this device with that email.',
      field: 'email',
    };
  }

  const password = await hashPassword(fields.password, onProgress);
  const account = newAccount({ name: fields.name, email: fields.email, password });
  accounts.push(account);

  if (!saveAccounts(accounts)) {
    return { ok: false, error: 'This device would not let us save the account. Storage is full.' };
  }

  clearFailures(account.email);
  startSession(account, fields.remember ?? true);
  announce();
  return { ok: true, account: publicView(account) };
}

export async function signIn(
  fields: { email: string; password: string; remember?: boolean },
  onProgress?: Progress,
): Promise<AuthResult> {
  const emailError = checkEmail(fields.email);
  if (emailError) return { ok: false, error: emailError, field: 'email' };
  if (!fields.password) return { ok: false, error: 'Enter your password.', field: 'password' };

  const waitMs = lockoutRemaining(fields.email);
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    return {
      ok: false,
      error: `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
      field: 'password',
    };
  }

  const accounts = loadAccounts();
  const account = findByEmail(accounts, fields.email);

  // Same message and roughly the same work either way, so the form cannot be
  // used to find out which addresses have accounts on the device.
  if (!account) {
    await hashPassword(fields.password, onProgress);
    recordFailure(fields.email);
    return { ok: false, error: 'That email and password do not match.', field: 'password' };
  }

  const good = await verifyPassword(fields.password, account.password, onProgress);
  if (!good) {
    const lockedFor = recordFailure(fields.email);
    if (lockedFor > 0) {
      return {
        ok: false,
        error: `Too many attempts. Try again in ${Math.ceil(lockedFor / 1000)} seconds.`,
        field: 'password',
      };
    }
    return { ok: false, error: 'That email and password do not match.', field: 'password' };
  }

  clearFailures(account.email);
  account.lastSignInAt = Date.now();
  saveAccounts(accounts);
  startSession(account, fields.remember ?? true);
  announce();
  return { ok: true, account: publicView(account) };
}

export function signOut(): void {
  clearSession();
  announce();
}

// ------------------------------------------------------- account management

function withCurrentAccount<T>(run: (account: Account, accounts: Account[]) => T): T | null {
  const session = readSession()?.session;
  if (!session) return null;
  const accounts = loadAccounts();
  const account = findById(accounts, session.userId);
  if (!account) return null;
  return run(account, accounts);
}

export function updateProfile(patch: { name?: string; avatar?: string }): AuthResult {
  if (patch.name !== undefined) {
    const nameError = checkName(patch.name);
    if (nameError) return { ok: false, error: nameError, field: 'name' };
  }

  const result = withCurrentAccount((account, accounts) => {
    if (patch.name !== undefined) account.name = patch.name.trim();
    if (patch.avatar !== undefined) account.avatar = patch.avatar;
    saveAccounts(accounts);
    return publicView(account);
  });

  if (!result) return { ok: false, error: 'You are not signed in.' };
  announce();
  return { ok: true, account: result };
}

export function updatePreferences(patch: Partial<Preferences>): AuthResult {
  const result = withCurrentAccount((account, accounts) => {
    account.preferences = { ...account.preferences, ...patch };
    saveAccounts(accounts);
    return publicView(account);
  });

  if (!result) return { ok: false, error: 'You are not signed in.' };
  announce();
  return { ok: true, account: result };
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
  onProgress?: Progress,
): Promise<AuthResult> {
  const session = readSession()?.session;
  if (!session) return { ok: false, error: 'You are not signed in.' };

  const accounts = loadAccounts();
  const account = findById(accounts, session.userId);
  if (!account) return { ok: false, error: 'You are not signed in.' };

  if (!(await verifyPassword(currentPassword, account.password, onProgress))) {
    return { ok: false, error: 'That is not your current password.', field: 'password' };
  }

  const error = checkPassword(nextPassword);
  if (error) return { ok: false, error, field: 'confirm' };
  if (nextPassword === currentPassword) {
    return { ok: false, error: 'That is the password you already have.', field: 'confirm' };
  }

  account.password = await hashPassword(nextPassword, onProgress);
  saveAccounts(accounts);
  // A new password means a new session token, so anything holding the old one
  // is no longer a way in.
  startSession(account, session.remember);
  announce();
  return { ok: true, account: publicView(account) };
}

export async function setRecovery(
  question: string,
  answer: string,
  onProgress?: Progress,
): Promise<AuthResult> {
  if (!question.trim()) return { ok: false, error: 'Pick a question.' };
  if (answer.trim().length < 2) return { ok: false, error: 'Give a longer answer.', field: 'answer' };

  const session = readSession()?.session;
  if (!session) return { ok: false, error: 'You are not signed in.' };

  const accounts = loadAccounts();
  const account = findById(accounts, session.userId);
  if (!account) return { ok: false, error: 'You are not signed in.' };

  account.recovery = {
    question: question.trim(),
    answer: await hashPassword(normaliseAnswer(answer), onProgress),
  };
  saveAccounts(accounts);
  announce();
  return { ok: true, account: publicView(account) };
}

/** Case and stray spaces should not be the thing standing between you and your account. */
function normaliseAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function recoveryQuestionFor(email: string): string | null {
  const account = findByEmail(loadAccounts(), email);
  return account?.recovery?.question ?? null;
}

/**
 * The local stand-in for a reset email: answer the question you set, choose a
 * new password, and you are signed in on the new one.
 */
export async function resetWithRecovery(
  email: string,
  answer: string,
  nextPassword: string,
  onProgress?: Progress,
): Promise<AuthResult> {
  const accounts = loadAccounts();
  const account = findByEmail(accounts, email);
  if (!account?.recovery) {
    return { ok: false, error: 'That account has no recovery question set.', field: 'email' };
  }

  const waitMs = lockoutRemaining(email);
  if (waitMs > 0) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)} seconds.`,
      field: 'answer',
    };
  }

  const good = await verifyPassword(normaliseAnswer(answer), account.recovery.answer, onProgress);
  if (!good) {
    recordFailure(email);
    return { ok: false, error: 'That is not the answer we have on file.', field: 'answer' };
  }

  const error = checkPassword(nextPassword);
  if (error) return { ok: false, error, field: 'password' };

  account.password = await hashPassword(nextPassword, onProgress);
  account.lastSignInAt = Date.now();
  saveAccounts(accounts);
  clearFailures(email);
  startSession(account, true);
  announce();
  return { ok: true, account: publicView(account) };
}

/** Removes the account and everything filed under it, then signs out. */
export async function deleteAccount(password: string, onProgress?: Progress): Promise<AuthResult> {
  const session = readSession()?.session;
  if (!session) return { ok: false, error: 'You are not signed in.' };

  const accounts = loadAccounts();
  const account = findById(accounts, session.userId);
  if (!account) return { ok: false, error: 'You are not signed in.' };

  if (!(await verifyPassword(password, account.password, onProgress))) {
    return { ok: false, error: 'Wrong password — nothing has been deleted.', field: 'password' };
  }

  saveAccounts(accounts.filter((a) => a.id !== account.id));
  clearFailures(account.email);
  clearSession();
  announce();
  return { ok: true, account: publicView(account) };
}

/** Surfaced in Settings so a device that cannot save is never a silent failure. */
export const canPersist = storageIsPersistent;

// Seeded once everything above is defined. Without this, a visit that starts
// with a restored session would see the first sign-out as "null to null" and
// tell nobody.
announcedUserId = currentUser()?.id ?? null;

export type { PasswordRecord, Preferences, PublicAccount };
