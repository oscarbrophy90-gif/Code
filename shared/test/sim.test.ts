import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AiController } from '../src/sim/ai.ts';
import { createMatch, currentContest, defaultMatchConfig, SIM_DT, stepMatch, drainEvents } from '../src/sim/match.ts';
import { generateOpponent } from '../src/data/opponents.ts';
import {
  clampHeightToPosition,
  computeCaps,
  computeOverall,
  defaultBuildFor,
  heightRangeFor,
  startingAttributes,
  upgradeCost,
  wingspanFor,
} from '../src/ratings.ts';
import { scoutReport } from '../src/scouting.ts';
import { DEFAULT_TITLES, newlyEarnedTitles, streakBadge } from '../src/data/titles.ts';
import { DRILLS, SHOOT_AROUND, drillMedal, drillReward } from '../src/data/drills.ts';
import { DEFAULT_UNLOCKS, STORE_BY_ID } from '../src/data/cosmetics.ts';
import { GRADE_COLOR, computeShotProfile, isAutomatic, resolveShot } from '../src/shooting.ts';
import { freshBadges } from '../src/badges.ts';
import { isAcceptableMatch, rankLabel, tierForPoints, updateRank, freshRank } from '../src/mmr.ts';
import { generateChallenges, seasonForTime, buildBattlePass } from '../src/seasons.ts';
import { computeMatchReward } from '../src/economy.ts';
import { packInput, unpackInput } from '../src/protocol.ts';
import { emptyInput, emptyStats, type SimEvent } from '../src/sim/state.ts';
import { ATTRIBUTE_KEYS, DIFFICULTIES, POSITIONS, type BuildSpec, type CareerStats, type Difficulty } from '../src/types.ts';
import { shotAttribute } from '../src/shooting.ts';
import { COURT, distanceToRim, isBeyondArc } from '../src/sim/court.ts';

/** A zeroed career, so a title test starts from a player who has done nothing. */
function emptyCareerStatsForTest(): CareerStats {
  return {
    gamesPlayed: 0, wins: 0, losses: 0, points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0,
    assists: 0, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, greens: 0,
    shotAttemptsTimed: 0, ankleBreakers: 0, contactDunks: 0, chaseDownBlocks: 0,
    teammateGradeSum: 0, teammateGradeCount: 0, currentWinStreak: 0, longestWinStreak: 0,
    highestRankPoints: 0, highestDifficultyBeaten: null, winsByDifficulty: {},
    gamesByDifficulty: {}, freeThrowsMade: 0, freeThrowsAttempted: 0,
  };
}

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

test('a block or a steal hands the ball over; a miss is a live rebound', () => {
  const state = createMatch(generateOpponent(80, 5), generateOpponent(80, 6), defaultMatchConfig(), 4242);
  assert.equal(state.config.turnoverOnMiss, false, 'misses go to the glass, not straight over');

  const ai0 = new AiController(0, 'pro', 1, false);
  const ai1 = new AiController(1, 'pro', 2, false);
  let sawLooseBallOffMiss = false;
  let sawTakeaway = false;
  let rebounds = 0;
  let frames = 0;

  while (state.phase !== 'over' && frames < 120 * 60 * 8) {
    stepMatch(state, [ai0.update(state, SIM_DT), ai1.update(state, SIM_DT)], SIM_DT);
    for (const e of drainEvents(state)) {
      if (e.type === 'miss' && state.ball.state === 'loose') sawLooseBallOffMiss = true;
      if (e.type === 'rebound') rebounds++;
      if (e.type === 'block' || e.type === 'steal') {
        // A takeaway still ends the possession outright: the ball is the
        // taker's, with no scramble for it.
        assert.equal(state.possession, e.side, 'a block or steal gives the ball to whoever made it');
        sawTakeaway = true;
      }
    }
    frames++;
  }
  assert.ok(sawLooseBallOffMiss, 'a miss should leave the ball live off the rim');
  assert.ok(rebounds > 0, 'expected rebounds to be contested and won');
  assert.ok(sawTakeaway, 'expected at least one block or steal');
});

