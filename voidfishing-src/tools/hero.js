/* One clean frame of the finished thing, plus the conversation. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 40; d.money = 148300; d.rod = 'deepwater'; d.bait = 'glowworm';
    d.stats.catches = 210; d.stats.casts = 400; d.stats.voidCatches = 1;
    d.treasures = { key: 1 };
    VF.bait.list.forEach(b => { if (!b.unlimited) VF.bait.add(b.id, 40); });
    d.settings.timeCycle = 0.74;
    VF.hud.refreshAll();
    VF.fishing.beginCharge();
    setTimeout(() => VF.fishing.releaseCharge(), 620);
  });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'tools/hero-scene.png' });

  await page.evaluate(() => { VF.fishing.hardReset(); VF.visit.start('fisherman'); });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'tools/hero-visit.png' });
  await browser.close();
})();
