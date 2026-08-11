import { ATTRIBUTE_META, ratingFor } from './attributes.ts';
import { levelForXp } from './levels.ts';
import { ATTRIBUTE_KEYS, type AttributeKey, type Profile } from './types.ts';

/**
 * Achievements are pure functions of the profile.
 *
 * Nothing here is incremented by hand at the call site — every badge asks the
 * profile whether it has been earned. That means a badge added next month is
 * awarded retroactively to people who already did the work, and a bug in a
 * counter can never permanently mislabel someone's card.
 */

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legend';

export interface Achievement {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  tier: BadgeTier;
  category: 'start' | 'streak' | 'level' | 'overall' | 'volume' | 'attribute' | 'challenge' | 'resilience';
  /** Current progress toward the badge, for the locked-state bars. */
  progress: (profile: Profile) => { value: number; target: number };
  /** Hidden badges only appear once earned. */
  secret?: boolean;
}

const of = (value: number, target: number) => ({ value, target });

function attributeRating(profile: Profile, key: AttributeKey): number {
  return ratingFor(profile.seedAttributes[key], profile.attributeXp[key]);
}

function streakBadge(days: number, tier: BadgeTier, icon: string, name: string, blurb: string): Achievement {
  return {
    id: `streak-${days}`,
    name,
    blurb,
    icon,
    tier,
    category: 'streak',
    progress: (p) => of(Math.max(p.streak.current, p.streak.best), days),
  };
}

function levelBadge(level: number, tier: BadgeTier, icon: string, name: string): Achievement {
  return {
    id: `level-${level}`,
    name,
    blurb: `Reach level ${level}.`,
    icon,
    tier,
    category: 'level',
    progress: (p) => of(levelForXp(p.totalXp), level),
  };
}

function volumeBadge(count: number, tier: BadgeTier, icon: string, name: string, blurb: string): Achievement {
  return {
    id: `volume-${count}`,
    name,
    blurb,
    icon,
    tier,
    category: 'volume',
    progress: (p) => of(p.stats.activitiesCompleted, count),
  };
}

function overallBadge(overall: number, tier: BadgeTier, icon: string, name: string): Achievement {
  return {
    id: `overall-${overall}`,
    name,
    blurb: `Reach an Overall of ${overall}.`,
    icon,
    tier,
    category: 'overall',
    progress: (p) => of(p.stats.highestOverall, overall),
  };
}

