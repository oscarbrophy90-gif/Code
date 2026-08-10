/**
 * Routing for a single-page app that has to feel native on a phone and behave
 * on a desktop browser.
 *
 * Every navigation is a real history entry, so the Android back gesture, the
 * browser back button and the in-app back arrow are the same thing. Routes live
 * in the hash rather than the path because the single-file build is opened from
 * disk, where there is no server to map a path back to the document.
 */

export type Route =
  | { name: 'welcome' }
  | { name: 'signin'; email?: string }
  | { name: 'signup' }
  | { name: 'reset'; email?: string }
  | { name: 'home' }
  | { name: 'notes' }
  | { name: 'note'; id: string }
  | { name: 'you' }
  | { name: 'settings' }
  | { name: 'security' }
  | { name: 'about' };

export type RouteName = Route['name'];

/** Reachable from the tab bar; everything else is pushed on top of one of these. */
export const TABS: RouteName[] = ['home', 'notes', 'you'];

type Listener = (route: Route) => void;
const listeners = new Set<Listener>();

let current: Route = { name: 'welcome' };
/** Guards navigation while a screen has unsaved work; see `setExitGuard`. */
let exitGuard: (() => boolean) | null = null;

function encode(route: Route): string {
  const { name, ...rest } = route as Route & Record<string, string | undefined>;
  const params = Object.entries(rest).filter(([, v]) => v !== undefined && v !== '');
  if (params.length === 0) return `#/${name}`;
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return `#/${name}?${query}`;
}

function decode(hash: string): Route | null {
  const match = /^#\/([a-z]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return null;
  const name = match[1] as RouteName;
  const params: Record<string, string> = {};
  for (const pair of (match[2] ?? '').split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    params[key] = decodeURIComponent(value);
  }
  return { name, ...params } as Route;
}

export function currentRoute(): Route {
  return current;
}

export function onRoute(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of [...listeners]) listener(current);
}

/**
 * A screen can refuse to be left — the note editor uses this to offer a save.
 * Return false to cancel the navigation.
 */
export function setExitGuard(guard: (() => boolean) | null): void {
  exitGuard = guard;
}

/**
 * How many entries this app has pushed. `history.length` counts entries from
 * before the app loaded too, so it cannot answer "would going back leave us?" —
 * this can.
 */
let depth = 0;

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  if (exitGuard && !exitGuard()) return;
  exitGuard = null;

  const url = encode(route);
  if (options.replace) {
    history.replaceState({ route, depth }, '', url);
  } else {
    depth += 1;
    history.pushState({ route, depth }, '', url);
  }

  current = route;
  emit();
}

/** Tab switches replace, so back never walks sideways along the tab bar. */
export function switchTab(name: RouteName): void {
  if (current.name === name) return;
  navigate({ name } as Route, { replace: true });
}

export function back(fallback: Route = { name: 'home' }): void {
  if (exitGuard && !exitGuard()) return;
  exitGuard = null;

  // Going back out of our own stack would leave the app — land on the fallback
  // instead, which is what a phone's back arrow does inside an app.
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Reads the route out of the address bar. Called once, at boot. */
export function start(fallback: Route): Route {
  const fromUrl = decode(window.location.hash);
  current = fromUrl ?? fallback;
  depth = 0;
  history.replaceState({ route: current, depth }, '', encode(current));

  window.addEventListener('popstate', (event) => {
    const state = event.state as { route?: Route; depth?: number } | null;
    const route = state?.route ?? decode(window.location.hash);
    depth = state?.depth ?? 0;
    current = route ?? fallback;
    emit();
  });

  return current;
}
