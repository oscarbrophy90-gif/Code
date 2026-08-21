/* Plays many full fishing cycles at speed, exercising every menu, the save
   round-trip, encounters and weather. Reports errors, FPS and stuck states. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(400);

  const CYCLES = Number(process.argv[2] || 60);
  const result = await page.evaluate(async (CYCLES) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { cycles: 0, landed: 0, lost: 0, missed: 0, stuck: [], slow: [], rarities: {},
                  mutations: 0, newSpecies: 0, levels: 0, encounters: 0, maxKept: 0,
                  longestFight: 0 };
    VF.bus.on('fishing:missed', () => out.missed++);
    VF.bus.on('level:up', () => out.levels++);
    VF.bus.on('encounter:start', () => out.encounters++);

    for (let i = 0; i < CYCLES; i++) {
      // rotate gear and spots so every code path gets touched
      if (i % 7 === 0) {
        const d = VF.state.data;
        d.level = Math.min(99, d.level + 6);
        VF.progression.checkUnlocks();
        const locs = d.unlockedLocations;
        d.location = locs[i % locs.length];
        VF.loot.invalidatePool(); VF.weather.reconcile();
        VF.bus.emit('location:changed');
        const rods = VF.rods.list.filter(r => d.level >= r.level);
        d.ownedRods = rods.map(r => r.id);
        d.rod = rods[rods.length - 1].id;
        const baits = VF.bait.list.filter(b => d.level >= b.level);
        const b = baits[baits.length - 1];
        VF.bait.add(b.id, 50); d.bait = b.id;
        VF.bus.emit('gear:changed');
      }
      if (i % 11 === 5) VF.weather.force(VF.rng.g.pick(VF.locations.current().weather));

      VF.fishing.beginCharge();
      await sleep(60 + Math.random() * 400);
      VF.fishing.releaseCharge();

      let guard = 0;
      while (VF.fishing.state() === 'casting' && guard++ < 200) await sleep(16);
      VF.fishing.S.biteWait = 0.02;
      guard = 0;
      while (VF.fishing.state() === 'waiting' && guard++ < 200) await sleep(16);

      if (VF.fishing.state() === 'bite') {
        if (Math.random() < 0.92) VF.fishing.hook();
        else {
          await sleep(1500);              // deliberately miss the window
          // a missed bite drops back to waiting, so reel in to end the cycle
          VF.fishing.reelIn();
        }
      }

      /* A long fight is not a stuck fight. A starter rod against a legendary
         legitimately runs over a minute, so a fixed timeout here reports the
         balance curve as a defect and would hide a real hang in the noise.
         What actually matters is whether the fight is still moving. */
      guard = 0;
      let lastProg = null, stale = 0, ticks = 0;
      while (VF.fishing.state() === 'reeling' && guard++ < 24000) {
        const f = VF.fishing.S.fight;
        if (f) {
          VF.fishing.setReeling(f.tension < 0.62);
          const prog = Math.round((f.distance + f.stamina) * 1e4);
          if (prog === lastProg) stale++; else { stale = 0; lastProg = prog; }
          if (stale > 300) break;      // nothing moved for ~2.5s of ticks
        }
        ticks++;
        await sleep(8);
      }
      const secs = Math.round(ticks * 8 / 100) / 10;
      out.longestFight = Math.max(out.longestFight, secs);
      if (stale > 300) out.stuck.push('fight stopped moving at cycle ' + i + ' after ' + secs + 's');
      else if (guard >= 24000) out.stuck.push('fight ran past 190s at cycle ' + i);
      else if (secs > 45) out.slow.push('cycle ' + i + ': ' + secs + 's');

      if (VF.fishing.state() === 'landed') {
        // wait for the card, then take one of the three actions
        guard = 0;
        while (!VF.catchUI.isOpen() && guard++ < 120) await sleep(16);
        const c = VF.fishing.S.lastResult;
        if (c) {
          out.rarities[c.rarity] = (out.rarities[c.rarity] || 0) + 1;
          if (c.mutation) out.mutations++;
          if (c.isNew) out.newSpecies++;
        }
        const roll = Math.random();
        if (roll < 0.6) VF.catches.sell();
        else if (roll < 0.85) VF.catches.keep();
        else VF.catches.release();
        VF.catchUI.close();
        out.landed++;
      } else if (VF.fishing.state() === 'idle') {
        out.lost++;
      }
      out.maxKept = Math.max(out.maxKept, VF.state.data.kept.length);
      out.cycles++;

      // reel in whatever is left, then the rod must come back to idle
      if (VF.fishing.state() !== 'idle') VF.fishing.reelIn();
      guard = 0;
      while (VF.fishing.state() !== 'idle' && guard++ < 200) await sleep(16);
      if (guard >= 200) out.stuck.push('rod not idle after cycle ' + i +
                                       ' (state ' + VF.fishing.state() + ')');
    }
    return out;
  }, CYCLES);

  console.log('cycles:', result.cycles, '| landed:', result.landed, '| lost:', result.lost, '| missed bites:', result.missed);
  console.log('rarities:', JSON.stringify(result.rarities));
  console.log('mutations:', result.mutations, '| new species:', result.newSpecies,
              '| levels gained:', result.levels, '| encounters:', result.encounters);
  console.log('stuck states:', result.stuck.length ? result.stuck : 'none');
  console.log('longest fight:', result.longestFight + 's',
              result.slow.length ? '| over 45s: ' + result.slow.join(', ') : '');

  // every menu, every tab
  const menus = [['shop','rods'],['shop','bait'],['fishdex',null],['bag','catches'],['bag','rods'],
                 ['bag','bait'],['stats','stats'],['stats','ach'],['settings',null],['map',null]];
  for (const [p, t] of menus) {
    await page.evaluate(([p,t]) => { VF.panels.close(); VF.panels.open(p, t); }, [p,t]);
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => !!document.querySelector('.panel'));
    if (!ok) errors.push('panel failed to render: ' + p + '/' + t);
  }
  await page.evaluate(() => VF.panels.close());

  // save round-trip
  const saveCheck = await page.evaluate(async () => {
    VF.save.save();
    const before = { money: VF.state.data.money, level: VF.state.data.level,
                     dex: Object.keys(VF.state.data.fishdex).length,
                     kept: VF.state.data.kept.length, casts: VF.state.data.stats.casts };
    VF.state.data = VF.state.defaults();
    const r = VF.save.load();
    const after = { money: VF.state.data.money, level: VF.state.data.level,
                    dex: Object.keys(VF.state.data.fishdex).length,
                    kept: VF.state.data.kept.length, casts: VF.state.data.stats.casts };
    return { loaded: r.loaded, before, after, match: JSON.stringify(before) === JSON.stringify(after) };
  });
  console.log('save round-trip:', saveCheck.match ? 'OK' : 'MISMATCH', JSON.stringify(saveCheck.after));

  // frame rate over 3 seconds
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    (function c() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(c); else res(n / 3); })();
  }));
  console.log('fps:', fps.toFixed(1));

  const leaks = await page.evaluate(() => ({
    particles: VF.particles.count(),
    toasts: document.querySelectorAll('.toast').length,
    modalKids: document.getElementById('modal').children.length
  }));
  console.log('runtime:', JSON.stringify(leaks));

  console.log('\nerrors:', errors.length);
  errors.slice(0, 15).forEach(e => console.log('  !', e));
  await browser.close();
  process.exit(errors.length || result.stuck.length ? 1 : 0);
})();
