import { CATALOG } from './catalog.ts';
import { currentAttributes } from './attributes.ts';
import { instantiate, isEligible, planContext, type PlanContext } from './generator.ts';
import { rngFor } from './rng.ts';
import { buildWorkout, canBuildWorkout } from './workouts.ts';
import type { DateKey } from './day.ts';
import type { AttributeKey, PlannedActivity, Profile } from './types.ts';

/**
 * "Generate more" — extra work, on demand, in a section you choose.
 *
 * The daily plan is deliberately short, because a list you can finish is a list
 * you come back to. This is the release valve for the days you have more in you:
 * pick an area, get one more thing to do, sized to your rating in that area.
 *
 * Extras are additive only. They do not change the lock-in goal and they do not
 * spoil a clean sheet if you leave one undone — asking for more work should
 * never be able to make your day look worse.
 */

/** Enough for a genuinely big day; low enough that the day cannot be farmed. */
export const MAX_EXTRAS_PER_DAY = 6;

export type ExtraSection = AttributeKey | 'any' | 'workout';

/** Catalogue entries a generated routine can be written into. */
const SESSION_TEMPLATES = ['gym-strength', 'home-workout'];

export interface ExtraResult {
  activity: PlannedActivity;
  /** Set when the request was honoured differently than asked. */
  note: string | null;
  /**
   * `added` put a new card on the day. `filled` wrote a routine into a session
   * that was already planned — which is what you actually want when you press
   * "build me a workout" on a day the plan already says "gym session".
   */
  mode: 'added' | 'filled';
}

export function extrasUsed(profile: Profile, date: DateKey): number {
  return profile.days[date]?.plan.filter((a) => a.kind === 'extra').length ?? 0;
}

export function extrasLeft(profile: Profile, date: DateKey): number {
  return Math.max(0, MAX_EXTRAS_PER_DAY - extrasUsed(profile, date));
}

/** True when a generated gym/home session is possible for this person at all. */
export function workoutAvailable(profile: Profile): boolean {
  return canBuildWorkout(profile.traits);
}

/**
 * Whether one more hard physical session is safe today, given everything
 * already planned. Mirrors the weekly and per-day rules the daily generator
 * uses — asking for more work must not be a way around them.
 */
function heavyAllowed(profile: Profile, date: DateKey, ctx: PlanContext): boolean {
  if (profile.traits.highLoadPerWeek <= 0) return false;
  const today = profile.days[date]?.plan ?? [];
  if (today.some((a) => a.load === 'high')) return false;
  return ctx.highLoadThisWeek < profile.traits.highLoadPerWeek;
}

/**
 * Generates one extra activity.
 *
 * Returns null only when there is genuinely nothing left to offer — every
 * eligible activity in that section is already on today's list.
 */
export function generateExtra(profile: Profile, date: DateKey, section: ExtraSection): ExtraResult | null {
  const day = profile.days[date];
  if (!day || extrasLeft(profile, date) <= 0) return null;

  const ctx = planContext(profile, date);
  const used = extrasUsed(profile, date);
  const rng = rngFor(profile.id, date, 'extra', section, used);
  const inPlan = new Set(day.plan.map((a) => a.templateId));

  if (section === 'workout') {
    // If today already says "gym session", the useful thing is to write the
    // routine into it — not to hand you a second session you should not do.
    const planned = day.plan.find(
      (a) => SESSION_TEMPLATES.includes(a.templateId) && !a.steps && !day.completed.includes(a.id),
    );
    if (planned && canBuildWorkout(profile.traits)) {
      const built = buildWorkout(profile.traits, ctx.attributes.fitness, rngFor(profile.id, date, 'fill', planned.id));
      if (built) {
        planned.steps = built.steps;
        return { activity: planned, note: 'Filled in today’s session with a full routine.', mode: 'filled' };
      }
    }

    const workout = buildWorkoutActivity(profile, date, ctx, used);
    if (workout) return workout;

    // No kit, or the hard work for the day/week is already spoken for. Offer
    // fitness work you can actually do instead of refusing outright.
    const fallback = fromCatalog(profile, date, ctx, 'fitness', inPlan, used, rng.next());
    if (fallback) return { activity: fallback, note: fallbackNote(profile, date, ctx), mode: 'added' };
    return null;
  }

  if (section === 'any') {
    // Weakest area first: if you are asking for more, spend it where it counts.
    const attributes = currentAttributes(profile);
    const order = [...profile.traits.focus, ...(Object.keys(attributes) as AttributeKey[])].sort(
      (a, b) => attributes[a] - attributes[b],
    );
    for (const attribute of order) {
      const activity = fromCatalog(profile, date, ctx, attribute, inPlan, used, rng.next());
      if (activity) return { activity, note: null, mode: 'added' };
    }
    return null;
  }

  const activity = fromCatalog(profile, date, ctx, section, inPlan, used, rng.next());
  return activity ? { activity, note: null, mode: 'added' } : null;
}

