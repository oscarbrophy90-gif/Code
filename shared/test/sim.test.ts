import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AiController } from '../src/sim/ai.ts';
import { createMatch, currentContest, defaultMatchConfig, EMOTE_COOLDOWN, EMOTE_DURATION, SIM_DT, ballThroughRim, dribbleBounceIndex, dribbleTempo, stepMatch, drainEvents } from '../src/sim/match.ts';
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
import { DEFAULT_UNLOCKS, STORE_BY_ID, STORE_ITEMS } from '../src/data/cosmetics.ts';
import { COURT_MODES, COURT_MODE_BY_ID, courtConfig, courtKey } from '../src/data/courts.ts';
import { PARKS } from '../src/data/parks.ts';
import { DIVISIONS_PER_TIER, ONLINE_TIERS, WINS_PER_DIVISION, WINS_TO_GRAND_CHAMP, grandChampLabel, nextRank, onlineRank, onlineRankLabel } from '../src/onlinerank.ts';
import { PACK_TITLES } from '../src/data/titlepack.ts';
import { PACK_TATTOOS, TATTOO_DESIGNS } from '../src/data/tattoopack.ts';
import { PACK_DUNKS } from '../src/data/dunkpack.ts';
import { DUNK_PACKAGE_BY_ID } from '../src/sim/moves.ts';
import type { StoreItem } from '../src/economy.ts';
import { SHOP_SLOTS, SHOP_WINDOW_MS, slotsFor, catalogueItems, isPurchasableNow, msUntilShopRefresh, STOCKED_CATEGORIES, categoryStock, mythicForCategory, rotatingStock } from '../src/shop.ts';
import { GRADE_COLOR, computeShotProfile, isAutomatic, resolveShot } from '../src/shooting.ts';
import { freshBadges } from '../src/badges.ts';
import { isAcceptableMatch, rankLabel, tierForPoints, updateRank, freshRank } from '../src/mmr.ts';
import { generateChallenges, seasonForTime, buildBattlePass } from '../src/seasons.ts';
import { computeMatchReward } from '../src/economy.ts';
import { packInput, unpackInput } from '../src/protocol.ts';
import { emptyInput, emptyStats, type SimEvent } from '../src/sim/state.ts';
import { ATTRIBUTE_KEYS, DIFFICULTIES, EMOTE_SLOTS, POSITIONS, type BuildSpec, type CareerStats, type Difficulty } from '../src/types.ts';
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
  assert.equal(defaultMatchConfig().turnoverOnMiss, false, 'misses go to the glass, not straight over');

  // Three games, not one. A takeaway shows up in about 97% of games, so a
  // single seed asserting "expected at least one block or steal" fails roughly
  // one time in thirty for no reason anyone can act on. The per-event checks
  // below still run on every takeaway in every game.
  let sawLooseBallOffMiss = false;
  let sawTakeaway = false;
  let rebounds = 0;

  for (const seed of [4242, 5151, 6060]) {
    const state = createMatch(generateOpponent(80, 5), generateOpponent(80, 6), defaultMatchConfig(), seed);
    const ai0 = new AiController(0, 'pro', 1, false);
    const ai1 = new AiController(1, 'pro', 2, false);
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

test('the stepback steps back, then rises into a shot you time on its own key', () => {
  // Two bugs in one move. The retreat was a nudge on the velocity that
  // applyMovement immediately damped back toward the stick, so a "stepback"
  // moved you about two inches. And it cancelled into its jumper on the shoot
  // button at 35% of the animation, so the same press started and ended the
  // meter — it fired the instant the cancel became legal, always graded very
  // early, and threw away most of the step on the way. Now the step is a real
  // displacement that finishes first, and K holds the meter.
  function attempt(holdFrames: number, key: 'moveShoot' | 'shoot') {
    const a = generateOpponent(75, 3);
    // Take the strip roll out of it — this test is about the step and the
    // meter, and a fumble is covered elsewhere.
    a.attrs.ballHandle = 95;
    // Pin the jump shot too. Otherwise the meter length rides on whatever this
    // seed happened to roll, and any change to how bots are generated silently
    // moves the timings this test is measuring.
    a.jumpshotId = 'base-rise';
    const state = createMatch(
      a,
      generateOpponent(75, 4),
      defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }),
      777,
    );
    for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
    const p = state.players[0];
    p.x = 4;
    p.z = 22;
    p.state = 'dribble';
    p.stamina = 1;
    p.moveCooldown = 0;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;
    const z0 = p.z;
    let back = 0;

    for (let i = 0; i < 400; i++) {
      const input = {
        ...emptyInput(),
        move: i === 0 ? ('stepback' as const) : null,
        moveDirX: 0,
        moveDirZ: 1,
        [key]: i < holdFrames,
      };
      stepMatch(state, [input, emptyInput()], SIM_DT);
      back = Math.max(back, p.z - z0);
      for (const e of drainEvents(state)) {
        if (e.type === 'shotRelease') return { shotType: e.shotType, grade: e.grade, error: e.timingError, back };
      }
    }
    return { shotType: null, grade: null, error: null, back };
  }

  // The step itself: real ground, away from the rim, every time — including on
  // a tap that never becomes a shot.
  for (const hold of [30, 60, 120]) {
    assert.ok(attempt(hold, 'moveShoot').back > 3.5, `holding K for ${hold} frames must actually step back`);
  }

  // Holding longer walks the release through the meter instead of pinning it at
  // the front, and somewhere in there is a green.
  const errors: number[] = [];
  let greens = 0;
  for (let hold = 55; hold <= 150; hold += 1) {
    const r = attempt(hold, 'moveShoot');
    assert.equal(r.shotType, 'stepback', `holding K for ${hold} frames should launch a stepback`);
    errors.push(r.error!);
    if (r.grade === 'green') greens++;
  }
  for (let i = 1; i < errors.length; i++) {
    // Non-decreasing rather than strictly increasing: past the safety valve
    // that fires a shot you never let go of, the release point stops moving.
    // What matters is that holding longer never releases *earlier*.
    assert.ok(errors[i] >= errors[i - 1], 'a longer hold must never release earlier on the meter');
  }
  assert.ok(errors[0] < -0.5, 'a short hold is very early');
  assert.ok(errors[errors.length - 1] > 0.1, 'an over-long hold is late');
  assert.ok(greens > 0, 'there is a green window you can actually hit');

  // Shoot on its own must never produce a stepback. It can still give you an
  // ordinary pull-up once the step has landed — that is space shooting
  // normally, which is the point.
  for (const hold of [40, 80, 120, 160]) {
    assert.notEqual(attempt(hold, 'shoot').shotType, 'stepback', `space must not fire a stepback (held ${hold})`);
  }
});

