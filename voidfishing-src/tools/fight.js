/* Simulates the reeling minigame with a simple "competent player" policy to
   check fight durations and win rates per tier and rod. */
const { load } = require('./headless');
const VF = load(['js/core/util.js','js/core/rng.js','js/core/bus.js','js/core/state.js','js/core/save.js',
 'js/data/rarities.js','js/data/traits.js','js/data/fish.js','js/data/rods.js','js/data/bait.js',
 'js/data/locations.js','js/data/weather.js','js/data/charms.js','js/data/conditions.js',
 'js/data/treasure.js','js/data/journal.js','js/data/secrets.js','js/data/npcs.js',
 'js/data/cosmetics.js','js/data/cases.js','js/data/achievements.js',
 'js/systems/time.js','js/systems/weather.js','js/systems/progression.js','js/systems/build.js',
 'js/systems/conditions.js','js/systems/economy.js','js/systems/loot.js','js/systems/fishing.js',
 'js/systems/catches.js','js/systems/achievements.js']);
// the fight sim does not run the interface, so give it the hooks land() calls
VF.toast = VF.toast || { show(){}, plain(){} };
VF.fx = VF.fx || { shake(){}, flash(){}, pulse(){}, ripple(){} };
VF.audio = VF.audio || new Proxy({}, { get: () => function(){} });
VF.scene = VF.scene || { addShadow(){}, newCastLateral(){}, L: {} };
VF.encounters = VF.encounters || { calm: () => 0, tick(){} };
VF.wrong = VF.wrong || { intensity: () => 0, tick(){} };
VF.particles = VF.particles || { burst(){}, clearAll(){} };

const DT = 1/60;
function simulate(rodId, fishId, skill) {
  VF.state.data.rod = rodId;
  const c = VF.loot.roll({ forceFish: fishId });
  c.pct = 0.5;
  const p = VF.loot.fightParams(c);
  const f = { c, p, distance:1, stamina:1, tension:0.18, reeling:false, surge:0, surgeTime:0,
    surgeDur:0, surgeStrength:0, nextSurge: 2, telegraph:0, snapTimer:0, slack:0, perfect:true,
    inSweet:false, elapsed:0, shakeAmt:0 };
  VF.fishing.S.fight = f; VF.fishing.S.state='reeling';
  let t = 0;
  // policy: reel while tension below target, release above. Poor players react
  // late and occasionally hold on far too long.
  const hi = skill === 'good' ? 0.70 : skill === 'ok' ? 0.80 : 0.93;
  const lo = skill === 'good' ? 0.47 : skill === 'ok' ? 0.42 : 0.28;
  const lagFrames = skill === 'good' ? 3 : skill === 'ok' ? 9 : 20;
  let queue = [], hold = 0, out = null;
  const off = VF.bus.on('fishing:landed', ()=>out='land');
  const off2 = VF.bus.on('fishing:lost', e=>out='lost:'+e.reason);
  while (!out && t < 180) {
    let want = f.reeling;
    if (f.reeling && f.tension > hi) want = false;
    else if (!f.reeling && f.tension < lo) want = true;
    if (skill === 'poor' && !want && hold <= 0 && Math.random() < 0.006) hold = 0.55;
    if (hold > 0) { hold -= DT; want = true; }
    queue.push(want);
    if (queue.length > lagFrames) f.reeling = queue.shift();
    VF.fishing.tick(DT); t += DT;
    if (VF.fishing.S.state !== 'reeling') break;
  }
  off(); off2();
  return { t, out: out || 'timeout', perfect: f.perfect };
}

const rods = ['wood','carbon','deepwater','lunar','frostpoint','void','ninearms',
              'unknown','longfeather','eclipse','twinsun','origin','everything'];
const targets = [['smallmouth','common'],['silver_pike','uncommon'],['golden_bass','rare'],
  ['moonfish','epic'],['leviathan','legendary'],['star_serpent','mythic'],['void_leviathan','void']];
for (const skill of ['good','ok','poor']) {
  console.log('\n=== player skill: ' + skill + ' ===');
  console.log('rod'.padEnd(11) + targets.map(t=>t[1].slice(0,5).padStart(13)).join(''));
  for (const rod of rods) {
    const cells = targets.map(([fid]) => {
      let times=[], wins=0; const N=250;
      for (let i=0;i<N;i++){ const r=simulate(rod,fid,skill); if(r.out==='land'){wins++;times.push(r.t);} }
      const avg = times.length? (times.reduce((a,b)=>a+b,0)/times.length).toFixed(1):'--';
      return (avg+'s/'+Math.round(wins/N*100)+'%').padStart(13);
    });
    console.log(rod.padEnd(11) + cells.join(''));
  }
}
