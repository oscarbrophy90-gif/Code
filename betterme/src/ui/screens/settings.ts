import { ATTRIBUTE_META, CATALOG, dateKey, longDate } from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { confirmDialog, el, fmt, overlay, panel, setReducedMotion, toast } from '../dom.ts';
import { renderSurveyEditor } from './onboarding.ts';

/** Settings, plus the honest small print about what this app is and is not. */

export function renderSettings(): HTMLElement {
  const profile = store.profile;
  if (!profile) return el('div', {});

  return el(
    'div',
    { class: 'screen settings' },
    el('h1', {}, 'Settings'),

    panel(
      'Your answers',
      el('p', { class: 'dim' }, `Set up ${longDate(dateKey(profile.createdAt))}. Focus: ${profile.traits.focus.map((f) => ATTRIBUTE_META[f].label).join(', ') || 'none set'}.`),
      el('button', { class: 'btn primary wide', onclick: openEditor }, 'Retake the survey'),
      el('p', { class: 'dim small' }, 'Ratings are re-derived from your answers. Earned XP, levels, streaks and badges are untouched.'),
    ),

    panel(
      'App',
      toggleRow('Reduced motion', 'Turns off confetti, count-ups and scene animations.', profile.settings.reducedMotion, (value) => {
        store.setSetting('reducedMotion', value);
        setReducedMotion(value);
      }),
      toggleRow('Day summary hour', '', false, null, `${profile.settings.dayEndsAtHour}:00`),
    ),

    panel(
      'Your data',
      el('p', { class: 'dim' }, 'Everything lives on this device, in this browser. There is no account and no server — which also means clearing your browser data deletes it, so export a backup if it matters to you.'),
      el('div', { class: 'row gap' }, el('button', { class: 'btn ghost grow', onclick: exportData }, 'Export backup'), el('button', { class: 'btn ghost grow', onclick: importData }, 'Import backup')),
      el(
        'button',
        {
          class: 'btn danger wide',
          onclick: () =>
            confirmDialog(
              'Delete everything?',
              'Your card, streak, history and badges are all erased and you start again from the survey. This cannot be undone.',
              'Delete it all',
              () => {
                store.reset();
                toast('Profile deleted.', 'info');
              },
            ),
        },
        'Delete profile',
      ),
    ),

    panel(
      'About',
      el('p', {}, el('b', {}, 'BetterMe'), ' — you don’t level up a character, you level up yourself.'),
      el(
        'div',
        { class: 'kv-list' },
        row('Activities in the catalogue', String(CATALOG.length)),
        row('Activities completed', fmt(profile.stats.activitiesCompleted)),
        row('Total XP', fmt(profile.totalXp)),
        row('Days active', String(profile.stats.daysActive)),
      ),
      el(
        'p',
        { class: 'dim small' },
        'BetterMe is a motivation game, not a coach, doctor or therapist. Activities are scaled to the age and limits you entered — but you know your body and your life better than an app does. Skip or swap anything that is not right for you today, and talk to a professional about anything medical.',
      ),
    ),
  );
}

function openEditor(): void {
  const profile = store.profile;
  if (!profile) return;
  overlay((close) =>
    renderSurveyEditor(
      profile.survey,
      (answers) => {
        store.updateSurvey(answers);
        close();
        toast('Answers saved. Tomorrow’s plan uses them.', 'good');
      },
      close,
    ),
  );
}

function toggleRow(label: string, hint: string, value: boolean, onChange: ((value: boolean) => void) | null, readout?: string): HTMLElement {
  const button = el('button', { class: `switch ${value ? 'on' : ''}`, role: 'switch', 'aria-checked': value, disabled: !onChange }, el('i', {}));
  if (onChange) {
    button.addEventListener('click', () => {
      const next = !button.classList.contains('on');
      button.classList.toggle('on', next);
      button.setAttribute('aria-checked', String(next));
      onChange(next);
    });
  }
  return el(
    'div',
    { class: 'setting-row' },
    el('div', { class: 'grow' }, el('b', {}, label), hint ? el('p', { class: 'dim small' }, hint) : null),
    readout ? el('span', { class: 'dim' }, readout) : button,
  );
}

function row(key: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, el('span', { class: 'dim' }, key), el('b', {}, value));
}

function exportData(): void {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `betterme-backup-${store.today}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup downloaded.', 'good');
}

function importData(): void {
  const input = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ok = store.importJson(text);
    toast(ok ? 'Backup restored.' : 'That file could not be read as a BetterMe backup.', ok ? 'good' : 'bad');
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}
