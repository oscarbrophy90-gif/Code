import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACHIEVEMENTS,
  addDays,
  ATTRIBUTE_KEYS,
  CATALOG,
  CATALOG_BY_ID,
  completeActivity,
  computeOverall,
  createProfile,
  currentAttributes,
  dateKey,
  daySummary,
  daysBetween,
  defaultSurvey,
  deriveTraits,
  formatTimeLeft,
  msUntilMidnight,
  msUntilRollover,
  addExtra,
  buildWorkout,
  canBuildWorkout,
  coreActivities,
  EXERCISES,
  extrasLeft,
  generatePlan,
  isEligible,
  MAX_EXTRAS_PER_DAY,
  planContext,
  RANK_TIERS,
  rankTierFor,
  Rng,
  workoutAvailable,
  levelForXp,
  levelProgress,
  lockInGoal,
  MAX_RATING,
  MAX_SWAPS_PER_DAY,
  openDay,
  profileView,
  progressFor,
  ratingFor,
  seedAttributes,
  stepCost,
  swap,
  undoActivity,
  weekDays,
  weekKey,
  xpToNext,
  type AttributeKey,
  type Profile,
  type SurveyAnswers,
} from '../src/core/index.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function survey(overrides: Partial<SurveyAnswers> = {}): SurveyAnswers {
  return {
    ...defaultSurvey(),
    name: 'Test',
    age: 22,
    focus: ['fitness', 'education'],
    interests: ['lifting', 'reading'],
    equipment: ['gym', 'outdoors', 'computer'],
    limitations: [],
    student: true,
    studyHours: 2,
    sleepHours: 7,
    waterGlasses: 4,
    timeBudgetMinutes: 45,
    ...overrides,
  };
}

const START = '2026-03-02'; // a Monday

function makeProfile(overrides: Partial<SurveyAnswers> = {}): Profile {
  const profile = createProfile(survey(overrides), Date.parse(`${START}T08:00:00`));
  // Profile ids carry a random component, and the generator is seeded off them.
  // Pinning it here makes every plan in this file reproducible run to run —
  // without it, assertions about variety and coverage are quietly flaky.
  profile.id = `test-${JSON.stringify(overrides)}`;
  return profile;
}

/** Completes every activity on `date`, returning total XP earned. */
function completeAll(profile: Profile, date: string): number {
  const { day } = openDay(profile, date);
  let xp = 0;
  for (const activity of [...day.plan]) {
    const result = completeActivity(profile, date, activity.id);
    if (result) xp += result.xp.total;
  }
  return xp;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

test('date keys are local, ordered and reversible', () => {
  assert.equal(addDays('2026-03-02', 1), '2026-03-03');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(daysBetween('2026-03-02', '2026-03-09'), 7);
  assert.equal(daysBetween('2026-03-09', '2026-03-02'), -7);
  // Lexical order has to match chronological order — history pruning relies on it.
  assert.ok('2026-03-02' < '2026-03-10');
  assert.equal(dateKey(Date.parse('2026-03-02T23:59:00')), '2026-03-02');
});

test('the countdown reads down to local midnight', () => {
  const evening = Date.parse('2026-03-02T18:30:00');
  assert.equal(msUntilMidnight(evening), 5.5 * 3600 * 1000);
  assert.equal(formatTimeLeft(msUntilMidnight(evening)), '5h 30m left today');

  assert.equal(formatTimeLeft(48 * 60 * 1000 + 9000), '48m 09s left today');
  assert.equal(formatTimeLeft(9000), '9s left today');
  assert.equal(formatTimeLeft(0), '0s left today');
  assert.equal(formatTimeLeft(-500), '0s left today');

  // The rollover timer must always land *after* midnight, never a hair before.
  const justBefore = Date.parse('2026-03-02T23:59:59');
  assert.ok(msUntilRollover(justBefore) > msUntilMidnight(justBefore));
});

test('weeks are Monday-anchored and seven days long', () => {
  const days = weekDays('2026-03-05');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-03-02');
  assert.equal(days[6], '2026-03-08');
  assert.equal(weekKey('2026-03-02'), weekKey('2026-03-08'));
  assert.notEqual(weekKey('2026-03-08'), weekKey('2026-03-09'));
});

/* ------------------------------------------------------------------ *
 * Ratings and levels
 * ------------------------------------------------------------------ */

test('rating steps get more expensive the higher you climb', () => {
  for (let rating = 30; rating < 98; rating++) {
    assert.ok(stepCost(rating + 1) >= stepCost(rating), `step ${rating} should not get cheaper`);
  }
  assert.ok(stepCost(90) > stepCost(50) * 5, 'the top of the curve should be a real grind');
});

test('attribute XP converts to ratings consistently and caps at 99', () => {
  const seed = 50;
  assert.equal(ratingFor(seed, 0), 50);
  assert.equal(ratingFor(seed, stepCost(50) - 1), 50);
  assert.equal(ratingFor(seed, stepCost(50)), 51);
  assert.equal(ratingFor(seed, stepCost(50) + stepCost(51)), 52);
  assert.equal(ratingFor(seed, 10_000_000), MAX_RATING);

  const partial = progressFor(seed, stepCost(50) + Math.floor(stepCost(51) / 2));
  assert.equal(partial.rating, 51);
  assert.ok(partial.fraction > 0.4 && partial.fraction < 0.6);
});

test('levels need progressively more XP and progress adds back up', () => {
  for (let level = 1; level < 60; level++) assert.ok(xpToNext(level + 1) > xpToNext(level));

  let total = 0;
  for (let level = 1; level <= 12; level++) {
    const progress = levelProgress(total);
    assert.equal(progress.level, level, `xp ${total} should be level ${level}`);
    assert.equal(progress.into, 0);
    total += xpToNext(level);
  }
  assert.equal(levelForXp(total - 1), 12);
  assert.equal(levelForXp(total), 13);
});

test('Overall weights focus areas higher than the rest', () => {
  const flat = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 50])) as Record<AttributeKey, number>;
  assert.equal(computeOverall(flat, []), 50);
  assert.equal(computeOverall(flat, ['fitness']), 50);

  const strongFitness = { ...flat, fitness: 80 };
  const unweighted = computeOverall(strongFitness, []);
  const weighted = computeOverall(strongFitness, ['fitness']);
  assert.ok(weighted > unweighted, 'a focus area should count for more');
});

