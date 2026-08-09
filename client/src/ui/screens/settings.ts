import {
  USERNAME_MAX,
  formatCooldown,
  usernameCooldownLeft,
  validateUsername,
  type GameSettings,
  type ShotMeterStyle,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { usernameTaken } from '../../state/accounts.ts';
import { audio } from '../../engine/audio.ts';
import { refresh } from '../../main.ts';
import { confirmDialog, el, panel, segmented, slider, toast } from '../dom.ts';

const METER_STYLES: { value: ShotMeterStyle; label: string; blurb: string }[] = [
  { value: 'arcBar', label: 'Arc', blurb: 'Curved bar above your head. The default, easiest to read at a glance.' },
  { value: 'sideBar', label: 'Side bar', blurb: 'Vertical bar pinned to the right of the screen — never covers the defender.' },
  { value: 'circleRing', label: 'Ring', blurb: 'Ring on the floor around your feet. Keeps your eyes on the court.' },
  { value: 'dualPips', label: 'Pips', blurb: 'Segmented ticks. The green band reads as discrete steps.' },
  { value: 'hidden', label: 'Off', blurb: 'No meter at all. Time it by the animation — the way high-level players do.' },
];

export function renderSettings(): HTMLElement {

  const s = store.settings;

  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    store.update((p) => {
      p.settings[key] = value;
    });
    audio.masterVolume = store.settings.masterVolume;
    audio.sfxVolume = store.settings.sfxVolume;
  };

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Settings'),
    el('p', { class: 'page-sub' }, 'Presentation options. Nothing here changes gameplay balance — meter style and audio are preference, not advantage.'),

    el(
      'div',
      { class: 'grid cols-2' },
      panel(
        'Shot meter',
        el(
          'div',
          { style: 'display:grid;gap:7px' },
          ...METER_STYLES.map((m) =>
            el(
              'button',
              {
                class: 'kv',
                style: `width:100%;text-align:left;${s.shotMeterStyle === m.value ? 'border-color:var(--accent)' : ''}`,
                onclick: () => {
                  set('shotMeterStyle', m.value);
                  refresh();
                },
              },
              el(
                'span',
                { class: 'k' },
                el('b', { style: s.shotMeterStyle === m.value ? 'color:var(--accent)' : '' }, m.label),
                el('div', { class: 'faint', style: 'font-size:11px' }, m.blurb),
              ),
              s.shotMeterStyle === m.value ? el('span', { class: 'pill hot' }, 'Active') : null,
            ),
          ),
        ),
        el('div', { class: 'hint', style: 'margin-top:12px' }, 'You can also cycle the meter mid-match from the pause menu.'),
      ),

      panel(
        'Display',
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Frame rate cap'),
        el(
          'div',
          { class: 'mb' },
          segmented<string>(
            [
              { value: '0', label: 'Uncapped' },
              { value: '120', label: '120 FPS' },
              { value: '60', label: '60 FPS' },
            ],
            String(s.fpsCap),
            (v) => {
              set('fpsCap', Number(v) as GameSettings['fpsCap']);
              refresh();
            },
          ),
        ),
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Render quality'),
        el(
          'div',
          { class: 'mb' },
          segmented(
            [
              { value: 'high' as const, label: 'High' },
              { value: 'medium' as const, label: 'Medium' },
              { value: 'low' as const, label: 'Low' },
            ],
            s.quality,
            (v) => {
              set('quality', v);
              refresh();
            },
          ),
        ),
        toggle('Camera shake', s.cameraShake, (v) => {
          set('cameraShake', v);
          refresh();
        }),
        toggle('Reduced motion', s.reducedMotion, (v) => {
          set('reducedMotion', v);
          refresh();
        }),
        toggle('Touch controls', s.touchControls, (v) => {
          set('touchControls', v);
          refresh();
        }),
        el('div', { class: 'hint', style: 'margin-top:10px' }, 'The simulation always runs at a fixed 120 Hz regardless of frame rate, so capping the display never changes shot timing.'),
      ),

      panel(
        'Players on this device',
        el(
          'div',
          { class: 'hint', style: 'margin:0 0 10px' },
          'Everyone here has their own rank, their own builds and their own place on the leaderboard. Switching does not touch anybody else\'s save.',
        ),
        el(
          'div',
          { style: 'display:grid;gap:8px' },
          ...store.accounts().map((account) =>
            el(
              'div',
              { class: 'kv' },
              el('span', { class: 'k' }, account.username || 'Unnamed'),
              account.id === store.accountId
                ? el('span', { class: 'v faint' }, 'playing')
                : el(
                    'button',
                    {
                      class: 'btn sm',
                      onclick: () => {
                        store.switchAccount(account.id);
                        refresh();
                      },
                    },
                    'Switch to',
                  ),
            ),
          ),
          el(
            'button',
            {
              class: 'btn sm primary',
              style: 'justify-self:start',
              onclick: () => {
                store.addAccount();
                refresh();
              },
            },
            'Add a player',
          ),
        ),
      ),

      panel(
        'Username',
        el(
          'div',
          { class: 'hint', style: 'margin:0 0 10px' },
          'The name you are known by on the leaderboard. It sits under your build name on the walkout. You can change it once every 30 days.',
        ),
        usernameEditor(),
      ),

      panel(
        'Audio',
        slider({ label: 'Master', value: Math.round(s.masterVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('masterVolume', v / 100) }),
        slider({ label: 'Effects', value: Math.round(s.sfxVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('sfxVolume', v / 100) }),
        slider({ label: 'Music', value: Math.round(s.musicVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('musicVolume', v / 100) }),
        el('button', { class: 'btn sm', onclick: () => audio.play('green') }, 'Test sound'),
      ),

      panel(
        'Profile',
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Display name'),
        el('input', {
          type: 'text',
          value: store.profile.displayName,
          maxlength: 18,
          oninput: (e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            store.update((p) => {
              p.displayName = value;
            });
          },
        }),
        el(
          'div',
          { class: 'row', style: 'margin-top:14px' },
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                const blob = store.exportBlob();
                const url = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
                const a = el('a', { href: url, download: 'hoops-elite-save.json' });
                a.click();
                URL.revokeObjectURL(url);
                toast('Save exported', 'good');
              },
            },
            'Export save',
          ),
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                const picker = el('input', { type: 'file', accept: 'application/json' }) as HTMLInputElement;
                picker.onchange = async () => {
                  const file = picker.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  if (store.importBlob(text)) {
                    toast('Save imported', 'good');
                    refresh();
                  } else {
                    toast('That file is not a Hoops Elite save', 'bad');
                  }
                };
                picker.click();
              },
            },
            'Import save',
          ),
          el(
            'button',
            {
              class: 'btn sm danger',
              onclick: () =>
                confirmDialog('Reset everything?', 'Every build, unlock and rank on this device will be erased.', () => {
                  localStorage.removeItem('hoops-elite.profile.v1');
                  location.reload();
                }),
            },
            'Reset progress',
          ),
        ),
      ),

      panel(
        'About',
        el('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Hoops Elite is an original basketball game. Every team, player, court, logo and animation in it was created for this project — there are no third-party league, club or player likenesses anywhere in the build.'),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Simulation rate'), el('span', { class: 'v' }, '120 Hz fixed')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Mode'), el('span', { class: 'v' }, 'Single player vs CPU')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Monetisation'), el('span', { class: 'v' }, 'Cosmetic only')),
      ),
    ),
  );
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  return el(
    'button',
    { class: 'kv', style: 'width:100%;text-align:left', onclick: () => onChange(!value) },
    el('span', { class: 'k' }, label),
    el(
      'span',
      {
        class: 'pill',
        style: value ? 'background:rgba(62,240,122,.16);color:var(--green)' : '',
      },
      value ? 'On' : 'Off',
    ),
  );
}

