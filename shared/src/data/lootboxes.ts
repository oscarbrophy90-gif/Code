import type { StoreItem } from '../economy.ts';
import { LOOT_ACCESSORIES, LOOT_CLOTHING, LOOT_EMOTES, LOOT_JERSEYS } from './lootpack.ts';

/**
 * The four crates.
 *
 * One per wearable category, each drawing on its own hundred-item slice of the
 * shared pool. Splitting them this way rather than selling one crate that can
 * give you anything is the difference between a purchase and a gamble you did
 * not agree to: if you want a chain you buy the Accessories crate and you get
 * an accessory. The only thing you are betting on is *which* one.
 */
export interface CrateDef {
  id: string;
  name: string;
  /** the category everything in it belongs to */
  category: StoreItem['category'];
  price: number;
  /** two colours for the crate art */
  colors: [string, string];
  blurb: string;
  /** the hundred items it can hand out */
  pool: StoreItem[];
}

export const CRATES: CrateDef[] = [
  {
    id: 'crate-jersey',
    name: 'Jersey Crate',
    category: 'jersey',
    price: 12_000,
    colors: ['#1f8f6b', '#5fe3d0'],
    blurb: 'A hundred kits, from a plain Street White to the one moving galaxy in the game.',
    pool: LOOT_JERSEYS,
  },
  {
    id: 'crate-accessory',
    name: 'Accessories Crate',
    category: 'accessory',
    price: 10_000,
    colors: ['#c9a227', '#ffe08a'],
    blurb: 'Wristbands, sleeves, chains and the odd orbiting planet.',
    pool: LOOT_ACCESSORIES,
  },
  {
    id: 'crate-clothing',
    name: 'Clothing Crate',
    category: 'clothing',
    price: 11_000,
    colors: ['#4a3fd8', '#9fb0ff'],
    blurb: 'Shorts, hoodies and compression sets, up to an animated galaxy fit.',
    pool: LOOT_CLOTHING,
  },
  {
    id: 'crate-emote',
    name: 'Emote Crate',
    category: 'emote',
    price: 10_000,
    colors: ['#c2452d', '#ffb347'],
    blurb: 'A hundred performances, ending in a backflip into a 360 into a landing pose.',
    pool: LOOT_EMOTES,
  },
];

export const CRATE_BY_ID: Record<string, CrateDef> = Object.fromEntries(CRATES.map((c) => [c.id, c]));

/**
 * The odds, per open.
 *
 * These are the published numbers and the ones the roll actually uses — the
 * preview in the shop reads this table rather than restating it, so the two can
 * never drift apart. They are deliberately not generous: an Exotic at 1 in
 * 5,000 is meant to be a thing you hear about rather than a thing you plan for.
 *
 * Weights within a tier are flat, so every Common is as likely as every other
 * Common. With 38 commons in a pool that is a 1.97% chance of any particular
 * one, and with a single exotic the tier odds and the item odds are the same.
 */
export const CRATE_ODDS: { rarity: StoreItem['rarity']; chance: number }[] = [
  { rarity: 'common', chance: 0.75 },
  { rarity: 'rare', chance: 0.2 },
  { rarity: 'epic', chance: 0.04 },
  { rarity: 'legendary', chance: 0.008 },
  { rarity: 'mythic', chance: 0.0018 },
  { rarity: 'exotic', chance: 0.0002 },
];

/** Sanity, asserted at load: the published odds have to add up to one. */
const ODDS_TOTAL = CRATE_ODDS.reduce((sum, o) => sum + o.chance, 0);
if (Math.abs(ODDS_TOTAL - 1) > 1e-9) {
  throw new Error(`crate odds sum to ${ODDS_TOTAL}, not 1`);
}

/** How the chance reads on a card: "1 in 5,000" beats "0.02%" at the bottom end. */
export function oddsLabel(chance: number): string {
  if (chance >= 0.01) return `${(chance * 100).toFixed(chance >= 0.1 ? 0 : 1)}%`;
  return `1 in ${Math.round(1 / chance).toLocaleString('en-US')}`;
}
