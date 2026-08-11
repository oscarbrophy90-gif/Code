import type { Profile } from './types.ts';

/**
 * Milestones are the big, rare moments — the ones that get a full-screen
 * celebration rather than a toast. Each fires exactly once, tracked by id in
 * `profile.milestones`, and pays a lump of XP on the way through.
 */

export type MilestoneKind = 'overall' | 'level' | 'streak' | 'days';

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  value: number;
  title: string;
  blurb: string;
  icon: string;
  xp: number;
}

function milestone(kind: MilestoneKind, value: number, title: string, blurb: string, icon: string, xp: number): Milestone {
  return { id: `${kind}-${value}`, kind, value, title, blurb, icon, xp };
}

export const MILESTONES: Milestone[] = [
  milestone('overall', 60, 'Overall 60', 'The floor is rising. This is what a real routine looks like from the outside.', '📈', 200),
  milestone('overall', 65, 'Overall 65', 'You are past the point where most people stop.', '📈', 250),
  milestone('overall', 70, 'Overall 70', 'Seventy. Different person to the one who filled in that survey.', '🚀', 350),
  milestone('overall', 75, 'Overall 75', 'Strong across the board and it is no longer an accident.', '🚀', 450),
  milestone('overall', 80, 'Overall 80', 'All-Star. Very few people who start this ever see this number.', '🏆', 600),
  milestone('overall', 85, 'Overall 85', 'Eighty-five. The routine runs you now, not the other way round.', '🏆', 800),
  milestone('overall', 90, 'Overall 90', 'Ninety. There is barely anyone up here.', '👑', 1100),
  milestone('overall', 95, 'Overall 95', 'Top of the ladder. Nothing left but holding it.', '👑', 1500),

  milestone('level', 5, 'Level 5', 'Five levels of real work banked.', '⭐', 150),
  milestone('level', 10, 'Level 10', 'Double digits. The habit has teeth now.', '⭐', 300),
  milestone('level', 20, 'Level 20', 'Twenty levels. Look at where you started.', '🌟', 600),
  milestone('level', 35, 'Level 35', 'Thirty-five. This is a lifestyle, not a streak.', '🌟', 900),
  milestone('level', 50, 'Level 50', 'Fifty levels of showing up.', '👑', 1400),

  milestone('streak', 7, 'Seven Day Streak', 'A full week without missing. The hardest week there is.', '🔥', 200),
  milestone('streak', 21, 'Twenty-One Days', 'Three weeks. It is starting to feel automatic.', '🔥', 400),
  milestone('streak', 50, 'Fifty Days', 'Fifty consecutive days locked in.', '🔥', 800),
  milestone('streak', 100, 'One Hundred Days', 'A hundred days in a row. That is the whole game.', '👑', 1600),

  milestone('days', 30, '30 Days Active', 'Thirty days of turning up, streak or no streak.', '📆', 300),
  milestone('days', 100, '100 Days Active', 'A hundred days on the app. Consistency beats intensity.', '📆', 900),
  milestone('days', 365, 'A Full Year', 'Three hundred and sixty-five days. You did the year.', '🏆', 3000),
];

export interface MilestoneCheck {
  overall: number;
  level: number;
  streak: number;
  daysActive: number;
}

function valueFor(milestone: Milestone, state: MilestoneCheck): number {
  switch (milestone.kind) {
    case 'overall':
      return state.overall;
    case 'level':
      return state.level;
    case 'streak':
      return state.streak;
    case 'days':
      return state.daysActive;
  }
}

export function reachedMilestones(profile: Profile, state: MilestoneCheck): Milestone[] {
  return MILESTONES.filter((m) => !profile.milestones[m.id] && valueFor(m, state) >= m.value);
}

/** The next one of each kind, for the "what's next" list on the progress screen. */
export function upcomingMilestones(profile: Profile, state: MilestoneCheck): { milestone: Milestone; value: number }[] {
  const kinds: MilestoneKind[] = ['overall', 'level', 'streak', 'days'];
  const out: { milestone: Milestone; value: number }[] = [];
  for (const kind of kinds) {
    const next = MILESTONES.find((m) => m.kind === kind && !profile.milestones[m.id]);
    if (next) out.push({ milestone: next, value: valueFor(next, state) });
  }
  return out;
}
