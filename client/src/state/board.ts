import { allAccounts, type AccountBuild } from './accounts.ts';
import { online, type BoardRow } from '../net/online.ts';
import { store } from './store.ts';

/**
 * The leaderboard.
 *
 * Real players only. Everybody on it created a username and finished a ranked
 * match against another person on this server — nothing is generated to pad it
 * out, so a short board means few people have played rather than that the game
 * is hiding something.
 *
 * The server owns it, because the server is the only thing that saw both halves
 * of every match. This module is a cache in front of it: the board is fetched
 * over plain HTTP rather than the socket so it can be read without queueing for
 * a game, and the last copy is kept so the screen has something to draw while
 * the next one is in flight.
 */

export interface BoardEntry extends BoardRow {
  /** true when this row is the account playing on this device */
  me: boolean;
}

/** Builds shown on a player card. Only ever available for local accounts. */
export interface LocalBuilds {
  username: string;
  builds: AccountBuild[];
}

const STALE_MS = 20_000;

let rows: BoardEntry[] = [];
let fetchedAt = 0;
let inFlight: Promise<BoardEntry[]> | null = null;
let lastError = '';

export function boardError(): string {
  return lastError;
}

/** The last board we were given, without going to the network. */
export function cachedBoard(): BoardEntry[] {
  return rows;
}

/**
 * The board, from the server.
 *
 * `force` skips the staleness check, for the refresh button. Failures leave the
 * previous board in place rather than blanking the screen — a stale board is
 * more use than an empty one, as long as the screen says which it is.
 */
export async function fetchBoard(force = false): Promise<BoardEntry[]> {
  if (!force && rows.length > 0 && Date.now() - fetchedAt < STALE_MS) return rows;
  if (inFlight) return inFlight;

  const url = `${online.address.replace(/\/$/, '')}/leaderboard`;
  inFlight = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const body = (await res.json()) as { players?: BoardRow[] };
      const mine = store.profile.username.toLowerCase();
      rows = (body.players ?? []).map((row) => ({ ...row, me: row.username.toLowerCase() === mine }));
      fetchedAt = Date.now();
      lastError = '';
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Could not reach the server';
    } finally {
      inFlight = null;
    }
    return rows;
  })();
  return inFlight;
}

/** Forces the next read to go to the network — used after a ranked result. */
export function invalidateBoard(): void {
  fetchedAt = 0;
}

/**
 * Where this account sits, or null before its first ranked match.
 *
 * The server sends your placement with your record, which is authoritative and
 * costs nothing. The cached board is the fallback for a screen drawn before the
 * first record has arrived.
 */
export function boardPositionOf(_accountId: string): number | null {
  if (online.record?.position != null) return online.record.position;
  const mine = store.profile.username.toLowerCase();
  const at = rows.findIndex((r) => r.username.toLowerCase() === mine);
  if (at >= 0) return at + 1;
  // Never played online: no standing to show.
  return store.profile.online.wins + store.profile.online.losses > 0 ? null : null;
}

/** How many people are on the board. */
export function boardSize(): number {
  return online.record?.boardSize ?? rows.length;
}

/**
 * Whether a username is taken by another account on this device.
 *
 * Only local: the server has no reservation system, and blocking a name because
 * a stranger somewhere has it would be a worse first-run experience than two
 * people sharing one. The board shows both.
 */
export function nameTaken(name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return allAccounts().some((a) => a.id !== exceptId && a.username.toLowerCase() === wanted);
}

/** The builds behind a username, when that username plays on this device. */
export function localBuildsFor(username: string): AccountBuild[] {
  const wanted = username.toLowerCase();
  return allAccounts().find((a) => a.username.toLowerCase() === wanted)?.builds ?? [];
}
