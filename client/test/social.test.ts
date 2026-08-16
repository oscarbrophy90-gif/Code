import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ladderRivals, type SocialState } from '@hoops/shared';
import {
  isOnline,
  pickQuickMatch,
  replyDelay,
  rivalConfig,
  rivalDifficulty,
  settleSocial,
  userByName,
  willAccept,
} from '../src/state/socialcore.ts';

/**
 * The Online hub's social lifecycle, run under a fake clock.
 *
 * The world is the ladder's rivals — the same cast as the leaderboard — and
 * everything is deterministic per seed: requests resolve when their moment
 * passes, not when the screen happens to be open, and reloading is never a
 * way to farm outcomes.
 */

function fresh(): SocialState {
  return { friends: [], outgoing: [], incoming: [], notices: [] };
}

test('a friend request is answered after a delay, and the answer lands in the feed', () => {
  const rival = ladderRivals().find((r) => willAccept(r))!;
  const social = fresh();
  const sentAt = 1_000_000_000_000;
  const resolvesAt = sentAt + replyDelay(rival.id, sentAt);
  social.outgoing.push({ id: rival.id, name: rival.name, sentAt, resolvesAt });

  // Too early: nothing happens, however often it is asked.
  assert.equal(settleSocial(social, 'u1', resolvesAt - 1), false);
  assert.equal(social.friends.length, 0);
  assert.equal(social.outgoing.length, 1);

  // The moment passes: friend added, request gone, notice unread on top.
  assert.equal(settleSocial(social, 'u1', resolvesAt + 1), true);
  assert.equal(social.friends.length, 1);
  assert.equal(social.friends[0].id, rival.id);
  assert.equal(social.outgoing.length, 0);
  const notice = social.notices.find((n) => n.kind === 'accepted' && n.name === rival.name);
  assert.ok(notice && !notice.read, 'the acceptance must arrive as an unread notification');

  // Settling again is idempotent — no duplicate friends, no duplicate notices.
  const notices = social.notices.length;
  settleSocial(social, 'u1', resolvesAt + 60_000);
  assert.equal(social.friends.length, 1);
  assert.ok(social.notices.length <= notices + 1, 'no duplicate acceptance notices');
});

test('a snubbed request declines instead of silently disappearing', () => {
  const snob = ladderRivals().find((r) => !willAccept(r));
  assert.ok(snob, 'somebody on the ladder leaves requests on read');
  const social = fresh();
  const sentAt = 1_000_000_000_000;
  social.outgoing.push({ id: snob!.id, name: snob!.name, sentAt, resolvesAt: sentAt + 1 });
  settleSocial(social, 'u1', sentAt + 10);
  assert.equal(social.friends.length, 0);
  assert.ok(social.notices.some((n) => n.kind === 'declined'), 'the decline is a notification too');
});

test('incoming requests arrive at most once a day and never from an existing friend', () => {
  // Find a user id whose day-roll knocks, then check the rules around it.
  const day = 20_000; // an arbitrary fixed day bucket
  const now = day * 86_400_000 + 5_000;
  let social = fresh();
  let knockedFor: string | null = null;
  for (let i = 0; i < 40 && !knockedFor; i++) {
    social = fresh();
    settleSocial(social, `user-${i}`, now);
    if (social.incoming.length > 0) knockedFor = `user-${i}`;
  }
  assert.ok(knockedFor, 'somebody gets a knock on this day');
  assert.equal(social.incoming.length, 1);
  assert.ok(social.notices.some((n) => n.kind === 'request'), 'the knock is announced in the feed');

  // The same day never knocks twice, no matter how often it is settled.
  settleSocial(social, knockedFor!, now + 60_000);
  settleSocial(social, knockedFor!, now + 3_600_000);
  assert.equal(social.incoming.length, 1, 'one knock per day');

  // And the sender is never somebody already on the friends list.
  const sender = social.incoming[0];
  assert.ok(!social.friends.some((f) => f.id === sender.id));
});

test('presence is stable within the hour and the same rival is the same build every time', () => {
  const rival = ladderRivals()[10];
  const hourStart = 3_700_000 * 3_600_000;
  const a = isOnline(rival, hourStart + 60_000);
  const b = isOnline(rival, hourStart + 3_500_000);
  assert.equal(a, b, 'presence must not flicker inside an hour');

  const c1 = rivalConfig(rival);
  const c2 = rivalConfig(rival);
  assert.equal(c1.name, rival.name);
  assert.deepEqual(c1.attrs, c2.attrs, 'the build is stable across meetings');
  assert.ok(['rookie', 'semiPro', 'pro', 'allStar', 'superstar', 'hallOfFame'].includes(rivalDifficulty(rival)));
});

test('quick match finds somebody near your standing', () => {
  const now = Date.now();
  const rp = 700; // a Gold player
  for (let i = 0; i < 5; i++) {
    const pick = pickQuickMatch(rp, `user-${i}`, now);
    assert.ok(Math.abs(pick.points - rp) < 600, `${pick.name} at ${pick.points} is not near ${rp}`);
  }
});

test('the search finds ladder names case-insensitively', () => {
  const rival = ladderRivals()[3];
  assert.equal(userByName(rival.name.toUpperCase())?.id, rival.id);
  assert.equal(userByName('NobodyByThisName999'), undefined);
});