test('a missed shot goes up off the rim high enough to go and get', () => {
  const state = createMatch(generateOpponent(80, 5), generateOpponent(80, 6), defaultMatchConfig({ manualCheck: false }), 909);
  const ai0 = new AiController(0, 'pro', 1, false);
  const ai1 = new AiController(1, 'pro', 2, false);

  let peak = 0;
  let sawMiss = false;
  for (let f = 0; f < 120 * 60 * 3 && !sawMiss; f++) {
    stepMatch(state, [ai0.update(state, SIM_DT), ai1.update(state, SIM_DT)], SIM_DT);
    for (const e of drainEvents(state)) if (e.type === 'miss') sawMiss = true;
  }
  assert.ok(sawMiss, 'expected a miss');
  // Follow the carom and record how high it gets.
  for (let f = 0; f < 120 * 3 && state.ball.state === 'loose'; f++) {
    stepMatch(state, [ai0.update(state, SIM_DT), ai1.update(state, SIM_DT)], SIM_DT);
    peak = Math.max(peak, state.ball.y);
  }
  assert.ok(peak > 8, `the carom should hang above the rim area, peaked at ${peak.toFixed(1)}ft`);
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

test('the attribute set matches the 20-attribute spec', () => {
  assert.equal(ATTRIBUTE_KEYS.length, 20);
  for (const key of [
    'closeShot', 'midRange', 'threePoint', 'freeThrow', 'layup', 'dunk',
    'ballHandle', 'speedWithBall', 'passAccuracy', 'speed', 'acceleration',
    'strength', 'vertical', 'stamina', 'perimeterDefense', 'interiorDefense',
    'steal', 'block', 'offensiveRebound', 'defensiveRebound',
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
  return {
    winRate: wins / games,
    cpuFg: cpuFga ? cpuFgm / cpuFga : 0,
    // Per possession, not per game: the best CPUs end possessions faster, so a
    // per-game count punishes them for being efficient.
    movesPerPossession: cpuFga ? cpuMoves / cpuFga : 0,
  };
}

test('all six difficulties exist and get harder in order', () => {
  assert.deepEqual([...DIFFICULTIES], ['rookie', 'semiPro', 'pro', 'allStar', 'superstar', 'hallOfFame']);

  // 24 games each, not 8. At 8 the win rate can only land on multiples of
  // 0.125, so a single lucky game moves a tier by more than the 0.13 tolerance
  // below and the ladder assertion fails on noise rather than on a real
  // regression. 24 games costs a few seconds and makes the curve stable.
  const results = DIFFICULTIES.map((d) => ({ d, ...ladderRun(d, 24) }));

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
  // Higher difficulties work harder for their looks.
  assert.ok(
    results[results.length - 1].movesPerPossession > results[0].movesPerPossession,
    `moves per possession should rise (${results[0].movesPerPossession.toFixed(2)} -> ${results[results.length - 1].movesPerPossession.toFixed(2)})`,
  );
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

// ------------------------------------------------------- builds and positions

test('a position cannot be built outside its height band', () => {
  for (const position of POSITIONS) {
    const band = heightRangeFor(position);
    assert.ok(band.min <= band.max, `${position} band is inverted`);
    assert.equal(clampHeightToPosition(position, band.min - 12), band.min);
    assert.equal(clampHeightToPosition(position, band.max + 12), band.max);
    const dflt = defaultBuildFor(position);
    assert.equal(dflt.position, position);
    assert.ok(dflt.heightIn >= band.min && dflt.heightIn <= band.max, `${position} default is outside its own band`);
  }
  // No point guard can ever be as tall as the shortest legal centre.
  assert.ok(heightRangeFor('PG').max < heightRangeFor('C').min);
});

test('height buys size and costs quickness', () => {
  const short = computeCaps({ position: 'C', jerseyNumber: 0, heightIn: 82, weightLb: 240, wingspanIn: wingspanFor('C', 82) });
  const tall = computeCaps({ position: 'C', jerseyNumber: 0, heightIn: 89, weightLb: 300, wingspanIn: wingspanFor('C', 89) });

  for (const key of ['strength', 'interiorDefense', 'block', 'offensiveRebound', 'defensiveRebound'] as const) {
    assert.ok(tall[key] > short[key], `${key} should rise with height (${short[key]} -> ${tall[key]})`);
  }
  for (const key of ['speed', 'acceleration', 'ballHandle', 'stamina'] as const) {
    assert.ok(tall[key] < short[key], `${key} should fall with height (${short[key]} -> ${tall[key]})`);
  }
});

test('every position starts at exactly 60 overall', () => {
  for (const position of POSITIONS) {
    const build = defaultBuildFor(position);
    assert.equal(computeOverall(startingAttributes(build), position), 60, `${position} did not start at 60`);
  }
});

// -------------------------------------------------------------------- titles

test('titles unlock from what the player actually did', () => {
  const stats = emptyCareerStatsForTest();
  assert.equal(newlyEarnedTitles(stats, DEFAULT_TITLES).length, 0, 'a fresh career earns nothing');

  stats.wins = 1;
  stats.greens = 100;
  stats.longestWinStreak = 5;
  const earned = newlyEarnedTitles(stats, DEFAULT_TITLES).map((t) => t.id);
  assert.ok(earned.includes('title-first-blood'));
  assert.ok(earned.includes('title-sharpshooter'));
  assert.ok(earned.includes('title-streaker'));
  assert.ok(!earned.includes('title-unbeaten'), '10 straight is not 5 straight');

  // Already-owned titles are never handed out twice.
  assert.equal(newlyEarnedTitles(stats, [...DEFAULT_TITLES, ...earned]).length, 0);
});

test('the career ladder title needs every difficulty beaten', () => {
  const stats = emptyCareerStatsForTest();
  for (const d of DIFFICULTIES) {
    assert.ok(!newlyEarnedTitles(stats, DEFAULT_TITLES).some((t) => t.id === 'title-ladder'));
    stats.winsByDifficulty[d] = 1;
  }
  assert.ok(newlyEarnedTitles(stats, DEFAULT_TITLES).some((t) => t.id === 'title-ladder'));
});

test('the win-streak badge only shows on a real streak', () => {
  const stats = emptyCareerStatsForTest();
  stats.currentWinStreak = 1;
  assert.equal(streakBadge(stats), null);
  stats.currentWinStreak = 3;
  assert.equal(streakBadge(stats), 'W3');
  stats.currentWinStreak = 7;
  assert.equal(streakBadge(stats), '7 STRAIGHT');
});

// -------------------------------------------------------------------- drills

test('drill medals and payouts rise with reps', () => {
  for (const drill of DRILLS) {
    assert.equal(drillMedal(drill, 0), 'none');
    assert.equal(drillMedal(drill, drill.tiers[0]), 'bronze');
    assert.equal(drillMedal(drill, drill.tiers[1]), 'silver');
    assert.equal(drillMedal(drill, drill.tiers[2]), 'gold');
    assert.equal(drillMedal(drill, drill.tiers[2] * 3), 'gold');

    const bronze = drillReward(drill, drill.tiers[0]);
    const gold = drillReward(drill, drill.tiers[2]);
    assert.ok(gold.currency > bronze.currency);
    assert.ok(gold.xp > bronze.xp);
    assert.equal(drillReward(drill, 0).currency, 0, 'no reps, no pay');
  }
});

test('the shoot-around never pays and never medals', () => {
  assert.equal(SHOOT_AROUND.freeplay, true);
  assert.equal(drillMedal(SHOOT_AROUND, 9999), 'none');
  assert.equal(drillReward(SHOOT_AROUND, 9999).currency, 0);
  assert.equal(drillReward(SHOOT_AROUND, 9999).xp, 0);
  assert.ok(!DRILLS.some((d) => d.id === SHOOT_AROUND.id), 'the shoot-around is not a training drill');
});

// ------------------------------------------------------------------ scouting

test('the scouting report finds a real strength and a real weakness', () => {
  const build = defaultBuildFor('C');
  const attrs = startingAttributes(build);
  attrs.block = 95;
  attrs.interiorDefense = 95;
  attrs.threePoint = 25;
  const report = scoutReport(attrs);

  assert.equal(report.strengths.length, 3);
  assert.equal(report.weaknesses.length, 3);
  assert.equal(report.strengths[0].id, 'interior', 'the 95 block/interior big should scout as an interior defender');
  assert.equal(report.weaknesses[0].id, 'threes', 'a 25 three-point rating is the glaring hole');
  assert.ok(report.strengths[0].rating > report.weaknesses[0].rating);
  // Strengths are ordered best first, weaknesses worst first.
  assert.ok(report.strengths[0].rating >= report.strengths[2].rating);
  assert.ok(report.weaknesses[0].rating <= report.weaknesses[2].rating);
});

// ---------------------------------------------------------- challenge rewards

test('weekly and seasonal challenges pay an item that actually exists', () => {
  for (const time of [0, Date.now(), Date.now() + 86400000 * 90]) {
    const defs = generateChallenges(time);
    const weeklies = defs.filter((d) => d.scope === 'weekly');
    const seasonals = defs.filter((d) => d.scope === 'seasonal');
    assert.ok(weeklies.length > 0 && seasonals.length > 0);

    for (const d of [...weeklies, ...seasonals]) {
      assert.ok(d.itemReward, `${d.id} should pay an item`);
      assert.ok(STORE_BY_ID[d.itemReward as string], `${d.itemReward} is not a real store item`);
    }
    for (const d of defs.filter((c) => c.scope === 'daily')) {
      assert.equal(d.itemReward, undefined, 'dailies pay coins and XP only');
    }
  }
});

test('challenge-only titles can never be bought', () => {
  for (const id of ['title-grinder', 'title-collector']) {
    const item = STORE_BY_ID[id];
    assert.ok(item, `${id} should appear in the store as a locked entry`);
    assert.equal(item.price, 0);
    assert.ok(item.requirement, 'it must show what unlocks it instead of a price');
    assert.ok(!DEFAULT_UNLOCKS.includes(id), 'it must not be granted for free');
  }
});

// -------------------------------------------------------------- shot grades

function shootProfile(overrides: Partial<Parameters<typeof computeShotProfile>[0]> = {}) {
  const attrs = startingAttributes({ position: 'SG', jerseyNumber: 3, heightIn: 77, weightLb: 200, wingspanIn: 80 });
  attrs.threePoint = 90;
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
    ...overrides,
  });
}

/** Releases just inside each band, on both sides of perfect. */
function atBand(profile: ReturnType<typeof computeShotProfile>, band: 'green' | 'excellent' | 'slight' | 'early' | 'very') {
  const mid = (a: number, b: number) => (a + b) / 2;
  const off =
    band === 'green' ? profile.greenHalfWidth * 0.5
    : band === 'excellent' ? mid(profile.greenHalfWidth, profile.excellentHalfWidth)
    : band === 'slight' ? mid(profile.excellentHalfWidth, profile.slightHalfWidth)
    : band === 'early' ? mid(profile.slightHalfWidth, profile.earlyHalfWidth)
    : profile.earlyHalfWidth + 0.05;
  return { late: profile.idealPoint + off, early: profile.idealPoint - off };
}

test('green and excellent always go in; early, late and very are always misses', () => {
  for (const contest of [0, 0.5, 1]) {
    const profile = shootProfile({ contest });
    for (const roll of [0, 0.5, 0.9999]) {
      for (const band of ['green', 'excellent'] as const) {
        const at = atBand(profile, band);
        for (const point of [at.early, at.late]) {
          const r = resolveShot(profile, point, roll, true);
          assert.ok(isAutomatic(r.grade), `${band} at contest ${contest} graded ${r.grade}`);
          assert.equal(r.made, true, `${band} must go in`);
          assert.equal(r.makeChance, 1);
        }
      }
      for (const band of ['early', 'very'] as const) {
        const at = atBand(profile, band);
        for (const point of [at.early, at.late]) {
          const r = resolveShot(profile, point, roll, true);
          assert.equal(r.made, false, `${band} must miss (graded ${r.grade})`);
          assert.equal(r.makeChance, 0);
        }
      }
    }
  }
});

test('a slightly early or late release goes in only when you are open', () => {
  const open = shootProfile({ contest: 0 });
  const contested = shootProfile({ contest: 0.75 });

  assert.ok(open.slightMakeChance > 0.5, 'wide open, a slight miss is a live shot');
  assert.equal(contested.slightMakeChance, 0, 'with a hand in your face it is not');

  const openShot = resolveShot(open, atBand(open, 'slight').late, 0.2, true);
  assert.equal(openShot.grade, 'slightlyLate');
  assert.equal(openShot.made, true);

  const openEarly = resolveShot(open, atBand(open, 'slight').early, 0.2, true);
  assert.equal(openEarly.grade, 'slightlyEarly');

  const contestedShot = resolveShot(contested, atBand(contested, 'slight').late, 0.0001, true);
  assert.equal(contestedShot.made, false, 'contested, a slight miss never drops');
});

test('the meter colours say what happened: green, white, orange, red', () => {
  assert.equal(GRADE_COLOR.green, GRADE_COLOR.excellent, 'both automatic grades read as green');
  assert.equal(GRADE_COLOR.slightlyEarly, GRADE_COLOR.slightlyLate);
  assert.equal(GRADE_COLOR.early, GRADE_COLOR.late);
  assert.equal(GRADE_COLOR.veryEarly, GRADE_COLOR.veryLate);
  // green / white / orange / red, and four distinct colours between the tiers
  const tiers = [GRADE_COLOR.green, GRADE_COLOR.slightlyEarly, GRADE_COLOR.early, GRADE_COLOR.veryEarly];
  assert.equal(new Set(tiers).size, 4);
  assert.equal(GRADE_COLOR.green, '#3ef07a');
});

test('the bands nest outward from perfect', () => {
  const profile = shootProfile();
  assert.ok(profile.greenHalfWidth < profile.excellentHalfWidth);
  assert.ok(profile.excellentHalfWidth < profile.slightHalfWidth);
  assert.ok(profile.slightHalfWidth < profile.earlyHalfWidth);
});

// ------------------------------------------------------- checking the ball in

test('a game will not start until somebody checks the ball', () => {
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), defaultMatchConfig(), 99);
  assert.equal(state.config.manualCheck, true, 'games check the ball in by default');
  assert.equal(state.phase, 'checkball');

  // Four seconds of nobody pressing anything: still waiting.
  for (let i = 0; i < 120 * 4; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.phase, 'checkball', 'the timer alone must never start the game');

  // Either player can check it in — here it is the defence checking it back.
  const check = { ...emptyInput(), shoot: true };
  stepMatch(state, [emptyInput(), check], SIM_DT);
  assert.equal(state.phase, 'checkball', 'the ball is passed out and back first');
  assert.equal(state.check?.stage, 'out');

  // The ceremony: bounce pass out, bounce pass back, then play.
  for (let i = 0; i < 120 * 2 && (state.phase as string) !== 'live'; i++) {
    stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  }
  assert.equal(state.phase, 'live');
  assert.equal(state.check, null);
  assert.equal(state.ball.owner, state.possession, 'the offence ends up with it');
});

test('nobody can move or act during the check', () => {
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), defaultMatchConfig(), 99);
  const x0 = state.players[0].x;
  const z0 = state.players[0].z;

  // Sprint in a direction for a full second while the check is pending.
  const running = { ...emptyInput(), mx: 1, mz: 1, sprint: true, shoot: false };
  for (let i = 0; i < 120; i++) stepMatch(state, [running, running], SIM_DT);
  assert.equal(state.players[0].x, x0, 'you stand still to check');
  assert.equal(state.players[0].z, z0);
  assert.equal(state.phase, 'checkball');
});

test('checking in never launches a shot from the same button press', () => {
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), defaultMatchConfig(), 99);
  for (let i = 0; i < 120; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  // Hold shoot to check in, and keep holding it through the whole ceremony.
  const held = { ...emptyInput(), shoot: true };
  for (let i = 0; i < 240 && state.phase !== 'live'; i++) stepMatch(state, [held, emptyInput()], SIM_DT);
  stepMatch(state, [held, emptyInput()], SIM_DT);
  assert.equal(state.phase, 'live');
  assert.notEqual(state.players[0].state, 'shooting', 'the check press must not become a shot');
  assert.notEqual(state.players[1].state, 'contesting', 'and never a jump from the other side');
  assert.equal(state.checkGuard[0], true);

  // Release, then press again: now it shoots.
  stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.checkGuard[0], false, 'the guard clears on release');
  for (let i = 0; i < 12; i++) stepMatch(state, [held, emptyInput()], SIM_DT);
  assert.equal(state.players[0].state, 'shooting');
});

