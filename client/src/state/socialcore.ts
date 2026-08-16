import {
  hashString,
  ladderRivals,
  onlineRank,
  generateOpponent,
  Rng,
  type LadderRival,
  type SimPlayerConfig,
  type SocialNotice,
  type SocialState,
} from '@hoops/shared';

/**
 * The Online hub's people, built on the same honest fiction as the
 * leaderboard: there is no server, and the game does not pretend otherwise —
 * the users you can search for ARE the ladder's ninety rivals, they come
 * online and go offline on their own schedule, answer friend requests on
 * their own time, and when you finally play one, they walk out as the build
 * their ladder standing says they have. One world, one cast.
 *
 * Everything in this file is pure over its arguments (no store, no DOM), so
 * the whole request lifecycle runs under a fake clock in tests.
 */

// ------------------------------------------------------------------ presence

/**
 * Whether a rival is online right now. Seeded by the hour, so the list
 * changes over an evening but never flickers while you watch it: the same
 * player is online for the whole hour or not at all. The best players are
 * online more — they got that good somehow.
 */
export function isOnline(rival: LadderRival, now = Date.now()): boolean {
  const hour = Math.floor(now / 3_600_000);
  const standing = onlineRank(rival.points).tier.id;
  const base = standing === 'bronze' || standing === 'silver' ? 42 : 58;
  return hashString(`presence-${rival.id}-${hour}`) % 100 < base;
}

/** Every user the search can find, best first. */
export function allUsers(): LadderRival[] {
  return ladderRivals();
}

export function userByName(name: string): LadderRival | undefined {
  return ladderRivals().find((r) => r.name.toLowerCase() === name.toLowerCase());
}

export function userById(id: string): LadderRival | undefined {
  return ladderRivals().find((r) => r.id === id);
}

// ------------------------------------------------------------------- requests

/** How long a rival takes to answer a friend request: 20 to 80 seconds. */
export function replyDelay(id: string, sentAt: number): number {
  return 20_000 + (hashString(`reply-${id}-${sentAt}`) % 60_000);
}

/** Almost everyone says yes. A few of the very best leave you on read. */
export function willAccept(rival: LadderRival): boolean {
  const top = onlineRank(rival.points).tier.id === 'grandchamp';
  return hashString(`answer-${rival.id}`) % 100 < (top ? 60 : 92);
}

/**
 * Settles everything whose moment has passed: outgoing requests get their
 * answers, and now and then somebody out there sends YOU one — at most one a
 * day, deterministic per day, so reloading is not a way to farm friends.
 *
 * Returns true when something changed, so callers know to persist.
 */
export function settleSocial(social: SocialState, userId: string, now: number): boolean {
  let changed = false;

  // Answers to your requests.
  const still: typeof social.outgoing = [];
  for (const req of social.outgoing) {
    if (now < req.resolvesAt) {
      still.push(req);
      continue;
    }
    changed = true;
    const rival = userById(req.id);
    const accepted = rival ? willAccept(rival) : true;
    if (accepted && !social.friends.some((f) => f.id === req.id)) {
      social.friends.push({ id: req.id, name: req.name, since: req.resolvesAt });
    }
    social.notices.unshift({
      id: `n-${req.id}-${req.resolvesAt}`,
      kind: accepted ? 'accepted' : 'declined',
      name: req.name,
      at: req.resolvesAt,
      read: false,
    });
  }
  if (still.length !== social.outgoing.length) social.outgoing = still;

  // Somebody may reach out to you.
  const day = Math.floor(now / 86_400_000);
  const alreadyToday = social.notices.some((n) => n.kind === 'request' && Math.floor(n.at / 86_400_000) === day);
  if (!alreadyToday && social.incoming.length < 2 && hashString(`knock-${userId}-${day}`) % 100 < 55) {
    const known = new Set([
      ...social.friends.map((f) => f.id),
      ...social.outgoing.map((r) => r.id),
      ...social.incoming.map((r) => r.id),
    ]);
    const pool = ladderRivals().filter((r) => !known.has(r.id));
    if (pool.length > 0) {
      const pick = pool[hashString(`who-${userId}-${day}`) % pool.length];
      social.incoming.push({ id: pick.id, name: pick.name, sentAt: now, resolvesAt: now });
      social.notices.unshift({ id: `n-in-${pick.id}-${day}`, kind: 'request', name: pick.name, at: now, read: false });
      changed = true;
    }
  }

  // The feed does not grow forever.
  if (social.notices.length > 30) {
    social.notices = social.notices.slice(0, 30);
    changed = true;
  }
  return changed;
}

export function noticeLine(n: SocialNotice): string {
  switch (n.kind) {
    case 'accepted':
      return `${n.name} accepted your friend request`;
    case 'declined':
      return `${n.name} declined your friend request`;
    case 'request':
      return `${n.name} sent you a friend request`;
  }
}

// -------------------------------------------------------------------- players

/**
 * The build a rival brings to the floor: generated from their ladder overall,
 * seeded by their identity — so HoopKing23 is the same player every time you
 * meet him, tonight and next week.
 */
export function rivalConfig(rival: LadderRival): SimPlayerConfig {
  const cfg = generateOpponent(rival.overall, hashString(`build-${rival.id}-${rival.name}`));
  return { ...cfg, id: `online-${rival.id}`, name: rival.name, winStreak: rival.streak };
}

/**
 * The CPU sharpness a rival plays with, from their ladder points — the same
 * shape as the ranked ladder's bands, so Gold feels like Gold whether you met
 * them in ranked or invited them yourself.
 */
export function rivalDifficulty(rival: LadderRival): 'rookie' | 'semiPro' | 'pro' | 'allStar' | 'superstar' | 'hallOfFame' {
  const tier = onlineRank(rival.points).tier.id;
  switch (tier) {
    case 'bronze':
      return 'semiPro';
    case 'silver':
      return 'pro';
    case 'gold':
      return 'allStar';
    case 'platinum':
      return 'superstar';
    default:
      return 'hallOfFame';
  }
}

/**
 * Quick match: who is playing right now, near the given standing. The pick
 * rotates minute to minute — a queue, not a rolodex.
 */
export function pickQuickMatch(myRp: number, userId: string, now: number): LadderRival {
  const online = ladderRivals().filter((r) => isOnline(r, now));
  const pool = (online.length > 0 ? online : ladderRivals())
    .slice()
    .sort((a, b) => Math.abs(a.points - myRp) - Math.abs(b.points - myRp))
    .slice(0, 10);
  const rng = new Rng(hashString(`queue-${userId}-${Math.floor(now / 60_000)}`));
  return pool[rng.int(0, pool.length)];
}
