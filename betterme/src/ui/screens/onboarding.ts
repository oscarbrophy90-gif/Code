import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  buildStart,
  computeOverall,
  defaultSurvey,
  normaliseSurvey,
  rankTierFor,
  SURVEY_STEPS,
  validateStep,
  type FieldOption,
  type SurveyAnswers,
  type SurveyField,
  type SurveyStep,
} from '../../core/index.ts';
import { clear, countUp, el, prefersReducedMotion } from '../dom.ts';
import { attributeRadar, attributeRow, overallRing } from '../widgets.ts';

/**
 * Onboarding.
 *
 * Two halves: the survey, rendered generically from `SURVEY_STEPS`, and the
 * reveal — where the answers become a card with a number on it. The reveal is
 * doing real work: it is the moment the app stops being a form and starts being
 * a game, so it counts the Overall up rather than just printing it.
 */

export function renderOnboarding(onComplete: (answers: SurveyAnswers) => void): HTMLElement {
  const answers: SurveyAnswers = defaultSurvey();
  const host = el('div', { class: 'onboarding' });
  let index = -1; // -1 is the intro splash

  const show = () => {
    clear(host);
    if (index < 0) host.appendChild(intro(() => go(1)));
    else if (index < SURVEY_STEPS.length) host.appendChild(stepView(SURVEY_STEPS[index], answers, index, go));
    else host.appendChild(reveal(answers, onComplete));
    host.scrollTop = 0;
  };

  const go = (delta: number) => {
    index = Math.max(-1, Math.min(SURVEY_STEPS.length, index + delta));
    show();
  };

  show();
  return host;
}

function intro(onStart: () => void): HTMLElement {
  return el(
    'div',
    { class: 'intro' },
    el('div', { class: 'intro-mark' }, 'BM'),
    el('h1', {}, 'BetterMe'),
    el('p', { class: 'lead' }, 'You don’t level up a character. You level up yourself.'),
    el(
      'ul',
      { class: 'intro-points' },
      el('li', {}, el('b', {}, 'Real tasks.'), ' Gym, study, sleep, skills — built around your goals, not everyone else’s.'),
      el('li', {}, el('b', {}, 'Real ratings.'), ' Nine attributes and one Overall, exactly like a sports game.'),
      el('li', {}, el('b', {}, 'Real progress.'), ' XP, levels, streaks and achievements, earned by things you actually did.'),
    ),
    el('p', { class: 'dim small' }, 'First, a survey. Answer it honestly — the whole game is built off these answers, and nobody else ever sees them. Everything stays on this device.'),
    el('button', { class: 'btn primary wide', onclick: onStart }, 'Build my player'),
  );
}

