import { hashString, type LadderRival } from '@hoops/shared';

/**
 * The party lobby.
 *
 * A session thing, not a save thing: a lobby you were in yesterday is gone,
 * the way a lobby works everywhere else. While a party is up, the rest of the
 * game narrows — Store, Locker, Settings and Controls stay open, and anything
 * that would start a different game asks you to leave the lobby first. That
 * gate lives in `navigate`, driven by `inParty()` and `LOBBY_ROUTES`.
 */

export interface PartyState {
  member: LadderRival;
  /** an invite is out; the friend answers a few seconds later */
  status: 'invited' | 'in';
  invitedAt: number;
  joinsAt: number;
}

let party: PartyState | null = null;
const listeners = new Set<() => void>();

/** Screens that stay reachable while a lobby is up. */
export const LOBBY_ROUTES = ['online', 'store', 'locker', 'settings', 'controls'] as const;

export function inParty(): boolean {
  return party !== null;
}

export function partyState(): PartyState | null {
  return party;
}

export function invite(member: LadderRival, now = Date.now()): void {
  // 3–8 seconds: long enough to be an answer, short enough to not be a wait.
  const delay = 3_000 + (hashString(`join-${member.id}-${now}`) % 5_000);
  party = { member, status: 'invited', invitedAt: now, joinsAt: now + delay };
  emit();
  window.setTimeout(() => {
    if (party && party.member.id === member.id && party.status === 'invited') {
      party = { ...party, status: 'in' };
      emit();
    }
  }, delay + 50);
}

export function leaveParty(): void {
  if (!party) return;
  party = null;
  emit();
}

/** Re-render hooks for the screens that show the lobby. */
export function onPartyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of [...listeners]) fn();
}
