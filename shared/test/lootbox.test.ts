import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CRATES, CRATE_BY_ID, CRATE_ODDS, oddsLabel } from '../src/data/lootboxes.ts';
import { LOOT_ITEMS } from '../src/data/lootpack.ts';
import { DUPLICATE_REFUND, buildCrateReel, crateBand, openCrate, rollRarity } from '../src/lootbox.ts';
import { DEFAULT_UNLOCKS, STORE_BY_ID, STORE_ITEMS } from '../src/data/cosmetics.ts';
import { categoryStock, mythicForCategory, SHOP_WINDOW_MS } from '../src/shop.ts';
import { Rng } from '../src/rng.ts';
import type { StoreItem } from '../src/economy.ts';

/** Per-set counts from the supplied table, which every crate has to mirror. */
const EXPECTED_BAND: Record<StoreItem['rarity'], number> = {
  common: 38,
  rare: 39,
  epic: 15,
  legendary: 5,
  mythic: 2,
  exotic: 1,
};

test('four crates, a hundred items each, and the tiers match the table', () => {
  assert.equal(CRATES.length, 4, 'jersey, accessories, clothing, emote');
  assert.equal(LOOT_ITEMS.length, 400, 'a hundred sets of four');

  const categories = new Set(CRATES.map((c) => c.category));
  assert.equal(categories.size, 4, 'one crate per category, no overlap');

  for (const crate of CRATES) {
    assert.equal(crate.pool.length, 100, `${crate.id} holds a hundred`);
    for (const item of crate.pool) {
      assert.equal(item.category, crate.category, `${item.id} is in the wrong crate`);
      assert.equal(item.crateOnly, true, `${item.id} has to be crate-only`);
      assert.equal(item.price, 0, `${item.id} has no counter to be sold at`);
    }
    for (const [rarity, want] of Object.entries(EXPECTED_BAND)) {
      const got = crateBand(crate, rarity as StoreItem['rarity']).length;
      assert.equal(got, want, `${crate.id} should hold ${want} ${rarity}, holds ${got}`);
    }
  }

  // Every crate item is in the catalogue, so previews and the Locker can find
  // one by id — a pull that resolves to nothing is a pull you cannot equip.
  for (const item of LOOT_ITEMS) {
    assert.equal(STORE_BY_ID[item.id]?.name, item.name, `${item.id} is missing from the catalogue`);
  }
});

test('crate stock is never on a shelf and never free', () => {
  for (const item of LOOT_ITEMS) {
    assert.equal(DEFAULT_UNLOCKS.includes(item.id), false, `${item.id} must not be a starter unlock`);
  }

  // A month of windows across the four crate categories. Zero crate items may
  // appear in any of them — the fifteen slots or the mythic sixteenth.
  const base = 1_800_000_000_000;
  const windows = (30 * 24 * 60 * 60 * 1000) / SHOP_WINDOW_MS;
  const crateIds = new Set(LOOT_ITEMS.map((i) => i.id));
  let checked = 0;
  for (let w = 0; w < windows; w++) {
    const now = base + w * SHOP_WINDOW_MS;
    for (const crate of CRATES) {
      for (const item of categoryStock(now, crate.category)) {
        assert.equal(crateIds.has(item.id), false, `${item.id} turned up on the ${crate.category} shelf`);
        checked++;
      }
      const m = mythicForCategory(now, crate.category);
      if (m) assert.equal(crateIds.has(m.id), false, `${m.id} turned up in a mythic slot`);
    }
  }
  assert.ok(checked > 50_000, `expected a real sweep, only checked ${checked} slots`);
});

