import {
  ONLINE_TIERS,
  WINS_PER_DIVISION,
  WORLD_SIZE,
  grandChampLabel,
  onlineRank,
  worldLadder,
  worldPositionFor,
  type WorldBuild,
  type WorldPlayer,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { el, panel } from '../dom.ts';
import { rankPanel, drawRankBadge } from '../rankbadge.ts';
import { navigate } from '../../main.ts';

/** How many rows a page shows. The whole ladder at once is unreadable. */
const PAGE = 25;

let page = 0;
let filter: 'all' | 'around' = 'around';

/**
 * The ladder.
 *
 * Everyone with a rank is on it, you included, ordered by wins. You are slotted
 * into the same ordering as everyone else rather than pinned to the bottom, so
 * the position you see is the position you hold.
 */
export function renderLeaderboard(): HTMLElement {
  const root = el('div', { class: 'wrap' });
  const record = store.profile.online;
  const played = record.wins + record.losses > 0;
  const myPosition = played ? worldPositionFor(record.wins, record.losses) : null;

  root.append(
    el('h1', { class: 'page' }, 'Leaderboard'),
    el(
      'p',
      { class: 'page-sub' },
      `Every ranked player, ordered by wins. ${WORLD_SIZE} CPU players hold ranks on this ladder and you are placed among them — climbing past a name means beating enough games to overtake it.`,
    ),

    panel(
      'Your place',
      rankPanel(record),
      !played
        ? el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            'You have not played a ranked match yet, so you are not on the board. One win puts you on it.',
          )
        : null,
      el(
        'div',
        { class: 'row', style: 'gap:8px;margin-top:12px' },
        el('button', { class: 'btn sm primary', onclick: () => navigate('rank') }, 'Play ranked match'),
      ),
    ),
    el('div', { style: 'height:14px' }),
  );

  const listHost = el('div', {});
  const draw = () => {
    listHost.replaceChildren(renderBoard(myPosition, draw));
  };

  root.append(
    el(
      'div',
      { class: 'seg mb' },
      el(
        'button',
        {
          class: filter === 'around' ? 'on' : '',
          onclick: () => {
            filter = 'around';
            draw();
          },
        },
        'Around me',
      ),
      el(
        'button',
        {
          class: filter === 'all' ? 'on' : '',
          onclick: () => {
            filter = 'all';
            page = 0;
            draw();
          },
        },
        'Top of the world',
      ),
    ),
    listHost,
  );

  draw();
  return root;
}

function renderBoard(myPosition: number | null, redraw: () => void): HTMLElement {
  const ladder = worldLadder();
  const record = store.profile.online;

  // "Around me" centres the page on your row, which is the only view that
  // answers the question you actually have: who is directly above me.
  let from = page * PAGE;
  if (filter === 'around' && myPosition !== null) {
    from = Math.max(0, myPosition - 1 - Math.floor(PAGE / 2));
  } else if (filter === 'around') {
    from = Math.max(0, ladder.length - PAGE);
  }

  const rows: HTMLElement[] = [];
  // Your own row is spliced into the ordering rather than appended, so the
  // numbers on screen run in an unbroken sequence.
  const slice: { position: number; player: WorldPlayer | null }[] = [];
  for (let i = from; i < Math.min(ladder.length, from + PAGE); i++) {
    slice.push({ position: 0, player: ladder[i] });
  }
  if (myPosition !== null) {
    const at = myPosition - 1 - from;
    if (at >= 0 && at <= slice.length) slice.splice(at, 0, { position: myPosition, player: null });
  }

  let running = from + 1;
  for (const entry of slice) {
    if (entry.player === null) {
      rows.push(row(myPosition ?? running, store.profile.username || 'You', record.wins, record.losses, record.streak, true, null));
      running++;
      continue;
    }
    const p = entry.player;
    // A world player's own position shifts down by one once you are above them.
    const shown = myPosition !== null && myPosition <= p.position ? p.position + 1 : p.position;
    rows.push(row(shown, p.username, p.wins, p.losses, 0, false, p));
    running++;
  }

  const totalPages = Math.ceil(ladder.length / PAGE);

  return panel(
    filter === 'around' ? 'Around you' : `Page ${page + 1} of ${totalPages}`,
    el(
      'div',
      { class: 'lb-head' },
      el('span', {}, '#'),
      el('span', {}, 'Player'),
      el('span', {}, 'Rank'),
      el('span', { style: 'text-align:right' }, 'Wins'),
      el('span', { style: 'text-align:right' }, 'Losses'),
    ),
    ...rows,
    filter === 'all'
      ? el(
          'div',
          { class: 'row', style: 'gap:8px;margin-top:12px;justify-content:center' },
          el(
            'button',
            {
              class: 'btn sm',
              disabled: page === 0,
              onclick: () => {
                page = Math.max(0, page - 1);
                redraw();
              },
            },
            'Previous',
          ),
          el(
            'button',
            {
              class: 'btn sm',
              disabled: page >= totalPages - 1,
              onclick: () => {
                page = Math.min(totalPages - 1, page + 1);
                redraw();
              },
            },
            'Next',
          ),
        )
      : null,
    el(
      'p',
      { class: 'hint', style: 'margin:12px 0 0' },
      `${WINS_PER_DIVISION} wins clears a division. ${ONLINE_TIERS.map((t) => t.name).join(' → ')}.`,
    ),
  );
}

