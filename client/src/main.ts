import './styles/main.css';

import { CURRENCY_SHORT, DIFFICULTY_LABEL, levelProgress } from '@hoops/shared';
import { store } from './state/store.ts';
import { audio } from './engine/audio.ts';
import { clear, el, fmt } from './ui/dom.ts';

import { renderHome } from './ui/screens/home.ts';
import { renderPlay } from './ui/screens/play.ts';
import { renderPractice } from './ui/screens/practice.ts';
import { renderControls } from './ui/screens/controls.ts';
import { renderBuilder } from './ui/screens/builder.ts';
import { renderMyPlayer } from './ui/screens/myplayer.ts';
import { renderRank } from './ui/screens/rank.ts';
import { renderRankPath } from './ui/screens/rankpath.ts';
import { showSeasonReport } from './ui/seasonreport.ts';
import { renderUsername } from './ui/screens/username.ts';
import { renderSeason } from './ui/screens/season.ts';
import { renderStore } from './ui/screens/store.ts';
import { renderAccessories } from './ui/screens/accessories.ts';
import { renderStats } from './ui/screens/stats.ts';
import { renderRecords } from './ui/screens/records.ts';
import { renderSettings } from './ui/screens/settings.ts';
import { renderLeaderboard } from './ui/screens/leaderboard.ts';
import { renderOnline } from './ui/screens/online.ts';
import { inParty, leaveParty, LOBBY_ROUTES } from './state/party.ts';
import { unreadCount } from './state/social.ts';
import { grandChampLabel, onlineRank } from '@hoops/shared';
import { connectMultiplayer } from './net/multiplayer.ts';

export type Route =
  | 'home'
  | 'play'
  | 'online'
  | 'practice'
  | 'controls'
  | 'username'
  | 'builder'
  | 'myplayer'
  | 'rank'
  | 'rankpath'
  | 'season'
  | 'store'
  | 'locker'
  | 'stats'
  | 'records'
  | 'leaderboard'
  | 'settings';

const SCREENS: Record<Route, (params: RouteParams) => HTMLElement> = {
  home: renderHome,
  play: renderPlay,
  online: renderOnline,
  practice: renderPractice,
  controls: renderControls,
  username: renderUsername,
  builder: renderBuilder,
  myplayer: renderMyPlayer,
  rank: renderRank,
  rankpath: renderRankPath,
  season: renderSeason,
  store: renderStore,
  locker: renderAccessories,
  stats: renderStats,
  records: renderRecords,
  leaderboard: renderLeaderboard,
  settings: renderSettings,
};

const NAV: { route: Route; label: string }[] = [
  // Ordered by how often you go there, because the bar scrolls on most screens
  // and whatever sits past the edge may as well not exist. Ranked and the board
  // it feeds are the loop, so they come before the wardrobe.
  { route: 'home', label: 'Home' },
  { route: 'play', label: 'Play' },
  { route: 'online', label: 'Online' },
  { route: 'rank', label: 'Ranked' },
  { route: 'leaderboard', label: 'Leaderboard' },
  { route: 'myplayer', label: 'MyPlayer' },
  { route: 'locker', label: 'Locker' },
  { route: 'store', label: 'Store' },
  { route: 'season', label: 'Season' },
  { route: 'stats', label: 'Stats' },
  { route: 'records', label: 'Records' },
  { route: 'controls', label: 'Controls' },
  { route: 'settings', label: 'Settings' },
];

export type RouteParams = Record<string, string | number | boolean>;

const app = document.getElementById('app')!;
let currentRoute: Route = 'home';
let currentParams: RouteParams = {};
/** When a match or other fullscreen view owns the display. */
let fullscreenNode: HTMLElement | null = null;

const shell = el('div', { class: 'shell' });
const topbar = el('header', { class: 'topbar' });
const screenHost = el('main', { class: 'screen' });
shell.append(topbar, screenHost);
app.appendChild(shell);

export function navigate(route: Route, params: RouteParams = {}): void {
  // A party narrows the game to the lobby: Store, Locker, Settings and
  // Controls stay open, everything else — Play against the AI included —
  // asks you to leave the lobby first, and leaving is what lets you go.
  if (inParty() && !(LOBBY_ROUTES as readonly string[]).includes(route)) {
    confirmLeaveLobby(route, params);
    return;
  }
  currentRoute = route;
  currentParams = params;
  audio.play('ui');
  renderShell();
  screenHost.scrollTop = 0;
  history.replaceState({}, '', `#${route}`);
}

/** The lobby gate's question. Leaving proceeds to where you were going. */
function confirmLeaveLobby(route: Route, params: RouteParams): void {
  const host = el('div', { class: 'overlay' });
  const close = () => host.remove();
  host.appendChild(
    el(
      'div',
      { class: 'box', style: 'max-width:400px' },
      el('h2', { style: 'margin:0 0 4px;font-size:20px;font-weight:900' }, 'Leave the lobby?'),
      el(
        'p',
        { class: 'dim', style: 'margin:0 0 16px' },
        route === 'play'
          ? 'Leaving the lobby ends the party. After that you can play against the AI.'
          : 'That screen is closed while you are in a party. Leaving the lobby ends the party.',
      ),
      el(
        'div',
        { style: 'display:grid;gap:8px' },
        el(
          'button',
          {
            class: 'btn primary block',
            onclick: () => {
              close();
              leaveParty();
              navigate(route, params);
            },
          },
          'Leave lobby',
        ),
        el('button', { class: 'btn block', onclick: close }, 'Stay in the lobby'),
      ),
    ),
  );
  document.body.appendChild(host);
}

