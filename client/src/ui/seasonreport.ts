import { STORE_BY_ID, TITLE_BY_ID, onlineRank, type SeasonReport } from '@hoops/shared';

import { store } from '../state/store.ts';
import { el, fmt, overlay } from './dom.ts';
import { audio } from '../engine/audio.ts';
import { drawRankBadge } from './rankbadge.ts';

/**
 * What you get when a season ends.
 *
 * A season can end while the game is closed, so this cannot be an animation
 * that plays at the moment of the reset — it is a note left on the profile and
 * read at the next launch. Shown once, then cleared: the second time you see
 * the same list it stops being a reward and starts being a chore.
 */
export function showSeasonReport(report: SeasonReport): void {
  const rank = onlineRank(report.peakPoints);
  const badge = el('canvas', { class: 'rank-badge', style: 'width:84px;height:94px' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, report.peakPoints, 1));

  overlay((close) =>
    el(
      'div',
      { class: 'season-report' },
      el('div', { class: 'season-report-kicker' }, 'SEASON OVER'),
      el('h2', { class: 'season-report-title' }, report.seasonName),
      el(
        'div',
        { class: 'season-report-head' },
        badge,
        el(
          'div',
          {},
          el('div', { class: 'season-report-rank', style: `color:${rank.tier.color}` }, `Finished ${report.tierName}`),
          el(
            'div',
            { class: 'hint', style: 'margin:4px 0 0' },
            `Settled against your season high of ${report.peakPoints} RP.`,
          ),
        ),
      ),
      el(
        'div',
        { class: 'season-report-coins' },
        el('b', {}, `+${fmt(report.coins)}`),
        el('span', {}, 'Coins'),
      ),
      report.items.length > 0
        ? el(
            'div',
            {},
            el('h3', { class: 'panel-title' }, `${report.items.length} unlocked`),
            el('div', { class: 'season-report-items' }, ...report.items.map(rewardRow)),
          )
        : el(
            'p',
            { class: 'hint', style: 'margin:0 0 16px' },
            'You already owned everything this rank pays out, so this one was all coins.',
          ),
      el(
        'p',
        { class: 'hint', style: 'margin:14px 0 16px' },
        `The ladder has been reset — you start the new season at Bronze 3. Your ${report.resetFrom} RP are gone; your record is not.`,
      ),
      el(
        'button',
        {
          class: 'btn primary lg',
          onclick: () => {
            store.clearSeasonReport();
            close();
          },
        },
        'New season',
      ),
    ),
  );
  audio.play('levelUp', 0.9);
}

function rewardRow(id: string): HTMLElement {
  const item = STORE_BY_ID[id];
  const title = TITLE_BY_ID[id];
  const name = item?.name ?? title?.name ?? id;
  const color = title?.color ?? item?.colors[0] ?? '#8a93a6';
  return el(
    'div',
    { class: 'season-report-item', style: `--tint:${color}` },
    el('span', { class: 'dot', style: `background:${color}` }),
    el('span', {}, name),
  );
}
