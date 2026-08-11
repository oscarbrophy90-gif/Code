import type { DateKey } from './day.ts';

/* ------------------------------------------------------------------ *
 * Attributes
 * ------------------------------------------------------------------ */

/**
 * The nine areas a real life gets rated on. Adding a tenth is a three-step
 * change: add the key here, add its meta in `attributes.ts`, and add at least
 * one activity that feeds it in `catalog.ts`. Everything else — the radar, the
 * overall, the seeding, the achievements — reads off this list.
 */
export const ATTRIBUTE_KEYS = [
  'fitness',
  'education',
  'discipline',
  'health',
  'sleep',
  'productivity',
  'social',
  'skills',
  'mindset',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;
export type AttributeXp = Record<AttributeKey, number>;

/* ------------------------------------------------------------------ *
 * Activities
 * ------------------------------------------------------------------ */

/** How much a single activity asks of you. Drives XP and what gets offered. */
export type Tier = 'light' | 'steady' | 'hard' | 'elite';

export const TIERS: Tier[] = ['light', 'steady', 'hard', 'elite'];

/** Physical demand, so a plan never stacks three hard sessions on one body. */
export type Load = 'none' | 'light' | 'moderate' | 'high';

/** What a person needs access to before an activity is worth offering them. */
export type EquipmentKey =
  | 'gym'
  | 'home-weights'
  | 'bike'
  | 'pool'
  | 'sports-team'
  | 'instrument'
  | 'computer'
  | 'outdoors'
  | 'kitchen';

/** Things that permanently remove options for this user, whatever their goals. */
export type LimitationKey = 'injury' | 'low-mobility' | 'no-outdoor-space' | 'none';

export type Cadence = 'daily' | 'most-days' | 'few-times-week' | 'weekly';

export interface ActivityTarget {
  value: number;
  unit: string;
}

export interface TierSpec {
  tier: Tier;
  /** Shown on the card. Keep it a concrete instruction, not a vibe. */
  title: string;
  detail: string;
  xp: number;
  target?: ActivityTarget;
}

export interface ActivityRequires {
  minAge?: number;
  maxAge?: number;
  /** All of these must be available to the user. */
  needs?: EquipmentKey[];
  /** Only offered to people who said they're studying. */
  student?: boolean;
  /** Skipped when the user reports any of these. */
  notWith?: LimitationKey[];
  /** Only offered to users who report one of these — accessible alternatives. */
  onlyWith?: LimitationKey[];
  /** Only offered when the user listed one of these interests. */
  interests?: InterestKey[];
}

export interface ActivityTemplate {
  id: string;
  /** Short name for history and achievement copy, e.g. "Gym session". */
  label: string;
  attribute: AttributeKey;
  /** Real life rarely improves one thing at a time. Secondary earns half XP. */
  secondary?: AttributeKey;
  tags: string[];
  tiers: TierSpec[];
  requires?: ActivityRequires;
  cadence?: Cadence;
  load?: Load;
  /** Anchors best done at a fixed time of day; used only for card copy. */
  when?: 'morning' | 'daytime' | 'evening';
}

/** One activity, sized for one person, on one day. */
export interface PlannedActivity {
  id: string;
  templateId: string;
  label: string;
  title: string;
  detail: string;
  attribute: AttributeKey;
  secondary: AttributeKey | null;
  tier: Tier;
  xp: number;
  target: ActivityTarget | null;
  tags: string[];
  load: Load;
  kind: 'core' | 'keystone' | 'challenge';
  when: 'morning' | 'daytime' | 'evening' | null;
}

/* ------------------------------------------------------------------ *
 * Survey
 * ------------------------------------------------------------------ */

export type InterestKey =
  | 'lifting'
  | 'running'
  | 'team-sport'
  | 'martial-arts'
  | 'yoga'
  | 'music'
  | 'coding'
  | 'art'
  | 'writing'
  | 'language'
  | 'cooking'
  | 'reading'
  | 'chess'
  | 'business';

export type ScaleAnswer = 1 | 2 | 3 | 4 | 5;

export interface SurveyAnswers {
  name: string;
  age: number;
  /** The areas they said they most want to improve. Weighted into Overall. */
  focus: AttributeKey[];
  interests: InterestKey[];
  equipment: EquipmentKey[];
  limitations: LimitationKey[];

  /** 1 = never active, 5 = trains most days. */
  fitnessLevel: ScaleAnswer;
  /** 1 = no structure at all, 5 = rarely breaks a routine. */
  routineStrength: ScaleAnswer;
  /** 1 = constantly distracted, 5 = deep focus on demand. */
  focusLevel: ScaleAnswer;
  /** 1 = drained, 5 = energetic and well. */
  healthLevel: ScaleAnswer;
  /** 1 = withdrawn, 5 = very connected. */
  socialLevel: ScaleAnswer;
  /** 1 = low and stressed, 5 = steady and positive. */
  mindsetLevel: ScaleAnswer;

  student: boolean;
  /** Typical study/homework hours on a weekday. */
  studyHours: number;
  /** Typical hours actually asleep. */
  sleepHours: number;
  /** How consistent their bedtime is. 1 = all over the place, 5 = clockwork. */
  sleepConsistency: ScaleAnswer;
  /** Glasses of water on an average day. */
  waterGlasses: number;
  /** Minutes a day they can realistically give the app. */
  timeBudgetMinutes: number;
  /** Free text, kept verbatim and shown back on the profile card. */
  strengths: string;
  weaknesses: string;
  ambition: string;
}

/**
 * The survey, boiled down to the handful of numbers the generator actually
 * reads. Keeping this separate means retaking the survey re-derives traits
 * without touching earned progress.
 */
export interface Traits {
  age: number;
  ageBand: 'teen' | 'young-adult' | 'adult' | 'older-adult';
  focus: AttributeKey[];
  interests: InterestKey[];
  equipment: EquipmentKey[];
  limitations: LimitationKey[];
  student: boolean;
  /** Daily slots the plan should fill, before the bonus challenge. */
  dailySlots: number;
  /** Ceiling on how demanding a single activity may be, per attribute. */
  ceiling: Record<AttributeKey, Tier>;
  /** Recommended nightly sleep, in hours, from age. */
  sleepTargetHours: number;
  /** Daily water target in glasses, from age and activity. */
  waterTargetGlasses: number;
  /** How many high-load physical sessions a week is safe for this person. */
  highLoadPerWeek: number;
}

/* ------------------------------------------------------------------ *
 * Progress records
 * ------------------------------------------------------------------ */

export interface DayRecord {
  date: DateKey;
  plan: PlannedActivity[];
  /** Instance ids, in the order they were checked off. */
  completed: string[];
  completedAt: Record<string, number>;
  /** XP actually awarded per activity, bonuses included — undo reverses off this. */
  xpByActivity: Record<string, number>;
  xpEarned: number;
  /** Overall and attributes as they stood when the day was generated. */
  overallStart: number;
  attributesStart: Attributes;
  /** Filled in as the day is worked, so history charts read straight off it. */
  overallEnd: number;
  attributesEnd: Attributes;
  lockedIn: boolean;
  /** Where the streak pointed before this day locked in, so undo can restore it. */
  lockInPrevious: DateKey | null;
  /** Whether this day has already been counted in `stats.perfectDays`. */
  perfectCounted: boolean;
  /** Set once the end-of-day summary has been shown, so it shows once. */
  summaryShown: boolean;
  swapsUsed: number;
  /** True when the streak survived this date on a shield rather than work. */
  shielded: boolean;
}

export interface StreakState {
  current: number;
  best: number;
  lastLockIn: DateKey | null;
  /** Missed-day insurance. Earned by consistency, spent automatically. */
  shields: number;
  shieldsSpent: number;
  totalLockInDays: number;
  /** Set after a break: the next lock-in pays a comeback bonus. */
  comeback: boolean;
}

export type WeeklyKind = 'attribute-count' | 'lock-in-days' | 'earn-xp' | 'tier-count' | 'challenge-count' | 'total-count';

export interface WeeklyChallengeState {
  week: string;
  id: string;
  kind: WeeklyKind;
  /** Attribute key for `attribute-count`, tier name for `tier-count`, else null. */
  param: string | null;
  title: string;
  detail: string;
  target: number;
  progress: number;
  xp: number;
  claimed: boolean;
}

export interface LifetimeStats {
  activitiesCompleted: number;
  xpTotal: number;
  byAttribute: Record<AttributeKey, number>;
  byTemplate: Record<string, number>;
  byTier: Record<Tier, number>;
  challengesCompleted: number;
  weeklyChallengesCompleted: number;
  perfectDays: number;
  daysActive: number;
  comebacks: number;
  highestOverall: number;
}

export interface AppSettings {
  reducedMotion: boolean;
  sound: boolean;
  /** Hour (0-23) the end-of-day summary becomes available. */
  dayEndsAtHour: number;
}

export interface Profile {
  version: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  survey: SurveyAnswers;
  traits: Traits;
  /** Ratings the survey started you at. Progress is always measured from here. */
  seedAttributes: Attributes;
  attributeXp: AttributeXp;
  totalXp: number;
  streak: StreakState;
  /** Keyed by date. Pruned to the last two years. */
  days: Record<DateKey, DayRecord>;
  /** Achievement id -> timestamp earned. */
  achievements: Record<string, number>;
  weekly: WeeklyChallengeState | null;
  /** Milestone id -> timestamp reached, so each celebrates exactly once. */
  milestones: Record<string, number>;
  stats: LifetimeStats;
  settings: AppSettings;
}
