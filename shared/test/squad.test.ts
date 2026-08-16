import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createTeamMatch,
  createMatch,
  defaultMatchConfig,
  drainEvents,
  matchupOf,
  stepMatch,
  SIM_DT,
} from '../src/sim/match.ts';
import { emptyInput, type BallState, type MatchState, type PlayerInput } from '../src/sim/state.ts';
import { SquadController, archetypeOf } from '../src/sim/squad.ts';
import { generateOpponent, generateSquad, generateTeammates } from '../src/data/opponents.ts';
import { isBeyondArc } from '../src/sim/court.ts';

/**
 * 3v3: the same game with teams.
 *
 * The contract these tests hold: the sim carries six players without the 1v1
 * game noticing (the whole 1v1 suite passes untouched next door), a pass is a
 * real ball flight with an owner at the far end, TAB is a request the AI
 * honours by default and refuses only when it is right to, and a CPU roster is
 * a set of positions rather than one bot stamped three times.
 */

function team3(seed: number): MatchState {
  const a = generateOpponent(85, seed * 991 + 7);
  const mates = generateTeammates(85, seed * 991, { primary: '#20304c', secondary: '#e8b23a' });
  const opps = generateSquad(85, seed * 331 + 5);
  // The real 14-second clock: a 999s test clock removes all clock pressure,
  // and with it most of what makes a possession end.
  return createTeamMatch([a, ...mates], opps, defaultMatchConfig({ manualCheck: false }), seed * 77);
}

function idle(state: MatchState): PlayerInput[] {
  return state.players.map(() => emptyInput());
}

/**
 * The ball's state, read through a call so the compiler cannot narrow it to
 * whatever a test assigned before stepping the sim.
 */
function ballState(state: MatchState): BallState {
  return state.ball.state;
}

test('a 3v3 floor is six players on two teams, and 1v1 is still two pids', () => {
  const state = team3(1);
  assert.equal(state.players.length, 6);
  assert.deepEqual(state.teams, [[0, 1, 2], [3, 4, 5]]);
  for (let i = 0; i < 6; i++) {
    assert.equal(state.players[i].pid, i);
    assert.equal(state.players[i].side, i < 3 ? 0 : 1);
    assert.equal(typeof state.stats[i].points, 'number');
  }
  // Matchups pair tallest with tallest.
  const tallest0 = [0, 1, 2].reduce((a, b) => (state.players[a].cfg.heightIn >= state.players[b].cfg.heightIn ? a : b));
  const tallest1 = [3, 4, 5].reduce((a, b) => (state.players[a].cfg.heightIn >= state.players[b].cfg.heightIn ? a : b));
  assert.equal(matchupOf(state, tallest0).pid, tallest1);

  const solo = createMatch(generateOpponent(80, 3), generateOpponent(80, 4), defaultMatchConfig(), 9);
  assert.equal(solo.players.length, 2);
  assert.deepEqual(solo.teams, [[0], [1]]);
});

