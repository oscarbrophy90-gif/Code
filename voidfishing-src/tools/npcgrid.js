/* All five people side by side, at working scale, standing and walking. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1320, height: 760 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#0c1119;margin:0;padding:6px';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px';
    document.body.appendChild(wrap);
    [0, 1].forEach((row) => {
      VF.npcs.list.forEach((n) => {
        const cell = document.createElement('div');
        cell.style.cssText = 'border:1px solid #1b2230;border-radius:4px;background:#101725;text-align:center;padding:3px';
        const cv = document.createElement('canvas');
        cv.width = 480; cv.height = 640; cv.style.cssText = 'width:100%;height:auto';
        const g = cv.getContext('2d');
        g.fillStyle = '#141c2a'; g.fillRect(0, 570, 480, 70);
        g.translate(240, 575);
        VF.npcArt.draw(g, n, 460, 1.4, {
          facing: row ? -1 : 1, rim: 'rgba(200,220,255,0.26)',
          walk: row ? 1 : 0, phase: row ? 1.1 : 0, talking: !row
        });
        cell.appendChild(cv);
        const l = document.createElement('div');
        l.style.cssText = 'font:11px system-ui;color:' + n.color;
        l.textContent = n.name.toLowerCase() + (row ? ' · walking' : '');
        cell.appendChild(l);
        wrap.appendChild(cell);
      });
    });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tools/npcgrid.png', fullPage: true });
  await browser.close();
})();
