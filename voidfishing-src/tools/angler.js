/* Renders the angler large in each pose so the rig can be judged. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 980 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#070a10;margin:0;padding:8px';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
    document.body.appendChild(wrap);
    const poses = [
      ['idle',     { lean: 0.05, pull: 0.02, alert: 0,    crank: 0 }, 'sit'],
      ['charging', { lean: 0.47, pull: 0.65, alert: 0.1,  crank: 0 }, 'sit'],
      ['cast',     { lean: -0.7, pull: 0.30, alert: 0.2,  crank: 0 }, 'sit'],
      ['bite',     { lean: -0.16, pull: 0.30, alert: 1,   crank: 0 }, 'sit'],
      ['reel low', { lean: 0.36, pull: 0.52, alert: 0.5,  crank: 1 }, 'sit'],
      ['reel max', { lean: 0.85, pull: 0.78, alert: 0.75, crank: 1 }, 'sit'],
      ['stand',    { lean: 0.05, pull: 0.02, alert: 0,    crank: 0 }, 'stand'],
      ['walk',     { lean: 0.05, pull: 0.02, alert: 0,    crank: 0 }, 'walk']
    ];
    poses.forEach(([label, pose, mode]) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'border:1px solid #1b2230;border-radius:4px;background:#0b1018;text-align:center;padding:4px';
      const cv = document.createElement('canvas');
      cv.width = 620; cv.height = 620; cv.style.cssText = 'width:100%;height:auto';
      const g = cv.getContext('2d');
      const fh = 400;
      Object.assign(VF.anglerArt.pose, pose);
      g.translate(230, mode === 'sit' ? 420 : 560);
      if (mode === 'sit') {
        g.fillStyle = '#0e1420';
        g.fillRect(-260, 60, 520, 240);
      } else {
        g.fillStyle = '#0e1420';
        g.fillRect(-260, 0, 620, 200);
      }
      const hand = VF.anglerArt.hand(fh, mode, 1);
      VF.anglerArt.draw(g, VF.cosmetics.get('fit_scarf').c, fh, 1.2, {
        mode: mode === 'walk' ? 'walk' : mode,
        rim: 'rgba(200,220,255,0.26)',
        hand: mode === 'sit' ? hand : null,
        rodAngle: -0.62,
        aim: { x: 500, y: -100 },
        walk: mode === 'walk' ? 1 : 0,
        phase: mode === 'walk' ? 1.1 : 0,
        facing: 1
      });
      cell.appendChild(cv);
      const n = document.createElement('div');
      n.style.cssText = 'font:12px system-ui;color:#8ea3bd';
      n.textContent = label;
      cell.appendChild(n);
      wrap.appendChild(cell);
    });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tools/angler.png', fullPage: true });
  await browser.close();
})();