test('a squad is positions, not a template stamped three times', () => {
  const squad = generateSquad(85, 42);
  assert.equal(squad.length, 3);
  const [pg, wing, c] = squad;

  // The guard is guard-sized, the centre is a real seven-footer.
  assert.ok(pg.heightIn >= 72 && pg.heightIn <= 76, `PG stands ${pg.heightIn}in`);
  assert.ok(c.heightIn >= 84 && c.heightIn <= 88, `C stands ${c.heightIn}in`);
  assert.ok(c.heightIn - pg.heightIn >= 8, 'the centre must tower over the guard');
  assert.ok(wing.heightIn > pg.heightIn && wing.heightIn < c.heightIn, 'the wing sits between them');

  // And the ratings actually describe the roles.
  const pgArch = archetypeOf(pg);
  const cArch = archetypeOf(c);
  assert.ok(pgArch.handle > cArch.handle, 'the guard has the handle');
  assert.ok(cArch.inside > 0.6, `the centre lives inside (${cArch.inside.toFixed(2)})`);
  assert.ok(cArch.inside > cArch.three + 0.2, 'the centre is not a shooter');
  assert.ok(cArch.boards > pgArch.boards, 'the centre owns the glass');

  // Interior spots stay inside the arc; shooter spots are genuinely threes.
  for (const spot of cArch.spots) {
    assert.ok(!isBeyondArc(spot.x, spot.z), `big's spot (${spot.x},${spot.z}) must be inside the arc`);
  }
  for (const cfg of squad) {
    const arch = archetypeOf(cfg);
    if (arch.three > arch.inside + 0.08) {
      for (const spot of arch.spots) {
        assert.ok(isBeyondArc(spot.x, spot.z), `shooter's spot (${spot.x},${spot.z}) must be behind the line`);
      }
    }
  }

  // One kit for the whole squad.
  assert.equal(pg.jerseyPrimary, c.jerseyPrimary);
  // Teammates wear the colours they are handed.
  const mates = generateTeammates(80, 7, { primary: '#111111', secondary: '#222222' });
  assert.equal(mates.length, 2);
  for (const m of mates) assert.equal(m.jerseyPrimary, '#111111');
});

test('a pass is a real flight that ends in the receiver\'s hands', () => {
  const state = team3(2);
  // Hand the ball to the human, park a teammate open on the far wing.
  const p = state.players[0];
  const mate = state.players[1];
  p.x = 6;
  p.z = 24;
  p.state = 'dribble';
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.needsClear = false;
  state.phase = 'live';
  mate.x = -16;
  mate.z = 20;
  mate.state = 'idle';
  // Defenders far away so the lane is clean.
  for (const pid of state.teams[1]) {
    state.players[pid].x = 20;
    state.players[pid].z = 6;
  }

  const inputs = idle(state);
  inputs[0] = { ...emptyInput(), pass: true };
  stepMatch(state, inputs, SIM_DT);

  const events = drainEvents(state);
  const passEvent = events.find((e) => e.type === 'pass');
  assert.ok(passEvent && passEvent.type === 'pass', 'the pass must launch');
  assert.equal(passEvent.from, 0);
  assert.equal(state.ball.state, 'pass');
  assert.ok(state.ball.passTo === 1 || state.ball.passTo === 2);

  // Ride the flight: it must arrive and be held by the receiver.
  let steps = 0;
  while (state.ball.state === 'pass' && steps++ < 400) stepMatch(state, idle(state), SIM_DT);
  assert.equal(state.ball.state, 'held');
  assert.equal(state.ball.owner, state.players[1].x === -16 ? 1 : state.ball.owner);
  assert.ok(state.ball.owner !== 0, 'the ball must have changed hands');
  assert.equal(state.players[state.ball.owner!].side, 0, 'and stayed on the team');
});

