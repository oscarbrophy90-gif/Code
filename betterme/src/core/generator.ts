import { CATALOG, CATALOG_BY_ID, tierSpec } from './catalog.ts';
import { currentAttributes, weakestAttributes } from './attributes.ts';
import { addDays, daysBetween, weekDays, type DateKey } from './day.ts';
import { rngFor, type Rng } from './rng.ts';
import { ATTRIBUTE_KEYS, TIERS, type ActivityTemplate, type AttributeKey, type Attributes, type PlannedActivity, type Profile, type Tier, type Traits } from './types.ts';

/**
 * The day generator.
 *
 * Everything personal about BetterMe happens in this file. It answers one
 * question — *what should this specific person do today?* — using four inputs,
 * in priority order:
 *
 *   1. Safety.     Age, injuries and weekly physical load are hard filters.
 *                  A rule here can only ever remove work, never add it.
 *   2. Goals.      Focus areas get first pick of the slots.
 *   3. Weakness.   The lowest ratings get pulled in next, because that is
 *                  where Overall actually moves.
 *   4. Variety.    Anything offered in the last few days is pushed down, so
 *                  the list does not calcify into the same five chores.
 *
 * The whole thing is seeded off `profileId:date`, so the plan is stable for the
 * day: closing the app and coming back does not reroll work you already started.
 */

const TIER_INDEX: Record<Tier, number> = { light: 0, steady: 1, hard: 2, elite: 3 };

/** Bonus multiplier on the day's optional challenge. */
export const CHALLENGE_XP_MULTIPLIER = 1.6;

/** New users get eased in — no elite work in the first few days, whatever their ratings say. */
const RAMP_DAYS = 3;

export interface PlanContext {
  date: DateKey;
  traits: Traits;
  attributes: Attributes;
  /** templateId -> most recent date it was *offered* (completed or not). */
  lastOffered: Record<string, DateKey>;
  /** High-load sessions already offered this week. */
  highLoadThisWeek: number;
  /** True when yesterday included a completed high-load session. */
  hardYesterday: boolean;
  daysActive: number;
}

export function planContext(profile: Profile, date: DateKey): PlanContext {
  const lastOffered: Record<string, DateKey> = {};
  for (const [key, day] of Object.entries(profile.days)) {
    if (key >= date) continue;
    for (const activity of day.plan) {
      const seen = lastOffered[activity.templateId];
      if (!seen || seen < key) lastOffered[activity.templateId] = key;
    }
  }

  let highLoadThisWeek = 0;
  for (const key of weekDays(date)) {
    if (key >= date) continue;
    const day = profile.days[key];
    if (!day) continue;
    for (const activity of day.plan) {
      if (activity.load === 'high' && day.completed.includes(activity.id)) highLoadThisWeek++;
    }
  }

  const yesterday = profile.days[addDays(date, -1)];
  const hardYesterday = !!yesterday?.plan.some((a) => a.load === 'high' && yesterday.completed.includes(a.id));

  return {
    date,
    traits: profile.traits,
    attributes: currentAttributes(profile),
    lastOffered,
    highLoadThisWeek,
    hardYesterday,
    daysActive: profile.stats.daysActive,
  };
}

/* ------------------------------------------------------------------ *
 * Eligibility — the hard filters
 * ------------------------------------------------------------------ */

