import { ONLINE_TIERS, WINS_PER_DIVISION, grandChampLabel, onlineRank } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { allAccounts, type AccountBuild, type AccountSummary } from '../../state/accounts.ts';
import { el, panel } from '../dom.ts';
import { rankPanel, drawRankBadge } from '../rankbadge.ts';
import { navigate, refresh } from '../../main.ts';

/**
 * The leaderboard.
 *
 * Real players only. Everyone on it created a username on this copy of the game
 * and finished at least one ranked match — nothing is generated to pad it out,
 * so a board with one name on it means one person has played.
 *
 * Because there is no server, "everyone" means everyone who has played *here*.
 * A second person adds themselves by creating an account and playing, and then
 * the two of you are ranked against each other.
 */
export function renderLeaderboard(): HTMLElement {
  const board = allAccounts(true);
  const record = store.profile.online;
  const myPosition = store.position();

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      'Everyone who has made a username here and played a ranked match, ordered by wins. Nobody is invented to fill it out — if it is short, that is how many people have played.',
    ),

    panel('Your place', rankPanel(record, myPosition)),
    el('div', { style: 'height:14px' }),
    board.length === 0 ? emptyBoard() : renderBoard(board, myPosition),
    el('div', { style: 'height:14px' }),
    panel(
      'Add another player',
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 12px' },
        'Passing the game to somebody else? Give them their own account and their own rank. Everyone who plays here shares this board.',
      ),
      accountSwitcher(),
    ),
  );

  return root;
}

function emptyBoard(): HTMLElement {
  return panel(
    'Nobody has played yet',
    el(
      'p',
      { class: 'hint', style: 'margin:0 0 12px' },
      'The board fills up as people play ranked matches. One game puts you on it.',
    ),
    el('button', { class: 'btn sm primary', onclick: () => navigate('rank') }, 'Play a ranked match'),
  );
}

function renderBoard(board: AccountSummary[], myPosition: number | null): HTMLElement {
  return panel(
    board.length === 1 ? '1 player' : `${board.length} players`,
    el(
      'div',
      { class: 'lb-head' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'Wins'),
      el('span', { style: 'text-align:right' }, 'Losses'),
    ),
    ...board.map((account, i) => row(account, i + 1, i + 1 === myPosition)),
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${WINS_PER_DIVISION} wins clears a division, and a loss costs one. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
  );
}

function row(account: AccountSummary, position: number, isMe: boolean): HTMLElement {
  const rank = onlineRank(account.wins);
  const label = rank.grandChamp ? grandChampLabel(position) : rank.label;

  return el(
    'div',
    { class: `lb-row ${isMe ? 'me' : ''}` },
    el('span', { class: 'lb-pos' }, String(position)),
    el(
      'button',
      { class: 'lb-name lb-link', onclick: () => showAccount(account, position) },
      account.username,
      isMe ? el('span', { class: 'lb-you' }, 'you') : null,
      account.streak >= 3 ? el('span', { class: 'lb-streak' }, `${account.streak} in a row`) : null,
    ),
    el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, label),
    el('span', { class: 'lb-num' }, String(account.wins)),
    el('span', { class: 'lb-num faint' }, String(account.losses)),
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
 * These are real career numbers off that account's saves, so the per-build lines
 * are the same ones the owner sees on their own Records screen.
 */
function showAccount(account: AccountSummary, position: number): void {
  const rank = onlineRank(account.wins);
  const label = rank.grandChamp ? grandChampLabel(position) : rank.label;

  const badge = el('canvas', { class: 'rank-badge', style: 'width:72px;height:80px' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, account.wins, position));

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
          el('div', { class: 'player-name' }, account.username),
          el('div', { class: 'player-rank', style: `color:${rank.tier.color}` }, label),
          el(
            'div',
            { class: 'player-line' },
            `#${position} on the board · ${account.wins}W ${account.losses}L · ${account.lifetimeWins} ranked wins all time · ${account.builds.length} build${account.builds.length === 1 ? '' : 's'}`,
          ),
        ),
      ),
      account.builds.length > 0
        ? el('div', { class: 'player-builds' }, ...account.builds.map(buildCard))
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
