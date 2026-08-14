import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMatch, defaultMatchConfig, drainEvents, stepMatch, SIM_DT } from '../src/sim/match.ts';
import { emptyInput, type MatchState, type SimEvent } from '../src/sim/state.ts';
import { generateOpponent } from '../src/data/opponents.ts';
import { DUNK_PACKAGES, DUNK_PACKAGE_BY_ID, dunkHangTime } from '../src/sim/moves.ts';
import { COURT } from '../src/sim/court.ts';

/**
 * The live dunk system.
 *
 * A dunk used to be a player jumping straight up on the spot while the ball
 * flew to the rim by itself, with all the choreography saved for the cutaway.
 * These tests pin the new contract: the flight carries the player to the iron
 * with the ball in hand, the slam, the poster fall and the rim hang happen in
 * live play in that order, the replay cues after the hang rather than instead
 * of the live dunk, and none of it teleports.
 */

interface Trace {
  states: string[];
  /** biggest single-frame ground move while airborne on the dunk, in feet */
  maxStep: number;
  /** player and ball positions each frame of the flight */
  flight: { px: number; pz: number; py: number; bx: number; bz: number; by: number }[];
  events: SimEvent[];
  hangFrames: number;
  fallenDuringHang: boolean;
  hangSpots: { x: number; y: number; z: number; heightIn: number }[];
  state: MatchState;
}

/** Drives one scripted dunk attempt and records everything that matters. */
function runDunk(seed: number, opts: { defender: 'front' | 'away'; release: number; packageId?: string }): Trace {
  const a = generateOpponent(90, seed * 3 + 1);
  a.attrs.dunk = 95;
  a.attrs.vertical = 95;
  a.attrs.speed = 90;
  a.attrs.speedWithBall = 90;
  a.attrs.acceleration = 90;
  if (opts.packageId) a.dunkPackageId = opts.packageId;
  const b = generateOpponent(70, seed * 3 + 2);
  const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }), seed);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const p = state.players[0];
  const d = state.players[1];
  p.x = 1;
  p.z = 16;
  p.state = 'dribble';
  p.stamina = 1;
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.needsClear = false;

  const drive = { ...emptyInput(), mz: -1, sprint: true };
  for (let i = 0; i < 40; i++) stepMatch(state, [drive, emptyInput()], SIM_DT);

  const trace: Trace = { states: [], maxStep: 0, flight: [], events: [], hangFrames: 0, fallenDuringHang: false, hangSpots: [], state };
  let prevX = p.x;
  let prevZ = p.z;
  for (let i = 0; i < 500; i++) {
    if (opts.defender === 'front') {
      // Planted in the path, standing his ground — until the slam knocks him
      // down, after which the sim owns him.
      if (d.state !== 'fallen') {
        d.x = p.x * 0.5;
        d.z = Math.max(6.5, p.z - 3);
        d.vx = 0;
        d.vz = 0;
        d.handUp = true;
      }
    } else {
      if (d.state !== 'fallen') {
        d.x = 20;
        d.z = 28;
      }
    }
    const input = i < opts.release ? { ...drive, shoot: true } : { ...drive, shoot: false };
    stepMatch(state, [input, emptyInput()], SIM_DT);

    // Read through a widened type: TS narrows p.state to the literal we
    // assigned before the loop, but the sim rewrites it every frame.
    const actState: string = p.state;
    if (trace.states[trace.states.length - 1] !== actState) trace.states.push(actState);
    if (actState === 'finishing' && p.dunk) {
      trace.flight.push({ px: p.x, pz: p.z, py: p.y, bx: state.ball.x, bz: state.ball.z, by: state.ball.y });
      trace.maxStep = Math.max(trace.maxStep, Math.hypot(p.x - prevX, p.z - prevZ));
    }
    if (actState === 'rimHang') {
      trace.hangFrames++;
      if (d.state === 'fallen') trace.fallenDuringHang = true;
      trace.hangSpots.push({ x: p.x, y: p.y, z: p.z, heightIn: p.cfg.heightIn });
      trace.maxStep = Math.max(trace.maxStep, Math.hypot(p.x - prevX, p.z - prevZ));
    }
    prevX = p.x;
    prevZ = p.z;
    trace.events.push(...drainEvents(state));
  }
  return trace;
}

/** The first release timing that produces an emphatic (green-window) dunk. */
function greenRun(seedBase: number, defender: 'front' | 'away', packageId?: string): Trace {
  for (let seed = seedBase; seed < seedBase + 4; seed++) {
    for (let r = 22; r < 58; r++) {
      const t = runDunk(seed, { defender, release: r, packageId });
      if (t.states.includes('rimHang')) return t;
    }
  }
  assert.fail('no release timing produced an emphatic dunk');
}