/** One "specialist" badge per attribute, so every area has something to chase. */
function attributeBadges(): Achievement[] {
  const out: Achievement[] = [];
  for (const key of ATTRIBUTE_KEYS) {
    const meta = ATTRIBUTE_META[key];
    out.push({
      id: `attr-70-${key}`,
      name: `${meta.label} 70`,
      blurb: `Get your ${meta.label} rating to 70.`,
      icon: meta.icon,
      tier: 'silver',
      category: 'attribute',
      progress: (p) => of(attributeRating(p, key), 70),
    });
    out.push({
      id: `attr-85-${key}`,
      name: `${meta.label} Elite`,
      blurb: `Get your ${meta.label} rating to 85.`,
      icon: meta.icon,
      tier: 'gold',
      category: 'attribute',
      progress: (p) => of(attributeRating(p, key), 85),
    });
  }
  return out;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-step',
    name: 'Day One',
    blurb: 'Complete your first activity.',
    icon: '🌱',
    tier: 'bronze',
    category: 'start',
    progress: (p) => of(p.stats.activitiesCompleted, 1),
  },
  {
    id: 'first-lock-in',
    name: 'Locked In',
    blurb: 'Finish enough of a day to lock it in.',
    icon: '🔒',
    tier: 'bronze',
    category: 'start',
    progress: (p) => of(p.streak.totalLockInDays, 1),
  },
  {
    id: 'perfect-day',
    name: 'Clean Sheet',
    blurb: 'Complete every single thing on a day’s list.',
    icon: '✨',
    tier: 'silver',
    category: 'start',
    progress: (p) => of(p.stats.perfectDays, 1),
  },
  {
    id: 'perfect-five',
    name: 'Five Clean Sheets',
    blurb: 'Clear a full day’s list five times.',
    icon: '💎',
    tier: 'gold',
    category: 'start',
    progress: (p) => of(p.stats.perfectDays, 5),
  },

  streakBadge(3, 'bronze', '🔥', 'Three In A Row', 'Lock in three days running.'),
  streakBadge(7, 'silver', '🔥', 'One Week', 'Lock in seven days running.'),
  streakBadge(14, 'silver', '🔥', 'Fortnight', 'Lock in fourteen days running.'),
  streakBadge(30, 'gold', '🔥', 'Thirty Days', 'A full month without missing.'),
  streakBadge(100, 'legend', '🔥', 'Century', 'One hundred days. This is not a phase any more.'),

  levelBadge(5, 'bronze', '⭐', 'Level 5'),
  levelBadge(10, 'silver', '⭐', 'Level 10'),
  levelBadge(25, 'gold', '🌟', 'Level 25'),
  levelBadge(50, 'legend', '👑', 'Level 50'),

  overallBadge(65, 'bronze', '📈', 'Starter'),
  overallBadge(75, 'silver', '📈', 'Rising'),
  overallBadge(85, 'gold', '🏆', 'All-Star'),
  overallBadge(92, 'legend', '👑', 'Legend Status'),

  volumeBadge(10, 'bronze', '✅', 'Ten Done', 'Complete ten activities.'),
  volumeBadge(50, 'silver', '✅', 'Fifty Done', 'Complete fifty activities.'),
  volumeBadge(250, 'gold', '🏅', 'Two Fifty', 'Complete two hundred and fifty activities.'),
  volumeBadge(1000, 'legend', '🏆', 'Four Figures', 'One thousand activities completed.'),

  {
    id: 'challenge-10',
    name: 'Bonus Hunter',
    blurb: 'Complete ten daily challenges.',
    icon: '🎯',
    tier: 'silver',
    category: 'challenge',
    progress: (p) => of(p.stats.challengesCompleted, 10),
  },
  {
    id: 'challenge-50',
    name: 'Never Skips The Bonus',
    blurb: 'Complete fifty daily challenges.',
    icon: '🎯',
    tier: 'gold',
    category: 'challenge',
    progress: (p) => of(p.stats.challengesCompleted, 50),
  },
  {
    id: 'weekly-5',
    name: 'Weekly Warrior',
    blurb: 'Clear five weekly challenges.',
    icon: '📅',
    tier: 'gold',
    category: 'challenge',
    progress: (p) => of(p.stats.weeklyChallengesCompleted, 5),
  },
  {
    id: 'elite-work',
    name: 'Elite Effort',
    blurb: 'Complete ten elite-tier activities.',
    icon: '⚡',
    tier: 'gold',
    category: 'volume',
    progress: (p) => of(p.stats.byTier.elite, 10),
  },
  {
    id: 'comeback',
    name: 'Back On It',
    blurb: 'Break a streak, then lock in again. This one matters more than most.',
    icon: '💪',
    tier: 'silver',
    category: 'resilience',
    progress: (p) => of(p.stats.comebacks > 0 && p.streak.current > 0 ? 1 : 0, 1),
  },
  {
    id: 'ninety-days',
    name: 'Ninety Days Active',
    blurb: 'Show up on ninety different days.',
    icon: '📆',
    tier: 'gold',
    category: 'resilience',
    progress: (p) => of(p.stats.daysActive, 90),
  },
  {
    id: 'all-rounder',
    name: 'All-Rounder',
    blurb: 'Get every single attribute to 60 or better.',
    icon: '🧭',
    tier: 'gold',
    category: 'attribute',
    progress: (p) => of(ATTRIBUTE_KEYS.filter((k) => attributeRating(p, k) >= 60).length, ATTRIBUTE_KEYS.length),
  },
  ...attributeBadges(),
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function isEarned(achievement: Achievement, profile: Profile): boolean {
  const { value, target } = achievement.progress(profile);
  return value >= target;
}

/** Everything newly satisfied since the last check. Caller records the timestamps. */
export function newlyEarned(profile: Profile): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !profile.achievements[a.id] && isEarned(a, profile));
}

export const TIER_COLORS: Record<BadgeTier, string> = {
  bronze: '#c98b52',
  silver: '#c3cddd',
  gold: '#ffc53d',
  legend: '#ff5c8a',
};
