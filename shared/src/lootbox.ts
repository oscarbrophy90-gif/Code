import { CRATE_BY_ID, CRATE_ODDS, type CrateDef } from './data/lootboxes.ts';
import type { StoreItem } from './economy.ts';
import { Rng } from './rng.ts';

/**
 * Opening a crate.
 *
 * The pull is decided here, from a seed, before anything is drawn — the reel in
 * the client is a way of *showing* a result that already exists, never a way of
 * deciding one. That ordering matters for the same reason it did on the court
 * draw: a spin that decides as it lands is a spin that can be interrupted into
 * a different answer, and it would put the odds in the renderer rather than in
 * the table that publishes them.
 */

export interface CratePull {
  crate: CrateDef;
  item: StoreItem;
  rarity: StoreItem['rarity'];
  /** true when the pull was already in the locker, so it pays coins instead */
  duplicate: boolean;
  /** coins handed over for a duplicate, 0 otherwise */
  refund: number;
}

/**
 * What a duplicate is worth.
 *
 * A crate that can hand you the same Street White eleven times needs an answer
 * for the eleventh, and "nothing" is not one. The coins scale hard with rarity
 * so a duplicate Legendary still feels like something happened, without ever
 * paying back more than the crate cost — a crate that funds itself is a crate
 * you would open forever.
 */
export const DUPLICATE_REFUND: Record<StoreItem['rarity'], number> = {
  common: 600,
  rare: 1_600,
  epic: 4_500,
  legendary: 9_000,
  mythic: 18_000,
  exotic: 40_000,
};

/** The rarity a roll lands on, walking the published odds in order. */
export function rollRarity(rng: Rng): StoreItem['rarity'] {
  const roll = rng.next();
  let floor = 0;
  for (const band of CRATE_ODDS) {
    floor += band.chance;
    if (roll < floor) return band.rarity;
  }
  // Only reachable on floating point crumbs at the very top of the range.
  return CRATE_ODDS[CRATE_ODDS.length - 1].rarity;
}

/** Every item of one rarity in a crate, in pool order. */
export function crateBand(crate: CrateDef, rarity: StoreItem['rarity']): StoreItem[] {
  return crate.pool.filter((i) => i.rarity === rarity);
}

/**
 * One open. `owned` decides only whether the pull is marked a duplicate — it
 * never changes *what* you pull, because odds that quietly avoid what you have
 * are odds that no longer match the table on the card.
 */
export function openCrate(crateId: string, seed: number, owned: readonly string[] = []): CratePull {
  const crate = CRATE_BY_ID[crateId];
  if (!crate) throw new Error(`unknown crate ${crateId}`);

  const rng = new Rng(seed ^ 0xc0ffee);
  const rarity = rollRarity(rng);
  const band = crateBand(crate, rarity);
  // A crate is always built with at least one item per band, but falling back
  // to the whole pool is cheaper than a crash if one ever is not.
  const pool = band.length > 0 ? band : crate.pool;
  const item = pool[rng.int(0, pool.length)];

  const duplicate = owned.includes(item.id);
  return {
    crate,
    item,
    rarity: item.rarity,
    duplicate,
    refund: duplicate ? DUPLICATE_REFUND[item.rarity] : 0,
  };
}

/**
 * The strip of cards the reel scrolls past, with the winner planted at a known
 * index.
 *
 * Same shape as the court draw's reel and for the same reason: the winning
 * item also turns up as filler, so the caller cannot find it by searching. The
 * filler is drawn from the crate's *common and rare* bands almost always, with
 * an occasional better one, because a strip that showed epics every third card
 * would make the odds feel like a lie long before the reel stopped.
 */
export interface CrateReel {
  strip: StoreItem[];
  winnerAt: number;
}

export function buildCrateReel(
  crate: CrateDef,
  winner: StoreItem,
  seed: number,
  length = 78,
  winnerAt = 72,
): CrateReel {
  const rng = new Rng(seed ^ 0x1007b0);
  const commons = crateBand(crate, 'common');
  const rares = crateBand(crate, 'rare');
  const better = crate.pool.filter((i) => i.rarity !== 'common' && i.rarity !== 'rare');
  const everyday = [...commons, ...rares];

  const strip: StoreItem[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winnerAt) {
      strip.push(winner);
      continue;
    }
    // One card in eight is something above rare, so the strip has glints in it
    // without ever looking like the odds are one in eight.
    const source = better.length > 0 && rng.next() < 0.125 ? better : everyday.length > 0 ? everyday : crate.pool;
    const recent = new Set(strip.slice(-3).map((c) => c.id));
    let index = rng.int(0, source.length);
    for (let tries = 0; tries < source.length && recent.has(source[index].id); tries++) {
      index = (index + 1) % source.length;
    }
    strip.push(source[index]);
  }
  return { strip, winnerAt };
}
