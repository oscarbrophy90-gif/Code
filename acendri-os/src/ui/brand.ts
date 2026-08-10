/** The Acendri mark: an ascending chevron stack, drawn rather than shipped. */

import { el } from './dom.ts';

export function brandMark(size = 56): HTMLElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'mark');
  svg.innerHTML = `
    <defs>
      <linearGradient id="acendri-mark" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="var(--accent)"/>
        <stop offset="1" stop-color="var(--accent-2)"/>
      </linearGradient>
    </defs>
    <path d="M24 6 42 40h-8.4L24 21.5 14.4 40H6z" fill="url(#acendri-mark)"/>
    <path d="M24 27.5 30 40h-12z" fill="var(--accent)" opacity="0.55"/>
  `;
  return svg as unknown as HTMLElement;
}

export function wordmark(): HTMLElement {
  return el(
    'span',
    { class: 'wordmark' },
    el('strong', {}, 'Acendri'),
    el('span', { class: 'wordmark__os' }, 'OS'),
  );
}
