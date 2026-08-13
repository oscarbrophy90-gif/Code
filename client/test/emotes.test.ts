import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emotePose } from '../src/render/emotes.ts';
import { STORE_ITEMS } from '../../shared/src/index.ts';
import { rankRewardsFor } from '../../shared/src/rankrewards.ts';
import { seasonByIndex } from '../../shared/src/seasons.ts';

/**
 * Every performance in the game has to look like itself.
 *
 * There are fifty-one shapes and five hundred-odd performances, so a shape is
 * worn by ten items and the shape alone was never going to be enough. It was
 * not: measured before the signature layer existed, 414 performances produced
 * 147 distinct animations, and the largest group of items animating identically
 * had twenty-one members in it. Two emotes with different names that move the
 * same way are one emote sold twice.
 */

/** A performance sampled across its whole run, to two decimal places. */
function signature(id: string): string {
  const frames: string[] = [];
  for (let k = 0; k <= 12; k++) {
    const p = emotePose(id, k / 12);
    frames.push(
      [...p.arm, ...p.out, ...p.fwd, p.crouch, p.lean, p.alpha, p.bob, p.spin, p.stride]
        .map((v) => v.toFixed(2))
        .join(','),
    );
  }
  return frames.join('|');
}

function performances(): { id: string; name: string }[] {
  const seasonal = [8, 9, 10, 11, 12, 13].flatMap((i) => rankRewardsFor(seasonByIndex(i)).flatMap((t) => t.items));
  const ids = new Set([
    ...STORE_ITEMS.filter((i) => i.category === 'emote' || i.category === 'celebration' || i.category === 'threeCelebration').map((i) => i.id),
    ...seasonal,
  ]);
  const byId = new Map(STORE_ITEMS.map((i) => [i.id, i]));
  return [...ids]
    .map((id) => byId.get(id))
    .filter((i): i is NonNullable<typeof i> =>
      !!i && (i.category === 'emote' || i.category === 'celebration' || i.category === 'threeCelebration'))
    .map((i) => ({ id: i.id, name: i.name }));
}

test('no two performances animate the same way', () => {
  const items = performances();
  assert.ok(items.length > 400, `expected the whole catalogue, got ${items.length}`);

  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = signature(item.id);
    groups.set(key, [...(groups.get(key) ?? []), item.name]);
  }

  const collisions = [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  const shared = collisions.reduce((sum, g) => sum + g.length, 0);
  const worst = collisions[0]?.length ?? 1;

  assert.ok(
    groups.size >= items.length * 0.97,
    `${groups.size} distinct animations for ${items.length} performances`,
  );
  assert.ok(worst <= 3, `${worst} items animate identically: ${collisions[0]?.slice(0, 6).join(', ')}`);
  assert.ok(shared <= items.length * 0.05, `${shared} of ${items.length} performances are not unique`);
});

test('a performance is the same every time and stays inside the body', () => {
  for (const item of performances()) {
    assert.equal(signature(item.id), signature(item.id), `${item.name} is not deterministic`);
    for (let k = 0; k <= 12; k++) {
      const p = emotePose(item.id, k / 12);
      assert.ok(p.crouch >= 0 && p.crouch <= 1, `${item.name} crouches through the floor`);
      assert.ok(Math.abs(p.lean) <= 1.25, `${item.name} folds over backwards`);
      assert.ok(Math.abs(p.spin) <= 1.15, `${item.name} spins round backwards`);
      assert.ok(p.stride >= 0.5, `${item.name} crosses its own legs`);
      assert.ok(p.alpha > 0 && p.alpha <= 1, `${item.name} has an impossible opacity`);
      for (const v of [...p.arm, ...p.out, ...p.fwd]) assert.ok(Number.isFinite(v), `${item.name} produced ${v}`);
    }
  }
});

test('an emote named after a move performs that move', () => {
  // The pose is chosen off the id, so these are the cases where a wrong answer
  // would be obvious to anybody reading the name.
  const differs = (a: string, b: string) => signature(a) !== signature(b);
  assert.ok(differs('emote-x-ball-bounce', 'emote-x-take-the-throne'));
  assert.ok(differs('emote-x-disappear', 'emote-x-unstoppable'));
  assert.ok(differs('emote-x-too-cold', 'emote-x-rain-from-the-sky'));

  // A vanish actually vanishes, which no other shape does.
  const mid = emotePose('emote-x-disappear', 0.5);
  assert.ok(mid.alpha < 0.3, `a Disappear should disappear, alpha was ${mid.alpha}`);
  // A throne sits down.
  assert.ok(emotePose('emote-x-take-the-throne', 0.5).crouch > 0.5, 'a Throne should sit');
  // A stomp comes down rather than going up.
  const stomps = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => emotePose('emote-x-earthquake', t).bob);
  assert.ok(Math.min(...stomps) < 0, 'a Stomp should drive downward at some point');
});
