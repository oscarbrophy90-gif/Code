import { worldLadder, type WorldBuild } from '@hoops/shared';

import { allAccounts, loadRegistry, worldEpoch, type AccountBuild, type AccountSummary } from './accounts.ts';

/**
 * The leaderboard: the ranked world and the people who play on this copy, on one
 * board.
 *
 * There is one ordering rule and it is the only one that matters — more wins is
 * a higher place. Since the rank *is* the win count, that means a higher rank is
 * always a higher position, and a Gold 1 can never be listed under a Silver 3.
 *
 * The world plays while you are away. `worldEpoch` is when this device first saw
 * the ladder, so the elapsed time handed to `worldLadder` is real time and the
 * board you come back to has moved on without you.
 */

export interface BoardEntry {
  id: string;
  username: string;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  lifetimeWins: number;
  /** true for an account on this device, false for a world player */
  real: boolean;
  builds: AccountBuild[];
  /** 1-based place on the merged board */
  position: number;
}

/** How long the world's standings are held before they are worked out again. */
const REFRESH_MS = 60_000;

let cache: { key: string; board: BoardEntry[] } | null = null;

export function worldElapsedMs(now = Date.now()): number {
  return Math.max(0, now - worldEpoch());
}

/**
 * The whole board, best first.
 *
 * Recomputed at most once a minute, or whenever a local account's record moves —
 * six hundred players re-sorted on every keystroke of a rerender is work nobody
 * asked for, and a board that lags a win behind is a board that looks broken.
 */
export function fullBoard(): BoardEntry[] {
  const mine = allAccounts(true);
  const elapsed = worldElapsedMs();
  const key = `${Math.floor(elapsed / REFRESH_MS)}|${mine.map((a) => `${a.id}:${a.wins}:${a.losses}`).join(',')}`;
  if (cache && cache.key === key) return cache.board;

  const entries: BoardEntry[] = [];

  for (const p of worldLadder(elapsed)) {
    entries.push({
      id: p.id,
      username: p.username,
      wins: p.wins,
      losses: p.losses,
      streak: 0,
      bestStreak: p.builds.reduce((m, b) => Math.max(m, b.bestStreak), 0),
      lifetimeWins: p.wins,
      real: false,
      builds: p.builds.map(fromWorldBuild),
      position: 0,
    });
  }

  for (const account of mine) entries.push(fromAccount(account));

  // Wins, then fewer losses, then a real player ahead of a generated one — if
  // you have matched somebody's record exactly, you are the one who actually
  // played the games. Anything after that is by id, purely so the order is
  // stable between renders.
  entries.sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      Number(b.real) - Number(a.real) ||
      a.id.localeCompare(b.id),
  );
  entries.forEach((e, i) => {
    e.position = i + 1;
  });

  cache = { key, board: entries };
  return entries;
}

function fromAccount(account: AccountSummary): BoardEntry {
  return {
    id: account.id,
    username: account.username,
    wins: account.wins,
    losses: account.losses,
    streak: account.streak,
    bestStreak: account.bestStreak,
    lifetimeWins: account.lifetimeWins,
    real: true,
    builds: account.builds,
    position: 0,
  };
}

/**
 * A world player's build in the same shape a real one uses.
 *
 * The world stores a green rate rather than the two counts, because it never
 * shot a ball; the card wants a percentage, so the counts are reconstituted at
 * a plausible nine timed attempts a game.
 */
function fromWorldBuild(build: WorldBuild): AccountBuild {
  const attempts = Math.round(build.games * 9);
  return {
    name: build.name,
    position: build.position,
    heightIn: build.heightIn,
    weightLb: build.weightLb,
    overall: build.overall,
    games: build.games,
    wins: build.wins,
    losses: Math.max(0, build.games - build.wins),
    points: build.points,
    rebounds: build.rebounds,
    assists: build.assists,
    steals: build.steals,
    blocks: build.blocks,
    greens: Math.round(attempts * build.greenRate),
    attempts,
    bestStreak: build.bestStreak,
  };
}

/**
 * Where an account sits on the board, 1-based, or null before its first ranked
 * match.
 *
 * Read off the same ordering the board renders, so the number on the badge and
 * the number on the row can never disagree.
 */
export function boardPositionOf(id: string): number | null {
  const at = fullBoard().findIndex((e) => e.real && e.id === id);
  return at < 0 ? null : at + 1;
}

/** How many players are on the board altogether. */
export function boardSize(): number {
  return fullBoard().length;
}

/** How many local accounts have played a ranked match. */
export function localBoardSize(): number {
  return allAccounts(true).length;
}

/** Whether a name is spoken for, on this device or out in the world. */
export function nameTaken(name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  if (allAccounts().some((a) => a.id !== exceptId && a.username.toLowerCase() === wanted)) return true;
  return worldLadder(0).some((p) => p.username.toLowerCase() === wanted);
}

/** Forces the next read to rebuild — used after a ranked result is recorded. */
export function invalidateBoard(): void {
  cache = null;
}

/** Kept so the epoch is stamped the first time anything asks for the board. */
export function ensureWorldEpoch(): void {
  loadRegistry();
}
