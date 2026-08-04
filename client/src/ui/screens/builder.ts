import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  POSITIONS,
  POSITION_RULES,
  clampHeightToPosition,
  computeCaps,
  computeOverall,
  defaultBuildFor,
  formatHeight,
  heightRangeFor,
  startingAttributes,
  weightRangeFor,
  wingspanFor,
  type BuildSpec,
  type Position,
} from '@hoops/shared';

import { store, MAX_SLOTS } from '../../state/store.ts';
import { navigate, refresh } from '../../main.ts';
import { bar, confirmDialog, el, panel, segmented, slider, toast } from '../dom.ts';
import { drawPortrait, portraitEl } from '../portrait.ts';
import { radarEl } from '../radar.ts';

let draft: BuildSpec = defaultBuildFor('SG');
let draftName = '';

export function renderBuilder(): HTMLElement {
  const root = el('div', { class: 'wrap' });
  const firstBuild = store.profile.players.length === 0;

  root.append(
    el('h1', { class: 'page' }, firstBuild ? 'Create your player' : 'MyPlayer'),
    el(
      'p',
      { class: 'page-sub' },
      firstBuild
        ? 'Before you can play, you need a player. Pick a position, set your height and weight, choose a number and a name.'
        : 'Pick a position, set your height and weight, choose a number and a name. Your position and height decide what you can become — a point guard will never rebound like a centre, and a centre will never handle like a guard.',
    ),
  );

  if (!firstBuild) {
    root.appendChild(renderSlots());
    root.appendChild(el('div', { style: 'height:14px' }));
  }
  root.appendChild(renderCreator());
  return root;
}

// -------------------------------------------------------------------- slots

