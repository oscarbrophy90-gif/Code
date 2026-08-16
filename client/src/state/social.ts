import { store } from './store.ts';
import { pickQuickMatch, replyDelay, settleSocial, userByName } from './socialcore.ts';
import type { LadderRival } from '@hoops/shared';

export {
  allUsers,
  isOnline,
  noticeLine,
  rivalConfig,
  rivalDifficulty,
  userById,
  userByName,
} from './socialcore.ts';

/**
 * The store-bound half of the Online hub: the pure lifecycle in socialcore
 * run against the live profile, persisted through the store like everything
 * else the player owns.
 */

export type SendResult = 'sent' | 'already-friends' | 'already-pending' | 'not-found';

export function sendFriendRequest(name: string, now = Date.now()): SendResult {
  const rival = userByName(name);
  if (!rival) return 'not-found';
  const social = store.profile.social;
  if (social.friends.some((f) => f.id === rival.id)) return 'already-friends';
  if (social.outgoing.some((r) => r.id === rival.id)) return 'already-pending';

  store.update((p) => {
    p.social.outgoing.push({
      id: rival.id,
      name: rival.name,
      sentAt: now,
      resolvesAt: now + replyDelay(rival.id, now),
    });
  });
  return 'sent';
}

export function acceptIncoming(id: string, now = Date.now()): void {
  store.update((p) => {
    const req = p.social.incoming.find((r) => r.id === id);
    if (!req) return;
    p.social.incoming = p.social.incoming.filter((r) => r.id !== id);
    if (!p.social.friends.some((f) => f.id === id)) {
      p.social.friends.push({ id: req.id, name: req.name, since: now });
    }
  });
}

export function declineIncoming(id: string): void {
  store.update((p) => {
    p.social.incoming = p.social.incoming.filter((r) => r.id !== id);
  });
}

/** Runs the clock against the live profile. Call on entering the Online hub. */
export function tickSocial(now = Date.now()): void {
  const social = store.profile.social;
  const changed = settleSocial(social, store.profile.userId, now);
  if (changed) store.update(() => undefined);
}

/** Unanswered requests plus unread feed items — the badge on the tab. */
export function unreadCount(): number {
  return store.profile.social.notices.filter((n) => !n.read).length + store.profile.social.incoming.length;
}

export function markNoticesRead(): void {
  if (!store.profile.social.notices.some((n) => !n.read)) return;
  store.update((p) => {
    for (const n of p.social.notices) n.read = true;
  });
}

export function findQuickMatch(now = Date.now()): LadderRival {
  return pickQuickMatch(store.profile.online.rp, store.profile.userId, now);
}
