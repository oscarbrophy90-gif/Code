import { ladderBoard, type LadderRow } from '@hoops/shared';

import { store } from './store.ts';

/**
 * The leaderboard, offline.
 *
 * Ninety generated rivals with the player spliced in by ranked points. There is
 * no server and nobody else is playing — the board exists to give the ladder a
 * shape, because a rank with nobody around it is a number rather than a
 * position.
 *
 * The rivals are fixed: same names, same records, every launch. A board that
 * reshuffles itself between sessions makes your own movement unreadable, since
 * you can never tell whether you passed somebody or they simply moved. What
 * changes is you — every ranked result moves your points, and you slide past
 * names that stay where they are.
 */

export function board(): LadderRow[] {
  const record = store.profile.online;
  return ladderBoard({
    name: store.profile.username || 'You',
    points: record.rp,
    overall: store.hasPlayer ? store.overall() : 60,
    level: store.hasPlayer ? store.player.level : 1,
    wins: record.wins,
    losses: record.losses,
    streak: record.streak,
  });
}

/** Where the player sits, 1-based. Always a number: you are always on it. */
export function boardPositionOf(_accountId?: string): number | null {
  const row = board().find((r) => r.me);
  return row ? row.position : null;
}

/** How many are on the board, rivals plus you. */
export function boardSize(): number {
  return board().length;
}

/** Kept for the callers that used to invalidate a network cache. */
export function invalidateBoard(): void {
  /* The board is derived on read, so there is nothing to invalidate. */
}

/** Whether a username is taken by another account on this device. */
export function nameTaken(name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return store.accounts().some((a) => a.id !== exceptId && a.username.toLowerCase() === wanted);
}