/* ------------------------------------------------------------------ *
 * Survey seeding
 * ------------------------------------------------------------------ */

test('seed ratings stay inside the starting band for every answer combination', () => {
  const cases: Partial<SurveyAnswers>[] = [
    {},
    { fitnessLevel: 1, routineStrength: 1, focusLevel: 1, healthLevel: 1, socialLevel: 1, mindsetLevel: 1, sleepConsistency: 1, sleepHours: 3, waterGlasses: 0, studyHours: 0 },
    { fitnessLevel: 5, routineStrength: 5, focusLevel: 5, healthLevel: 5, socialLevel: 5, mindsetLevel: 5, sleepConsistency: 5, sleepHours: 12, waterGlasses: 16, studyHours: 12, interests: ['lifting', 'music', 'coding', 'art', 'writing', 'language'] },
    { age: 13 },
    { age: 70, student: false },
  ];

  for (const override of cases) {
    const answers = survey(override);
    const traits = deriveTraits(answers);
    const attributes = seedAttributes(answers, traits);
    for (const key of ATTRIBUTE_KEYS) {
      assert.ok(attributes[key] >= 30 && attributes[key] <= 72, `${key} seeded at ${attributes[key]} for ${JSON.stringify(override)}`);
    }
  }
});

test('honest answers seed a higher card than struggling ones', () => {
  const low = makeProfile({ fitnessLevel: 1, routineStrength: 1, focusLevel: 1, healthLevel: 1, sleepHours: 4, sleepConsistency: 1 });
  const high = makeProfile({ fitnessLevel: 5, routineStrength: 5, focusLevel: 5, healthLevel: 5, sleepHours: 8, sleepConsistency: 5 });
  assert.ok(profileView(high).overall > profileView(low).overall + 8);
});

test('age and limitations set the safety rails, not the difficulty', () => {
  const teen = deriveTraits(survey({ age: 14 }));
  assert.equal(teen.ageBand, 'teen');
  assert.equal(teen.ceiling.fitness, 'hard', 'no elite fitness work for under 18s');
  assert.equal(teen.sleepTargetHours, 9);

  const injured = deriveTraits(survey({ limitations: ['injury'] }));
  assert.equal(injured.highLoadPerWeek, 0);

  const mobility = deriveTraits(survey({ limitations: ['low-mobility'] }));
  assert.equal(mobility.ceiling.fitness, 'light');
});

/* ------------------------------------------------------------------ *
 * The generator
 * ------------------------------------------------------------------ */

test('a day is generated at the size the user signed up for, plus one challenge', () => {
  for (const [minutes, expected] of [
    [20, 4],
    [45, 5],
    [75, 6],
    [120, 7],
  ] as const) {
    const profile = makeProfile({ timeBudgetMinutes: minutes });
    const plan = generatePlan(profile, START);
    assert.equal(plan.filter((a) => a.kind !== 'challenge').length, expected, `${minutes} minutes should give ${expected} core activities`);
    assert.equal(plan.filter((a) => a.kind === 'challenge').length, 1);
    assert.equal(plan.filter((a) => a.kind === 'keystone').length, 1);
  }
});

