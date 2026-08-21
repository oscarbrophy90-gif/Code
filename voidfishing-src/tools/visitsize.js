/* A conversation has to fit on a phone as well as it does on a desktop. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const sizes = [['desktop', 1920, 1080], ['laptop', 1280, 720], ['narrow', 860, 540], ['portrait', 420, 780]];
  const errs = [];
  for (const [name, w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errs.push(name + ' PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(name + ' ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.click('#bootStart');
    await page.waitForTimeout(300);
    await page.evaluate(() => { VF.state.data.settings.timeCycle = 0.72; VF.visit.start('keeper'); });
    await page.waitForTimeout(2000);
    const geo = await page.evaluate(() => {
      const sp = VF.scene.visitSpots();
      const L = VF.scene.L;
      const cap = document.getElementById('caption').getBoundingClientRect();
      return {
        npcX: Math.round(sp.npcTo), anglerX: Math.round(sp.anglerTo),
        fh: Math.round(L.figureH), w: Math.round(L.w),
        npcLeftEdge: Math.round(sp.npcTo - L.figureH * 0.20),
        groundNpc: Math.round(VF.scene.groundY(sp.npcTo)),
        capTop: Math.round(cap.top), capBottom: Math.round(cap.bottom),
        docH: document.documentElement.clientHeight,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });
    console.log(name.padEnd(9), w + 'x' + h, JSON.stringify(geo));
    await page.screenshot({ path: 'tools/vsz-' + name + '.png' });
    await page.close();
  }
  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
