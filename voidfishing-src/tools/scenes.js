/* Screenshots the dramatic states: every weather type, the fight UI, a
   legendary encounter, and the catch card at several rarities. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 60; d.money = 5e8;
    d.unlockedLocations = VF.locations.list.map(l => l.id);
    d.ownedRods = VF.rods.list.filter(r => r.level <= 60).map(r => r.id);
    d.rod = 'void'; d.bait = 'void';
    VF.bait.list.forEach(b => { if (!b.unlimited) VF.bait.add(b.id, 99); });
    VF.hud.refreshAll();
  });
  const shot = async (n) => {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: 'tools/sc-' + n + '.png', animations: 'disabled' });
  };

  // weather
  for (const [loc, wx] of [['trench','storm'],['basin','rain'],['nowhere','fog'],
                           ['cradle','meteor'],['abyss','aurora'],['trench','eclipse'],
                           ['beneath','voidsurge']]) {
    await page.evaluate(([loc, wx]) => {
      VF.state.data.location = loc; VF.loot.invalidatePool();
      VF.bus.emit('location:changed'); VF.scene.rebuild();
      VF.weather.force(wx);
      for (let i = 0; i < 40; i++) VF.weather.tick(0.5);
    }, [loc, wx]);
    await page.waitForTimeout(2200);
    await shot('wx-' + wx);
  }

  // the fight
  await page.evaluate(async () => {
    VF.state.data.location = 'trench'; VF.loot.invalidatePool();
    VF.bus.emit('location:changed');
    VF.fishing.beginCharge();
    await new Promise(r => setTimeout(r, 900));
    VF.fishing.releaseCharge();
    await new Promise(r => setTimeout(r, 900));
    VF.fishing.S.biteWait = 0.02;
    await new Promise(r => setTimeout(r, 200));
    VF.fishing.S.pending = VF.loot.roll({ forceFish: 'leviathan' });
    VF.fishing.hook();
    const f = VF.fishing.S.fight;
    f.distance = 0.55; f.tension = 0.63; f.stamina = 0.48; f.inSweet = true;
    VF.fishing.setReeling(true);
  });
  await page.waitForTimeout(400);
  await shot('fight');
  await page.evaluate(() => { const f = VF.fishing.S.fight; if (f) { f.tension = 0.93; f.surge = 0.9; } });
  await page.waitForTimeout(300);
  await shot('fight-danger');

  // catch card at several rarities
  for (const [fid, mut] of [['leviathan', null], ['void_leviathan', 'voidtouched'], ['g_yourself', 'golden']]) {
    await page.evaluate(([fid, mut]) => {
      VF.catchUI.close();
      VF.fishing.S.fight = null; VF.fishing.S.state = 'landed';
      const c = VF.loot.roll({ forceFish: fid });
      c.pct = 0.994; c.isGiant = true; c.isNew = true;
      if (mut) { c.mutation = mut; c.mutationDef = VF.mutations.get(mut); c.value *= c.mutationDef.mult; }
      VF.fishing.S.lastResult = c;
      VF.bus.emit('fishing:landed', c);
    }, [fid, mut]);
    await page.waitForTimeout(900);
    await shot('catch-' + fid);
    await page.evaluate(() => VF.catchUI.close());
    await page.waitForTimeout(300);
  }

  // legendary encounter
  await page.evaluate(async () => {
    VF.fishing.S.state = 'idle';
    VF.state.data.location = 'nowhere'; VF.loot.invalidatePool();
    VF.bus.emit('location:changed');
    VF.fishing.beginCharge();
    await new Promise(r => setTimeout(r, 800));
    VF.fishing.releaseCharge();
    await new Promise(r => setTimeout(r, 900));
    VF.fishing.S.biteWait = 999;
    VF.encounters.force();
  });
  await page.waitForTimeout(2600);
  await shot('encounter');

  console.log('errors:', errors.length);
  errors.slice(0,10).forEach(e => console.log('  !', e));
  await browser.close();
})();
