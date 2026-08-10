/** Sign in. The address can be handed in from the welcome screen's account list. */

import { lockoutRemaining, signIn } from '../core/auth.ts';
import type { Route } from '../core/router.ts';
import { navigate } from '../core/router.ts';
import { checkEmail } from '../core/validate.ts';
import { brandMark } from '../ui/brand.ts';
import { el, focusSoon } from '../ui/dom.ts';
import { field } from '../ui/field.ts';
import { banner, submitButton, toggle } from '../ui/form.ts';
import type { Screen } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';

export function signInScreen(route: Extract<Route, { name: 'signin' }>): Screen {
  const alert = banner();
  let remember = true;

  const email = field({
    label: 'Email',
    type: 'email',
    autocomplete: 'username',
    placeholder: 'you@example.com',
    value: route.email ?? '',
    validate: checkEmail,
    onEnter: () => password.input.focus(),
  });

  const password = field({
    label: 'Password',
    type: 'password',
    autocomplete: 'current-password',
    onEnter: () => submit(),
  });

  const remembered = toggle({
    label: 'Keep me signed in',
    description: 'Skip this screen next time on this device.',
    checked: true,
    onChange: (value) => (remember = value),
  });

  const button = submitButton('Sign in');

  /** Counts the lockout down in the button rather than leaving a dead form. */
  let ticker: number | undefined;
  function startCountdown(): void {
    window.clearInterval(ticker);
    ticker = window.setInterval(() => {
      const left = lockoutRemaining(email.value());
      if (left <= 0) {
        window.clearInterval(ticker);
        button.setBusy(false);
        alert.hide();
        return;
      }
      button.setBusy(true, `Locked — ${Math.ceil(left / 1000)}s`);
    }, 250);
  }

  async function submit(): Promise<void> {
    alert.hide();

    const emailOk = email.setError(checkEmail(email.value()));
    const passwordOk = password.setError(password.value() ? null : 'Enter your password.');
    if (!emailOk || !passwordOk) {
      (emailOk ? password.input : email.input).focus();
      return;
    }

    button.setBusy(true, 'Checking…');
    const result = await signIn(
      { email: email.value(), password: password.value(), remember },
      button.setProgress,
    );
    button.setBusy(false);

    if (!result.ok) {
      alert.show(result.error);
      if (result.field === 'email') email.setError(result.error);
      if (result.field === 'password') {
        password.setError(result.error);
        password.input.select();
      }
      if (lockoutRemaining(email.value()) > 0) startCountdown();
      return;
    }

    toast(`Signed in as ${result.account.name}.`, 'good');
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
    email.root,
    password.root,
    el(
      'div',
      { class: 'form__aside' },
      el(
        'button',
        {
          type: 'button',
          class: 'link',
          onclick: () => navigate({ name: 'reset', email: email.value() }),
        },
        'Forgot your password?',
      ),
    ),
    remembered.node,
    button.node,
  );

  // Land on whichever field is still blank.
  focusSoon(route.email ? password.input : email.input);

  const content = el(
    'div',
    { class: 'auth' },
    el(
      'div',
      { class: 'auth__head' },
      brandMark(48),
      el('h1', { class: 'auth__title' }, 'Welcome back'),
      el('p', { class: 'auth__sub' }, 'Sign in to pick up where you left off.'),
    ),
    form,
    el(
      'p',
      { class: 'auth__switch' },
      'New here? ',
      el(
        'button',
        { type: 'button', class: 'link', onclick: () => navigate({ name: 'signup' }, { replace: true }) },
        'Create an account',
      ),
    ),
  );

  return { content, title: 'Sign in', back: { name: 'welcome' } };
}
