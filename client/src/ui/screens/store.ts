import {
  CURRENCY_SHORT,
  DUNK_PACKAGE_BY_ID,
  RARITY_COLOR,
  SHOP_SLOTS,
  STORE_BY_ID,
  catalogueItems,
  formatCountdown,
  isPurchasableNow,
  msUntilShopRefresh,
  rotatingStock,
  DIFFICULTIES,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { refresh, type RouteParams } from '../../main.ts';
import { el, fmt, panel, tabs, toast } from '../dom.ts';
import { previewItem } from '../preview.ts';

type Tab = StoreCategory | 'featured';

const CATEGORIES: { id: Tab; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'title', label: 'Titles' },
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

let category: Tab = 'featured';

export function renderStore(params: RouteParams): HTMLElement {
  if (params.category && CATEGORIES.some((c) => c.id === params.category)) {
    category = params.category as Tab;
  }
  const player = store.player;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Store'),
    el(
      'p',
      { class: 'page-sub' },
      `Everything here is bought with Coins you earned playing. Cosmetics change how you look and how your animations feel — they never change a rating. You have ${fmt(player.currency)} ${CURRENCY_SHORT}.`,
    ),
    tabs(
      CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
      category,
      (id) => {
        category = id as Tab;
        refresh();
      },
    ),
    category === 'featured'
      ? featuredShelf()
      : el('div', { class: 'grid cols-4' }, ...catalogueItems(category).map((i) => renderItem(i))),
  );
}

/**
 * The rotating shelf. Its contents come from the clock, not from a roll made
 * when you opened the page, so it is the same shelf on every device for the
 * whole half hour and you cannot reroll it by refreshing.
 */
function featuredShelf(): HTMLElement {
  const now = Date.now();
  const stock = rotatingStock(now);
  const countdown = el('span', { class: 'shop-clock' }, formatCountdown(msUntilShopRefresh(now)));

  // Tick the countdown in place, and rebuild the page when the shelf turns over.
  const timer = window.setInterval(() => {
    if (!countdown.isConnected) {
      window.clearInterval(timer);
      return;
    }
    const left = msUntilShopRefresh(Date.now());
    countdown.textContent = formatCountdown(left);
    if (left > SHOP_WINDOW_TICK) return;
    window.clearInterval(timer);
    window.setTimeout(refresh, left + 250);
  }, 1000);

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'shop-banner' },
      el(
        'div',
        { style: 'min-width:0' },
        el('div', { class: 'shop-title' }, `${SHOP_SLOTS} items in stock`),
        el(
          'div',
          { class: 'hint', style: 'margin:2px 0 0' },
          'The shelf turns over every 30 minutes. Mythic stock only ever appears here, and almost never — if you see pink, it will probably be gone next time you look.',
        ),
      ),
      el('div', { style: 'text-align:right;flex-shrink:0' }, el('div', { class: 'faint', style: 'font-size:10px;font-weight:800' }, 'REFRESHES IN'), countdown),
    ),
    el('div', { class: 'grid cols-4' }, ...stock.map((i) => renderItem(i, true))),
  );
}

/** Rebuild the page rather than tick once the shelf is within this of turning. */
const SHOP_WINDOW_TICK = 1200;

function renderItem(item: StoreItem, featured = false): HTMLElement {
  const player = store.player;
  const owned = player.unlocked.includes(item.id);
  const equipped = isEquipped(item);
  const gate = requirementMet(item);
  const affordable = player.currency >= item.price;
  const inStock = isPurchasableNow(item, Date.now());

  const act = () => {
    if (equipped) return;
    if (owned) {
      equip(item);
      return;
    }
    if (!inStock) {
      toast(`${item.name} is only sold while it is on the featured shelf.`, 'bad');
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
    'div',
    {
      class: `item ${item.rarity === 'mythic' ? 'mythic' : ''} ${featured ? 'featured' : ''}`,
      style: `--c1:${item.colors[0]};--c2:${item.colors[1]};--rarity:${RARITY_COLOR[item.rarity]}`,
    },
    el('div', { class: 'swatch' }),
    el(
      'div',
      { class: 'body' },
      el(
        'div',
        { class: 'row', style: 'gap:6px;align-items:center' },
        el('div', { class: 'rarity-tag' }, item.rarity),
        item.rotationOnly ? el('div', { class: 'rarity-tag', style: 'color:var(--amber)' }, 'rotation only') : null,
      ),
      el('div', { class: 'iname' }, item.name),
      el('div', { class: 'idesc' }, item.description),
      item.requirement ? el('div', { style: 'font-size:10px;color:var(--amber);font-weight:700' }, item.requirement) : null,
      el(
        'div',
        { class: 'foot' },
        equipped
          ? el('span', { class: 'equipped' }, 'Equipped')
          : owned
            ? el('span', { class: 'owned' }, 'Owned')
            : el('span', { style: `color:${affordable && gate.ok && inStock ? 'var(--amber)' : 'var(--text-faint)'}` }, item.price === 0 ? 'Reward' : `${fmt(item.price)} ${CURRENCY_SHORT}`),
      ),
      // Preview is always available, including for things you cannot afford or
      // that are not in stock — knowing what it looks like is the point.
      el(
        'div',
        { class: 'row', style: 'gap:6px;margin-top:8px' },
        el('button', { class: 'btn sm', onclick: () => previewItem(item) }, 'Preview'),
        equipped
          ? null
          : el(
              'button',
              { class: `btn sm ${owned ? '' : 'primary'}`, onclick: act },
              owned ? 'Equip' : 'Buy',
            ),
      ),
    ),
  );
}

function isEquipped(item: StoreItem): boolean {
  const l = store.player.loadout;
  const b = store.player.body;
  switch (item.category) {
    case 'title':
      return l.titleId === item.id;
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
      case 'title':
        target.loadout.titleId = item.id;
        break;
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

/** Prestige items are earned on the career ladder, never bought. */
function requirementMet(item: StoreItem): { ok: boolean; message: string } {
  if (!item.requirement) return { ok: true, message: '' };
  const stats = store.player.stats;
  const beaten = (d: (typeof DIFFICULTIES)[number]) => (stats.winsByDifficulty[d] ?? 0) > 0;

  if (item.requirement.includes('Superstar')) {
    return { ok: beaten('superstar'), message: 'Beat Superstar to unlock this.' };
  }
  if (item.requirement.includes('Hall of Fame')) {
    return { ok: beaten('hallOfFame'), message: 'Beat Hall of Fame to unlock this.' };
  }
  if (item.requirement.includes('career ladder')) {
    return {
      ok: DIFFICULTIES.every(beaten),
      message: 'Beat every difficulty to unlock this.',
    };
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
