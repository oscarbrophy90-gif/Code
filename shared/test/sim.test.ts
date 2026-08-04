import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AiController } from '../src/sim/ai.ts';
import { createMatch, defaultMatchConfig, SIM_DT, stepMatch, drainEvents } from '../src/sim/match.ts';
import { generateOpponent } from '../src/data/opponents.ts';
import { computeCaps, computeOverall, startingAttributes, upgradeCost } from '../src/ratings.ts';
import { computeShotProfile, resolveShot } from '../src/shooting.ts';
import { freshBadges } from '../src/badges.ts';
import { isAcceptableMatch, rankLabel, tierForPoints, updateRank, freshRank } from '../src/mmr.ts';
import { generateChallenges, seasonForTime, buildBattlePass } from '../src/seasons.ts';
import { computeMatchReward } from '../src/economy.ts';
import { packInput, unpackInput } from '../src/protocol.ts';
import { emptyInput, emptyStats, type SimEvent } from '../src/sim/state.ts';
import { ATTRIBUTE_KEYS, DIFFICULTIES, type BuildSpec, type Difficulty } from '../src/types.ts';
import { shotAttribute } from '../src/shooting.ts';

function playGame(seed: number) {
  const a = generateOpponent(82, seed);
  const b = generateOpponent(80, seed + 1);
  const state = createMatch(a, b, defaultMatchConfig({ targetScore: 7, maxScore: 9 }), seed);
  const ai0 = new AiController(0, 'allStar', seed + 10);
  const ai1 = new AiController(1, 'pro', seed + 20);

  const seen: SimEvent[] = [];
  let frames = 0;
  const maxFrames = 120 * 60 * 12; // 12 minutes of sim time is a hard ceiling
  while (state.phase !== 'over' && frames < maxFrames) {
    const i0 = ai0.update(state, SIM_DT);
    const i1 = ai1.update(state, SIM_DT);
    stepMatch(state, [i0, i1], SIM_DT);
    seen.push(...drainEvents(state));
    frames++;
  }
  return { state, seen, frames };
}

test('a bot-vs-bot game reaches a winner', () => {
  const { state, frames } = playGame(12345);
  assert.equal(state.phase, 'over');
  assert.notEqual(state.winner, null);
  assert.ok(frames > 120, 'game should take more than one second of sim time');
  const winner = state.winner as 0 | 1;
  assert.ok(state.score[winner] >= 7, `winner should reach the target, got ${state.score.join('-')}`);
});

test('the simulation is deterministic for identical seeds', () => {
  const a = playGame(999);
  const b = playGame(999);
  assert.deepEqual(a.state.score, b.state.score);
  assert.equal(a.frames, b.frames);
  assert.equal(a.state.rngState, b.state.rngState);
});

test('games produce the full range of gameplay events', () => {
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 6; seed++) {
    for (const e of playGame(seed * 7717).seen) kinds.add(e.type);
  }
  for (const expected of ['shotRelease', 'score', 'miss', 'move', 'phase', 'gameOver']) {
    assert.ok(kinds.has(expected), `expected a ${expected} event across sample games`);
  }
});

test('perfect timing is an automatic make when open', () => {
  const attrs = startingAttributes({ position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 });
  attrs.threePoint = 90;
  const profile = computeShotProfile({
    attrs,
    badges: freshBadges(),
    jumpshotId: 'base-rise',
    shotType: 'jumper',
    distance: 24,
    isThree: true,
    contest: 0,
    stamina: 1,
    driftSpeed: 0,
    greenStreak: 0,
    makeStreak: 0,
    clutch: false,
    heightDelta: 0,
  });
  assert.equal(profile.greenMakeChance, 1);
  const result = resolveShot(profile, profile.idealPoint, 0.999, true);
  assert.equal(result.grade, 'green');
  assert.equal(result.made, true);
  assert.equal(result.points, 2);
});

