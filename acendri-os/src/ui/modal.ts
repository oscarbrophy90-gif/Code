/**
 * Confirmations and small prompts, on top of the native <dialog> element so the
 * browser handles the backdrop, Escape, and trapping focus for us.
 */

import { el, focusSoon } from './dom.ts';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button as a destructive action. */
  danger?: boolean;
  /** When set, the confirm button stays disabled until this is typed exactly. */
  typeToConfirm?: string;
};

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer: boolean) => {
      if (settled) return;
      settled = true;
      resolve(answer);
      dialog.close();
      // Give the closing transition a moment before the node goes away.
      window.setTimeout(() => dialog.remove(), 200);
    };

    const confirm = el(
      'button',
      {
        type: 'button',
        class: `btn ${options.danger ? 'btn--danger' : 'btn--primary'}`,
        onclick: () => finish(true),
      },
      options.confirmLabel ?? 'Confirm',
    ) as HTMLButtonElement;

    let gate: HTMLElement | null = null;
    if (options.typeToConfirm) {
      confirm.disabled = true;
      const input = el('input', {
        class: 'field__input',
        type: 'text',
        autocomplete: 'off',
        placeholder: options.typeToConfirm,
        'aria-label': `Type ${options.typeToConfirm} to confirm`,
        oninput: (event) => {
          const value = (event.target as HTMLInputElement).value.trim();
          confirm.disabled = value !== options.typeToConfirm;
        },
      }) as HTMLInputElement;
      gate = el(
        'div',
        { class: 'field' },
        el('label', { class: 'field__label' }, `Type “${options.typeToConfirm}” to confirm`),
        el('div', { class: 'field__box' }, input),
      );
    }

    const cancel = el(
      'button',
      { type: 'button', class: 'btn btn--ghost', onclick: () => finish(false) },
      options.cancelLabel ?? 'Cancel',
    );

    const dialog = el(
      'dialog',
      {
        class: 'sheet',
        onclose: () => finish(false),
        // Clicking the backdrop lands on the <dialog> itself, not its contents.
        onclick: (event) => {
          if (event.target === dialog) finish(false);
        },
      },
      el(
        'div',
        { class: 'sheet__body' },
        el('h2', { class: 'sheet__title' }, options.title),
        el('p', { class: 'sheet__text' }, options.message),
        gate,
        el('div', { class: 'sheet__actions' }, cancel, confirm),
      ),
    ) as HTMLDialogElement;

    document.body.appendChild(dialog);
    dialog.showModal();
    focusSoon(options.typeToConfirm ? (gate?.querySelector('input') ?? cancel) : (cancel as HTMLElement));
  });
}

/** A single-question prompt, used by the emoji/avatar and rename flows. */
export function promptDialog(options: {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxlength?: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (answer: string | null) => {
      if (settled) return;
      settled = true;
      resolve(answer);
      dialog.close();
      window.setTimeout(() => dialog.remove(), 200);
    };

    const input = el('input', {
      class: 'field__input',
      type: 'text',
      value: options.value ?? '',
      placeholder: options.placeholder ?? '',
      maxlength: options.maxlength,
      autocomplete: 'off',
      onkeydown: (event) => {
        if ((event as KeyboardEvent).key === 'Enter') {
          event.preventDefault();
          finish(input.value);
        }
      },
    }) as HTMLInputElement;

    const dialog = el(
      'dialog',
      {
        class: 'sheet',
        onclose: () => finish(null),
        onclick: (event) => {
          if (event.target === dialog) finish(null);
        },
      },
      el(
        'div',
        { class: 'sheet__body' },
        el('h2', { class: 'sheet__title' }, options.title),
        el(
          'div',
          { class: 'field' },
          el('label', { class: 'field__label' }, options.label),
          el('div', { class: 'field__box' }, input),
        ),
        el(
          'div',
          { class: 'sheet__actions' },
          el('button', { type: 'button', class: 'btn btn--ghost', onclick: () => finish(null) }, 'Cancel'),
          el(
            'button',
            { type: 'button', class: 'btn btn--primary', onclick: () => finish(input.value) },
            options.confirmLabel ?? 'Save',
          ),
        ),
      ),
    ) as HTMLDialogElement;

    document.body.appendChild(dialog);
    dialog.showModal();
    focusSoon(input);
    input.select();
  });
}