test('the published odds are the odds the roll actually uses', () => {
  const sum = CRATE_ODDS.reduce((s, o) => s + o.chance, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `odds sum to ${sum}`);

  // Two million rolls. The rare tiers need this many to be measured at all:
  // exotic at 1 in 5,000 is only ~400 hits even here.
  const rng = new Rng(0xb0_07_1e);
  const counts: Record<string, number> = {};
  const rolls = 2_000_000;
  for (let i = 0; i < rolls; i++) {
    const r = rollRarity(rng);
    counts[r] = (counts[r] ?? 0) + 1;
  }

  for (const band of CRATE_ODDS) {
    const got = (counts[band.rarity] ?? 0) / rolls;
    // Tolerance scaled to the band: a 75% band should land within a fraction of
    // a point, a 0.02% band cannot be held to that.
    const tol = Math.max(band.chance * 0.12, 3 * Math.sqrt((band.chance * (1 - band.chance)) / rolls));
    assert.ok(
      Math.abs(got - band.chance) <= tol,
      `${band.rarity}: measured ${(got * 100).toFixed(4)}%, published ${(band.chance * 100).toFixed(4)}%`,
    );
  }
});

test('every item in a crate can actually come out of it', () => {
  // Inside a tier the pick is flat, so a long run has to reach all hundred.
  const crate = CRATE_BY_ID['crate-jersey'];
  const seenIds = new Set<string>();
  for (let i = 0; i < 400_000; i++) {
    seenIds.add(openCrate(crate.id, i).item.id);
  }
  assert.equal(seenIds.size, 100, `only ${seenIds.size} of the hundred are reachable`);

  // And the flat pick means no item inside a tier is favoured. Measured across
  // the commons, which get 75% of the rolls and so are the tightest sample.
  const commons = crateBand(crate, 'common');
  const hits: Record<string, number> = {};
  const runs = 300_000;
  for (let i = 0; i < runs; i++) {
    const pull = openCrate(crate.id, i + 1_000_000);
    if (pull.item.rarity === 'common') hits[pull.item.id] = (hits[pull.item.id] ?? 0) + 1;
  }
  const total = Object.values(hits).reduce((s, n) => s + n, 0);
  const expected = total / commons.length;
  for (const item of commons) {
    const got = hits[item.id] ?? 0;
    assert.ok(
      Math.abs(got - expected) < expected * 0.15,
      `${item.id} came up ${got} times, expected about ${Math.round(expected)}`,
    );
  }
});

test('a duplicate pays coins and never pays more than the crate cost', () => {
  const crate = CRATE_BY_ID['crate-accessory'];
  const owned = crate.pool.map((i) => i.id);

  // Owning everything, every pull is a duplicate and every one pays out.
  for (let i = 0; i < 500; i++) {
    const pull = openCrate(crate.id, i, owned);
    assert.equal(pull.duplicate, true);
    assert.equal(pull.refund, DUPLICATE_REFUND[pull.item.rarity]);
    assert.ok(pull.refund > 0, 'a duplicate always pays something');
  }

  // Owning nothing, nothing is a duplicate and nothing pays.
  for (let i = 0; i < 500; i++) {
    const pull = openCrate(crate.id, i, []);
    assert.equal(pull.duplicate, false);
    assert.equal(pull.refund, 0);
  }

  // The common refund is the one that matters: it is what 75% of opens pay, so
  // it has to stay well under the price or the crate funds itself forever.
  for (const c of CRATES) {
    assert.ok(
      DUPLICATE_REFUND.common < c.price * 0.2,
      `${c.id}: a common duplicate pays ${DUPLICATE_REFUND.common} against a ${c.price} crate`,
    );
  }

  // What an average open returns to a player who owns the lot. If this ever
  // exceeded the price the crate would be a coin printer.
  for (const c of CRATES) {
    const ev = CRATE_ODDS.reduce((sum, band) => sum + band.chance * DUPLICATE_REFUND[band.rarity], 0);
    assert.ok(ev < c.price, `${c.id}: an average duplicate open returns ${ev.toFixed(0)} of ${c.price}`);
  }
});

