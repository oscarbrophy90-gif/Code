import { ATTRIBUTE_KEYS, type Attributes, type SurveyAnswers, type Tier, type Traits, type AttributeKey } from './types.ts';
import { clampRating } from './attributes.ts';

/**
 * Survey → starting card.
 *
 * Two jobs live here, and they are deliberately separate:
 *
 *   `deriveTraits`     — the safety-and-shape rules the generator obeys.
 *   `seedAttributes`   — the ratings you open the app on.
 *
 * Because progress is stored as XP *on top of* the seed, retaking the survey
 * can re-derive both without wiping a single point you earned.
 */

/** Nobody starts near the ceiling. There has to be a game left to play. */
const SEED_MIN = 30;
const SEED_MAX = 72;

/** Maps a 1-5 self-report onto a rating band. */
function fromScale(value: number, low: number, high: number): number {
  const t = (Math.max(1, Math.min(5, value)) - 1) / 4;
  return low + (high - low) * t;
}

export function seedAttributes(survey: SurveyAnswers, traits: Traits): Attributes {
  const interests = new Set(survey.interests);
  const equipment = new Set(survey.equipment);

  const fitness =
    fromScale(survey.fitnessLevel, 30, 66) +
    (interests.has('lifting') || interests.has('running') || interests.has('team-sport') || interests.has('martial-arts') ? 3 : 0) +
    (equipment.has('gym') || equipment.has('sports-team') ? 2 : 0);

  // Hours matter more than confidence here — study time is the one input people
  // report accurately, because it is a number they can check.
  const studyBase = 36 + Math.min(survey.studyHours, 5) * 6;
  const education =
    (survey.student ? studyBase : studyBase - 4) +
    fromScale(survey.focusLevel, -4, 6) +
    (interests.has('reading') ? 3 : 0);

  const discipline =
    fromScale(survey.routineStrength, 30, 64) + fromScale(survey.sleepConsistency, -3, 5) + fromScale(survey.focusLevel, -2, 4);

  const waterRatio = traits.waterTargetGlasses === 0 ? 1 : survey.waterGlasses / traits.waterTargetGlasses;
  const health = fromScale(survey.healthLevel, 32, 64) + (Math.min(1.2, waterRatio) - 0.5) * 10 + fromScale(survey.fitnessLevel, -2, 4);

  const sleepRatio = survey.sleepHours / traits.sleepTargetHours;
  const sleep =
    44 +
    // Under-sleeping hurts more than over-sleeping helps, which is why the
    // shortfall is scaled harder than the surplus.
    (sleepRatio >= 1 ? Math.min(0.15, sleepRatio - 1) * 60 : (sleepRatio - 1) * 55) +
    fromScale(survey.sleepConsistency, -6, 10);

  const productivity =
    fromScale(survey.focusLevel, 32, 62) + fromScale(survey.routineStrength, -2, 6) + Math.min(survey.studyHours, 4) * 1.5;

  const social = fromScale(survey.socialLevel, 30, 66) + (interests.has('team-sport') ? 3 : 0);

  const skillInterests = ['music', 'coding', 'art', 'writing', 'language', 'cooking', 'chess', 'business'] as const;
  const skillCount = skillInterests.filter((k) => interests.has(k)).length;
  const skills = 40 + skillCount * 4 + fromScale(survey.focusLevel, -2, 5);

  const mindset = fromScale(survey.mindsetLevel, 30, 64) + fromScale(survey.sleepConsistency, -2, 4);

  const raw: Attributes = { fitness, education, discipline, health, sleep, productivity, social, skills, mindset };
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, Math.max(SEED_MIN, Math.min(SEED_MAX, clampRating(raw[key])))]),
  ) as Attributes;
}

export function ageBandFor(age: number): Traits['ageBand'] {
  if (age < 18) return 'teen';
  if (age < 26) return 'young-adult';
  if (age < 60) return 'adult';
  return 'older-adult';
}

/** Public health guidance, rounded to one number a game can show. */
export function sleepTargetFor(age: number): number {
  if (age < 18) return 9;
  if (age < 65) return 8;
  return 7.5;
}

function slotsFor(minutes: number): number {
  if (minutes <= 25) return 4;
  if (minutes <= 55) return 5;
  if (minutes <= 90) return 6;
  return 7;
}

export function deriveTraits(survey: SurveyAnswers): Traits {
  const ageBand = ageBandFor(survey.age);
  const limitations = new Set(survey.limitations);

  // Ceilings are safety rails, not difficulty settings. Day-to-day difficulty
  // comes from your current rating in `generator.ts`; this is the line that
  // difficulty is never allowed to cross for this person.
  const ceiling = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 'elite' as Tier])) as Record<AttributeKey, Tier>;
  if (ageBand === 'teen' || ageBand === 'older-adult') ceiling.fitness = 'hard';
  if (limitations.has('injury')) ceiling.fitness = 'steady';
  if (limitations.has('low-mobility')) ceiling.fitness = 'light';

  let highLoadPerWeek = Math.max(1, survey.fitnessLevel - 1) + (survey.fitnessLevel >= 4 ? 1 : 0);
  if (ageBand === 'teen') highLoadPerWeek = Math.min(highLoadPerWeek, 4);
  if (ageBand === 'older-adult') highLoadPerWeek = Math.min(highLoadPerWeek, 3);
  if (limitations.has('injury') || limitations.has('low-mobility')) highLoadPerWeek = 0;

  const waterTargetGlasses = Math.min(10, 8 + (survey.fitnessLevel >= 4 ? 1 : 0));

  return {
    age: survey.age,
    ageBand,
    focus: survey.focus.slice(),
    interests: survey.interests.slice(),
    equipment: survey.equipment.slice(),
    limitations: survey.limitations.slice(),
    student: survey.student,
    dailySlots: slotsFor(survey.timeBudgetMinutes),
    ceiling,
    sleepTargetHours: sleepTargetFor(survey.age),
    waterTargetGlasses,
    highLoadPerWeek,
  };
}

/** Convenience: survey in, both halves of the starting card out. */
export function buildStart(survey: SurveyAnswers): { traits: Traits; attributes: Attributes } {
  const traits = deriveTraits(survey);
  return { traits, attributes: seedAttributes(survey, traits) };
}
