import { STORE_ITEMS } from './data/cosmetics.ts';
import type { StoreItem } from './economy.ts';
import { Rng } from './rng.ts';

/** How long one shop window lasts. The stock is fixed for its whole window. */
export const SHOP_WINDOW_MS = 30 * 60 * 1000;

/**
 * Which 30-minute window a moment falls in. The stock is derived from this
 * number alone, so every reload inside the same half hour shows the same shelf
 * — the shop is not a slot machine you can reroll by refreshing the page.
 */
export function shopWindowIndex(now: number): number {
  return Math.floor(now / SHOP_WINDOW_MS);
}

/** Milliseconds until the shelf turns over. */
export function msUntilShopRefresh(now: number): number {
  return SHOP_WINDOW_MS - (now % SHOP_WINDOW_MS);
}

/** How many items are on the featured shelf. Exactly this, every window. */
export const SHOP_SLOTS = 15;

/**
 * How often a window also gets a mythic, as a bonus sixteenth slot.
 *
 * Mythics are never drawn into the fifteen — they arrive on top of them, so a
 * mythic window is a visibly bigger shelf rather than a normal one with
 * something rare hiding in it. At 2.5% and forty-eight windows a day you see a
 * sixteenth slot roughly once a day, and with eighty-five mythics in the game
 * any *particular* one turns up about twice a year.
 */
export const MYTHIC_SLOT_CHANCE = 0.025;

/**
 * How often each tier shows up among the fifteen, as a relative weight per item.
 * Mythic is absent on purpose: it has its own slot.
 */
const RARITY_WEIGHT: Record<StoreItem['rarity'], number> = {
  common: 60,
  rare: 30,
  epic: 10,
  legendary: 2.5,
  mythic: 0,
};

/** Prestige items are earned, never stocked, so they stay out of the draw. */
function isStockable(item: StoreItem): boolean {
  return item.price > 0 && !item.requirement && item.rarity !== 'mythic';
}

/**
 * The stockable pool for one category, in a fixed order so the shuffle below is
 * reproducible.
 */
function poolFor(category: StoreItem['category']): StoreItem[] {
  return STORE_ITEMS.filter((i) => i.category === category && isStockable(i));
}

/**
 * How many windows an epoch lasts for this category.
 *
 * An epoch deals its pool out fifteen at a time, so it can only run for as many
 * windows as it has fifteens. Jerseys have 135 stockable, which is nine windows
 * — four and a half hours before the deck is reshuffled. A category with fewer
 * than fifteen stockable items has nothing to rotate and simply shows them all.
 */
function slicesFor(poolSize: number): number {
  return Math.max(1, Math.floor(poolSize / SHOP_SLOTS));
}

/** A seeded generator for one epoch or one window. */
function rngFor(seed: number, salt: number): Rng {
  return new Rng(seed * 2654435761 + salt);
}

/** Stable per-category salt, so two categories never deal the same order. */
function categorySalt(category: string): number {
  let n = 2166136261;
  for (let i = 0; i < category.length; i++) {
    n ^= category.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

const rawCache = new Map<string, StoreItem[]>();
const sealedCache = new Map<string, StoreItem[]>();

/**
 * One epoch's order for a category: the whole stockable pool, shuffled with a
 * weight per rarity so commons come up more often than legendaries.
 */
function rawEpoch(category: StoreItem['category'], epoch: number): StoreItem[] {
  const key = `${category}:${epoch}`;
  const cached = rawCache.get(key);
  if (cached) return cached;

  const rng = rngFor(epoch, categorySalt(category) ^ 12345);
  const pool = poolFor(category);
  const weights = pool.map((i) => RARITY_WEIGHT[i.rarity]);
  const order: StoreItem[] = [];

  for (let n = 0; n < pool.length; n++) {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) break;
    let roll = rng.next() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i++) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      index = i;
      if (roll <= 0) break;
    }
    order.push(pool[index]);
    weights[index] = 0;
  }

  rawCache.set(key, order);
  return order;
}

/**
 * The epoch's order with its first slice made safe across the seam.
 *
 * Anything the previous epoch's last slice was still showing gets swapped out of
 * slice zero for something from the middle of the list. A swap rather than a
 * skip matters: skipping would pull items forward out of slice one, and slice
 * one would then show them again a window later — which is exactly the bug this
 * replaced. The last slice is never touched, so the look-back is exact and stops
 * after one epoch instead of chaining back forever.
 */