/** Says accurately *why* a workout request came back as something lighter. */
function fallbackNote(profile: Profile, date: DateKey, ctx: PlanContext): string {
  if (!canBuildWorkout(profile.traits)) {
    return 'No gym or weights on your profile, so here is fitness work you can do anywhere.';
  }
  if ((profile.days[date]?.plan ?? []).some((a) => a.load === 'high')) {
    return 'Today already has a hard session on it — here is something lighter so you are not doing two.';
  }
  if (ctx.highLoadThisWeek >= profile.traits.highLoadPerWeek) {
    return 'That is your hard sessions for this week. Here is something lighter — recovery is where the work lands.';
  }
  return 'Here is fitness work that fits today.';
}

function buildWorkoutActivity(profile: Profile, date: DateKey, ctx: PlanContext, used: number): ExtraResult | null {
  if (!canBuildWorkout(profile.traits)) return null;
  if (!heavyAllowed(profile, date, ctx)) return null;

  const rng = rngFor(profile.id, date, 'workout', used);
  const workout = buildWorkout(profile.traits, ctx.attributes.fitness, rng);
  if (!workout) return null;

  return {
    activity: {
      id: `${date}:workout-${used + 1}`,
      templateId: workout.place === 'gym' ? 'gym-strength' : 'home-workout',
      label: workout.place === 'gym' ? 'Gym session' : 'Home session',
      title: workout.title,
      detail: 'Generated for your current Fitness rating and the kit you have. Skip any movement that hurts.',
      steps: workout.steps,
      attribute: 'fitness',
      secondary: 'discipline',
      tier: workout.tier,
      xp: workout.xp,
      target: { value: workout.minutes, unit: 'min' },
      tags: ['training', workout.place === 'gym' ? 'gym' : 'home', 'generated'],
      load: workout.place === 'gym' ? 'high' : 'moderate',
      kind: 'extra',
      when: null,
    },
    note: null,
    mode: 'added',
  };
}

function fromCatalog(
  profile: Profile,
  date: DateKey,
  ctx: PlanContext,
  attribute: AttributeKey,
  inPlan: Set<string>,
  used: number,
  roll: number,
): PlannedActivity | null {
  const heavyOk = heavyAllowed(profile, date, ctx);
  const candidates = CATALOG.filter(
    (template) =>
      template.attribute === attribute &&
      !inPlan.has(template.id) &&
      isEligible(template, ctx) &&
      ((template.load ?? 'none') !== 'high' || heavyOk),
  );
  if (candidates.length === 0) return null;

  const rng = rngFor(profile.id, date, 'extra-pick', attribute, used, Math.floor(roll * 1e6));
  const template = rng.pick(candidates);
  return instantiate(template, ctx, rng, { kind: 'extra', idSuffix: `-x${used + 1}` });
}
