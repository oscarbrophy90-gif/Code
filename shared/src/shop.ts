import { STORE_ITEMS } from './data/cosmetics.ts';
import type { StoreItem } from './economy.ts';
import { Rng } from './rng.ts';

/** How long one shop window lasts. The stock is fixed for its whole window. */
export const SHOP_WINDOW_MS = 30 * 60 * 1000;

/** How many items are on the featured shelf at a time. */
export const SHOP_SLOTS = 8;

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

/**
 * How often each tier is allowed to show up, as a relative weight per item.
 * Tuned by simulating 90 days of windows: a mythic lands on the shelf in about
 * 1.9% of them, which is roughly one sighting a day of real time. Rare enough
 * to be worth mentioning, common enough that it is a real thing to chase rather
 * than a rumour — at the first draft weight it was one sighting every 13 days,
 * which no player would ever see.
 */
const RARITY_WEIGHT: Record<StoreItem['rarity'], number> = {
  common: 60,
  rare: 30,
  epic: 10,
  legendary: 2.5,
  mythic: 1.2,
};

/** Prestige items are earned, never stocked, so they stay out of the draw. */
function isStockable(item: StoreItem): boolean {
  return item.price > 0 && !item.requirement;
}

/** Everything that can be browsed in the permanent catalogue. */
export function catalogueItems(category: StoreItem['category']): StoreItem[] {
  return STORE_ITEMS.filter((i) => i.category === category && !i.rotationOnly);
}

/**
 * The featured shelf for a moment in time. Sampling is weighted by rarity and
 * without replacement, seeded off the window index, so it is identical for the
 * whole half hour and different in the next one.
 */
export function rotatingStock(now: number, slots = SHOP_SLOTS): StoreItem[] {
  const rng = new Rng(shopWindowIndex(now) * 2654435761 + 12345);
  const pool = STORE_ITEMS.filter(isStockable);
  const weights = pool.map((i) => RARITY_WEIGHT[i.rarity]);
  const picked: StoreItem[] = [];

  for (let n = 0; n < slots && picked.length < pool.length; n++) {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) break;
    let roll = rng.next() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i++) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      if (roll <= 0) {
        index = i;
        break;
      }
      index = i;
    }
    picked.push(pool[index]);
    weights[index] = 0; // drawn, so it cannot come up twice on one shelf
  }

  // Best first, so a mythic never hides at the bottom of the shelf.
  const order: StoreItem['rarity'][] = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  return picked.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
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
