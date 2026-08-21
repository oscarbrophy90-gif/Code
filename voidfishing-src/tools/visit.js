/* Walks the player over to each NPC and screenshots the conversation. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 99; d.money = 5e9;
    d.stats.catches = 400; d.stats.voidCatches = 3;
    d.treasures = { key: 1, plate: 1 };
    VF.fish.list.forEach((f, i) => { if (i % 2) d.fishdex[f.id] = { caught: 1, mutations: {}, record: {} }; });
    VF.state.data.settings.timeCycle = 0.72;
  });

  const who = process.argv[2] ? [process.argv[2]] : ['keeper', 'archivist', 'fisherman', 'drifter', 'collector'];
  for (const id of who) {
    await page.evaluate((id) => { VF.visit.hardReset(); VF.visit.start(id); }, id);
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'tools/visit-' + id + '-walk.png', clip: { x: 20, y: 430, width: 420, height: 370 } });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'tools/visit-' + id + '.png' });
    await page.evaluate(() => { VF.visit.hardReset(); });
    await page.waitForTimeout(200);
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
