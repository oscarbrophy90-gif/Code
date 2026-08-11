import type { AttributeKey, EquipmentKey, InterestKey, LimitationKey, SurveyAnswers } from './types.ts';
import { ATTRIBUTE_LIST } from './attributes.ts';

/**
 * The onboarding survey, declared as data.
 *
 * The onboarding screen renders whatever is in `SURVEY_STEPS` — so adding a
 * question is a matter of adding a field here, a key on `SurveyAnswers`, and a
 * line in `seed.ts` saying what it moves. No UI work.
 */

export type FieldKind = 'text' | 'textarea' | 'number' | 'scale' | 'single' | 'multi';

export type AnswerValue = string | number | boolean | string[];

export interface FieldOption {
  value: string | number | boolean;
  label: string;
  hint?: string;
  icon?: string;
}

export interface SurveyField {
  key: keyof SurveyAnswers;
  label: string;
  help?: string;
  kind: FieldKind;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Endpoint captions for a 1-5 scale, low first. */
  scaleLabels?: [string, string];
  minSelect?: number;
  maxSelect?: number;
  placeholder?: string;
  optional?: boolean;
}

export interface SurveyStep {
  id: string;
  title: string;
  blurb: string;
  fields: SurveyField[];
}

export const MIN_AGE = 13;
export const MAX_AGE = 90;

const EQUIPMENT_OPTIONS: FieldOption[] = [
  { value: 'gym', label: 'Gym', icon: '🏋️', hint: 'Membership or school gym' },
  { value: 'home-weights', label: 'Weights at home', icon: '🏠' },
  { value: 'outdoors', label: 'Somewhere to run/walk', icon: '🌳' },
  { value: 'bike', label: 'Bike', icon: '🚲' },
  { value: 'pool', label: 'Pool', icon: '🏊' },
  { value: 'sports-team', label: 'A team or club', icon: '⚽' },
  { value: 'instrument', label: 'An instrument', icon: '🎸' },
  { value: 'computer', label: 'A computer', icon: '💻' },
  { value: 'kitchen', label: 'A kitchen I can use', icon: '🍳' },
];

const INTEREST_OPTIONS: FieldOption[] = [
  { value: 'lifting', label: 'Lifting', icon: '🏋️' },
  { value: 'running', label: 'Running', icon: '🏃' },
  { value: 'team-sport', label: 'Team sport', icon: '⚽' },
  { value: 'martial-arts', label: 'Martial arts', icon: '🥋' },
  { value: 'yoga', label: 'Yoga / mobility', icon: '🧘' },
  { value: 'music', label: 'Music', icon: '🎵' },
  { value: 'coding', label: 'Coding', icon: '💻' },
  { value: 'art', label: 'Art / design', icon: '🎨' },
  { value: 'writing', label: 'Writing', icon: '✍️' },
  { value: 'language', label: 'Languages', icon: '🗣️' },
  { value: 'cooking', label: 'Cooking', icon: '🍳' },
  { value: 'reading', label: 'Reading', icon: '📖' },
  { value: 'chess', label: 'Chess / puzzles', icon: '♟️' },
  { value: 'business', label: 'Business / money', icon: '📈' },
];

const LIMITATION_OPTIONS: FieldOption[] = [
  { value: 'none', label: 'Nothing to flag', icon: '✅' },
  { value: 'injury', label: 'Injury right now', icon: '🩹', hint: 'High-impact work gets left out' },
  { value: 'low-mobility', label: 'Limited mobility', icon: '♿', hint: 'Seated and gentle options only' },
  { value: 'no-outdoor-space', label: 'Can’t get outside easily', icon: '🏢' },
];

const FOCUS_OPTIONS: FieldOption[] = ATTRIBUTE_LIST.map((meta) => ({
  value: meta.key,
  label: meta.label,
  icon: meta.icon,
  hint: meta.blurb,
}));

