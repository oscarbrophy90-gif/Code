/* The "speak to all five" achievement must need five actual conversations. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('#bootStart');
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 99; d.money = 5e9; d.stats.catches = 400; d.stats.voidCatches = 3;
    d.treasures = { key: 1, plate: 1 }; d.stats.casts = 500; d.cosmetics = VF.cosmetics.list.slice(0, 28).map(c => c.id);
    VF.fish.list.forEach((f, i) => { if (i % 2) d.fishdex[f.id] = { caught: 1, mutations: {}, record: {} }; });
  });
  // sit for a while so anyNew() runs many times, then check nothing was written
  await page.waitForTimeout(4000);
  const idle = await page.evaluate(() => ({
    records: Object.keys(VF.state.data.npcs).length,
    metAll: !!VF.state.data.achievements.met_all
  }));
  console.log('after 4s of idling:', JSON.stringify(idle));

  // now actually talk to each of them
  for (const n of ['keeper', 'archivist', 'fisherman', 'drifter', 'collector']) {
    const ok = await page.evaluate((n) => { VF.visit.hardReset(); return VF.visit.start(n); }, n);
    if (!ok) { console.log('  ' + n + ': not unlocked yet'); continue; }
    await page.waitForTimeout(1700);
    let g = 0;
    while (await page.evaluate(() => VF.visit.S.phase === 'talk') && g++ < 10) {
      await page.waitForTimeout(650);
      await page.evaluate(() => VF.visit.advance());
    }
    await page.waitForTimeout(1500);
  }
  const after = await page.evaluate(() => ({
    talkedTo: VF.npcs.list.filter(n => VF.npcs.met(n.id)).map(n => n.id),
    metAll: !!VF.state.data.achievements.met_all
  }));
  console.log('after talking:', JSON.stringify(after));
  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
