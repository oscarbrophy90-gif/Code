/** Create an account. Four fields, checked as you go, and you land signed in. */

import { emailIsTaken, signUp } from '../core/auth.ts';
import { navigate } from '../core/router.ts';
import {
  checkConfirm,
  checkEmail,
  checkName,
  checkPassword,
  NAME_MAX,
  passwordStrength,
} from '../core/validate.ts';
import { brandMark } from '../ui/brand.ts';
import { el } from '../ui/dom.ts';
import { field, strengthMeter } from '../ui/field.ts';
import { banner, submitButton, toggle } from '../ui/form.ts';
import type { Screen } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

export function signUpScreen(): Screen {
  const alert = banner();
  const meter = strengthMeter();
  let remember = true;

  const name = field({
    label: 'Your name',
    autocomplete: 'name',
    placeholder: 'Alex Rivera',
    maxlength: NAME_MAX,
    validate: checkName,
    onEnter: () => email.input.focus(),
  });

  const email = field({
    label: 'Email',
    type: 'email',
    autocomplete: 'email',
    placeholder: 'you@example.com',
    validate: (value) => {
      const error = checkEmail(value);
      if (error) return error;
      // Say so at the point of typing rather than after they have filled in
      // two more fields and pressed the button.
      return emailIsTaken(value) ? 'That email already has an account on this device.' : null;
    },
    onEnter: () => password.input.focus(),
  });

  const password = field({
    label: 'Password',
    type: 'password',
    autocomplete: 'new-password',
    hint: 'At least 8 characters. Longer beats complicated.',
    validate: checkPassword,
    onInput: (value) => {
      const { score, label, hint } = passwordStrength(value);
      meter.update(score, label, hint);
      meter.root.hidden = value === '';
    },
    onEnter: () => confirm.input.focus(),
  });

  const confirm = field({
    label: 'Confirm password',
    type: 'password',
    autocomplete: 'new-password',
    validate: (value) => checkConfirm(password.value(), value),
    onEnter: () => submit(),
  });

  meter.root.hidden = true;

  const remembered = toggle({
    label: 'Keep me signed in',
    description: 'Stay signed in on this device for 30 days.',
    checked: true,
    onChange: (value) => (remember = value),
  });

  const button = submitButton('Create account');

  async function submit(): Promise<void> {
    alert.hide();

    // Validate every field before touching the slow path, and land the cursor
    // on the first thing that needs attention.
    const problems = [
      name.setError(checkName(name.value())),
      email.setError(
        checkEmail(email.value()) ??
          (emailIsTaken(email.value()) ? 'That email already has an account on this device.' : null),
      ),
      password.setError(checkPassword(password.value())),
      confirm.setError(checkConfirm(password.value(), confirm.value())),
    ];
    if (problems.some((ok) => !ok)) {
      const firstBad = form.querySelector<HTMLInputElement>('.field--bad input');
      firstBad?.focus();
      return;
    }

    button.setBusy(true, 'Securing your account…');
    const result = await signUp(
      { name: name.value(), email: email.value(), password: password.value(), remember },
      button.setProgress,
    );
    button.setBusy(false);

    if (!result.ok) {
      alert.show(result.error);
      if (result.field === 'name') name.setError(result.error);
      if (result.field === 'email') email.setError(result.error);
      if (result.field === 'password') password.setError(result.error);
      return;
    }

    toast(`Welcome, ${result.account.name.split(' ')[0]}.`, 'good');
    navigate({ name: 'home' }, { replace: true });
  }

  const form = el(
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
    name.root,
    email.root,
    password.root,
    meter.root,
    confirm.root,
    remembered.node,
    button.node,
  ) as HTMLFormElement;

  const content = el(
    'div',
    { class: 'auth' },
    el(
      'div',
      { class: 'auth__head' },
      brandMark(48),
      el('h1', { class: 'auth__title' }, 'Create your account'),
      el('p', { class: 'auth__sub' }, 'It lives on this device. No email to confirm.'),
    ),
    form,
    el(
      'p',
      { class: 'auth__switch' },
      'Already have one? ',
      el(
        'button',
        { type: 'button', class: 'link', onclick: () => navigate({ name: 'signin' }, { replace: true }) },
        'Sign in',
      ),
    ),
  );

  return { content, title: 'Sign up', back: { name: 'welcome' } };
}
