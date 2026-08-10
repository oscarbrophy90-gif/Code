/**
 * Shared form furniture: the submit button that knows it is working, and the
 * error banner that sits above a form when the failure is not about one field.
 */

import { el } from './dom.ts';

export type SubmitButton = {
  node: HTMLButtonElement;
  /**
   * Locks the button and swaps in a spinner. Password hashing takes a moment —
   * longer on the JavaScript fallback — and a button that looks idle invites a
   * second press, which is how you end up with two accounts.
   */
  setBusy: (busy: boolean, label?: string) => void;
  setProgress: (fraction: number) => void;
};

export function submitButton(label: string, kind = 'btn--primary'): SubmitButton {
  const text = el('span', { class: 'btn__label' }, label);
  const spinner = el('span', { class: 'btn__spinner', 'aria-hidden': 'true' });
  const node = el('button', { type: 'submit', class: `btn ${kind} btn--block` }, spinner, text) as
    HTMLButtonElement;

  return {
    node,
    setBusy(busy, busyLabel) {
      node.disabled = busy;
      node.classList.toggle('btn--busy', busy);
      node.setAttribute('aria-busy', String(busy));
      text.textContent = busy ? (busyLabel ?? 'Working…') : label;
      if (!busy) node.style.removeProperty('--progress');
    },
    setProgress(fraction) {
      node.style.setProperty('--progress', `${Math.round(fraction * 100)}%`);
    },
  };
}

export type Banner = {
  node: HTMLElement;
  show: (message: string, kind?: 'bad' | 'good' | 'info') => void;
  hide: () => void;
};

export function banner(): Banner {
  const node = el('div', { class: 'banner', role: 'alert', hidden: true });
  return {
    node,
    show(message, kind = 'bad') {
      node.textContent = message;
      node.className = `banner banner--${kind}`;
      node.hidden = false;
    },
    hide() {
      node.hidden = true;
      node.textContent = '';
    },
  };
}

/**
 * A labelled on/off switch. Used for "remember me" and the settings toggles;
 * it is a real checkbox underneath so the keyboard and screen readers work.
 */
export function toggle(options: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): { node: HTMLElement; input: HTMLInputElement } {
  const input = el('input', {
    type: 'checkbox',
    class: 'switch__input',
    checked: options.checked,
    onchange: (event) => options.onChange((event.target as HTMLInputElement).checked),
  }) as HTMLInputElement;

  const node = el(
    'label',
    { class: 'switch' },
    el(
      'span',
      { class: 'switch__text' },
      el('span', { class: 'switch__label' }, options.label),
      options.description ? el('span', { class: 'switch__hint' }, options.description) : null,
    ),
    input,
    el('span', { class: 'switch__track', 'aria-hidden': 'true' }, el('span', { class: 'switch__knob' })),
  );

  return { node, input };
}
