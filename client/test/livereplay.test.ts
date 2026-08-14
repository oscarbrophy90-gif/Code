import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cutToDunk, snapshotFrame, type ReplayFrame } from '../src/ui/livereplay.ts';
import { createMatch, defaultMatchConfig, stepMatch, drainEvents, SIM_DT } from '../../shared/src/sim/match.ts';
import { emptyInput } from '../../shared/src/sim/state.ts';
import { generateOpponent } from '../../shared/src/data/opponents.ts';

/**
 * The replay must be the dunk that happened, which means two things hold: the
 * recorded frames are immune to what the sim does afterwards, and the cut
 * starts before the takeoff and ends with the hang.
 */

test('a recorded frame is history: later sim frames cannot rewrite it', () => {
  const a = generateOpponent(88, 3);
  const b = generateOpponent(80, 4);
  const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false, instantInbound: true }), 99);
  for (let i = 0; i < 300; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const frame = snapshotFrame(state);
  const beforeX = frame.players[0].x;
  const beforeState = frame.players[0].state;
  const beforeBallX = frame.ball.x;

  // Run the sim on: the snapshot must not move with it.
  const drive = { ...emptyInput(), mz: -1, sprint: true };
  for (let i = 0; i < 240; i++) stepMatch(state, [drive, emptyInput()], SIM_DT);

  assert.equal(frame.players[0].x, beforeX);
  assert.equal(frame.players[0].state, beforeState);
  assert.equal(frame.ball.x, beforeBallX);
  // The config is shared by reference on purpose — it never mutates.
  assert.equal(frame.players[0].cfg, state.players[0].cfg);
});

test('the cut covers the drive, the whole flight and every hang frame', () => {
  // Record a real dunk the way the game does: one snapshot per step.
  const a = generateOpponent(90, 7);
  a.attrs.dunk = 95;
  a.attrs.vertical = 95;
  a.attrs.speed = 90;
  a.attrs.speedWithBall = 90;
  a.attrs.acceleration = 90;
  const state = createMatch(a, generateOpponent(70, 8), defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }), 424);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  for (let release = 24; release < 60; release++) {
    const p = state.players[0];
    p.x = 1;
    p.z = 16;
    p.state = 'dribble';
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    const drive = { ...emptyInput(), mz: -1, sprint: true };
    for (let i = 0; i < 40; i++) stepMatch(state, [drive, emptyInput()], SIM_DT);

    const buffer: ReplayFrame[] = [];
    let cued = false;
    for (let i = 0; i < 500 && !cued; i++) {
      stepMatch(state, [i < release ? { ...drive, shoot: true } : drive, emptyInput()], SIM_DT);
      buffer.push(snapshotFrame(state));
      if (buffer.length > 620) buffer.shift();
      for (const e of drainEvents(state)) {
        if (e.type === 'dunkHighlight') cued = true;
      }
    }
    if (!cued) continue;

    const cut = cutToDunk(buffer, 0);
    const states = cut.map((f) => f.players[0].state);
    assert.ok(states.includes('finishing'), 'the cut contains the flight');
    assert.ok(states.includes('rimHang'), 'and the hang');
    assert.ok(states[0] !== 'finishing' && states[0] !== 'rimHang', 'and opens before the takeoff');
    const hangFrames = states.filter((s) => s === 'rimHang').length;
    assert.ok(hangFrames >= Math.floor(0.4 / SIM_DT), `the whole hang is in the cut (${hangFrames} frames)`);
    return;
  }
  assert.fail('no release timing produced a replayed dunk');
});