function stepView(step: SurveyStep, answers: SurveyAnswers, index: number, go: (delta: number) => void): HTMLElement {
  const total = SURVEY_STEPS.length;
  const error = el('p', { class: 'form-error', role: 'alert' });

  const next = () => {
    const problem = validateStep(step, answers);
    if (problem) {
      error.textContent = problem;
      return;
    }
    error.textContent = '';
    go(1);
  };

  return el(
    'div',
    { class: 'survey-step' },
    el(
      'header',
      { class: 'survey-head' },
      el('div', { class: 'survey-progress' }, el('i', { style: `width:${((index + 1) / total) * 100}%` })),
      el('span', { class: 'step-count dim' }, `Step ${index + 1} of ${total}`),
      el('h2', {}, step.title),
      el('p', { class: 'dim' }, step.blurb),
    ),
    el('div', { class: 'fields' }, step.fields.map((field) => renderField(field, answers))),
    error,
    el(
      'div',
      { class: 'row gap survey-nav' },
      el('button', { class: 'btn ghost', onclick: () => go(-1) }, index === 0 ? 'Back' : 'Back'),
      el('button', { class: 'btn primary grow', onclick: next }, index === total - 1 ? 'Build my card' : 'Continue'),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

function renderField(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  const label = el(
    'div',
    { class: 'field-head' },
    el('label', {}, field.label, field.optional ? el('em', { class: 'dim' }, ' optional') : null),
    field.help ? el('p', { class: 'dim small' }, field.help) : null,
  );
  return el('div', { class: `field field-${field.kind}` }, label, control(field, answers));
}

function control(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  switch (field.kind) {
    case 'text':
      return textInput(field, answers, false);
    case 'textarea':
      return textInput(field, answers, true);
    case 'number':
      return numberInput(field, answers);
    case 'scale':
      return scaleInput(field, answers);
    case 'single':
      return singleInput(field, answers);
    case 'multi':
      return multiInput(field, answers);
  }
}

function setAnswer(answers: SurveyAnswers, key: keyof SurveyAnswers, value: unknown): void {
  (answers as unknown as Record<string, unknown>)[key] = value;
}

function getAnswer(answers: SurveyAnswers, key: keyof SurveyAnswers): unknown {
  return (answers as unknown as Record<string, unknown>)[key];
}

function textInput(field: SurveyField, answers: SurveyAnswers, multiline: boolean): HTMLElement {
  const node = multiline
    ? el('textarea', { class: 'input', rows: 3, placeholder: field.placeholder ?? '' })
    : el('input', { class: 'input', type: 'text', placeholder: field.placeholder ?? '', maxlength: field.max ?? 60 });
  node.value = String(getAnswer(answers, field.key) ?? '');
  node.addEventListener('input', () => setAnswer(answers, field.key, node.value));
  return node;
}

function numberInput(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  const step = field.step ?? 1;
  const readout = el('b', { class: 'number-value' });
  const input = el('input', {
    class: 'input number',
    type: 'number',
    inputmode: 'decimal',
    min: field.min ?? 0,
    max: field.max ?? 100,
    step,
  });

  const sync = (value: number) => {
    const clamped = Math.max(field.min ?? 0, Math.min(field.max ?? 999, value));
    setAnswer(answers, field.key, clamped);
    input.value = String(clamped);
    readout.textContent = `${clamped} ${field.unit ?? ''}`.trim();
  };

  sync(Number(getAnswer(answers, field.key) ?? field.min ?? 0));
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (Number.isFinite(value)) {
      setAnswer(answers, field.key, value);
      readout.textContent = `${value} ${field.unit ?? ''}`.trim();
    }
  });
  input.addEventListener('blur', () => sync(Number(input.value)));

  return el(
    'div',
    { class: 'stepper' },
    el('button', { class: 'btn round', type: 'button', 'aria-label': 'Decrease', onclick: () => sync(Number(input.value) - step) }, '−'),
    el('div', { class: 'stepper-mid' }, input, readout),
    el('button', { class: 'btn round', type: 'button', 'aria-label': 'Increase', onclick: () => sync(Number(input.value) + step) }, '+'),
  );
}

function scaleInput(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  const buttons: HTMLElement[] = [];
  const select = (value: number) => {
    setAnswer(answers, field.key, value);
    buttons.forEach((b, i) => b.classList.toggle('on', i + 1 === value));
  };
  for (let i = 1; i <= 5; i++) {
    const button = el('button', { class: 'scale-dot', type: 'button', 'aria-label': `${i} of 5`, onclick: () => select(i) }, String(i));
    buttons.push(button);
  }
  select(Number(getAnswer(answers, field.key) ?? 3));
  return el(
    'div',
    { class: 'scale' },
    el('div', { class: 'scale-row' }, buttons),
    field.scaleLabels
      ? el('div', { class: 'scale-ends dim small' }, el('span', {}, field.scaleLabels[0]), el('span', {}, field.scaleLabels[1]))
      : null,
  );
}

function optionCard(option: FieldOption, selected: boolean, onClick: () => void): HTMLElement {
  return el(
    'button',
    { class: `option ${selected ? 'on' : ''}`, type: 'button', 'aria-pressed': selected, onclick: onClick },
    option.icon ? el('span', { class: 'option-icon' }, option.icon) : null,
    el('span', { class: 'option-body' }, el('b', {}, option.label), option.hint ? el('em', { class: 'dim' }, option.hint) : null),
    el('span', { class: 'option-check' }, '✓'),
  );
}

function singleInput(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  const host = el('div', { class: 'options' });
  const draw = () => {
    clear(host);
    const current = getAnswer(answers, field.key);
    for (const option of field.options ?? []) {
      host.appendChild(
        optionCard(option, option.value === current, () => {
          setAnswer(answers, field.key, option.value);
          draw();
        }),
      );
    }
  };
  draw();
  return host;
}

function multiInput(field: SurveyField, answers: SurveyAnswers): HTMLElement {
  const host = el('div', { class: 'options grid' });
  const note = el('p', { class: 'dim small' });

  const draw = () => {
    clear(host);
    const current = (getAnswer(answers, field.key) as (string | number | boolean)[]) ?? [];
    for (const option of field.options ?? []) {
      const selected = current.includes(option.value);
      host.appendChild(
        optionCard(option, selected, () => {
          let next = selected ? current.filter((v) => v !== option.value) : [...current, option.value];
          // "Nothing to flag" is exclusive with the real limitations.
          if (!selected && option.value === 'none') next = ['none'];
          else if (!selected) next = next.filter((v) => v !== 'none');
          if (field.maxSelect && next.length > field.maxSelect) next = next.slice(next.length - field.maxSelect);
          setAnswer(answers, field.key, next);
          draw();
        }),
      );
    }
    note.textContent = field.maxSelect ? `${current.length}/${field.maxSelect} selected` : '';
  };

  draw();
  return el('div', {}, host, note);
}

/* ------------------------------------------------------------------ *
 * Reveal
 * ------------------------------------------------------------------ */

function reveal(rawAnswers: SurveyAnswers, onComplete: (answers: SurveyAnswers) => void): HTMLElement {
  const answers = normaliseSurvey(rawAnswers);
  const { traits, attributes } = buildStart(answers);
  const host = el('div', { class: 'reveal' });

  const build = el(
    'div',
    { class: 'building' },
    el('div', { class: 'spinner' }),
    el('h2', {}, 'Building your card'),
    el('p', { class: 'dim' }, 'Reading your answers, setting your starting ratings and writing your first day.'),
  );
  host.appendChild(build);

  const finish = () => {
    clear(host);
    host.appendChild(card());
  };

  if (prefersReducedMotion()) finish();
  else setTimeout(finish, 1500);

  function card(): HTMLElement {
    // The same weighted Overall the profile card will show from here on, so the
    // number never quietly changes after onboarding.
    const focusSet = new Set(traits.focus);
    const finalOverall = computeOverall(attributes, traits.focus);
    const tier = rankTierFor(finalOverall);

    const ring = overallRing(finalOverall, { size: 150 });
    const value = ring.querySelector('.ring-value');
    if (value instanceof HTMLElement) countUp(value, Math.max(25, finalOverall - 14), finalOverall, 1200);

    const sorted = ATTRIBUTE_KEYS.slice().sort((a, b) => attributes[b] - attributes[a]);

    return el(
      'div',
      { class: 'reveal-card' },
      el('span', { class: 'scene-kicker' }, 'YOUR STARTING CARD'),
      ring,
      el('h2', {}, answers.name),
      el('div', { class: 'tier-pill', style: `--tier:${tier.color}` }, tier.label),
      el('p', { class: 'dim' }, tier.blurb),
      attributeRadar(attributes, { size: 260 }),
      el(
        'div',
        { class: 'attr-list' },
        sorted.map((key) => attributeRow(key, attributes[key], { focus: focusSet.has(key) })),
      ),
      el(
        'p',
        { class: 'dim small reveal-note' },
        `Focus areas (${traits.focus.map((f) => ATTRIBUTE_META[f].label).join(', ')}) count for more in your Overall. Your first ${traits.dailySlots} activities are already waiting.`,
      ),
      el('button', { class: 'btn primary wide', onclick: () => onComplete(answers) }, 'Start day one'),
    );
  }

  return host;
}

/* ------------------------------------------------------------------ *
 * Retaking the survey
 * ------------------------------------------------------------------ */

/**
 * The same fields as onboarding, stacked on one page instead of paged.
 *
 * People retake this because something real changed — a new term, an injury
 * healed, a goal swapped — so it is an edit form, not a wizard, and it opens
 * with their existing answers already in it.
 */
export function renderSurveyEditor(
  initial: SurveyAnswers,
  onSave: (answers: SurveyAnswers) => void,
  onCancel: () => void,
): HTMLElement {
  const answers: SurveyAnswers = { ...initial };
  const error = el('p', { class: 'form-error', role: 'alert' });

  const save = () => {
    for (const step of SURVEY_STEPS) {
      const problem = validateStep(step, answers);
      if (problem) {
        error.textContent = problem;
        return;
      }
    }
    onSave(normaliseSurvey(answers));
  };

  return el(
    'div',
    { class: 'survey-editor' },
    el('h2', {}, 'Update your answers'),
    el('p', { class: 'dim' }, 'Your ratings are re-derived from these, and tomorrow’s plan follows. Every point of XP you have earned stays exactly where it is.'),
    SURVEY_STEPS.map((step) =>
      el(
        'section',
        { class: 'editor-step' },
        el('h3', {}, step.title),
        el('div', { class: 'fields' }, step.fields.map((field) => renderField(field, answers))),
      ),
    ),
    error,
    el(
      'div',
      { class: 'row gap' },
      el('button', { class: 'btn ghost', onclick: onCancel }, 'Cancel'),
      el('button', { class: 'btn primary grow', onclick: save }, 'Save answers'),
    ),
  );
}
