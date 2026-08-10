/**
 * The first thing a new device sees. If this device already has accounts on it,
 * they come first — the common case is someone signing back in, not signing up.
 */

import { listAccounts } from '../core/auth.ts';
import { navigate } from '../core/router.ts';
import { brandMark, wordmark } from '../ui/brand.ts';
import { el, icon, ICONS, relativeTime } from '../ui/dom.ts';
import type { Screen } from '../ui/shell.ts';
import { avatarNode } from '../ui/shell.ts';

export function welcomeScreen(): Screen {
  const accounts = listAccounts();

  const knownAccounts = accounts.length
    ? el(
        'div',
        { class: 'welcome__accounts' },
        el('p', { class: 'welcome__accountsTitle' }, 'Continue as'),
        ...accounts.slice(0, 3).map((account) =>
          el(
            'button',
            {
              type: 'button',
              class: 'accountchip',
              // Straight to sign-in with the address filled in. The password is
              // still required — a saved account is not a saved session.
              onclick: () => navigate({ name: 'signin', email: account.emailTyped }),
            },
            avatarNode(account, 40),
            el(
              'span',
              { class: 'accountchip__text' },
              el('span', { class: 'accountchip__name' }, account.name),
              el(
                'span',
                { class: 'accountchip__meta' },
                account.lastSignInAt ? `Last in ${relativeTime(account.lastSignInAt)}` : account.emailTyped,
              ),
            ),
            icon(ICONS.chevron, 18),
          ),
        ),
      )
    : null;

  const content = el(
    'div',
    { class: 'welcome' },
    el(
      'div',
      { class: 'welcome__hero' },
      el('div', { class: 'welcome__glow', 'aria-hidden': 'true' }),
      brandMark(72),
      el('h1', { class: 'welcome__title' }, wordmark()),
      el(
        'p',
        { class: 'welcome__tagline' },
        'Everything you are working towards, in one place — and it remembers you.',
      ),
    ),
    knownAccounts,
    el(
      'div',
      { class: 'welcome__actions' },
      el(
        'button',
        { type: 'button', class: 'btn btn--primary btn--block', onclick: () => navigate({ name: 'signup' }) },
        accounts.length ? 'Add another account' : 'Create your account',
      ),
      el(
        'button',
        { type: 'button', class: 'btn btn--ghost btn--block', onclick: () => navigate({ name: 'signin' }) },
        accounts.length ? 'Sign in with a different account' : 'I already have an account',
      ),
    ),
    el(
      'p',
      { class: 'welcome__foot' },
      'Accounts are stored on this device only. Nothing is sent anywhere.',
    ),
  );

  return { content, bare: true };
}
