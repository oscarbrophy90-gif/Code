/** Appearance and device settings. Everything here takes effect on the tap. */

import type { PublicAccount, Theme } from '../core/accounts.ts';
import { canPersist, updatePreferences } from '../core/auth.ts';
import { clearAll } from '../core/storage.ts';
import { ACCENTS, applyPreferences } from '../core/theme.ts';
import { el, icon, ICONS } from '../ui/dom.ts';
import { toggle } from '../ui/form.ts';
import { confirmDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { card, sectionTitle } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
];

export function settingsScreen(user: PublicAccount, rerender: () => void): Screen {
  const prefs = user.preferences;

  function change(patch: Parameters<typeof updatePreferences>[0]): void {
    const result = updatePreferences(patch);
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    // Paint immediately rather than waiting for the next render pass.
    applyPreferences(result.account.preferences);
  }

  const themeChoice = el(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Theme' },
    ...THEMES.map((theme) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(prefs.theme === theme.id),
          class: `segmented__option${prefs.theme === theme.id ? ' segmented__option--on' : ''}`,
          onclick: () => {
            change({ theme: theme.id });
            rerender();
          },
        },
        theme.label,
      ),
    ),
  );

  const accentChoice = el(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent colour' },
    ...ACCENTS.map((accent) =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(prefs.accent === accent.id),
          'aria-label': accent.name,
          title: accent.name,
          class: `swatch${prefs.accent === accent.id ? ' swatch--on' : ''}`,
          style: `--swatch:${accent.hex}`,
          onclick: () => {
            change({ accent: accent.id });
            rerender();
          },
        },
        prefs.accent === accent.id ? icon(ICONS.check, 16) : null,
      ),
    ),
  );

  const content = el(
    'div',
    { class: 'page' },
    canPersist
      ? null
      : el(
          'div',
          { class: 'banner banner--bad' },
          'This browser will not let Acendri OS save anything. Private browsing usually does this — your account will disappear when you close the tab.',
        ),
    card(sectionTitle('Theme'), themeChoice, el('p', { class: 'card__note' }, 'Accent'), accentChoice),
    card(
      sectionTitle('Behaviour'),
      toggle({
        label: 'Reduce motion',
        description: 'Turns off the transitions between screens.',
        checked: prefs.reduceMotion,
        onChange: (value) => change({ reduceMotion: value }),
      }).node,
      toggle({
        label: 'Interface sounds',
        description: 'A short tick when something completes.',
        checked: prefs.sounds,
        onChange: (value) => change({ sounds: value }),
      }).node,
    ),
    card(
      sectionTitle('Storage'),
      el(
        'p',
        { class: 'card__note' },
        'Acendri OS keeps your account, notes and tasks in this browser. Clearing the browser’s site data removes them.',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn--danger btn--block',
          onclick: async () => {
            const sure = await confirmDialog({
              title: 'Erase everything on this device?',
              message:
                'Every account, note and task stored by Acendri OS on this device is deleted. This cannot be undone.',
              confirmLabel: 'Erase everything',
              danger: true,
              typeToConfirm: 'ERASE',
            });
            if (!sure) return;
            clearAll();
            toast('Everything erased.');
            // A full reload is the cleanest way back to a first-run device.
            window.location.hash = '#/welcome';
            window.location.reload();
          },
        },
        'Erase all Acendri data',
      ),
    ),
  );

  return { content, title: 'Settings', back: { name: 'you' }, tab: 'you' };
}
