import {
  addExtra,
  createProfile,
  completeActivity,
  dateKey,
  daysBetween,
  msUntilRollover,
  emptyAttributeXp,
  openDay,
  PROFILE_VERSION,
  retakeSurvey,
  swap,
  undoActivity,
  type CompletionResult,
  type DateKey,
  type ExtraResult,
  type ExtraSection,
  type DayOpened,
  type DayRecord,
  type PlannedActivity,
  type Profile,
  type SurveyAnswers,
} from '../core/index.ts';

/**
 * The single source of truth for the running app: one profile, persisted to
 * localStorage, with a subscribe/notify loop the screens re-render off.
 *
 * There is no server. Everything a person does lives on their device, which is
 * the right default for a diary of someone's sleep, study and mood — and it
 * means the app works on a plane, in a gym basement, anywhere.
 */

const STORAGE_KEY = 'betterme.profile.v1';

type Listener = () => void;

const FRESH_STREAK: Profile['streak'] = {
  current: 0,
  best: 0,
  lastLockIn: null,
  shields: 0,
  shieldsSpent: 0,
  totalLockInDays: 0,
  comeback: false,
};

const FRESH_SETTINGS: Profile['settings'] = { reducedMotion: false, sound: true, dayEndsAtHour: 21 };

function canStore(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Fills in anything a save from an older build is missing.
 *
 * Deliberately additive: an unknown field is left alone rather than dropped, so
 * a user who opens an old tab after an update does not lose data.
 */
function migrate(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const profile = raw as Profile;
  if (!profile.id || !profile.survey || !profile.seedAttributes) return null;

  profile.version = PROFILE_VERSION;
  profile.attributeXp = { ...emptyAttributeXp(), ...(profile.attributeXp ?? {}) };
  profile.days = profile.days ?? {};
  profile.achievements = profile.achievements ?? {};
  profile.milestones = profile.milestones ?? {};
  profile.totalXp = Number(profile.totalXp) || 0;
  profile.streak = { ...FRESH_STREAK, ...(profile.streak ?? {}) };
  profile.settings = { ...FRESH_SETTINGS, ...(profile.settings ?? {}) };

  for (const day of Object.values(profile.days)) {
    day.completed = day.completed ?? [];
    day.completedAt = day.completedAt ?? {};
    day.xpByActivity = day.xpByActivity ?? {};
    day.plan = day.plan ?? [];
  }
  return profile;
}

export class Store {
  profile: Profile | null = null;
  /** The date the UI is currently showing as "today". */
  today: DateKey = dateKey();
  /** Result of the most recent day rollover, for the welcome-back message. */
  lastOpen: DayOpened | null = null;
  /** Set when a previous day finished without its summary being seen. */
  pendingSummary: DateKey | null = null;

  private listeners = new Set<Listener>();
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;

  load(): void {
    if (!canStore()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this.profile = migrate(JSON.parse(raw));
    } catch (error) {
      console.warn('BetterMe: could not read saved profile', error);
      this.profile = null;
    }
    if (this.profile) this.openToday();
  }

  save(): void {
    if (!canStore() || !this.profile) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (error) {
      // Almost always a full quota. Drop the oldest history and try once more
      // rather than silently losing today's work.
      console.warn('BetterMe: save failed, trimming history', error);
      this.trimHistory();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch {
        /* out of options — the in-memory profile still works for this session */
      }
    }
  }

  private trimHistory(): void {
    if (!this.profile) return;
    const keys = Object.keys(this.profile.days).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - 120))) delete this.profile.days[key];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private commit(): void {
    this.save();
    this.notify();
  }

  /* -------------------------------------------------------------- *
   * Lifecycle
   * -------------------------------------------------------------- */

  startNew(answers: SurveyAnswers): Profile {
    this.profile = createProfile(answers);
    this.openToday();
    this.commit();
    return this.profile;
  }

  updateSurvey(answers: SurveyAnswers): void {
    if (!this.profile) return;
    retakeSurvey(this.profile, answers);
    // Tomorrow's plan picks the new traits up automatically; today's stays as
    // generated so nothing you have already started disappears mid-day.
    this.commit();
  }

  /** Opens today, rolling the day over and settling any missed-day streak maths. */
  openToday(now: number = Date.now()): void {
    if (!this.profile) return;
    this.today = dateKey(now);
    const opened = openDay(this.profile, this.today, now);
    if (opened.created) {
      this.lastOpen = opened;
      this.pendingSummary = this.findPendingSummary();
    }
    this.scheduleMidnight(now);
  }

  private findPendingSummary(): DateKey | null {
    if (!this.profile) return null;
    const keys = Object.keys(this.profile.days).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (key >= this.today) continue;
      const day = this.profile.days[key];
      // Only offer to replay a day that actually had something in it, and only
      // if it was yesterday — older days belong in the history screen.
      if (day.summaryShown) return null;
      if (daysBetween(key, this.today) > 1) return null;
      return day.completed.length > 0 ? key : null;
    }
    return null;
  }

  markSummarySeen(date: DateKey): void {
    const day = this.profile?.days[date];
    if (!day) return;
    day.summaryShown = true;
    if (this.pendingSummary === date) this.pendingSummary = null;
    this.commit();
  }

  /** Re-renders and re-opens the day the moment local midnight passes. */
  private scheduleMidnight(now: number): void {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    if (typeof setTimeout !== 'function') return;
    this.midnightTimer = setTimeout(() => {
      this.openToday();
      this.commit();
    }, msUntilRollover(now));
  }

  /* -------------------------------------------------------------- *
   * Actions
   * -------------------------------------------------------------- */

  get day(): DayRecord | null {
    return this.profile?.days[this.today] ?? null;
  }

  complete(activityId: string): CompletionResult | null {
    if (!this.profile) return null;
    const result = completeActivity(this.profile, this.today, activityId);
    if (result) this.commit();
    return result;
  }

  undo(activityId: string): boolean {
    if (!this.profile) return false;
    const ok = undoActivity(this.profile, this.today, activityId);
    if (ok) this.commit();
    return ok;
  }

  /** Generates one more activity for today in the section the user chose. */
  generateExtra(section: ExtraSection): ExtraResult | null {
    if (!this.profile) return null;
    const result = addExtra(this.profile, this.today, section);
    if (result) this.commit();
    return result;
  }

  swapActivity(activityId: string): PlannedActivity | null {
    if (!this.profile) return null;
    const replacement = swap(this.profile, this.today, activityId);
    if (replacement) this.commit();
    return replacement;
  }

  setSetting<K extends keyof Profile['settings']>(key: K, value: Profile['settings'][K]): void {
    if (!this.profile) return;
    this.profile.settings[key] = value;
    this.commit();
  }

  /* -------------------------------------------------------------- *
   * Data in and out — the user's data belongs to the user
   * -------------------------------------------------------------- */

  exportJson(): string {
    return JSON.stringify(this.profile, null, 2);
  }

  importJson(text: string): boolean {
    try {
      const profile = migrate(JSON.parse(text));
      if (!profile) return false;
      this.profile = profile;
      this.openToday();
      this.commit();
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.profile = null;
    this.lastOpen = null;
    this.pendingSummary = null;
    if (canStore()) localStorage.removeItem(STORAGE_KEY);
    this.notify();
  }
}

export const store = new Store();