test('the same person on the same day always gets the same plan', () => {
  const profile = makeProfile();
  const a = generatePlan(profile, START);
  const b = generatePlan(profile, START);
  assert.deepEqual(
    a.map((x) => x.id),
    b.map((x) => x.id),
  );
  const tomorrow = generatePlan(profile, addDays(START, 1));
  assert.notDeepEqual(
    a.map((x) => x.templateId),
    tomorrow.map((x) => x.templateId),
  );
});

test('focus areas are represented in the day', () => {
  const profile = makeProfile({ focus: ['skills', 'social'], interests: ['coding'], timeBudgetMinutes: 75 });
  const plan = generatePlan(profile, START);
  const attributes = new Set(plan.map((a) => a.attribute));
  assert.ok(attributes.has('skills'), 'skills is a stated goal and should appear');
  assert.ok(attributes.has('social'), 'social is a stated goal and should appear');
});

test('nothing is offered that the user cannot do', () => {
  // No gym, no bike, no pool, no instrument: nothing requiring them may appear.
  const profile = makeProfile({ equipment: ['outdoors'], interests: [] });
  const seen = new Set<string>();
  let date = START;
  for (let i = 0; i < 120; i++) {
    for (const activity of generatePlan(profile, date)) seen.add(activity.templateId);
    date = addDays(date, 1);
  }
  for (const id of seen) {
    const needs = CATALOG_BY_ID[id].requires?.needs ?? [];
    for (const need of needs) assert.ok(need === 'outdoors', `${id} requires ${need}, which this user does not have`);
  }
});

test('age gates hold over a long stretch of days', () => {
  const profile = makeProfile({ age: 14 });
  let date = START;
  for (let i = 0; i < 200; i++) {
    for (const activity of generatePlan(profile, date)) {
      const template = CATALOG_BY_ID[activity.templateId];
      const minAge = template.requires?.minAge;
      assert.ok(minAge === undefined || minAge <= 14, `${template.id} needs age ${minAge} but was offered to a 14-year-old`);
      if (activity.attribute === 'fitness') assert.notEqual(activity.tier, 'elite', 'no elite fitness work for a 14-year-old');
    }
    date = addDays(date, 1);
  }
});

test('injury and low mobility remove high-impact work entirely', () => {
  const injured = makeProfile({ limitations: ['injury'] });
  const limited = makeProfile({ limitations: ['low-mobility'] });
  let date = START;
  for (let i = 0; i < 90; i++) {
    for (const activity of generatePlan(injured, date)) {
      assert.notEqual(activity.load, 'high');
      assert.ok(!activity.tags.includes('impact'), `${activity.templateId} is impact work`);
    }
    for (const activity of generatePlan(limited, date)) {
      assert.ok(activity.load === 'none' || activity.load === 'light', `${activity.templateId} is ${activity.load} load`);
    }
    date = addDays(date, 1);
  }
});

test('a beginner is never given more hard sessions than their body budget', () => {
  const profile = makeProfile({ fitnessLevel: 1, focus: ['fitness'] });
  const budget = profile.traits.highLoadPerWeek;
  assert.ok(budget >= 1 && budget <= 2);

  // Complete everything for a fortnight, then count high-load sessions per week.
  let date = START;
  const perWeek = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const { day } = openDay(profile, date);
    for (const activity of [...day.plan]) {
      completeActivity(profile, date, activity.id);
      if (activity.load === 'high') perWeek.set(weekKey(date), (perWeek.get(weekKey(date)) ?? 0) + 1);
    }
    date = addDays(date, 1);
  }
  for (const [week, count] of perWeek) assert.ok(count <= budget, `${count} high-load sessions in ${week}, budget is ${budget}`);
});

test('a single day never stacks two hard physical sessions', () => {
  for (const level of [1, 3, 5] as const) {
    const profile = makeProfile({ fitnessLevel: level, focus: ['fitness'], timeBudgetMinutes: 120, equipment: ['gym', 'outdoors', 'bike', 'pool', 'sports-team'] });
    let date = START;
    for (let i = 0; i < 60; i++) {
      const { day } = openDay(profile, date);
      const heavy = day.plan.filter((a) => a.load === 'high');
      assert.ok(heavy.length <= 1, `fitness level ${level} got ${heavy.length} high-load sessions on ${date}`);
      for (const activity of [...day.plan]) completeActivity(profile, date, activity.id);
      date = addDays(date, 1);
    }
  }
});