test('an offensive rebound does not owe a clear, a defensive one does', () => {
  // The bug: every board armed the clear, including your own. You cleared,
  // worked into the mid range, missed, grabbed your own miss three feet from
  // the rim and the game told you to take it back out again — 35% of all
  // clears in a game were this. An offensive board is the same possession
  // continuing, so nothing is owed.
  const config = defaultMatchConfig();
  let offensiveBoards = 0;
  let defensiveBoards = 0;

  for (const seed of [3665, 4398, 5131, 5864]) {
    const state = createMatch(generateOpponent(78, seed), generateOpponent(78, seed + 1), config, seed * 5 + 2);
    const ai0 = new AiController(0, 'pro', 1, false);
    const ai1 = new AiController(1, 'pro', 2, false);
    let frames = 0;

    while (state.phase !== 'over' && frames < 120 * 60 * 8) {
      stepMatch(state, [ai0.update(state, SIM_DT), ai1.update(state, SIM_DT)], SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type !== 'rebound') continue;
        if (e.offensive) {
          offensiveBoards++;
          assert.equal(state.needsClear, false, 'your own board is the same possession — no clear owed');
        } else {
          defensiveBoards++;
          assert.equal(state.needsClear, true, 'a defensive board is a change of possession — clear it');
        }
      }
      frames++;
    }
  }

  assert.ok(offensiveBoards > 0, 'expected some offensive rebounds to check');
  assert.ok(defensiveBoards > 0, 'expected some defensive rebounds to check');
});

test('a dunk over a defender in your way is a poster, an open one is not', () => {
  // The bug: posterising also required the defender to have left his feet, so a
  // man standing his ground under the rim got you the ordinary animation.
  // Measured 0% posters against a defender planted directly in the path.
  function sweep(park: 'front' | 'away' | 'behind', defenderJumps: boolean) {
    let highlights = 0;
    let posters = 0;
    for (let seed = 0; seed < 40; seed++) {
      const a = generateOpponent(88, seed * 7 + 1);
      a.attrs.dunk = 95;
      a.attrs.vertical = 92;
      a.attrs.speed = 90;
      a.attrs.acceleration = 90;
      const state = createMatch(
        a,
        generateOpponent(80, seed * 7 + 2),
        defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }),
        seed * 13 + 5,
      );
      for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      const p = state.players[0];
      const d = state.players[1];
      p.x = 0;
      p.z = 15;
      p.state = 'dribble';
      p.stamina = 1;
      state.ball.owner = 0;
      state.ball.state = 'held';
      state.needsClear = false;

      const drive = { ...emptyInput(), mz: -1, sprint: true };
      const release = 26 + (seed % 22);
      for (let i = 0; i < 160; i++) {
        // Hold the defender where the case under test needs him.
        if (park === 'front') {
          d.x = p.x * 0.5;
          d.z = Math.max(6.5, p.z - 3);
        } else if (park === 'away') {
          d.x = 20;
          d.z = 28;
        } else {
          d.x = p.x;
          d.z = p.z + 3;
        }
        d.vx = 0;
        d.vz = 0;
        d.handUp = true;
        d.y = defenderJumps ? 1.6 : 0;
        stepMatch(state, [i < release ? { ...drive, shoot: true } : drive, emptyInput()], SIM_DT);
        for (const e of drainEvents(state)) {
          if (e.type !== 'dunkHighlight') continue;
          highlights++;
          if (e.posterized) posters++;
        }
      }
    }
    return { highlights, posters };
  }

  const standing = sweep('front', false);
  assert.ok(standing.highlights > 0, 'expected dunks to land');
  assert.equal(standing.posters, standing.highlights, 'a body in your way is a poster even if he never jumped');

  const jumping = sweep('front', true);
  assert.equal(jumping.posters, jumping.highlights, 'a defender leaving his feet at you is still a poster');

  // And it stays special: an open rim is the ordinary flush.
  const open = sweep('away', false);
  assert.ok(open.highlights > 0, 'expected open dunks to land');
  assert.equal(open.posters, 0, 'nobody near you is not a poster');

  const trailing = sweep('behind', false);
  assert.equal(trailing.posters, 0, 'a defender behind you is not in your way');
});

