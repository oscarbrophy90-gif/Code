/**
 * Home. A greeting, three counts that are actually counted, and today's list —
 * which is a real list: type, add, tick, rename, delete, all saved per account.
 */

import type { PublicAccount } from '../core/auth.ts';
import {
  addTask,
  clearDoneTasks,
  completedToday,
  notes,
  removeTask,
  renameTask,
  tasks,
  toggleTask,
} from '../core/data.ts';
import { navigate } from '../core/router.ts';
import { clear, el, greeting, icon, ICONS } from '../ui/dom.ts';
import { promptDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { avatarNode, card, emptyState, sectionTitle } from '../ui/shell.ts';
import { play } from '../ui/sound.ts';
import { toast } from '../ui/toast.ts';

export function homeScreen(user: PublicAccount): Screen {
  const list = el('div', { class: 'tasklist' });
  const stats = el('div', { class: 'stats' });

  const input = el('input', {
    class: 'quickadd__input',
    type: 'text',
    placeholder: 'Add something for today…',
    'aria-label': 'Add a task',
    maxlength: 140,
    autocomplete: 'off',
    onkeydown: (event) => {
      if ((event as KeyboardEvent).key === 'Enter') add();
    },
  }) as HTMLInputElement;

  function add(): void {
    const created = addTask(user.id, input.value);
    if (!created) {
      input.focus();
      return;
    }
    input.value = '';
    input.focus();
    refresh();
  }

  function refresh(): void {
    const all = tasks(user.id);
    const open = all.filter((t) => !t.done);
    const done = all.filter((t) => t.done);

    drawStats(all.length - done.length, completedToday(user.id), notes(user.id).length);

    clear(list);
    if (all.length === 0) {
      list.appendChild(
        emptyState({
          iconPath: ICONS.check,
          title: 'Nothing on today',
          message: 'Add the first thing above and it will be here when you come back.',
        }),
      );
      return;
    }

    for (const task of [...open, ...done]) {
      const label = el('span', { class: 'task__title' }, task.title);

      list.appendChild(
        el(
          'div',
          { class: `task${task.done ? ' task--done' : ''}` },
          el(
            'button',
            {
              type: 'button',
              class: 'task__check',
              role: 'checkbox',
              'aria-checked': String(task.done),
              'aria-label': task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`,
              onclick: () => {
                toggleTask(user.id, task.id);
                if (!task.done) play('done');
                refresh();
              },
            },
            icon(ICONS.check, 16),
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'task__body',
              'aria-label': `Rename "${task.title}"`,
              onclick: async () => {
                const next = await promptDialog({
                  title: 'Rename task',
                  label: 'Task',
                  value: task.title,
                  maxlength: 140,
                });
                if (next === null || !next.trim()) return;
                renameTask(user.id, task.id, next);
                refresh();
              },
            },
            label,
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'task__remove',
              'aria-label': `Delete "${task.title}"`,
              onclick: () => {
                removeTask(user.id, task.id);
                toast('Task deleted.');
                refresh();
              },
            },
            icon(ICONS.trash, 18),
          ),
        ),
      );
    }

    if (done.length > 0) {
      list.appendChild(
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost btn--small',
            onclick: () => {
              const removed = clearDoneTasks(user.id);
              toast(`Cleared ${removed} finished ${removed === 1 ? 'task' : 'tasks'}.`, 'good');
              refresh();
            },
          },
          `Clear ${done.length} finished`,
        ),
      );
    }
  }

  function drawStats(open: number, doneToday: number, noteCount: number): void {
    clear(stats);
    const cells: [string, number, string][] = [
      ['Open', open, ICONS.spark],
      ['Done today', doneToday, ICONS.check],
      ['Notes', noteCount, ICONS.note],
    ];
    for (const [label, value, path] of cells) {
      stats.appendChild(
        el(
          'div',
          { class: 'stat' },
          el('span', { class: 'stat__icon' }, icon(path, 18)),
          el('span', { class: 'stat__value' }, String(value)),
          el('span', { class: 'stat__label' }, label),
        ),
      );
    }
  }

  const content = el(
    'div',
    { class: 'page' },
    el(
      'header',
      { class: 'hero' },
      el(
        'button',
        {
          type: 'button',
          class: 'hero__avatar',
          'aria-label': 'Your profile',
          onclick: () => navigate({ name: 'you' }),
        },
        avatarNode(user, 48),
      ),
      el(
        'div',
        { class: 'hero__text' },
        el('p', { class: 'hero__greeting' }, `${greeting()},`),
        el('h1', { class: 'hero__name' }, user.name.split(' ')[0]),
      ),
    ),
    stats,
    card(
      sectionTitle('Today'),
      el(
        'div',
        { class: 'quickadd' },
        input,
        el(
          'button',
          { type: 'button', class: 'quickadd__go', 'aria-label': 'Add task', onclick: add },
          icon(ICONS.plus, 20),
        ),
      ),
      list,
    ),
    card(
      sectionTitle('Jump to'),
      el(
        'div',
        { class: 'jump' },
        jumpTile('Notes', ICONS.note, () => navigate({ name: 'notes' })),
        jumpTile('Profile', ICONS.user, () => navigate({ name: 'you' })),
        jumpTile('Settings', ICONS.cog, () => navigate({ name: 'settings' })),
        jumpTile('Security', ICONS.shield, () => navigate({ name: 'security' })),
      ),
    ),
  );

  refresh();

  return { content, title: 'Home', tab: 'home' };
}

function jumpTile(label: string, path: string, onClick: () => void): HTMLElement {
  return el(
    'button',
    { type: 'button', class: 'jump__tile', onclick: onClick },
    icon(path, 22),
    el('span', {}, label),
  );
}