test('accessible alternatives are reserved for the people who need them', () => {
  const typical = makeProfile();
  const limited = makeProfile({ limitations: ['low-mobility'] });

  let date = START;
  let offeredToLimited = false;
  for (let i = 0; i < 60; i++) {
    for (const activity of generatePlan(typical, date)) {
      assert.notEqual(activity.templateId, 'seated-movement', 'the seated option should not crowd out work this user can do');
    }
    if (generatePlan(limited, date).some((a) => a.templateId === 'seated-movement')) offeredToLimited = true;
    date = addDays(date, 1);
  }
  assert.ok(offeredToLimited, 'a user with limited mobility should be offered the accessible option');
});

test('a safety ceiling removes templates it cannot scale down, rather than clamping them', () => {
  // Intervals starts at hard. A 17-year-old's fitness ceiling is also hard, so
  // it survives — the ceiling only removes what it cannot scale down to.
  const older = makeProfile({ age: 17, focus: ['fitness'], equipment: ['gym', 'outdoors'], fitnessLevel: 4 });
  assert.equal(isEligible(CATALOG_BY_ID['intervals'], planContext(older, START)), false, 'and not during the first-days ramp');
  older.stats.daysActive = 10; // past the easing-in period
  assert.equal(isEligible(CATALOG_BY_ID['intervals'], planContext(older, START)), true);

  // Low mobility caps fitness at light, so anything that starts at steady or
  // above is dropped outright rather than offered at a tier above the cap.
  const limited = makeProfile({ limitations: ['low-mobility'], focus: ['fitness'] });
  const limitedCtx = planContext(limited, START);
  assert.equal(isEligible(CATALOG_BY_ID['intervals'], limitedCtx), false);
  assert.equal(isEligible(CATALOG_BY_ID['sport-practice'], limitedCtx), false);
  assert.equal(isEligible(CATALOG_BY_ID['seated-movement'], limitedCtx), true, 'the accessible option has to survive every rail');

  for (const template of CATALOG) {
    if (!isEligible(template, limitedCtx)) continue;
    const easiest = template.tiers.reduce((low, t) => (t.xp < low.xp ? t : low), template.tiers[0]);
    if (template.attribute === 'fitness') assert.equal(easiest.tier, 'light', `${template.id} is above the low-mobility ceiling`);
  }
});

test('the plan keeps changing over a month instead of repeating five chores', () => {
  const profile = makeProfile({ timeBudgetMinutes: 75 });
  const seen = new Set<string>();
  let date = START;
  for (let i = 0; i < 30; i++) {
    const { day } = openDay(profile, date);
    for (const activity of [...day.plan]) {
      seen.add(activity.templateId);
      completeActivity(profile, date, activity.id);
    }
    date = addDays(date, 1);
  }
  assert.ok(seen.size >= 25, `only ${seen.size} distinct activities in a month`);
});

test('difficulty climbs with the rating rather than staying on beginner forever', () => {
  const profile = makeProfile({ focus: ['education'], timeBudgetMinutes: 120 });
  const earlyTiers = generatePlan(profile, START).map((a) => a.tier);
  assert.ok(!earlyTiers.includes('elite'), 'the first days are eased in');

  let date = START;
  for (let i = 0; i < 120; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  const later = generatePlan(profile, date);
  const ratings = currentAttributes(profile);
  assert.ok(ratings.education > profile.seedAttributes.education + 8, 'four months of study should move the rating');
  assert.ok(later.some((a) => a.tier === 'hard' || a.tier === 'elite'), 'later plans should include demanding work');
});

/* ------------------------------------------------------------------ *
 * Completing work
 * ------------------------------------------------------------------ */

test('completing an activity pays XP into the account and the right attributes', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  const activity = day.plan[0];

  const before = currentAttributes(profile);
  const result = completeActivity(profile, START, activity.id);
  assert.ok(result);
  assert.equal(result.xp.base, activity.xp);
  assert.equal(profile.totalXp, result.xp.total);
  assert.equal(profile.attributeXp[activity.attribute], result.xp.total);
  if (activity.secondary) {
    assert.equal(profile.attributeXp[activity.secondary], Math.round(result.xp.total * 0.5));
  }
  assert.equal(profile.stats.activitiesCompleted, 1);
  assert.equal(profile.stats.daysActive, 1);

  // Nothing else moved.
  for (const key of ATTRIBUTE_KEYS) {
    if (key === activity.attribute || key === activity.secondary) continue;
    assert.equal(currentAttributes(profile)[key], before[key]);
  }

  // The same activity cannot be banked twice.
  assert.equal(completeActivity(profile, START, activity.id), null);
  assert.equal(profile.stats.activitiesCompleted, 1);
});

