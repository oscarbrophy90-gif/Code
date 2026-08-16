import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stepGait, type GaitSample } from '../src/render/players.ts';

/**
 * The walk cycle.
 *
 * The stride is measured from ground actually covered between frames, which
 * only works if "between frames" means the same player twice. The 3v3 squads
 * jogged on the spot because the renderer cached stride state per *team*, so
 * three players shared one entry and each read a teammate's position as his
 * own previous one.
 */

/** Runs a player standing perfectly still for a while. */
function standStill(seconds: number, x = 4, z = 20): GaitSample {
  let s: GaitSample | undefined;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) s = stepGait(s, x, z, t, 0, 0);
  return s!;
}

test('a player standing still settles to no stride', () => {
  const s = standStill(1.5);
  assert.ok(s.amplitude < 0.02, `standing amplitude was ${s.amplitude.toFixed(3)}`);
});

test('a player running strides at full amplitude', () => {
  let s: GaitSample | undefined;
  const dt = 1 / 60;
  let x = 0;
  for (let t = 0; t < 1.5; t += dt) {
    x += 16 * dt; // a real sprint
    s = stepGait(s, x, 20, t, 16, 0);
  }
  assert.ok(s!.amplitude > 0.9, `sprinting amplitude was ${s!.amplitude.toFixed(3)}`);
});

test('three teammates standing apart each keep their own stride', () => {
  // The exact shape of the bug: one shared cache, three players, one frame.
  // Each player is stationary; only the key tells them apart.
  const spots = [
    { pid: 0, x: -14, z: 22 },
    { pid: 1, x: 0, z: 8 },
    { pid: 2, x: 16, z: 25 },
  ];

  const perPlayer = new Map<number, GaitSample>();
  const dt = 1 / 60;
  for (let t = 0; t < 1.5; t += dt) {
    for (const s of spots) {
      perPlayer.set(s.pid, stepGait(perPlayer.get(s.pid), s.x, s.z, t, 0, s.pid * 2));
    }
  }
  for (const s of spots) {
    const g = perPlayer.get(s.pid)!;
    assert.ok(g.amplitude < 0.02, `pid ${s.pid} standing amplitude was ${g.amplitude.toFixed(3)}`);
  }

  // And the same three through ONE shared entry — the old team-keyed cache.
  // This is what the squad actually looked like: legs churning at full tilt
  // while every one of them stood still.
  let shared: GaitSample | undefined;
  for (let t = 0; t < 1.5; t += dt) {
    for (const s of spots) shared = stepGait(shared, s.x, s.z, t, 0, 0);
  }
  assert.ok(
    shared!.amplitude > 0.9,
    `a shared cache should churn — it measured ${shared!.amplitude.toFixed(3)}, so this test no longer proves anything`,
  );
});

test('a stepback strides on ground covered even with no velocity', () => {
  // Displacement without velocity: the legs must still move.
  let s: GaitSample | undefined = standStill(0.5, 0, 20);
  const dt = 1 / 60;
  let z = 20;
  for (let t = 0.5; t < 0.85; t += dt) {
    z += 9 * dt;
    s = stepGait(s, 0, z, t, 0, 0); // speed reported as zero on purpose
  }
  assert.ok(s!.amplitude > 0.5, `stepback amplitude was ${s!.amplitude.toFixed(3)}`);
});

test('a teleport advances the cycle no more than a sprint does', () => {
  const settled = standStill(1, 0, 20);
  const nextFrame = settled.at + 1 / 60;

  // An inbound: the player is moved 30 feet between two frames.
  const ported = stepGait(settled, 0, 50, nextFrame, 0, 0);
  // The same frame, but genuinely sprinting flat out.
  const sprinted = stepGait(settled, 0, 20 + 26 / 60, nextFrame, 26, 0);

  const portedStep = Math.abs(ported.phase - settled.phase);
  const sprintStep = Math.abs(sprinted.phase - settled.phase);
  assert.ok(
    portedStep <= sprintStep + 1e-9,
    `a 30ft teleport advanced ${portedStep.toFixed(3)} rad vs a sprint's ${sprintStep.toFixed(3)}`,
  );
  // And that ceiling is a stride, not a blur.
  assert.ok(portedStep < 0.4, `one frame advanced the cycle by ${portedStep.toFixed(3)} rad`);
});