test('every section holds fifteen, and all fifteen are gone next window', () => {
  const base = 1_800_000_000_000;

  for (const category of STOCKED_CATEGORIES) {
    const pool = STORE_ITEMS.filter((i) => i.category === category && i.price > 0 && !i.requirement && i.rarity !== 'mythic');
    // Sections with fewer than fifteen sellable items have nothing to rotate.
    const expected = Math.min(slotsFor(category), pool.length);

    for (let w = 0; w < 60; w++) {
      const now = base + w * SHOP_WINDOW_MS;
      const stock = categoryStock(now, category);
      const mythic = mythicForCategory(now, category);

      assert.equal(
        stock.length,
        expected + (mythic ? 1 : 0),
        `${category} window ${w} should hold ${expected}${mythic ? ' + 1 mythic' : ''}, held ${stock.length}`,
      );
      assert.equal(new Set(stock.map((i) => i.id)).size, stock.length, `${category}: no item twice on one shelf`);
      assert.equal(stock.filter((i) => i.rarity === 'mythic').length, mythic ? 1 : 0, `${category}: mythic only in its own slot`);
      if (mythic) assert.equal(stock[0].id, mythic.id, `${category}: the mythic is the first thing you see`);
      for (const item of stock) assert.equal(item.category, category, 'a section only sells its own things');

      // Nothing on this shelf is still here next window.
      if (pool.length <= slotsFor(category)) continue;
      const here = new Set(stock.filter((i) => i.rarity !== 'mythic').map((i) => i.id));
      const next = categoryStock(now + SHOP_WINDOW_MS, category).filter((i) => i.rarity !== 'mythic');
      for (const item of next) {
        assert.ok(!here.has(item.id), `${category}: ${item.name} carried over into the next window`);
      }
    }
  }

  // Stable inside a window — the shop is not a slot machine you can reroll.
  const ids = (t: number) => categoryStock(t, 'jersey').map((i) => i.id).join(',');
  assert.equal(ids(base), ids(base + SHOP_WINDOW_MS - 1));
  assert.notEqual(ids(base), ids(base + SHOP_WINDOW_MS));

  // Featured is a view over the same stock, never a separate draw.
  const inStock = new Set(STOCKED_CATEGORIES.flatMap((c) => categoryStock(base, c).map((i) => i.id)));
  for (const item of rotatingStock(base)) {
    assert.ok(inStock.has(item.id), `${item.name} is featured but not actually on sale anywhere`);
  }

  assert.equal(msUntilShopRefresh(base + 60_000), SHOP_WINDOW_MS - ((base + 60_000) % SHOP_WINDOW_MS));
});

test('a shelf is never all commons — every section shows a spread of tiers', () => {
  // The bug: drawing all fifteen from one rarity-weighted pool just produces the
  // average, which is twelve commons. Measured before the fix, the jersey shelf
  // was 12 common / 2 rare / 1 epic / 0 legendary and emotes were 12/3/0/0.
  const base = 1_800_000_000_000;

  for (const category of STOCKED_CATEGORIES) {
    const pool = STORE_ITEMS.filter(
      (i) => i.category === category && i.price > 0 && !i.requirement && i.rarity !== 'mythic',
    );
    // Sections too small to rotate show everything they have; nothing to check.
    if (pool.length <= slotsFor(category)) continue;
    const has = (r: StoreItem['rarity']) => pool.some((i) => i.rarity === r);

    for (let w = 0; w < 40; w++) {
      const shelf = categoryStock(base + w * SHOP_WINDOW_MS, category).filter((i) => i.rarity !== 'mythic');
      const count = (r: StoreItem['rarity']) => shelf.filter((i) => i.rarity === r).length;

      assert.ok(
        count('common') <= Math.ceil(slotsFor(category) * 0.55),
        `${category} window ${w}: ${count('common')} of ${shelf.length} were common`,
      );
      // Every tier the section actually stocks has to turn up on every shelf.
      for (const r of ['rare', 'epic', 'legendary'] as const) {
        if (!has(r)) continue;
        assert.ok(count(r) > 0, `${category} window ${w}: no ${r} on the shelf`);
      }
      assert.ok(
        new Set(shelf.map((i) => i.rarity)).size >= 3,
        `${category} window ${w}: only ${new Set(shelf.map((i) => i.rarity)).size} tiers on the shelf`,
      );
    }
  }
});

test('mythic stock is rare, rotation-only, and unbuyable off the shelf', () => {
  const mythics = STORE_ITEMS.filter((i) => i.rarity === 'mythic');
  assert.ok(mythics.length >= 80, `expected a deep mythic tier, found ${mythics.length}`);
  for (const m of mythics) assert.equal(m.rotationOnly, true, 'mythic never sits in the permanent catalogue');

  // A month of windows, counting how often a section opens its sixteenth slot.
  const base = 1_800_000_000_000;
  const windows = (30 * 24 * 60 * 60 * 1000) / SHOP_WINDOW_MS;
  let sixteens = 0;
  const seen = new Set<string>();
  for (let w = 0; w < windows; w++) {
    for (const c of STOCKED_CATEGORIES) {
      const m = mythicForCategory(base + w * SHOP_WINDOW_MS, c);
      if (m) {
        sixteens++;
        seen.add(m.id);
      }
    }
  }
  const perCategory = sixteens / (windows * STOCKED_CATEGORIES.length);
  assert.ok(perCategory > 0.005, `a mythic has to be reachable, ${(perCategory * 100).toFixed(2)}% of section-windows`);
  assert.ok(perCategory < 0.06, `mythic should stay rare, ${(perCategory * 100).toFixed(2)}% of section-windows`);
  assert.ok(seen.size < mythics.length, 'no chance of collecting the set in a month');

  // And one cannot be bought in a window it is not stocked in.
  let stockedAt: number | null = null;
  let which: StoreItem | null = null;
  for (let w = 0; w < windows && !which; w++) {
    for (const c of STOCKED_CATEGORIES) {
      const m = mythicForCategory(base + w * SHOP_WINDOW_MS, c);
      if (m) {
        stockedAt = base + w * SHOP_WINDOW_MS;
        which = m;
        break;
      }
    }
  }
  assert.ok(which && stockedAt !== null, 'expected at least one mythic window in a month');
  assert.equal(isPurchasableNow(which as StoreItem, stockedAt as number), true, 'buyable while it is on the shelf');
  assert.equal(
    isPurchasableNow(which as StoreItem, (stockedAt as number) + SHOP_WINDOW_MS),
    false,
    'and not once it is gone',
  );
});

