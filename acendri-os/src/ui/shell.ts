/**
 * The frame every screen sits in: the top bar, the scrolling content, and the
 * navigation.
 *
 * One layout, two shapes. Under 900px it is a phone — a title bar at the top
 * and a tab bar at the bottom, both clear of the notch and the home indicator.
 * Above that the tab bar becomes a rail down the left and the content takes a
 * readable column, so the same build is not a stretched phone on a desktop.
 */

import type { PublicAccount } from '../core/auth.ts';
import type { Route, RouteName } from '../core/router.ts';
import { TABS, back as goBack, switchTab } from '../core/router.ts';
import { initials } from '../core/accounts.ts';
import { el, icon, ICONS } from './dom.ts';

export type Screen = {
  content: HTMLElement;
  title?: string;
  /** Shows a back arrow. `true` uses history; a Route goes somewhere specific. */
  back?: boolean | Route;
  /** Buttons for the right-hand side of the top bar. */
  actions?: HTMLElement[];
  /** Which tab to light up. Omit on the auth screens to hide navigation. */
  tab?: RouteName;
  /** Drops the top bar — the welcome and boot screens draw their own. */
  bare?: boolean;
};

const TAB_META: Record<string, { label: string; path: string }> = {
  home: { label: 'Home', path: ICONS.home },
  notes: { label: 'Notes', path: ICONS.note },
  you: { label: 'You', path: ICONS.user },
};

export function avatarNode(user: PublicAccount, size = 40): HTMLElement {
  const node = el('span', {
    class: 'avatar',
    style: `--size:${size}px`,
    'aria-hidden': 'true',
  });
  if (user.avatar) node.textContent = user.avatar;
  else {
    node.textContent = initials(user.name);
    node.classList.add('avatar--initials');
  }
  return node;
}

function topBar(screen: Screen): HTMLElement | null {
  if (screen.bare) return null;

  const backButton = screen.back
    ? el(
        'button',
        {
          type: 'button',
          class: 'iconbtn',
          'aria-label': 'Back',
          onclick: () => goBack(typeof screen.back === 'object' ? screen.back : { name: 'home' }),
        },
        icon(ICONS.back, 22),
      )
    : null;

  return el(
    'header',
    { class: 'topbar' },
    el('div', { class: 'topbar__left' }, backButton),
    el('h1', { class: 'topbar__title' }, screen.title ?? ''),
    el('div', { class: 'topbar__right' }, screen.actions ?? []),
  );
}

function tabBar(active: RouteName): HTMLElement {
  const buttons = TABS.map((name) => {
    const meta = TAB_META[name];
    const isActive = name === active;
    return el(
      'button',
      {
        type: 'button',
        class: `tab${isActive ? ' tab--active' : ''}`,
        'aria-current': isActive ? 'page' : undefined,
        onclick: () => switchTab(name),
      },
      icon(meta.path, 24),
      el('span', { class: 'tab__label' }, meta.label),
    );
  });

  return el('nav', { class: 'tabbar', 'aria-label': 'Main' }, ...buttons);
}

export function renderShell(screen: Screen): HTMLElement {
  const main = el('main', { class: 'content', id: 'main', tabindex: '-1' }, screen.content);

  return el(
    'div',
    { class: `shell${screen.tab ? '' : ' shell--auth'}${screen.bare ? ' shell--bare' : ''}` },
    el(
      'a',
      { class: 'skip', href: '#main', onclick: () => main.focus({ preventScroll: true }) },
      'Skip to content',
    ),
    topBar(screen),
    main,
    screen.tab ? tabBar(screen.tab) : null,
  );
}

/** A tappable settings-style row: label, optional value, chevron. */
export function row(options: {
  label: string;
  value?: string;
  iconPath?: string;
  danger?: boolean;
  onClick?: () => void;
}): HTMLElement {
  const body = [
    options.iconPath ? el('span', { class: 'row__icon' }, icon(options.iconPath, 20)) : null,
    el(
      'span',
      { class: 'row__text' },
      el('span', { class: 'row__label' }, options.label),
      options.value ? el('span', { class: 'row__value' }, options.value) : null,
    ),
    options.onClick ? el('span', { class: 'row__chevron' }, icon(ICONS.chevron, 18)) : null,
  ];

  const className = `row${options.danger ? ' row--danger' : ''}${options.onClick ? ' row--tappable' : ''}`;
  return options.onClick
    ? el('button', { type: 'button', class: className, onclick: options.onClick }, body)
    : el('div', { class: className }, body);
}

export function card(...children: (Node | string | null)[]): HTMLElement {
  return el('section', { class: 'card' }, children);
}

export function sectionTitle(text: string): HTMLElement {
  return el('h2', { class: 'section-title' }, text);
}

export function emptyState(options: {
  iconPath: string;
  title: string;
  message: string;
  action?: HTMLElement;
}): HTMLElement {
  return el(
    'div',
    { class: 'empty' },
    el('span', { class: 'empty__icon' }, icon(options.iconPath, 28)),
    el('h3', { class: 'empty__title' }, options.title),
    el('p', { class: 'empty__text' }, options.message),
    options.action ?? null,
  );
}
