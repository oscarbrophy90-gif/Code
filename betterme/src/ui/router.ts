export type Route = 'today' | 'profile' | 'progress' | 'challenges' | 'achievements' | 'settings';

/**
 * A one-line indirection so screens can navigate without importing `main.ts`
 * and creating an import cycle. `main.ts` registers the real handler at boot.
 */
let handler: (route: Route) => void = () => {};

export function setNavigator(fn: (route: Route) => void): void {
  handler = fn;
}

export function navigate(route: Route): void {
  handler(route);
}