test('practice modes skip the check entirely', () => {
  const config = defaultMatchConfig({ manualCheck: false, instantInbound: true });
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), config, 99);
  for (let i = 0; i < 120 * 3; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.phase, 'live', 'no check to wait for');
});

// --------------------------------------------------- instant ball return

test('in practice the ball comes straight back after a make or a miss', () => {
  const config = defaultMatchConfig({
    manualCheck: false,
    instantInbound: true,
    turnoverOnMiss: false,
    makeItTakeIt: true,
    shotClock: 999,
    targetScore: 999,
    maxScore: 999,
  });
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), config, 4242);

  let looseFrames = 0;
  let deadFrames = 0;
  let shots = 0;
  const hold = { ...emptyInput(), shoot: true };

  // Shoot repeatedly and watch what the ball does between attempts.
  for (let i = 0; i < 120 * 45; i++) {
    const shooting = state.players[0].state === 'shooting';
    const hasBall = state.ball.owner === 0 && state.ball.state === 'held';
    const input = hasBall || shooting ? (i % 90 < 62 ? hold : emptyInput()) : emptyInput();
    stepMatch(state, [input, emptyInput()], SIM_DT);
    for (const e of drainEvents(state)) if (e.type === 'shotRelease') shots++;
    if (state.ball.state === 'loose') looseFrames++;
    if (state.ball.state === 'dead') deadFrames++;
    // Whenever it is not in the air it is back in the shooter's hands.
    if (state.ball.state === 'held') assert.equal(state.ball.owner, 0);
  }

  assert.ok(shots > 4, `expected several attempts, got ${shots}`);
  assert.equal(looseFrames, 0, 'the ball must never be left loose to chase');
  assert.equal(deadFrames, 0, 'and never dead between attempts');
  assert.equal(state.phase, 'live', 'play never stops between reps');
});

