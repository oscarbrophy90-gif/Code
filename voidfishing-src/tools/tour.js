/* Screenshots every location and every menu, and reports console errors. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#bootStart');
  await page.waitForTimeout(500);

  // unlock everything and give the player some money for the shop views
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 99; d.money = 5e9;
    d.unlockedLocations = VF.locations.list.map(l => l.id);
    d.ownedRods = VF.rods.list.map(r => r.id);
    d.rod = 'celestial'; d.bait = 'star';
    VF.bait.list.forEach(b => { if (!b.unlimited) VF.bait.add(b.id, 40); });
    // populate part of the fishdex so the grid has both states
    VF.fish.list.forEach((f, i) => {
      if (i % 3 !== 0) return;
      d.fishdex[f.id] = { caught: 1 + (i % 7), firstSeen: Date.now(), mutations: {},
        record: { kg: f.kg[1] * 0.4, m: f.m[1] * 0.4, pct: 0.4, mutation: null } };
    });
    d.kept = [{ id: 'moonfish', kg: 42.1, m: 1.8, pct: 0.78, mutation: 'golden', value: 41000, at: Date.now(), location: 'basin' }];
    VF.progression.checkUnlocks();
    VF.hud.refreshAll();
  });

  const times = { shore: 0.72, basin: 0.80, flats: 0.30, trench: 0.66,
                  abyss: 0.85, cradle: 0.50, nowhere: 0.75, beneath: 0.90 };
  for (const loc of ['shore','basin','flats','trench','abyss','cradle','nowhere','beneath']) {
    await page.evaluate(([id, cyc]) => {
      VF.state.data.location = id;
      VF.time.setCycle(cyc);
      VF.loot.invalidatePool();
      VF.weather.reconcile();
      VF.bus.emit('location:changed', id);
      VF.scene.rebuild();
    }, [loc, times[loc]]);
    await page.waitForTimeout(1200);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: 'tools/tour-' + loc + '.png', animations: 'disabled' });
  }

  for (const [panel, tab] of [['shop', null], ['fishdex', null], ['bag', null], ['stats', null], ['settings', null], ['map', null]]) {
    await page.evaluate(([p, t]) => { VF.panels.close(); VF.panels.open(p, t); }, [panel, tab]);
    await page.waitForTimeout(520);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: 'tools/tour-' + panel + '.png', animations: 'disabled' });
  }
  await page.evaluate(() => VF.panels.close());

  console.log('errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('  !', e));
  await browser.close();
})();
