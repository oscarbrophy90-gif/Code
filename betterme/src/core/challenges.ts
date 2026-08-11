import { ATTRIBUTE_META } from './attributes.ts';
import { weekDays, weekKey, type DateKey } from './day.ts';
import { rngFor } from './rng.ts';
import type { AttributeKey, PlannedActivity, Profile, WeeklyChallengeState, WeeklyKind } from './types.ts';

/**
 * Weekly challenges.
 *
 * One objective per week, sized off what the user is actually doing rather than
 * a fixed number, and always *recomputed* from the day records instead of being
 * incremented. Recomputing means an undo, a swap or a mid-week survey retake can
 * never leave the bar showing a number the days do not support.
 */

export interface CompletedActivity {
  date: DateKey;
  activity: PlannedActivity;
}

/** Every activity actually ticked off during the week containing `date`. */
export function completedInWeek(profile: Profile, date: DateKey): CompletedActivity[] {
  const out: CompletedActivity[] = [];
  for (const key of weekDays(date)) {
    const day = profile.days[key];
    if (!day) continue;
    for (const activity of day.plan) {
      if (day.completed.includes(activity.id)) out.push({ date: key, activity });
    }
  }
  return out;
}

export function xpInWeek(profile: Profile, date: DateKey): number {
  return weekDays(date).reduce((sum, key) => sum + (profile.days[key]?.xpEarned ?? 0), 0);
}

export function lockInDaysInWeek(profile: Profile, date: DateKey): number {
  return weekDays(date).filter((key) => profile.days[key]?.lockedIn).length;
}

export function weeklyProgress(profile: Profile, weekly: WeeklyChallengeState, date: DateKey): number {
  const done = completedInWeek(profile, date);
  switch (weekly.kind) {
    case 'attribute-count':
      return done.filter((d) => d.activity.attribute === weekly.param || d.activity.secondary === weekly.param).length;
    case 'lock-in-days':
      return lockInDaysInWeek(profile, date);
    case 'earn-xp':
      return xpInWeek(profile, date);
    case 'tier-count':
      return done.filter((d) => d.activity.tier === weekly.param || d.activity.tier === 'elite').length;
    case 'challenge-count':
      return done.filter((d) => d.activity.kind === 'challenge').length;
    case 'total-count':
      return done.length;
  }
}

interface WeeklyBlueprint {
  kind: WeeklyKind;
  param: string | null;
  title: string;
  detail: string;
  target: number;
  xp: number;
}

/**
 * Targets scale with the user's own plan size, so a four-slot day and a
 * seven-slot day get weeks that are equally demanding relative to them.
 */
function blueprints(profile: Profile): WeeklyBlueprint[] {
  const slots = profile.traits.dailySlots;
  const focus = profile.traits.focus;
  const out: WeeklyBlueprint[] = [
    {
      kind: 'lock-in-days',
      param: null,
      title: 'Show up five days',
      detail: 'Lock in on five of the seven days this week.',
      target: 5,
      xp: 320,
    },
    {
      kind: 'total-count',
      param: null,
      title: 'Volume week',
      detail: `Complete ${slots * 4} activities before Sunday night.`,
      target: slots * 4,
      xp: 300,
    },
    {
      kind: 'earn-xp',
      param: null,
      title: 'Earn the points',
      detail: `Bank ${slots * 260} XP this week.`,
      target: slots * 260,
      xp: 340,
    },
    {
      kind: 'challenge-count',
      param: null,
      title: 'Take the bonus',
      detail: 'Complete four daily challenges this week.',
      target: 4,
      xp: 360,
    },
    {
      kind: 'tier-count',
      param: 'hard',
      title: 'Do the hard stuff',
      detail: 'Complete five hard or elite activities this week.',
      target: 5,
      xp: 380,
    },
  ];

  for (const attribute of focus) {
    const meta = ATTRIBUTE_META[attribute];
    out.push({
      kind: 'attribute-count',
      param: attribute,
      title: `${meta.label} week`,
      detail: `Complete six ${meta.label.toLowerCase()} activities this week.`,
      target: 6,
      xp: 360,
    });
  }

  return out;
}

export function generateWeekly(profile: Profile, date: DateKey): WeeklyChallengeState {
  const week = weekKey(date);
  const rng = rngFor(profile.id, week, 'weekly');
  const pool = blueprints(profile);
  // Never the same objective two weeks running, provided there is an alternative.
  const filtered = profile.weekly ? pool.filter((b) => `${b.kind}:${b.param ?? ''}` !== profile.weekly?.id) : pool;
  const blueprint = rng.pick(filtered.length > 0 ? filtered : pool);

  return {
    week,
    id: `${blueprint.kind}:${blueprint.param ?? ''}`,
    kind: blueprint.kind,
    param: blueprint.param,
    title: blueprint.title,
    detail: blueprint.detail,
    target: blueprint.target,
    progress: 0,
    xp: blueprint.xp,
    claimed: false,
  };
}

export interface WeeklyRefresh {
  weekly: WeeklyChallengeState;
  /** Set on the update that pushed it over the line. */
  completedNow: boolean;
}

/**
 * Brings the weekly challenge up to date for `date` — rolling to a new week
 * when needed, recomputing progress, and auto-claiming the moment it is met.
 * Auto-claim is deliberate: nobody should lose a reward because they forgot to
 * come back and press a button.
 */
export function refreshWeekly(profile: Profile, date: DateKey): WeeklyRefresh {
  let weekly = profile.weekly;
  if (!weekly || weekly.week !== weekKey(date)) weekly = generateWeekly(profile, date);

  const progress = weeklyProgress(profile, weekly, date);
  const completedNow = !weekly.claimed && progress >= weekly.target;
  weekly = { ...weekly, progress, claimed: weekly.claimed || completedNow };
  profile.weekly = weekly;
  return { weekly, completedNow };
}

/** Convenience for the challenges screen: how the current week is going. */
export interface WeekSummary {
  days: { date: DateKey; xp: number; lockedIn: boolean; completed: number; planned: number; future: boolean }[];
  xp: number;
  lockInDays: number;
  activities: number;
}

export function weekSummary(profile: Profile, date: DateKey): WeekSummary {
  const days = weekDays(date).map((key) => {
    const day = profile.days[key];
    return {
      date: key,
      xp: day?.xpEarned ?? 0,
      lockedIn: !!day?.lockedIn,
      completed: day?.completed.length ?? 0,
      planned: day?.plan.length ?? 0,
      future: key > date,
    };
  });
  return {
    days,
    xp: days.reduce((sum, d) => sum + d.xp, 0),
    lockInDays: days.filter((d) => d.lockedIn).length,
    activities: days.reduce((sum, d) => sum + d.completed, 0),
  };
}

/** Attribute a weekly challenge points at, for colouring the card. */
export function weeklyAttribute(weekly: WeeklyChallengeState): AttributeKey | null {
  return weekly.kind === 'attribute-count' ? (weekly.param as AttributeKey) : null;
}