test('undo reverses a completion exactly', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);

  const snapshot = JSON.stringify({
    totalXp: profile.totalXp,
    attributeXp: profile.attributeXp,
    stats: profile.stats,
    streak: profile.streak,
  });

  for (const activity of [...day.plan]) completeActivity(profile, START, activity.id);
  assert.ok(profile.totalXp > 0);

  for (const activity of [...day.plan]) assert.ok(undoActivity(profile, START, activity.id));

  assert.equal(
    JSON.stringify({ totalXp: profile.totalXp, attributeXp: profile.attributeXp, stats: profile.stats, streak: profile.streak }),
    snapshot,
    'undoing everything should leave the profile where it started',
  );
  assert.equal(profile.days[START].xpEarned, 0);
  assert.equal(profile.days[START].lockedIn, false);
});

test('a day locks in once enough of the core list is done', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  const core = day.plan.filter((a) => a.kind !== 'challenge');
  const goal = lockInGoal(day.plan);

  for (let i = 0; i < goal - 1; i++) completeActivity(profile, START, core[i].id);
  assert.equal(profile.days[START].lockedIn, false);
  assert.equal(profile.streak.current, 0);

  const result = completeActivity(profile, START, core[goal - 1].id);
  assert.ok(result?.lockedInNow);
  assert.equal(profile.streak.current, 1);
  assert.equal(profile.streak.lastLockIn, START);
});