test('a green release always scores, however heavy the contest', () => {
  const attrs = startingAttributes({ position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 });
  attrs.threePoint = 90;
  const base = {
    attrs,
    badges: freshBadges(),
    jumpshotId: 'base-rise' as const,
    shotType: 'jumper' as const,
    distance: 24,
    isThree: true,
    stamina: 1,
    driftSpeed: 0,
    greenStreak: 0,
    makeStreak: 0,
    clutch: false,
    heightDelta: 0,
  };
  const open = computeShotProfile({ ...base, contest: 0 });
  const smothered = computeShotProfile({ ...base, contest: 1 });

  // Contest makes green harder to HIT, never luckier to convert.
  assert.equal(open.greenMakeChance, 1);
  assert.equal(smothered.greenMakeChance, 1);
  assert.ok(smothered.greenHalfWidth < open.greenHalfWidth * 0.45, 'a smothered window should collapse');
  assert.equal(smothered.heavilyContested, true);

  // Hitting the window scores every time, at any contest level.
  for (const profile of [open, smothered]) {
    for (const roll of [0, 0.5, 0.999]) {
      const r = resolveShot(profile, profile.idealPoint, roll, true);
      assert.equal(r.grade, 'green');
      assert.equal(r.made, true, 'a green must never miss');
    }
  }
});

test('a miss, block or steal hands the ball to the other player', () => {
  const state = createMatch(generateOpponent(80, 5), generateOpponent(80, 6), defaultMatchConfig(), 4242);
  assert.equal(state.config.turnoverOnMiss, true);

  const ai0 = new AiController(0, 'pro', 1, false);
  const ai1 = new AiController(1, 'pro', 2, false);
  let sawMissTurnover = false;
  let frames = 0;

  while (state.phase !== 'over' && frames < 120 * 60 * 8) {
    const possessionBefore = state.possession;
    stepMatch(state, [ai0.update(state, SIM_DT), ai1.update(state, SIM_DT)], SIM_DT);
    for (const e of drainEvents(state)) {
      if (e.type === 'miss') {
        // The shooter must not retain the ball off their own miss.
        assert.notEqual(state.possession, e.side, 'a miss should not stay with the shooter');
        assert.equal(possessionBefore, e.side);
        sawMissTurnover = true;
      }
    }
    frames++;
  }
  assert.ok(sawMissTurnover, 'expected at least one missed shot to change possession');
});

test('a better rating produces a wider green window', () => {
  const build: BuildSpec = { position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 };
  const make = (rating: number) => {
    const attrs = startingAttributes(build);
    attrs.threePoint = rating;
    return computeShotProfile({
      attrs,
      badges: freshBadges(),
      jumpshotId: 'base-rise',
      shotType: 'jumper',
      distance: 24,
      isThree: true,
      contest: 0,
      stamina: 1,
      driftSpeed: 0,
      greenStreak: 0,
      makeStreak: 0,
      clutch: false,
      heightDelta: 0,
    }).greenHalfWidth;
  };
  assert.ok(make(95) > make(60));
  assert.ok(make(60) > make(30));
});

test('low stamina shrinks the window', () => {
  const attrs = startingAttributes({ position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 });
  const base = {
    attrs,
    badges: freshBadges(),
    jumpshotId: 'base-rise' as const,
    shotType: 'jumper' as const,
    distance: 20,
    isThree: false,
    contest: 0,
    driftSpeed: 0,
    greenStreak: 0,
    makeStreak: 0,
    clutch: false,
    heightDelta: 0,
  };
  assert.ok(
    computeShotProfile({ ...base, stamina: 1 }).greenHalfWidth >
      computeShotProfile({ ...base, stamina: 0.15 }).greenHalfWidth,
  );
});