function sealedEpoch(category: StoreItem['category'], epoch: number): StoreItem[] {
  const key = `${category}:${epoch}`;
  const cached = sealedCache.get(key);
  if (cached) return cached;

  const order = [...rawEpoch(category, epoch)];
  const slices = slicesFor(order.length);
  const previous = rawEpoch(category, epoch - 1);
  const prevSlices = slicesFor(previous.length);
  const held = new Set(
    previous.slice((prevSlices - 1) * SHOP_SLOTS, prevSlices * SHOP_SLOTS).map((i) => i.id),
  );

  const middleStart = SHOP_SLOTS;
  const middleEnd = Math.max(middleStart, slices * SHOP_SLOTS - SHOP_SLOTS);
  let swap = middleStart;
  for (let i = 0; i < Math.min(SHOP_SLOTS, order.length); i++) {
    if (!held.has(order[i].id)) continue;
    while (swap < middleEnd && held.has(order[swap].id)) swap++;
    if (swap >= middleEnd) break;
    const tmp = order[i];
    order[i] = order[swap];
    order[swap] = tmp;
    swap++;
  }

  sealedCache.set(key, order);
  return order;
}

/** The mythic on a category's shelf right now, or null — almost always null. */
export function mythicForCategory(now: number, category: StoreItem['category']): StoreItem | null {
  const window = shopWindowIndex(now);
  const rng = rngFor(window, categorySalt(category) ^ 99991);
  if (rng.next() >= MYTHIC_SLOT_CHANCE) return null;
  const pool = STORE_ITEMS.filter((i) => i.category === category && i.rarity === 'mythic' && i.price > 0);
  if (pool.length === 0) return null;
  return pool[rng.int(0, pool.length)];
}

/**
 * What one category is selling right now: fifteen items, plus a mythic on the
 * rare window that has one.
 *
 * Every category rotates on its own, so a shop window turns over the whole shop
 * — fifteen new jerseys, fifteen new pairs of shoes, and so on. Nothing on a
 * shelf survives into the next window.
 */
export function categoryStock(now: number, category: StoreItem['category']): StoreItem[] {
  const order = sealedEpoch(category, epochFor(category, shopWindowIndex(now)));
  const slices = slicesFor(order.length);
  const slot = ((shopWindowIndex(now) % slices) + slices) % slices;
  const shelf = order.length <= SHOP_SLOTS ? [...order] : order.slice(slot * SHOP_SLOTS, slot * SHOP_SLOTS + SHOP_SLOTS);

  const mythic = mythicForCategory(now, category);
  if (mythic) shelf.unshift(mythic);

  const rank: StoreItem['rarity'][] = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  return shelf.sort((a, b) => rank.indexOf(a.rarity) - rank.indexOf(b.rarity));
}

/**
 * Below this many slices a category stops reshuffling and just cycles one fixed
 * order.
 *
 * The seam between two shuffled epochs is closed by swapping the fifteen the
 * previous epoch was still showing out of the new epoch's first slice. That
 * needs somewhere to swap them to, and a small pool does not have it: dunk
 * packages hold forty-five sellable items, so the fifteen being avoided are a
 * third of everything and the swap runs out of room. Cycling one order instead
 * makes consecutive windows disjoint by construction — adjacent blocks of the
 * same list, including across the wrap — at the cost of the loop being visible
 * after a couple of hours. For a forty-five item section that is the honest
 * trade; a hundred and thirty-five item section keeps the shuffle.
 */
const MIN_SLICES_TO_RESHUFFLE = 4;

/** Which epoch a window falls in for this category. */
function epochFor(category: StoreItem['category'], window: number): number {
  const slices = slicesFor(poolFor(category).length);
  if (slices < MIN_SLICES_TO_RESHUFFLE) return 0;
  return Math.floor(window / slices);
}

/** Every category that has something to sell, in the order the shop lists them. */
export const STOCKED_CATEGORIES: StoreItem['category'][] = [
  'jersey',
  'shoes',
  'clothing',
  'accessory',
  'hairstyle',
  'tattoo',
  'title',
  'jumpshot',
  'dunkPackage',
  'animation',
  'threeCelebration',
  'celebration',
  'emote',
  'court',
];

/**
 * The Featured shelf: the best of what every category happens to be selling this
 * window. It is a view over the same stock, never a separate draw, so anything
 * on it can be found in its own section too.
 */
export function rotatingStock(now: number): StoreItem[] {
  const all = STOCKED_CATEGORIES.flatMap((c) => categoryStock(now, c));
  const rank: StoreItem['rarity'][] = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  all.sort((a, b) => rank.indexOf(a.rarity) - rank.indexOf(b.rarity) || a.name.localeCompare(b.name));
  return all.slice(0, SHOP_SLOTS);
}

/** Everything a category is selling, for the browse view. */
export function catalogueItems(category: StoreItem['category']): StoreItem[] {
  return categoryStock(Date.now(), category);
}

/**
 * Whether an item can be bought right now. Rotation-only stock is purchasable
 * exactly while it is on the shelf; everything else is always available in its
 * category.
 */
export function isPurchasableNow(item: StoreItem, now: number): boolean {
  if (item.price === 0 || item.requirement) return true;
  return categoryStock(now, item.category).some((i) => i.id === item.id);
}

/** "12m 30s" for the countdown under the shelf. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
