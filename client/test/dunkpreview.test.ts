import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recordPackageDunk } from '../src/ui/dunkpreview.ts';
import { generateOpponent } from '../../shared/src/data/opponents.ts';

/**
 * The package preview is the game performing the package. That claim is only
 * worth making if every package can actually be performed — including ones the
 * previewing build could not throw yet — and if the poster mode really ends
 * with a body on the floor.
 */

test('every rarity of package records a real previewable dunk', () => {
  // A deliberately weak build: the preview must raise it to the package gates.
  const weak = generateOpponent(60, 5);
  weak.attrs.dunk = 30;
  weak.attrs.vertical = 32;

  const sample = [
    'basic-slam',
    'dunk-x-two-hand-power-dunk',
    'dunk-x-360-one-hander',
    'dunk-x-540-one-hander',
    'dunk-x-720-spin-dunk',
    'dunk-x-skyline-ascension',
  ];
  for (const id of sample) {
    const frames = recordPackageDunk(weak, id, false);
    assert.ok(frames && frames.length > 40, `${id}: no recording`);
    const states = frames.map((f) => f.players[0].state);
    assert.ok(states.includes('finishing'), `${id}: no flight in the preview`);
    assert.ok(states.includes('rimHang'), `${id}: no hang in the preview`);
    // The recording is of THIS package: the flight carries its id.
    const flightFrame = frames.find((f) => f.players[0].state === 'finishing');
    assert.equal(flightFrame?.players[0].dunk?.packageId, id);
  }
});

test('the poster preview ends with the defender on the floor under the hang', () => {
  const cfg = generateOpponent(75, 9);
  const frames = recordPackageDunk(cfg, 'poster', true);
  assert.ok(frames && frames.length > 40, 'no poster recording');

  let sawHangOverFallen = false;
  for (const f of frames) {
    if (f.players[0].state === 'rimHang' && f.players[1].state === 'fallen') sawHangOverFallen = true;
  }
  assert.ok(sawHangOverFallen, 'the dunker should hang while the defender is down');
});

test('a recording is cached: the same request is the same frames, instantly', () => {
  const cfg = generateOpponent(75, 11);
  const a = recordPackageDunk(cfg, 'basic-slam', false);
  const b = recordPackageDunk(cfg, 'basic-slam', false);
  assert.equal(a, b, 'second call returns the cached recording');
});
