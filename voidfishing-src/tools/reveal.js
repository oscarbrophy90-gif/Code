/* Captures the new-species reveal mid-animation, and verifies audio actually
   builds a running graph. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(700);

  const audio = await page.evaluate(() => ({ ready: VF.audio.isReady() }));
  console.log('audio running:', audio.ready);
  await page.evaluate(() => {
    VF.audio.stinger('grand', 4); VF.audio.cast(0.9); VF.audio.splash(1);
    VF.audio.bite(4); VF.audio.reelStart(); VF.audio.surge(); VF.audio.thunder(0.1);
    VF.audio.levelUp(); VF.audio.discover(); VF.audio.achievement(); VF.audio.encounter();
    VF.audio.snap(); VF.audio.sell(); VF.audio.release(); VF.audio.buy(); VF.audio.error();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => VF.audio.reelStop());
  console.log('all sfx invoked without error');

  await page.evaluate(() => {
    VF.state.data.location = 'abyss'; VF.loot.invalidatePool(); VF.bus.emit('location:changed');
    VF.fishing.S.state = 'landed';
    const c = VF.loot.roll({ forceFish: 'prism_ray' });
    c.isNew = true; c.pct = 0.88;
    VF.fishing.S.lastResult = c;
    VF.bus.emit('fishing:landed', c);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'tools/sc-reveal-mid.png' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tools/sc-reveal-done.png' });
  await browser.close();
})();
