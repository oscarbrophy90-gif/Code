import { computeOverall, currentAttributes, emptyAttributeXp, progressFor, ratingFor } from './attributes.ts';
import { newlyEarned, type Achievement } from './achievements.ts';
import { refreshWeekly } from './challenges.ts';
import { addDays, dateKey, daysBetween, type DateKey } from './day.ts';
import { coreActivities, generatePlan, lockInGoal, swapActivity } from './generator.ts';
import { extrasLeft, generateExtra, type ExtraResult, type ExtraSection } from './extras.ts';
import { levelForXp, levelProgress } from './levels.ts';
import { reachedMilestones, type Milestone } from './milestones.ts';
import { completionLine, lockInLine, summaryLine } from './motivation.ts';
import { buildStart } from './seed.ts';
import { defaultSurvey, normaliseSurvey } from './survey.ts';
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type Attributes,
  type DayRecord,
  type PlannedActivity,
  type Profile,
  type SurveyAnswers,
  type Tier,
} from './types.ts';

/**
 * The rules engine: everything that changes a profile lives here.
 *
 * Two invariants the rest of the app relies on:
 *
 *  1. Ratings are never stored, only derived — from a survey-set seed plus the
 *     XP you have earned in that area. So nothing can "un-earn" a rating point.
 *  2. Only *activities* feed attribute XP. Bonus XP from weekly challenges and
 *     milestones goes to your account level alone. Otherwise your Fitness
 *     rating could climb on a week you never trained, and the number on the
 *     card would stop meaning anything.
 */

export const PROFILE_VERSION = 1;
export const MAX_SHIELDS = 2;
/** Two years of day records is plenty of history and still tiny in storage. */
export const HISTORY_DAYS = 730;

/** Streak XP bonus, capped so a long streak never trivialises the work. */
export const STREAK_BONUS_PER_DAY = 0.02;
export const MAX_STREAK_BONUS = 0.3;
/** Paid on everything you do on the day you come back from a break. */
export const COMEBACK_BONUS = 0.25;

function emptyStats(): Profile['stats'] {
  return {
    activitiesCompleted: 0,
    xpTotal: 0,
    byAttribute: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 0])) as Record<AttributeKey, number>,
    byTemplate: {},
    byTier: { light: 0, steady: 0, hard: 0, elite: 0 },
    challengesCompleted: 0,
    weeklyChallengesCompleted: 0,
    perfectDays: 0,
    daysActive: 0,
    comebacks: 0,
    highestOverall: 0,
  };
}

