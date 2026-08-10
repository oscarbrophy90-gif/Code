/** The notes list: search, pin, open, delete. New notes open straight into the editor. */

import type { PublicAccount } from '../core/auth.ts';
import { createNote, preview, removeNote, saveNote, searchNotes } from '../core/data.ts';
import { navigate } from '../core/router.ts';
import { clear, el, icon, ICONS, relativeTime } from '../ui/dom.ts';
import { confirmDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { emptyState } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

export function notesScreen(user: PublicAccount): Screen {
  const list = el('div', { class: 'notelist' });
  let query = '';

  const search = el('input', {
    class: 'search__input',
    type: 'search',
    placeholder: 'Search notes',
    'aria-label': 'Search notes',
    autocomplete: 'off',
    oninput: (event) => {
      query = (event.target as HTMLInputElement).value;
      refresh();
    },
  }) as HTMLInputElement;

  function refresh(): void {
    const found = searchNotes(user.id, query);
    clear(list);

    if (found.length === 0) {
      list.appendChild(
        query
          ? emptyState({
              iconPath: ICONS.search,
              title: 'Nothing matched',
              message: `No note mentions “${query}”.`,
            })
          : emptyState({
              iconPath: ICONS.note,
              title: 'No notes yet',
              message: 'Notes are stored on this device, under your account.',
              action: el(
                'button',
                { type: 'button', class: 'btn btn--primary', onclick: startNote },
                'Write your first note',
              ),
            }),
      );
      return;
    }

    for (const note of found) {
      list.appendChild(
        el(
          'article',
          { class: `notecard${note.pinned ? ' notecard--pinned' : ''}` },
          el(
            'button',
            {
              type: 'button',
              class: 'notecard__open',
              onclick: () => navigate({ name: 'note', id: note.id }),
            },
            el('h3', { class: 'notecard__title' }, note.title.trim() || 'Untitled note'),
            el('p', { class: 'notecard__preview' }, preview(note)),
            el('p', { class: 'notecard__meta' }, `Edited ${relativeTime(note.updatedAt)}`),
          ),
          el(
            'div',
            { class: 'notecard__tools' },
            el(
              'button',
              {
                type: 'button',
                class: `iconbtn${note.pinned ? ' iconbtn--on' : ''}`,
                'aria-label': note.pinned ? 'Unpin note' : 'Pin note',
                'aria-pressed': String(note.pinned),
                onclick: () => {
                  saveNote(user.id, note.id, { pinned: !note.pinned });
                  refresh();
                },
              },
              icon(ICONS.spark, 18),
            ),
            el(
              'button',
              {
                type: 'button',
                class: 'iconbtn iconbtn--danger',
                'aria-label': `Delete note "${note.title || 'Untitled'}"`,
                onclick: async () => {
                  const sure = await confirmDialog({
                    title: 'Delete this note?',
                    message: 'It is removed from this device. This cannot be undone.',
                    confirmLabel: 'Delete',
                    danger: true,
                  });
                  if (!sure) return;
                  removeNote(user.id, note.id);
                  toast('Note deleted.');
                  refresh();
                },
              },
              icon(ICONS.trash, 18),
            ),
          ),
        ),
      );
    }
  }

  function startNote(): void {
    const fresh = createNote(user.id);
    navigate({ name: 'note', id: fresh.id });
  }

  const content = el(
    'div',
    { class: 'page' },
    el('div', { class: 'search' }, icon(ICONS.search, 18), search),
    list,
  );

  refresh();

  return {
    content,
    title: 'Notes',
    tab: 'notes',
    actions: [
      el(
        'button',
        { type: 'button', class: 'iconbtn iconbtn--accent', 'aria-label': 'New note', onclick: startNote },
        icon(ICONS.plus, 22),
      ),
    ],
  };
}
