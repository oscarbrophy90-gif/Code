/* The single file has to behave exactly like the folder: boot, cast, land a
   fish, talk to somebody, open every menu, with no console errors. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', r => errs.push('REQUEST FAILED ' + r.url()));

  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'void-fishing.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  console.log('modules:', await page.evaluate(() => Object.keys(window.VF).length));
  await page.click('#bootStart');
  await page.waitForTimeout(400);

  // a whole cycle
  const cycle = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    VF.fishing.beginCharge(); await sleep(600); VF.fishing.releaseCharge();
    await sleep(900);
    VF.fishing.S.biteWait = 0.05; await sleep(300);
    if (VF.fishing.S.state === 'bite') VF.fishing.hook();
    await sleep(200);
    for (let i = 0; i < 400 && VF.fishing.S.state === 'reeling'; i++) {
      VF.fishing.setReeling(VF.fishing.S.fight.tension < 0.6);
      await sleep(16);
    }
    return VF.fishing.S.state;
  });
  console.log('cycle ended in:', cycle);

  await page.evaluate(() => { if (VF.catchUI.isOpen()) VF.catchUI.defaultAction(); });
  await page.waitForTimeout(400);

  // every menu
  for (const p of ['shop', 'fishdex', 'bag', 'wardrobe', 'journal', 'stats', 'settings', 'map']) {
    await page.evaluate((p) => VF.panels.open(p), p);
    await page.waitForTimeout(180);
    await page.evaluate(() => VF.panels.close());
    await page.waitForTimeout(120);
  }
  console.log('menus opened: 8');

  // a conversation
  await page.evaluate(() => { VF.fishing.hardReset(); VF.visit.start('keeper'); });
  await page.waitForTimeout(1900);
  console.log('visit phase:', await page.evaluate(() => VF.visit.S.phase));
  let g = 0;
  while (await page.evaluate(() => VF.visit.S.phase === 'talk') && g++ < 10) {
    await page.waitForTimeout(700);
    await page.mouse.click(640, 300);
  }
  await page.waitForTimeout(1600);
  console.log('visit settled:', await page.evaluate(() => VF.visit.S.phase));

  await page.screenshot({ path: 'tools/single-file-check.png' });
  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
