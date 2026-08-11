import {
  ATTRIBUTE_META,
  MAX_SHIELDS,
  MILESTONES,
  tierLabel,
  weeklyAttribute,
  weekSummary,
  type PlannedActivity,
} from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { bar, el, fmt, panel } from '../dom.ts';
import { navigate } from '../router.ts';

/** Challenges: today's bonus, the week's objective, streak insurance, and the long list of milestones. */

export function renderChallenges(): HTMLElement {
  const profile = store.profile;
  const day = store.day;
  if (!profile || !day) return el('div', {});

  const challenge = day.plan.find((a) => a.kind === 'challenge');
  const keystone = day.plan.find((a) => a.kind === 'keystone');
  const weekly = profile.weekly;
  const week = weekSummary(profile, store.today);

  return el(
    'div',
    { class: 'screen challenges' },
    el('h1', {}, 'Challenges'),

    panel(
      'Today',
      keystone ? challengeCard(keystone, day.completed.includes(keystone.id), 'Keystone', '◆') : null,
      challenge ? challengeCard(challenge, day.completed.includes(challenge.id), 'Daily challenge', '★') : el('p', { class: 'dim' }, 'No bonus challenge today.'),
      el('button', { class: 'btn ghost wide', onclick: () => navigate('today') }, 'Back to today’s list'),
    ),

    weekly
      ? panel(
          'This week',
          el(
            'div',
            { class: `weekly-card ${weekly.claimed ? 'done' : ''}`, style: `--accent:${weeklyAttribute(weekly) ? ATTRIBUTE_META[weeklyAttribute(weekly)!].accent : '#ffc53d'}` },
            el('div', { class: 'row between center' }, el('b', {}, weekly.title), el('span', { class: 'reward-pill small' }, `+${weekly.xp} XP`)),
            el('p', { class: 'dim' }, weekly.detail),
            bar(Math.min(1, weekly.progress / weekly.target), weekly.claimed ? '#3ef07a' : '#ffc53d'),
            el(
              'div',
              { class: 'row between small' },
              el('span', { class: 'dim' }, weekly.claimed ? 'Cleared — XP banked' : 'Progress'),
              el('b', {}, `${fmt(Math.min(weekly.progress, weekly.target))} / ${fmt(weekly.target)}`),
            ),
          ),
          el(
            'div',
            { class: 'tiles' },
            el('div', { class: 'stat-tile' }, el('b', {}, `${week.lockInDays}/7`), el('span', {}, 'days locked in')),
            el('div', { class: 'stat-tile' }, el('b', {}, fmt(week.xp)), el('span', {}, 'XP this week')),
            el('div', { class: 'stat-tile' }, el('b', {}, String(week.activities)), el('span', {}, 'activities')),
          ),
        )
      : null,

    panel(
      'Streak',
      el(
        'div',
        { class: 'streak-panel' },
        el('div', { class: 'streak-big' }, el('span', {}, '🔥'), el('b', {}, String(profile.streak.current))),
        el(
          'div',
          { class: 'grow' },
          el(
            'p',
            {},
            profile.streak.current === 0
              ? 'No streak running. One locked-in day starts it.'
              : `${profile.streak.current} ${profile.streak.current === 1 ? 'day' : 'days'} running. Best: ${profile.streak.best}.`,
          ),
          el('p', { class: 'dim small' }, `🛡 ${profile.streak.shields}/${MAX_SHIELDS} streak shields. You earn one every seven days in a row, and one is spent automatically if you miss a day.`),
        ),
      ),
      el('p', { class: 'dim small' }, 'Missing a day never takes XP, ratings or levels away from you. The only thing at risk is the streak counter itself.'),
    ),

    panel(
      'Milestones',
      el(
        'div',
        { class: 'milestone-list' },
        MILESTONES.map((milestone) => {
          const earned = !!profile.milestones[milestone.id];
          return el(
            'div',
            { class: `milestone-row ${earned ? 'earned' : ''}` },
            el('span', { class: 'milestone-icon small' }, milestone.icon),
            el('div', { class: 'grow' }, el('b', {}, milestone.title), el('p', { class: 'dim small' }, milestone.blurb)),
            el('span', { class: `reward-pill small ${earned ? 'on' : ''}` }, earned ? '✓' : `+${milestone.xp}`),
          );
        }),
      ),
    ),
  );
}

function challengeCard(activity: PlannedActivity, done: boolean, kicker: string, mark: string): HTMLElement {
  const meta = ATTRIBUTE_META[activity.attribute];
  return el(
    'div',
    { class: `challenge-card ${done ? 'done' : ''}`, style: `--accent:${meta.accent}` },
    el(
      'div',
      { class: 'row between center' },
      el('span', { class: 'kicker' }, `${mark} ${kicker}`),
      el('span', { class: 'xp-chip' }, `+${activity.xp} XP`),
    ),
    el('h4', {}, activity.title),
    el('p', { class: 'dim' }, activity.detail),
    el(
      'div',
      { class: 'row gap small' },
      el('span', { class: 'attr-tag' }, meta.icon, ' ', meta.label),
      el('span', { class: `chip tier-${activity.tier}` }, tierLabel(activity.tier)),
      done ? el('span', { class: 'chip done' }, '✓ Done') : null,
    ),
  );
}
