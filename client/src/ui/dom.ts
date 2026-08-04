/** Tiny DOM helpers. The UI is plain DOM so menus stay fast on mobile. */

type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;
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
    } else if (key === 'style' && typeof value === 'string') {
      node.setAttribute('style', value);
    } else if (key === 'html') {
      node.innerHTML = String(value);
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

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function ratio(made: number, attempts: number): string {
  return attempts === 0 ? '—' : `${((made / attempts) * 100).toFixed(1)}%`;
}

/** Screen-reader-friendly, non-blocking notification. */
export function toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const node = el('div', { class: `toast ${kind}` }, message);
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(10px)';
    setTimeout(() => node.remove(), 320);
  }, 2600);
}

export function overlay(content: (close: () => void) => HTMLElement): void {
  const host = el('div', { class: 'overlay' });
  const close = () => host.remove();
  host.addEventListener('click', (e) => {
    if (e.target === host) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  host.appendChild(el('div', { class: 'box' }, content(close)));
  document.body.appendChild(host);
}

export function confirmDialog(title: string, body: string, onConfirm: () => void): void {
  overlay((close) =>
    el(
      'div',
      {},
      el('h2', { style: 'margin:0 0 8px;font-size:20px;font-weight:900' }, title),
      el('p', { class: 'dim', style: 'margin:0 0 20px' }, body),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'btn', onclick: close }, 'Cancel'),
        el(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              close();
              onConfirm();
            },
          },
          'Confirm',
        ),
      ),
    ),
  );
}

export function bar(value: number, className = ''): HTMLElement {
  return el('div', { class: `bar ${className}` }, el('i', { style: `width:${Math.max(0, Math.min(1, value)) * 100}%` }));
}

export function kv(key: string, value: string | number): HTMLElement {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, key), el('span', { class: 'v' }, String(value)));
}

export function panel(title: string, ...children: (Child | Child[])[]): HTMLElement {
  return el('section', { class: 'panel clipped' }, title ? el('h3', { class: 'panel-title' }, title) : null, ...children);
}

export function tabs(
  items: { id: string; label: string }[],
  active: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return el(
    'div',
    { class: 'tabs', role: 'tablist' },
    items.map((item) =>
      el(
        'button',
        {
          class: `tab ${item.id === active ? 'active' : ''}`,
          role: 'tab',
          'aria-selected': item.id === active,
          onclick: () => onSelect(item.id),
        },
        item.label,
      ),
    ),
  );
}

export function segmented<T extends string>(
  options: { value: T; label: string }[],
  active: T,
  onSelect: (value: T) => void,
): HTMLElement {
  return el(
    'div',
    { class: 'seg' },
    options.map((o) =>
      el('button', { class: o.value === active ? 'on' : '', onclick: () => onSelect(o.value) }, o.label),
    ),
  );
}

export function slider(opts: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: (v: number) => string;
  onInput: (v: number) => void;
}): HTMLElement {
  const readout = el('b', {}, opts.display ? opts.display(opts.value) : String(opts.value));
  const input = el('input', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step ?? 1,
    value: opts.value,
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      readout.textContent = opts.display ? opts.display(v) : String(v);
      opts.onInput(v);
    },
  });
  return el(
    'div',
    { class: 'slider' },
    el('div', { class: 'head' }, el('span', { class: 'dim' }, opts.label), readout),
    input,
  );
}