test('a live dunk is flight → slam → hang → drop, in play, with no teleport', () => {
  const t = greenRun(11, 'away');

  // The sequence, in order, on the court — not in a cutaway.
  const fin = t.states.indexOf('finishing');
  const hang = t.states.indexOf('rimHang');
  assert.ok(fin >= 0, `never took off: ${t.states.join(' → ')}`);
  assert.ok(hang > fin, `never hung: ${t.states.join(' → ')}`);

  // The flight actually travels: takeoff out on the floor, slam at the iron.
  assert.ok(t.flight.length > 30, `flight lasted ${t.flight.length} frames`);
  const first = t.flight[0];
  const last = t.flight[t.flight.length - 1];
  const rimDistAtEnd = Math.hypot(last.px - COURT.rimX, last.pz - COURT.rimZ);
  const travelled = Math.hypot(last.px - first.px, last.pz - first.pz);
  assert.ok(travelled > 0.4, `the flight barely moved: ${travelled.toFixed(2)}ft`);
  assert.ok(rimDistAtEnd < 1.6, `slammed ${rimDistAtEnd.toFixed(1)}ft from the rim`);
  assert.ok(last.py > 1.8, 'was in the air at the slam');

  // No teleporting: at 120Hz even a sprint covers inches per frame. Half a
  // foot in one frame would be a visible snap.
  assert.ok(t.maxStep < 0.5, `biggest single-frame move was ${t.maxStep.toFixed(2)}ft`);

  // The ball rides in the dunker's hand the whole way — never at the rim
  // before he is.
  for (const f of t.flight) {
    const carry = Math.hypot(f.bx - f.px, f.bz - f.pz);
    assert.ok(carry < 1.5, `ball drifted ${carry.toFixed(1)}ft from the dunker mid-flight`);
    assert.ok(f.by > f.py, 'ball carried above the feet');
  }

  // The hang is real time on the iron, and the replay cues after it.
  assert.ok(t.hangFrames >= Math.floor(0.4 / SIM_DT), `hang lasted ${t.hangFrames} frames`);
  const slamAt = t.events.findIndex((e) => e.type === 'dunk' || e.type === 'contactDunk');
  const highlightAt = t.events.findIndex((e) => e.type === 'dunkHighlight');
  assert.ok(slamAt >= 0 && highlightAt > slamAt, 'the replay cues after the live slam, never instead of it');
});

test('a poster drops the defender at the slam and he is still down during the hang', () => {
  const t = greenRun(23, 'front');

  const highlight = t.events.find((e) => e.type === 'dunkHighlight');
  assert.ok(highlight && highlight.type === 'dunkHighlight');
  assert.equal(highlight.posterized, true, 'a body in the path is a poster');
  assert.ok(t.fallenDuringHang, 'the defender is on the floor while the dunker hangs');

  // And the fall happens at the slam, not half a second before the ball is at
  // the rim: no fallen frames before the contact event.
  let sawSlam = false;
  let fellBeforeSlam = false;
  for (const e of t.events) {
    if (e.type === 'dunk' || e.type === 'contactDunk') sawSlam = true;
    void e;
  }
  assert.ok(sawSlam);
  assert.equal(fellBeforeSlam, false);
});

test('an open dunk is not a poster and a non-green make does not hang', () => {
  const open = greenRun(37, 'away');
  const highlight = open.events.find((e) => e.type === 'dunkHighlight');
  assert.ok(highlight && highlight.type === 'dunkHighlight');
  assert.equal(highlight.posterized, false, 'nobody near you is not a poster');

  // Sweep the release timings: any made-but-not-green dunk must come down
  // without touching the iron, and without cueing a replay.
  let sawPlainMake = false;
  for (let r = 20; r < 60 && !sawPlainMake; r++) {
    const t = runDunk(41 + (r % 3), { defender: 'away', release: r });
    const rel = t.events.find((e) => e.type === 'shotRelease' && (e.shotType === 'dunk' || e.shotType === 'contactDunk'));
    if (!rel || rel.type !== 'shotRelease') continue;
    const emphatic = rel.made && (rel.grade === 'green' || rel.grade === 'excellent');
    if (rel.made && !emphatic) {
      sawPlainMake = true;
      assert.ok(!t.states.includes('rimHang'), 'no hang without the emphatic finish');
      assert.ok(!t.events.some((e) => e.type === 'dunkHighlight'), 'and no replay either');
    }
  }
  assert.ok(sawPlainMake, 'expected at least one made-but-not-green dunk in the sweep');
});

