/**
 * Password recovery without a server.
 *
 * There is no reset email to send, so the only honest route back in is the
 * question the account set for itself. An account that never set one cannot be
 * recovered, and this screen says so plainly instead of pretending to send
 * something.
 */

import { recoveryQuestionFor, resetWithRecovery } from '../core/auth.ts';
import type { Route } from '../core/router.ts';
import { navigate } from '../core/router.ts';
import { checkConfirm, checkEmail, checkPassword, passwordStrength } from '../core/validate.ts';
import { brandMark } from '../ui/brand.ts';
import { clear, el, focusSoon, icon, ICONS } from '../ui/dom.ts';
import { field, strengthMeter } from '../ui/field.ts';
import { banner, submitButton } from '../ui/form.ts';
import type { Screen } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

export function resetScreen(route: Extract<Route, { name: 'reset' }>): Screen {
  const stage = el('div', { class: 'auth__stage' });

  const content = el(
    'div',
    { class: 'auth' },
    el(
      'div',
      { class: 'auth__head' },
      brandMark(48),
      el('h1', { class: 'auth__title' }, 'Recover your account'),
      el('p', { class: 'auth__sub' }, 'Answer the question you set, and choose a new password.'),
    ),
    stage,
  );

  askForEmail(route.email ?? '');

  // ------------------------------------------------------------- step one

  function askForEmail(initial: string): void {
    const alert = banner();
    const button = submitButton('Find my account');

    const email = field({
      label: 'Email',
      type: 'email',
      autocomplete: 'username',
      placeholder: 'you@example.com',
      value: initial,
      validate: checkEmail,
      onEnter: () => find(),
    });

    function find(): void {
      alert.hide();
      if (!email.setError(checkEmail(email.value()))) return;

      const question = recoveryQuestionFor(email.value());
      if (!question) {
        // Deliberately not "no such account" — the sign-in form does not leak
        // which addresses exist, and neither should this one.
        alert.show(
          'No recovery question is set for that email on this device. If you know the password, sign in and set one up under Security.',
        );
        return;
      }
      askForAnswer(email.value(), question);
    }

    render(
      el(
        'form',
        {
          class: 'form',
          novalidate: true,
          onsubmit: (event) => {
            event.preventDefault();
            find();
          },
        },
        alert.node,
        email.root,
        button.node,
      ),
    );
    focusSoon(email.input);
  }

  // ------------------------------------------------------------- step two

  function askForAnswer(emailValue: string, question: string): void {
    const alert = banner();
    const meter = strengthMeter();
    const button = submitButton('Reset password and sign in');

    const answer = field({
      label: question,
      placeholder: 'Your answer',
      hint: 'Capitals and extra spaces do not matter.',
      onEnter: () => password.input.focus(),
    });

    const password = field({
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
      validate: (value) => checkConfirm(password.value(), value),
      onEnter: () => void submit(),
    });

    meter.root.hidden = true;

    async function submit(): Promise<void> {
      alert.hide();
      const ok = [
        answer.setError(answer.value().trim() ? null : 'Type your answer.'),
        password.setError(checkPassword(password.value())),
        confirm.setError(checkConfirm(password.value(), confirm.value())),
      ];
      if (ok.some((clean) => !clean)) return;

      button.setBusy(true, 'Checking your answer…');
      const result = await resetWithRecovery(
        emailValue,
        answer.value(),
        password.value(),
        button.setProgress,
      );
      button.setBusy(false);

      if (!result.ok) {
        alert.show(result.error);
        if (result.field === 'answer') answer.setError(result.error);
        if (result.field === 'password') password.setError(result.error);
        return;
      }

      toast('Password changed. You are signed in.', 'good');
      navigate({ name: 'home' }, { replace: true });
    }

    render(
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
        el(
          'div',
          { class: 'callout' },
          icon(ICONS.shield, 20),
          el('span', {}, `Recovering ${emailValue}`),
        ),
        alert.node,
        answer.root,
        password.root,
        meter.root,
        confirm.root,
        button.node,
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost btn--block',
            onclick: () => askForEmail(emailValue),
          },
          'Use a different email',
        ),
      ),
    );
    focusSoon(answer.input);
  }

  function render(node: HTMLElement): void {
    clear(stage);
    stage.appendChild(node);
  }

  return { content, title: 'Recover', back: { name: 'signin' } };
}
