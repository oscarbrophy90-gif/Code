/* Renders a handful of species large so the surface detail can be judged. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const ids = (process.argv[2] || 'smallmouth,golden_bass,silver_pike,moonfish,abyss_angler,leviathan,prism_ray,tidewalker').split(',');
  await page.evaluate((ids) => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#0a0d14;margin:0;padding:8px';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px';
    document.body.appendChild(wrap);
    ids.forEach((id, i) => {
      const f = VF.fish.byId(id); if (!f) return;
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid #1b2230;border-radius:4px;background:#0d1220;text-align:center;padding:4px';
      const cv = document.createElement('canvas');
      cv.width = 1180; cv.height = 420; cv.style.cssText = 'width:100%;height:auto';
      const g = cv.getContext('2d');
      g.translate(590, 210);
      VF.fishArt.draw(g, f, VF.fishArt.fitSize(f, 420), { time: i * 0.8 });
      cell.appendChild(cv);
      const n = document.createElement('div');
      n.style.cssText = 'font:12px system-ui;color:' + VF.rarities.color(f.rarity);
      n.textContent = f.name;
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
  }, ids);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tools/closeup.png', fullPage: true });
  await browser.close();
})();