/**
 * Changing your username.
 *
 * The cooldown is enforced here and stated up front rather than discovered on
 * submit — a field you are allowed to type in and then refused is worse than one
 * that tells you when it will open.
 */
function usernameEditor(): HTMLElement {
  const profile = store.profile;
  const now = Date.now();
  const left = usernameCooldownLeft(profile.usernameChangedAt, now);
  const locked = left > 0;

  const input = el('input', {
    type: 'text',
    value: profile.username,
    maxlength: String(USERNAME_MAX),
    spellcheck: 'false',
    disabled: locked,
    style: 'width:100%',
  }) as HTMLInputElement;

  const message = el(
    'div',
    { class: 'hint', style: 'margin:8px 0 0' },
    locked ? `Locked for another ${formatCooldown(left)}.` : 'Available now.',
  );

  const save = el(
    'button',
    { class: 'btn sm primary', disabled: locked },
    'Change username',
  ) as HTMLButtonElement;

  save.onclick = () => {
    const next = input.value.trim();
    if (next === profile.username) {
      message.textContent = 'That is already your username.';
      return;
    }
    const check = validateUsername(next);
    if (!check.ok) {
      message.textContent = check.reason ?? 'That name will not work';
      message.style.color = 'var(--red)';
      return;
    }
    if (usernameTaken(next, store.accountId)) {
      message.textContent = 'Somebody else on this board already has that one';
      message.style.color = 'var(--red)';
      return;
    }
    store.update((p) => {
      p.username = next;
      p.usernameChangedAt = Date.now();
    });
    toast(`You are now ${next}`, 'good');
    refresh();
  };

  return el(
    'div',
    {},
    el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Username'),
    input,
    el('div', { class: 'row', style: 'gap:8px;margin-top:10px' }, save),
    message,
  );
}
