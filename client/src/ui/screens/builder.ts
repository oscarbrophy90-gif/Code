import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  BUILD_TEMPLATES,
  FACIAL_HAIR,
  HEIGHT_RANGE,
  POSITIONS,
  SKIN_TONES,
  WEIGHT_RANGE,
  computeCaps,
  computeOverall,
  formatHeight,
  itemsInCategory,
  startingAttributes,
  wingspanRange,
  type BuildSpec,
  type Position,
} from '@hoops/shared';

import { store, MAX_SLOTS } from '../../state/store.ts';
import { navigate, refresh } from '../../main.ts';
import { bar, confirmDialog, el, fmt, panel, segmented, slider, toast } from '../dom.ts';
import { drawPortrait, portraitEl } from '../portrait.ts';
import { radarEl } from '../radar.ts';

let draft: BuildSpec = { position: 'SG', jerseyNumber: 23, heightIn: 77, weightLb: 200, wingspanIn: 80 };
let draftName = '';

export function renderBuilder(): HTMLElement {
  const root = el('div', { class: 'wrap' });

  root.append(
    el('h1', { class: 'page' }, 'MyPlayer'),
    el(
      'p',
      { class: 'page-sub' },
      'Your body decides your ceiling. Height, weight and wingspan set an attribute cap for every skill, so a 6\'0" guard can max out handles and range while a 7\'1" centre owns the paint — and neither can do the other\'s job.',
    ),
  );

  root.appendChild(renderSlots());
  root.appendChild(el('div', { style: 'height:14px' }));
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
          {
            class: 'panel',
            style: `padding:12px;border-color:${active ? 'var(--accent)' : 'var(--line)'}`,
          },
          el(
            'div',
            { class: 'row', style: 'align-items:flex-start' },
            portraitEl(p, 56),
            el(
              'div',
              { style: 'min-width:0;flex:1' },
              el('div', { style: 'font-weight:900;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.name),
              el('div', { class: 'faint', style: 'font-size:11px' }, `${p.build.position} · ${formatHeight(p.build.heightIn)}`),
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
  const caps = computeCaps(draft);
  const preview = startingAttributes(draft);
  const overall = computeOverall(preview, draft.position);
  const maxed = { ...preview };
  for (const key of ATTRIBUTE_KEYS) maxed[key] = caps[key];
  const ceiling = computeOverall(maxed, draft.position);

  const host = el('div', { class: 'split' });

  const rerenderCreator = () => {
    const fresh = renderCreator();
    host.replaceWith(fresh);
  };

  const wing = wingspanRange(draft.heightIn);
  if (draft.wingspanIn < wing.min) draft.wingspanIn = wing.min;
  if (draft.wingspanIn > wing.max) draft.wingspanIn = wing.max;

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
  drawPortrait(portrait, { ...store.player, build: draft }, 132);

  host.append(
    // ---------------------------------------------------------- left column
    el(
      'div',
      { style: 'display:grid;gap:14px' },
      panel(
        'Body',
        el('div', { class: 'mb' }, el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Position'),
          segmented(
            POSITIONS.map((p) => ({ value: p as Position, label: p })),
            draft.position,
            (v) => {
              draft.position = v;
              rerenderCreator();
            },
          ),
        ),
        slider({
          label: 'Height',
          value: draft.heightIn,
          min: HEIGHT_RANGE.min,
          max: HEIGHT_RANGE.max,
          display: (v) => formatHeight(v),
          onInput: (v) => {
            draft.heightIn = v;
            rerenderCreator();
          },
        }),
        slider({
          label: 'Weight',
          value: draft.weightLb,
          min: WEIGHT_RANGE.min,
          max: WEIGHT_RANGE.max,
          display: (v) => `${v} lb`,
          onInput: (v) => {
            draft.weightLb = v;
            rerenderCreator();
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
            rerenderCreator();
          },
        }),
        slider({
          label: 'Wingspan',
          value: draft.wingspanIn,
          min: wing.min,
          max: wing.max,
          display: (v) => `${formatHeight(v)} (${v - draft.heightIn >= 0 ? '+' : ''}${v - draft.heightIn}")`,
          onInput: (v) => {
            draft.wingspanIn = v;
            rerenderCreator();
          },
        }),
        el(
          'div',
          { class: 'hint' },
          'Wingspan buys defensive reach, blocks and rebounding without costing speed — but it does not raise your shooting caps.',
        ),
      ),

      panel(
        'Templates',
        el(
          'div',
          { class: 'grid cols-3' },
          ...BUILD_TEMPLATES.map((t) =>
            el(
              'button',
              {
                class: 'btn sm',
                style: 'flex-direction:column;align-items:flex-start;text-align:left;padding:10px',
                onclick: () => {
                  draft = { position: t.position, jerseyNumber: draft.jerseyNumber, heightIn: t.heightIn, weightLb: t.weightLb, wingspanIn: t.wingspanIn };
                  rerenderCreator();
                },
              },
              el('b', { style: 'font-size:12px' }, t.name),
              el('span', { class: 'faint', style: 'font-size:10px;text-transform:none;letter-spacing:0;font-weight:600' }, `${t.position} · ${formatHeight(t.heightIn)} · ${t.weightLb} lb`),
            ),
          ),
        ),
      ),

      panel(
        'Appearance',
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Skin tone'),
        el(
          'div',
          { class: 'swatches mb' },
          ...SKIN_TONES.map((c, i) =>
            el('button', {
              style: `background:${c}`,
              class: store.player.body.skinTone === i ? 'on' : '',
              'aria-label': `Skin tone ${i + 1}`,
              onclick: () => {
                store.update((p) => {
                  p.players[p.activeSlot].body.skinTone = i;
                });
                rerenderCreator();
              },
            }),
          ),
        ),
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Hairstyle'),
        el(
          'div',
          { class: 'seg mb' },
          ...itemsInCategory('hairstyle').map((item) =>
            el(
              'button',
              {
                class: store.player.body.hairstyleId === item.id ? 'on' : '',
                disabled: !store.owns(item.id),
                title: store.owns(item.id) ? item.name : `Locked — ${fmt(item.price)} CC in the store`,
                onclick: () => {
                  store.update((p) => {
                    p.players[p.activeSlot].body.hairstyleId = item.id;
                  });
                  rerenderCreator();
                },
              },
              item.name,
            ),
          ),
        ),
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Facial hair'),
        el(
          'div',
          { class: 'seg mb' },
          ...FACIAL_HAIR.map((f) =>
            el(
              'button',
              {
                class: store.player.body.facialHairId === f.id ? 'on' : '',
                onclick: () => {
                  store.update((p) => {
                    p.players[p.activeSlot].body.facialHairId = f.id;
                  });
                  rerenderCreator();
                },
              },
              f.name,
            ),
          ),
        ),
        el('div', { class: 'faint', style: 'font-size:11px;margin-bottom:6px' }, 'Body type'),
        segmented(
          [
            { value: 'lean' as const, label: 'Lean' },
            { value: 'athletic' as const, label: 'Athletic' },
            { value: 'built' as const, label: 'Built' },
            { value: 'heavy' as const, label: 'Heavy' },
          ],
          store.player.body.bodyType,
          (v) => {
            store.update((p) => {
              p.players[p.activeSlot].body.bodyType = v;
            });
            rerenderCreator();
          },
        ),
        el(
          'div',
          { class: 'row', style: 'margin-top:14px' },
          el(
            'button',
            {
              class: 'btn sm',
              onclick: () => {
                store.update((p) => {
                  const body = p.players[p.activeSlot].body;
                  body.faceScanId = body.faceScanId ? null : `scan-${Date.now().toString(36)}`;
                });
                toast(
                  store.player.body.faceScanId
                    ? 'Face scan slot filled with a placeholder. The production pipeline uploads a phone capture and returns a mesh + texture ID.'
                    : 'Face scan cleared',
                );
                rerenderCreator();
              },
            },
            store.player.body.faceScanId ? 'Clear face scan' : 'Face scan (placeholder)',
          ),
        ),
      ),
    ),

    // --------------------------------------------------------- right column
    el(
      'div',
      { style: 'display:grid;gap:14px' },
      panel(
        'Preview',
        el(
          'div',
          { class: 'pcard' },
          portrait,
          el(
            'div',
            { class: 'meta' },
            el('div', { class: 'pname' }, draftName || 'New Build'),
            el(
              'div',
              { class: 'pline' },
              el('span', {}, draft.position),
              el('span', {}, formatHeight(draft.heightIn)),
              el('span', {}, `${draft.weightLb} lb`),
              el('span', {}, `#${draft.jerseyNumber}`),
            ),
            el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, `Starts at ${overall} OVR · ceiling ${ceiling} OVR`),
          ),
          el('div', { class: 'ovr' }, el('b', {}, String(overall)), el('span', {}, 'START')),
        ),
        el('div', { style: 'margin-top:14px' }, nameInput),
        el(
          'button',
          {
            class: 'btn primary block',
            style: 'margin-top:10px',
            disabled: store.profile.players.length >= MAX_SLOTS,
            onclick: () => {
              const name = draftName.trim() || 'New Build';
              const slot = store.addSlot(name, { ...draft });
              if (slot < 0) {
                toast('All save slots are full', 'bad');
                return;
              }
              draftName = '';
              toast(`${name} created — go earn some Coins`, 'good');
              navigate('myplayer');
            },
          },
          store.profile.players.length >= MAX_SLOTS ? 'All slots full' : 'Create build',
        ),
      ),

      panel(
        'Attribute graph',
        radarEl(preview, caps, 300),
        el(
          'div',
          { class: 'row', style: 'justify-content:center;margin-top:8px' },
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#3ef07a' }), 'At creation'),
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#ff7a3d' }), 'Ceiling'),
        ),
      ),

      panel(
        'Attribute caps',
        el('div', { class: 'hint mb' }, 'Blue is where this build starts. The red marker is the hard ceiling your body allows — upgrades can never pass it.'),
        ...ATTRIBUTE_KEYS.map((key) =>
          el(
            'div',
            { class: 'attr' },
            el('span', { class: 'aname' }, ATTRIBUTE_META[key].label),
            el(
              'span',
              { class: 'track' },
              el('i', { style: `width:${(preview[key] / 99) * 100}%` }),
              el('u', { style: `left:${(caps[key] / 99) * 100}%` }),
            ),
            el('span', { class: 'aval' }, String(caps[key])),
            el('span', { class: 'cost' }, 'cap'),
          ),
        ),
      ),

      panel(
        'What this build does well',
        ...describeBuild(caps).map((line) => el('div', { class: 'kv' }, el('span', { class: 'k' }, line.label), el('span', { class: 'v', style: `color:${line.color}` }, line.grade))),
        el('div', { class: 'barrow', style: 'margin-top:12px' }, el('span', { class: 'lbl' }, 'Overall ceiling'), el('span', { class: 'val' }, `${ceiling}`), bar((ceiling - 60) / 39)),
      ),
    ),
  );

  return host;
}

function describeBuild(caps: Record<string, number>): { label: string; grade: string; color: string }[] {
  const groups: [string, string[]][] = [
    ['Outside scoring', ['threePoint', 'midRange', 'freeThrow']],
    ['Inside scoring', ['layup', 'dunk', 'closeShot']],
    ['Playmaking', ['ballHandle', 'passAccuracy']],
    ['Perimeter defense', ['perimeterDefense', 'steal']],
    ['Interior defense', ['interiorDefense', 'block', 'defensiveRebound']],
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