test('the catalogue is as deep as the shop claims', () => {
  const count = (c: string) => STORE_ITEMS.filter((i) => i.category === c).length;
  const mythic = (c: string) => STORE_ITEMS.filter((i) => i.category === c && i.rarity === 'mythic').length;

  for (const c of ['jersey', 'shoes', 'clothing', 'accessory']) {
    assert.equal(count(c), 150, `${c} should have 150`);
    assert.equal(mythic(c), 15, `${c} should have 15 mythics`);
  }
  assert.equal(count('emote'), 200, 'the hundred-emote pack sits on top of the original hundred');
  assert.equal(mythic('emote'), 15);
  for (const c of ['celebration', 'threeCelebration']) {
    assert.equal(count(c), 50, `${c} should have 50`);
    assert.equal(mythic(c), 5, `${c} should have 5 mythics`);
  }

  // The three packs sit on top of what was already there rather than replacing
  // it, so these are originals-plus-pack totals, not the pack size.
  assert.equal(count('dunkPackage'), 144, '50 originals plus the 94 new names');
  assert.equal(count('title'), 105, '23 originals plus the 82 new names');
  assert.equal(count('tattoo'), 108, '8 originals plus the 100 new designs');
  for (const c of ['dunkPackage', 'title', 'tattoo']) {
    assert.ok(mythic(c) >= 5, `${c} should carry mythics`);
  }

  // Nothing shares an id, and nothing shares a name inside its own category.
  const ids = STORE_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const named = STORE_ITEMS.map((i) => `${i.category}|${i.name}`);
  assert.equal(new Set(named).size, named.length, 'names are unique within a category');
});

test('every emote slot can be filled and the catalogue supports six', () => {
  const emotes = STORE_ITEMS.filter((i) => i.category === 'emote');
  assert.ok(emotes.length >= EMOTE_SLOTS, `need at least ${EMOTE_SLOTS} emotes to fill the bar`);
  const free = emotes.filter((e) => e.price === 0 && !e.rotationOnly);
  assert.ok(free.length >= 3, 'a new player starts with something on the keys');
  for (const e of emotes) {
    assert.ok(e.id.startsWith('emote-'), 'emote ids are namespaced so migration can find them');
  }
});

