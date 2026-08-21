/* Renders every rod preview to one sheet. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#0a0d14;margin:0;padding:10px';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
    document.body.appendChild(wrap);
    VF.rods.list.forEach((r, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid #1b2230;border-radius:5px;background:linear-gradient(160deg,rgba(255,255,255,.03),rgba(0,0,0,.3));padding:5px';
      const cv = document.createElement('canvas');
      cv.width = 600; cv.height = 264; cv.style.cssText = 'width:100%;height:auto;display:block';
      VF.rodArt.preview(cv.getContext('2d'), r, cv.width, cv.height, 1.2 + i * 0.7);
      cell.appendChild(cv);
      const n = document.createElement('div');
      n.style.cssText = 'font:11px system-ui;color:#b8c4d2;text-align:center;padding-top:3px';
      n.textContent = r.name + '  ·  ' + r.art.style;
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tools/rods.png', fullPage: true });
  await browser.close();
})();