test('different jump shots trade window size against release speed', () => {
  const attrs = startingAttributes({ position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 });
  const mk = (id: string) =>
    computeShotProfile({
      attrs,
      badges: freshBadges(),
      jumpshotId: id,
      shotType: 'jumper',
      distance: 20,
      isThree: false,
      contest: 0,
      stamina: 1,
      driftSpeed: 0,
      greenStreak: 0,
      makeStreak: 0,
      clutch: false,
      heightDelta: 0,
    });
  const quick = mk('quick-trigger');
  const slow = mk('metronome');
  assert.ok(quick.meterDuration < slow.meterDuration);
  assert.ok(quick.greenHalfWidth < slow.greenHalfWidth);
});

test('build caps give each body type a distinct identity', () => {
  const guard = computeCaps({ position: 'PG', jerseyNumber: 1, heightIn: 72, weightLb: 175, wingspanIn: 75 });
  const big = computeCaps({ position: 'C', jerseyNumber: 1, heightIn: 86, weightLb: 270, wingspanIn: 92 });
  assert.ok(guard.ballHandle > big.ballHandle + 20);
  assert.ok(guard.threePoint > big.threePoint + 20);
  assert.ok(big.defensiveRebound > guard.defensiveRebound + 20);
  assert.ok(big.offensiveRebound > guard.offensiveRebound + 20);
  assert.ok(big.block > guard.block + 20);
  assert.ok(big.interiorDefense > guard.interiorDefense);
});

test('every build starts at exactly 60 overall and can reach the high 90s', () => {
  const builds: BuildSpec[] = [
    { position: 'PG', jerseyNumber: 1, heightIn: 72, weightLb: 175, wingspanIn: 75 },
    { position: 'SG', jerseyNumber: 3, heightIn: 78, weightLb: 205, wingspanIn: 82 },
    { position: 'SF', jerseyNumber: 7, heightIn: 80, weightLb: 220, wingspanIn: 86 },
    { position: 'PF', jerseyNumber: 21, heightIn: 83, weightLb: 245, wingspanIn: 88 },
    { position: 'C', jerseyNumber: 33, heightIn: 87, weightLb: 275, wingspanIn: 93 },
  ];
  for (const b of builds) {
    const overall = computeOverall(startingAttributes(b), b.position);
    assert.equal(overall, 60, `${b.position} should start at 60, got ${overall}`);
  }

  const build = builds[1];
  const start = startingAttributes(build);

  const caps = computeCaps(build);
  const maxed = { ...start };
  for (const key of Object.keys(maxed) as (keyof typeof maxed)[]) maxed[key] = caps[key];
  assert.ok(computeOverall(maxed, build.position) >= 90);
});

test('upgrade costs rise as an attribute approaches its cap', () => {
  assert.ok(upgradeCost(80, 95) > upgradeCost(60, 95));
  assert.ok(upgradeCost(90, 92) > upgradeCost(90, 99));
  assert.equal(upgradeCost(95, 95), Infinity);
});

test('rank tiers span bronze to legend and update sensibly', () => {
  assert.equal(tierForPoints(0).tier, 'bronze');
  assert.equal(tierForPoints(4800).tier, 'legend');
  assert.match(rankLabel(1500), /Gold/);

  const rank = freshRank();
  rank.placementGamesLeft = 0;
  rank.points = 2000;
  const win = updateRank({ ...rank }, 2000, true, 11, 7);
  const loss = updateRank({ ...rank }, 2000, false, 7, 11);
  assert.ok(win.delta > 0);
  assert.ok(loss.delta < 0);
});

test('matchmaking widens its band as players wait', () => {
  assert.equal(isAcceptableMatch(2000, 2900, 0, 0), false);
  assert.equal(isAcceptableMatch(2000, 2900, 30, 30), true);
});

test('challenges and the battle pass generate deterministically', () => {
  const t = Date.UTC(2026, 2, 14);
  assert.deepEqual(generateChallenges(t), generateChallenges(t));
  const daily = generateChallenges(t).filter((c) => c.scope === 'daily');
  assert.equal(daily.length, 3);
  const season = seasonForTime(t);
  const pass = buildBattlePass(season);
  assert.equal(pass.filter((r) => r.track === 'free').length, 40);
  assert.equal(pass.filter((r) => r.track === 'premium').length, 40);
});

