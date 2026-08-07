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

/** Everything that can be browsed in the permanent catalogue. */
export function catalogueItems(category: StoreItem['category']): StoreItem[] {
  return STORE_ITEMS.filter((i) => i.category === category && !i.rotationOnly);
}

/** A seeded generator for one epoch or one window. */
function rngFor(seed: number, salt: number): Rng {
  return new Rng(seed * 2654435761 + salt);
}

/**
 * Windows per epoch. One epoch is a day of shop windows, and an epoch deals out
 * one long shuffled order which the windows then slice up in turn.
 */
const WINDOWS_PER_EPOCH = 48;

/**
 * Why an epoch-wide shuffle rather than a fresh draw per window.
 *
 * The requirement is that every one of the fifteen is gone next window and
 * fifteen new ones have replaced it. Drawing each window independently and then
 * filtering out the previous one cannot deliver that: the filter has to know the
 * previous *shelf*, the previous shelf was itself filtered, and following that
 * chain back has no end. The first cut did it with one level of filtering, which
 * looked right and quietly let items reappear a window later.
 *
 * Dealing instead fixes it by construction. Each epoch shuffles the stockable
 * pool once, weighted by rarity, and window k takes slice k. Adjacent slices
 * cannot overlap because they are different parts of one list. The only seam is
 * the epoch boundary, and that is handled by having the first slice of an epoch
 * skip anything the last slice of the previous epoch held — which terminates,
 * because it only ever looks back one epoch.
 */
function rawEpoch(epoch: number): StoreItem[] {
  const cached = epochCache.get(epoch);
  if (cached) return cached;

  const rng = rngFor(epoch, 12345);
  const pool = STORE_ITEMS.filter(isStockable);
  const weights = pool.map((i) => RARITY_WEIGHT[i.rarity]);
  const order: StoreItem[] = [];
  const want = Math.min(pool.length, WINDOWS_PER_EPOCH * SHOP_SLOTS);

  for (let n = 0; n < want; n++) {
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

  epochCache.set(epoch, order);
  return order;
}

const epochCache = new Map<number, StoreItem[]>();
const sealedCache = new Map<number, StoreItem[]>();

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
function shuffledEpoch(epoch: number): StoreItem[] {
  const cached = sealedCache.get(epoch);
  if (cached) return cached;

  const order = [...rawEpoch(epoch)];
  const previous = rawEpoch(epoch - 1);
  const held = new Set(
    previous.slice(Math.max(0, previous.length - SHOP_SLOTS)).map((i) => i.id),
  );

  const middleStart = SHOP_SLOTS;
  const middleEnd = Math.max(middleStart, order.length - SHOP_SLOTS);
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

  sealedCache.set(epoch, order);
  return order;
}

/** The fifteen for one window, before the mythic slot is considered. */
function shelfFor(window: number): StoreItem[] {
  const epoch = Math.floor(window / WINDOWS_PER_EPOCH);
  const slot = ((window % WINDOWS_PER_EPOCH) + WINDOWS_PER_EPOCH) % WINDOWS_PER_EPOCH;
  return shuffledEpoch(epoch).slice(slot * SHOP_SLOTS, slot * SHOP_SLOTS + SHOP_SLOTS);
}

/** The mythic for a window, or null on the overwhelming majority of them. */
export function mythicForWindow(now: number): StoreItem | null {
  const window = shopWindowIndex(now);
  const rng = rngFor(window, 99991);
  if (rng.next() >= MYTHIC_SLOT_CHANCE) return null;
  const pool = STORE_ITEMS.filter((i) => i.rarity === 'mythic' && i.price > 0);
  if (pool.length === 0) return null;
  return pool[rng.int(0, pool.length)];
}

/**
 * The shelf for a moment in time: fifteen items, plus a mythic on the rare
 * window that has one.
 *
 * Seeded off the clock, so the shelf is identical for the whole half hour and
 * cannot be rerolled by reloading.
 */
export function rotatingStock(now: number): StoreItem[] {
  const stock = [...shelfFor(shopWindowIndex(now))];
  const mythic = mythicForWindow(now);
  if (mythic) stock.unshift(mythic);

  // Best first, so a mythic is the first thing you see rather than the last.
  const order: StoreItem['rarity'][] = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  return stock.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
}

/**
 * Whether an item can be bought right now. Rotation-only stock is purchasable
 * exactly while it is on the shelf; everything else is always available in its
 * category.
 */
export function isPurchasableNow(item: StoreItem, now: number): boolean {
  if (!item.rotationOnly) return true;
  return rotatingStock(now).some((i) => i.id === item.id);
}

/** "12m 30s" for the countdown under the shelf. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
