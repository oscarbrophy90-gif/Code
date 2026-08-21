const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await p.waitForTimeout(400); await p.click('#bootStart'); await p.waitForTimeout(800);
  const out = await p.evaluate(async () => {
    const an = VF.audio.tap();
    const freq = new Float32Array(an.frequencyBinCount);
    const nyq = an.context.sampleRate / 2;
    function band(lo, hi) {
      an.getFloatFrequencyData(freq);
      let m = -Infinity;
      for (let i = 0; i < freq.length; i++) {
        const hz = (i / freq.length) * nyq;
        if (hz >= lo && hz <= hi) m = Math.max(m, freq[i]);
      }
      return Math.round(m);
    }
    async function hold(ms) {
      const t0 = performance.now(); let m = -Infinity;
      while (performance.now() - t0 < ms) { m = Math.max(m, band(1200, 6000)); await new Promise(r => requestAnimationFrame(r)); }
      return m;
    }
    async function p2() { return 0; }
    const S = VF.state.data.settings;
    S.music = 0; VF.audio.setVolumes();
    VF.weather.force('clear'); for (let i = 0; i < 80; i++) VF.weather.tick(0.5);
    await new Promise(r => setTimeout(r, 6000));
    const rows = [];
    rows.push(['quiet baseline', await hold(1500)]);
    VF.audio.reelStart();
    for (let i = 0; i <= 10; i++) { VF.audio.reelTension(i / 10); await new Promise(r => setTimeout(r, 60)); }
    rows.push(['reeling(sweep to 1)', await hold(900)]);
    VF.audio.reelStop();
    rows.push(['reelLoop null?', await p2()]);
    for (let i = 0; i < 10; i++) rows.push(['+' + ((i + 1) * 1.2).toFixed(1) + 's', await hold(1200)]);
    // and with the sfx bus muted entirely, to see the true floor
    S.sfx = 0; VF.audio.setVolumes();
    await new Promise(r => setTimeout(r, 1200));
    rows.push(['sfx muted', await hold(1200)]);
    S.sfx = 0.75; VF.audio.setVolumes();
    return rows;
  });
  out.forEach(r => console.log(String(r[0]).padEnd(16), r[1] + ' dB'));
  await b.close();
})();
