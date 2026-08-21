/* The soak's fight guard expired at cycle 0. Is the fight stuck, or just slow?
   Runs the same loop but records what was on the line and whether the fight
   was still making progress when the guard ran out. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(300);

  const runs = Number(process.argv[2] || 25);
  const out = await page.evaluate(async (runs) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < runs; i++) {
      if (VF.catchUI.isOpen()) VF.catchUI.defaultAction();
      VF.fishing.hardReset();
      // force a hard fight on the starting rod, the way an unlucky cycle 0 does
      VF.state.data.rod = 'wood';
      VF.bait.add('worm', 50);
      VF.state.data.bait = 'worm';
      const tier = ['rare', 'epic', 'legendary', 'mythic'][i % 4];
      const pool = VF.fish.byRarity(tier);
      const f = pool[i % pool.length];
      VF.fishing.beginCharge(); await sleep(300); VF.fishing.releaseCharge();
      // wait out the cast flight, then bring the bite forward
      let w = 0;
      while (VF.fishing.state() !== 'waiting' && w++ < 200) await sleep(16);
      VF.fishing.S.biteWait = 0.02;
      w = 0;
      while (VF.fishing.state() !== 'bite' && w++ < 100) await sleep(16);
      if (VF.fishing.state() !== 'bite') { rows.push({ tier: tier, note: 'no bite' }); continue; }
      // swap in the species we want to test against
      VF.fishing.S.pending = VF.loot.roll({ forceFish: f.id });
      VF.fishing.hook();
      await sleep(60);

      let guard = 0;
      const track = [];
      while (VF.fishing.state() === 'reeling' && guard++ < 3000) {
        const fi = VF.fishing.S.fight;
        if (fi) {
          VF.fishing.setReeling(fi.tension < 0.62);
          if (guard % 250 === 0) track.push(+fi.distance.toFixed(3));
        }
        await sleep(8);
      }
      const fi = VF.fishing.S.fight;
      rows.push({
        tier: tier, fish: f.id, ticks: guard,
        ended: VF.fishing.state(),
        // still moving means slow, not stuck
        progress: track.slice(-4),
        distLeft: fi ? +fi.distance.toFixed(3) : null,
        stamina: fi ? +fi.stamina.toFixed(3) : null
      });
      // the catch card owns the 'landed' state, so clear it before the next run
      if (VF.catchUI.isOpen()) VF.catchUI.defaultAction();
      let z = 0;
      while (VF.fishing.state() !== 'idle' && z++ < 120) {
        VF.fishing.hardReset();
        await sleep(16);
      }
      await sleep(60);
    }
    return rows;
  }, runs);

  let hung = 0;
  out.forEach(r => {
    if (r.note) { console.log(r.tier.padEnd(10), r.note); return; }
    const timedOut = r.ticks >= 3000;
    if (timedOut) hung++;
    console.log(
      r.tier.padEnd(10), (r.fish || '').padEnd(18),
      'ticks ' + String(r.ticks).padStart(4),
      '→ ' + r.ended.padEnd(8),
      timedOut ? ('distance ' + r.distLeft + ' stamina ' + r.stamina +
                  ' | last samples ' + JSON.stringify(r.progress)) : '');
  });
  console.log('\nfights that hit the 24s guard: ' + hung + ' / ' + out.length);
  console.log('errors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
