/* Checks the interface at several viewport sizes and reports overflow. */
const { chromium } = require('playwright');
const path = require('path');
const SIZES = [[1920,1080,'desktop-hd'],[1440,900,'laptop'],[1280,720,'laptop-sm'],
               [1024,640,'small'],[860,540,'narrow'],[720,900,'portrait']];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  for (const [w, h, name] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.click('#bootStart');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const d = VF.state.data;
      d.level = 45; d.money = 12345678;
      VF.progression.checkUnlocks();
      d.ownedRods = VF.rods.list.filter(r => r.level <= 45).map(r => r.id);
      d.rod = 'celestial';
      VF.fish.list.slice(0, 26).forEach(f => { d.fishdex[f.id] = { caught: 3, firstSeen: Date.now(),
        mutations: {}, record: { kg: 5, m: 1, pct: 0.6, mutation: null } }; });
      VF.hud.refreshAll();
    });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => ({
      docScrollW: document.documentElement.scrollWidth, docW: document.documentElement.clientWidth,
      docScrollH: document.documentElement.scrollHeight, docH: document.documentElement.clientHeight,
      offscreen: Array.from(document.querySelectorAll('#hud button, #hud .chip')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1 || r.top < -1;
      }).map(el => (el.id || el.className) + ' @' + Math.round(el.getBoundingClientRect().left) + ',' + Math.round(el.getBoundingClientRect().top))
    }));
    await page.screenshot({ path: 'tools/rs-' + name + '.png' });
    // and a panel at this size
    await page.evaluate(() => VF.panels.open('shop'));
    await page.waitForTimeout(320);
    const panelFit = await page.evaluate(() => {
      const p = document.querySelector('.panel');
      if (!p) return 'missing';
      const r = p.getBoundingClientRect();
      return { fits: r.width <= innerWidth && r.height <= innerHeight,
               w: Math.round(r.width), h: Math.round(r.height) };
    });
    await page.screenshot({ path: 'tools/rs-' + name + '-panel.png' });
    console.log(name.padEnd(12), w + 'x' + h,
      '| hscroll:', overflow.docScrollW > overflow.docW ? 'YES' : 'no',
      '| vscroll:', overflow.docScrollH > overflow.docH ? 'YES' : 'no',
      '| offscreen HUD:', overflow.offscreen.length ? overflow.offscreen.join(', ') : 'none',
      '| panel:', JSON.stringify(panelFit));
    await page.close();
  }
  console.log('\nerrors:', errors.length);
  errors.forEach(e => console.log('  !', e));
  await browser.close();
})();