test('the streak counts consecutive locked-in days and remembers its best', () => {
  const profile = makeProfile();
  let date = START;
  for (let i = 0; i < 10; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  assert.equal(profile.streak.current, 10);
  assert.equal(profile.streak.best, 10);
  assert.equal(profile.streak.totalLockInDays, 10);
  assert.ok(profile.streak.shields >= 1, 'a week of consistency should bank a shield');
});

/* ------------------------------------------------------------------ *
 * Missing days — the part that has to feel forgiving
 * ------------------------------------------------------------------ */

test('a shield covers a single missed day without breaking the streak', () => {
  const profile = makeProfile();
  let date = START;
  for (let i = 0; i < 7; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  assert.equal(profile.streak.current, 7);
  assert.equal(profile.streak.shields, 1);

  // Skip a day entirely, then come back.
  const comeback = addDays(date, 1);
  const opened = openDay(profile, comeback);
  assert.equal(opened.shieldsUsed, 1);
  assert.equal(opened.streakBroken, false);
  assert.equal(profile.streak.current, 7, 'the shield should hold the streak');
  assert.equal(profile.streak.shields, 0);
});

test('a longer break resets the streak but takes nothing else away', () => {
  const profile = makeProfile();
  let date = START;
  for (let i = 0; i < 5; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  const xpBefore = profile.totalXp;
  const ratingsBefore = currentAttributes(profile);
  const levelBefore = levelForXp(profile.totalXp);
  assert.equal(profile.streak.current, 5);

  const comeback = addDays(date, 9);
  const opened = openDay(profile, comeback);

  assert.equal(opened.streakBroken, true);
  assert.equal(profile.streak.current, 0);
  assert.equal(profile.streak.best, 5, 'the best run is remembered');
  assert.equal(profile.streak.comeback, true);
  assert.equal(profile.totalXp, xpBefore, 'XP is never taken away');
  assert.equal(levelForXp(profile.totalXp), levelBefore, 'levels are never taken away');
  assert.deepEqual(currentAttributes(profile), ratingsBefore, 'ratings are never taken away');
});

test('shields are not wasted on a gap they cannot cover', () => {
  const profile = makeProfile();
  let date = START;
  for (let i = 0; i < 7; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  assert.equal(profile.streak.shields, 1);

  openDay(profile, addDays(date, 6)); // six missed days, one shield
  assert.equal(profile.streak.shields, 1, 'the shield should still be there for a gap it can actually save');
  assert.equal(profile.streak.current, 0);
});

test('coming back from a break pays a bonus rather than a penalty', () => {
  const profile = makeProfile();
  completeAll(profile, START);
  const normal = profile.days[START].plan[0];

  const comeback = addDays(START, 6);
  const { day } = openDay(profile, comeback);
  assert.equal(profile.streak.comeback, true);
  const result = completeActivity(profile, comeback, day.plan[0].id);
  assert.ok(result);
  assert.ok(result.xp.comebackBonus > 0, 'the first day back should pay a comeback bonus');
  void normal;
});

/* ------------------------------------------------------------------ *
 * Swaps, summaries, weekly challenges
 * ------------------------------------------------------------------ */

test('an activity can be swapped a limited number of times a day', () => {
  const profile = makeProfile({ timeBudgetMinutes: 75 });
  const { day } = openDay(profile, START);
  const original = day.plan[0];

  const replacement = swap(profile, START, original.id);
  assert.ok(replacement, 'a swap should find an alternative');
  assert.notEqual(replacement.templateId, original.templateId);
  assert.equal(profile.days[START].plan[0].id, replacement.id);
  assert.equal(profile.days[START].swapsUsed, 1);

  for (let i = 0; i < MAX_SWAPS_PER_DAY; i++) swap(profile, START, profile.days[START].plan[0].id);
  assert.equal(profile.days[START].swapsUsed, MAX_SWAPS_PER_DAY);
  assert.equal(swap(profile, START, profile.days[START].plan[1].id), null, 'swaps run out');
});

test('a completed activity cannot be swapped away', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  completeActivity(profile, START, day.plan[0].id);
  assert.equal(swap(profile, START, day.plan[0].id), null);
});

test('the day summary reports what happened, including what was missed', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  completeActivity(profile, START, day.plan[0].id);
  completeActivity(profile, START, day.plan[1].id);

  const summary = daySummary(profile, START);
  assert.ok(summary);
  assert.equal(summary.completed.length, 2);
  assert.equal(summary.missed.length, day.plan.length - 2);
  assert.equal(summary.xp, profile.days[START].xpEarned);
  assert.ok(summary.message.length > 0);
});

test('weekly challenges are generated, tracked and auto-claimed', () => {
  const profile = makeProfile();
  openDay(profile, START);
  const weekly = profile.weekly;
  assert.ok(weekly);
  assert.equal(weekly.week, weekKey(START));
  assert.equal(weekly.progress, 0);
  assert.equal(weekly.claimed, false);

  let date = START;
  for (let i = 0; i < 7; i++) {
    completeAll(profile, date);
    date = addDays(date, 1);
  }
  assert.equal(profile.weekly?.claimed, true, 'a full week of work should clear any weekly objective');
  assert.equal(profile.stats.weeklyChallengesCompleted, 1);

  // New week, new objective.
  openDay(profile, date);
  assert.equal(profile.weekly?.week, weekKey(date));
  assert.equal(profile.weekly?.claimed, false);
});

/* ------------------------------------------------------------------ *
 * Achievements and milestones
 * ------------------------------------------------------------------ */

test('achievements are earned from real progress and stay earned', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  const result = completeActivity(profile, START, day.plan[0].id);
  assert.ok(result?.achievements.some((a) => a.id === 'first-step'));
  assert.ok(profile.achievements['first-step']);

  // Undo should not revoke a badge.
  undoActivity(profile, START, day.plan[0].id);
  assert.ok(profile.achievements['first-step']);
});

test('every achievement has a reachable, non-degenerate target', () => {
  const profile = makeProfile();
  for (const achievement of ACHIEVEMENTS) {
    const { value, target } = achievement.progress(profile);
    assert.ok(target > 0, `${achievement.id} has a target of ${target}`);
    assert.ok(value >= 0, `${achievement.id} reports negative progress`);
  }
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'achievement ids must be unique');
});

test('milestones fire once and pay out once', () => {
  const profile = makeProfile();
  let date = START;
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    const { day } = openDay(profile, date);
    for (const activity of [...day.plan]) {
      const result = completeActivity(profile, date, activity.id);
      for (const milestone of result?.milestones ?? []) seen.push(milestone.id);
    }
    date = addDays(date, 1);
  }
  assert.ok(seen.length > 0, 'forty days of work should hit some milestones');
  assert.equal(new Set(seen).size, seen.length, 'no milestone should fire twice');
});

/* ------------------------------------------------------------------ *
 * Generate more — extras and workouts
 * ------------------------------------------------------------------ */

test('extras are added on demand, in the section asked for', () => {
  const profile = makeProfile();
  openDay(profile, START);
  assert.equal(extrasLeft(profile, START), MAX_EXTRAS_PER_DAY);

  const result = addExtra(profile, START, 'mindset');
  assert.ok(result);
  assert.equal(result.activity.kind, 'extra');
  assert.equal(result.activity.attribute, 'mindset');
  assert.ok(profile.days[START].plan.includes(result.activity));
  assert.equal(extrasLeft(profile, START), MAX_EXTRAS_PER_DAY - 1);
});

