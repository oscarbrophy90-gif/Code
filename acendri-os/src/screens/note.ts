/**
 * The note editor. Saves as you type — debounced, so a long note is not a
 * write per keystroke — and again on the way out, because a phone can kill a
 * tab without warning.
 */

import type { PublicAccount } from '../core/auth.ts';
import { dropIfBlank, note as loadNote, removeNote, saveNote } from '../core/data.ts';
import type { Route } from '../core/router.ts';
import { navigate } from '../core/router.ts';
import { el, focusSoon, icon, ICONS, relativeTime } from '../ui/dom.ts';
import { confirmDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { emptyState } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

const SAVE_DELAY = 400;

export function noteScreen(user: PublicAccount, route: Extract<Route, { name: 'note' }>): Screen {
  const existing = loadNote(user.id, route.id);

  if (!existing) {
    return {
      content: el(
        'div',
        { class: 'page' },
        emptyState({
          iconPath: ICONS.note,
          title: 'That note is gone',
          message: 'It may have been deleted from another tab.',
          action: el(
            'button',
            { type: 'button', class: 'btn btn--primary', onclick: () => navigate({ name: 'notes' }, { replace: true }) },
            'Back to notes',
          ),
        }),
      ),
      title: 'Note',
      back: { name: 'notes' },
      tab: 'notes',
    };
  }

  const status = el('span', { class: 'editor__status' }, `Edited ${relativeTime(existing.updatedAt)}`);
  let pinned = existing.pinned;
  let timer: number | undefined;

  const title = el('input', {
    class: 'editor__title',
    type: 'text',
    placeholder: 'Title',
    value: existing.title,
    maxlength: 120,
    'aria-label': 'Note title',
    oninput: () => queueSave(),
    onkeydown: (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        event.preventDefault();
        body.focus();
      }
    },
  }) as HTMLInputElement;

  const body = el('textarea', {
    class: 'editor__body',
    placeholder: 'Start writing…',
    'aria-label': 'Note text',
    oninput: () => queueSave(),
  }) as HTMLTextAreaElement;
  body.value = existing.body;

  function commit(): void {
    window.clearTimeout(timer);
    saveNote(user.id, route.id, { title: title.value, body: body.value, pinned });
    status.textContent = 'Saved just now';
  }

  function queueSave(): void {
    status.textContent = 'Saving…';
    window.clearTimeout(timer);
    timer = window.setTimeout(commit, SAVE_DELAY);
  }

  // A phone can background and kill the tab without a beforeunload; this event
  // is the one that reliably fires first.
  const onHide = () => {
    if (document.visibilityState === 'hidden') commit();
  };
  document.addEventListener('visibilitychange', onHide);

  const pinButton = el(
    'button',
    {
      type: 'button',
      class: `iconbtn${pinned ? ' iconbtn--on' : ''}`,
      'aria-label': pinned ? 'Unpin note' : 'Pin note',
      'aria-pressed': String(pinned),
      onclick: () => {
        pinned = !pinned;
        pinButton.classList.toggle('iconbtn--on', pinned);
        pinButton.setAttribute('aria-pressed', String(pinned));
        pinButton.setAttribute('aria-label', pinned ? 'Unpin note' : 'Pin note');
        commit();
        toast(pinned ? 'Pinned to the top.' : 'Unpinned.');
      },
    },
    icon(ICONS.spark, 20),
  );

  const deleteButton = el(
    'button',
    {
      type: 'button',
      class: 'iconbtn iconbtn--danger',
      'aria-label': 'Delete note',
      onclick: async () => {
        const sure = await confirmDialog({
          title: 'Delete this note?',
          message: 'It is removed from this device. This cannot be undone.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!sure) return;
        window.clearTimeout(timer);
        removeNote(user.id, route.id);
        document.removeEventListener('visibilitychange', onHide);
        toast('Note deleted.');
        navigate({ name: 'notes' }, { replace: true });
      },
    },
    icon(ICONS.trash, 20),
  );

  const content = el(
    'div',
    { class: 'page page--editor' },
    el('div', { class: 'editor' }, title, body, status),
  );

  // Leaving the editor is the last chance to write, and an untouched blank note
  // should not clutter the list.
  content.addEventListener('acendri:teardown', () => {
    commit();
    document.removeEventListener('visibilitychange', onHide);
    dropIfBlank(user.id, route.id);
  });

  focusSoon(existing.title || existing.body ? body : title);

  return {
    content,
    title: 'Note',
    back: { name: 'notes' },
    tab: 'notes',
    actions: [pinButton, deleteButton],
  };
}
