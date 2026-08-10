/**
 * The account records themselves: what one looks like, and how the set of them
 * is read and written. Nothing in here decides whether you may sign in — that
 * is `auth.ts`. This module only knows how to keep the list honest.
 */

import type { PasswordRecord } from './hash.ts';
import { randomId } from './hash.ts';
import { readJSON, writeJSON } from './storage.ts';
import { normaliseEmail } from './validate.ts';

export type Theme = 'system' | 'dark' | 'light';

export type Preferences = {
  theme: Theme;
  accent: string;
  reduceMotion: boolean;
  sounds: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accent: 'violet',
  reduceMotion: false,
  // Off by default. A web page that makes a noise nobody asked for is a bug,
  // however nice the noise is.
  sounds: false,
};

export type Account = {
  id: string;
  /** Lower-cased; this is the one used for lookups and uniqueness. */
  email: string;
  /** Exactly as they typed it, for showing back to them. */
  emailTyped: string;
  name: string;
  password: PasswordRecord;
  /** Emoji or a single letter; the avatar falls back to initials without it. */
  avatar: string;
  createdAt: number;
  lastSignInAt: number;
  preferences: Preferences;
  /**
   * Optional local recovery. With no server there is no reset email, so an
   * account can carry a question whose answer is hashed exactly like a password.
   */
  recovery: { question: string; answer: PasswordRecord } | null;
};

/** What the rest of the app is allowed to see — never the password record. */
export type PublicAccount = Omit<Account, 'password' | 'recovery'> & { hasRecovery: boolean };

const ACCOUNTS_KEY = 'accounts';

export function publicView(account: Account): PublicAccount {
  const { password: _password, recovery, ...rest } = account;
  return { ...rest, hasRecovery: recovery !== null };
}

/**
 * Reads the stored list and drops anything that is not a usable account.
 * A record mangled by a half-finished write should cost that one account, not
 * lock everybody out of the device.
 */
export function loadAccounts(): Account[] {
  const raw = readJSON<unknown>(ACCOUNTS_KEY, []);
  if (!Array.isArray(raw)) return [];

  const out: Account[] = [];
  for (const entry of raw) {
    const a = entry as Partial<Account>;
    if (!a || typeof a !== 'object') continue;
    if (typeof a.id !== 'string' || typeof a.email !== 'string') continue;
    if (!a.password || typeof a.password !== 'object') continue;
    out.push({
      id: a.id,
      email: normaliseEmail(a.email),
      emailTyped: typeof a.emailTyped === 'string' ? a.emailTyped : a.email,
      name: typeof a.name === 'string' && a.name ? a.name : 'Someone',
      password: a.password,
      avatar: typeof a.avatar === 'string' ? a.avatar : '',
      createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
      lastSignInAt: typeof a.lastSignInAt === 'number' ? a.lastSignInAt : 0,
      // Spread over the defaults so a preference added in a later version
      // appears on accounts written by an earlier one.
      preferences: { ...DEFAULT_PREFERENCES, ...(a.preferences ?? {}) },
      recovery: a.recovery ?? null,
    });
  }
  return out;
}

export function saveAccounts(accounts: Account[]): boolean {
  return writeJSON(ACCOUNTS_KEY, accounts);
}

export function findByEmail(accounts: Account[], email: string): Account | undefined {
  const wanted = normaliseEmail(email);
  return accounts.find((a) => a.email === wanted);
}

export function findById(accounts: Account[], id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

export function newAccount(fields: {
  name: string;
  email: string;
  password: PasswordRecord;
}): Account {
  const now = Date.now();
  return {
    id: randomId(),
    email: normaliseEmail(fields.email),
    emailTyped: fields.email.trim(),
    name: fields.name.trim(),
    password: fields.password,
    avatar: '',
    createdAt: now,
    lastSignInAt: now,
    preferences: { ...DEFAULT_PREFERENCES },
    recovery: null,
  };
}

/** "Ada Lovelace" -> "AL". Used when an account has no avatar emoji. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