test('match rewards pay for winning and never go negative', () => {
  const stats = { ...emptyStats(), points: 11, fgm: 7, fga: 12, greens: 5, steals: 2, blocks: 1, rebounds: 4 };
  const win = computeMatchReward({
    won: true, playlist: 'ranked', stats, scoreFor: 11, scoreAgainst: 8,
    durationSeconds: 300, greenRate: 0.42, xpMultiplier: 1, premiumPass: false, winStreak: 3,
  });
  const quit = computeMatchReward({
    won: false, playlist: 'casual', stats: { ...emptyStats(), turnovers: 5 }, scoreFor: 0, scoreAgainst: 11,
    durationSeconds: 20, greenRate: 0, xpMultiplier: 1, premiumPass: false, winStreak: 0,
  });
  assert.ok(win.currency > 1000 && win.xp > 1000);
  assert.ok(quit.currency >= 0 && quit.xp >= 0);
  assert.ok(win.currency > quit.currency * 5);
});

test('inputs survive a pack/unpack round trip', () => {
  const input = { ...emptyInput(), mx: 0.5, mz: -1, sprint: true, shoot: true, move: 'spin' as const, moveDirX: -0.75, moveDirZ: 0.25 };
  const out = unpackInput(packInput(input));
  assert.equal(out.sprint, true);
  assert.equal(out.shoot, true);
  assert.equal(out.move, 'spin');
  assert.ok(Math.abs(out.mx - 0.5) < 0.01);
  assert.ok(Math.abs(out.moveDirX + 0.75) < 0.01);
});

// ------------------------------------------------------- 19-attribute system

test('the attribute set matches the 19-attribute spec', () => {
  assert.equal(ATTRIBUTE_KEYS.length, 19);
  for (const key of [
    'closeShot', 'midRange', 'threePoint', 'freeThrow', 'layup', 'dunk',
    'ballHandle', 'passAccuracy', 'speed', 'acceleration', 'strength',
    'vertical', 'stamina', 'perimeterDefense', 'interiorDefense', 'steal',
    'block', 'offensiveRebound', 'defensiveRebound',
  ]) {
    assert.ok(ATTRIBUTE_KEYS.includes(key as never), `missing attribute ${key}`);
  }
});

test('each shot type is governed by the right attribute', () => {
  assert.equal(shotAttribute({ shotType: 'freeThrow', isThree: false, distance: 15 }), 'freeThrow');
  assert.equal(shotAttribute({ shotType: 'jumper', isThree: true, distance: 25 }), 'threePoint');
  assert.equal(shotAttribute({ shotType: 'jumper', isThree: false, distance: 18 }), 'midRange');
  // Inside ten feet a jumper is a close shot, not a mid-range look.
  assert.equal(shotAttribute({ shotType: 'jumper', isThree: false, distance: 8 }), 'closeShot');
  assert.equal(shotAttribute({ shotType: 'floater', isThree: false, distance: 9 }), 'closeShot');
  assert.equal(shotAttribute({ shotType: 'layup', isThree: false, distance: 3 }), 'layup');
  assert.equal(shotAttribute({ shotType: 'contactDunk', isThree: false, distance: 2 }), 'dunk');
});

// ------------------------------------------------------------- difficulties