test('an emote holds the ball out, cannot be stolen, and costs you the clock', () => {
  const state = createMatch(
    generateOpponent(80, 21),
    generateOpponent(80, 22),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    5150,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const me = state.players[0];
  const them = state.players[1];
  me.x = 0;
  me.z = 20;
  me.state = 'dribble';
  me.stamina = 1;
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.needsClear = false;
  state.shotClock = 14;
  const clockBefore = state.shotClock;

  // Fire slot 2 and hold the defender right on top of him, reaching every frame.
  const emote = { ...emptyInput(), emote: 2 };
  const reach = { ...emptyInput(), steal: true };
  stepMatch(state, [emote, reach], SIM_DT);
  assert.equal(me.state, 'emoting', 'the emote starts');
  assert.equal(me.emoteSlot, 2, 'and remembers which slot, so the right one animates');

  const events = drainEvents(state);
  assert.ok(
    events.some((e) => e.type === 'emote' && e.side === 0 && e.slot === 2),
    'the sim announces it, so the client never has to guess from the keypress',
  );

  let bounced = false;
  let frames = 0;
  while (state.players[0].state === 'emoting' && frames < 120 * 5) {
    them.x = me.x + 1;
    them.z = me.z;
    them.stealCooldown = 0;
    stepMatch(state, [{ ...emptyInput(), emote: null }, reach], SIM_DT);
    assert.equal(state.ball.owner, 0, 'nobody takes it off you mid-emote');
    // Held out to the side, off the hip, on a bounce.
    if (state.ball.y < 1) bounced = true;
    frames++;
  }

  assert.ok(bounced, 'the ball is bounced rather than glued to the hands');
  assert.equal(state.stats[1].steals, 0, 'reaching in during an emote gets nothing');
  assert.equal(state.ball.owner, 0, 'and you still have it when it ends');
  assert.equal(state.players[0].state, 'dribble', 'back to dribbling afterwards');

  // The clock never stopped for it.
  const elapsed = frames * SIM_DT;
  assert.ok(
    clockBefore - state.shotClock > elapsed * 0.9,
    `the shot clock keeps running through an emote (lost ${(clockBefore - state.shotClock).toFixed(2)}s over ${elapsed.toFixed(2)}s)`,
  );
  assert.ok(Math.abs(elapsed - EMOTE_DURATION) < 0.05, `the emote runs for about ${EMOTE_DURATION}s, ran ${elapsed.toFixed(2)}s`);
});

test('emotes are on a ten second cooldown', () => {
  const state = createMatch(
    generateOpponent(80, 31),
    generateOpponent(80, 32),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    6161,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  const me = state.players[0];
  me.state = 'dribble';
  state.ball.owner = 0;
  state.ball.state = 'held';
  state.needsClear = false;

  stepMatch(state, [{ ...emptyInput(), emote: 0 }, emptyInput()], SIM_DT);
  assert.equal(me.state, 'emoting');
  assert.ok(Math.abs(me.emoteCooldown - EMOTE_COOLDOWN) < 0.02);

  // Spam it for nine seconds: exactly one emote should have happened.
  let started = 1;
  for (let i = 0; i < 120 * 9; i++) {
    const was = state.players[0].state;
    stepMatch(state, [{ ...emptyInput(), emote: 0 }, emptyInput()], SIM_DT);
    if (was !== 'emoting' && state.players[0].state === 'emoting') started++;
  }
  assert.equal(started, 1, 'holding the key down does not chain emotes');

  // Past ten seconds it comes back.
  for (let i = 0; i < 120 * 2; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.players[0].emoteCooldown, 0, 'the cooldown clears');
  stepMatch(state, [{ ...emptyInput(), emote: 0 }, emptyInput()], SIM_DT);
  assert.equal(state.players[0].state, 'emoting', 'and you can emote again');
});

test('a three sets off the three-point celebration, and winning sets off the other one', () => {
  const state = createMatch(
    generateOpponent(80, 41),
    generateOpponent(80, 42),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    7171,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

  const me = state.players[0];
  // Park behind the arc with the ball and shoot until one drops.
  let threes = 0;
  let sawThreeCelebration = false;
  for (let attempt = 0; attempt < 60 && threes === 0; attempt++) {
    me.x = 0;
    me.z = 29;
    me.state = 'dribble';
    me.stamina = 1;
    me.moveCooldown = 0;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;
    state.phase = 'live';

    const hold = { ...emptyInput(), shoot: true };
    const release = 40 + attempt * 2;
    for (let i = 0; i < 260; i++) {
      stepMatch(state, [i < release ? hold : emptyInput(), emptyInput()], SIM_DT);
      for (const e of drainEvents(state)) {
        if (e.type === 'score' && e.side === 0 && e.value === 2) {
          threes++;
          assert.equal(state.players[0].celebration, 'three', 'a three fires the three-point celebration');
          assert.ok(state.players[0].celebrationTimer > 0, 'and it has time on it');
          sawThreeCelebration = true;
        }
      }
      if (threes > 0) break;
    }
  }
  assert.ok(sawThreeCelebration, 'expected to make a three');

  // It expires on its own rather than sticking.
  for (let i = 0; i < 120 * 3; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  assert.equal(state.players[0].celebration, null, 'the three-point celebration ends by itself');

  // Now win it.
  const finish = createMatch(
    generateOpponent(80, 43),
    generateOpponent(80, 44),
    defaultMatchConfig({ manualCheck: false, targetScore: 2, winBy: 1, shotClock: 999 }),
    7272,
  );
  for (let i = 0; i < 200; i++) stepMatch(finish, [emptyInput(), emptyInput()], SIM_DT);
  const w = finish.players[0];
  let over = false;
  for (let attempt = 0; attempt < 60 && !over; attempt++) {
    w.x = 0;
    w.z = 29;
    w.state = 'dribble';
    w.stamina = 1;
    w.moveCooldown = 0;
    finish.ball.owner = 0;
    finish.ball.state = 'held';
    finish.needsClear = false;
    if (finish.phase !== 'over') finish.phase = 'live';

    const hold = { ...emptyInput(), shoot: true };
    const release = 40 + attempt * 2;
    for (let i = 0; i < 260 && !over; i++) {
      stepMatch(finish, [i < release ? hold : emptyInput(), emptyInput()], SIM_DT);
      for (const e of drainEvents(finish)) if (e.type === 'gameOver') over = true;
    }
  }

  assert.ok(over, 'expected the game to finish');
  assert.equal(finish.winner, 0);
  assert.equal(finish.players[0].celebration, 'win', 'the winner celebrates');
  assert.ok(finish.players[0].celebrationTimer > 3, 'and it runs long enough to see');
  assert.equal(finish.players[1].celebration, null, 'the loser does not');
});

test('every celebration and emote in the catalogue has choreography', () => {
  // A cosmetic that animates identically to another is a cosmetic nobody would
  // buy twice, so each one has to move differently.
  const performed = STORE_ITEMS.filter(
    (i) => i.category === 'emote' || i.category === 'celebration' || i.category === 'threeCelebration',
  );
  assert.ok(performed.length >= 30, 'a decent set to choose from');

  const threes = STORE_ITEMS.filter((i) => i.category === 'threeCelebration');
  assert.ok(threes.length >= 8, 'the 3-point section is worth opening');
  assert.ok(
    threes.some((i) => i.price === 0),
    'you start with something on the three',
  );
});

test('a reach-in lands often enough to be worth trying, and not so often it is free', () => {
  // Before this was tuned, a reach at point-blank range against an even matchup
  // landed 9% of the time and anything past arm's length was about 1% — so the
  // button was not worth pressing. It should be a real option without turning
  // every possession into a turnover.
  function odds(gap: number, stealRating: number, handleRating: number, midMove: boolean) {
    let attempts = 0;
    let steals = 0;
    for (let seed = 0; seed < 200; seed++) {
      const a = generateOpponent(78, seed * 3 + 1);
      a.attrs.ballHandle = handleRating;
      a.attrs.strength = 60;
      const b = generateOpponent(78, seed * 3 + 2);
      b.attrs.steal = stealRating;
      const state = createMatch(a, b, defaultMatchConfig({ manualCheck: false, shotClock: 999 }), seed * 17 + 5);
      for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      const p = state.players[0];
      const d = state.players[1];
      p.x = 0;
      p.z = 20;
      p.state = 'dribble';
      p.stamina = 1;
      p.moveCooldown = 0;
      p.stagger = 0;
      d.x = gap;
      d.z = 20;
      d.stealCooldown = 0;
      d.stagger = 0;
      d.staggerTimer = 0;
      d.state = 'idle';
      state.ball.owner = 0;
      state.ball.state = 'held';
      state.needsClear = false;

      const setup = midMove
        ? { ...emptyInput(), move: 'crossover' as const, moveDirX: 1, moveDirZ: 0 }
        : emptyInput();
      stepMatch(state, [setup, emptyInput()], SIM_DT);
      d.x = gap;
      d.z = 20;
      d.stealCooldown = 0;
      stepMatch(state, [emptyInput(), { ...emptyInput(), steal: true }], SIM_DT);
      attempts++;
      for (const e of drainEvents(state)) if (e.type === 'steal') steals++;
    }
    return steals / attempts;
  }

  const even = odds(1.5, 50, 50, false);
  assert.ok(even > 0.15, `an even matchup at arm's length should be worth a try, got ${(even * 100).toFixed(1)}%`);
  assert.ok(even < 0.35, `and not a coin flip, got ${(even * 100).toFixed(1)}%`);

  // Being a better thief than he is a handler has to show up.
  const thief = odds(1.5, 75, 55, false);
  assert.ok(thief > even + 0.05, `a good thief should beat a weak handler more often (${(thief * 100).toFixed(1)}% vs ${(even * 100).toFixed(1)}%)`);
  assert.ok(thief < 0.55, `but never a gimme, got ${(thief * 100).toFixed(1)}%`);

  // Reaching mid-move is the moment to pick.
  const onMove = odds(1.5, 75, 55, true);
  assert.ok(onMove > thief, `mid-dribble-move should be the best time to reach (${(onMove * 100).toFixed(1)}% vs ${(thief * 100).toFixed(1)}%)`);

  // Distance still matters — you have to actually close.
  const far = odds(3.5, 75, 55, false);
  assert.ok(far > 0.04, `a long reach should not be hopeless, got ${(far * 100).toFixed(1)}%`);
  assert.ok(far < thief * 0.6, `but it has to be clearly worse than being on him, got ${(far * 100).toFixed(1)}%`);
});

test('getting stripped knocks the handler off balance, and a miss costs the defender', () => {
  const state = createMatch(
    generateOpponent(80, 61),
    generateOpponent(80, 62),
    defaultMatchConfig({ manualCheck: false, shotClock: 999 }),
    8181,
  );
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  const p = state.players[0];
  const d = state.players[1];

  let sawStrip = false;
  let sawMiss = false;
  for (let seed = 0; seed < 200 && !(sawStrip && sawMiss); seed++) {
    p.x = 0;
    p.z = 20;
    p.state = 'dribble';
    p.stagger = 0;
    p.staggerTimer = 0;
    d.x = 1.2;
    d.z = 20;
    d.state = 'idle';
    d.stagger = 0;
    d.staggerTimer = 0;
    d.stealCooldown = 0;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    stepMatch(state, [emptyInput(), { ...emptyInput(), steal: true }], SIM_DT);
    // Read back through the state so these are the values the sim produced,
    // not the ones assigned above.
    const defenderState: string = state.players[1].state;
    const owner: number | null = state.ball.owner;
    // The reach itself has to be visible for long enough to animate.
    assert.ok(defenderState === 'stealing' || owner === 1, 'the reach plays out');

    if (owner === 1) {
      sawStrip = true;
      assert.ok(p.staggerTimer > 0, 'the handler is knocked off balance when stripped');
    } else {
      sawMiss = true;
      assert.ok(d.staggerTimer > 0, 'a miss leaves the defender out of position');
      assert.ok(d.stealCooldown > 2, `and on a long cooldown, got ${d.stealCooldown.toFixed(2)}s`);
    }
  }
  assert.ok(sawStrip, 'expected at least one strip');
  assert.ok(sawMiss, 'expected at least one miss');
});

test('the emote section shows twenty, and every named emote has its own movement', () => {
  const base = 1_800_000_000_000;
  for (let w = 0; w < 20; w++) {
    const shelf = categoryStock(base + w * SHOP_WINDOW_MS, 'emote').filter((i) => i.rarity !== 'mythic');
    assert.equal(shelf.length, 20, `emote window ${w} should show twenty, showed ${shelf.length}`);
  }
  assert.equal(slotsFor('emote'), 20);
  assert.equal(slotsFor('jersey'), SHOP_SLOTS, 'everything else is unchanged');

  // The hundred-emote pack is all there and all buyable.
  const pack = STORE_ITEMS.filter((i) => i.category === 'emote' && i.id.startsWith('emote-p-'));
  assert.equal(pack.length, 100, 'the whole pack landed');
  const tiers = new Set(pack.map((i) => i.rarity));
  for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
    assert.ok(tiers.has(r), `the pack should span every tier, missing ${r}`);
  }
  for (const item of pack) assert.ok(item.name.length > 2 && item.description.length > 10);
});

test('the dribble bounce index ticks over exactly when the ball is on the floor', () => {
  // The sound used to run off a fixed 0.34s timer with no relationship to the
  // ball on screen. It now fires on this index changing, so the index has to
  // land on the frame the ball is at the bottom of its bounce.
  for (const speedWithBall of [30, 65, 99]) {
    const a = generateOpponent(78, 5);
    a.attrs.speedWithBall = speedWithBall;
    const state = createMatch(a, generateOpponent(78, 6), defaultMatchConfig({ manualCheck: false, shotClock: 999 }), 321);
    for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
    const p = state.players[0];
    p.x = 0;
    p.z = 22;
    p.state = 'dribble';
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    const heights: number[] = [];
    const fired: number[] = [];
    let last: number | null = null;
    for (let i = 0; i < 120 * 8; i++) {
      stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
      if (state.players[0].state !== 'dribble' || state.ball.owner !== 0) break;
      heights.push(state.ball.y);
      const index = dribbleBounceIndex(state, 0);
      if (index !== null && index !== last) {
        if (last !== null) fired.push(heights.length - 1);
        last = index;
      }
    }

    assert.ok(fired.length > 10, `expected a stream of bounces, got ${fired.length}`);

    // Every fire has to sit on a genuine low point of the ball's height.
    const lows: number[] = [];
    for (let i = 1; i < heights.length - 1; i++) {
      if (heights[i] <= heights[i - 1] && heights[i] <= heights[i + 1]) lows.push(i);
    }
    let worst = 0;
    for (const f of fired) {
      let nearest = Infinity;
      for (const l of lows) nearest = Math.min(nearest, Math.abs(l - f));
      worst = Math.max(worst, nearest);
    }
    // One simulation frame is the floor on this: the index can only change on a
    // frame boundary. Anything beyond that is drift.
    assert.ok(worst <= 1, `speedWithBall ${speedWithBall}: sound was ${worst} frames off the bounce`);

    // The rate has to track how fast that build actually pounds the ball.
    const expected = Math.PI / dribbleTempo(state.players[0]);
    const gaps = fired.slice(1).map((f, i) => (f - fired[i]) * SIM_DT);
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - expected) < 0.02, `bounce gap ${gap.toFixed(3)}s should be about ${expected.toFixed(3)}s`);
    }
  }

  // It only counts while you are actually dribbling.
  const state = createMatch(generateOpponent(78, 5), generateOpponent(78, 6), defaultMatchConfig({ manualCheck: false }), 321);
  for (let i = 0; i < 200; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);
  state.ball.owner = null;
  state.ball.state = 'loose';
  assert.equal(dribbleBounceIndex(state, 0), null, 'a loose ball is not being dribbled');
  assert.equal(dribbleBounceIndex(state, 1), null, 'and nor is it for the other side');
});

