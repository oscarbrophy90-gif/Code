import { USERNAME_MAX, USERNAME_MIN, validateUsername, worldLadder } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { refresh } from '../../main.ts';
import { el } from '../dom.ts';

/**
 * The very first screen.
 *
 * You pick who you are before you pick what you look like, because the username
 * is the account and the build is a thing the account owns — you can have three
 * builds and you are still one person on the ladder. It also means the walkout
 * has a name to put under the build from the first game onwards.
 */
export function renderUsername(): HTMLElement {
  const input = el('input', {
    type: 'text',
    placeholder: 'Pick a username',
    maxlength: String(USERNAME_MAX),
    spellcheck: 'false',
    autofocus: true,
    class: 'username-input',
  }) as HTMLInputElement;

  const message = el('div', { class: 'username-msg' }, '');
  const submit = el('button', { class: 'btn primary lg' }, 'Continue') as HTMLButtonElement;

  // Names already on the ladder are taken. Checking here rather than after
  // submission means you never see your own name twice on the board.
  const taken = new Set(worldLadder().map((p) => p.username.toLowerCase()));

  const check = (): boolean => {
    const value = input.value.trim();
    const result = validateUsername(value);
    if (!result.ok) {
      message.textContent = value.length === 0 ? '' : (result.reason ?? '');
      message.style.color = 'var(--red)';
      submit.disabled = true;
      return false;
    }
    if (taken.has(value.toLowerCase())) {
      message.textContent = 'Somebody on the ladder already has that one';
      message.style.color = 'var(--red)';
      submit.disabled = true;
      return false;
    }
    message.textContent = 'Looks good';
    message.style.color = 'var(--green)';
    submit.disabled = false;
    return true;
  };

  input.oninput = check;
  input.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && check()) commit();
  };
  submit.disabled = true;
  submit.onclick = () => {
    if (check()) commit();
  };

  const commit = () => {
    const value = input.value.trim();
    store.update((p) => {
      p.username = value;
      // Not stamped as a change: your first name is free, and the 30-day clock
      // starts the first time you actually change it.
      p.usernameChangedAt = 0;
      p.displayName = value;
    });
    refresh();
  };

  return el(
    'div',
    { class: 'wrap username-wrap' },
    el(
      'div',
      { class: 'username-card' },
      el('div', { class: 'username-kicker' }, 'WELCOME TO HOOPS ELITE'),
      el('h1', { class: 'username-title' }, 'Create your username'),
      el(
        'p',
        { class: 'username-blurb' },
        'This is the name you go by on the leaderboard, and it sits under your build name every time you walk out. Your builds can change; this stays.',
      ),
      input,
      message,
      el(
        'p',
        { class: 'username-note' },
        `${USERNAME_MIN} to ${USERNAME_MAX} characters — letters, numbers, dots, dashes and underscores. You can change it once every 30 days.`,
      ),
      submit,
    ),
  );
}