export function createProfile(answers: SurveyAnswers, now: number = Date.now()): Profile {
  const survey = normaliseSurvey({ ...defaultSurvey(), ...answers });
  const { traits, attributes } = buildStart(survey);

  const profile: Profile = {
    version: PROFILE_VERSION,
    id: `bm-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    createdAt: now,
    updatedAt: now,
    survey,
    traits,
    seedAttributes: attributes,
    attributeXp: emptyAttributeXp(),
    totalXp: 0,
    streak: { current: 0, best: 0, lastLockIn: null, shields: 0, shieldsSpent: 0, totalLockInDays: 0, comeback: false },
    days: {},
    achievements: {},
    weekly: null,
    milestones: {},
    stats: emptyStats(),
    settings: {
      reducedMotion: typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false,
      sound: true,
      dayEndsAtHour: 21,
    },
  };

  profile.stats.highestOverall = computeOverall(attributes, traits.focus);
  return profile;
}

/**
 * Re-runs the survey without touching earned progress.
 *
 * Seed ratings and traits are re-derived, so an honest update ("I'm training
 * five days a week now", "my knee is fine again") moves your card and changes
 * tomorrow's plan. Every point of XP you earned stays exactly where it was.
 */
export function retakeSurvey(profile: Profile, answers: SurveyAnswers, now: number = Date.now()): Profile {
  const survey = normaliseSurvey(answers);
  const { traits, attributes } = buildStart(survey);
  profile.survey = survey;
  profile.traits = traits;
  profile.seedAttributes = attributes;
  profile.updatedAt = now;
  profile.stats.highestOverall = Math.max(profile.stats.highestOverall, overallOfProfile(profile));
  return profile;
}

function overallOfProfile(profile: Profile): number {
  return computeOverall(currentAttributes(profile), profile.traits.focus);
}

/* ------------------------------------------------------------------ *
 * The day
 * ------------------------------------------------------------------ */

export interface DayOpened {
  day: DayRecord;
  created: boolean;
  /** Days between the last lock-in and today that went unclaimed. */
  missedDays: number;
  shieldsUsed: number;
  streakBroken: boolean;
  /** The streak as it stood before this rollover, for the "you had N" message. */
  previousStreak: number;
}

function freshDay(profile: Profile, date: DateKey): DayRecord {
  const attributes = currentAttributes(profile);
  return {
    date,
    plan: generatePlan(profile, date),
    completed: [],
    completedAt: {},
    xpByActivity: {},
    xpEarned: 0,
    overallStart: computeOverall(attributes, profile.traits.focus),
    attributesStart: attributes,
    overallEnd: computeOverall(attributes, profile.traits.focus),
    attributesEnd: attributes,
    lockedIn: false,
    lockInPrevious: null,
    perfectCounted: false,
    summaryShown: false,
    swapsUsed: 0,
    shielded: false,
  };
}

/**
 * Opens `date`, generating its plan the first time and settling the streak for
 * any days that were missed on the way here.
 *
 * Shields only spend when they can cover the *whole* gap — burning both shields
 * on a five-day absence that breaks the streak anyway would be the app taking
 * something from you for nothing.
 */
export function openDay(profile: Profile, date: DateKey = dateKey(), now: number = Date.now()): DayOpened {
  const existing = profile.days[date];
  if (existing) {
    refreshWeekly(profile, date);
    return { day: existing, created: false, missedDays: 0, shieldsUsed: 0, streakBroken: false, previousStreak: profile.streak.current };
  }

  const previousStreak = profile.streak.current;
  let missedDays = 0;
  let shieldsUsed = 0;
  let streakBroken = false;

  const last = profile.streak.lastLockIn;
  if (last && profile.streak.current > 0) {
    const gap = daysBetween(last, date);
    if (gap >= 2) {
      missedDays = gap - 1;
      if (missedDays <= profile.streak.shields) {
        profile.streak.shields -= missedDays;
        profile.streak.shieldsSpent += missedDays;
        shieldsUsed = missedDays;
      } else {
        streakBroken = true;
        profile.streak.best = Math.max(profile.streak.best, profile.streak.current);
        profile.streak.current = 0;
        profile.streak.comeback = true;
        profile.stats.comebacks++;
      }
    }
  }

  // The comeback bonus is a one-day welcome mat: it survives the whole day you
  // return, and is cleared the next time you open the app having locked in.
  if (!streakBroken && profile.days[addDays(date, -1)]?.lockedIn) profile.streak.comeback = false;

  const day = freshDay(profile, date);
  day.shielded = shieldsUsed > 0;
  profile.days[date] = day;
  pruneHistory(profile, date);
  refreshWeekly(profile, date);
  profile.updatedAt = now;

  return { day, created: true, missedDays, shieldsUsed, streakBroken, previousStreak };
}

function pruneHistory(profile: Profile, date: DateKey): void {
  const cutoff = addDays(date, -HISTORY_DAYS);
  for (const key of Object.keys(profile.days)) {
    if (key < cutoff) delete profile.days[key];
  }
}

/* ------------------------------------------------------------------ *
 * Completing work
 * ------------------------------------------------------------------ */

export interface XpBreakdown {
  base: number;
  streakBonus: number;
  comebackBonus: number;
  total: number;
}

export function xpFor(profile: Profile, activity: PlannedActivity): XpBreakdown {
  const base = activity.xp;
  const streakRate = Math.min(MAX_STREAK_BONUS, profile.streak.current * STREAK_BONUS_PER_DAY);
  const streakBonus = Math.round(base * streakRate);
  const comebackBonus = profile.streak.comeback ? Math.round(base * COMEBACK_BONUS) : 0;
  return { base, streakBonus, comebackBonus, total: base + streakBonus + comebackBonus };
}

export interface AttributeGain {
  key: AttributeKey;
  xp: number;
  from: number;
  to: number;
}

export interface CompletionResult {
  activity: PlannedActivity;
  xp: XpBreakdown;
  gains: AttributeGain[];
  overallBefore: number;
  overallAfter: number;
  levelBefore: number;
  levelAfter: number;
  /** Account XP after everything on this tick, for the level-up screen. */
  totalXp: number;
  lockedInNow: boolean;
  streak: number;
  achievements: Achievement[];
  milestones: Milestone[];
  weeklyCompleted: boolean;
  weeklyXp: number;
  message: string;
}

/** Attribute XP split: the secondary area gets half, rounded. */
function secondaryShare(total: number): number {
  return Math.round(total * 0.5);
}

export function completeActivity(
  profile: Profile,
  date: DateKey,
  activityId: string,
  now: number = Date.now(),
): CompletionResult | null {
  const { day } = openDay(profile, date, now);
  const activity = day.plan.find((a) => a.id === activityId);
  if (!activity || day.completed.includes(activityId)) return null;

  const overallBefore = overallOfProfile(profile);
  const levelBefore = levelForXp(profile.totalXp);
  const before = currentAttributes(profile);

  const xp = xpFor(profile, activity);

  day.completed.push(activityId);
  day.completedAt[activityId] = now;
  day.xpByActivity[activityId] = xp.total;
  day.xpEarned += xp.total;

  profile.totalXp += xp.total;
  profile.attributeXp[activity.attribute] += xp.total;
  if (activity.secondary) profile.attributeXp[activity.secondary] += secondaryShare(xp.total);

  const stats = profile.stats;
  stats.activitiesCompleted++;
  stats.xpTotal += xp.total;
  stats.byAttribute[activity.attribute] += xp.total;
  stats.byTemplate[activity.templateId] = (stats.byTemplate[activity.templateId] ?? 0) + 1;
  stats.byTier[activity.tier]++;
  if (activity.kind === 'challenge') stats.challengesCompleted++;
  if (day.completed.length === 1) stats.daysActive++;

  const lockedInNow = evaluateLockIn(profile, day);

  // A clean sheet is the day's own list. Generating extra work and leaving one
  // undone must not be able to take it away — asking for more is not a failure.
  const scored = day.plan.filter((a) => a.kind !== 'extra');
  if (!day.perfectCounted && scored.length > 0 && scored.every((a) => day.completed.includes(a.id))) {
    day.perfectCounted = true;
    stats.perfectDays++;
  }

  const weekly = refreshWeekly(profile, date);
  let weeklyXp = 0;
  if (weekly.completedNow) {
    weeklyXp = weekly.weekly.xp;
    profile.totalXp += weeklyXp;
    stats.weeklyChallengesCompleted++;
  }

  const after = currentAttributes(profile);
  const overallAfter = computeOverall(after, profile.traits.focus);
  stats.highestOverall = Math.max(stats.highestOverall, overallAfter);

  day.attributesEnd = after;
  day.overallEnd = overallAfter;

  const milestones = awardMilestones(profile, now);
  const achievements = awardAchievements(profile, now);

  profile.updatedAt = now;

  const gains: AttributeGain[] = [];
  const touched: AttributeKey[] = activity.secondary ? [activity.attribute, activity.secondary] : [activity.attribute];
  for (const key of touched) {
    gains.push({
      key,
      xp: key === activity.attribute ? xp.total : secondaryShare(xp.total),
      from: before[key],
      to: after[key],
    });
  }

  return {
    activity,
    xp,
    gains,
    overallBefore,
    overallAfter,
    levelBefore,
    levelAfter: levelForXp(profile.totalXp),
    totalXp: profile.totalXp,
    lockedInNow,
    streak: profile.streak.current,
    achievements,
    milestones,
    weeklyCompleted: weekly.completedNow,
    weeklyXp,
    message: lockedInNow ? lockInLine(date) : completionLine(activity, day.completed.length),
  };
}

function evaluateLockIn(profile: Profile, day: DayRecord): boolean {
  if (day.lockedIn) return false;
  const done = coreActivities(day.plan).filter((a) => day.completed.includes(a.id)).length;
  if (done < lockInGoal(day.plan)) return false;

  day.lockedIn = true;
  day.lockInPrevious = profile.streak.lastLockIn;
  profile.streak.current += 1;
  profile.streak.best = Math.max(profile.streak.best, profile.streak.current);
  profile.streak.lastLockIn = day.date;
  profile.streak.totalLockInDays++;
  profile.streak.comeback = false;

  // A shield every seven consecutive days. Earned by consistency, spent
  // automatically, and capped so it never becomes a way to coast.
  if (profile.streak.current % 7 === 0 && profile.streak.shields < MAX_SHIELDS) profile.streak.shields++;
  return true;
}

function awardAchievements(profile: Profile, now: number): Achievement[] {
  const earned = newlyEarned(profile);
  for (const achievement of earned) profile.achievements[achievement.id] = now;
  return earned;
}

function awardMilestones(profile: Profile, now: number): Milestone[] {
  const out: Milestone[] = [];
  // Two passes: milestone XP can push you over a level milestone, and that
  // should fire on the same tick rather than waiting for the next activity.
  for (let pass = 0; pass < 2; pass++) {
    const state = {
      overall: overallOfProfile(profile),
      level: levelForXp(profile.totalXp),
      streak: profile.streak.current,
      daysActive: profile.stats.daysActive,
    };
    const reached = reachedMilestones(profile, state);
    if (reached.length === 0) break;
    for (const milestone of reached) {
      profile.milestones[milestone.id] = now;
      profile.totalXp += milestone.xp;
      out.push(milestone);
    }
  }
  return out;
}

/**
 * Undo, for the mis-tap.
 *
 * Reverses XP, attribute XP and the lock-in exactly. Achievements and
 * milestones already awarded are deliberately *not* revoked — a badge blinking
 * off someone's profile because they fixed a typo would feel far worse than the
 * tiny inconsistency of keeping it.
 */
export function undoActivity(profile: Profile, date: DateKey, activityId: string, now: number = Date.now()): boolean {
  const day = profile.days[date];
  if (!day) return false;
  const index = day.completed.indexOf(activityId);
  if (index < 0) return false;
  const activity = day.plan.find((a) => a.id === activityId);
  if (!activity) return false;

  const awarded = day.xpByActivity[activityId] ?? activity.xp;
  day.completed.splice(index, 1);
  delete day.completedAt[activityId];
  delete day.xpByActivity[activityId];
  day.xpEarned = Math.max(0, day.xpEarned - awarded);

  profile.totalXp = Math.max(0, profile.totalXp - awarded);
  profile.attributeXp[activity.attribute] = Math.max(0, profile.attributeXp[activity.attribute] - awarded);
  if (activity.secondary) {
    profile.attributeXp[activity.secondary] = Math.max(0, profile.attributeXp[activity.secondary] - secondaryShare(awarded));
  }

  const stats = profile.stats;
  stats.activitiesCompleted = Math.max(0, stats.activitiesCompleted - 1);
  stats.xpTotal = Math.max(0, stats.xpTotal - awarded);
  stats.byAttribute[activity.attribute] = Math.max(0, stats.byAttribute[activity.attribute] - awarded);
  const templateCount = Math.max(0, (stats.byTemplate[activity.templateId] ?? 1) - 1);
  if (templateCount === 0) delete stats.byTemplate[activity.templateId];
  else stats.byTemplate[activity.templateId] = templateCount;
  stats.byTier[activity.tier] = Math.max(0, stats.byTier[activity.tier] - 1);
  if (activity.kind === 'challenge') stats.challengesCompleted = Math.max(0, stats.challengesCompleted - 1);
  if (day.completed.length === 0) stats.daysActive = Math.max(0, stats.daysActive - 1);

  if (day.perfectCounted) {
    day.perfectCounted = false;
    stats.perfectDays = Math.max(0, stats.perfectDays - 1);
  }

  const done = coreActivities(day.plan).filter((a) => day.completed.includes(a.id)).length;
  if (day.lockedIn && done < lockInGoal(day.plan)) {
    day.lockedIn = false;
    // If this lock-in was the one that set the record, the record goes with it —
    // otherwise an accidental tap would leave a personal best nobody ever hit.
    if (profile.streak.best === profile.streak.current) profile.streak.best = Math.max(0, profile.streak.best - 1);
    profile.streak.current = Math.max(0, profile.streak.current - 1);
    profile.streak.totalLockInDays = Math.max(0, profile.streak.totalLockInDays - 1);
    profile.streak.lastLockIn = day.lockInPrevious;
    day.lockInPrevious = null;
    if (profile.streak.current > 0 && (profile.streak.current + 1) % 7 === 0 && profile.streak.shields > 0) {
      profile.streak.shields--;
    }
  }

  const after = currentAttributes(profile);
  day.attributesEnd = after;
  day.overallEnd = computeOverall(after, profile.traits.focus);
  refreshWeekly(profile, date);
  profile.updatedAt = now;
  return true;
}

/** Swaps an activity you cannot do today for a comparable one. */
export function swap(profile: Profile, date: DateKey, activityId: string, now: number = Date.now()): PlannedActivity | null {
  const day = profile.days[date];
  if (!day) return null;
  const replacement = swapActivity(profile, date, activityId);
  if (!replacement) return null;
  const index = day.plan.findIndex((a) => a.id === activityId);
  day.plan[index] = replacement;
  day.swapsUsed++;
  profile.updatedAt = now;
  return replacement;
}

/**
 * Adds one on-demand activity to today, in a section the user picked.
 *
 * Everything the daily generator refuses to do, this refuses to do too — age
 * gates, injuries, the weekly hard-session budget. "Give me more" is a request
 * for more work, not a way around the rails.
 */
export function addExtra(profile: Profile, date: DateKey, section: ExtraSection, now: number = Date.now()): ExtraResult | null {
  const day = profile.days[date];
  if (!day) return null;
  const result = generateExtra(profile, date, section);
  if (!result) return null;
  if (result.mode === 'added') day.plan.push(result.activity);
  profile.updatedAt = now;
  return result;
}

export function extrasRemaining(profile: Profile, date: DateKey): number {
  return extrasLeft(profile, date);
}

/* ------------------------------------------------------------------ *
 * Reading the day back
 * ------------------------------------------------------------------ */

export interface DaySummary {
  date: DateKey;
  completed: PlannedActivity[];
  missed: PlannedActivity[];
  xp: number;
  lockedIn: boolean;
  perfect: boolean;
  overallBefore: number;
  overallAfter: number;
  attributeDeltas: { key: AttributeKey; from: number; to: number }[];
  streak: number;
  message: string;
  goal: number;
  coreDone: number;
  coreTotal: number;
}

export function daySummary(profile: Profile, date: DateKey): DaySummary | null {
  const day = profile.days[date];
  if (!day) return null;
  const completed = day.plan.filter((a) => day.completed.includes(a.id));
  const missed = day.plan.filter((a) => !day.completed.includes(a.id));
  const core = coreActivities(day.plan);

  const attributeDeltas = ATTRIBUTE_KEYS.map((key) => ({
    key,
    from: day.attributesStart[key],
    to: day.attributesEnd[key],
  })).filter((d) => d.to !== d.from);

  return {
    date,
    completed,
    missed,
    xp: day.xpEarned,
    lockedIn: day.lockedIn,
    perfect: day.perfectCounted,
    overallBefore: day.overallStart,
    overallAfter: day.overallEnd,
    attributeDeltas,
    streak: profile.streak.current,
    message: summaryLine(date, completed.length, day.plan.length, day.lockedIn),
    goal: lockInGoal(day.plan),
    coreDone: core.filter((a) => day.completed.includes(a.id)).length,
    coreTotal: core.length,
  };
}

export interface ProfileView {
  attributes: Attributes;
  overall: number;
  level: ReturnType<typeof levelProgress>;
  nextAttributeSteps: Record<AttributeKey, ReturnType<typeof progressFor>>;
  seedOverall: number;
}

/** Everything the profile card needs, computed once. */
export function profileView(profile: Profile): ProfileView {
  const attributes = currentAttributes(profile);
  return {
    attributes,
    overall: computeOverall(attributes, profile.traits.focus),
    level: levelProgress(profile.totalXp),
    nextAttributeSteps: Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, progressFor(profile.seedAttributes[key], profile.attributeXp[key])]),
    ) as Record<AttributeKey, ReturnType<typeof progressFor>>,
    seedOverall: computeOverall(profile.seedAttributes, profile.traits.focus),
  };
}

/** Daily XP and Overall series for the progress charts, oldest first. */
export function history(profile: Profile, days: number, endDate: DateKey = dateKey()): { date: DateKey; xp: number; overall: number; lockedIn: boolean; completed: number; planned: number }[] {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(endDate, -i);
    const day = profile.days[key];
    out.push({
      date: key,
      xp: day?.xpEarned ?? 0,
      overall: day?.overallEnd ?? 0,
      lockedIn: !!day?.lockedIn,
      completed: day?.completed.length ?? 0,
      planned: day?.plan.length ?? 0,
    });
  }
  // A day you never opened has no Overall of its own; it should hold whatever
  // the number was the last time you did. Forward pass carries the last known
  // value, then the leading stretch (before you joined) gets the first one.
  let carry = 0;
  for (const entry of out) {
    if (entry.overall > 0) carry = entry.overall;
    else entry.overall = carry;
  }
  const first = out.find((d) => d.overall > 0)?.overall ?? computeOverall(profile.seedAttributes, profile.traits.focus);
  for (const entry of out) {
    if (entry.overall > 0) break;
    entry.overall = first;
  }
  return out;
}

export function tierLabel(tier: Tier): string {
  switch (tier) {
    case 'light':
      return 'Light';
    case 'steady':
      return 'Steady';
    case 'hard':
      return 'Hard';
    case 'elite':
      return 'Elite';
  }
}

export function ratingOf(profile: Profile, key: AttributeKey): number {
  return ratingFor(profile.seedAttributes[key], profile.attributeXp[key]);
}