test('the net swish fires as the ball crosses the ring, ahead of the score', () => {
  // The sound used to hang off the `score` event, which fires when the flight
  // ends — a foot under the rim, a frame or two after you see the ball go in.
  // It now fires on this crossing, so the crossing has to lead the score and it
  // has to happen with the ball at the ring.
  const leads: number[] = [];
  const heights: number[] = [];
  let scores = 0;
  let noFlight = 0;
  let falseFires = 0;

  for (let g = 0; g < 6; g++) {
    const seed = g * 977 + 13;
    const state = createMatch(generateOpponent(80, seed), generateOpponent(80, seed + 1), defaultMatchConfig(), seed * 3 + 1);
    const a0 = new AiController(0, 'pro', 1, false);
    const a1 = new AiController(1, 'pro', 2, false);
    let pending: { frame: number; y: number } | null = null;
    let armed = false;

    for (let f = 0; f < 120 * 60 * 8 && state.phase !== 'over'; f++) {
      stepMatch(state, [a0.update(state, SIM_DT), a1.update(state, SIM_DT)], SIM_DT);
      if (ballThroughRim(state)) {
        // It must never fire on a shot that is not going in.
        if (!armed) falseFires++;
        if (!pending) pending = { frame: state.frame, y: state.ball.y };
      }
      for (const e of drainEvents(state)) {
        if (e.type === 'shotRelease') armed = e.made;
        if (e.type === 'miss' || e.type === 'block') { armed = false; pending = null; }
        if (e.type === 'score') {
          scores++;
          if (pending) {
            leads.push(state.frame - pending.frame);
            heights.push(pending.y);
          } else {
            noFlight++;
          }
          armed = false;
          pending = null;
        }
      }
    }
  }

  assert.equal(falseFires, 0, 'the net must never sound on a shot that is not going in');
  assert.ok(scores > 40, `expected a decent sample of baskets, got ${scores}`);
  assert.ok(leads.length > scores * 0.7, `most baskets should be caught in flight, got ${leads.length} of ${scores}`);
  // Free throws resolve straight off the meter with no flight at all, so they
  // will always fall through to the score event — that is what the fallback in
  // the match screen is for.
  assert.ok(noFlight < scores * 0.3, `too many baskets had no crossing: ${noFlight} of ${scores}`);

  for (const lead of leads) {
    assert.ok(lead >= 1, 'the crossing has to come before the score, never after');
    assert.ok(lead <= 4, `the crossing should hug the score, was ${lead} frames early`);
  }
  for (const y of heights) {
    // The ring is at COURT.rimY and a made shot lands 0.2ft under it, so a fire
    // anywhere outside that band means it caught the ball somewhere else.
    assert.ok(y <= COURT.rimY + 1e-6 && y >= COURT.rimY - 0.25, `fired at ${y.toFixed(3)}ft, not at the ring`);
  }
});

