import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  BADGES,
  BADGE_CATEGORIES,
  CURRENCY_SHORT,
  JUMPSHOTS,
  TIER_COLOR,
  TIER_INDEX,
  TIER_LABEL,
  badgeCeiling,
  badgeProgressPercent,
  computeCaps,
  computeOverall,
  formatHeight,
  levelProgress,
  totalUpgradeCost,
  upgradeCost,
  type AttributeKey,
  type BadgeCategory,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { navigate, refresh } from '../../main.ts';
import { bar, el, fmt, overlay, panel, tabs, toast } from '../dom.ts';
import { portraitEl } from '../portrait.ts';
import { radarEl } from '../radar.ts';

type Tab = 'attributes' | 'badges' | 'animations';
let tab: Tab = 'attributes';
let badgeCategory: BadgeCategory | 'all' = 'all';

export function renderMyPlayer(): HTMLElement {
  const player = store.player;
  const overall = computeOverall(player.attributes, player.build.position);
  const lp = levelProgress(player.xp);

  const root = el('div', { class: 'wrap' });

  root.append(
    panel(
      '',
      el(
        'div',
        { class: 'pcard' },
        portraitEl(player, 84),
        el(
          'div',
          { class: 'meta' },
          el('div', { class: 'pname' }, player.name),
          el(
            'div',
            { class: 'pline' },
            el('span', {}, player.build.position),
            el('span', {}, formatHeight(player.build.heightIn)),
            el('span', {}, `${player.build.weightLb} lb`),
            el('span', {}, `${formatHeight(player.build.wingspanIn)} wingspan`),
          ),
          el(
            'div',
            { class: 'barrow', style: 'margin-top:10px' },
            el('span', { class: 'lbl' }, `Level ${lp.level}`),
            el('span', { class: 'val' }, `${fmt(player.currency)} ${CURRENCY_SHORT}`),
            bar(lp.percent, 'green'),
          ),
        ),
        el('div', { class: 'ovr' }, el('b', {}, String(overall)), el('span', {}, 'OVR')),
      ),
    ),
    el('div', { style: 'height:14px' }),
    tabs(
      [
        { id: 'attributes', label: 'Attributes' },
        { id: 'badges', label: 'Badges' },
        { id: 'animations', label: 'Animations' },
      ],
      tab,
      (id) => {
        tab = id as Tab;
        refresh();
      },
    ),
  );

  if (tab === 'attributes') root.appendChild(renderAttributes());
  else if (tab === 'badges') root.appendChild(renderBadges());
  else root.appendChild(renderAnimations());

  return root;
}

/** Badges with nothing to do while a miss is an automatic turnover. */
const REBOUND_BADGES = ['boxOut', 'reboundChaser', 'putbackArtist'];

// --------------------------------------------------------------- attributes

