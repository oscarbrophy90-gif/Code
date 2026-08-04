import {
  CURRENCY_SHORT,
  DUNK_PACKAGE_BY_ID,
  RARITY_COLOR,
  STORE_BY_ID,
  itemsInCategory,
  tierForPoints,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { refresh, type RouteParams } from '../../main.ts';
import { el, fmt, panel, tabs, toast } from '../dom.ts';

const CATEGORIES: { id: StoreCategory; label: string }[] = [
  { id: 'jersey', label: 'Jerseys' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'accessory', label: 'Accessories' },
  { id: 'hairstyle', label: 'Hairstyles' },
  { id: 'tattoo', label: 'Tattoos' },
  { id: 'jumpshot', label: 'Jump shots' },
  { id: 'dunkPackage', label: 'Dunk packages' },
  { id: 'animation', label: 'Animations' },
  { id: 'celebration', label: 'Celebrations' },
  { id: 'emote', label: 'Emotes' },
  { id: 'court', label: 'Courts' },
];

let category: StoreCategory = 'jersey';

export function renderStore(params: RouteParams): HTMLElement {
  if (params.category && CATEGORIES.some((c) => c.id === params.category)) {
    category = params.category as StoreCategory;
  }
  const player = store.player;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Store'),
    el(
      'p',
      { class: 'page-sub' },
      `Everything here is bought with Court Credits you earned playing. Cosmetics change how you look and how your animations feel — they never change a rating. You have ${fmt(player.currency)} ${CURRENCY_SHORT}.`,
    ),
    tabs(
      CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
      category,
      (id) => {
        category = id as StoreCategory;
        refresh();
      },
    ),
    el('div', { class: 'grid cols-4' }, ...itemsInCategory(category).map(renderItem)),
  );
}

function renderItem(item: StoreItem): HTMLElement {
  const player = store.player;
  const owned = player.unlocked.includes(item.id);
  const equipped = isEquipped(item);
  const gate = requirementMet(item);
  const affordable = player.currency >= item.price;

  const act = () => {
    if (equipped) return;
    if (owned) {
      equip(item);
      return;
    }
    if (!gate.ok) {
      toast(gate.message, 'bad');
      return;
    }
    if (!affordable) {
      toast(`You need ${fmt(item.price - player.currency)} more ${CURRENCY_SHORT}`, 'bad');
      return;
    }
    const buildGate = buildRequirement(item);
    if (!buildGate.ok) {
      toast(buildGate.message, 'bad');
      return;
    }
    store.update((p) => {
      const target = p.players[p.activeSlot];
      target.currency -= item.price;
      target.unlocked.push(item.id);
    });
    audio.play('levelUp');
    toast(`${item.name} purchased`, 'good');
    equip(item);
  };

  return el(
    'button',
    {
      class: 'item',
      style: `--c1:${item.colors[0]};--c2:${item.colors[1]};--rarity:${RARITY_COLOR[item.rarity]}`,
      onclick: act,
    },
    el('div', { class: 'swatch' }),
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'rarity-tag' }, item.rarity),
      el('div', { class: 'iname' }, item.name),
      el('div', { class: 'idesc' }, item.description),
      item.requirement ? el('div', { style: 'font-size:10px;color:var(--amber);font-weight:700' }, item.requirement) : null,
      el(
        'div',
        { class: 'foot' },
        equipped
          ? el('span', { class: 'equipped' }, 'Equipped')
          : owned
            ? el('span', { class: 'owned' }, 'Owned — tap to equip')
            : el('span', { style: `color:${affordable && gate.ok ? 'var(--amber)' : 'var(--text-faint)'}` }, item.price === 0 ? 'Reward' : `${fmt(item.price)} ${CURRENCY_SHORT}`),
      ),
    ),
  );
}

function isEquipped(item: StoreItem): boolean {
  const l = store.player.loadout;
  const b = store.player.body;
  switch (item.category) {
    case 'jersey':
      return l.jerseyId === item.id;
    case 'shoes':
      return l.shoesId === item.id;
    case 'clothing':
      return l.clothingId === item.id;
    case 'accessory':
      return l.accessoryId === item.id;
    case 'celebration':
      return l.celebrationId === item.id;
    case 'emote':
      return l.emoteId === item.id;
    case 'court':
      return l.courtId === item.id;
    case 'hairstyle':
      return b.hairstyleId === item.id;
    case 'jumpshot':
      return `jumpshot-${l.jumpshotId}` === item.id;
    case 'dunkPackage':
      return `dunk-${l.dunkPackageId}` === item.id;
    default:
      return false;
  }
}

function equip(item: StoreItem): void {
  store.update((p) => {
    const target = p.players[p.activeSlot];
    switch (item.category) {
      case 'jersey':
        target.loadout.jerseyId = item.id;
        break;
      case 'shoes':
        target.loadout.shoesId = item.id;
        break;
      case 'clothing':
        target.loadout.clothingId = item.id;
        break;
      case 'accessory':
        target.loadout.accessoryId = item.id;
        break;
      case 'celebration':
        target.loadout.celebrationId = item.id;
        break;
      case 'emote':
        target.loadout.emoteId = item.id;
        break;
      case 'court':
        target.loadout.courtId = item.id;
        break;
      case 'hairstyle':
        target.body.hairstyleId = item.id;
        break;
      case 'jumpshot':
        target.loadout.jumpshotId = item.id.replace('jumpshot-', '');
        break;
      case 'dunkPackage':
        target.loadout.dunkPackageId = item.id.replace('dunk-', '');
        break;
      default:
        break;
    }
  });
  audio.play('ui');
  refresh();
}

/** Rank- and achievement-gated items cannot be bought at all. */
function requirementMet(item: StoreItem): { ok: boolean; message: string } {
  if (!item.requirement) return { ok: true, message: '' };
  const tier = tierForPoints(store.player.rank.points).tier;
  if (item.requirement.includes('Elite')) {
    return { ok: tier === 'elite' || tier === 'legend', message: 'Reach Elite rank to unlock this.' };
  }
  if (item.requirement.includes('Legend')) {
    return { ok: tier === 'legend', message: 'Reach Legend rank to unlock this.' };
  }
  return { ok: false, message: item.requirement };
}

/** Dunk packages also require the build to physically be able to use them. */
function buildRequirement(item: StoreItem): { ok: boolean; message: string } {
  if (item.category !== 'dunkPackage') return { ok: true, message: '' };
  const pkg = DUNK_PACKAGE_BY_ID[item.id.replace('dunk-', '')];
  if (!pkg) return { ok: true, message: '' };
  const attrs = store.player.attributes;
  if (attrs.dunk < pkg.requires || attrs.vertical < pkg.requiresVertical) {
    return {
      ok: false,
      message: `Needs ${pkg.requires} Dunk and ${pkg.requiresVertical} Vertical — you have ${attrs.dunk} / ${attrs.vertical}.`,
    };
  }
  return { ok: true, message: '' };
}

export function itemName(id: string): string {
  return STORE_BY_ID[id]?.name ?? id;
}

export { panel };
