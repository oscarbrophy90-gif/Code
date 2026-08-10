/** Change the password, set a recovery question, or delete the account outright. */

import type { PublicAccount } from '../core/auth.ts';
import { changePassword, deleteAccount, setRecovery, signOut } from '../core/auth.ts';
import { forgetUser } from '../core/data.ts';
import { usingNativeCrypto } from '../core/hash.ts';
import { navigate } from '../core/router.ts';
import { checkConfirm, checkPassword, passwordStrength } from '../core/validate.ts';
import { el, icon, ICONS } from '../ui/dom.ts';
import { field, strengthMeter } from '../ui/field.ts';
import { banner, submitButton } from '../ui/form.ts';
import { confirmDialog } from '../ui/modal.ts';
import type { Screen } from '../ui/shell.ts';
import { card, sectionTitle } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

const QUESTIONS = [
  'What was the name of your first pet?',
  'What street did you grow up on?',
  'What was your first job?',
  'Where did you go on your first holiday?',
  'What is your oldest cousin’s first name?',
];

export function securityScreen(user: PublicAccount, rerender: () => void): Screen {
  const content = el(
    'div',
    { class: 'page' },
    passwordCard(),
    recoveryCard(user, rerender),
    dangerCard(user),
    el(
      'p',
      { class: 'page__foot' },
      usingNativeCrypto
        ? 'Passwords are salted and stretched with PBKDF2-SHA-256 (210,000 rounds) by your browser’s crypto engine. The password itself is never stored.'
        : 'This browser has no Web Crypto in the current context, so Acendri OS is using its own PBKDF2-SHA-256 (25,000 rounds). Slower, and still no password stored.',
    ),
  );

  return { content, title: 'Security', back: { name: 'you' }, tab: 'you' };
}

// ------------------------------------------------------------------ password

function passwordCard(): HTMLElement {
  const alert = banner();
  const meter = strengthMeter();
  const button = submitButton('Change password');

  const current = field({
    label: 'Current password',
    type: 'password',
    autocomplete: 'current-password',
    onEnter: () => next.input.focus(),
  });

  const next = field({
    label: 'New password',
    type: 'password',
    autocomplete: 'new-password',
    validate: checkPassword,
    onInput: (value) => {
      const { score, label, hint } = passwordStrength(value);
      meter.update(score, label, hint);
      meter.root.hidden = value === '';
    },
    onEnter: () => confirm.input.focus(),
  });

  const confirm = field({
    label: 'Confirm new password',
    type: 'password',
    autocomplete: 'new-password',
    validate: (value) => checkConfirm(next.value(), value),
    onEnter: () => void submit(),
  });

  meter.root.hidden = true;

  async function submit(): Promise<void> {
    alert.hide();
    const ok = [
      current.setError(current.value() ? null : 'Enter your current password.'),
      next.setError(checkPassword(next.value())),
      confirm.setError(checkConfirm(next.value(), confirm.value())),
    ];
    if (ok.some((clean) => !clean)) return;

    button.setBusy(true, 'Updating…');
    const result = await changePassword(current.value(), next.value(), button.setProgress);
    button.setBusy(false);

    if (!result.ok) {
      alert.show(result.error);
      if (result.field === 'password') current.setError(result.error);
      if (result.field === 'confirm') confirm.setError(result.error);
      return;
    }

    current.clear();
    next.clear();
    confirm.clear();
    meter.root.hidden = true;
    alert.show('Password changed. You are still signed in here.', 'good');
    toast('Password changed.', 'good');
  }

  return card(
    sectionTitle('Password'),
    el(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: (event) => {
          event.preventDefault();
          void submit();
        },
      },
      alert.node,
      current.root,
      next.root,
      meter.root,
      confirm.root,
      button.node,
    ),
  );
}

// ------------------------------------------------------------------ recovery

function recoveryCard(user: PublicAccount, rerender: () => void): HTMLElement {
  const alert = banner();
  const button = submitButton(user.hasRecovery ? 'Update recovery answer' : 'Set recovery question');
  let chosen = QUESTIONS[0];

  const picker = el(
    'select',
    {
      class: 'field__input',
      'aria-label': 'Recovery question',
      onchange: (event) => (chosen = (event.target as HTMLSelectElement).value),
    },
    ...QUESTIONS.map((question) => el('option', { value: question }, question)),
  ) as HTMLSelectElement;

  const answer = field({
    label: 'Your answer',
    hint: 'Capitals and extra spaces are ignored when you use it.',
    onEnter: () => void submit(),
  });

  async function submit(): Promise<void> {
    alert.hide();
    if (!answer.setError(answer.value().trim().length >= 2 ? null : 'Give a longer answer.')) return;

    button.setBusy(true, 'Saving…');
    const result = await setRecovery(chosen, answer.value(), button.setProgress);
    button.setBusy(false);

    if (!result.ok) {
      alert.show(result.error);
      return;
    }
    answer.clear();
    toast('Recovery question saved.', 'good');
    rerender();
  }

  return card(
    sectionTitle('Account recovery'),
    el(
      'p',
      { class: 'card__note' },
      user.hasRecovery
        ? 'A recovery question is set. Answer it on the sign-in screen to choose a new password.'
        : 'There is no server to email a reset link, so set a question only you can answer. Without one, a forgotten password cannot be recovered.',
    ),
    el(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: (event) => {
          event.preventDefault();
          void submit();
        },
      },
      alert.node,
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Question'), el('div', { class: 'field__box' }, picker)),
      answer.root,
      button.node,
    ),
  );
}

// -------------------------------------------------------------------- danger

function dangerCard(user: PublicAccount): HTMLElement {
  const alert = banner();
  const button = submitButton('Delete my account', 'btn--danger');

  const password = field({
    label: 'Confirm with your password',
    type: 'password',
    autocomplete: 'current-password',
    onEnter: () => void submit(),
  });

  async function submit(): Promise<void> {
    alert.hide();
    if (!password.setError(password.value() ? null : 'Enter your password.')) return;

    const sure = await confirmDialog({
      title: 'Delete your account?',
      message: `Everything filed under ${user.emailTyped} — notes, tasks, settings — is deleted from this device. This cannot be undone.`,
      confirmLabel: 'Delete account',
      danger: true,
      typeToConfirm: 'DELETE',
    });
    if (!sure) return;

    button.setBusy(true, 'Deleting…');
    const result = await deleteAccount(password.value(), button.setProgress);
    button.setBusy(false);

    if (!result.ok) {
      alert.show(result.error);
      password.setError(result.error);
      return;
    }

    // The account row is gone; take its content with it.
    forgetUser(user.id);
    signOut();
    toast('Account deleted.');
    navigate({ name: 'welcome' }, { replace: true });
  }

  return card(
    sectionTitle('Delete account'),
    el(
      'div',
      { class: 'callout callout--danger' },
      icon(ICONS.trash, 20),
      el('span', {}, 'This removes the account and everything in it from this device.'),
    ),
    el(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: (event) => {
          event.preventDefault();
          void submit();
        },
      },
      alert.node,
      password.root,
      button.node,
    ),
  );
}
