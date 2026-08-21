/* Real-scene shots of the angler at working scale, one per rod state. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#bootStart');
  await page.waitForTimeout(600);
  await page.evaluate(() => { VF.state.data.settings.timeCycle = 0.72; });
  const shots = [
    ['idle',   () => { VF.fishing.hardReset(); }],
    ['charge', () => { VF.fishing.hardReset(); VF.fishing.beginCharge(); }],
    ['wait',   () => { VF.fishing.hardReset(); VF.fishing.beginCharge();
                       setTimeout(() => VF.fishing.releaseCharge(), 500); }],
    ['reel',   () => { VF.fishing.hardReset(); VF.fishing.beginCharge();
                       setTimeout(() => VF.fishing.releaseCharge(), 300);
                       setTimeout(() => { VF.fishing.S.timer = 0.05; }, 900);
                       setTimeout(() => { if (VF.fishing.S.state === 'bite') VF.fishing.hook(); }, 1700); }]
  ];
  for (const [name, fn] of shots) {
    await page.evaluate(`(${fn.toString()})()`);
    await page.waitForTimeout(name === 'reel' ? 2600 : name === 'wait' ? 1800 : name === 'charge' ? 900 : 600);
    if (name === 'reel') {
      await page.evaluate(() => {
        const S = VF.fishing.S;
        if (S.state === 'reeling' && S.fight) { S.fight.tension = 0.55; S.fight.reeling = true; }
      });
      await page.waitForTimeout(300);
    }
    // crop tight on the angler
    await page.screenshot({ path: 'tools/fig-' + name + '.png',
      clip: { x: 220, y: 500, width: 340, height: 190 } });
  }
  await browser.close();
})();