function renderAttributes(): HTMLElement {
  const player = store.player;
  const caps = computeCaps(player.build);

  const groups: { name: string; keys: AttributeKey[] }[] = [
    { name: 'Finishing', keys: ATTRIBUTE_KEYS.filter((k) => ATTRIBUTE_META[k].group === 'finishing') },
    { name: 'Shooting', keys: ATTRIBUTE_KEYS.filter((k) => ATTRIBUTE_META[k].group === 'shooting') },
    { name: 'Playmaking', keys: ATTRIBUTE_KEYS.filter((k) => ATTRIBUTE_META[k].group === 'playmaking') },
    { name: 'Defense', keys: ATTRIBUTE_KEYS.filter((k) => ATTRIBUTE_META[k].group === 'defense') },
    { name: 'Physicals', keys: ATTRIBUTE_KEYS.filter((k) => ATTRIBUTE_META[k].group === 'physicals') },
  ];

  const upgrade = (key: AttributeKey, amount: number) => {
    const p = store.player;
    const cap = computeCaps(p.build)[key];
    let spent = 0;
    let gained = 0;
    for (let i = 0; i < amount; i++) {
      const value = p.attributes[key] + gained;
      if (value >= cap) break;
      const cost = upgradeCost(value, cap);
      if (!Number.isFinite(cost) || spent + cost > p.currency) break;
      spent += cost;
      gained++;
    }
    if (gained === 0) {
      toast(p.attributes[key] >= cap ? 'That attribute is already at your build cap' : 'Not enough Coins', 'bad');
      return;
    }
    store.update((profile) => {
      const target = profile.players[profile.activeSlot];
      target.attributes[key] += gained;
      target.currency -= spent;
    });
    audio.play('ui');
    toast(`${ATTRIBUTE_META[key].label} +${gained} for ${fmt(spent)} ${CURRENCY_SHORT}`, 'good');
    refresh();
  };

  return el(
    'div',
    {},
    el(
      'p',
      { class: 'hint mb' },
      'Every point is bought with Coins earned by playing. There is no purchase path for ratings — the store and battle pass sell cosmetics only, so a maxed build is a time investment, never a payment.',
    ),
    el(
      'div',
      { class: 'grid cols-2', style: 'margin-bottom:14px' },
      panel(
        'Attribute graph',
        radarEl(player.attributes, caps, 300),
        el(
          'div',
          { class: 'row', style: 'justify-content:center;margin-top:8px' },
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#3ef07a' }), 'Current'),
          el('span', { class: 'chip' }, el('span', { class: 'dot', style: 'background:#ff7a3d' }), 'Build ceiling'),
        ),
      ),
      panel(
        'Where you stand',
        ...groups.map((group) => {
          const cur = group.keys.reduce((a, k) => a + player.attributes[k], 0) / group.keys.length;
          const cap = group.keys.reduce((a, k) => a + caps[k], 0) / group.keys.length;
          return el(
            'div',
            { class: 'barrow', style: 'margin-bottom:10px' },
            el('span', { class: 'lbl' }, group.name),
            el('span', { class: 'val' }, `${Math.round(cur)} / ${Math.round(cap)}`),
            bar((cur - 25) / 74),
          );
        }),
        el(
          'div',
          { class: 'hint', style: 'margin-top:6px' },
          'The dashed outline on the graph is the hard ceiling your height, weight and wingspan allow. Upgrades can never pass it.',
        ),
      ),
    ),
    el(
      'div',
      { class: 'grid cols-2' },
      ...groups.map((group) =>
        panel(
          group.name,
          ...group.keys.map((key) => {
            const value = player.attributes[key];
            const cap = caps[key];
            const cost = upgradeCost(value, cap);
            const affordable = Number.isFinite(cost) && cost <= player.currency;
            const atCap = value >= cap;
            return el(
              'div',
              { class: 'attr', title: ATTRIBUTE_META[key].blurb },
              el('span', { class: 'aname' }, ATTRIBUTE_META[key].label),
              el(
                'span',
                { class: 'track' },
                el('i', { style: `width:${(value / 99) * 100}%` }),
                el('u', { style: `left:${(cap / 99) * 100}%` }),
              ),
              el('span', { class: 'aval', style: atCap ? 'color:var(--green)' : '' }, String(value)),
              atCap
                ? el('span', { class: 'pill', style: 'background:rgba(62,240,122,.15);color:var(--green)' }, 'Max')
                : el(
                    'button',
                    {
                      class: 'btn sm',
                      disabled: !affordable,
                      title: `${fmt(cost)} ${CURRENCY_SHORT} — shift-click for +5`,
                      onclick: (e: Event) => upgrade(key, (e as MouseEvent).shiftKey ? 5 : 1),
                    },
                    `+1 · ${fmt(cost)}`,
                  ),
            );
          }),
          group.name === 'Defense'
            ? el(
                'div',
                { class: 'hint', style: 'margin-top:10px;color:var(--amber)' },
                'Under 1v1 rules a miss, block or strip is an instant turnover, so there are no live rebounds in a game. The two rebound ratings work in the practice gym and still count toward a big man’s Overall — spend on them last.',
              )
            : null,
          el(
            'div',
            { class: 'hint', style: 'margin-top:10px' },
            `Max out this group: ${fmt(group.keys.reduce((sum, k) => sum + totalUpgradeCost(player.attributes[k], caps[k], caps[k]), 0))} ${CURRENCY_SHORT}`,
          ),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------- badges

function renderBadges(): HTMLElement {
  const player = store.player;
  const visible = badgeCategory === 'all' ? BADGES : BADGES.filter((b) => b.category === badgeCategory);

  const counts = BADGE_CATEGORIES.map((cat) => {
    const owned = BADGES.filter((b) => b.category === cat).filter(
      (b) => TIER_INDEX[player.badges.find((s) => s.id === b.id)?.tier ?? 'none'] > 0,
    ).length;
    return { cat, owned, total: BADGES.filter((b) => b.category === cat).length };
  });

  return el(
    'div',
    {},
    el(
      'p',
      { class: 'hint mb' },
      'Badges level up by doing the thing. Hit contested jumpers and Deadeye climbs; break defenders down and Ankle Taker climbs. Each tier also needs the gating attribute high enough, so badges and ratings pull in the same direction.',
    ),
    el(
      'div',
      { class: 'grid cols-4 mb' },
      ...counts.map((c) =>
        el(
          'div',
          { class: 'panel', style: 'padding:12px' },
          el('div', { style: 'font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint)' }, c.cat),
          el('div', { style: 'font-size:22px;font-weight:900' }, `${c.owned}/${c.total}`),
          bar(c.owned / c.total),
        ),
      ),
    ),
    el(
      'div',
      { class: 'seg mb' },
      ...[{ value: 'all' as const, label: 'All' }, ...BADGE_CATEGORIES.map((c) => ({ value: c, label: c }))].map((o) =>
        el(
          'button',
          {
            class: badgeCategory === o.value ? 'on' : '',
            onclick: () => {
              badgeCategory = o.value as BadgeCategory | 'all';
              refresh();
            },
          },
          o.label,
        ),
      ),
    ),
    el(
      'div',
      { class: 'badge-grid' },
      ...visible.map((def) => {
        const state = player.badges.find((s) => s.id === def.id) ?? { id: def.id, tier: 'none' as const, progress: 0 };
        const ceiling = badgeCeiling(def, player.attributes);
        const color = TIER_COLOR[state.tier];
        const gated = TIER_INDEX[ceiling] <= TIER_INDEX[state.tier] && TIER_INDEX[state.tier] < 5;
        return el(
          'button',
          {
            class: `badge ${state.tier === 'none' ? 'locked' : ''}`,
            style: `--tier:${color}`,
            onclick: () =>
              overlay(() =>
                el(
                  'div',
                  {},
                  el('div', { style: `font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:${color}` }, `${def.category} · ${TIER_LABEL[state.tier]}`),
                  el('h2', { style: 'margin:2px 0 8px;font-size:22px;font-weight:900' }, def.name),
                  el('p', { class: 'dim', style: 'margin:0 0 16px' }, def.description),
                  el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Levels up from'), el('span', { class: 'v' }, humanEvent(def.earnedBy))),
                  el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Gated by'), el('span', { class: 'v' }, `${ATTRIBUTE_META[def.gate].label} ${player.attributes[def.gate]}`)),
                  el(
                    'div',
                    { style: 'margin-top:14px' },
                    ...(['bronze', 'silver', 'gold', 'hallOfFame', 'legend'] as const).map((t, i) =>
                      el(
                        'div',
                        { class: 'kv' },
                        el('span', { class: 'k', style: `color:${TIER_COLOR[t]}` }, TIER_LABEL[t]),
                        el(
                          'span',
                          { class: 'v', style: player.attributes[def.gate] >= def.gateThresholds[i] ? 'color:var(--green)' : 'color:var(--text-faint)' },
                          `needs ${def.gateThresholds[i]} ${ATTRIBUTE_META[def.gate].label} · ${fmt(def.cost[i])} pts`,
                        ),
                      ),
                    ),
                  ),
                  gated
                    ? el('div', { class: 'hint', style: 'margin-top:14px;color:var(--amber)' }, `Raise ${ATTRIBUTE_META[def.gate].label} to keep this badge climbing.`)
                    : null,
                  REBOUND_BADGES.includes(def.id)
                    ? el(
                        'div',
                        { class: 'hint', style: 'margin-top:10px;color:var(--amber)' },
                        'Under 1v1 rules a miss is an instant turnover, so this badge only has work to do in the practice gym.',
                      )
                    : null,
                  el(
                    'button',
                    { class: 'btn sm', style: 'margin-top:16px', onclick: () => navigate('myplayer') },
                    'Close',
                  ),
                ),
              ),
          },
          el('span', { class: 'shield' }, def.name.slice(0, 1)),
          el(
            'span',
            { style: 'min-width:0;flex:1' },
            el('span', { class: 'bname' }, def.name),
            el('span', { class: 'btier' }, gated ? `${TIER_LABEL[state.tier]} · gated` : TIER_LABEL[state.tier]),
            bar(badgeProgressPercent(state)),
          ),
        );
      }),
    ),
  );
}

function humanEvent(id: string): string {
  const map: Record<string, string> = {
    contestedMake: 'making contested jumpers',
    greenStreak: 'consecutive green releases',
    setMake: 'making set shots',
    stepbackMake: 'making stepbacks and fades',
    clutchMake: 'making shots at game point',
    deepMake: 'making deep threes',
    anyMake: 'making any jumper',
    tiredMake: 'making shots on low stamina',
    streakMake: 'consecutive makes',
    movingMake: 'making shots on the move',
    contactDunk: 'finishing contact dunks',
    layupMake: 'making layups',
    acrobaticMake: 'acrobatic finishes',
    dunkMake: 'dunking',
    bumpWin: 'winning contact on drives',
    euroFinish: 'eurostep finishes',
    putback: 'putbacks off offensive boards',
    contestedFinish: 'finishing through contests',
    finishOverTaller: 'finishing over taller defenders',
    hopFinish: 'hop jumper finishes',
    ankleBreaker: 'breaking defenders down',
    blowBy: 'blowing past your defender',
    comboChain: 'chaining dribble moves',
    stealDefended: 'surviving reach-ins',
    moveChainLong: 'long dribble combos',
    assist: 'assists in team modes',
    tightPass: 'tight-window passes',
    driveSpeed: 'attacking downhill',
    sizeUp: 'size-ups',
    stopBall: 'stopping the ball handler',
    chaseDownBlock: 'chase-down blocks',
    rimContest: 'contesting shots at the rim',
    steal: 'steals',
    deflection: 'deflections',
    boxOut: 'boxing out',
    rebound: 'rebounds',
    bumpHold: 'holding your ground',
    smother: 'smothering closeouts',
    block: 'blocks',
  };
  return map[id] ?? id;
}

// --------------------------------------------------------------- animations

function renderAnimations(): HTMLElement {
  const player = store.player;

  return el(
    'div',
    {},
    el('p', { class: 'hint mb' }, 'Your jump shot changes how the meter behaves: a faster release beats closeouts but shrinks the green window. Pick the one that matches how you like to play, not the one with the biggest number.'),
    el(
      'div',
      { class: 'grid cols-2' },
      panel(
        'Jump shot',
        ...JUMPSHOTS.map((js) => {
          const itemId = `jumpshot-${js.id}`;
          const owned = store.owns(itemId);
          const equipped = player.loadout.jumpshotId === js.id;
          return el(
            'div',
            { class: 'kv', style: 'align-items:flex-start' },
            el(
              'span',
              { class: 'k' },
              el('b', { style: equipped ? 'color:var(--accent)' : '' }, js.name),
              el('div', { class: 'faint', style: 'font-size:11px' }, js.blurb),
              el(
                'div',
                { class: 'faint', style: 'font-size:10px;margin-top:3px' },
                `Release ${Math.round(js.releaseTime * 1000)}ms · window ${(js.greenWindow * 2000).toFixed(0)}ms base · drift ${js.driftPenalty < 1 ? 'stable' : js.driftPenalty > 1.15 ? 'twitchy' : 'normal'}`,
              ),
            ),
            equipped
              ? el('span', { class: 'equipped' }, 'Equipped')
              : owned
                ? el(
                    'button',
                    {
                      class: 'btn sm',
                      onclick: () => {
                        store.update((p) => {
                          p.players[p.activeSlot].loadout.jumpshotId = js.id;
                        });
                        toast(`${js.name} equipped`, 'good');
                        refresh();
                      },
                    },
                    'Equip',
                  )
                : el('button', { class: 'btn sm', onclick: () => navigate('store', { category: 'jumpshot' }) }, `${fmt(js.price)} CC`),
          );
        }),
      ),
      panel(
        'Loadout',
        loadoutRow('Dunk package', player.loadout.dunkPackageId, 'dunkPackage'),
        loadoutRow('Jersey', player.loadout.jerseyId, 'jersey'),
        loadoutRow('Shoes', player.loadout.shoesId, 'shoes'),
        loadoutRow('Clothing', player.loadout.clothingId, 'clothing'),
        loadoutRow('Accessory', player.loadout.accessoryId ?? 'acc-none', 'accessory'),
        loadoutRow('Celebration', player.loadout.celebrationId, 'celebration'),
        loadoutRow('Emote', player.loadout.emoteId, 'emote'),
        loadoutRow('Court', player.loadout.courtId, 'court'),
        el('button', { class: 'btn sm block', style: 'margin-top:12px', onclick: () => navigate('store') }, 'Open store'),
      ),
    ),
  );
}

function loadoutRow(label: string, itemId: string, category: string): HTMLElement {
  return el(
    'button',
    { class: 'kv', style: 'width:100%;text-align:left', onclick: () => navigate('store', { category }) },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v' }, prettyId(itemId)),
  );
}

function prettyId(id: string): string {
  return id
    .replace(/^(jersey|shoes|cloth|acc|celeb|emote|court|dunk|jumpshot|hair|face|tat|anim)-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
