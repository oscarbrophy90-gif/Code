import { ONLINE_TIERS, POINTS_PER_DIVISION, onlineRank } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { board } from '../../state/board.ts';
import { el, panel } from '../dom.ts';
import { rankPanel } from '../rankbadge.ts';
import { navigate } from '../../main.ts';

/**
 * The leaderboard, offline.
 *
 * Ninety generated rivals with you spliced in by ranked points. The screen says
 * outright that they are generated: a board that implied these were other people
 * would be lying, and the ladder does not need the lie to work — what it needs
 * is names above you and names below you, so a rank is a position rather than a
 * number.
 *
 * The rivals never move. You do, and the names you pass stay passed.
 */

/** How many rows are always shown from the top. */
const TOP_ROWS = 25;
/** How many either side of you, when you are below that. */
const WINDOW = 5;

export function renderLeaderboard(): HTMLElement {
  const rows = board();
  const record = store.profile.online;
  const mine = rows.find((r) => r.me);

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      'Ranked points decide the order, so a higher rank is always a higher place. Everyone here except you is a generated rival — the game is offline, and this is the ladder you are climbing rather than a record of other people.',
    ),

    panel('Your place', rankPanel(record, mine?.position ?? null)),
    el('div', { style: 'height:14px' }),
    table(rows, mine?.position ?? null),
  );

  return root;
}

/** Top of the board, then a window around wherever you are. */
function visible(rows: ReturnType<typeof board>, myPosition: number | null): (typeof rows[number] | 'gap')[] {
  const out: (typeof rows[number] | 'gap')[] = rows.slice(0, TOP_ROWS);
  if (myPosition === null || myPosition <= TOP_ROWS) return out;
  const from = Math.max(TOP_ROWS, myPosition - 1 - WINDOW);
  const to = Math.min(rows.length, myPosition + WINDOW);
  if (from > TOP_ROWS) out.push('gap');
  out.push(...rows.slice(from, to));
  return out;
}

function table(rows: ReturnType<typeof board>, myPosition: number | null): HTMLElement {
  return panel(
    `${rows.length} on the ladder`,
    el(
      'div',
      { class: 'lb-head wide' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'RP'),
      el('span', { style: 'text-align:right' }, 'OVR'),
      el('span', { style: 'text-align:right' }, 'LV'),
      el('span', { style: 'text-align:right' }, 'W'),
      el('span', { style: 'text-align:right' }, 'L'),
      el('span', { style: 'text-align:right' }, 'Streak'),
    ),
    ...visible(rows, myPosition).map((row) => (row === 'gap' ? el('div', { class: 'lb-gap' }, '···') : line(row))),
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${POINTS_PER_DIVISION} RP per division. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
    el(
      'div',
      { class: 'row', style: 'gap:8px;margin-top:12px' },
      el('button', { class: 'btn sm primary', onclick: () => navigate('rank') }, 'Play ranked'),
    ),
  );
}

function line(row: ReturnType<typeof board>[number]): HTMLElement {
  const rank = onlineRank(row.points);
  return el(
    'div',
    { class: `lb-row wide ${row.me ? 'me' : ''}` },
    el('span', { class: 'lb-pos' }, String(row.position)),
    el(
      'span',
      { class: 'lb-name' },
      row.name,
      row.me ? el('span', { class: 'lb-you' }, 'you') : null,
    ),
    el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, row.rankLabel),
    el('span', { class: 'lb-num' }, String(row.points)),
    el('span', { class: 'lb-num faint' }, String(row.overall)),
    el('span', { class: 'lb-num faint' }, String(row.level)),
    el('span', { class: 'lb-num' }, String(row.wins)),
    el('span', { class: 'lb-num faint' }, String(row.losses)),
    el(
      'span',
      { class: `lb-num ${row.streak >= 3 ? 'lb-streak' : 'faint'}` },
      row.streak > 0 ? `${row.streak}` : '—',
    ),
  );
}