/** Plays a fixed reference opponent against one CPU difficulty. */
function ladderRun(d: Difficulty, games: number) {
  let wins = 0;
  let cpuFgm = 0;
  let cpuFga = 0;
  let cpuMoves = 0;
  for (let g = 0; g < games; g++) {
    const seed = g * 6151 + 11;
    const state = createMatch(generateOpponent(78, seed), generateOpponent(78, seed + 1), defaultMatchConfig(), seed * 7 + 3);
    const reference = new AiController(0, 'pro', seed + 100, false);
    const cpu = new AiController(1, d, seed + 200, false);
    let f = 0;
    while (state.phase !== 'over' && f < 120 * 60 * 10) {
      stepMatch(state, [reference.update(state, SIM_DT), cpu.update(state, SIM_DT)], SIM_DT);
      for (const e of drainEvents(state)) if (e.type === 'move' && e.side === 1) cpuMoves++;
      f++;
    }
    if (state.winner === 0) wins++;
    cpuFgm += state.stats[1].fgm;
    cpuFga += state.stats[1].fga;
  }
  return { winRate: wins / games, cpuFg: cpuFga ? cpuFgm / cpuFga : 0, movesPerGame: cpuMoves / games };
}

test('all six difficulties exist and get harder in order', () => {
  assert.deepEqual([...DIFFICULTIES], ['rookie', 'semiPro', 'pro', 'allStar', 'superstar', 'hallOfFame']);

  const results = DIFFICULTIES.map((d) => ({ d, ...ladderRun(d, 8) }));

  // A constant-skill reference opponent must win less as difficulty rises.
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i].winRate <= results[i - 1].winRate + 0.13,
      `${results[i].d} should not be easier than ${results[i - 1].d} ` +
        `(${results[i - 1].winRate.toFixed(2)} -> ${results[i].winRate.toFixed(2)})`,
    );
  }
  assert.ok(results[0].winRate > 0.7, 'Rookie should be easy to beat');
  assert.ok(results[results.length - 1].winRate < 0.35, 'Hall of Fame should be hard');

  // Rookie misses open shots; Hall of Fame does not.
  assert.ok(results[results.length - 1].cpuFg > results[0].cpuFg + 0.15);
  // Higher difficulties use more dribble moves.
  assert.ok(results[results.length - 1].movesPerGame > results[0].movesPerGame);
});

// ------------------------------------------------------- fouls & free throws

test('games produce fouls and free throws that resolve', () => {
  let fouls = 0;
  let ftEvents = 0;
  let ftMade = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { seen, state } = playGame(seed * 4441);
    for (const e of seen) {
      if (e.type === 'foul') {
        fouls++;
        assert.ok(e.shots === 1 || e.shots === 2, 'a shooting foul is one or two shots');
        assert.notEqual(e.on, e.by);
      }
      if (e.type === 'freeThrow') {
        ftEvents++;
        if (e.made) ftMade++;
      }
    }
    // The stripe must never leave the game stuck in the free-throw phase.
    assert.equal(state.phase, 'over');
    assert.equal(state.freeThrow, null);
    for (const st of state.stats) assert.ok(st.ftm <= st.fta);
  }
  assert.ok(fouls > 0, 'expected at least one foul across sample games');
  assert.ok(ftEvents >= fouls, 'every foul should produce at least one free throw');
  assert.ok(ftMade > 0, 'expected some free throws to go in');
});

test('an uncontested free throw has a far wider window than a contested jumper', () => {
  const build: BuildSpec = { position: 'SG', jerseyNumber: 3, heightIn: 78, weightLb: 205, wingspanIn: 82 };
  const attrs = startingAttributes(build);
  attrs.freeThrow = 80;
  attrs.threePoint = 80;
  const common = {
    attrs,
    badges: freshBadges(),
    jumpshotId: 'base-rise' as const,
    stamina: 1,
    greenStreak: 0,
    makeStreak: 0,
    clutch: false,
    heightDelta: 0,
  };
  const ft = computeShotProfile({ ...common, shotType: 'freeThrow', distance: 15, isThree: false, contest: 0, driftSpeed: 0 });
  const contested = computeShotProfile({ ...common, shotType: 'jumper', distance: 24, isThree: true, contest: 0.8, driftSpeed: 6 });
  assert.ok(ft.greenHalfWidth > contested.greenHalfWidth * 2);
  assert.equal(ft.heavilyContested, false);
});
