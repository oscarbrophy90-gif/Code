/* Renders every species to one sheet so the art can be reviewed at a glance. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const which = process.argv[2] || 'all';
  await page.evaluate((which) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#0a0d14;margin:0;padding:10px;overflow:auto';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px';
    document.body.appendChild(wrap);
    const list = which === 'all' ? VF.fish.list : VF.fish.list.filter(f => f.rarity === which);
    list.forEach((f, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'text-align:center;border:1px solid #1b2230;border-radius:4px;padding:4px;background:#0d1220';
      const cv = document.createElement('canvas');
      cv.width = 300; cv.height = 170;
      cv.style.cssText = 'width:100%;height:auto';
      const g = cv.getContext('2d');
      g.translate(150, 85);
      VF.fishArt.draw(g, f, VF.fishArt.fitSize(f, 170), { time: i * 0.9 });
      cell.appendChild(cv);
      const n = document.createElement('div');
      n.style.cssText = 'font:10px system-ui;color:' + VF.rarities.color(f.rarity) + ';margin-top:2px';
      n.textContent = f.name;
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
  }, which);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tools/gallery-' + which + '.png', fullPage: true });
  await browser.close();
})();
