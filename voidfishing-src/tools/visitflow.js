/* Drives a whole conversation the way a player would: open the journal, click
   through to the person, advance every line, and check the state at each step. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('#bootStart');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 99; d.money = 5e9; d.stats.catches = 400; d.stats.voidCatches = 3;
    d.treasures = { key: 1, plate: 1 };
    VF.fish.list.forEach((f, i) => { if (i % 2) d.fishdex[f.id] = { caught: 1, mutations: {}, record: {} }; });
  });

  const note = [];

  // 1. the journal route
  await page.click('.mbtn[data-panel="journal"]');
  await page.waitForTimeout(300);
  await page.click('.tabs .tab >> nth=1');
  await page.waitForTimeout(250);
  const btns = await page.$$('.npc-row button');
  note.push('people rows with a button: ' + btns.length);
  if (btns.length) {
    await btns[0].click();
    await page.waitForTimeout(500);
    note.push('panel closed: ' + await page.evaluate(() => !VF.panels.isOpen()));
    note.push('visit active: ' + await page.evaluate(() => VF.visit.active()));
  }

  // 2. walk out, then click through
  await page.waitForTimeout(1700);
  note.push('phase after walk: ' + await page.evaluate(() => VF.visit.S.phase));
  note.push('caption visible: ' + await page.evaluate(() =>
    !document.getElementById('caption').classList.contains('hidden')));
  note.push('caption text: ' + await page.evaluate(() =>
    document.getElementById('captionText').textContent.slice(0, 40)));

  // clicking too fast must not skip the line
  await page.mouse.click(640, 300);
  note.push('index after instant click: ' + await page.evaluate(() => VF.visit.S.index));

  let guard = 0;
  while (await page.evaluate(() => VF.visit.S.phase === 'talk') && guard++ < 12) {
    await page.waitForTimeout(700);
    await page.mouse.click(640, 300);
  }
  note.push('clicks to finish: ' + guard);
  note.push('phase now: ' + await page.evaluate(() => VF.visit.S.phase));

  // 3. back home, and fishing works again
  await page.waitForTimeout(1600);
  note.push('phase settled: ' + await page.evaluate(() => VF.visit.S.phase));
  note.push('hud restored: ' + await page.evaluate(() =>
    !document.getElementById('hud').classList.contains('visiting')));
  await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
  await page.waitForTimeout(500);
  note.push('can still cast: ' + await page.evaluate(() => VF.fishing.S.state));

  // 4. refusing to leave mid-fight
  await page.evaluate(() => { VF.fishing.hardReset(); VF.fishing.S.state = 'casting'; });
  note.push('canVisit mid-cast: ' + await page.evaluate(() => VF.visit.canVisit()));
  await page.evaluate(() => { VF.fishing.hardReset(); });

  // 5. escape leaves early
  await page.evaluate(() => { if (VF.panels.isOpen()) VF.panels.closeNow ? VF.panels.closeNow() : VF.panels.close(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => VF.visit.start('keeper'));
  await page.waitForTimeout(1700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  note.push('escape → phase: ' + await page.evaluate(() => VF.visit.S.phase));
  await page.waitForTimeout(1500);
  note.push('settled: ' + await page.evaluate(() => VF.visit.S.phase));

  console.log(note.join('\n'));
  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
