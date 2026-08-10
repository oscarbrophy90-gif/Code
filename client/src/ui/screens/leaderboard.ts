import { ONLINE_TIERS, WINS_PER_DIVISION, grandChampLabel, onlineRank } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { type AccountBuild } from '../../state/accounts.ts';
import { boardError, cachedBoard, fetchBoard, localBuildsFor, type BoardEntry } from '../../state/board.ts';
import { online } from '../../net/online.ts';
import { el, panel } from '../dom.ts';
import { rankPanel, drawRankBadge } from '../rankbadge.ts';
import { navigate, refresh } from '../../main.ts';

/**
 * The leaderboard.
 *
 * Real players only. Every row is somebody who created a username and finished a
 * ranked match against another person on this server. Nothing is generated to
 * fill it out, so a board with three names on it means three people have played
 * — which is the truth, and more useful than a convincing-looking lie.
 *
 * It is ordered by ranked wins, and since the rank *is* the win count, that
 * ordering is the rank ordering: nobody is ever listed above a player who
 * outranks them.
 */
export function renderLeaderboard(): HTMLElement {
  const record = store.profile.online;
  const rows = cachedBoard();

  const root = el('div', { class: 'wrap' });
  const listHost = el('div', {});

  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      'Everybody who has played a ranked match on this server, ordered by wins. Real players only — nothing on this board is invented.',
    ),

    panel('Your place', rankPanel(record, store.position())),
    el('div', { style: 'height:14px' }),
    listHost,
  );

  const draw = (entries: BoardEntry[], loading: boolean) => {
    listHost.replaceChildren(
      entries.length > 0 ? board(entries) : empty(loading),
      el('div', { style: 'height:14px' }),
      panel(
        'Where this comes from',
        el(
          'p',
          { class: 'hint', style: 'margin:0 0 12px' },
          `The server at ${online.address} keeps the board. Your rank moves there and only there, which is why a result you did not play cannot appear on it.`,
        ),
        el(
          'div',
          { class: 'row', style: 'gap:8px' },
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                void fetchBoard(true).then((next) => draw(next, false));
              },
            },
            'Refresh',
          ),
          el('button', { class: 'btn sm', onclick: () => navigate('rank') }, 'Play ranked'),
          el('button', { class: 'btn sm', onclick: () => navigate('settings') }, 'Server settings'),
        ),
        boardError() ? el('p', { class: 'hint', style: 'margin:12px 0 0;color:var(--red)' }, boardError()) : null,
      ),
    );
  };

  draw(rows, rows.length === 0);
  void fetchBoard().then((next) => draw(next, false));

  return root;
}

function empty(loading: boolean): HTMLElement {
  return panel(
    loading ? 'Reading the board…' : 'Nobody has played yet',
    el(
      'p',
      { class: 'hint', style: 'margin:0 0 12px' },
      loading
        ? `Asking ${online.address} who is on it.`
        : 'The board fills up as people finish ranked matches. One game puts you on it.',
    ),
    el('button', { class: 'btn sm primary', onclick: () => navigate('rank') }, 'Find a player'),
  );
}

function board(entries: BoardEntry[]): HTMLElement {
  return panel(
    entries.length === 1 ? '1 ranked player' : `${entries.length} ranked players`,
    el(
      'div',
      { class: 'lb-head' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'Wins'),
      el('span', { style: 'text-align:right' }, 'Losses'),
    ),
    ...entries.map((entry) => row(entry)),
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${WINS_PER_DIVISION} wins clears a division, and a loss costs one. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
  );
}

function row(entry: BoardEntry): HTMLElement {
  const rank = onlineRank(entry.wins);
  const label = rank.grandChamp ? grandChampLabel(entry.position) : rank.label;

  return el(
    'div',
    { class: `lb-row ${entry.me ? 'me' : ''}` },
    el('span', { class: 'lb-pos' }, String(entry.position)),
    el(
      'button',
      { class: 'lb-name lb-link', onclick: () => showPlayer(entry) },
      entry.username,
      entry.me ? el('span', { class: 'lb-you' }, 'you') : null,
      entry.streak >= 3 ? el('span', { class: 'lb-streak' }, `${entry.streak} in a row`) : null,
    ),
    el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, label),
    el('span', { class: 'lb-num' }, String(entry.wins)),
    el('span', { class: 'lb-num faint' }, String(entry.losses)),
  );
}

/**
 * One player's card.
 *
 * The record is the server's. The builds are only shown for people who play on
 * this device, because that is the only place their builds exist — the server
 * keeps standings, not wardrobes.
 */
function showPlayer(entry: BoardEntry): void {
  const rank = onlineRank(entry.wins);
  const label = rank.grandChamp ? grandChampLabel(entry.position) : rank.label;
  const builds = localBuildsFor(entry.username);

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
            `#${entry.position} on the board · ${entry.wins}W ${entry.losses}L · ${entry.lifetimeWins} ranked wins all time · best streak ${entry.bestStreak}`,
          ),
        ),
      ),
      builds.length > 0
        ? el('div', { class: 'player-builds' }, ...builds.map(buildCard))
        : el(
            'p',
            { class: 'hint', style: 'margin:0 0 16px' },
            'Builds are kept on the machine that made them, so only players who play here show theirs.',
          ),
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