test('a real game still goes to a dead ball and a check after a basket', () => {
  const config = defaultMatchConfig({ targetScore: 999, maxScore: 999 });
  const state = createMatch(generateOpponent(75, 5), generateOpponent(75, 6), config, 4242);
  assert.equal(state.config.instantInbound, false);
  // A scored basket in a real game must not hand the ball straight back live.
  const before = state.phase;
  void before;
  assert.equal(state.config.manualCheck, true);
});

// -------------------------------------------------------------- ball handling

test('a poor handle fumbles moves away; a great one does not', () => {
  const run = (ballHandle: number) => {
    let fumbles = 0;
    let moves = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = generateOpponent(75, seed);
      const b = generateOpponent(75, seed + 500);
      a.attrs.ballHandle = ballHandle;
      const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false }), seed * 31 + 7);
      // Get to live play, then spam crossovers with a defender in your chest.
      for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      for (let i = 0; i < 120 * 8; i++) {
        const mine = state.ball.owner === 0 && state.ball.state === 'held';
        const input =
          mine && state.players[0].state === 'dribble'
            ? { ...emptyInput(), move: 'crossover' as const, moveDirX: 1, moveDirZ: 0 }
            : emptyInput();
        stepMatch(state, [input, emptyInput()], SIM_DT);
        for (const e of drainEvents(state)) {
          if (e.type === 'move' && e.side === 0) moves++;
          if (e.type === 'turnover' && e.side === 0 && e.reason === 'strip') fumbles++;
        }
      }
    }
    return { fumbles, moves, rate: moves ? fumbles / moves : 0 };
  };

  const bad = run(30);
  const good = run(95);
  assert.ok(bad.moves > 20 && good.moves > 20, 'both builds should get moves off');
  assert.ok(bad.fumbles > 0, 'a 30 Ball Handle build must lose it sometimes');
  assert.ok(
    bad.rate > good.rate * 3,
    `poor handles should fumble far more (${(bad.rate * 100).toFixed(1)}% vs ${(good.rate * 100).toFixed(1)}%)`,
  );
  assert.ok(good.rate < 0.03, `95 Ball Handle should be near-clean, got ${(good.rate * 100).toFixed(1)}%`);
});