test('the reel plants the winner where it says, not where it happens to appear', () => {
  const crate = CRATE_BY_ID['crate-emote'];
  let earlierCopies = 0;

  for (let seed = 0; seed < 200; seed++) {
    const winner = openCrate(crate.id, seed).item;
    const { strip, winnerAt } = buildCrateReel(crate, winner, seed);
    assert.equal(strip.length, 78);
    assert.equal(strip[winnerAt].id, winner.id, 'the winner sits at the index the reel reports');

    // The same failure the court draw had: filler is drawn from the same pool,
    // so searching for the winner finds an earlier copy and the reel stops a
    // few cards in. Counting them proves the index is not findable by search.
    const first = strip.findIndex((i) => i.id === winner.id);
    if (first < winnerAt) earlierCopies++;

    // No card repeats inside a three-card window, or at speed the strip reads
    // as two items alternating rather than as a shuffle.
    for (let i = 3; i < strip.length; i++) {
      const window = [strip[i - 3], strip[i - 2], strip[i - 1]].map((c) => c.id);
      if (i === winnerAt) continue;
      assert.equal(window.includes(strip[i].id), false, `card ${i} repeats inside three of itself`);
    }
  }

  assert.ok(earlierCopies > 0, 'expected the winner to also appear as filler — otherwise this test proves nothing');
});

test('the reel is mostly everyday stock, so the strip does not lie about the odds', () => {
  const crate = CRATE_BY_ID['crate-clothing'];
  let above = 0;
  let cards = 0;
  for (let seed = 0; seed < 300; seed++) {
    const { strip, winnerAt } = buildCrateReel(crate, crate.pool[0], seed);
    strip.forEach((item, i) => {
      if (i === winnerAt) return;
      cards++;
      if (item.rarity !== 'common' && item.rarity !== 'rare') above++;
    });
  }
  const share = above / cards;
  assert.ok(share > 0.05 && share < 0.2, `filler above rare should be a glint, measured ${(share * 100).toFixed(1)}%`);
});

test('crate ids carry what the renderer needs to draw them', () => {
  const CLOTHING_KINDS = new Set(['shorts', 'compression', 'hoodie', 'cutoff', 'longshorts', 'tracksuit']);
  const ACCESSORY_KINDS = new Set([
    'headband', 'armsleeve', 'chain', 'goggles', 'wristbands', 'kneepad', 'mouthguard', 'earrings',
  ]);

  for (const item of LOOT_ITEMS) {
    const parts = item.id.split('-');
    switch (item.category) {
      case 'clothing':
        assert.equal(parts[0], 'cloth');
        assert.ok(CLOTHING_KINDS.has(parts[1]), `${item.id} draws as an unknown garment`);
        break;
      case 'accessory':
        assert.equal(parts[0], 'acc');
        assert.ok(ACCESSORY_KINDS.has(parts[1]), `${item.id} draws as an unknown accessory`);
        break;
      case 'emote':
        assert.equal(parts[0], 'emote');
        // The pose is chosen off the id, so an emote whose id is only a number
        // would get a hashed pose rather than the one it is named after.
        assert.ok(parts.length >= 4, `${item.id} carries no name for the pose to read`);
        break;
      case 'jersey':
        assert.equal(parts[0], 'jersey');
        break;
      default:
        assert.fail(`${item.id} is in a category no crate stocks`);
    }
  }
});

test('nothing in the pool shares a name with anything you could already own', () => {
  const named = STORE_ITEMS.map((i) => `${i.category}|${i.name}`);
  assert.equal(new Set(named).size, named.length, 'two items with one name is a Locker you cannot use');
});

test('the odds read the way a person would say them', () => {
  assert.equal(oddsLabel(0.75), '75%');
  assert.equal(oddsLabel(0.2), '20%');
  assert.equal(oddsLabel(0.04), '4.0%');
  assert.equal(oddsLabel(0.008), '1 in 125');
  assert.equal(oddsLabel(0.0002), '1 in 5,000');
});