test('TAB is a request: honoured when the caller is open, refused when the handler is cooking', () => {
  let honoured = 0;
  let refusals = 0;
  const trials = 30;

  for (let seed = 1; seed <= trials; seed++) {
    // ---- open caller: CPU teammate has it, human calls from an open wing.
    const state = team3(seed + 50);
    const mate = state.players[1];
    const human = state.players[0];
    mate.x = 10;
    mate.z = 24;
    mate.state = 'dribble';
    state.ball.owner = 1;
    state.ball.state = 'held';
    state.phase = 'live';
    state.needsClear = false;
    human.x = -17;
    human.z = 21;
    human.state = 'idle';
    // Opponents crowd the handler, nobody near the human.
    state.players[3].x = 11;
    state.players[3].z = 22.5;
    state.players[4].x = 9;
    state.players[4].z = 25.5;
    state.players[5].x = 18;
    state.players[5].z = 8;

    const mateSquad = new SquadController(0, [1, 2], 'pro', seed * 13);
    // The human calls once…
    const call = idle(state);
    call[0] = { ...emptyInput(), pass: true };
    stepMatch(state, call, SIM_DT);
    drainEvents(state);
    assert.equal(state.passRequest?.pid, 0);

    // …and the AI answers inside the request window.
    let gotIt = false;
    for (let i = 0; i < 200 && !gotIt; i++) {
      const inputs = idle(state);
      for (const [pid, inp] of mateSquad.update(state, SIM_DT)) inputs[pid] = inp;
      stepMatch(state, inputs, SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type === 'pass' && e.to === 0) gotIt = true;
      }
    }
    if (gotIt) honoured++;
  }

  for (let seed = 1; seed <= trials; seed++) {
    // ---- covered caller, handler wide open at the rim: keeping it is right.
    const state = team3(seed + 90);
    const mate = state.players[1];
    const human = state.players[0];
    mate.x = 2;
    mate.z = 9;
    mate.state = 'dribble';
    state.ball.owner = 1;
    state.ball.state = 'held';
    state.phase = 'live';
    state.needsClear = false;
    human.x = -17;
    human.z = 21;
    human.state = 'idle';
    // The caller is blanketed; the handler has nobody near him.
    state.players[3].x = -16.4;
    state.players[3].z = 20.6;
    state.players[4].x = 20;
    state.players[4].z = 30;
    state.players[5].x = -20;
    state.players[5].z = 30;

    const mateSquad = new SquadController(0, [1, 2], 'pro', seed * 17);
    const call = idle(state);
    call[0] = { ...emptyInput(), pass: true };
    stepMatch(state, call, SIM_DT);
    drainEvents(state);

    let passedAnyway = false;
    for (let i = 0; i < 120; i++) {
      const inputs = idle(state);
      for (const [pid, inp] of mateSquad.update(state, SIM_DT)) inputs[pid] = inp;
      stepMatch(state, inputs, SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type === 'pass' && e.to === 0) passedAnyway = true;
      }
      if (state.ball.state !== 'held' || state.ball.owner !== 1) break;
    }
    if (!passedAnyway) refusals++;
  }

  assert.ok(honoured >= trials * 0.6, `an open call must usually be honoured (${honoured}/${trials})`);
  assert.ok(refusals >= trials * 0.5, `a covered call against a cooking handler is usually refused (${refusals}/${trials})`);
});

test('two full squads play a real game to eleven, win by two', () => {
  const state = team3(4);
  const squadA = new SquadController(0, [0, 1, 2], 'pro', 101);
  const squadB = new SquadController(1, [3, 4, 5], 'pro', 202);

  let steps = 0;
  const cap = 120 * 60 * 8;
  let passes = 0;
  while (state.phase !== 'over' && steps++ < cap) {
    const inputs = idle(state);
    for (const [pid, inp] of squadA.update(state, SIM_DT)) inputs[pid] = inp;
    for (const [pid, inp] of squadB.update(state, SIM_DT)) inputs[pid] = inp;
    stepMatch(state, inputs, SIM_DT);
    for (const e of drainEvents(state)) if (e.type === 'pass') passes++;
  }

  assert.equal(state.phase, 'over');
  assert.ok(state.winner === 0 || state.winner === 1);
  const hi = Math.max(state.score[0], state.score[1]);
  const lo = Math.min(state.score[0], state.score[1]);
  assert.ok(hi >= state.config.targetScore, `winner reached the target (${hi})`);
  assert.ok(hi >= state.config.maxScore || hi - lo >= state.config.winBy, 'and won by two (or hit the cap)');
  assert.ok(passes >= 3, `a team game has passing in it (${passes} passes)`);
  // Every player's stat line exists; the teams actually shared the floor.
  assert.equal(state.stats.length, 6);
});

