import './styles/main.css';

import { store } from './state/store.ts';
import { clear, el, setReducedMotion } from './ui/dom.ts';
import { setNavigator, type Route } from './ui/router.ts';
import { showDaySummary } from './ui/summary.ts';
import { renderAchievements } from './ui/screens/achievements.ts';
import { renderChallenges } from './ui/screens/challenges.ts';
import { renderLockIn } from './ui/screens/lockin.ts';
import { renderOnboarding } from './ui/screens/onboarding.ts';
import { renderProfile } from './ui/screens/profile.ts';
import { renderProgress } from './ui/screens/progress.ts';
import { renderSettings } from './ui/screens/settings.ts';

const SCREENS: Record<Route, () => HTMLElement> = {
  today: renderLockIn,
  challenges: renderChallenges,
  profile: renderProfile,
  progress: renderProgress,
  achievements: renderAchievements,
  settings: renderSettings,
};

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: 'today', label: 'Lock In', icon: '🔒' },
  { route: 'challenges', label: 'Challenges', icon: '🎯' },
  { route: 'profile', label: 'Profile', icon: '🪪' },
  { route: 'progress', label: 'Progress', icon: '📈' },
  { route: 'achievements', label: 'Badges', icon: '🏅' },
  { route: 'settings', label: 'Settings', icon: '⚙️' },
];

const root = document.getElementById('app');
if (!root) throw new Error('#app is missing from the page');

let route: Route = 'today';
/** Scroll position per route, so switching tabs and coming back lands where you were. */
const scrollMemory = new Map<Route, number>();

const body = el('main', { class: 'app-body' });
const nav = el('nav', { class: 'tabbar' });

function renderNav(): void {
  clear(nav);
  for (const item of NAV) {
    nav.appendChild(
      el(
        'button',
        {
          class: `tab ${item.route === route ? 'on' : ''}`,
          'aria-current': item.route === route ? 'page' : false,
          onclick: () => go(item.route),
        },
        el('span', { class: 'tab-icon' }, item.icon),
        el('span', { class: 'tab-label' }, item.label),
      ),
    );
  }
}

function render(): void {
  if (!store.profile) {
    clear(root!);
    root!.appendChild(
      renderOnboarding((answers) => {
        store.startNew(answers);
        route = 'today';
        mountShell();
      }),
    );
    return;
  }
  setReducedMotion(store.profile.settings.reducedMotion);
  const previous = body.scrollTop;
  if (previous > 0) scrollMemory.set(route, previous);
  clear(body);
  body.appendChild(SCREENS[route]());
  body.scrollTop = scrollMemory.get(route) ?? 0;
  renderNav();
}

function mountShell(): void {
  clear(root!);
  root!.appendChild(body);
  root!.appendChild(nav);
  render();
  offerPendingSummary();
}

function go(next: Route): void {
  scrollMemory.set(route, body.scrollTop);
  route = next;
  render();
  body.scrollTop = scrollMemory.get(next) ?? 0;
}

setNavigator(go);

/** Yesterday's summary, shown once, on the first open of a new day. */
function offerPendingSummary(): void {
  const pending = store.pendingSummary;
  if (!pending) return;
  setTimeout(() => showDaySummary(pending), 600);
}

store.subscribe(() => {
  if (!store.profile) {
    render();
    return;
  }
  if (!root!.contains(body)) mountShell();
  else render();
});

store.load();

if (store.profile) mountShell();
else render();

// A phone sits in a pocket overnight with the tab still open. Coming back to it
// has to roll the day over, or you would be ticking off yesterday's list.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !store.profile) return;
  const before = store.today;
  store.openToday();
  if (store.today !== before) {
    render();
    offerPendingSummary();
  }
});
