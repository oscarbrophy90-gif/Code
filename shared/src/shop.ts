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

/** How many items are on a shelf. Exactly this, every window. */
export const SHOP_SLOTS = 15;

/**
 * Sections that show more than the standard fifteen. Emotes carry twice the
 * catalogue of anything else, so fifteen a window would take days to show you
 * what is in there.
 */
const SLOTS_BY_CATEGORY: Partial<Record<StoreItem['category'], number>> = {
  emote: 20,
};

export function slotsFor(category: StoreItem['category']): number {
  return SLOTS_BY_CATEGORY[category] ?? SHOP_SLOTS;
}

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

/** Prestige items are earned, never stocked, so they stay out of the draw. */
function isStockable(item: StoreItem): boolean {
  return item.price > 0 && !item.requirement && item.rarity !== 'mythic';
}

/**
 * The stockable pool for one category, in a fixed order so the shuffles below
 * are reproducible.
 */
function poolFor(category: StoreItem['category']): StoreItem[] {
  return STORE_ITEMS.filter((i) => i.category === category && isStockable(i));
}

/** The four tiers a shelf is dealt from, best last so shortfalls roll upward. */
const BANDS: StoreItem['rarity'][] = ['common', 'rare', 'epic', 'legendary'];

/**
 * How many of each tier a shelf of fifteen wants.
 *
 * Drawing all fifteen from one weighted pool was the mistake. Weighting by
 * rarity is right for *which* common you get, but applied to the whole shelf it
 * just produces the average — measured twelve commons, two rares, one epic and
 * no legendary on the jersey shelf, and twelve/three/zero/zero on emotes. A
 * shelf should always be worth looking at, so the composition is fixed and the
 * shuffle decides only which items fill each slot.
 */
const SHELF_MIX: Record<StoreItem['rarity'], number> = {
  common: 6,
  rare: 5,
  epic: 3,
  legendary: 1,
  mythic: 0,
};

/** The mix scaled to a section's slot count, keeping the same proportions. */
function wantFor(category: StoreItem['category'], rarity: StoreItem['rarity']): number {
  const slots = slotsFor(category);
  if (slots === SHOP_SLOTS) return SHELF_MIX[rarity];
  const scaled = Math.round((SHELF_MIX[rarity] / SHOP_SLOTS) * slots);
  return scaled;
}

