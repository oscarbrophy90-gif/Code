import { USERNAME_MAX, USERNAME_MIN, generatePlayerName, validateUsername } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { nameTaken } from '../../state/board.ts';
import { navigate } from '../../main.ts';
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
    // Pre-filled with a generated name, so the fastest path through this screen
    // is pressing Continue. It is saved like any other name and stays put — the
    // one thing a generated identity must not do is change every launch.
    value: generatePlayerName(Date.now()),
    placeholder: 'Pick a username',
    maxlength: String(USERNAME_MAX),
    spellcheck: 'false',
    autofocus: true,
    class: 'username-input',
  }) as HTMLInputElement;

  const message = el('div', { class: 'username-msg' }, '');
  const reroll = el(
    'button',
    {
      class: 'btn sm',
      style: 'margin-top:8px',
      onclick: () => {
        input.value = generatePlayerName(Date.now() + Math.floor(Math.random() * 1e6));
        check();
      },
    },
    'Randomise',
  ) as HTMLButtonElement;
  const submit = el('button', { class: 'btn primary lg' }, 'Continue') as HTMLButtonElement;


  const check = (): boolean => {
    const value = input.value.trim();
    const result = validateUsername(value);
    if (!result.ok) {
      message.textContent = value.length === 0 ? '' : (result.reason ?? '');
      message.style.color = 'var(--red)';
      submit.disabled = true;
      return false;
    }
    // Two people on the same board with the same name is a board nobody can read.
    if (nameTaken(value, store.accountId)) {
      message.textContent = 'Somebody else on this board already has that one';
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
    // Straight off this screen. Re-rendering in place left the form sitting
    // there looking like it had failed, when the name had in fact been saved —
    // going somewhere is how a form says it worked. New accounts have no build
    // yet, so the shell sends them on to the builder from here.
    navigate('home');
  };

  // Validate the pre-filled name straight away, or Continue starts disabled
  // on a name that is perfectly good.
  check();

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
      reroll,
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
