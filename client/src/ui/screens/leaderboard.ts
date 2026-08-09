import { ONLINE_TIERS, WINS_PER_DIVISION, grandChampLabel, onlineRank } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { allAccounts, type AccountBuild } from '../../state/accounts.ts';
import { fullBoard, type BoardEntry } from '../../state/board.ts';
import { el, panel } from '../dom.ts';
import { rankPanel, drawRankBadge } from '../rankbadge.ts';
import { navigate, refresh } from '../../main.ts';

/**
 * The leaderboard.
 *
 * Everyone on it — the ranked world and everyone who has played on this copy —
 * on one list, ordered by ranked wins. Since the rank is the win count, that
 * ordering is the rank ordering: nobody is ever listed above somebody who
 * outranks them.
 *
 * The world plays while you are away, so the names above you creep up over real
 * days. Climbing past one is worth something because it did not stand still to
 * let you.
 */

/** How many of the top are always shown. */
const TOP_ROWS = 50;
/** How many either side of you, when you are below that. */
const WINDOW = 4;

export function renderLeaderboard(): HTMLElement {
  const board = fullBoard();
  const record = store.profile.online;
  const myPosition = store.position();

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      'Every ranked player, ordered by wins — so the higher your rank, the higher you sit. The rest of the ladder keeps playing while you are away, so the names above you are moving too.',
    ),

    panel('Your place', rankPanel(record, myPosition)),
    el('div', { style: 'height:14px' }),
    renderBoard(board, myPosition),
    el('div', { style: 'height:14px' }),
    panel(
      'Add another player',
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 12px' },
        'Passing the game to somebody else? Give them their own account and their own rank. Everyone who plays here takes their own place on the board.',
      ),
      accountSwitcher(),
    ),
  );

  return root;
}

/**
 * The rows worth drawing.
 *
 * Six hundred rows is a scroll nobody finishes, so it is the top fifty plus a
 * window around wherever you are. Being #418 and having to scroll past four
 * hundred strangers to find yourself is the one thing a leaderboard must not do.
 */
function visibleRows(board: BoardEntry[], myPosition: number | null): (BoardEntry | 'gap')[] {
  const rows: (BoardEntry | 'gap')[] = board.slice(0, TOP_ROWS);
  if (myPosition === null || myPosition <= TOP_ROWS) return rows;

  const from = Math.max(TOP_ROWS, myPosition - 1 - WINDOW);
  const to = Math.min(board.length, myPosition + WINDOW);
  if (from > TOP_ROWS) rows.push('gap');
  rows.push(...board.slice(from, to));
  return rows;
}

function renderBoard(board: BoardEntry[], myPosition: number | null): HTMLElement {
  const rows = visibleRows(board, myPosition);
  const played = myPosition !== null;

  return panel(
    `${board.length.toLocaleString()} ranked players`,
    played
      ? null
      : el(
          'p',
          { class: 'hint', style: 'margin:0 0 12px' },
          el('span', {}, 'You are not on it yet — one ranked match puts you on. '),
          el('button', { class: 'btn sm primary', onclick: () => navigate('rank') }, 'Play a ranked match'),
        ),
    el(
      'div',
      { class: 'lb-head' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'Wins'),
      el('span', { style: 'text-align:right' }, 'Losses'),
    ),
    ...rows.map((entry) => (entry === 'gap' ? gapRow() : row(entry, entry.position === myPosition))),
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${WINS_PER_DIVISION} wins clears a division, and a loss costs one. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
  );
}

function gapRow(): HTMLElement {
  return el('div', { class: 'lb-gap' }, '···');
}

function row(entry: BoardEntry, isMe: boolean): HTMLElement {
  const rank = onlineRank(entry.wins);
  const label = rank.grandChamp ? grandChampLabel(entry.position) : rank.label;

  return el(
    'div',
    { class: `lb-row ${isMe ? 'me' : ''}` },
    el('span', { class: 'lb-pos' }, String(entry.position)),
    el(
      'button',
      { class: 'lb-name lb-link', onclick: () => showPlayer(entry) },
      entry.username,
      isMe ? el('span', { class: 'lb-you' }, 'you') : null,
      entry.streak >= 3 ? el('span', { class: 'lb-streak' }, `${entry.streak} in a row`) : null,
    ),
    el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, label),
    el('span', { class: 'lb-num' }, String(entry.wins)),
    el('span', { class: 'lb-num faint' }, String(entry.losses)),
  );
}

