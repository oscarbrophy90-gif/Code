import { ATTRIBUTE_META, daySummary, longDate, type DateKey } from '../core/index.ts';
import { store } from '../state/store.ts';
import { countUp, el, fmt, overlay } from './dom.ts';
import { overallRing } from './widgets.ts';

/**
 * End-of-day summary.
 *
 * The one screen that is allowed to talk about what you *didn't* do — and even
 * here, unfinished work is listed flatly as "left on the table", with no red,
 * no counter of failures and no comment. The tone target is a coach reading a
 * stat line, not a parent reading a report card.
 */
export function showDaySummary(date: DateKey): void {
  const profile = store.profile;
  const summary = profile ? daySummary(profile, date) : null;
  if (!summary) return;

  const overallUp = summary.overallAfter - summary.overallBefore;

  overlay(
    (close) => {
      const ring = overallRing(summary.overallAfter, { size: 116, delta: overallUp > 0 ? overallUp : 0 });
      const value = ring.querySelector('.ring-value');
      if (value instanceof HTMLElement && overallUp > 0) countUp(value, summary.overallBefore, summary.overallAfter, 900);

      return el(
        'div',
        { class: 'scene day-summary' },
        el('span', { class: 'scene-kicker' }, longDate(date)),
        el('h2', {}, summary.lockedIn ? 'Day locked in' : 'Day’s work'),
        el('p', { class: 'summary-line' }, summary.message),
        el(
          'div',
          { class: 'summary-top' },
          ring,
          el(
            'div',
            { class: 'summary-stats' },
            stat(`+${fmt(summary.xp)}`, 'XP earned'),
            stat(`${summary.completed.length}/${summary.completed.length + summary.missed.length}`, 'activities'),
            stat(String(summary.streak), summary.streak === 1 ? 'day streak' : 'day streak'),
          ),
        ),
        summary.attributeDeltas.length > 0
          ? el(
              'div',
              { class: 'delta-row' },
              summary.attributeDeltas.map((d) =>
                el(
                  'span',
                  { class: 'delta-pill', style: `--accent:${ATTRIBUTE_META[d.key].accent}` },
                  `${ATTRIBUTE_META[d.key].icon} ${ATTRIBUTE_META[d.key].label} ${d.from} → ${d.to}`,
                ),
              ),
            )
          : el('p', { class: 'dim small center' }, 'No rating ticked over today — the XP is still banked toward the next one.'),
        summary.completed.length > 0
          ? el(
              'section',
              { class: 'summary-list' },
              el('h3', {}, 'Done'),
              summary.completed.map((a) => el('div', { class: 'summary-item done' }, el('span', {}, '✓'), el('span', {}, a.title))),
            )
          : null,
        summary.missed.length > 0
          ? el(
              'section',
              { class: 'summary-list' },
              el('h3', {}, 'Left on the table'),
              summary.missed.map((a) => el('div', { class: 'summary-item' }, el('span', {}, '–'), el('span', { class: 'dim' }, a.title))),
              el('p', { class: 'dim small' }, 'Not a problem. Tomorrow’s list is already built.'),
            )
          : null,
        el(
          'button',
          {
            class: 'btn primary wide',
            onclick: () => {
              store.markSummarySeen(date);
              close();
            },
          },
          'Close',
        ),
      );
    },
    { className: 'scene-overlay' },
  );
}

function stat(value: string, label: string): HTMLElement {
  return el('div', { class: 'summary-stat' }, el('b', {}, value), el('span', { class: 'dim' }, label));
}
