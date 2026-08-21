/* Pushes on edge cases that normal play reaches slowly: empty state, extreme
   values, rapid input, panel thrash, and every location/condition combination. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await p.waitForTimeout(500); await p.click('#bootStart'); await p.waitForTimeout(500);

  const out = await p.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const notes = [];
    const d = VF.state.data;

    // 1. every location renders, including the secret ones
    d.level = 99; VF.progression.checkUnlocks();
    VF.secrets.list.forEach(x => VF.secrets.discover(x.id));
    for (const loc of VF.locations.list) {
      d.location = loc.id;
      VF.loot.invalidatePool(); VF.bus.emit('location:changed'); VF.scene.rebuild();
      await s(60);
      for (let i = 0; i < 3; i++) { const c = VF.loot.roll({}); if (!c || !c.fish) notes.push('bad roll at ' + loc.id); }
    }

    // 2. every condition at every location
    for (const loc of VF.locations.list) {
      d.location = loc.id; VF.loot.invalidatePool();
      for (const cd of VF.conditionData.list) {
        VF.conditions.end(); VF.conditions.start(cd.id);
        for (let i = 0; i < 20; i++) VF.conditions.tick(0.5);
        const m = VF.conditions.mods();
        for (const k in m) if (!isFinite(m[k])) notes.push('bad cond mod ' + cd.id + '.' + k);
        VF.loot.roll({});
      }
    }
    VF.conditions.end();

    // 3. every weather at every location
    for (const loc of VF.locations.list) {
      d.location = loc.id; VF.bus.emit('location:changed');
      for (const w of VF.weatherData.list) {
        VF.weather.force(w.id);
        for (let i = 0; i < 25; i++) VF.weather.tick(0.5);
        if (!isFinite(VF.weather.rare()) || !isFinite(VF.weather.bite())) notes.push('bad weather ' + w.id);
      }
    }

    // 4. every charm combination of 5 produces finite stats
    const ids = VF.charms.list.map(c => c.id);
    ids.forEach(id => VF.charms.grant(id));
    for (let i = 0; i < 200; i++) {
      for (let sl = 0; sl < 5; sl++) VF.charms.equip(ids[(i * 7 + sl * 3) % ids.length], sl);
      VF.build.invalidate();
      const st = VF.build.stats();
      for (const k in st) if (!isFinite(st[k])) notes.push('bad build stat ' + k);
      const c = VF.loot.roll({});
      if (!isFinite(c.value) || c.value <= 0) notes.push('bad value ' + c.value);
      if (!isFinite(c.kg) || c.kg <= 0) notes.push('bad kg ' + c.kg);
      const fp = VF.loot.fightParams(c);
      for (const k in fp) if (!isFinite(fp[k])) notes.push('bad fight param ' + k);
    }

    // 5. rapid press/release thrash must not strand the rod
    for (let i = 0; i < 60; i++) {
      VF.fishing.beginCharge();
      await s(Math.random() * 40);
      VF.fishing.releaseCharge();
      await s(Math.random() * 30);
      VF.fishing.reelIn();
    }
    VF.fishing.hardReset();
    if (VF.fishing.state() !== 'idle') notes.push('stranded after thrash: ' + VF.fishing.state());

    // 6. panel thrash
    const panels = ['shop','fishdex','bag','wardrobe','journal','stats','settings','map'];
    for (let i = 0; i < 80; i++) {
      VF.panels.open(panels[i % panels.length]);
      if (i % 3 === 0) VF.panels.close();
    }
    VF.panels.close();
    await s(400);
    if (document.getElementById('modal').children.length) notes.push('modal left populated');

    // 7. treasure with every build, including the sell path
    let treasureOk = 0;
    for (let i = 0; i < 200; i++) { const t = VF.treasureData.roll(); if (t && t.value) treasureOk++; }
    if (!treasureOk) notes.push('no sellable treasure ever drawn');

    // 8. fishdex renders every species, discovered and not
    VF.panels.open('fishdex');
    await s(300);
    const cells = document.querySelectorAll('.dex-cell').length;
    if (cells < VF.fish.count) notes.push('fishdex shows ' + cells + ' of ' + VF.fish.count);
    VF.panels.close();

    // 9. zero money / level 1 shop does not break
    d.money = 0; d.level = 1;
    VF.panels.open('shop', 'cases'); await s(200);
    VF.panels.open('shop', 'charms'); await s(200);
    VF.panels.close();

    // 10. save/load with everything populated
    VF.save.save();
    const t0 = JSON.stringify(VF.state.data).length;
    VF.save.load();
    const t1 = JSON.stringify(VF.state.data).length;
    if (Math.abs(t0 - t1) > t0 * 0.02) notes.push('save size drift ' + t0 + ' -> ' + t1);

    return { notes, saveBytes: t0 };
  });

  console.log('save size:', out.saveBytes, 'bytes');
  console.log('notes:', out.notes.length ? out.notes : 'none');
  console.log('errors:', errors.length);
  [...new Set(errors)].slice(0, 15).forEach(e => console.log('  !', e));
  await b.close();
  process.exit(errors.length || out.notes.length ? 1 : 0);
})();