test('the big lives in the paint and the whole squad rebounds: shot diets follow archetypes', () => {
  // Aggregate over a few games so the split is signal rather than noise.
  let bigPaint = 0;
  let bigThrees = 0;
  let bigShots = 0;
  for (let seed = 10; seed < 16; seed++) {
    const state = team3(seed);
    const squadA = new SquadController(0, [0, 1, 2], 'pro', seed * 7);
    const squadB = new SquadController(1, [3, 4, 5], 'pro', seed * 11);
    // The CPU squad's centre is always pid 5 (PG, wing, C order).
    const bigPid = 5;
    assert.equal(state.players[bigPid].cfg.position, 'C');

    let steps = 0;
    while (state.phase !== 'over' && steps++ < 120 * 60 * 5) {
      const inputs = idle(state);
      for (const [pid, inp] of squadA.update(state, SIM_DT)) inputs[pid] = inp;
      for (const [pid, inp] of squadB.update(state, SIM_DT)) inputs[pid] = inp;
      stepMatch(state, inputs, SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type === 'shotRelease' && e.side === bigPid) {
          bigShots++;
          if (e.value === 2) bigThrees++;
          else {
            const p = state.players[bigPid];
            if (Math.hypot(p.shotFromX - 0, p.shotFromZ - 5.25) < 11) bigPaint++;
          }
        }
      }
    }
  }
  assert.ok(bigShots >= 15, `the centre gets his touches (${bigShots} shots)`);
  assert.ok(bigPaint / bigShots > 0.5, `the centre works inside (${((bigPaint / bigShots) * 100).toFixed(0)}% in the paint)`);
  assert.ok(bigThrees / bigShots < 0.2, `and does not live behind the arc (${((bigThrees / bigShots) * 100).toFixed(0)}% threes)`);
});


/**
 * A scripted pass down a known lane.
 *
 * The passer is at the top, the intended receiver straight down the middle,
 * and the other teammate is smothered in a corner so the passer's choice is
 * never in doubt. `blocker` decides whether a defender is standing in the
 * lane or parked out of the play.
 */
function scriptedPass(seed: number, accuracy: number, blocker: boolean) {
  const a = generateOpponent(85, seed * 991 + 7);
  a.attrs.passAccuracy = accuracy;
  const mates = generateTeammates(85, seed * 991, { primary: '#20304c', secondary: '#e8b23a' });
  const opps = generateSquad(85, seed * 331 + 5);
  const state = createTeamMatch([a, ...mates], opps, defaultMatchConfig({ manualCheck: false }), seed * 77);

  const p = state.players[0];
  p.x = 0;
  p.z = 28;
  p.state = 'dribble';
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.phase = 'live';
  state.needsClear = false;

  const target = state.players[1];
  target.x = 0;
  target.z = 8;
  target.state = 'idle';
  target.vx = target.vz = 0;

  const spare = state.players[2];
  spare.x = 21;
  spare.z = 31;
  spare.vx = spare.vz = 0;
  state.players[4].x = 21.6;
  state.players[4].z = 31;
  state.players[5].x = -22;
  state.players[5].z = 32;
  state.players[3].x = blocker ? 0 : -22;
  state.players[3].z = blocker ? 18 : 30;

  const inputs = idle(state);
  inputs[0] = { ...emptyInput(), pass: true };
  stepMatch(state, inputs, SIM_DT);
  const onLane = ballState(state) === 'pass' && state.ball.passTo === 1;

  let tipped = false;
  let frames = 0;
  for (const e of drainEvents(state)) if (e.type === 'tip') tipped = true;
  while (ballState(state) === 'pass' && frames++ < 600) {
    for (const pl of state.players) {
      pl.vx = 0;
      pl.vz = 0;
    }
    stepMatch(state, idle(state), SIM_DT);
    for (const e of drainEvents(state)) if (e.type === 'tip') tipped = true;
  }

  return {
    onLane,
    tipped,
    caught: ballState(state) === 'held' && state.ball.owner === 1,
    flight: frames * SIM_DT,
    offTarget: Math.hypot(state.ball.x - target.x, state.ball.z - target.z),
  };
}

