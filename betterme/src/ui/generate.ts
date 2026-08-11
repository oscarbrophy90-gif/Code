import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  currentAttributes,
  extrasLeft,
  MAX_EXTRAS_PER_DAY,
  workoutAvailable,
  type ExtraSection,
} from '../core/index.ts';
import { store } from '../state/store.ts';
import { el, overlay, toast } from './dom.ts';

/**
 * "Generate more" — the sheet where you pick what to work on.
 *
 * Sections are listed weakest-rating first, because the honest answer to "what
 * should I do with this spare hour?" is almost always the number you have been
 * avoiding. The gym option is separated out and put first when you have the kit:
 * it builds a full session, exercise by exercise, not just a card that says
 * "train".
 */
export function openGenerateSheet(): void {
  const profile = store.profile;
  if (!profile) return;

  const left = extrasLeft(profile, store.today);
  if (left <= 0) {
    toast(`That is ${MAX_EXTRAS_PER_DAY} extras today — plenty. Rest counts too.`, 'info');
    return;
  }

  const attributes = currentAttributes(profile);
  const sections = ATTRIBUTE_KEYS.slice().sort((a, b) => attributes[a] - attributes[b]);
  const focus = new Set(profile.traits.focus);

  overlay((close) => {
    const pick = (section: ExtraSection) => {
      const result = store.generateExtra(section);
      close();
      if (!result) {
        toast('Nothing new left in that area today — try another section.', 'bad');
        return;
      }
      toast(result.mode === 'filled' ? `Routine added to “${result.activity.title}”` : `Added: ${result.activity.title}`, 'good');
      if (result.note) setTimeout(() => toast(result.note!, 'info'), 400);
    };

    return el(
      'div',
      { class: 'generate-sheet' },
      el('h2', {}, 'Generate more'),
      el('p', { class: 'dim' }, `Pick an area and BetterMe builds something for your current rating in it. ${left} left today.`),

      workoutAvailable(profile)
        ? el(
            'button',
            { class: 'gen-workout', onclick: () => pick('workout') },
            el('span', { class: 'gen-workout-icon' }, '🏋️'),
            el(
              'span',
              { class: 'grow' },
              el('b', {}, 'Build me a workout'),
              el('em', { class: 'dim' }, 'A full session: warm-up, lifts, sets and reps, cool-down.'),
            ),
            el('span', { class: 'gen-arrow' }, '›'),
          )
        : null,

      el(
        'div',
        { class: 'gen-grid' },
        sections.map((key) => {
          const meta = ATTRIBUTE_META[key];
          return el(
            'button',
            { class: `gen-tile ${focus.has(key) ? 'focus' : ''}`, style: `--accent:${meta.accent}`, onclick: () => pick(key) },
            el('span', { class: 'gen-icon' }, meta.icon),
            el('span', { class: 'gen-name' }, meta.label),
            el('span', { class: 'gen-rating' }, String(attributes[key])),
          );
        }),
      ),

      el('button', { class: 'btn ghost wide', onclick: () => pick('any') }, '🎲 Surprise me — pick my weakest area'),
      el('p', { class: 'dim small center' }, 'Extras pay full XP but never count against your lock-in goal, so generating more can only help.'),
    );
  });
}
