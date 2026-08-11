/** Tiny DOM helpers. The UI is plain DOM so it stays fast on a phone. */

type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;
type Child = Node | string | number | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function applyAttrs(node: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
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

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function signed(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

export function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

/** At most this many notices on screen at once — beyond that they are the UI. */
const MAX_TOASTS = 3;

export function toastHost(): Element {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  const host = toastHost();
  const node = el('div', { class: `toast ${kind}` }, message);
  host.appendChild(node);
  // Ticking four things off quickly should not bury the screen in green boxes.
  while (host.children.length > MAX_TOASTS) host.firstElementChild?.remove();
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, 2400);
}

export function overlay(content: (close: () => void) => HTMLElement, opts: { dismissable?: boolean; className?: string } = {}): () => void {
  const dismissable = opts.dismissable !== false;
  const host = el('div', { class: `overlay ${opts.className ?? ''}` });
  const close = () => {
    host.classList.add('out');
    window.removeEventListener('keydown', onKey);
    setTimeout(() => host.remove(), 200);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && dismissable) close();
  };
  if (dismissable) {
    host.addEventListener('click', (e) => {
      if (e.target === host) close();
    });
  }
  window.addEventListener('keydown', onKey);
  host.appendChild(el('div', { class: 'sheet' }, content(close)));
  document.body.appendChild(host);
  return close;
}

export function confirmDialog(title: string, body: string, confirmLabel: string, onConfirm: () => void): void {
  overlay((close) =>
    el(
      'div',
      { class: 'confirm' },
      el('h2', {}, title),
      el('p', { class: 'dim' }, body),
      el(
        'div',
        { class: 'row gap' },
        el('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
        el(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              close();
              onConfirm();
            },
          },
          confirmLabel,
        ),
      ),
    ),
  );
}

export function bar(value: number, color?: string): HTMLElement {
  const fill = el('i', { style: `width:${Math.max(0, Math.min(1, value)) * 100}%${color ? `;background:${color}` : ''}` });
  return el('div', { class: 'bar' }, fill);
}

export function panel(title: string | null, ...children: (Child | Child[])[]): HTMLElement {
  return el('section', { class: 'panel' }, title ? el('h3', { class: 'panel-title' }, title) : null, ...children);
}

/**
 * Counts a number up, because a rating that ticks is worth more than one that
 * appears. Takes any Element — the Overall lives inside an SVG badge.
 */
export function countUp(node: Element, from: number, to: number, ms = 700): void {
  if (from === to || prefersReducedMotion()) {
    node.textContent = String(Math.round(to));
    return;
  }
  const start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let reducedMotion = false;

export function setReducedMotion(value: boolean): void {
  reducedMotion = value;
  document.documentElement.classList.toggle('reduced-motion', value);
}

export function prefersReducedMotion(): boolean {
  return reducedMotion;
}
