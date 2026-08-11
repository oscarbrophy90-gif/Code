/**
 * Local-time day handling.
 *
 * The whole game turns over on *your* midnight, not UTC's, so every date here
 * is a local `YYYY-MM-DD` key. A user in Sydney finishing a task at 11pm gets
 * credit for today; the same instant in UTC is already tomorrow, and using UTC
 * would silently break their streak.
 */

export type DateKey = string;

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateKey(at: Date | number = Date.now()): DateKey {
  const d = typeof at === 'number' ? new Date(at) : at;
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday, matching Date#getDay. */
export function dayOfWeek(key: DateKey): number {
  return parseDateKey(key).getDay();
}

export function isWeekend(key: DateKey): boolean {
  const day = dayOfWeek(key);
  return day === 0 || day === 6;
}

/** Monday-anchored week id, e.g. `2026-W33`, used for weekly challenges. */
export function weekKey(key: DateKey): string {
  return `W:${weekStart(key)}`;
}

export function weekStart(key: DateKey): DateKey {
  const day = dayOfWeek(key);
  const back = day === 0 ? 6 : day - 1;
  return addDays(key, -back);
}

/** The seven date keys of the week containing `key`, Monday first. */
export function weekDays(key: DateKey): DateKey[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayLabel(key: DateKey): string {
  return WEEKDAY_LABELS[dayOfWeek(key)];
}

export function shortDate(key: DateKey): string {
  const d = parseDateKey(key);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

export function longDate(key: DateKey): string {
  return `${weekdayLabel(key)}, ${shortDate(key)}`;
}

/** Milliseconds until the next local midnight — used to roll the day over live. */
export function msUntilMidnight(now: number = Date.now()): number {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 2, 0);
  return Math.max(1000, next.getTime() - now);
}

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function partOfDay(now: number = Date.now()): PartOfDay {
  const hour = new Date(now).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}