export function isEligible(template: ActivityTemplate, ctx: PlanContext): boolean {
  const { traits } = ctx;
  const req = template.requires;
  const limitations = new Set(traits.limitations);
  const load = template.load ?? 'none';

  if (req) {
    if (req.minAge !== undefined && traits.age < req.minAge) return false;
    if (req.maxAge !== undefined && traits.age > req.maxAge) return false;
    if (req.student !== undefined && req.student !== traits.student) return false;
    if (req.needs && !req.needs.every((need) => traits.equipment.includes(need))) return false;
    if (req.notWith && req.notWith.some((limit) => limitations.has(limit))) return false;
    if (req.interests && !req.interests.some((interest) => traits.interests.includes(interest))) return false;
    if (req.onlyWith && !req.onlyWith.some((limit) => limitations.has(limit))) return false;
  }

  // A tier cap has to be able to remove a template outright. Without this, an
  // entry whose easiest tier is above someone's cap would still be offered, just
  // clamped — handing a 14-year-old elite-only work at "elite", or putting
  // "turn up to a club for the first time" on somebody's day one.
  const easiest = template.tiers.reduce((low, spec) => (TIER_INDEX[spec.tier] < TIER_INDEX[low.tier] ? spec : low), template.tiers[0]);
  const ceiling = ctx.daysActive < RAMP_DAYS ? capTier(traits.ceiling[template.attribute], 'steady') : traits.ceiling[template.attribute];
  if (TIER_INDEX[easiest.tier] > TIER_INDEX[ceiling]) return false;

  // Blanket physical rails, applied on top of whatever a template declares —
  // so a new entry that forgets `notWith` still cannot hurt anyone.
  if (limitations.has('low-mobility') && (load === 'high' || load === 'moderate')) return false;
  if (limitations.has('injury') && (load === 'high' || template.tags.includes('impact'))) return false;

  if (load === 'high') {
    if (traits.highLoadPerWeek <= 0) return false;
    if (ctx.highLoadThisWeek >= traits.highLoadPerWeek) return false;
    // Back-to-back hard days are how beginners get hurt and quit.
    if (ctx.hardYesterday && traits.highLoadPerWeek <= 3) return false;
  }

  return true;
}

/** How long a template has to sit out, by cadence. */
function cooldownDays(template: ActivityTemplate): number {
  switch (template.cadence ?? 'most-days') {
    case 'daily':
      return 0;
    case 'most-days':
      return 1;
    case 'few-times-week':
      return 2;
    case 'weekly':
      return 6;
  }
}

function daysSinceOffered(template: ActivityTemplate, ctx: PlanContext): number {
  const last = ctx.lastOffered[template.id];
  if (!last) return 99;
  return daysBetween(last, ctx.date);
}

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

/**
 * The tier a person should be working at in one area.
 *
 * Driven by the rating itself, so difficulty rises as you do — someone at 38
 * fitness gets a 15-minute walk, someone at 80 gets an hour in the gym, and
 * neither of them was ever asked to choose a difficulty setting.
 */
export function tierForRating(rating: number): Tier {
  if (rating < 46) return 'light';
  if (rating < 60) return 'steady';
  if (rating < 74) return 'hard';
  return 'elite';
}

function capTier(tier: Tier, ceiling: Tier): Tier {
  return TIER_INDEX[tier] <= TIER_INDEX[ceiling] ? tier : ceiling;
}

function shiftTier(tier: Tier, delta: number): Tier {
  const index = Math.max(0, Math.min(TIERS.length - 1, TIER_INDEX[tier] + delta));
  return TIERS[index];
}

