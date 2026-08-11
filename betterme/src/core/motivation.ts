import { rngFor } from './rng.ts';
import type { DateKey, PartOfDay } from './day.ts';
import type { PlannedActivity, Profile } from './types.ts';

/**
 * Every line the app says to you.
 *
 * House rules, and they are not negotiable:
 *  - Never shame anyone for a missed day. Missing is normal; the app's job is
 *    to make coming back feel easy, not to make leaving feel expensive.
 *  - Never guilt-trip about a broken streak. Point at the next day instead.
 *  - No health claims, no body talk, no comparisons to other people.
 */

const GREETING: Record<PartOfDay, string[]> = {
  morning: [
    'Morning. Let’s get the first one done.',
    'New day on the board. Start with the easiest one.',
    'Nothing on this list is harder than starting it.',
    'Today’s card is ready. Take the first task.',
  ],
  afternoon: [
    'Plenty of day left. Pick one.',
    'Half a day is still a whole day’s worth of points.',
    'Good time to take the keystone.',
    'Still time to lock this one in.',
  ],
  evening: [
    'Evening. Get what you can and lock it in.',
    'Two or three left? That is a normal evening.',
    'Finish strong. The summary is waiting.',
    'One more before you settle down.',
  ],
  night: [
    'Late one. Grab anything small and call it a day.',
    'Even one counts. Then go to sleep.',
    'Whatever is left, tomorrow can have it.',
    'Quick win, then rest. Sleep is on the list too.',
  ],
};

const AFTER_COMPLETE = [
  'Done. That is banked.',
  'That one counted.',
  'Logged. Keep going.',
  'Good. Next.',
  'That is the work.',
  'Nobody saw that one. It still counts.',
];

const AFTER_KEYSTONE = [
  'Keystone done. That is the day’s headline.',
  'The hard one is behind you.',
  'That was the one that mattered today.',
];

const AFTER_CHALLENGE = [
  'Bonus taken. Free points nobody made you take.',
  'Challenge cleared.',
  'That was optional and you did it anyway.',
];

const LOCK_IN = [
  'Day locked in.',
  'That is today secured.',
  'Locked in. Streak safe.',
];

const SUMMARY_PERFECT = [
  'Everything on the list. Full clean sheet.',
  'You cleared the whole board today.',
  'Perfect day. Those are rare, so enjoy it.',
];

const SUMMARY_GOOD = [
  'Solid day. That is how the number moves.',
  'Good work today. It compounds.',
  'That is a day you would be happy to repeat.',
];

const SUMMARY_PARTIAL = [
  'Not a full day, but not nothing. Points banked.',
  'Some is infinitely better than none.',
  'Partial days are still days. Take the points.',
];

const SUMMARY_EMPTY = [
  'Quiet day. It happens — tomorrow’s list is already waiting.',
  'Nothing logged today. No damage done. Start again in the morning.',
  'Zero days are part of it. Come back tomorrow and take one task.',
];

const COMEBACK = [
  'Welcome back. Streak reset, progress didn’t.',
  'Back on it. Everything you earned is still on your card.',
  'You lost a streak, not a level. Pick one task and go.',
  'The gap is over the moment you tick one box.',
];

const SHIELD_USED = [
  'Streak shield used — your run survives.',
  'A shield covered the gap. Streak intact.',
];

function choose(pool: string[], ...seed: (string | number)[]): string {
  return rngFor(...seed).pick(pool);
}

export function greeting(part: PartOfDay, date: DateKey, profile: Profile): string {
  if (profile.streak.comeback) return choose(COMEBACK, profile.id, date, 'comeback');
  return choose(GREETING[part], profile.id, date, part);
}

export function completionLine(activity: PlannedActivity, seed: string | number): string {
  if (activity.kind === 'challenge') return choose(AFTER_CHALLENGE, activity.id, seed);
  if (activity.kind === 'keystone') return choose(AFTER_KEYSTONE, activity.id, seed);
  return choose(AFTER_COMPLETE, activity.id, seed);
}

export function lockInLine(date: DateKey): string {
  return choose(LOCK_IN, date, 'lockin');
}

export function shieldLine(date: DateKey): string {
  return choose(SHIELD_USED, date, 'shield');
}

export function summaryLine(date: DateKey, completed: number, planned: number, lockedIn = false): string {
  if (planned > 0 && completed >= planned) return choose(SUMMARY_PERFECT, date, 'perfect');
  if (completed === 0) return choose(SUMMARY_EMPTY, date, 'empty');
  // A day that hit its lock-in goal is a good day, whatever the raw ratio says —
  // the bonus challenge sitting undone should not downgrade the write-up.
  if (lockedIn || completed / Math.max(1, planned) >= 0.6) return choose(SUMMARY_GOOD, date, 'good');
  return choose(SUMMARY_PARTIAL, date, 'partial');
}

/**
 * Shown when someone opens the app after a gap. Note what it does not do:
 * no "you failed", no count of days lost, no guilt.
 */
export function comebackLine(daysAway: number, date: DateKey): string {
  if (daysAway >= 14) return 'Long time. Nothing was deleted — your card is exactly where you left it. One task today.';
  if (daysAway >= 4) return 'A few days off. That is allowed. Start with the smallest thing on the list.';
  return choose(COMEBACK, date, 'gap', daysAway);
}
