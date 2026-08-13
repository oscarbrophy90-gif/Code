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
  CRATE_ODDS,
  crateBand,
  oddsLabel,
  type CrateDef,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { refresh, type RouteParams } from '../../main.ts';
import { el, fmt, overlay, panel, toast } from '../dom.ts';
import { previewItem } from '../preview.ts';
import { drawItemCard } from '../itemcard.ts';

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
          'A hundred items in each, and none of the four hundred is sold anywhere else in the shop. Buy the box here, open it in the Locker — the odds are printed on every card and the roll uses that same table.',
        ),
      ),
    ),
    el('div', { class: 'grid cols-3' }, ...CRATES.map(renderCrate)),
  );
}

function renderCrate(crate: CrateDef): HTMLElement {
  const player = store.player;
  const held = store.crateCount(crate.id);
  const affordable = player.currency >= crate.price;
  const owned = crate.pool.filter((i) => player.unlocked.includes(i.id)).length;

  const art = el('canvas', { class: 'crate-art', width: '300', height: '200' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawCrateArt(art, crate));

  const buy = () => {
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
  };

  return el(
    'div',
    { class: 'item crate', style: `--c1:${crate.colors[0]};--c2:${crate.colors[1]};--rarity:${crate.colors[1]}` },
    art,
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'iname' }, crate.name),
      el('div', { class: 'idesc' }, crate.blurb),
      el(
        'div',
        { class: 'crate-odds' },
        ...CRATE_ODDS.map((band) =>
          el(
            'span',
            { class: 'crate-odd', style: `--tint:${RARITY_COLOR[band.rarity]}` },
            el('b', {}, oddsLabel(band.chance)),
            el('span', {}, band.rarity),
          ),
        ),
      ),
      el(
        'div',
        { class: 'hint', style: 'margin:8px 0 0' },
        `${owned} of ${crate.pool.length} collected${held > 0 ? ` · ${held} unopened in your Locker` : ''}`,
      ),
      el(
        'div',
        { class: 'foot' },
        el('span', { style: `color:${affordable ? 'var(--amber)' : 'var(--text-faint)'}` }, `${fmt(crate.price)} ${CURRENCY_SHORT}`),
      ),
      el(
        'div',
        { class: 'row', style: 'gap:6px;margin-top:8px' },
        el('button', { class: 'btn sm', onclick: () => showOdds(crate) }, 'Chances'),
        el('button', { class: 'btn sm primary', onclick: buy }, 'Buy'),
      ),
    ),
  );
}

/**
 * The full odds table for one crate.
 *
 * Both numbers are shown: the chance of the tier, and the chance of any one
 * particular item in it. They are very different — a 75% Common band split
 * across thirty-eight items is a 1.97% chance of the one you actually want —
 * and showing only the first would be the more flattering half of the truth.
 */
function showOdds(crate: CrateDef): void {
  overlay((close) =>
    el(
      'div',
      { class: 'dialog' },
      el('h3', { style: 'margin:0 0 2px' }, `${crate.name} — chances`),
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 14px' },
        'Every open rolls a tier first, then picks evenly inside it. Nothing is weighted by what you already own, and a duplicate pays coins instead.',
      ),
      el(
        'div',
        { class: 'odds-table' },
        el(
          'div',
          { class: 'odds-head' },
          el('span', {}, 'Tier'),
          el('span', {}, 'Chance'),
          el('span', {}, 'Items'),
          el('span', {}, 'Any one'),
        ),
        ...CRATE_ODDS.map((band) => {
          const count = crateBand(crate, band.rarity).length;
          return el(
            'div',
            { class: 'odds-row', style: `--tint:${RARITY_COLOR[band.rarity]}` },
            el('span', { class: 'odds-tier' }, band.rarity),
            el('span', {}, oddsLabel(band.chance)),
            el('span', {}, `${count}`),
            el('span', { class: 'faint' }, count > 0 ? oddsLabel(band.chance / count) : '—'),
          );
        }),
      ),
      el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' },
        el('button', { class: 'btn', onclick: close }, 'Close')),
    ),
  );
}

/** A closed box in the crate's own colours, with a glimpse of what is inside. */
function drawCrateArt(canvas: HTMLCanvasElement, crate: CrateDef): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const [c1, c2] = crate.colors;

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0d1017');
  bg.addColorStop(1, shadeHex(c1, -0.62));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A straightforward axonometric box: a rhombus for the lid, and the two
  // faces you can see hanging off its front corner. Drawn from the four lid
  // corners rather than from eight loose points, so the faces cannot end up
  // disagreeing about where an edge is.
  const cx = w / 2;
  const cy = h * 0.52;
  const half = Math.min(w, h) * 0.42;
  const depth = half * 0.42;
  const tall = half * 0.62;

  const front: [number, number] = [cx, cy + depth];
  const left: [number, number] = [cx - half, cy];
  const back: [number, number] = [cx, cy - depth];
  const right: [number, number] = [cx + half, cy];
  const down = ([x, y]: [number, number]): [number, number] => [x, y + tall];

  const face = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Left face, right face, then the lid on top of both.
  face([left, front, down(front), down(left)], shadeHex(c1, -0.18));
  face([front, right, down(right), down(front)], shadeHex(c1, -0.44));
  face([left, back, right, front], shadeHex(c2, -0.05));

  // The strap that runs over the lid and down both faces.
  const band = half * 0.16;
  ctx.fillStyle = c2;
  ctx.globalAlpha = 0.9;
  face(
    [
      [left[0] + half * 0.5, left[1] + depth * 0.5],
      [left[0] + half * 0.5 + band, left[1] + depth * 0.5 + band * 0.42],
      [right[0] - half * 0.5 + band, right[1] - depth * 0.5 + band * 0.42],
      [right[0] - half * 0.5, right[1] - depth * 0.5],
    ],
    c2,
  );
  ctx.globalAlpha = 0.55;
  face(
    [
      [cx - half * 0.5, cy + depth * 0.5],
      [cx - half * 0.5 + band, cy + depth * 0.5 + band * 0.42],
      [cx - half * 0.5 + band, cy + depth * 0.5 + band * 0.42 + tall],
      [cx - half * 0.5, cy + depth * 0.5 + tall],
    ],
    c2,
  );
  ctx.globalAlpha = 1;

  // Light leaking out of the lid seam, so the box reads as something that opens.
  const seam = ctx.createLinearGradient(left[0], left[1], right[0], right[1]);
  seam.addColorStop(0, 'rgba(255,255,255,0)');
  seam.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  seam.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = seam;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left[0], left[1]);
  ctx.lineTo(front[0], front[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.stroke();

  // A pool of the crate's colour under it, so it is sitting on something.
  const pool = ctx.createRadialGradient(cx, cy + tall + depth, 2, cx, cy + tall + depth, half * 1.3);
  pool.addColorStop(0, `${c2}55`);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, cy, w, h - cy);
}

function shadeHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const out = rgb.map((v) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)))),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
