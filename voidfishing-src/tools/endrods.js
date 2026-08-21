/* The far end of the rod list, where it stops being equipment. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(350);
  await page.click('#bootStart');
  await page.waitForTimeout(300);

  // two states: everything unlocked, and the endgame rods still gated
  for (const [name, unlock] of [['locked', false], ['unlocked', true]]) {
    await page.evaluate((unlock) => {
      const d = VF.state.data;
      d.level = unlock ? 99 : 82;
      d.money = unlock ? 5e11 : 3e10;
      d.stats.voidCatches = unlock ? 3 : 1;
      d.stats.glitchCatches = unlock ? 2 : 0;
      d.secrets = unlock ? { the_last_water: Date.now() } : {};
      d.ownedRods = ['wood'];
      VF.panels.open('shop', 'rods');
    }, unlock);
    await page.waitForTimeout(450);
    await page.evaluate(() => {
      const b = document.querySelector('.panel-body.scroll');
      if (b) b.scrollTop = b.scrollHeight;
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'tools/endrods-' + name + '.png' });
    await page.evaluate(() => VF.panels.close());
    await page.waitForTimeout(250);
  }
  console.log('errors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
