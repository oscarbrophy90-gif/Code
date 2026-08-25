import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ATTRIBUTE_KEYS, MIN_ATTRIBUTE, computeCaps } from '../src/index.ts';
import {
  ATTRIBUTE_KEYS as JS_KEYS,
  MIN_ATTRIBUTE as JS_MIN,
  clampAttributes,
  clampPhysicalBuild,
} from '../src/buildrules.js';

/**
 * The rules a build has to obey, and the reason the server can trust them.
 *
 * `buildrules.js` is plain JavaScript so the Node server can import the very
 * same caps the creator enforces. The price of that is one duplicated list —
 * the attribute keys — and the first test here is what makes that price safe.
 */

test('the attribute list the server checks is the attribute list the game uses', () => {
  assert.deepEqual([...JS_KEYS].sort(), [...ATTRIBUTE_KEYS].sort(), 'buildrules.js has drifted from types.ts');
  assert.equal(JS_MIN, MIN_ATTRIBUTE);
});

test('there is one caps implementation, and the game and the server share it', () => {
  const build = { position: 'SG' as const, heightIn: 77, weightLb: 205, wingspanIn: 82, jerseyNumber: 3 };
  const caps = computeCaps(build);
  const { attrs } = clampAttributes(caps, build);
  // Feeding the caps back in must change nothing: they are already legal.
  for (const key of ATTRIBUTE_KEYS) assert.equal(attrs[key], caps[key], key);
});

test('a 99-in-everything claim is cut down to what the body can hold', () => {
  const cheat = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 99]));
  const guard = clampPhysicalBuild({ position: 'PG', heightIn: 72, weightLb: 180, wingspanIn: 74 }).build;
  const centre = clampPhysicalBuild({ position: 'C', heightIn: 88, weightLb: 275, wingspanIn: 95 }).build;

  const g = clampAttributes(cheat, guard);
  const c = clampAttributes(cheat, centre);

  // Neither body gets everything, and they lose different things.
  assert.ok(g.notes.length > 0, 'a 99 sweep on a guard must be corrected');
  assert.ok(c.notes.length > 0, 'a 99 sweep on a centre must be corrected');
  assert.ok(g.attrs.interiorDefense < 70, `a 6ft guard cannot anchor the paint (${g.attrs.interiorDefense})`);
  assert.ok(g.attrs.strength < 70, `or bully anyone (${g.attrs.strength})`);
  assert.ok(c.attrs.threePoint < 75, `a 7ft4 centre cannot shoot the lights out (${c.attrs.threePoint})`);
  assert.ok(c.attrs.speedWithBall < 75, `or handle like a guard (${c.attrs.speedWithBall})`);
  // And what each DOES keep is genuine: the guard shoots, the centre defends.
  assert.ok(g.attrs.threePoint > c.attrs.threePoint);
  assert.ok(c.attrs.interiorDefense > g.attrs.interiorDefense);
});

test('every position, at every legal height, refuses a full sweep somewhere', () => {
  const cheat = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 99]));
  for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
    for (let heightIn = 66; heightIn <= 92; heightIn += 2) {
      const { build } = clampPhysicalBuild({ position, heightIn, weightLb: 220, wingspanIn: heightIn + 4 });
      const { attrs } = clampAttributes(cheat, build);
      const maxed = ATTRIBUTE_KEYS.filter((k) => attrs[k] >= 99).length;
      assert.ok(maxed < ATTRIBUTE_KEYS.length, `${position} ${heightIn}" got everything`);
      for (const key of ATTRIBUTE_KEYS) {
        assert.ok(attrs[key] >= MIN_ATTRIBUTE && attrs[key] <= 99, `${position} ${heightIn}" ${key}=${attrs[key]}`);
      }
    }
  }
});

test('an impossible body is corrected rather than believed', () => {
  const silly = clampPhysicalBuild({ position: 'PG', heightIn: 200, weightLb: 9000, wingspanIn: 400 });
  assert.ok(silly.build.heightIn <= 78, 'a point guard is not seventeen feet tall');
  assert.ok(silly.build.weightLb < 400);
  assert.ok(silly.build.wingspanIn <= silly.build.heightIn + 9);
  assert.ok(silly.notes.length >= 3, 'and it says what it corrected');

  // Junk, missing fields and hostile types all land on a playable build.
  for (const junk of [null, undefined, {}, { position: 'GOAT' }, { heightIn: NaN, weightLb: 'lots' }]) {
    const { build } = clampPhysicalBuild(junk);
    assert.ok(['PG', 'SG', 'SF', 'PF', 'C'].includes(build.position));
    assert.ok(Number.isFinite(build.heightIn) && Number.isFinite(build.weightLb) && Number.isFinite(build.wingspanIn));
    const { attrs } = clampAttributes(junk, build);
    for (const key of ATTRIBUTE_KEYS) assert.ok(Number.isFinite(attrs[key]), `${key} must be a number`);
  }
});

test('a legitimate build passes through untouched', () => {
  for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
    const range = { PG: 74, SG: 77, SF: 80, PF: 82, C: 85 }[position];
    const build = { position, heightIn: range, weightLb: 215, wingspanIn: range + 4, jerseyNumber: 1 };
    const legal = computeCaps(build);
    const { notes } = clampAttributes(legal, build);
    assert.equal(notes.length, 0, `${position} at its own caps should need no correction: ${notes.join(', ')}`);
  }
});
