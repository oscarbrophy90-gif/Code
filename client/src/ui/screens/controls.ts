import {
  ATTRIBUTE_META,
  DRIBBLE_MOVES,
  DUNK_PACKAGES,
  JUMPSHOTS,
  type DribbleMoveDef,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { type RouteParams } from '../../main.ts';
import { el, panel } from '../dom.ts';

/** Keyboard binding for each dribble move, keyed by move id. */
const MOVE_KEYS: Record<string, string[]> = {
  crossover: ['J', 'L'],
  betweenLegs: ['G'],
  behindBack: ['U'],
  hesitation: ['I'],
  sizeUp: ['H'],
  doubleCross: ['B'],
  shamgod: ['V'],
  spin: ['O'],
  stepback: ['K'],
  snatchBack: ['M'],
  euro: ['N'],
  hopJumper: ['Y'],
};

/** How each move is thrown on a touchscreen, from the swipe pad. */
const MOVE_SWIPE: Record<string, string> = {
  crossover: 'Swipe left or right',
  hesitation: 'Swipe up',
  stepback: 'Swipe down',
  spin: 'Hard swipe right',
  snatchBack: 'Hard swipe down',
  behindBack: 'Hard swipe left',
  sizeUp: 'Tap the pad',
};

interface Row {
  keys: string[];
  pad?: string;
  touch?: string;
  label: string;
  action: string;
}

const MOVEMENT: Row[] = [
  { keys: ['W', 'A', 'S', 'D'], pad: 'Left stick', touch: 'Left thumbstick', label: 'Move', action: 'Drive your player around the floor. Arrow keys work too.' },
  { keys: ['Shift'], pad: 'RT / R2', touch: 'SPRINT', label: 'Sprint', action: 'Burst. Drains stamina fast, and a tired player has a smaller green window.' },
  { keys: ['Esc'], pad: 'Start', touch: 'Pause button, top right', label: 'Pause', action: 'Pause, change your shot meter, or quit out.' },
];

const OFFENCE: Row[] = [
  {
    keys: ['Space'],
    pad: 'A / Cross',
    touch: 'SHOOT / CONTEST',
    label: 'Shoot',
    action: 'Hold to raise the meter, release in the green. Hold longer for a deeper release — the meter is the shot.',
  },
  {
    keys: ['Space'],
    pad: 'A / Cross',
    touch: 'SHOOT / CONTEST',
    label: 'Check the ball',
    action: 'At the start of a possession, the same button checks the ball in. It never becomes a shot.',
  },
  {
    keys: ['E'],
    pad: 'X / Square',
    touch: 'DRIVE',
    label: 'Drive and finish',
    action: 'Attack the rim. Turns into a layup, a dunk or a contact dunk depending on your ratings and the defender.',
  },
  {
    keys: ['R'],
    pad: 'B / Circle',
    touch: 'FAKE',
    label: 'Pump fake',
    action: 'Sell the shot. A defender who bites is in the air, which is a contest gone and a foul waiting.',
  },
];

const DEFENCE: Row[] = [
  {
    keys: ['Space'],
    pad: 'A / Cross',
    touch: 'SHOOT / CONTEST',
    label: 'Contest / block',
    action: 'Jump into the shot. Land on the shooter and it is a foul, so time it.',
  },
  {
    keys: ['F'],
    pad: 'Y / Triangle',
    touch: 'STEAL',
    label: 'Steal',
    action: 'Reach in. Miss and you are out of position for a beat, on a 1.25 s cooldown.',
  },
  {
    keys: ['W', 'A', 'S', 'D'],
    pad: 'Left stick',
    touch: 'Left thumbstick',
    label: 'Stay in front',
    action: 'There is no lock-on. Cutting off the drive is your Perimeter Defense and your positioning.',
  },
];

export function renderControls(_params: RouteParams): HTMLElement {
  const attrs = store.hasPlayer ? store.player.attributes : null;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Controls'),
    el(
      'p',
      { class: 'page-sub' },
      'Everything you can do, on a keyboard, a gamepad or a touchscreen. Dribble moves are gated by rating — a move you cannot throw yet is greyed out with what it needs.',
    ),

    el(
      'div',
      { class: 'split' },
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel('Moving', ...MOVEMENT.map(controlRow)),
        panel('With the ball', ...OFFENCE.map(controlRow)),
        panel('On defence', ...DEFENCE.map(controlRow)),
      ),

      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Dribble moves',
          el(
            'p',
            { class: 'hint', style: 'margin:0 0 12px' },
            'Chain them: each move inside the window extends the combo and raises the ankle-breaker odds. Stepback, Snatch Back, Eurostep and Hop Jumper cancel straight into a shot, so the move and the release are one action.',
          ),
          ...DRIBBLE_MOVES.map((m) => moveRow(m, attrs ? attrs[m.gate] : null)),
        ),

        panel(
          'Shooting animations',
          el(
            'p',
            { class: 'hint', style: 'margin:0 0 12px' },
            'Your jump shot decides how long the meter runs and how wide the green window is. Slow and forgiving, or fast and unforgiving.',
          ),
          ...JUMPSHOTS.map((j) =>
            el(
              'div',
              { class: 'kv' },
              el(
                'span',
                { class: 'k' },
                el('b', {}, j.name),
                el('div', { class: 'faint', style: 'font-size:11px' }, j.blurb),
              ),
              el('span', { class: 'v faint', style: 'font-size:11px;white-space:nowrap' }, `${Math.round(j.releaseTime * 1000)} ms`),
            ),
          ),
        ),

        panel(
          'Dunk packages',
          ...DUNK_PACKAGES.map((d) =>
            el(
              'div',
              { class: 'kv' },
              el(
                'span',
                { class: 'k' },
                el('b', {}, d.name),
                el('div', { class: 'faint', style: 'font-size:11px' }, d.blurb),
              ),
              el(
                'span',
                { class: 'v faint', style: 'font-size:11px;white-space:nowrap' },
                d.requires === 0 ? 'Any build' : `${d.requires} Dunk · ${d.requiresVertical} Vert`,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function controlRow(row: Row): HTMLElement {
  return el(
    'div',
    { class: 'ctrl-row' },
    el('div', { class: 'ctrl-keys' }, ...row.keys.map((k) => el('span', { class: 'keycap' }, k))),
    el(
      'div',
      { style: 'min-width:0' },
      el('div', { class: 'ctrl-label' }, row.label),
      el('div', { class: 'ctrl-action' }, row.action),
      row.pad || row.touch
        ? el(
            'div',
            { class: 'ctrl-alt' },
            row.pad ? el('span', {}, `Gamepad: ${row.pad}`) : null,
            row.touch ? el('span', {}, `Touch: ${row.touch}`) : null,
          )
        : null,
    ),
  );
}

function moveRow(move: DribbleMoveDef, rating: number | null): HTMLElement {
  const locked = rating !== null && rating < move.requires;
  const keys = MOVE_KEYS[move.id] ?? [];
  const swipe = MOVE_SWIPE[move.id];

  return el(
    'div',
    { class: `ctrl-row ${locked ? 'locked' : ''}` },
    el('div', { class: 'ctrl-keys' }, ...keys.map((k) => el('span', { class: 'keycap' }, k))),
    el(
      'div',
      { style: 'min-width:0' },
      el(
        'div',
        { class: 'ctrl-label' },
        move.name,
        move.signature ? el('span', { class: 'pill hot', style: 'margin-left:7px' }, 'Signature') : null,
      ),
      el('div', { class: 'ctrl-action' }, describeMove(move)),
      el(
        'div',
        { class: 'ctrl-alt' },
        swipe ? el('span', {}, `Touch: ${swipe}`) : null,
        move.requires > 0
          ? el(
              'span',
              { style: locked ? 'color:var(--red);font-weight:800' : 'color:var(--green);font-weight:800' },
              `${locked ? 'Needs' : 'Unlocked at'} ${move.requires} ${ATTRIBUTE_META[move.gate].label}${
                rating !== null ? ` — you have ${rating}` : ''
              }`,
            )
          : el('span', {}, 'Available to every build'),
      ),
    ),
  );
}

/** A move described by what it does to you and to the defender. */
function describeMove(move: DribbleMoveDef): string {
  const bits: string[] = [];
  if (move.retreat > 3) bits.push('creates space backwards');
  else if (move.burst > 6) bits.push('explodes forward');
  else if (move.lateral > 2.5) bits.push('moves you wide');
  else if (move.burst > 0) bits.push('changes direction');
  if (move.followUp === 'stepback') bits.push('cancels into a jumper');
  if (move.followUp === 'euroLayup') bits.push('finishes at the rim');
  if (move.followUp === 'hopJumper') bits.push('hops into a shot');
  if (move.ankleBase >= 0.045) bits.push('best ankle-breaker odds in the game');
  else if (move.ankleBase >= 0.03) bits.push('good ankle-breaker odds');
  return `${bits.join(', ')}. ${Math.round(move.duration * 1000)} ms long.`;
}
