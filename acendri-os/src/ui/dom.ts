/**
 * Small DOM helpers. The UI is plain DOM on purpose — no framework to ship, no
 * hydration step, and a single-file build that opens straight off the disk.
 */

type Handler = (event: Event) => void;
type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;
type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Inline SVG by path data, so the app carries no icon font and no image files. */
export function icon(path: string, size = 24): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const d = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  d.setAttribute('d', path);
  svg.appendChild(d);
  return svg;
}

export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5',
  note: 'M5 4.5A1.5 1.5 0 0 1 6.5 3h7L19 8.5v11A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5zM13 3v6h6M8.5 13h7M8.5 17h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  cog: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.8 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.9a1.6 1.6 0 0 0-.33-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 8.87 4.6 1.6 1.6 0 0 0 9.87 3.13V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.07a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1Z',
  back: 'M15 19 8 12l7-7',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 13 4 4L19 7',
  close: 'M6 6l12 12M18 6 6 18',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M4 4l16 16M9.9 5.8A8.7 8.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.3 8.2A17 17 0 0 0 2.5 12S6 18.5 12 18.5a8.9 8.9 0 0 0 3.3-.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  trash: 'M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2.5 0-.7 12a1.5 1.5 0 0 1-1.5 1.4H8.7a1.5 1.5 0 0 1-1.5-1.4L6.5 7',
  logout: 'M15 17l5-5-5-5M20 12H9M12 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H12',
  shield: 'M12 3l7.5 3v5.6c0 4.4-3.1 8.3-7.5 9.4-4.4-1.1-7.5-5-7.5-9.4V6z M9 12l2 2 4-4',
  spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  key: 'M15.5 3a5.5 5.5 0 1 0-4.9 8L9 12.6V15H6.6L4 17.6V21h4l7-7a5.5 5.5 0 0 0 .5-11ZM17 7.5h.01',
  bell: 'M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9ZM10 18.5a2 2 0 0 0 4 0',
  mail: 'M3.5 6.5h17v11h-17zM3.5 7l8.5 6 8.5-6',
} as const;

/** Focus without the page lurching, used when a screen opens. */
export function focusSoon(node: HTMLElement | null): void {
  if (!node) return;
  requestAnimationFrame(() => node.focus({ preventScroll: true }));
}

let liveRegion: HTMLElement | null = null;

/** Announces to a screen reader without stealing focus. */
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(liveRegion);
  }
  // Same text twice in a row is not re-read unless the node is emptied first.
  liveRegion.textContent = '';
  window.setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 50);
}

export function relativeTime(then: number): string {
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
