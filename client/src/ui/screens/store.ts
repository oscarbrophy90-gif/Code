import {
  CURRENCY_SHORT,
  STORE_ITEMS,
  DUNK_PACKAGE_BY_ID,
  RARITY_COLOR,
  categoryStock,
  mythicForCategory,
  SHOP_SLOTS,
  STORE_BY_ID,
  formatCountdown,
  isPurchasableNow,
  msUntilShopRefresh,
  rotatingStock,
  DIFFICULTIES,
  CRATES,
  type CrateDef,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { refresh, type RouteParams } from '../../main.ts';
import { el, fmt, panel, toast } from '../dom.ts';
import { previewItem } from '../preview.ts';
import { crateCard, crateFooter } from '../cratecard.ts';

type Tab = StoreCategory | 'featured' | 'crates';

const CATEGORIES: { id: Tab; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'crates', label: 'Loot boxes' },
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
  { id: 'threeCelebration', label: '3-point celebrations' },
  { id: 'celebration', label: 'Win celebrations' },
  { id: 'emote', label: 'Emotes' },
  { id: 'court', label: 'Courts' },
];

/** The sidebar, grouped so it reads like a shop rather than a flat list. */
const SHELVES: { title: string; ids: Tab[] }[] = [
  { title: '', ids: ['featured', 'crates'] },
  { title: 'Wear', ids: ['jersey', 'shoes', 'clothing', 'accessory'] },
  { title: 'Look', ids: ['hairstyle', 'tattoo', 'title'] },
  { title: 'Play', ids: ['jumpshot', 'dunkPackage', 'animation'] },
  { title: 'Flair', ids: ['threeCelebration', 'celebration', 'emote', 'court'] },
];

const LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

let category: Tab = 'featured';

export function renderStore(params: RouteParams): HTMLElement {
  if (params.category && CATEGORIES.some((c) => c.id === params.category)) {
    category = params.category as Tab;
  }
  const player = store.player;

  return el(
    'div',
    { class: 'wrap' },
    // The countdown belongs to the whole shop, not to the Featured tab, so it
    // sits in the page header and stays visible whichever section you are in —
    // you want to know how long is left while you are deciding, not only while
    // you are looking at the shelf.
    el(
      'div',
      { class: 'shop-header' },
      el('h1', { class: 'page', style: 'margin:0' }, 'Store'),
      refreshClock(),
    ),
    el(
      'p',
      { class: 'page-sub' },
      `Everything here is bought with Coins you earned playing. Cosmetics change how you look and how your animations feel — they never change a rating. You have ${fmt(player.currency)} ${CURRENCY_SHORT}.`,
    ),
    // Sections down the left, stock on the right. Fifteen categories in a row
    // of tabs ran off the edge of the screen and hid half the shop.
    el(
      'div',
      { class: 'shop-layout' },
      el(
        'nav',
        { class: 'shop-nav' },
        ...SHELVES.flatMap((shelf) => [
          shelf.title ? el('div', { class: 'shop-nav-head' }, shelf.title) : null,
          ...shelf.ids.map((id) =>
            el(
              'button',
              {
                class: `shop-nav-item ${category === id ? 'on' : ''}`,
                onclick: () => {
                  category = id;
                  refresh();
                },
              },
              LABEL[id],
            ),
          ),
        ]),
      ),
      el(
        'div',
        { class: 'shop-stock' },
        category === 'featured' ? featuredShelf() : category === 'crates' ? crateShelf() : categoryShelf(category),
      ),
    ),
  );
}

/**
 * The live countdown to the next shelf. It ticks in place rather than
 * re-rendering the page every second, and rebuilds once when the window
 * actually turns over so the new stock appears without a manual refresh.
 */
function refreshClock(): HTMLElement {
  const readout = el('span', { class: 'shop-clock' }, formatCountdown(msUntilShopRefresh(Date.now())));
  const timer = window.setInterval(() => {
    if (!readout.isConnected) {
      window.clearInterval(timer);
      return;
    }
    const left = msUntilShopRefresh(Date.now());
    readout.textContent = formatCountdown(left);
    if (left > SHOP_WINDOW_TICK) return;
    window.clearInterval(timer);
    window.setTimeout(refresh, left + 250);
  }, 1000);

  return el(
    'div',
    { class: 'shop-refresh' },
    el('span', { class: 'shop-refresh-label' }, 'NEW STOCK IN'),
    readout,
  );
}

