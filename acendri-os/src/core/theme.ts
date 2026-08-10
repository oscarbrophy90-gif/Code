/**
 * Theme and accent, applied to the document root as data attributes so the
 * whole of the styling can react in CSS rather than in JavaScript.
 */

import type { Preferences, Theme } from './accounts.ts';
import { DEFAULT_PREFERENCES } from './accounts.ts';
import { setSoundEnabled } from '../ui/sound.ts';
import { readJSON, writeJSON } from './storage.ts';

export type Accent = { id: string; name: string; hex: string };

/** The accents the settings screen offers. `hex` seeds the CSS custom property. */
export const ACCENTS: Accent[] = [
  { id: 'violet', name: 'Violet', hex: '#7c5cff' },
  { id: 'ember', name: 'Ember', hex: '#ff6a3d' },
  { id: 'mint', name: 'Mint', hex: '#22c8a0' },
  { id: 'azure', name: 'Azure', hex: '#3d9bff' },
  { id: 'rose', name: 'Rose', hex: '#ff4d8d' },
  { id: 'gold', name: 'Gold', hex: '#f5b73d' },
];

/**
 * Preferences are also kept outside the account. The sign-in screen is shown
 * before anyone is signed in, and it should still be in the theme this device
 * was last using rather than flashing the default.
 */
const DEVICE_KEY = 'device-preferences';

const media = window.matchMedia?.('(prefers-color-scheme: light)');

export function devicePreferences(): Preferences {
  return { ...DEFAULT_PREFERENCES, ...readJSON<Partial<Preferences>>(DEVICE_KEY, {}) };
}

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') return media?.matches ? 'light' : 'dark';
  return theme;
}

export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  const resolved = resolve(preferences.theme);
  const accent = ACCENTS.find((a) => a.id === preferences.accent) ?? ACCENTS[0];

  root.dataset.theme = resolved;
  root.dataset.accent = accent.id;
  root.style.setProperty('--accent', accent.hex);
  root.classList.toggle('no-motion', preferences.reduceMotion);
  setSoundEnabled(preferences.sounds);

  // Keeps the phone's status bar and the browser chrome in step with the app.
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'light' ? '#f4f5fa' : '#0a0b10');

  writeJSON(DEVICE_KEY, preferences);
}

/**
 * Follows the system while the theme is set to "system". Returns the unsubscribe
 * function so a later call can replace the listener rather than stack another.
 */
export function watchSystemTheme(getPreferences: () => Preferences): () => void {
  if (!media?.addEventListener) return () => {};
  const handler = () => {
    const preferences = getPreferences();
    if (preferences.theme === 'system') applyPreferences(preferences);
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}

/** True when the device asks for less animation, whatever the app preference says. */
export function systemPrefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
