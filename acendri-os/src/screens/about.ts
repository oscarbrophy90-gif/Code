/** What this build is, and what it does with your data. */

import { canPersist } from '../core/auth.ts';
import { usingNativeCrypto } from '../core/hash.ts';
import { brandMark, wordmark } from '../ui/brand.ts';
import { el } from '../ui/dom.ts';
import type { Screen } from '../ui/shell.ts';
import { card, row, sectionTitle } from '../ui/shell.ts';

export const VERSION = '0.1.0';

export function aboutScreen(): Screen {
  const content = el(
    'div',
    { class: 'page' },
    el(
      'div',
      { class: 'profile' },
      brandMark(72),
      el('h2', { class: 'profile__name' }, wordmark()),
      el('p', { class: 'profile__email' }, `Version ${VERSION}`),
    ),
    card(
      sectionTitle('Where your data lives'),
      el(
        'p',
        { class: 'card__note' },
        'On this device, in this browser, and nowhere else. Acendri OS makes no network requests: no analytics, no sync, no account server. Signing out leaves your account here; deleting it removes it.',
      ),
    ),
    card(
      sectionTitle('Build'),
      row({ label: 'Storage', value: canPersist ? 'Available' : 'Blocked by the browser' }),
      row({ label: 'Password hashing', value: usingNativeCrypto ? 'WebCrypto PBKDF2' : 'Built-in PBKDF2' }),
      row({ label: 'Accounts', value: 'Local to this device' }),
    ),
  );

  return { content, title: 'About', back: { name: 'you' }, tab: 'you' };
}