function row(
  position: number,
  username: string,
  wins: number,
  losses: number,
  streak: number,
  isMe: boolean,
  player: WorldPlayer | null,
): HTMLElement {
  const rank = onlineRank(wins);
  const label = rank.grandChamp ? grandChampLabel(position) : rank.label;

  const name = el(
    player ? 'button' : 'span',
    player
      ? { class: 'lb-name lb-link', onclick: () => showPlayer(player, position) }
      : { class: 'lb-name' },
    username,
    isMe ? el('span', { class: 'lb-you' }, 'you') : null,
    streak >= 3 ? el('span', { class: 'lb-streak' }, `${streak} in a row`) : null,
  );

  return el(
    'div',
    { class: `lb-row ${isMe ? 'me' : ''}` },
    el('span', { class: 'lb-pos' }, String(position)),
    name,
    el('span', { class: 'lb-rank', style: `color:${rank.tier.color}` }, label),
    el('span', { class: 'lb-num' }, String(wins)),
    el('span', { class: 'lb-num faint' }, String(losses)),
  );
}

/**
 * One player's card: their rank, and every build they have played.
 *
 * The per-build records add up to the account total, so opening this never
 * contradicts the row that was clicked to get here.
 */
function showPlayer(player: WorldPlayer, position: number): void {
  const rank = onlineRank(player.wins);
  const label = rank.grandChamp ? grandChampLabel(position) : rank.label;

  const badge = el('canvas', { class: 'rank-badge', style: 'width:72px;height:80px' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, player.wins, position));

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
          el('div', { class: 'player-name' }, player.username),
          el('div', { class: 'player-rank', style: `color:${rank.tier.color}` }, label),
          el(
            'div',
            { class: 'player-line' },
            `#${position} in the world · ${player.wins}W ${player.losses}L · ${player.builds.length} build${player.builds.length === 1 ? '' : 's'}`,
          ),
        ),
      ),
      el('div', { class: 'player-builds' }, ...player.builds.map(buildCard)),
      el('button', { class: 'btn', onclick: () => overlay.remove() }, 'Close'),
    ),
  );
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function buildCard(build: WorldBuild): HTMLElement {
  const per = (n: number) => (build.games > 0 ? (n / build.games).toFixed(1) : '0.0');
  const feet = Math.floor(build.heightIn / 12);
  const inches = build.heightIn % 12;

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
      miniStat('Green', `${Math.round(build.greenRate * 100)}%`),
      miniStat('Wins', String(build.wins)),
      miniStat('Streak', String(build.bestStreak)),
    ),
  );
}

function miniStat(label: string, value: string): HTMLElement {
  return el('div', { class: 'mini-stat' }, el('span', { class: 'mv' }, value), el('span', { class: 'ml' }, label));
}
