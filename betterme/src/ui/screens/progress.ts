import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  history,
  levelForXp,
  profileView,
  shortDate,
  upcomingMilestones,
  weekdayLabel,
  weekSummary,
} from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { bar, el, fmt, panel } from '../dom.ts';
import { showDaySummary } from '../summary.ts';
import { overallChart, xpChart } from '../widgets.ts';

/**
 * Progress — the receipts.
 *
 * Charts here are intentionally plain and un-smoothed. A flat week should look
 * flat; inflating a chart to make a bad fortnight look busy is the fastest way
 * to make every other number in the app untrustworthy.
 */

let range: 14 | 30 | 90 = 30;

export function renderProgress(): HTMLElement {
  const profile = store.profile;
  if (!profile) return el('div', {});
  const view = profileView(profile);
  const series = history(profile, range, store.today);
  const week = weekSummary(profile, store.today);
  const upcoming = upcomingMilestones(profile, {
    overall: view.overall,
    level: view.level.level,
    streak: profile.streak.current,
    daysActive: profile.stats.daysActive,
  });

  const totalXpInRange = series.reduce((sum, d) => sum + d.xp, 0);
  const activeDays = series.filter((d) => d.completed > 0).length;

  return el(
    'div',
    { class: 'screen progress' },
    el('h1', {}, 'Progress'),

    panel(
      'This week',
      el(
        'div',
        { class: 'week-strip' },
        week.days.map((d) =>
          el(
            'button',
            {
              class: `week-day ${d.lockedIn ? 'locked' : ''} ${d.date === store.today ? 'today' : ''} ${d.future ? 'future' : ''}`,
              onclick: () => (d.future ? undefined : showDaySummary(d.date)),
              'aria-label': `${weekdayLabel(d.date)} — ${d.completed} of ${d.planned} done`,
            },
            el('em', {}, weekdayLabel(d.date)[0]),
            el('span', { class: 'week-dot' }, d.lockedIn ? '✓' : d.completed > 0 ? '•' : ''),
          ),
        ),
      ),
      el(
        'div',
        { class: 'row between small' },
        el('span', { class: 'dim' }, `${week.lockInDays}/7 days locked in`),
        el('b', {}, `${fmt(week.xp)} XP this week`),
      ),
    ),

    panel(
      'Overall over time',
      rangeTabs(),
      overallChart(series.map((d) => ({ date: d.date, overall: d.overall }))),
      el(
        'div',
        { class: 'row between small' },
        el('span', { class: 'dim' }, `${shortDate(series[0].date)} → today`),
        el('b', {}, `${view.seedOverall} → ${view.overall}`),
      ),
    ),

    panel(
      'Daily XP',
      xpChart(series.slice(-Math.min(range, 30))),
      el(
        'div',
        { class: 'tiles' },
        tile(fmt(totalXpInRange), `XP in ${range} days`),
        tile(String(activeDays), 'active days'),
        tile(String(levelForXp(profile.totalXp)), 'level'),
        tile(String(profile.streak.best), 'best streak'),
      ),
    ),

    panel(
      'Attribute growth',
      el(
        'div',
        { class: 'growth-list' },
        ATTRIBUTE_KEYS.map((key) => {
          const from = profile.seedAttributes[key];
          const to = view.attributes[key];
          const meta = ATTRIBUTE_META[key];
          return el(
            'div',
            { class: 'growth-row' },
            el('span', { class: 'growth-name' }, meta.icon, ' ', meta.label),
            el('span', { class: 'growth-bar' }, bar((to - 20) / 79, meta.accent)),
            el('span', { class: 'growth-value' }, String(to), to > from ? el('em', { class: 'up' }, ` +${to - from}`) : el('em', { class: 'dim' }, ' —')),
          );
        }),
      ),
    ),

    upcoming.length > 0
      ? panel(
          'Next milestones',
          el(
            'div',
            { class: 'milestone-list' },
            upcoming.map(({ milestone, value }) =>
              el(
                'div',
                { class: 'milestone-row' },
                el('span', { class: 'milestone-icon small' }, milestone.icon),
                el(
                  'div',
                  { class: 'grow' },
                  el('div', { class: 'row between' }, el('b', {}, milestone.title), el('em', { class: 'dim' }, `${value}/${milestone.value}`)),
                  bar(Math.min(1, value / milestone.value), '#3ef07a'),
                ),
                el('span', { class: 'reward-pill small' }, `+${milestone.xp}`),
              ),
            ),
          ),
        )
      : null,

    panel(
      'Recent days',
      el(
        'div',
        { class: 'day-list' },
        series
          .slice()
          .reverse()
          .filter((d) => d.planned > 0)
          .slice(0, 14)
          .map((d) =>
            el(
              'button',
              { class: 'day-row', onclick: () => showDaySummary(d.date) },
              el('span', { class: 'day-date' }, shortDate(d.date)),
              el('span', { class: `day-pill ${d.lockedIn ? 'on' : ''}` }, d.lockedIn ? 'Locked in' : `${d.completed}/${d.planned}`),
              el('span', { class: 'day-xp dim' }, `+${fmt(d.xp)} XP`),
            ),
          ),
      ),
    ),
  );
}

function rangeTabs(): HTMLElement {
  const options: (14 | 30 | 90)[] = [14, 30, 90];
  return el(
    'div',
    { class: 'seg' },
    options.map((option) =>
      el(
        'button',
        {
          class: option === range ? 'on' : '',
          onclick: () => {
            range = option;
            store.notify();
          },
        },
        `${option}d`,
      ),
    ),
  );
}

function tile(value: string, label: string): HTMLElement {
  return el('div', { class: 'stat-tile' }, el('b', {}, value), el('span', {}, label));
}
