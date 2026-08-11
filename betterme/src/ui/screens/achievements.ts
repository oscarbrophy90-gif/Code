import { ACHIEVEMENTS, TIER_COLORS, type Achievement, type BadgeTier } from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { bar, el, overlay, panel } from '../dom.ts';

/**
 * The badge cabinet.
 *
 * Locked badges show their real progress rather than hiding behind a question
 * mark — "17/30 days" is a reason to come back tomorrow; "???" is not.
 */

const CATEGORY_LABEL: Record<Achievement['category'], string> = {
  start: 'Getting started',
  streak: 'Streaks',
  level: 'Levels',
  overall: 'Overall',
  volume: 'Volume',
  attribute: 'Attributes',
  challenge: 'Challenges',
  resilience: 'Staying power',
};

const ORDER: Achievement['category'][] = ['start', 'streak', 'level', 'overall', 'attribute', 'volume', 'challenge', 'resilience'];

export function renderAchievements(): HTMLElement {
  const profile = store.profile;
  if (!profile) return el('div', {});

  const earned = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;

  return el(
    'div',
    { class: 'screen achievements' },
    el('h1', {}, 'Achievements'),
    el(
      'div',
      { class: 'achv-summary' },
      el('div', { class: 'row between' }, el('b', {}, `${earned} of ${ACHIEVEMENTS.length} earned`), el('em', { class: 'dim' }, `${Math.round((earned / ACHIEVEMENTS.length) * 100)}%`)),
      bar(earned / ACHIEVEMENTS.length, '#ffc53d'),
    ),
    ORDER.map((category) => {
      const group = ACHIEVEMENTS.filter((a) => a.category === category);
      if (group.length === 0) return null;
      return panel(
        CATEGORY_LABEL[category],
        el(
          'div',
          { class: 'badge-grid' },
          group.map((achievement) => badgeTile(achievement)),
        ),
      );
    }),
  );
}

function badgeTile(achievement: Achievement): HTMLElement {
  const profile = store.profile!;
  const unlocked = !!profile.achievements[achievement.id];
  const { value, target } = achievement.progress(profile);
  const fraction = Math.min(1, value / target);

  return el(
    'button',
    {
      class: `badge-tile ${unlocked ? 'on' : ''} tier-${achievement.tier}`,
      style: `--tier:${TIER_COLORS[achievement.tier]}`,
      onclick: () => showBadge(achievement, unlocked, value, target),
    },
    el('span', { class: 'badge-icon' }, achievement.icon),
    el('span', { class: 'badge-name' }, achievement.name),
    unlocked ? el('span', { class: 'badge-state' }, 'Earned') : el('span', { class: 'badge-progress' }, el('i', { style: `width:${fraction * 100}%` })),
  );
}

function showBadge(achievement: Achievement, unlocked: boolean, value: number, target: number): void {
  overlay((close) =>
    el(
      'div',
      { class: 'badge-detail', style: `--tier:${TIER_COLORS[achievement.tier]}` },
      el('span', { class: `badge-big ${unlocked ? 'on' : ''}` }, achievement.icon),
      el('h2', {}, achievement.name),
      el('span', { class: 'tier-pill', style: `--tier:${TIER_COLORS[achievement.tier]}` }, tierName(achievement.tier)),
      el('p', { class: 'dim' }, achievement.blurb),
      unlocked
        ? el('p', { class: 'good' }, '✓ Earned')
        : el(
            'div',
            { class: 'grow full' },
            el('div', { class: 'row between small' }, el('span', { class: 'dim' }, 'Progress'), el('b', {}, `${Math.min(value, target)} / ${target}`)),
            bar(Math.min(1, value / target), TIER_COLORS[achievement.tier]),
          ),
      el('button', { class: 'btn primary wide', onclick: close }, 'Close'),
    ),
  );
}

function tierName(tier: BadgeTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