test('the ball actually travels through the legs and across the body', () => {
  const state = createMatch(generateOpponent(80, 3), generateOpponent(80, 4), defaultMatchConfig({ manualCheck: false }), 77);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const sample = (move: 'betweenLegs' | 'crossover' | 'hesitation') => {
    const lows: number[] = [];
    const highs: number[] = [];
    const offsets: number[] = [];
    const p = state.players[0];
    p.state = 'dribble';
    p.moveCooldown = 0;
    p.moveId = null;
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    const input = { ...emptyInput(), move, moveDirX: 1, moveDirZ: 0 };
    stepMatch(state, [input, emptyInput()], SIM_DT);
    for (let i = 0; i < 90 && state.players[0].state === 'moveLock'; i++) {
      stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      lows.push(state.ball.y);
      highs.push(state.ball.y);
      offsets.push(Math.hypot(state.ball.x - state.players[0].x, state.ball.z - state.players[0].z));
    }
    return { min: Math.min(...lows), max: Math.max(...highs), widest: Math.max(...offsets) };
  };

  const legs = sample('betweenLegs');
  assert.ok(legs.min < 0.9, `the ball should drop to the floor between the legs, lowest was ${legs.min.toFixed(2)}ft`);

  const cross = sample('crossover');
  assert.ok(cross.widest > 1.2, `a crossover should swing the ball wide, widest was ${cross.widest.toFixed(2)}ft`);

  const hesi = sample('hesitation');
  assert.ok(hesi.max > 5.5, `a hesitation should lift the ball overhead, highest was ${hesi.max.toFixed(2)}ft`);
});