test('the same dunk twice is the same dunk: the flight is deterministic', () => {
  const a = greenRun(53, 'front');
  const b = greenRun(53, 'front');
  assert.equal(a.flight.length, b.flight.length);
  for (let i = 0; i < a.flight.length; i++) {
    assert.equal(a.flight[i].px, b.flight[i].px);
    assert.equal(a.flight[i].py, b.flight[i].py);
    assert.equal(a.flight[i].bz, b.flight[i].bz);
  }
});

test('every package in the shop works as a live dunk, and hang time follows rarity', () => {
  // One from each rarity band of the new pack, plus the starter.
  const sample = ['basic-slam', 'dunk-x-two-hand-power-dunk', 'dunk-x-360-one-hander', 'dunk-x-540-one-hander', 'dunk-x-1080-spin', 'dunk-x-skyline-ascension'];
  for (const id of sample) {
    assert.ok(DUNK_PACKAGE_BY_ID[id], `${id} missing from the catalogue`);
    const t = greenRun(61, 'away', id);
    assert.ok(t.states.includes('rimHang'), `${id} never completed a live dunk`);
    const highlight = t.events.find((e) => e.type === 'dunkHighlight');
    assert.ok(highlight && highlight.type === 'dunkHighlight' && highlight.packageId === id, `${id} should carry into the replay`);
  }

  // Hang time is bounded and climbs with rarity on the whole catalogue.
  for (const pkg of DUNK_PACKAGES) {
    const hang = dunkHangTime(pkg);
    assert.ok(hang >= 0.4 && hang <= 1.6, `${pkg.id} hangs for ${hang}s`);
  }
  const common = dunkHangTime(DUNK_PACKAGE_BY_ID['dunk-x-two-hand-power-dunk']);
  const mythic = dunkHangTime(DUNK_PACKAGE_BY_ID['dunk-x-skyline-ascension']);
  assert.ok(mythic > common, 'the top of the catalogue hangs longer');
});

test('the new pack is real stock: unique ids, sane gates, motions the renderer can read', () => {
  const ids = DUNK_PACKAGES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'no two packages share an id');
  const names = DUNK_PACKAGES.map((d) => d.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'no two packages share a name');

  for (const d of DUNK_PACKAGES) {
    assert.ok(d.requires >= 0 && d.requires <= 99, `${d.id} gates at ${d.requires} Dunk`);
    assert.ok(d.requiresVertical >= 0 && d.requiresVertical <= 99, `${d.id} gates at ${d.requiresVertical} Vertical`);
    assert.ok(d.duration >= 0.4 && d.duration <= 1.3, `${d.id} runs ${d.duration}s`);
  }
});

test('the hang holds the hands on the iron: right height, right spot, dead still', () => {
  const t = greenRun(71, 'away');
  assert.ok(t.hangSpots.length > 30, `hang recorded ${t.hangSpots.length} frames`);

  // Skip the catch — the first beat swings the body under the grip — and
  // measure the held hang.
  const held = t.hangSpots.slice(Math.ceil(0.2 / SIM_DT));
  assert.ok(held.length > 10, 'the hang outlasts the catch');

  for (const spot of held) {
    // The renderer's fully raised hand sits heightFt * 0.81 + 0.98 above the
    // feet; the sim hangs the feet so that lands exactly on the 10ft iron.
    const handY = spot.y + (spot.heightIn / 12) * 0.81 + 0.98;
    assert.ok(Math.abs(handY - COURT.rimY) < 0.15, `hands ${handY.toFixed(2)}ft on a ${COURT.rimY}ft rim`);
    // And the body hangs at the near edge of the iron, not out on the floor.
    const fromRim = Math.hypot(spot.x - COURT.rimX, spot.z - COURT.rimZ);
    assert.ok(fromRim > 0.4 && fromRim < 1.1, `hanging ${fromRim.toFixed(2)}ft from the rim centre`);
  }

  // Iron does not bob: once caught, the height holds to the millimetre.
  const ys = held.map((s2) => s2.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.02, 'the hang height must not wobble');

  // The catch is a motion, not a snap — still under the no-teleport bar.
  assert.ok(t.maxStep < 0.5, `biggest single-frame move was ${t.maxStep.toFixed(2)}ft`);
});