export const SURVEY_STEPS: SurveyStep[] = [
  {
    id: 'you',
    title: 'Who is the player?',
    blurb: 'This card is going to have your name on it.',
    fields: [
      { key: 'name', label: 'What should we call you?', kind: 'text', placeholder: 'Your name', max: 20 },
      {
        key: 'age',
        label: 'How old are you?',
        kind: 'number',
        min: MIN_AGE,
        max: MAX_AGE,
        unit: 'years',
        help: 'Used to keep the challenges sensible and safe for you — nothing else.',
      },
    ],
  },
  {
    id: 'goals',
    title: 'What are you here to fix?',
    blurb: 'Pick one to four. These get extra weight in your Overall, and most of your daily tasks come from them.',
    fields: [
      { key: 'focus', label: 'Focus areas', kind: 'multi', options: FOCUS_OPTIONS, minSelect: 1, maxSelect: 4 },
    ],
  },
  {
    id: 'body',
    title: 'Where is your body at?',
    blurb: 'Answer honestly. The plan is built off this — overshooting it is how people quit in week one.',
    fields: [
      {
        key: 'fitnessLevel',
        label: 'How active are you right now?',
        kind: 'scale',
        scaleLabels: ['Barely move', 'Train most days'],
      },
      { key: 'equipment', label: 'What do you actually have access to?', kind: 'multi', options: EQUIPMENT_OPTIONS, optional: true },
      { key: 'limitations', label: 'Anything we should work around?', kind: 'multi', options: LIMITATION_OPTIONS, optional: true },
    ],
  },
  {
    id: 'study',
    title: 'School, study and work',
    blurb: 'If you’re studying, BetterMe builds the study side of your plan around it.',
    fields: [
      {
        key: 'student',
        label: 'Are you studying at the moment?',
        kind: 'single',
        options: [
          { value: true, label: 'Yes — school, uni or a course', icon: '🎓' },
          { value: false, label: 'No', icon: '💼' },
        ],
      },
      { key: 'studyHours', label: 'Hours you study or do focused work on a normal day', kind: 'number', min: 0, max: 12, step: 0.5, unit: 'hours' },
      { key: 'focusLevel', label: 'How’s your focus?', kind: 'scale', scaleLabels: ['Distracted constantly', 'Deep focus on demand'] },
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    blurb: 'The cheapest points on this whole card usually live here.',
    fields: [
      { key: 'sleepHours', label: 'Hours you actually sleep on a normal night', kind: 'number', min: 3, max: 12, step: 0.5, unit: 'hours' },
      { key: 'sleepConsistency', label: 'How consistent is your bedtime?', kind: 'scale', scaleLabels: ['All over the place', 'Same time every night'] },
    ],
  },
  {
    id: 'health',
    title: 'Health',
    blurb: 'Water, food, daylight, energy.',
    fields: [
      { key: 'healthLevel', label: 'How do you feel day to day?', kind: 'scale', scaleLabels: ['Drained', 'Energetic'] },
      { key: 'waterGlasses', label: 'Glasses of water on an average day', kind: 'number', min: 0, max: 16, unit: 'glasses' },
    ],
  },
  {
    id: 'routine',
    title: 'Your routine',
    blurb: 'How much structure you have now, and how much time you can really give this.',
    fields: [
      { key: 'routineStrength', label: 'How strong is your routine?', kind: 'scale', scaleLabels: ['No routine at all', 'Runs like clockwork'] },
      {
        key: 'timeBudgetMinutes',
        label: 'Realistically, how much time a day?',
        help: 'Not your best day. Your average one.',
        kind: 'single',
        options: [
          { value: 20, label: '20 minutes', hint: 'Tight schedule — 4 small tasks a day' },
          { value: 45, label: '45 minutes', hint: 'The default — 5 tasks a day' },
          { value: 75, label: '75 minutes', hint: '6 tasks, one of them heavy' },
          { value: 120, label: '2 hours+', hint: '7 tasks, properly demanding' },
        ],
      },
    ],
  },
  {
    id: 'people',
    title: 'People and headspace',
    blurb: 'The two areas people skip, and then wonder why the rest stalls.',
    fields: [
      { key: 'socialLevel', label: 'How connected do you feel right now?', kind: 'scale', scaleLabels: ['Pretty isolated', 'Very connected'] },
      { key: 'mindsetLevel', label: 'How’s your head?', kind: 'scale', scaleLabels: ['Struggling', 'Steady and positive'] },
    ],
  },
  {
    id: 'interests',
    title: 'What do you enjoy?',
    blurb: 'Skills and hobbies you want in the rotation. Tasks get built around these.',
    fields: [{ key: 'interests', label: 'Interests', kind: 'multi', options: INTEREST_OPTIONS, optional: true, maxSelect: 6 }],
  },
  {
    id: 'words',
    title: 'In your own words',
    blurb: 'Optional, but this is what gets shown back to you on the days you want to quit.',
    fields: [
      { key: 'strengths', label: 'What are you already good at?', kind: 'textarea', optional: true, placeholder: 'e.g. I never miss training, I show up for my friends…' },
      { key: 'weaknesses', label: 'What keeps letting you down?', kind: 'textarea', optional: true, placeholder: 'e.g. I stay up too late and then skip the gym…' },
      { key: 'ambition', label: 'Where do you want to be in a year?', kind: 'textarea', optional: true, placeholder: 'e.g. Fit, top of my class, actually disciplined…' },
    ],
  },
];

export function defaultSurvey(): SurveyAnswers {
  return {
    name: '',
    age: 18,
    focus: [],
    interests: [],
    equipment: [],
    limitations: [],
    fitnessLevel: 3,
    routineStrength: 3,
    focusLevel: 3,
    healthLevel: 3,
    socialLevel: 3,
    mindsetLevel: 3,
    student: true,
    studyHours: 1,
    sleepHours: 7,
    sleepConsistency: 3,
    waterGlasses: 4,
    timeBudgetMinutes: 45,
    strengths: '',
    weaknesses: '',
    ambition: '',
  };
}

/** Returns an error message for the first unanswered required field, or null. */
export function validateStep(step: SurveyStep, answers: SurveyAnswers): string | null {
  for (const field of step.fields) {
    if (field.optional) continue;
    const value = answers[field.key] as AnswerValue;
    if (field.kind === 'multi') {
      const list = Array.isArray(value) ? value : [];
      const min = field.minSelect ?? 1;
      if (list.length < min) return `Pick at least ${min} for “${field.label}”.`;
      if (field.maxSelect && list.length > field.maxSelect) return `Pick at most ${field.maxSelect} for “${field.label}”.`;
      continue;
    }
    if (field.kind === 'text' || field.kind === 'textarea') {
      if (!String(value ?? '').trim()) return `${field.label} is needed to continue.`;
      continue;
    }
    if (field.kind === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) return `${field.label} needs a number.`;
      if (field.min !== undefined && n < field.min) return `${field.label} must be at least ${field.min}.`;
      if (field.max !== undefined && n > field.max) return `${field.label} must be ${field.max} or less.`;
      continue;
    }
    if (value === undefined || value === null || value === '') return `${field.label} is needed to continue.`;
  }
  return null;
}

