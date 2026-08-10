/** Brief, non-blocking confirmations. Nothing important is only said here. */

import { announce, el, icon, ICONS } from './dom.ts';
import { play } from './sound.ts';

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (!host) {
    host = el('div', { class: 'toasts', 'aria-hidden': 'true' });
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  const node = el(
    'div',
    { class: `toast toast--${kind}`, role: 'presentation' },
    icon(kind === 'bad' ? ICONS.close : kind === 'good' ? ICONS.check : ICONS.spark, 18),
    el('span', {}, message),
  );
  ensureHost().appendChild(node);
  // The visible toast is decorative; the live region is what a screen reader hears.
  announce(message);
  play(kind === 'bad' ? 'warn' : kind === 'good' ? 'done' : 'tick');

  window.setTimeout(() => {
    node.classList.add('toast--out');
    window.setTimeout(() => node.remove(), 260);
  }, 3200);
}