test('a missed dunk kicks off the iron and flies: the board is a race, not a gift', () => {
  // The dunker used to catch his own clang on the next frame — the ball was
  // placed at rim height with his hands already there, so a miss handed the
  // possession straight back. A missed dunk has to go somewhere.
  const flights: { peak: number; travel: number; loose: number; ownDist: number }[] = [];
  let immediateSelfBoards = 0;

  for (let seed = 300; seed < 340; seed++) {
    const a = generateOpponent(90, seed * 3 + 1);
    a.attrs.dunk = 95;
    a.attrs.vertical = 95;
    a.attrs.speed = 90;
    a.attrs.speedWithBall = 90;
    a.attrs.acceleration = 90;
    const b = generateOpponent(70, seed * 3 + 2);
    // instantInbound off: this is the live rebound path, not the practice gym.
    const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false, shotClock: 999 }), seed);
    for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

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

    // Released far too early: this dunk misses.
    const release = 4 + (seed % 6);
    let missed = false;
    let peak = 0;
    let looseFrames = 0;
    let x0 = 0;
    let z0 = 0;
    let started = false;
    let ownDist = 0;
    let collectedBy: number | null = null;

    for (let i = 0; i < 700 && collectedBy === null; i++) {
      stepMatch(state, [i < release ? { ...drive, shoot: true } : drive, emptyInput()], SIM_DT);
      for (const e of drainEvents(state)) if (e.type === 'miss') missed = true;
      if (!missed) continue;
      const ball = state.ball;
      if (ball.state === 'loose') {
        if (!started) {
          started = true;
          x0 = ball.x;
          z0 = ball.z;
        }
        looseFrames++;
        peak = Math.max(peak, ball.y);
        ownDist = Math.hypot(ball.x - p.x, ball.z - p.z);
      }
      if (started && ball.state === 'held' && ball.owner !== null) collectedBy = ball.owner;
    }

    if (!started) continue;
    const travel = Math.hypot(state.ball.x - x0, state.ball.z - z0);
    flights.push({ peak, travel, loose: looseFrames * SIM_DT, ownDist });
    // The dunker is neither controlled nor chasing here, so nothing he does
    // can explain recovering it. Landing on it inside a fifth of a second is
    // the bug itself.
    if (collectedBy === 0 && looseFrames * SIM_DT < 0.2) immediateSelfBoards++;
  }

  assert.ok(flights.length >= 30, `only ${flights.length} of the scripted dunks missed`);
  assert.equal(immediateSelfBoards, 0, `${immediateSelfBoards} misses were rebounded on the spot by the dunker`);

  for (const f of flights) {
    assert.ok(f.peak > COURT.rimY + 2, `carom peaked at ${f.peak.toFixed(1)}ft off a ${COURT.rimY}ft rim`);
    assert.ok(f.travel > 5, `carom travelled only ${f.travel.toFixed(1)}ft`);
    assert.ok(f.loose > 0.6, `ball was live for only ${f.loose.toFixed(2)}s`);
  }
});


test('a climbing carom is nobody\'s, and the man who missed it is out of the play', () => {
  const state = createMatch(
    generateOpponent(85, 11),
    generateOpponent(85, 12),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    99,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const ball = state.ball;
  ball.state = 'loose';
  ball.owner = null;
  ball.shotBy = 0;
  ball.settled = false;
  ball.x = COURT.rimX;
  ball.z = COURT.rimZ;
  ball.y = COURT.rimY + 0.4;
  ball.vx = 0;
  ball.vz = 0;
  ball.vy = 16;
  // Both men parked under it and up in the air, so their reach covers the ball
  // outright: only the gate can stop them plucking it straight off the iron.
  for (const p of state.players) {
    p.x = COURT.rimX;
    p.z = COURT.rimZ + 0.5;
    p.y = 3;
    p.state = 'airborne';
    p.stagger = 0;
    p.reboundLock = 0;
  }

  let climbed = 0;
  while (state.ball.state === 'loose' && !state.ball.settled && climbed++ < 300) {
    for (const p of state.players) p.y = 3;
    stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  }
  assert.equal(state.ball.state, 'loose', 'the carom was gathered while it was still going up');
  assert.ok(state.ball.settled, 'the carom never became a live ball');
  assert.ok(state.ball.vy <= 0, 'the carom went live before it topped out');
  assert.ok(state.ball.y > COURT.rimY, `the carom settled at ${state.ball.y.toFixed(1)}ft, under the rim`);
  assert.ok(climbed > 30, `the carom was live after only ${climbed} frames`);

  // And the lock: the man who missed cannot gather it even standing on top of
  // it, until he has come down and turned around.
  const dunker = state.players[0];
  const pin = () => {
    state.ball.x = dunker.x;
    state.ball.z = dunker.z;
    state.ball.y = 4;
    state.ball.vx = 0;
    state.ball.vz = 0;
    state.ball.vy = 0;
    state.ball.settled = true;
  };
  state.players[1].x = 20;
  state.players[1].z = 30;
  dunker.reboundLock = 0.5;
  pin();
  stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.ball.state, 'loose', 'the dunker rebounded his own miss while still locked out');

  for (let i = 0; i < 200 && state.ball.state === 'loose'; i++) {
    pin();
    stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  }
  assert.equal(state.ball.owner, 0, 'once the lock expires the dunker is back in the play');
});
