/* Loads the game in a real browser, plays a full fishing cycle, and reports
   any console errors, page errors, or stuck states. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [], warnings = [];
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text());
    else if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));

  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const boot = await page.evaluate(() => ({
    hasVF: typeof window.VF === 'object',
    modules: Object.keys(window.VF || {}).sort(),
    fish: window.VF && VF.fish ? VF.fish.count : -1
  }));
  console.log('modules:', boot.modules.join(', '));
  console.log('fish count:', boot.fish);

  /* byId() takes the last entry with a given id and says nothing about it, so a
     duplicate silently deletes a species. Same for rods. Catch it here. */
  const dupes = await page.evaluate(() => {
    function scan(list, what) {
      const seen = Object.create(null), bad = [];
      list.forEach(e => { if (seen[e.id]) bad.push(what + ' ' + e.id); seen[e.id] = 1; });
      return bad;
    }
    return scan(VF.fish.list, 'fish').concat(scan(VF.rods.list, 'rod'))
           .concat(scan(VF.treasureData.list, 'treasure'));
  });
  console.log('duplicate ids:', dupes.length ? dupes.join(', ') : 'none');
  if (dupes.length) process.exitCode = 1;

  await page.screenshot({ path: 'tools/shot-title.png' });

  await page.click('#bootStart');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tools/shot-scene.png' });

  // drive a full cycle deterministically through the API
  const cycle = await page.evaluate(async () => {
    const log = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    VF.fishing.beginCharge();
    await sleep(700);
    VF.fishing.releaseCharge();
    log.push('cast state=' + VF.fishing.state());
    await sleep(900);
    log.push('after flight=' + VF.fishing.state());
    // shorten the wait
    VF.fishing.S.biteWait = 0.05;
    await sleep(300);
    log.push('bite state=' + VF.fishing.state());
    const hooked = VF.fishing.hook();
    log.push('hooked=' + hooked + ' state=' + VF.fishing.state());
    // play the fight
    let guard = 0;
    while (VF.fishing.state() === "reeling" && guard++ < 1500) {
      const f = VF.fishing.S.fight;
      VF.fishing.setReeling(f.tension < 0.6);
      await sleep(16);
    }
    log.push('fight ended state=' + VF.fishing.state() + ' guard=' + guard);
    return log;
  });
  cycle.forEach(l => console.log(' ', l));

  await page.waitForTimeout(700);
  const modalOpen = await page.evaluate(() => VF.catchUI.isOpen());
  console.log('catch card open:', modalOpen);
  if (modalOpen) await page.screenshot({ path: 'tools/shot-catch.png' });

  console.log('\nerrors:', errors.length);
  errors.slice(0, 12).forEach(e => console.log('  !', e));
  console.log('warnings:', warnings.length);
  warnings.slice(0, 6).forEach(e => console.log('  ~', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