/** Picks the tier for one activity, then falls back to the nearest one the template actually offers. */
function resolveTier(template: ActivityTemplate, ctx: PlanContext, rng: Rng, bump: number): { tier: Tier; spec: ReturnType<typeof tierSpec> } {
  const rating = ctx.attributes[template.attribute];
  let want = tierForRating(rating);

  // A little spread so a day is not four identical-feeling blocks.
  const roll = rng.next();
  if (roll < 0.28) want = shiftTier(want, -1);
  else if (roll > 0.88) want = shiftTier(want, 1);

  want = shiftTier(want, bump);
  want = capTier(want, ctx.traits.ceiling[template.attribute]);
  if (ctx.daysActive < RAMP_DAYS) want = capTier(want, 'steady');

  // Nearest tier at or below what we want; if the template only offers harder
  // work than that, take its easiest.
  const available = template.tiers.slice().sort((a, b) => TIER_INDEX[a.tier] - TIER_INDEX[b.tier]);
  let chosen = available[0];
  for (const spec of available) if (TIER_INDEX[spec.tier] <= TIER_INDEX[want]) chosen = spec;
  return { tier: chosen.tier, spec: chosen };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function scoreTemplate(template: ActivityTemplate, ctx: PlanContext, rng: Rng, weakRank: Record<AttributeKey, number>): number {
  let score = 50;

  if (ctx.traits.focus.includes(template.attribute)) score += 40;
  if (template.secondary && ctx.traits.focus.includes(template.secondary)) score += 12;

  // Weakest areas pull hardest — that is where Overall has the most room.
  const rank = weakRank[template.attribute];
  if (rank === 0) score += 26;
  else if (rank === 1) score += 18;
  else if (rank === 2) score += 11;

  if (template.tags.some((tag) => (ctx.traits.interests as string[]).includes(tag))) score += 10;

  const since = daysSinceOffered(template, ctx);
  const cooldown = cooldownDays(template);
  if (since <= cooldown) score -= 70 + (cooldown - since) * 12;
  else score += Math.min(20, (since - cooldown) * 3);

  // Anchor habits (water, sleep, bed) are meant to recur; keep them competitive.
  if ((template.cadence ?? 'most-days') === 'daily') score += 8;

  score += rng.range(-12, 12);
  return score;
}

/* ------------------------------------------------------------------ *
 * Building the day
 * ------------------------------------------------------------------ */

export function fillTokens(text: string, traits: Traits): string {
  return text
    .replace(/\{sleepTarget\}/g, String(traits.sleepTargetHours))
    .replace(/\{waterTarget\}/g, String(traits.waterTargetGlasses));
}

function instantiate(
  template: ActivityTemplate,
  ctx: PlanContext,
  rng: Rng,
  opts: { kind: PlannedActivity['kind']; bump?: number; idSuffix?: string },
): PlannedActivity {
  const { tier, spec } = resolveTier(template, ctx, rng, opts.bump ?? 0);
  if (!spec) throw new Error(`template ${template.id} has no tiers`);

  const target = spec.target ? { ...spec.target } : null;
  // Personalised targets: the generic numbers in the catalogue give way to the
  // ones derived from this user's age and activity level.
  if (target && template.id === 'sleep-hours' && tier !== 'light') target.value = ctx.traits.sleepTargetHours;
  if (target && template.id === 'water' && tier !== 'light') target.value = ctx.traits.waterTargetGlasses;

  const xp = opts.kind === 'challenge' ? Math.round(spec.xp * CHALLENGE_XP_MULTIPLIER) : spec.xp;

  return {
    id: `${ctx.date}:${template.id}${opts.idSuffix ?? ''}`,
    templateId: template.id,
    label: template.label,
    title: fillTokens(spec.title, ctx.traits),
    detail: fillTokens(spec.detail, ctx.traits),
    attribute: template.attribute,
    secondary: template.secondary ?? null,
    tier,
    xp,
    target,
    tags: template.tags.slice(),
    load: template.load ?? 'none',
    kind: opts.kind,
    when: template.when ?? null,
  };
}

interface PickState {
  chosen: ActivityTemplate[];
  perAttribute: Record<string, number>;
  usedIds: Set<string>;
  highLoad: number;
}

/**
 * `isEligible` decides whether a template may appear *at all today*; this
 * decides whether one more may appear *in this plan*. Both are needed: without
 * this, a day could pick a hard run as a core activity and a gym session as the
 * bonus challenge, blowing a beginner's whole weekly load budget on a Tuesday.
 */
function loadAllowed(template: ActivityTemplate, state: PickState, ctx: PlanContext): boolean {
  if ((template.load ?? 'none') !== 'high') return true;
  if (state.highLoad >= 1) return false;
  return ctx.highLoadThisWeek + state.highLoad < ctx.traits.highLoadPerWeek;
}

function canTake(template: ActivityTemplate, state: PickState, attributeCap: number, ctx: PlanContext): boolean {
  if (state.usedIds.has(template.id)) return false;
  if (!loadAllowed(template, state, ctx)) return false;
  return (state.perAttribute[template.attribute] ?? 0) < attributeCap;
}

function take(template: ActivityTemplate, state: PickState): void {
  state.chosen.push(template);
  state.usedIds.add(template.id);
  state.perAttribute[template.attribute] = (state.perAttribute[template.attribute] ?? 0) + 1;
  if ((template.load ?? 'none') === 'high') state.highLoad++;
}

/**
 * Generates the day's list.
 *
 * Slots are filled in three passes: one guaranteed activity per focus area,
 * then one for the weakest attribute overall, then best-scoring for whatever is
 * left. If a heavily-restricted user does not have enough eligible templates,
 * the constraints relax (attribute cap, then cooldowns) rather than handing
 * back a short day.
 */
export function generatePlan(profile: Profile, date: DateKey): PlannedActivity[] {
  const ctx = planContext(profile, date);
  const rng = rngFor(profile.id, date, 'plan');

  const eligible = CATALOG.filter((t) => isEligible(t, ctx));
  if (eligible.length === 0) return [];

  const order = weakestAttributes(ctx.attributes);
  const weakRank = Object.fromEntries(order.map((key, index) => [key, index])) as Record<AttributeKey, number>;

  const scores = new Map<string, number>();
  for (const template of eligible) scores.set(template.id, scoreTemplate(template, ctx, rng, weakRank));
  const ranked = eligible.slice().sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  const slots = Math.max(3, ctx.traits.dailySlots);
  const state: PickState = { chosen: [], perAttribute: {}, usedIds: new Set(), highLoad: 0 };

  // Pass 1 — every focus area gets a slot, in a rotating order so the same goal
  // is not always the first card on the list.
  for (const attribute of rng.shuffled(ctx.traits.focus)) {
    if (state.chosen.length >= slots) break;
    const best = ranked.find((t) => t.attribute === attribute && canTake(t, state, 2, ctx));
    if (best) take(best, state);
  }

  // Pass 2 — the single weakest area, if the focus pass missed it.
  const weakest = order[0];
  if (state.chosen.length < slots && !state.perAttribute[weakest]) {
    const best = ranked.find((t) => t.attribute === weakest && canTake(t, state, 2, ctx));
    if (best) take(best, state);
  }

  // Pass 3 — fill the rest by score, then relax if the pool is thin.
  for (const attributeCap of [2, 3, 99]) {
    for (const template of ranked) {
      if (state.chosen.length >= slots) break;
      if (canTake(template, state, attributeCap, ctx)) take(template, state);
    }
    if (state.chosen.length >= slots) break;
  }

  const plan = state.chosen.map((template) => instantiate(template, ctx, rng, { kind: 'core' }));

  // One keystone a day: the hardest thing on the list, bumped and badged. It is
  // what the summary screen points at when it asks whether you actually turned up.
  if (plan.length > 0) {
    const keystoneIndex = pickKeystoneIndex(plan, ctx, rng);
    const template = CATALOG_BY_ID[plan[keystoneIndex].templateId];
    plan[keystoneIndex] = instantiate(template, ctx, rng, { kind: 'keystone', bump: 1 });
  }

  const challenge = pickChallenge(ranked, state, ctx, rng);
  if (challenge) plan.push(challenge);

  return sortPlan(plan);
}

function pickKeystoneIndex(plan: PlannedActivity[], ctx: PlanContext, rng: Rng): number {
  // Prefer a focus-area activity, so the day's headline task is one you asked for.
  const focusIndexes = plan.map((a, i) => (ctx.traits.focus.includes(a.attribute) ? i : -1)).filter((i) => i >= 0);
  const pool = focusIndexes.length > 0 ? focusIndexes : plan.map((_, i) => i);
  return rng.pick(pool);
}

function pickChallenge(ranked: ActivityTemplate[], state: PickState, ctx: PlanContext, rng: Rng): PlannedActivity | null {
  const focus = new Set(ctx.traits.focus);
  const fresh = ranked.filter((t) => !state.usedIds.has(t.id) && loadAllowed(t, state, ctx));
  if (fresh.length === 0) return null;

  const preferred = fresh.filter((t) => focus.has(t.attribute) || focus.has(t.secondary ?? ('' as AttributeKey)));
  const pool = (preferred.length > 0 ? preferred : fresh).slice(0, 5);
  const template = rng.pick(pool);
  return instantiate(template, ctx, rng, { kind: 'challenge', bump: 1 });
}

const WHEN_ORDER: Record<string, number> = { morning: 0, daytime: 1, none: 2, evening: 3 };

function sortPlan(plan: PlannedActivity[]): PlannedActivity[] {
  return plan.slice().sort((a, b) => {
    // Challenges sit at the bottom — they are the bonus, not the job.
    if ((a.kind === 'challenge' ? 1 : 0) !== (b.kind === 'challenge' ? 1 : 0)) return a.kind === 'challenge' ? 1 : -1;
    const aw = WHEN_ORDER[a.when ?? 'none'];
    const bw = WHEN_ORDER[b.when ?? 'none'];
    if (aw !== bw) return aw - bw;
    return 0;
  });
}

/** How many of the day's core activities count as "locked in". */
export function lockInGoal(plan: PlannedActivity[]): number {
  const core = plan.filter((a) => a.kind !== 'challenge').length;
  return Math.max(1, Math.min(core, Math.ceil(core * 0.6)));
}

export const MAX_SWAPS_PER_DAY = 2;

/**
 * Swaps one activity for a different one in the same slot.
 *
 * Deliberately limited: two a day. Enough that a genuinely impossible task
 * ("gym session" on a day the gym is shut) does not sink the streak, not
 * enough to shop around until every task is the easy one.
 */
export function swapActivity(profile: Profile, date: DateKey, activityId: string): PlannedActivity | null {
  const day = profile.days[date];
  if (!day) return null;
  const index = day.plan.findIndex((a) => a.id === activityId);
  if (index < 0) return null;
  if (day.completed.includes(activityId)) return null;
  if (day.swapsUsed >= MAX_SWAPS_PER_DAY) return null;

  const ctx = planContext(profile, date);
  const rng = rngFor(profile.id, date, 'swap', day.swapsUsed, activityId);
  const current = day.plan[index];
  const inPlan = new Set(day.plan.map((a) => a.templateId));

  const order = weakestAttributes(ctx.attributes);
  const weakRank = Object.fromEntries(order.map((key, i) => [key, i])) as Record<AttributeKey, number>;

  // Anything already planned today counts against the load budget, so a swap
  // cannot smuggle in a second hard session.
  const state: PickState = { chosen: [], perAttribute: {}, usedIds: new Set(), highLoad: 0 };
  for (const planned of day.plan) if (planned.id !== activityId && planned.load === 'high') state.highLoad++;

  const candidates = CATALOG.filter((t) => !inPlan.has(t.id) && isEligible(t, ctx) && loadAllowed(t, state, ctx))
    .map((t) => ({ t, score: scoreTemplate(t, ctx, rng, weakRank) }))
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;

  // Prefer a like-for-like replacement so a swap does not quietly delete a goal
  // from the day; fall back to the best-scoring alternative.
  const sameAttribute = candidates.filter((c) => c.t.attribute === current.attribute);
  const pool = (sameAttribute.length > 0 ? sameAttribute : candidates).slice(0, 4);
  const chosen = rng.pick(pool).t;

  return instantiate(chosen, ctx, rng, {
    kind: current.kind,
    bump: current.kind === 'core' ? 0 : 1,
    idSuffix: `#s${day.swapsUsed + 1}`,
  });
}

/** Every attribute a plan touches, for the "what today moves" strip. */
export function planAttributes(plan: PlannedActivity[]): AttributeKey[] {
  const seen = new Set<AttributeKey>();
  for (const activity of plan) {
    seen.add(activity.attribute);
    if (activity.secondary) seen.add(activity.secondary);
  }
  return ATTRIBUTE_KEYS.filter((key) => seen.has(key));
}
