/* Verifies the audio engine actually produces signal, that every effect fires
   without error, and that levels stay inside the limiter. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(1200);

  const measure = await page.evaluate(async () => {
    const an = VF.audio.tap();
    if (!an) return { error: 'no analyser — audio not running' };
    const buf = new Float32Array(an.fftSize);
    const freq = new Float32Array(an.frequencyBinCount);

    function rms() {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    }
    function peak() {
      an.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
      return p;
    }
    async function sample(ms) {
      const t0 = performance.now();
      let r = 0, p = 0, n = 0;
      while (performance.now() - t0 < ms) {
        r += rms(); p = Math.max(p, peak()); n++;
        await new Promise(res => requestAnimationFrame(res));
      }
      return { rms: +(r / n).toFixed(5), peak: +p.toFixed(4) };
    }

    const out = {};
    const S = VF.state.data.settings;

    /* The reel ducks the ambient bed while it runs, so total level is the wrong
       thing to measure. It lives at 1-6kHz where the water does not, so the
       test watches that band instead. */
    function bandDb(loHz, hiHz) {
      const nyq = VF.audio.tap().context.sampleRate / 2;
      an.getFloatFrequencyData(freq);
      let peak = -Infinity;
      for (let i = 0; i < freq.length; i++) {
        const hz = (i / freq.length) * nyq;
        if (hz >= loHz && hz <= hiHz) peak = Math.max(peak, freq[i]);
      }
      return peak;
    }
    async function sampleBand(ms, lo, hi) {
      const t0 = performance.now();
      let best = -Infinity;
      while (performance.now() - t0 < ms) {
        best = Math.max(best, bandDb(lo, hi));
        await new Promise(res => requestAnimationFrame(res));
      }
      return Math.round(best);
    }

    // music is muted for this measurement: a bell landing mid-sample swamps
    // the very band the reel occupies
    // weather also lives in this band, so it is pinned for the duration
    const musicWas = S.music;
    S.music = 0; VF.audio.setVolumes();
    VF.weather.force('clear');
    for (let i = 0; i < 60; i++) VF.weather.tick(0.5);
    // the world keeps making ambient noise on its own timers; silence just those
    // for the duration so the reel is the only thing in the band
    const muted = {};
    ['splash', 'nibble', 'surge', 'thunder', 'bite', 'cast'].forEach(function (k) {
      muted[k] = VF.audio[k]; VF.audio[k] = function () {};
    });
    // the earlier stingers duck the ambient bed; let it come all the way back
    // before taking a baseline, or the reel looks louder than it is
    await new Promise(r => setTimeout(r, 7000));
    const base = await sampleBand(1600, 1200, 6000);
    VF.audio.reelStart();
    for (let i = 0; i <= 10; i++) {
      VF.audio.reelTension(i / 10);
      await new Promise(r => setTimeout(r, 60));
    }
    const during = await sampleBand(900, 1200, 6000);
    VF.audio.reelStop();
    /* Watch it decay rather than taking one snapshot: a single window can catch
       a stray transient, and what matters is that the loop returns to the
       resting floor at all, not what it reads at one arbitrary moment. */
    const decay = [];
    for (let i = 0; i < 7; i++) decay.push(await sampleBand(900, 1200, 6000));
    const after = Math.min.apply(null, decay);
    out.reelDecay = decay;
    Object.keys(muted).forEach(function (k) { VF.audio[k] = muted[k]; });
    S.music = musicWas; VF.audio.setVolumes();
    out.reelBandDb = { base: base, during: during, after: after };
    out.reelRise = during - base;
    out.reelResidual = after - base;

    // frequency balance of the resting bed: is there content across the range?


    function spectrum() {
      const nyq = VF.audio.tap().context.sampleRate / 2;
      const edges = [0, 120, 500, 2000, 8000, nyq];
      const names = ['sub', 'low', 'mid', 'high', 'air'];
      const bands = names.map(() => -Infinity);
      an.getFloatFrequencyData(freq);
      for (let i = 0; i < freq.length; i++) {
        const hz = (i / freq.length) * nyq;
        for (let b = 0; b < names.length; b++) {
          if (hz >= edges[b] && hz < edges[b + 1]) { bands[b] = Math.max(bands[b], freq[i]); break; }
        }
      }
      const o = {};
      names.forEach((n, i) => { o[n] = Math.round(bands[i]); });
      return o;
    }

    // music alone, then effects bed alone, so a scooped mix is visible
    S.sfx = 0; VF.audio.setVolumes();
    await new Promise(r => setTimeout(r, 2500));
    out.musicOnly = await sample(1200);
    out.musicSpectrum = spectrum();
    S.sfx = 0.75; S.music = 0; VF.audio.setVolumes();
    await new Promise(r => setTimeout(r, 2000));
    out.bedOnly = await sample(1200);
    out.bedSpectrum = spectrum();
    S.music = 0.55; VF.audio.setVolumes();
    await new Promise(r => setTimeout(r, 2000));

    out.ambientOnly = await sample(1400);

    const fx = ['click','hover','back','error','buy','cast','splash','nibble','snap',
                'surge','levelUp','discover','achievement','sell','release','thunder'];
    const fired = [];
    for (const f of fx) {
      try { VF.audio[f](f === 'cast' ? 0.9 : f === 'splash' ? 1 : f === 'thunder' ? 0.05 : undefined); fired.push(f); }
      catch (e) { fired.push(f + ':ERR'); }
      await new Promise(r => setTimeout(r, 120));
    }
    out.fired = fired.length;
    out.fireErrors = fired.filter(f => f.includes('ERR'));

    // the loudest thing in the game, layered
    VF.audio.bite(6);
    VF.audio.stinger('void', 6);
    VF.audio.encounter();
    out.loudest = await sample(1800);

    // spectral balance of the resting bed, in dBFS per band
    await new Promise(r => setTimeout(r, 900));
    const nyq = VF.audio.tap().context.sampleRate / 2;
    const edges = [0, 120, 500, 2000, 8000, nyq];
    const names = ['sub', 'low', 'mid', 'high', 'air'];
    const bands = names.map(() => -Infinity);
    an.getFloatFrequencyData(freq);
    for (let i = 0; i < freq.length; i++) {
      const hz = (i / freq.length) * nyq;
      for (let b = 0; b < names.length; b++) {
        if (hz >= edges[b] && hz < edges[b + 1]) { bands[b] = Math.max(bands[b], freq[i]); break; }
      }
    }
    out.spectrumDb = {};
    names.forEach((n, i) => { out.spectrumDb[n] = Math.round(bands[i]); });
    return out;
  });

  console.log(JSON.stringify(measure, null, 2));
  const verdict = [];
  if (measure.error) verdict.push('FAIL: ' + measure.error);
  else {
    if (measure.ambientOnly.rms < 0.0008) verdict.push('FAIL: ambient bed is silent');
    if (measure.loudest.peak > 0.99) verdict.push('FAIL: output is clipping (peak ' + measure.loudest.peak + ')');
    if (measure.reelRise < 6) verdict.push('WARN: reel loop barely rises over the bed (+' + measure.reelRise + 'dB)');
    if (measure.reelResidual > Math.max(3, measure.reelRise * 0.4))
      verdict.push('FAIL: reel loop never returned to the floor (best +' +
                   measure.reelResidual + 'dB, decay ' + measure.reelDecay.join('/') + ')');
    if (measure.fireErrors.length) verdict.push('FAIL: ' + measure.fireErrors.join(', '));
  }
  console.log(verdict.length ? verdict.join('\n') : 'audio OK: signal present, no clipping, all effects fired');
  console.log('errors:', errors.length);
  errors.slice(0, 8).forEach(e => console.log('  !', e));
  await browser.close();
  process.exit(errors.length || verdict.some(v => v.startsWith('FAIL')) ? 1 : 0);
})();
