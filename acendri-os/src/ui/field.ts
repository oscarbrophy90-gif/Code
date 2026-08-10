/**
 * One text field, with the label, the error line and the show/hide toggle that
 * every form in the app needs. Built once here so sign-in, sign-up, settings
 * and recovery all behave the same way and none of them can forget the
 * accessibility wiring.
 */

import type { FieldError } from '../core/validate.ts';
import { el, icon, ICONS } from './dom.ts';

let sequence = 0;

export type Field = {
  root: HTMLElement;
  input: HTMLInputElement;
  /** Shows or clears the message under the field. Returns true when clean. */
  setError: (message: FieldError) => boolean;
  value: () => string;
  clear: () => void;
};

export type FieldOptions = {
  label: string;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  autocomplete?: string;
  value?: string;
  hint?: string;
  inputmode?: string;
  maxlength?: number;
  /** Runs on blur and on submit; the form decides when to call it. */
  validate?: (value: string) => FieldError;
  onInput?: (value: string) => void;
  onEnter?: () => void;
};

export function field(options: FieldOptions): Field {
  const id = `f${++sequence}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const isPassword = options.type === 'password';

  const input = el('input', {
    id,
    class: 'field__input',
    type: options.type ?? 'text',
    placeholder: options.placeholder ?? ' ',
    autocomplete: options.autocomplete ?? 'off',
    autocapitalize: options.type === 'email' ? 'off' : 'sentences',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: options.inputmode ?? (options.type === 'email' ? 'email' : undefined),
    maxlength: options.maxlength,
    value: options.value ?? '',
    'aria-describedby': options.hint ? hintId : undefined,
  }) as HTMLInputElement;

  const error = el('p', { class: 'field__error', id: errorId, role: 'alert' });
  const hint = options.hint ? el('p', { class: 'field__hint', id: hintId }, options.hint) : null;

  let reveal: HTMLButtonElement | null = null;
  if (isPassword) {
    reveal = el('button', {
      type: 'button',
      class: 'field__reveal',
      'aria-label': 'Show password',
      'aria-pressed': 'false',
      onclick: () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        reveal!.setAttribute('aria-pressed', String(!showing));
        reveal!.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        reveal!.replaceChildren(icon(showing ? ICONS.eye : ICONS.eyeOff, 20));
        // Toggling `type` drops the caret to the start in some browsers.
        const end = input.value.length;
        input.focus();
        input.setSelectionRange?.(end, end);
      },
    }) as HTMLButtonElement;
    reveal.appendChild(icon(ICONS.eye, 20));
  }

  function setError(message: FieldError): boolean {
    error.textContent = message ?? '';
    root.classList.toggle('field--bad', Boolean(message));
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorId);
    } else {
      input.removeAttribute('aria-invalid');
      if (options.hint) input.setAttribute('aria-describedby', hintId);
      else input.removeAttribute('aria-describedby');
    }
    return message === null;
  }

  input.addEventListener('input', () => {
    // Clear the complaint the moment they start fixing it; re-check on blur.
    if (root.classList.contains('field--bad')) setError(null);
    options.onInput?.(input.value);
  });

  input.addEventListener('blur', () => {
    if (options.validate && input.value !== '') setError(options.validate(input.value));
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && options.onEnter) {
      event.preventDefault();
      options.onEnter();
    }
  });

  const root = el(
    'div',
    { class: `field${isPassword ? ' field--password' : ''}` },
    el('label', { class: 'field__label', for: id }, options.label),
    el('div', { class: 'field__box' }, input, reveal),
    hint,
    error,
  );

  return {
    root,
    input,
    setError,
    value: () => input.value,
    clear: () => {
      input.value = '';
      setError(null);
    },
  };
}

/** The four-bar meter under the new-password field. */
export function strengthMeter(): {
  root: HTMLElement;
  update: (score: number, label: string, hint: string | null) => void;
} {
  const bars = [0, 1, 2, 3].map(() => el('span', { class: 'meter__bar' }));
  const text = el('span', { class: 'meter__label' });
  const root = el(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    el('div', { class: 'meter__bars' }, bars),
    text,
  );

  return {
    root,
    update(score, label, hint) {
      root.dataset.score = String(score);
      bars.forEach((bar, index) => bar.classList.toggle('meter__bar--on', index < score));
      text.textContent = hint ? `${label} — ${hint}` : label;
    },
  };
}
