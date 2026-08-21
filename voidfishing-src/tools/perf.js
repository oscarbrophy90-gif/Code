const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(600);
  for (const q of ['high', 'medium', 'low']) {
    const r = await page.evaluate(async (q) => {
      VF.state.data.settings.quality = q;
      document.body.className = 'q-' + q;
      VF.scene.resize(); VF.bus.emit('settings:quality');
      await new Promise(r => setTimeout(r, 400));
      VF.scene.profile(true);
      const t0 = performance.now();
      let n = 0;
      await new Promise(res => { (function c(){ n++; if (performance.now()-t0 < 3000) requestAnimationFrame(c); else res(); })(); });
      const p = VF.scene.profile(false);
      return { q, fps: +(n/3).toFixed(1), prof: p };
    }, q);
    const sorted = Object.entries(r.prof.ms).sort((a,b)=>b[1]-a[1]);
    console.log('\n[' + r.q + '] fps=' + r.fps + '  draw=' + r.prof.totalPerFrame + 'ms/frame');
    console.log('  ' + sorted.map(([k,v]) => k+':'+v.toFixed(2)).join('  '));
  }
  await browser.close();
})();