/** Cleans up answers coming out of the UI: trims, clamps, dedupes. */
export function normaliseSurvey(answers: SurveyAnswers): SurveyAnswers {
  const limitations = dedupe(answers.limitations).filter((l): l is LimitationKey => !!l);
  return {
    ...answers,
    name: answers.name.trim().slice(0, 20) || 'Player',
    age: clamp(Math.round(answers.age), MIN_AGE, MAX_AGE),
    focus: dedupe(answers.focus).slice(0, 4) as AttributeKey[],
    interests: dedupe(answers.interests).slice(0, 6) as InterestKey[],
    equipment: dedupe(answers.equipment) as EquipmentKey[],
    // "Nothing to flag" alongside a real limitation is a mis-tap; the real one wins.
    limitations: limitations.length > 1 ? limitations.filter((l) => l !== 'none') : limitations,
    studyHours: clamp(answers.studyHours, 0, 12),
    sleepHours: clamp(answers.sleepHours, 3, 12),
    waterGlasses: clamp(Math.round(answers.waterGlasses), 0, 16),
    timeBudgetMinutes: clamp(Math.round(answers.timeBudgetMinutes), 15, 180),
    strengths: answers.strengths.trim().slice(0, 400),
    weaknesses: answers.weaknesses.trim().slice(0, 400),
    ambition: answers.ambition.trim().slice(0, 400),
  };
}

function dedupe<T>(list: T[] | undefined): T[] {
  return Array.from(new Set(list ?? []));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