test('extras pay XP and raise ratings like anything else', () => {
  const profile = makeProfile();
  openDay(profile, START);
  const extra = addExtra(profile, START, 'skills');
  assert.ok(extra);

  const before = profile.attributeXp.skills;
  const result = completeActivity(profile, START, extra.activity.id);
  assert.ok(result);
  assert.ok(result.xp.total > 0);
  assert.ok(profile.attributeXp.skills > before);
});

test('extras never change the lock-in goal or spoil a clean sheet', () => {
  const profile = makeProfile();
  const { day } = openDay(profile, START);
  const goalBefore = lockInGoal(day.plan);
  const coreBefore = coreActivities(day.plan).length;

  for (let i = 0; i < 3; i++) addExtra(profile, START, 'any');
  assert.equal(lockInGoal(profile.days[START].plan), goalBefore, 'the bar to lock in must not move');
  assert.equal(coreActivities(profile.days[START].plan).length, coreBefore);

  // Clear the day's own list but leave the extras — still a clean sheet.
  for (const activity of profile.days[START].plan.filter((a) => a.kind !== 'extra')) {
    completeActivity(profile, START, activity.id);
  }
  assert.equal(profile.stats.perfectDays, 1, 'asking for more work should not cost a perfect day');
  assert.ok(profile.days[START].plan.some((a) => a.kind === 'extra' && !profile.days[START].completed.includes(a.id)));
});

test('extras stop at the daily cap', () => {
  const profile = makeProfile({ timeBudgetMinutes: 120 });
  openDay(profile, START);
  let added = 0;
  for (let i = 0; i < MAX_EXTRAS_PER_DAY + 4; i++) if (addExtra(profile, START, 'any')) added++;
  assert.ok(added <= MAX_EXTRAS_PER_DAY, `added ${added} extras, cap is ${MAX_EXTRAS_PER_DAY}`);
  assert.equal(extrasLeft(profile, START), MAX_EXTRAS_PER_DAY - added);
});

test('extras obey the same safety rails as the daily plan', () => {
  // Injured: no high-load work can be generated, however many times you ask.
  const injured = makeProfile({ limitations: ['injury'], focus: ['fitness'] });
  openDay(injured, START);
  for (let i = 0; i < MAX_EXTRAS_PER_DAY; i++) {
    const result = addExtra(injured, START, 'fitness');
    if (!result) break;
    assert.notEqual(result.activity.load, 'high');
    assert.ok(!result.activity.tags.includes('impact'));
  }

  // The weekly hard-session budget cannot be spent twice by generating.
  const beginner = makeProfile({ fitnessLevel: 1, focus: ['fitness'] });
  openDay(beginner, START);
  for (let i = 0; i < MAX_EXTRAS_PER_DAY; i++) addExtra(beginner, START, 'workout');
  const heavy = beginner.days[START].plan.filter((a) => a.load === 'high').length;
  assert.ok(heavy <= 1, `${heavy} high-load sessions in one day`);
});

test('asking for a workout fills in the session already on the plan', () => {
  const profile = makeProfile({ equipment: ['gym'], focus: ['fitness'], fitnessLevel: 4, timeBudgetMinutes: 120 });
  // Find a day whose plan actually contains the gym session.
  let date = START;
  for (let i = 0; i < 20; i++) {
    const { day } = openDay(profile, date);
    if (day.plan.some((a) => a.templateId === 'gym-strength')) break;
    for (const activity of [...day.plan]) completeActivity(profile, date, activity.id);
    date = addDays(date, 1);
  }
  const day = profile.days[date];
  const session = day.plan.find((a) => a.templateId === 'gym-strength');
  if (!session) return; // no gym day in the window; nothing to assert

  const planSize = day.plan.length;
  const result = addExtra(profile, date, 'workout');
  assert.ok(result);
  assert.equal(result.mode, 'filled', 'it should write the routine into the session, not add a second one');
  assert.equal(profile.days[date].plan.length, planSize, 'no extra card for a session already planned');
  assert.ok(session.steps && session.steps.length >= 4, 'the planned session now carries the routine');
  assert.equal(extrasLeft(profile, date), MAX_EXTRAS_PER_DAY, 'filling in a routine is not spending an extra');
});

test('a generated workout is a real session, scaled to the rating', () => {
  const profile = makeProfile({ equipment: ['gym'], age: 22 });
  assert.equal(workoutAvailable(profile), true);

  const light = buildWorkout(profile.traits, 38, new Rng(1));
  const heavy = buildWorkout(profile.traits, 82, new Rng(1));
  assert.ok(light && heavy);
  assert.ok(light.steps.length >= 4, 'even a beginner session needs a warm-up, work and a cool-down');
  assert.ok(heavy.steps.length > light.steps.length, 'a stronger person gets more work');
  assert.ok(heavy.xp > light.xp);
  assert.match(light.steps[0], /min/, 'every session opens with a warm-up');
  assert.match(light.steps[light.steps.length - 1], /Cool down/);

  // No duplicated movements inside one session.
  const names = heavy.steps.slice(1, -1).map((s) => s.split(' — ')[0]);
  assert.equal(new Set(names).size, names.length, 'a session should not repeat a movement');
});

