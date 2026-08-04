import './styles/main.css';

import { CURRENCY_SHORT, DIFFICULTY_LABEL, levelProgress } from '@hoops/shared';
import { store } from './state/store.ts';
import { audio } from './engine/audio.ts';
import { clear, el, fmt } from './ui/dom.ts';

import { renderHome } from './ui/screens/home.ts';
import { renderPlay } from './ui/screens/play.ts';
import { renderBuilder } from './ui/screens/builder.ts';
import { renderMyPlayer } from './ui/screens/myplayer.ts';
import { renderParks } from './ui/screens/parks.ts';
import { renderSeason } from './ui/screens/season.ts';
import { renderStore } from './ui/screens/store.ts';
import { renderStats } from './ui/screens/stats.ts';
import { renderRecords } from './ui/screens/records.ts';
import { renderSettings } from './ui/screens/settings.ts';

export type Route =
  | 'home'
  | 'play'
  | 'builder'
  | 'myplayer'
  | 'parks'
  | 'season'
  | 'store'
  | 'stats'
  | 'records'
  | 'settings';

const SCREENS: Record<Route, (params: RouteParams) => HTMLElement> = {
  home: renderHome,
  play: renderPlay,
  builder: renderBuilder,
  myplayer: renderMyPlayer,
  parks: renderParks,
  season: renderSeason,
  store: renderStore,
  stats: renderStats,
  records: renderRecords,
  settings: renderSettings,
};

const NAV: { route: Route; label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'play', label: 'Play' },
  { route: 'myplayer', label: 'MyPlayer' },
  { route: 'parks', label: 'Parks' },
  { route: 'season', label: 'Season' },
  { route: 'store', label: 'Store' },
  { route: 'stats', label: 'Stats' },
  { route: 'records', label: 'Records' },
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
  currentRoute = route;
  currentParams = params;
  audio.play('ui');
  renderShell();
  screenHost.scrollTop = 0;
  history.replaceState({}, '', `#${route}`);
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
  const player = store.player;
  const lp = levelProgress(player.xp);

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
    el(
      'nav',
      {},
      NAV.map((item) =>
        el(
          'button',
          {
            class: `navbtn ${item.route === currentRoute ? 'active' : ''}`,
            onclick: () => navigate(item.route),
          },
          item.label,
        ),
      ),
    ),
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
      el(
        'span',
        { class: 'chip', title: 'Highest CPU difficulty beaten' },
        el('span', { class: 'dot' }),
        player.stats.highestDifficultyBeaten ? DIFFICULTY_LABEL[player.stats.highestDifficultyBeaten] : 'Unranked',
      ),
    ),
  );
}

function renderShell(): void {
  renderTopbar();
  clear(screenHost);
  const render = SCREENS[currentRoute] ?? renderHome;
  screenHost.appendChild(render(currentParams));
}

store.subscribe(() => {
  if (!fullscreenNode) renderTopbar();
});

const hash = location.hash.replace('#', '') as Route;
navigate(SCREENS[hash] ? hash : 'home');

window.addEventListener('beforeunload', () => store.saveNow());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.saveNow();
});
