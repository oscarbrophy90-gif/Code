/**
 * Boot, routing and the guards between signed-out and signed-in.
 *
 * The whole app is one render function. A route change, a sign-in, a sign-out
 * or a change in another tab all end up here, and the screen is rebuilt from
 * whatever the stored state now says. Nothing is cached between renders, so
 * there is no second copy of the truth to fall out of step.
 */

import './styles/main.css';

import type { PublicAccount } from './core/auth.ts';
import { currentUser, onAuthChange, touchSession } from './core/auth.ts';
import type { Route, RouteName } from './core/router.ts';
import { currentRoute, navigate, onRoute, start } from './core/router.ts';
import { applyPreferences, devicePreferences, watchSystemTheme } from './core/theme.ts';
import { aboutScreen } from './screens/about.ts';
import { homeScreen } from './screens/home.ts';
import { noteScreen } from './screens/note.ts';
import { notesScreen } from './screens/notes.ts';
import { resetScreen } from './screens/reset.ts';
import { securityScreen } from './screens/security.ts';
import { settingsScreen } from './screens/settings.ts';
import { signInScreen } from './screens/signin.ts';
import { signUpScreen } from './screens/signup.ts';
import { welcomeScreen } from './screens/welcome.ts';
import { youScreen } from './screens/you.ts';
import { clear } from './ui/dom.ts';
import type { Screen } from './ui/shell.ts';
import { renderShell } from './ui/shell.ts';

/** Routes you may only see signed out, and the ones you may only see signed in. */
const PUBLIC_ROUTES: RouteName[] = ['welcome', 'signin', 'signup', 'reset'];

const root = document.getElementById('app');
if (!root) throw new Error('#app is missing from the document');

// Theme first, before anything is painted, so there is no flash of the wrong one.
applyPreferences(devicePreferences());

let currentContent: HTMLElement | null = null;

function screenFor(route: Route, user: PublicAccount | null): Screen {
  // Guards. A signed-out visitor asking for a private route is sent to the
  // welcome screen; a signed-in one asking for sign-in is sent home. Both
  // replace rather than push, so back does not bounce off the guard.
  if (!user && !PUBLIC_ROUTES.includes(route.name)) {
    navigate({ name: 'welcome' }, { replace: true });
    return welcomeScreen();
  }
  if (user && PUBLIC_ROUTES.includes(route.name)) {
    navigate({ name: 'home' }, { replace: true });
    return homeScreen(user);
  }

  switch (route.name) {
    case 'welcome':
      return welcomeScreen();
    case 'signin':
      return signInScreen(route);
    case 'signup':
      return signUpScreen();
    case 'reset':
      return resetScreen(route);
    case 'home':
      return homeScreen(user!);
    case 'notes':
      return notesScreen(user!);
    case 'note':
      return noteScreen(user!, route);
    case 'you':
      return youScreen(user!, render);
    case 'settings':
      return settingsScreen(user!, render);
    case 'security':
      return securityScreen(user!, render);
    case 'about':
      return aboutScreen();
    default:
      return welcomeScreen();
  }
}

function render(): void {
  const user = currentUser();
  const route = currentRoute();

  // Let the outgoing screen flush anything it was holding — the note editor
  // saves here — before its nodes are thrown away.
  currentContent?.dispatchEvent(new CustomEvent('acendri:teardown'));

  const screen = screenFor(route, user);
  const shell = renderShell(screen);

  clear(root!);
  root!.appendChild(shell);
  root!.removeAttribute('aria-busy');
  currentContent = screen.content;

  document.title = screen.title ? `${screen.title} · Acendri OS` : 'Acendri OS';

  // Each screen starts at the top; a phone that keeps the old scroll position
  // when the content is entirely different feels broken.
  shell.querySelector('.content')?.scrollTo({ top: 0 });

  // The signed-in account's own theme wins once we know who it is.
  if (user) applyPreferences(user.preferences);
}

// A remembered session that gets used should not quietly age out.
touchSession();

start(currentUser() ? { name: 'home' } : { name: 'welcome' });

onRoute(render);
onAuthChange(render);
watchSystemTheme(() => currentUser()?.preferences ?? devicePreferences());

/**
 * Another tab signing in or out changes the same storage this tab reads, and
 * the `storage` event is the browser telling us so. Without this, two open tabs
 * disagree about who is signed in.
 */
window.addEventListener('storage', (event) => {
  if (!event.key?.startsWith('acendri.os.v1.')) return;
  render();
});

render();