/** Switching between the people who play on this copy. */
function accountSwitcher(): HTMLElement {
  const all = allAccounts();
  return el(
    'div',
    { style: 'display:grid;gap:8px' },
    ...all.map((account) =>
      el(
        'div',
        { class: 'kv' },
        el(
          'span',
          { class: 'k' },
          account.username,
          account.id === store.accountId ? el('span', { class: 'lb-you' }, 'playing') : null,
        ),
        account.id === store.accountId
          ? el('span', { class: 'v faint' }, 'current')
          : el(
              'button',
              {
                class: 'btn sm',
                onclick: () => {
                  store.switchAccount(account.id);
                  refresh();
                },
              },
              'Switch to',
            ),
      ),
    ),
    el(
      'button',
      {
        class: 'btn sm primary',
        style: 'justify-self:start;margin-top:4px',
        onclick: () => {
          store.addAccount();
          refresh();
        },
      },
      'New player',
    ),
  );
}

/**
 * One player's card: their rank and every build they have played.
 *
 * The same card for a real account and a world player, because the numbers mean
 * the same thing either way — these are the builds that earned that record.
 */
function showPlayer(entry: BoardEntry): void {
  const rank = onlineRank(entry.wins);
  const label = rank.grandChamp ? grandChampLabel(entry.position) : rank.label;

  const badge = el('canvas', { class: 'rank-badge', style: 'width:72px;height:80px' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, entry.wins, entry.position));

  const overlay = el(
    'div',
    { class: 'player-overlay' },
    el(
      'div',
      { class: 'player-card' },
      el(
        'div',
        { class: 'player-head' },
        badge,
        el(
          'div',
          {},
          el('div', { class: 'player-name' }, entry.username),
          el('div', { class: 'player-rank', style: `color:${rank.tier.color}` }, label),
          el(
            'div',
            { class: 'player-line' },
            `#${entry.position} on the board · ${entry.wins}W ${entry.losses}L · ${entry.builds.length} build${entry.builds.length === 1 ? '' : 's'}`,
          ),
        ),
      ),
      entry.builds.length > 0
        ? el('div', { class: 'player-builds' }, ...entry.builds.map(buildCard))
        : el('p', { class: 'hint', style: 'margin:0 0 16px' }, 'No builds yet.'),
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Close'),
    ),
  );
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function buildCard(build: AccountBuild): HTMLElement {
  const per = (n: number) => (build.games > 0 ? (n / build.games).toFixed(1) : '0.0');
  const feet = Math.floor(build.heightIn / 12);
  const inches = build.heightIn % 12;
  const green = build.attempts > 0 ? Math.round((build.greens / build.attempts) * 100) : 0;

  return el(
    'div',
    { class: 'build-card' },
    el(
      'div',
      { class: 'build-head' },
      el('div', { class: 'build-name' }, build.name),
      el('div', { class: 'build-ovr' }, `${build.overall} OVR`),
    ),
    el(
      'div',
      { class: 'build-line' },
      `${build.position} · ${feet}'${inches}" · ${build.weightLb} lb · ${build.games} game${build.games === 1 ? '' : 's'}`,
    ),
    el(
      'div',
      { class: 'build-stats' },
      miniStat('PPG', per(build.points)),
      miniStat('RPG', per(build.rebounds)),
      miniStat('APG', per(build.assists)),
      miniStat('SPG', per(build.steals)),
      miniStat('BPG', per(build.blocks)),
      miniStat('Green', `${green}%`),
      miniStat('Wins', String(build.wins)),
      miniStat('Streak', String(build.bestStreak)),
    ),
  );
}

function miniStat(label: string, value: string): HTMLElement {
  return el('div', { class: 'mini-stat' }, el('span', { class: 'mv' }, value), el('span', { class: 'ml' }, label));
}
