const { load } = require('./headless');
const VF = load(['js/core/util.js','js/core/rng.js','js/core/bus.js','js/core/state.js','js/core/save.js',
 'js/data/rarities.js','js/data/traits.js','js/data/fish.js','js/data/rods.js','js/data/bait.js',
 'js/data/locations.js','js/data/weather.js']);
const tiers = VF.rarities.list.map(r=>r.id);
console.log('species per tier per location');
console.log('loc'.padEnd(10) + tiers.map(t=>t.slice(0,4).padStart(5)).join(''));
for (const l of VF.locations.list) {
  const row = tiers.map(t => VF.fish.list.filter(f => f.rarity===t && (!f.locs.length || f.locs.includes(l.id))).length);
  console.log(l.id.padEnd(10) + row.map(n=>String(n).padStart(5)).join(''));
}