/** Stable per-category-and-tier salt, so no two bands deal the same order. */
function saltFor(key: string): number {
  let n = 2166136261;
  for (let i = 0; i < key.length; i++) {
    n ^= key.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

const bandCache = new Map<string, StoreItem[]>();

/**
 * One tier of one category, in a fixed shuffled order.
 *
 * Fixed, not per-epoch. A shelf takes a block of `take` from each band at offset
 * `window * take`, wrapping around, and consecutive blocks of the same list
 * cannot overlap as long as a band never gives up more than half of itself at
 * once. That is the whole no-carry-over guarantee, with no epoch boundary to
 * paper over — which is what the previous version spent most of its complexity
 * on. Each band cycles on its own length, so the shelf as a whole only repeats
 * after their least common multiple: over sixty days for jerseys.
 */
function band(category: StoreItem['category'], rarity: StoreItem['rarity']): StoreItem[] {
  const key = `${category}:${rarity}`;
  const cached = bandCache.get(key);
  if (cached) return cached;

  const items = poolFor(category).filter((i) => i.rarity === rarity);
  const rng = new Rng(saltFor(key));
  // Fisher-Yates, so every ordering is equally likely.
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  bandCache.set(key, items);
  return items;
}

/**
 * How many of each tier this category can actually put on a shelf.
 *
 * A band can only give up half of itself at once, or consecutive shelves would
 * have to share. Whatever a thin band cannot cover is handed to the next tier
 * that has room — so dunk packages, which have no commons at all, fill those
 * six slots with rares and epics rather than showing a short shelf.
 */
function mixFor(category: StoreItem['category']): Map<StoreItem['rarity'], number> {
  const take = new Map<StoreItem['rarity'], number>();
  const room = new Map<StoreItem['rarity'], number>();
  // Rounding the scaled mix can land a slot either side, so the shortfall is
  // measured against the section's real slot count rather than the mix's total.
  let shortfall = slotsFor(category);

  for (const rarity of BANDS) {
    const size = band(category, rarity).length;
    const cap = size <= 1 ? size : Math.floor(size / 2);
    const want = wantFor(category, rarity);
    const got = Math.min(want, cap);
    take.set(rarity, got);
    room.set(rarity, Math.max(0, cap - got));
    shortfall -= got;
  }

  // Spread what is left over the tiers that can take it, working up from the
  // bottom so a slot a thin band could not fill becomes the next tier rather
  // than the best one. Dunk packages have no commons at all, and rolling those
  // six slots straight to legendary put seven legendaries on a shelf of
  // fifteen — generous to the point of meaningless.
  for (const rarity of BANDS) {
    if (shortfall <= 0) break;
    const extra = Math.min(shortfall, room.get(rarity) ?? 0);
    take.set(rarity, (take.get(rarity) ?? 0) + extra);
    shortfall -= extra;
  }
  return take;
}

/** `count` items from a band starting at `offset`, wrapping around the end. */
function blockFrom(items: StoreItem[], offset: number, count: number): StoreItem[] {
  const out: StoreItem[] = [];
  if (items.length === 0) return out;
  for (let i = 0; i < count; i++) out.push(items[(offset + i) % items.length]);
  return out;
}

/** The mythic on a category's shelf right now, or null — almost always null. */
export function mythicForCategory(now: number, category: StoreItem['category']): StoreItem | null {
  return mythicAtWindow(shopWindowIndex(now), category, true);
}

function mythicAtWindow(window: number, category: StoreItem['category'], lookBack: boolean): StoreItem | null {
  const rng = new Rng(window * 2654435761 + (saltFor(category) ^ 99991));
  if (rng.next() >= MYTHIC_SLOT_CHANCE) return null;
  let pool = STORE_ITEMS.filter((i) => i.category === category && i.rarity === 'mythic' && i.price > 0);
  if (lookBack) {
    // Two mythic windows back to back in the same section is vanishingly rare,
    // but if it happens the second one has to be a different item — "everything
    // on the shelf is gone next window" has no exceptions. One window of
    // look-back, so this terminates.
    const before = mythicAtWindow(window - 1, category, false);
    if (before) pool = pool.filter((i) => i.id !== before.id);
  }
  if (pool.length === 0) return null;
  return pool[rng.int(0, pool.length)];
}

/**
 * What one category is selling right now: fifteen items across the tiers, plus a
 * mythic on the rare window that has one.
 *
 * Every category rotates on its own, so a window turns over the whole shop.
 * Nothing on a shelf survives into the next one.
 */
export function categoryStock(now: number, category: StoreItem['category']): StoreItem[] {
  const pool = poolFor(category);
  const window = shopWindowIndex(now);
  const shelf: StoreItem[] = [];

  if (pool.length <= slotsFor(category)) {
    // Nothing to rotate — a section this small shows everything it has.
    shelf.push(...pool);
  } else {
    const mix = mixFor(category);
    for (const rarity of BANDS) {
      const count = mix.get(rarity) ?? 0;
      if (count === 0) continue;
      shelf.push(...blockFrom(band(category, rarity), window * count, count));
    }
  }

  const mythic = mythicForCategory(now, category);
  if (mythic) shelf.unshift(mythic);

  const rank: StoreItem['rarity'][] = ['mythic', 'legendary', 'epic', 'rare', 'common'];
  return shelf.sort((a, b) => rank.indexOf(a.rarity) - rank.indexOf(b.rarity));
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