/**
 * One category's shelf. Fifteen items, and every one of them is replaced when
 * the window turns over — the whole shop rotates, not just a featured strip.
 */
function categoryShelf(category: StoreCategory): HTMLElement {
  const now = Date.now();
  const stock = categoryStock(now, category);
  const mythic = mythicForCategory(now, category);
  const pool = STORE_ITEMS.filter((i) => i.category === category).length;

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'shop-banner' },
      el(
        'div',
        { style: 'min-width:0' },
        el(
          'div',
          { class: 'shop-title' },
          `${LABEL[category]} · ${stock.length} in stock`,
          mythic ? el('span', { class: 'shop-mythic-tag' }, '+1 MYTHIC') : null,
        ),
        el(
          'div',
          { class: 'hint', style: 'margin:2px 0 0' },
          mythic
            ? `A sixteenth slot opened here. Mythic stock only ever turns up like this and rarely — there are ${pool} ${LABEL[category].toLowerCase()} in the game and you are unlikely to see this one again.`
            : `Fifteen of ${pool}, and all fifteen are gone in thirty minutes — the next window is fifteen different ones. Very occasionally a sixteenth slot opens with a mythic in it.`,
        ),
      ),
    ),
    el('div', { class: 'grid cols-3' }, ...stock.map((i) => renderItem(i, true))),
  );
}

/**
 * Featured is a view over what every section happens to be selling this window,
 * best first — never a separate draw, so anything here is also in its own
 * section.
 */
function featuredShelf(): HTMLElement {
  const stock = rotatingStock(Date.now());

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'shop-banner' },
      el(
        'div',
        { style: 'min-width:0' },
        el('div', { class: 'shop-title' }, `Best of what is in stock`),
        el(
          'div',
          { class: 'hint', style: 'margin:2px 0 0' },
          'Every section is selling its own fifteen right now, and the whole shop turns over every thirty minutes. This is the pick of it.',
        ),
      ),
    ),
    el('div', { class: 'grid cols-3' }, ...stock.map((i) => renderItem(i, true))),
  );
}

/**
 * The crate shelf.
 *
 * Four boxes, always in stock — they are not part of the rotation, because a
 * crate you cannot buy today is just a shelf you have to keep checking. Buying
 * one puts it in the Locker unopened; nothing is rolled at the counter.
 *
 * Every card carries the odds under it rather than behind a link. The full
 * per-tier breakdown is one click away, and it is generated from the same table
 * the roll uses, so there is no version of this screen that can be out of date
 * with what the crate actually does.
 */
function crateShelf(): HTMLElement {
  return el(
    'div',
    {},
    el(
      'div',
      { class: 'shop-banner' },
      el(
        'div',
        { style: 'min-width:0' },
        el('div', { class: 'shop-title' }, 'Loot boxes · 4 in stock'),
        el(
          'div',
          { class: 'hint', style: 'margin:2px 0 0' },
          'A hundred items in each, and none of the four hundred is sold anywhere else in the shop. Buy the box here, open it in the Locker. Every crate publishes its odds in full behind Preview Odds.',
        ),
      ),
    ),
    el('div', { class: 'crate-grid' }, ...CRATES.map(shopCrate)),
  );
}

function shopCrate(crate: CrateDef): HTMLElement {
  const player = store.player;
  const affordable = player.currency >= crate.price;
  const held = store.crateCount(crate.id);
  const { footer, hot } = crateFooter(crate);

  return crateCard(crate, {
    count: held,
    footer,
    footerHot: hot,
    action: {
      label: 'Buy',
      tone: 'primary',
      onClick: () => {
        if (!affordable) {
          toast(`You need ${fmt(crate.price - player.currency)} more ${CURRENCY_SHORT}`, 'bad');
          return;
        }
        if (!store.buyCrate(crate.id)) {
          toast('That did not go through.', 'bad');
          return;
        }
        audio.play('levelUp');
        toast(`${crate.name} bought — open it in the Locker`, 'good');
        refresh();
      },
    },
  });
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
    case 'threeCelebration':
      return l.threeCelebrationId === item.id;
    case 'emote':
      return l.emoteId === item.id;
    case 'court':
      return l.courtId === item.id;
    case 'hairstyle':
      return b.hairstyleId === item.id;
    case 'tattoo':
      return l.tattooId === item.id;
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
      case 'threeCelebration':
        target.loadout.threeCelebrationId = item.id;
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
      case 'tattoo':
        target.loadout.tattooId = item.id;
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