test('workouts respect age and equipment', () => {
  const teen = makeProfile({ age: 14, equipment: ['gym'] });
  const workout = buildWorkout(teen.traits, 70, new Rng(7));
  assert.ok(workout);
  const barbell = EXERCISES.filter((e) => (e.minAge ?? 0) > 14).map((e) => e.name);
  for (const step of workout.steps) {
    for (const name of barbell) assert.ok(!step.startsWith(name), `${name} was programmed for a 14-year-old`);
  }
  assert.notEqual(workout.tier, 'elite', 'a teen never gets an elite session');

  const bodyweightOnly = makeProfile({ equipment: [] });
  const home = buildWorkout(bodyweightOnly.traits, 55, new Rng(3));
  assert.ok(home, 'a session should still be buildable with no equipment at all');
  assert.equal(home.place, 'home');

  const limited = makeProfile({ limitations: ['low-mobility'] });
  assert.equal(canBuildWorkout(limited.traits), false);
});

test('the badge ladder is ordered, gapless and covers every Overall', () => {
  for (let i = 1; i < RANK_TIERS.length; i++) {
    assert.ok(RANK_TIERS[i].min > RANK_TIERS[i - 1].min, 'tier thresholds must increase');
  }
  assert.equal(RANK_TIERS[0].min, 0, 'there has to be a badge for someone on day one');
  assert.equal(new Set(RANK_TIERS.map((t) => t.id)).size, RANK_TIERS.length);
  for (let overall = 25; overall <= 99; overall++) {
    const tier = rankTierFor(overall);
    assert.ok(overall >= tier.min, `Overall ${overall} resolved to a tier it has not reached`);
  }
  assert.equal(rankTierFor(99).id, 'legend');
});

/* ------------------------------------------------------------------ *
 * The long game
 * ------------------------------------------------------------------ */

test('a year of daily work stays coherent', () => {
  const profile = makeProfile({ timeBudgetMinutes: 75 });
  let date = START;
  let plansGenerated = 0;

  for (let i = 0; i < 365; i++) {
    const { day } = openDay(profile, date);
    assert.ok(day.plan.length >= 4, `empty-ish plan on day ${i}`);
    plansGenerated++;
    // Miss one day in seven, like a real person.
    if (i % 7 !== 5) {
      for (const activity of [...day.plan]) completeActivity(profile, date, activity.id);
    }
    date = addDays(date, 1);
  }

  const view = profileView(profile);
  assert.equal(plansGenerated, 365);
  assert.ok(view.overall > view.seedOverall, 'a year of work should raise the Overall');
  assert.ok(view.overall <= 99);
  assert.ok(view.level.level > 20, `only reached level ${view.level.level} in a year`);
  for (const key of ATTRIBUTE_KEYS) {
    assert.ok(view.attributes[key] >= profile.seedAttributes[key], `${key} went backwards`);
    assert.ok(view.attributes[key] <= 99);
  }
  // History is pruned, but only well past the point anyone would look at it.
  assert.ok(Object.keys(profile.days).length <= 731);
});

test('every catalogue entry is well formed', () => {
  const ids = new Set<string>();
  for (const template of CATALOG) {
    assert.ok(!ids.has(template.id), `duplicate template id ${template.id}`);
    ids.add(template.id);
    assert.ok(template.tiers.length > 0, `${template.id} has no tiers`);
    assert.ok(ATTRIBUTE_KEYS.includes(template.attribute), `${template.id} has an unknown attribute`);
    assert.notEqual(template.attribute, template.secondary, `${template.id} lists itself as its own secondary`);

    let previousXp = 0;
    for (const tier of template.tiers) {
      assert.ok(tier.title.length > 0 && tier.detail.length > 0, `${template.id}/${tier.tier} is missing copy`);
      assert.ok(tier.xp > 0, `${template.id}/${tier.tier} pays no XP`);
      assert.ok(tier.xp > previousXp, `${template.id} tiers should pay more as they get harder`);
      previousXp = tier.xp;
    }
  }

  // Every attribute needs enough activities to fill a rotation on its own.
  for (const key of ATTRIBUTE_KEYS) {
    const count = CATALOG.filter((t) => t.attribute === key).length;
    assert.ok(count >= 5, `${key} only has ${count} activities`);
  }
});