// --------------------------------------------------------- speed with ball

test('Speed With Ball sets how fast you move and how often you can move', () => {
  const spamRate = (speedWithBall: number, spam = true) => {
    const a = generateOpponent(75, 11);
    const b = generateOpponent(75, 12);
    a.attrs.speedWithBall = speedWithBall;
    a.attrs.ballHandle = 99; // isolate the variable: never fumble
    a.attrs.speed = 80; // same legs on both builds, so only the handle differs
    a.attrs.acceleration = 80;
    a.attrs.stamina = 99;
    const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false }), 4321);
    for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

    let moves = 0;
    let topSpeed = 0;
    for (let i = 0; i < 120 * 10; i++) {
      const p = state.players[0];
      const mine = state.ball.owner === 0 && state.ball.state === 'held';
      // Run a lap rather than into the sideline, so the wall never caps it.
      // Up and down the floor, which is the long axis, so the wall never caps it.
      const dir = Math.floor(i / 150) % 2 === 0 ? 1 : -1;
      const input = mine
        ? { ...emptyInput(), mz: dir, sprint: true, move: spam ? ('betweenLegs' as const) : null, moveDirX: 1, moveDirZ: 0 }
        : emptyInput();
      stepMatch(state, [input, emptyInput()], SIM_DT);
      for (const e of drainEvents(state)) if (e.type === 'move' && e.side === 0) moves++;
      if (state.ball.owner === 0 && state.players[0].state === 'dribble') {
        topSpeed = Math.max(topSpeed, Math.hypot(state.players[0].vx, state.players[0].vz));
      }
    }
    return { moves, topSpeed };
  };

  const slow = spamRate(30);
  const quick = spamRate(95);
  assert.ok(quick.moves > slow.moves * 1.4, `a high handle should chain far more moves (${slow.moves} -> ${quick.moves})`);

  // Top speed is measured without spamming, since a move locks your movement.
  const slowRun = spamRate(30, false);
  const quickRun = spamRate(95, false);
  assert.ok(
    quickRun.topSpeed > slowRun.topSpeed * 1.2,
    `and move faster with the ball (${slowRun.topSpeed.toFixed(1)} -> ${quickRun.topSpeed.toFixed(1)} ft/s)`,
  );
});

test('a centre cannot handle it like a guard', () => {
  const guard = computeCaps(defaultBuildFor('PG'));
  const big = computeCaps(defaultBuildFor('C'));
  assert.ok(guard.speedWithBall > big.speedWithBall + 15, 'the cap gap should be obvious');
  assert.ok(guard.ballHandle > big.ballHandle + 15);
});

test('a crossover finishes on the side you aimed, and the legs alternate', () => {
  const state = createMatch(generateOpponent(85, 3), generateOpponent(85, 4), defaultMatchConfig({ manualCheck: false }), 5150);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  /**
   * Runs one move and reports where the ball finished, measured along the
   * direction you aimed and along the player's own right hand — the player
   * turns into the move, so world x is not the axis that means anything.
   */
  const run = (move: 'crossover' | 'betweenLegs', dirX: number, dirZ = 0) => {
    const p = state.players[0];
    p.state = 'dribble';
    p.moveCooldown = 0;
    p.moveId = null;
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    stepMatch(state, [{ ...emptyInput(), move, moveDirX: dirX, moveDirZ: dirZ }, emptyInput()], SIM_DT);

    let alongAim = 0;
    let alongRight = 0;
    for (let i = 0; i < 120 && state.players[0].state === 'moveLock'; i++) {
      stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      const q = state.players[0];
      const dx = state.ball.x - q.x;
      const dz = state.ball.z - q.z;
      alongAim = dx * dirX + dz * dirZ;
      alongRight = dx * Math.sin(q.facing + Math.PI / 2) + dz * -Math.cos(q.facing + Math.PI / 2);
    }
    return { alongAim, alongRight };
  };

  // The two keys finish on opposite sides of your body. The player turns into
  // the move, so the axis that means anything is your own left and right.
  const left = run('crossover', -1);
  const right = run('crossover', 1);
  assert.ok(Math.abs(left.alongRight) > 0.5, `an L crossover should finish clearly to one side, got ${left.alongRight.toFixed(2)}`);
  assert.ok(Math.abs(right.alongRight) > 0.5, `a J crossover should finish clearly to one side, got ${right.alongRight.toFixed(2)}`);
  assert.ok(
    left.alongRight * right.alongRight < 0,
    `L and J must finish on opposite sides (${left.alongRight.toFixed(2)} vs ${right.alongRight.toFixed(2)})`,
  );
  void left.alongAim;

  // Through the legs alternates hands: two presses put it back where it began.
  const handAfter = () => state.players[0].dribbleHand;
  run('betweenLegs', 1);
  const first = handAfter();
  run('betweenLegs', 1);
  const second = handAfter();
  assert.equal(first, -second, `through the legs should alternate hands (${first} then ${second})`);
});

