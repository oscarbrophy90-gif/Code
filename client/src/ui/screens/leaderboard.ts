import {
  ONLINE_TIERS,
  WINS_PER_DIVISION,
  grandChampLabel,
  onlineRank,
  type LeaderboardEntry,
} from '@hoops/shared';

import { net } from '../../net/client.ts';
import { store } from '../../state/store.ts';
import { el, panel } from '../dom.ts';
import { rankPanel, ladderStrip } from '../rankbadge.ts';
import { navigate } from '../../main.ts';

let scope: 'world' | 'region' = 'world';

/**
 * The online ladder.
 *
 * It counts one thing: park games won against a real person. Nothing you do
 * against the CPU appears here, which is the point — the board is a record of
 * people who turned up and beat somebody.
 */
export function renderLeaderboard(): HTMLElement {
  const root = el('div', { class: 'wrap' });
  const listHost = el('div', {});

  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      'Park wins against real players. CPU games, practice and drills are not counted here and never move your online rank.',
    ),

    panel(
      'Your rank',
      el('div', { class: 'lb-me' }, rankPanel(store.profile.online)),
      store.profile.online.updatedAt === 0
        ? el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            'You have not played anyone online yet. Walk into a park and step on a court.',
          )
        : null,
      ladderStrip(store.profile.online.wins),
    ),
    el('div', { style: 'height:14px' }),

    el(
      'div',
      { class: 'seg mb' },
      el(
        'button',
        {
          class: scope === 'world' ? 'on' : '',
          onclick: () => {
            scope = 'world';
            void load(listHost);
          },
        },
        'World',
      ),
      el(
        'button',
        {
          class: scope === 'region' ? 'on' : '',
          onclick: () => {
            scope = 'region';
            void load(listHost);
          },
        },
        'My region',
      ),
    ),
    listHost,
  );

  void load(listHost);
  return root;
}

async function load(host: HTMLElement): Promise<void> {
  host.replaceChildren(panel('Loading', el('p', { class: 'hint', style: 'margin:0' }, 'Asking the server…')));
  try {
    const entries = await net.leaderboard(scope);
    host.replaceChildren(renderTable(entries));
  } catch (err) {
    // A leaderboard needs a server, and saying which one failed is the whole
    // difference between "nobody has played" and "you are not connected".
    host.replaceChildren(
      panel(
        'No leaderboard',
        el(
          'p',
          { class: 'hint', style: 'margin:0 0 10px' },
          err instanceof Error ? err.message : 'Could not reach the server',
        ),
        el('p', { class: 'hint', style: 'margin:0 0 12px' }, `Trying ${net.address}`),
        el(
          'div',
          { class: 'row', style: 'gap:8px' },
          el('button', { class: 'btn sm', onclick: () => void load(host) }, 'Try again'),
          el('button', { class: 'btn sm', onclick: () => navigate('settings') }, 'Change server'),
        ),
      ),
    );
  }
}

function renderTable(entries: LeaderboardEntry[]): HTMLElement {
  if (entries.length === 0) {
    return panel(
      'Nobody yet',
      el(
        'p',
        { class: 'hint', style: 'margin:0' },
        'No online games have been played on this server. Be the first — the top of the board is one win away.',
      ),
    );
  }

  const me = store.profile.userId;
  // Grand Champ placement is a position among everyone, so it is the row number
  // rather than anything stored on the account.
  return panel(
    `Top ${entries.length}`,
    el(
      'div',
      { class: 'lb-head' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'Wins'),
      el('span', { style: 'text-align:right' }, 'Losses'),
    ),
    ...entries.map((e) => {
      const rank = onlineRank(e.wins);
      const label = rank.grandChamp ? grandChampLabel(e.rank) : rank.label;
      return el(
        'div',
        { class: `lb-row ${e.userId === me ? 'me' : ''}` },
        el('span', { class: 'lb-pos' }, String(e.rank)),
        el(
          'span',
          { class: 'lb-name' },
          e.displayName,
          e.winStreak >= 3 ? el('span', { class: 'lb-streak' }, `${e.winStreak} in a row`) : null,
        ),
        el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, label),
        el('span', { class: 'lb-num' }, String(e.wins)),
        el('span', { class: 'lb-num faint' }, String(e.losses)),
      );
    }),
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${WINS_PER_DIVISION} wins clears a division. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
  );
}