function renderSlots(): HTMLElement {
  const players = store.profile.players;
  return panel(
    `Save slots (${players.length}/${MAX_SLOTS})`,
    el(
      'div',
      { class: 'grid cols-4' },
      ...players.map((p, i) => {
        const active = i === store.profile.activeSlot;
        return el(
          'div',
          { class: 'panel', style: `padding:12px;border-color:${active ? 'var(--accent)' : 'var(--line)'}` },
          el(
            'div',
            { class: 'row', style: 'align-items:flex-start' },
            portraitEl(p, 56),
            el(
              'div',
              { style: 'min-width:0;flex:1' },
              el('div', { style: 'font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.name),
              el('div', { class: 'faint', style: 'font-size:11px' }, `${p.build.position} · #${p.build.jerseyNumber} · ${formatHeight(p.build.heightIn)}`),
              el('div', { style: 'font-size:16px;font-weight:900;color:var(--accent)' }, `${computeOverall(p.attributes, p.build.position)} OVR`),
            ),
          ),
          el(
            'div',
            { class: 'row', style: 'margin-top:10px' },
            active
              ? el('span', { class: 'pill hot' }, 'Active')
              : el(
                  'button',
                  {
                    class: 'btn sm',
                    onclick: () => {
                      store.selectSlot(i);
                      refresh();
                      toast(`Switched to ${p.name}`, 'good');
                    },
                  },
                  'Use',
                ),
            players.length > 1
              ? el(
                  'button',
                  {
                    class: 'btn sm danger',
                    onclick: () =>
                      confirmDialog('Delete build?', `${p.name} and all of their progress will be removed. This cannot be undone.`, () => {
                        store.deleteSlot(i);
                        refresh();
                      }),
                  },
                  'Delete',
                )
              : null,
          ),
        );
      }),
    ),
  );
}

// ------------------------------------------------------------------ creator

function renderCreator(): HTMLElement {
  // Keep the draft legal whenever the position changed underneath it.
  draft.heightIn = clampHeightToPosition(draft.position, draft.heightIn);
  draft.wingspanIn = wingspanFor(draft.position, draft.heightIn);
  const weightBand = weightRangeFor(draft.position, draft.heightIn);
  draft.weightLb = Math.max(weightBand.min, Math.min(weightBand.max, draft.weightLb));

  const rules = POSITION_RULES[draft.position];
  const heightBand = heightRangeFor(draft.position);
  const caps = computeCaps(draft);
  const preview = startingAttributes(draft);
  const overall = computeOverall(preview, draft.position);
  const maxed = { ...preview };
  for (const key of ATTRIBUTE_KEYS) maxed[key] = caps[key];
  const ceiling = computeOverall(maxed, draft.position);

  const host = el('div', { class: 'split' });
  const rerender = () => host.replaceWith(renderCreator());

  const nameInput = el('input', {
    type: 'text',
    placeholder: 'Player name',
    value: draftName,
    maxlength: 18,
    oninput: (e: Event) => {
      draftName = (e.target as HTMLInputElement).value;
    },
  }) as HTMLInputElement;

  const portrait = el('canvas', {}) as HTMLCanvasElement;
  const portraitSource = store.profile.players[store.profile.activeSlot];
  drawPortrait(portrait, { ...(portraitSource ?? blankPlayerShape()), build: draft }, 132);

  host.append(
    // ---------------------------------------------------------- left column
    el(
      'div',
      { style: 'display:grid;gap:14px' },
      panel(
        'Position',
        el(
          'div',
          { class: 'mb' },
          segmented(
            POSITIONS.map((p) => ({ value: p as Position, label: p })),
            draft.position,
            (v) => {
              // Snapping to the position's typical build keeps every switch legal.
              draft = defaultBuildFor(v);
              rerender();
            },
          ),
        ),
        el('p', { class: 'dim', style: 'margin:0 0 12px;font-size:13px' }, rules.blurb),
        el(
          'div',
          { class: 'grid cols-2' },
          el(
            'div',
            {},
            el('div', { style: 'font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin-bottom:5px' }, 'Overall grows fastest from'),
            el('ul', { style: 'margin:0;padding-left:16px;font-size:12px;color:var(--text-dim);line-height:1.6' }, ...rules.strengths.map((t) => el('li', {}, t))),
          ),
          el(
            'div',
            {},
            el('div', { style: 'font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--red);margin-bottom:5px' }, 'Weaknesses'),
            el('ul', { style: 'margin:0;padding-left:16px;font-size:12px;color:var(--text-dim);line-height:1.6' }, ...rules.weaknesses.map((t) => el('li', {}, t))),
          ),
        ),
      ),

      panel(
        'Body',
        slider({
          label: `Height — ${draft.position} range ${formatHeight(heightBand.min)} to ${formatHeight(heightBand.max)}`,
          value: draft.heightIn,
          min: heightBand.min,
          max: heightBand.max,
          display: (v) => formatHeight(v),
          onInput: (v) => {
            draft.heightIn = v;
            rerender();
          },
        }),
        slider({
          label: 'Weight',
          value: draft.weightLb,
          min: weightBand.min,
          max: weightBand.max,
          display: (v) => `${v} lb`,
          onInput: (v) => {
            draft.weightLb = v;
            rerender();
          },
        }),
        slider({
          label: 'Jersey number',
          value: draft.jerseyNumber,
          min: 0,
          max: 99,
          display: (v) => `#${v}`,
          onInput: (v) => {
            draft.jerseyNumber = v;
            rerender();
          },
        }),
        el(
          'div',
          { class: 'hint' },
          `Wingspan is set by your position at ${formatHeight(draft.wingspanIn)}. Height is the big lever: every inch buys strength, rebounding, interior defense and blocks, and costs speed, acceleration, ball handle and stamina.`,
        ),
      ),
    ),

    // --------------------------------------------------------- right column
    el(
      'div',
      { style: 'display:grid;gap:14px' },
      panel(
        'Your player',
        el(
          'div',
          { class: 'pcard' },
          portrait,
          el(
            'div',
            { class: 'meta' },
            el('div', { class: 'pname' }, draftName || 'New Player'),
            el(
              'div',
              { class: 'pline' },
              el('span', {}, draft.position),
              el('span', {}, `#${draft.jerseyNumber}`),
              el('span', {}, formatHeight(draft.heightIn)),
              el('span', {}, `${draft.weightLb} lb`),
            ),
            el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, `Starts at ${overall} OVR · ceiling ${ceiling} OVR`),
          ),
          el('div', { class: 'ovr' }, el('b', {}, String(overall)), el('span', {}, 'START')),
        ),
        el('div', { style: 'margin-top:14px' }, nameInput),
        el(
          'button',
          {
            class: 'btn primary block xl',
            style: 'margin-top:10px',
            disabled: store.profile.players.length >= MAX_SLOTS,
            onclick: () => {
              const name = draftName.trim();
              if (!name) {
                toast('Give your player a name first', 'bad');
                nameInput.focus();
                return;
              }
              const slot = store.addSlot(name, { ...draft });
              if (slot < 0) {
                toast('All save slots are full', 'bad');
                return;
              }
              draftName = '';
              toast(`${name} created — go earn some Coins`, 'good');
              navigate('play');
            },
          },
          store.profile.players.length >= MAX_SLOTS ? 'All slots full' : 'Create player',
        ),
      ),

      panel(
        'Attribute ceiling',
        radarEl(preview, caps, 300),
        el(
          'div',
          { class: 'row', style: 'justify-content:center;margin-top:8px' },
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#3ef07a' }), 'At creation'),
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#ff7a3d' }), 'Ceiling'),
        ),
        el(
          'div',
          { style: 'margin-top:14px' },
          ...describeBuild(caps).map((line) =>
            el('div', { class: 'kv' }, el('span', { class: 'k' }, line.label), el('span', { class: 'v', style: `color:${line.color}` }, line.grade)),
          ),
        ),
        el(
          'div',
          { class: 'barrow', style: 'margin-top:12px' },
          el('span', { class: 'lbl' }, 'Overall ceiling'),
          el('span', { class: 'val' }, String(ceiling)),
          bar((ceiling - 60) / 39),
        ),
      ),
    ),
  );

  return host;
}

/** Minimal shape for the portrait when no build exists yet. */
function blankPlayerShape() {
  return {
    body: { skinTone: 3, hairstyleId: 'hair-fade', facialHairId: 'face-none', bodyType: 'athletic' as const, faceScanId: null, muscleDefinition: 0.5 },
    loadout: { jerseyId: 'jersey-starter' },
  } as never;
}

function describeBuild(caps: Record<string, number>): { label: string; grade: string; color: string }[] {
  const groups: [string, string[]][] = [
    ['Outside scoring', ['threePoint', 'midRange', 'freeThrow']],
    ['Inside scoring', ['closeShot', 'layup', 'dunk']],
    ['Playmaking', ['ballHandle', 'passAccuracy']],
    ['Perimeter defense', ['perimeterDefense', 'steal']],
    ['Interior defense', ['interiorDefense', 'block']],
    ['Rebounding', ['offensiveRebound', 'defensiveRebound']],
    ['Athleticism', ['speed', 'acceleration', 'vertical']],
    ['Physicality', ['strength', 'stamina']],
  ];
  return groups.map(([label, keys]) => {
    const avg = keys.reduce((sum, k) => sum + caps[k], 0) / keys.length;
    const grade = avg >= 92 ? 'Elite' : avg >= 85 ? 'Great' : avg >= 76 ? 'Solid' : avg >= 66 ? 'Limited' : 'Weak';
    const color =
      avg >= 92 ? 'var(--green)' : avg >= 85 ? '#9de84f' : avg >= 76 ? 'var(--amber)' : avg >= 66 ? 'var(--orange)' : 'var(--red)';
    return { label, grade, color };
  });
}

export { ATTRIBUTE_META };