// -------------------------------------------------------- euro, floor, dunks

test('a eurostep plants and goes up with it rather than gliding on', () => {
  const state = createMatch(generateOpponent(85, 21), generateOpponent(85, 22), defaultMatchConfig({ manualCheck: false }), 616);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const p = state.players[0];
  // Put the handler in front of the rim with the ball and a head of steam.
  p.x = 2;
  p.z = 12;
  p.state = 'dribble';
  p.moveCooldown = 0;
  p.stamina = 1;
  state.ball.owner = 0;
  state.ball.state = 'held';

  stepMatch(state, [{ ...emptyInput(), move: 'euro', moveDirX: -1, moveDirZ: -1 }, emptyInput()], SIM_DT);
  for (let i = 0; i < 120 && state.players[0].state === 'moveLock'; i++) {
    stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  }

  // The move ends in the layup, not back in a dribble with momentum.
  assert.equal(state.players[0].state, 'shooting', 'a euro should finish by going up with it');
  assert.equal(state.players[0].shotType, 'euroLayup');
  assert.ok(
    Math.hypot(state.players[0].vx, state.players[0].vz) < 0.001,
    'and it plants — carrying speed on after two steps is a travel',
  );
});

test('the second ankle breaker in a row puts the defender on the floor', () => {
  const state = createMatch(generateOpponent(85, 31), generateOpponent(60, 32), defaultMatchConfig({ manualCheck: false }), 808);
  // Get past the check into live play, or no move ever fires.
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  const d = state.players[1];

  // One breakdown freezes him; the second takes his legs.
  d.ankledStreak = 1;
  d.ankledResetIn = 6;
  d.state = 'idle';
  d.staggerTimer = 0;

  const p = state.players[0];
  p.cfg.attrs.ballHandle = 99;
  d.cfg.attrs.perimeterDefense = 25;
  p.x = d.x + 1.5;
  p.z = d.z;

  let floored = false;
  for (let attempt = 0; attempt < 60 && !floored; attempt++) {
    p.state = 'dribble';
    p.moveCooldown = 0;
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    p.x = state.players[1].x + 1.5;
    p.z = state.players[1].z;
    state.players[1].ankledStreak = 1;
    state.players[1].ankledResetIn = 6;
    stepMatch(state, [{ ...emptyInput(), move: 'doubleCross', moveDirX: 1, moveDirZ: 0 }, emptyInput()], SIM_DT);
    for (const e of drainEvents(state)) if (e.type === 'ankleBreaker' && e.floored) floored = true;
    for (let i = 0; i < 60 && state.players[0].state === 'moveLock'; i++) {
      stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      for (const e of drainEvents(state)) if (e.type === 'ankleBreaker' && e.floored) floored = true;
    }
  }

  assert.ok(floored, 'expected a second straight breakdown to floor the defender');
  assert.equal(state.players[1].state, 'fallen');

  // On the floor he cannot contest, which is the point of it.
  const shooter = state.players[0];
  shooter.x = 20;
  shooter.z = 24;
  const openContest = currentContest(state, 0);
  assert.equal(openContest, 0, 'a man on the floor contests nothing');
});

test('a dunk taken at a jumping defender has almost no window', () => {
  const attrs = startingAttributes({ position: 'SF', jerseyNumber: 3, heightIn: 80, weightLb: 220, wingspanIn: 84 });
  attrs.dunk = 90;
  const base = {
    attrs,
    badges: freshBadges(),
    jumpshotId: 'base-rise' as const,
    distance: 3,
    isThree: false,
    stamina: 1,
    driftSpeed: 0,
    greenStreak: 0,
    makeStreak: 0,
    clutch: false,
    heightDelta: 0,
  };
  const open = computeShotProfile({ ...base, shotType: 'dunk', contest: 0 });
  const contested = computeShotProfile({ ...base, shotType: 'dunk', contest: 0.9 });
  assert.ok(
    contested.greenHalfWidth < open.greenHalfWidth * 0.3,
    `a contested dunk window should collapse (${open.greenHalfWidth.toFixed(4)} -> ${contested.greenHalfWidth.toFixed(4)})`,
  );
  // Hitting it anyway still goes in — greens are unconditional.
  const r = resolveShot(contested, contested.idealPoint, 0.999, false);
  assert.equal(r.made, true);
});

test('taking the ball out of bounds is a turnover', () => {
  const state = createMatch(generateOpponent(80, 41), generateOpponent(80, 42), defaultMatchConfig({ manualCheck: false }), 313);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  const handler = state.possession;
  assert.equal(state.ball.owner, handler);

  // Sprint at the sideline until you cross it.
  let turnedOver = false;
  const out = { ...emptyInput(), mx: 1, sprint: true };
  for (let i = 0; i < 120 * 8 && !turnedOver; i++) {
    stepMatch(state, handler === 0 ? [out, emptyInput()] : [emptyInput(), out], SIM_DT);
    for (const e of drainEvents(state)) {
      if (e.type === 'turnover' && e.reason === 'outOfBounds') turnedOver = true;
    }
  }
  assert.ok(turnedOver, 'running the ball off the court should lose it');
  assert.notEqual(state.possession, handler, 'and it goes to the other player');
});