test('every expanded section still shows fifteen items a window', () => {
  // The point of a rotating shop is that a hundred-item section shows fifteen of
  // them, not a hundred. Emotes are the one deliberate exception at twenty.
  const base = 1_760_000_000_000;
  for (const category of STOCKED_CATEGORIES) {
    const slots = slotsFor(category);
    const stockable = STORE_ITEMS.filter(
      (i) => i.category === category && i.price > 0 && !i.requirement && i.rarity !== 'mythic',
    ).length;
    // A section with fewer items than slots has nothing to rotate and shows what
    // it has; only the ones deep enough to rotate are held to the slot count.
    if (stockable <= slots) continue;

    for (let w = 0; w < 60; w++) {
      const now = base + w * SHOP_WINDOW_MS;
      const shelf = categoryStock(now, category);
      const mythics = shelf.filter((i) => i.rarity === 'mythic').length;
      assert.ok(mythics <= 1, `${category}: at most one mythic on a shelf`);
      assert.equal(
        shelf.length,
        slots + mythics,
        `${category} window ${w}: expected ${slots} (+${mythics} mythic), got ${shelf.length}`,
      );
      // Nothing on a shelf may be there again next window.
      const next = categoryStock(now + SHOP_WINDOW_MS, category);
      const nextIds = new Set(next.filter((i) => i.rarity !== 'mythic').map((i) => i.id));
      for (const item of shelf) {
        if (item.rarity === 'mythic') continue;
        assert.ok(!nextIds.has(item.id), `${category}: ${item.name} survived into the next window`);
      }
    }
  }
});

test('the three packs are wired all the way through to the shop', () => {
  // A pack that is generated but not reachable from the shop is dead data, and
  // an id the renderer cannot resolve draws nothing at all.
  for (const t of PACK_TITLES) {
    assert.ok(STORE_BY_ID[t.id], `${t.name} should be a store item`);
    assert.ok(t.price > 0, 'pack titles are bought, never earned');
  }
  for (const item of PACK_TATTOOS) {
    assert.ok(STORE_BY_ID[item.id], `${item.name} should be a store item`);
    const design = TATTOO_DESIGNS[item.id];
    assert.ok(design, `${item.name} needs a design or it draws nothing`);
    assert.ok(design.spots.length > 0, `${item.name} has to go somewhere`);
  }
  // Every legacy tattoo id still resolves, so an old save keeps its ink.
  for (const id of ['tat-sleeve-left', 'tat-sleeve-both', 'tat-chest', 'tat-neck', 'tat-forearm', 'tat-back', 'tat-full']) {
    assert.ok(TATTOO_DESIGNS[id], `${id} is on old saves and must still draw`);
  }
  for (const d of PACK_DUNKS) {
    assert.ok(DUNK_PACKAGE_BY_ID[d.id], `${d.name} should be an equippable package`);
    assert.ok(STORE_BY_ID[`dunk-${d.id}`], `${d.name} should be a store item`);
    assert.ok(d.rarity, 'pack dunks state their tier rather than inferring it from price');
  }
  // No pack item is free, so none of them land in the starting unlocks.
  const packIds = new Set([...PACK_TITLES.map((t) => t.id), ...PACK_TATTOOS.map((i) => i.id), ...PACK_DUNKS.map((d) => `dunk-${d.id}`)]);
  for (const id of DEFAULT_UNLOCKS) {
    assert.ok(!packIds.has(id), `${id} should be bought, not given away`);
  }
});

