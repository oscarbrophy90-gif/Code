/* The fish coming up out of the dark, at several distances. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1240, height: 700 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#0a0f18;margin:0;padding:6px';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px';
    document.body.appendChild(wrap);
    ['golden_bass', 'leviathan', 'g_chair', 'g_yourhook'].forEach((id) => {
      const f = VF.fish.byId(id); if (!f) return;
      [0, 0.25, 0.5, 0.75, 1].forEach((near) => {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px solid #1b2230;border-radius:4px;background:#111a2a;text-align:center;padding:3px';
        const cv = document.createElement('canvas');
        cv.width = 420; cv.height = 240; cv.style.cssText = 'width:100%;height:auto';
        const g = cv.getContext('2d');
        g.translate(210, 120);
        VF.fishArt.drawSilhouette(g, f, 95, 0.9, near);
        cell.appendChild(cv);
        const l = document.createElement('div');
        l.style.cssText = 'font:10px system-ui;color:#7d8fa6';
        l.textContent = f.name.toLowerCase() + ' · ' + near;
        cell.appendChild(l);
        wrap.appendChild(cell);
      });
    });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tools/hooked.png', fullPage: true });
  await browser.close();
})();