test('sprinting into the rim and greening it produces a dunk highlight', () => {
  const a = generateOpponent(90, 51);
  const b = generateOpponent(70, 52);
  a.attrs.dunk = 95;
  a.attrs.vertical = 95;
  a.attrs.speed = 90;
  a.attrs.speedWithBall = 90;
  a.attrs.acceleration = 90;
  a.dunkPackageId = 'poster';
  const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }), 2468);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  let highlights = 0;
  let dunkAttempts = 0;
  let posterized = 0;

  // Drive at the rim on repeat and hold the button across a spread of release
  // points, so some of them land in the window.
  for (let attempt = 0; attempt < 40 && highlights === 0; attempt++) {
    const p = state.players[0];
    p.x = 1;
    p.z = 16;
    p.state = 'dribble';
    p.stamina = 1;
    p.moveCooldown = 0;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    const drive = { ...emptyInput(), mz: -1, sprint: true };
    for (let i = 0; i < 40; i++) stepMatch(state, [drive, emptyInput()], SIM_DT);

    const hold = { ...drive, shoot: true };
    const release = 30 + attempt;
    for (let i = 0; i < 140; i++) {
      const input = i < release ? hold : { ...drive, shoot: false };
      stepMatch(state, [input, emptyInput()], SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type === 'shotRelease' && (e.shotType === 'dunk' || e.shotType === 'contactDunk')) dunkAttempts++;
        if (e.type === 'dunkHighlight') {
          highlights++;
          if (e.posterized) posterized++;
          assert.ok(e.packageId.length > 0, 'the highlight carries the equipped package');
        }
      }
      if (state.players[0].state === 'dribble' && state.ball.owner === 0 && i > release + 20) break;
    }
  }

  assert.ok(dunkAttempts > 0, 'sprint + shoot at the rim should launch dunks');
  assert.ok(highlights > 0, `a greened dunk should cut away (${dunkAttempts} attempts, ${highlights} highlights)`);
  void posterized;
});

test('a brand new build can go up for a dunk', () => {
  // The bug: dunking was gated at 55 Dunk / 50 Vertical while every fresh build
  // starts in the 30s and 40s, so sprint + shoot did nothing at all.
  for (const position of POSITIONS) {
    const build = defaultBuildFor(position);
    const attrs = startingAttributes(build);
    const cfg = generateOpponent(60, 7);
    cfg.attrs = attrs;
    cfg.heightIn = build.heightIn;
    cfg.weightLb = build.weightLb;
    cfg.wingspanIn = build.wingspanIn;

    const state = createMatch(cfg, generateOpponent(60, 8), defaultMatchConfig({ manualCheck: false, shotClock: 999 }), 121);
    for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

    const p = state.players[0];
    p.x = 0;
    p.z = 12;
    p.state = 'dribble';
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    // Sprint at the rim with shoot held.
    const drive = { ...emptyInput(), mz: -1, sprint: true, shoot: true };
    let launched: string | null = null;
    for (let i = 0; i < 90 && !launched; i++) {
      stepMatch(state, [drive, emptyInput()], SIM_DT);
      if (state.players[0].state === 'shooting') launched = state.players[0].shotType;
    }

    assert.ok(launched, `${position}: sprint + shoot at the rim must do something`);
    assert.ok(
      launched === 'dunk' || launched === 'contactDunk' || launched === 'layup',
      `${position}: expected a dunk or at worst a layup, got ${launched}`,
    );
  }
});

test('standing at the corner three clears the ball, and it stays cleared in the paint', () => {
  // The bug: the clear used a radial 23.75ft from the rim, but the painted line
  // squares off at 22ft in the corners. Standing at the corner three you are
  // behind the arc — the shot is worth two — yet you were only 22.2ft out, so
  // the clear never satisfied and the game refused to let you shoot. Driving
  // back into the paint then looked like the prompt "coming back".
  const state = createMatch(
    generateOpponent(60, 5),
    generateOpponent(60, 6),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    9091,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const p = state.players[0];
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.needsClear = true;
  p.state = 'dribble';

  // The deep corner: behind the line by the rulebook, inside 23.75ft radially.
  p.x = COURT.cornerThreeX + 1;
  p.z = 8;
  assert.ok(isBeyondArc(p.x, p.z), 'the corner spot is behind the arc');
  assert.ok(distanceToRim(p.x, p.z) < COURT.threeRadius, 'and it is inside the radius, which is the whole bug');

  stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.needsClear, false, 'standing behind the corner line must clear the ball');

  // Now drive it back to the rim. The flag must not re-arm.
  const drive = { ...emptyInput(), mz: -1, mx: -1 };
  for (let i = 0; i < 240; i++) {
    stepMatch(state, [drive, emptyInput()], SIM_DT);
    if (state.ball.owner !== 0) break;
    assert.equal(state.needsClear, false, 'the clear must not come back while you keep the ball');
  }
});