test('a body in the passing lane can tip it; a body out of the lane cannot', () => {
  let tippedWith = 0;
  let tippedWithout = 0;
  let lanes = 0;

  for (let seed = 1; seed <= 120; seed++) {
    const withMan = scriptedPass(seed, 55, true);
    const without = scriptedPass(seed, 55, false);
    if (!withMan.onLane || !without.onLane) continue;
    lanes++;
    if (withMan.tipped) tippedWith++;
    if (without.tipped) tippedWithout++;
  }

  assert.ok(lanes > 100, `only ${lanes} passes went down the scripted lane`);
  assert.equal(tippedWithout, 0, `${tippedWithout} passes were tipped with nobody in the lane`);
  assert.ok(
    tippedWith > lanes * 0.15,
    `standing in the lane must matter — only ${tippedWith}/${lanes} tipped`,
  );
  assert.ok(
    tippedWith < lanes * 0.75,
    `but a lane defender is not a wall — ${tippedWith}/${lanes} tipped`,
  );
});

test('Pass Accuracy makes the pass faster, truer, and safer to catch', () => {
  const sample = (accuracy: number) => {
    let flight = 0;
    let off = 0;
    let caught = 0;
    let n = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = scriptedPass(seed, accuracy, false);
      if (!r.onLane) continue;
      n++;
      flight += r.flight;
      off += r.offTarget;
      if (r.caught) caught++;
    }
    return { flight: flight / n, off: off / n, caught: caught / n, n };
  };

  const poor = sample(25);
  const mid = sample(60);
  const elite = sample(99);
  assert.ok(poor.n > 100 && elite.n > 100, 'enough scripted passes to measure');

  // Faster.
  assert.ok(elite.flight < mid.flight, `elite ${elite.flight.toFixed(3)}s vs mid ${mid.flight.toFixed(3)}s`);
  assert.ok(mid.flight < poor.flight, `mid ${mid.flight.toFixed(3)}s vs poor ${poor.flight.toFixed(3)}s`);
  assert.ok(elite.flight < poor.flight * 0.7, 'an elite passer is markedly quicker');

  // Truer: it lands on the man rather than near him.
  assert.ok(elite.off < mid.off, `elite ${elite.off.toFixed(2)}ft vs mid ${mid.off.toFixed(2)}ft off`);
  assert.ok(mid.off < poor.off, `mid ${mid.off.toFixed(2)}ft vs poor ${poor.off.toFixed(2)}ft off`);
  assert.ok(elite.off < 0.5, `an elite pass hits the target (${elite.off.toFixed(2)}ft off)`);

  // Safer: fewer of them end up on the floor.
  assert.ok(elite.caught > mid.caught, `elite caught ${(elite.caught * 100).toFixed(0)}% vs mid ${(mid.caught * 100).toFixed(0)}%`);
  assert.ok(mid.caught > poor.caught, `mid ${(mid.caught * 100).toFixed(0)}% vs poor ${(poor.caught * 100).toFixed(0)}%`);
  assert.ok(elite.caught > 0.95, `an elite passer barely ever has one dropped (${(elite.caught * 100).toFixed(0)}%)`);
  assert.ok(poor.caught < 0.8, `a poor passer genuinely loses some (${(poor.caught * 100).toFixed(0)}%)`);
});

test('a better passer threads a guarded lane more often than a worse one', () => {
  const tipRate = (accuracy: number) => {
    let tipped = 0;
    let n = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = scriptedPass(seed, accuracy, true);
      if (!r.onLane) continue;
      n++;
      if (r.tipped) tipped++;
    }
    return tipped / n;
  };
  const poor = tipRate(25);
  const elite = tipRate(99);
  assert.ok(
    elite < poor * 0.6,
    `an elite passer should be much harder to tip: ${(elite * 100).toFixed(0)}% vs ${(poor * 100).toFixed(0)}%`,
  );
});