/** Takes over the whole viewport (used by the match screen). */
export function showFullscreen(node: HTMLElement): void {
  dismissFullscreen();
  fullscreenNode = node;
  shell.style.display = 'none';
  app.appendChild(node);
}

export function dismissFullscreen(): void {
  if (fullscreenNode) {
    fullscreenNode.remove();
    fullscreenNode = null;
  }
  shell.style.display = '';
}

export function refresh(): void {
  renderShell();
}

function renderTopbar(): void {
  clear(topbar);
  const locked = !store.hasPlayer;

  if (locked) {
    topbar.append(
      el(
        'div',
        { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', {}, 'Hoops ', el('span', { class: 'elite' }, 'Elite')),
      ),
      el(
        'nav',
        {},
        el(
          'button',
          {
            class: `navbtn ${currentRoute === 'builder' ? 'active' : ''}`,
            onclick: () => navigate('builder'),
          },
          'Create your player',
        ),
        // Readable before you build anything — you should be able to see what
        // the game asks of you before you commit to a body type.
        el(
          'button',
          {
            class: `navbtn ${currentRoute === 'controls' ? 'active' : ''}`,
            onclick: () => navigate('controls'),
          },
          'Controls',
        ),
      ),
    );
    return;
  }

  const player = store.player;
  const lp = levelProgress(player.xp);

  const navBar = el(
    'nav',
    {},
    NAV.map((item) => {
      // Online wears a pip when something is waiting: an unanswered friend
      // request, or an unread answer to yours.
      const pending = item.route === 'online' ? unreadCount() : 0;
      return el(
        'button',
        {
          class: `navbtn ${item.route === currentRoute ? 'active' : ''}`,
          onclick: () => navigate(item.route),
        },
        item.label,
        pending > 0 ? el('span', { class: 'nav-pip' }, String(Math.min(9, pending))) : null,
      );
    }),
  );
  // With a dozen destinations the bar scrolls on most screens. Keeping the
  // active one in view means a route you just navigated to is never parked off
  // the edge — which is how the newest screen ends up looking like it is missing.
  requestAnimationFrame(() => {
    navBar.querySelector('.navbtn.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  topbar.append(
    el(
      'button',
      {
        class: 'brand',
        onclick: () => navigate('home'),
        'aria-label': 'Hoops Elite home',
      },
      el('span', { class: 'mark' }),
      el('span', {}, 'Hoops ', el('span', { class: 'elite' }, 'Elite')),
    ),
    navBar,
    el(
      'div',
      { class: 'purse' },
      el('span', { class: 'chip xp', title: `Level ${lp.level}` }, el('span', { class: 'dot' }), `LV ${lp.level}`),
      el(
        'span',
        { class: 'chip cc', title: 'Coins — earned only through play' },
        el('span', { class: 'dot' }),
        `${fmt(player.currency)} ${CURRENCY_SHORT}`,
      ),
      // Online rank, not the CPU ladder. The CPU mark already has a whole screen
      // in Records, and this slot is more useful showing the thing that changes
      // when you actually play someone.
      (() => {
        const online = store.profile.online;
        const rank = onlineRank(online.rp);
        const played = online.wins + online.losses > 0;
        const label = rank.grandChamp ? grandChampLabel(store.position()) : rank.label;
        return el(
          'button',
          {
            class: 'chip rank-chip',
            title: `${online.rp} RP — click for the leaderboard`,
            onclick: () => navigate('leaderboard'),
          },
          el('span', { class: 'dot', style: `background:${rank.tier.color}` }),
          played ? label : 'Unranked',
        );
      })(),
    ),
  );
}

/** Every route except the creator needs a build to exist. */
const ROUTES_WITHOUT_PLAYER: Route[] = ['builder', 'settings', 'controls'];

function renderShell(): void {
  // First run is in order: pick who you are, then build a player. The username
  // comes first because the build belongs to the account rather than the other
  // way round, and the walkout needs a name to put under the build from the very
  // first game.
  if (!store.profile.username) {
    currentRoute = 'username';
  } else if (!store.hasPlayer && !ROUTES_WITHOUT_PLAYER.includes(currentRoute)) {
    // Nothing in the game works without a player, so a profile with no build is
    // routed straight into the creator rather than into a half-empty screen.
    currentRoute = 'builder';
  }
  renderTopbar();
  clear(screenHost);
  const render = SCREENS[currentRoute] ?? renderHome;
  screenHost.appendChild(render(currentParams));
}

store.subscribe(() => {
  if (!fullscreenNode) renderTopbar();
});

function routeFromHash(): Route {
  const hash = location.hash.replace('#', '') as Route;
  return SCREENS[hash] ? hash : 'home';
}

// Multiplayer: joins the Socket.IO server when the game is served by one.
// A no-op with no server (file://, or any other host), so the game plays
// exactly as before in every offline case.
connectMultiplayer();

navigate(routeFromHash());

// A season that ended while the game was closed leaves a note on the profile.
// Read once, on the way in, and only when there is a player to have earned it.
if (store.profile.seasonReport && store.hasPlayer) {
  showSeasonReport(store.profile.seasonReport);
}

// Back and forward should move through the app, not out of it.
window.addEventListener('hashchange', () => {
  const route = routeFromHash();
  if (route !== currentRoute) navigate(route);
});

window.addEventListener('beforeunload', () => store.saveNow());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.saveNow();
});
