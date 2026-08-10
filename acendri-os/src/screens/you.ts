/** Your account: who you are on this device, and the way out of it. */

import type { PublicAccount } from '../core/auth.ts';
import { listAccounts, sessionInfo, signOut, updateProfile } from '../core/auth.ts';
import { navigate } from '../core/router.ts';
import { NAME_MAX } from '../core/validate.ts';
import { el, icon, ICONS, relativeTime } from '../ui/dom.ts';
import { confirmDialog, promptDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { avatarNode, card, row, sectionTitle } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

const AVATARS = ['🚀', '🌱', '⚡', '🎯', '🧭', '🔭', '🪐', '🏔️', '🌊', '🔥', '🎧', '📚'];

export function youScreen(user: PublicAccount, rerender: () => void): Screen {
  const session = sessionInfo();
  const otherAccounts = listAccounts().filter((a) => a.id !== user.id);

  const avatarPicker = el(
    'div',
    { class: 'avatarpicker', role: 'group', 'aria-label': 'Choose an avatar' },
    ...AVATARS.map((emoji) =>
      el(
        'button',
        {
          type: 'button',
          class: `avatarpicker__option${user.avatar === emoji ? ' avatarpicker__option--on' : ''}`,
          'aria-pressed': String(user.avatar === emoji),
          'aria-label': `Use ${emoji} as your avatar`,
          onclick: () => {
            // Tapping the one you already have takes it off again.
            updateProfile({ avatar: user.avatar === emoji ? '' : emoji });
            rerender();
          },
        },
        emoji,
      ),
    ),
  );

  const content = el(
    'div',
    { class: 'page' },
    el(
      'div',
      { class: 'profile' },
      avatarNode(user, 88),
      el('h2', { class: 'profile__name' }, user.name),
      el('p', { class: 'profile__email' }, user.emailTyped),
    ),
    card(
      sectionTitle('Profile'),
      row({
        label: 'Name',
        value: user.name,
        iconPath: ICONS.user,
        onClick: async () => {
          const next = await promptDialog({
            title: 'Change your name',
            label: 'Name',
            value: user.name,
            maxlength: NAME_MAX,
          });
          if (next === null) return;
          const result = updateProfile({ name: next });
          if (!result.ok) {
            toast(result.error, 'bad');
            return;
          }
          toast('Name updated.', 'good');
          rerender();
        },
      }),
      row({ label: 'Email', value: user.emailTyped, iconPath: ICONS.mail }),
      el('p', { class: 'card__note' }, 'Avatar'),
      avatarPicker,
    ),
    card(
      sectionTitle('This device'),
      row({ label: 'Account created', value: relativeTime(user.createdAt) }),
      row({ label: 'Last signed in', value: relativeTime(user.lastSignInAt) }),
      row({
        label: 'Stay signed in',
        value: session?.remember ? 'On — 30 days' : 'Off — until this tab closes',
      }),
      row({
        label: 'Recovery question',
        value: user.hasRecovery ? 'Set' : 'Not set',
        onClick: () => navigate({ name: 'security' }),
      }),
    ),
    card(
      sectionTitle('More'),
      row({ label: 'Settings', iconPath: ICONS.cog, onClick: () => navigate({ name: 'settings' }) }),
      row({ label: 'Security', iconPath: ICONS.shield, onClick: () => navigate({ name: 'security' }) }),
      row({ label: 'About Acendri OS', iconPath: ICONS.spark, onClick: () => navigate({ name: 'about' }) }),
    ),
    card(
      sectionTitle('Sign out'),
      el(
        'p',
        { class: 'card__note' },
        'Your account and everything in it stays on this device. You just have to sign back in.',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost btn--block',
          onclick: async () => {
            const sure = await confirmDialog({
              title: 'Sign out?',
              message: 'You will need your password to get back in.',
              confirmLabel: 'Sign out',
            });
            if (!sure) return;
            signOut();
            toast('Signed out.');
            navigate({ name: 'welcome' }, { replace: true });
          },
        },
        icon(ICONS.logout, 18),
        'Sign out',
      ),
      otherAccounts.length
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn btn--ghost btn--block',
              onclick: () => {
                signOut();
                navigate({ name: 'signin', email: otherAccounts[0].emailTyped }, { replace: true });
              },
            },
            `Switch to ${otherAccounts[0].name}`,
          )
        : null,
    ),
  );

  return { content, title: 'You', tab: 'you' };
}
