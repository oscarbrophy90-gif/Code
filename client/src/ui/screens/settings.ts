import { REGIONS, type GameSettings, type Region, type ShotMeterStyle } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { net } from '../../net/client.ts';
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
    el('p', { class: 'page-sub' }, 'Presentation and connection options. Nothing here changes gameplay balance — meter style and audio are preference, not advantage.'),

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
        'Audio',
        slider({ label: 'Master', value: Math.round(s.masterVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('masterVolume', v / 100) }),
        slider({ label: 'Effects', value: Math.round(s.sfxVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('sfxVolume', v / 100) }),
        slider({ label: 'Music', value: Math.round(s.musicVolume * 100), min: 0, max: 100, display: (v) => `${v}%`, onInput: (v) => set('musicVolume', v / 100) }),
        el('button', { class: 'btn sm', onclick: () => audio.play('green') }, 'Test sound'),
      ),

      panel(
        'Online',
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Server address'),
        el('input', {
          type: 'text',
          value: s.serverUrl,
          oninput: (e: Event) => set('serverUrl', (e.target as HTMLInputElement).value),
        }),
        el('div', { class: 'faint', style: 'font-size:11px;margin:12px 0 6px' }, 'Region'),
        segmented(
          REGIONS.map((r) => ({ value: r as Region, label: r.toUpperCase() })),
          store.profile.region,
          (v) => {
            store.update((p) => {
              p.region = v;
            });
            refresh();
          },
        ),
        el(
          'div',
          { class: 'row', style: 'margin-top:14px' },
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                void net
                  .connect()
                  .then(() => toast('Connected to the Hoops Elite server', 'good'))
                  .catch((e: Error) => toast(e.message, 'bad'));
              },
            },
            'Test connection',
          ),
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                void net
                  .saveProfile()
                  .then(() => toast('Profile pushed to cloud save', 'good'))
                  .catch((e: Error) => toast(e.message, 'bad'));
              },
            },
            'Upload cloud save',
          ),
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                void net
                  .loadProfile()
                  .then((blob) => {
                    if (!blob) {
                      toast('No cloud save found for this account', 'bad');
                      return;
                    }
                    confirmDialog('Restore cloud save?', 'Your local progress will be replaced by the version stored on the server.', () => {
                      if (store.importBlob(blob)) {
                        toast('Cloud save restored', 'good');
                        refresh();
                      } else {
                        toast('That cloud save could not be read', 'bad');
                      }
                    });
                  })
                  .catch((e: Error) => toast(e.message, 'bad'));
              },
            },
            'Restore cloud save',
          ),
        ),
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
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Netcode'), el('span', { class: 'v' }, 'Server authoritative + client prediction')),
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
