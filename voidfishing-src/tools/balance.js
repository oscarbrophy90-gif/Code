const { load } = require('./headless');
const FILES = [
  'js/core/util.js','js/core/rng.js','js/core/bus.js','js/core/state.js','js/core/save.js',
  'js/data/rarities.js','js/data/traits.js','js/data/fish.js','js/data/rods.js',
  'js/data/bait.js','js/data/locations.js','js/data/weather.js','js/data/achievements.js',
  'js/systems/time.js','js/systems/weather.js','js/systems/progression.js',
  'js/systems/economy.js','js/systems/loot.js'
];
const VF = load(FILES);

function setup(loc, rod, bait, wx) {
  VF.state.data = VF.state.defaults();
  VF.state.data.location = loc; VF.state.data.rod = rod; VF.state.data.bait = bait;
  VF.state.data.unlockedLocations = VF.locations.list.map(l => l.id);
  VF.state.data.level = 99;
  VF.weather.force(wx); for (let i = 0; i < 20; i++) VF.weather.tick(1);
  VF.loot.invalidatePool();
}

function sample(n) {
  const tally = {}, vals = [], xps = [];
  let muts = 0;
  for (let i = 0; i < n; i++) {
    const c = VF.loot.roll({});
    tally[c.rarity] = (tally[c.rarity] || 0) + 1;
    vals.push(c.value); xps.push(c.xp);
    if (c.mutation) muts++;
  }
  const avgV = vals.reduce((a,b)=>a+b,0)/n, avgX = xps.reduce((a,b)=>a+b,0)/n;
  return { tally, avgV, avgX, mutPct: muts/n*100 };
}

const setups = [
  ['shore','wood','worm','clear','START'],
  ['basin','fiber','minnow','clear','L5'],
  ['flats','carbon','glowworm','fog','L10'],
  ['trench','deepwater','deep','storm','L16'],
  ['abyss','abyss','prism','aurora','L24'],
  ['cradle','lunar','star','meteor','L33'],
  ['nowhere','celestial','void','eclipse','L45'],
  ['beneath','void','void','voidsurge','L58'],
  ['beneath','unknown','null','voidsurge','MAX'],
  ['beneath','eclipse','null','voidsurge','ECLIPSE'],
  ['beneath','origin','null','voidsurge','ORIGIN'],
  ['beneath','everything','null','voidsurge','EVERYTHING']
];
const N = 60000;
console.log('label      loc        rarity distribution                                             avgValue     avgXP   mut%');
for (const [loc,rod,bait,wx,label] of setups) {
  setup(loc,rod,bait,wx);
  const r = sample(N);
  const order = ['common','uncommon','rare','epic','legendary','mythic','void','glitch'];
  const dist = order.map(k => {
    const p = (r.tally[k]||0)/N*100;
    return k[0].toUpperCase() + (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p >= 0.01 ? p.toFixed(2) : p > 0 ? p.toFixed(3) : '0');
  }).join(' ');
  console.log(label.padEnd(10), loc.padEnd(10), dist.padEnd(62),
    Math.round(r.avgV).toLocaleString().padStart(12), Math.round(r.avgX).toLocaleString().padStart(9), r.mutPct.toFixed(2));
}

console.log('\n--- level curve ---');
let cum = 0;
for (let l = 1; l <= 80; l++) {
  const need = VF.progression.xpForLevel(l);
  cum += need;
  if ([2,5,9,10,14,16,20,24,27,33,35,43,45,52,58,62,74,80].includes(l))
    console.log('  L' + String(l).padStart(2) + ' next:' + String(need).padStart(8) + '  cumulative:' + cum.toLocaleString().padStart(12));
}