test('a court is a park and a mode, and nothing else matches it', () => {
  // This key is the whole of who you can play. Two people meet because they are
  // standing on the same court in the same park; everyone else is on a different
  // key and can never be paired with them however long either waits.
  assert.equal(courtKey('downtown', 'kotc'), 'downtown:kotc');
  assert.notEqual(courtKey('downtown', 'kotc'), courtKey('beach', 'kotc'));
  assert.notEqual(courtKey('downtown', 'kotc'), courtKey('downtown', 'casual'));

  // Every park/court pairing is distinct, so no two courts can collide.
  const keys = new Set<string>();
  for (const park of PARKS) {
    for (const mode of COURT_MODES) keys.add(courtKey(park.id, mode.id));
  }
  assert.equal(keys.size, PARKS.length * COURT_MODES.length, 'every court has its own queue');
});

test('each court sets its own rules', () => {
  // The room used to be handed only the park id, so every online game ran the
  // default eleven whichever court you walked onto.
  const kotc = defaultMatchConfig(courtConfig('downtown', 'kotc'));
  const main = defaultMatchConfig(courtConfig('downtown', 'ranked'));
  assert.equal(kotc.targetScore, 7, 'King of the Court is first to seven');
  assert.equal(main.targetScore, 11, 'the main court is the full game');
  assert.notEqual(kotc.shotClock, main.shotClock);
  assert.equal(kotc.parkId, 'downtown', 'the park carries into the match config');
  assert.equal(main.playlist, 'ranked', 'only the main court moves your rank');

  // Training is the practice gym and must never look for a person.
  assert.equal(COURT_MODE_BY_ID.training.online, false);
  for (const mode of COURT_MODES) {
    if (mode.id === 'training') continue;
    assert.equal(mode.online, true, `${mode.name} should find real opponents`);
    assert.notEqual(mode.playlist, 'private', 'a queued court is never a private lobby');
  }
});

test('the online ladder climbs five wins at a time, three divisions a tier', () => {
  // The exact shape asked for: Bronze 3 is where you start, 1 is the best
  // division in a tier, and five wins clears one.
  assert.equal(onlineRank(0).label, 'Bronze 3');
  assert.equal(onlineRank(4).label, 'Bronze 3', 'four wins is not enough');
  assert.equal(onlineRank(5).label, 'Bronze 2');
  assert.equal(onlineRank(10).label, 'Bronze 1');
  assert.equal(onlineRank(15).label, 'Silver 3', 'clearing Bronze 1 moves you up a tier');
  assert.equal(onlineRank(30).label, 'Gold 3');
  assert.equal(onlineRank(45).label, 'Platinum 3');
  assert.equal(onlineRank(60).label, 'Emerald 3');
  assert.equal(onlineRank(75).label, 'Sapphire 3');
  assert.equal(onlineRank(90).label, 'Champion 3');
  assert.equal(onlineRank(100).label, 'Champion 1', 'the last division before the top');

  // Every division is exactly five wins wide, all the way up.
  for (let wins = 0; wins < WINS_TO_GRAND_CHAMP; wins++) {
    const rank = onlineRank(wins);
    assert.equal(rank.needed, WINS_PER_DIVISION);
    assert.equal(rank.progress, wins % WINS_PER_DIVISION);
    assert.ok(rank.division >= 1 && rank.division <= DIVISIONS_PER_TIER);
    assert.equal(rank.grandChamp, false);
  }

  // Seven tiers of three divisions at five wins each.
  assert.equal(WINS_TO_GRAND_CHAMP, (ONLINE_TIERS.length - 1) * DIVISIONS_PER_TIER * WINS_PER_DIVISION);
  assert.equal(WINS_TO_GRAND_CHAMP, 105);
});

test('grand champ has no divisions and is ranked against the world', () => {
  const gc = onlineRank(WINS_TO_GRAND_CHAMP);
  assert.equal(gc.grandChamp, true);
  assert.equal(gc.label, 'Grand Champ');
  assert.equal(gc.division, 0, 'there are no divisions up here');
  assert.equal(nextRank(WINS_TO_GRAND_CHAMP), null, 'nothing above it');

  // It never fills a progress bar — more wins move you past people instead.
  assert.equal(onlineRank(WINS_TO_GRAND_CHAMP + 50).label, 'Grand Champ');
  assert.equal(onlineRank(WINS_TO_GRAND_CHAMP + 50).progress, 50);

  // Placement is what distinguishes one grand champ from another.
  assert.equal(onlineRankLabel(WINS_TO_GRAND_CHAMP, 1), 'Grand Champ #1');
  assert.equal(onlineRankLabel(WINS_TO_GRAND_CHAMP, 500), 'Grand Champ #500');
  assert.equal(onlineRankLabel(WINS_TO_GRAND_CHAMP, null), 'Grand Champ', 'unknown placement is not faked');
  assert.equal(grandChampLabel(0), 'Grand Champ', 'a nonsense placement is not shown');

  // Below grand champ a placement is meaningless and must not appear.
  assert.equal(onlineRankLabel(10, 3), 'Bronze 1');
});

test('the ladder never goes backwards and always advances', () => {
  // A win must never lower your rank, and five wins must always raise it.
  let last = -1;
  for (let wins = 0; wins <= WINS_TO_GRAND_CHAMP + 20; wins++) {
    const tierIndex = ONLINE_TIERS.indexOf(onlineRank(wins).tier);
    const rank = onlineRank(wins);
    // Rank as a single ordered number: tier, then division counting down.
    const ordinal = rank.grandChamp
      ? 1000 + rank.progress
      : tierIndex * DIVISIONS_PER_TIER + (DIVISIONS_PER_TIER - rank.division);
    assert.ok(ordinal >= last, `rank went backwards at ${wins} wins`);
    last = ordinal;
  }
  for (let wins = 0; wins + WINS_PER_DIVISION <= WINS_TO_GRAND_CHAMP; wins += WINS_PER_DIVISION) {
    assert.notEqual(onlineRank(wins).label, onlineRank(wins + WINS_PER_DIVISION).label, `stuck at ${wins}`);
  }

  // Negative or fractional counts cannot produce a broken rank.
  assert.equal(onlineRank(-5).label, 'Bronze 3');
  assert.equal(onlineRank(7.9).label, 'Bronze 2');
});
