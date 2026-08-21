/* VOID FISHING — the scene.
   One canvas, drawn back to front: sky, stars, horizon feature, distant
   silhouettes, fog, water (gradient + reflection + moonpath + wave lines),
   underwater shapes, bobber and line, then the foreground ledge, the angler
   and the rod. Static layers are cached to offscreen canvases. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;

  let canvas = null, ctx = null;
  let W = 0, H = 0, DPR = 1;
  let t = 0;

  const L = {
    w: 0, h: 0, horizonY: 0, waterH: 0,
    merchant: null,        // the wanderer's screen rectangle while he is here
    rodTip: { x: 0, y: 0 }, rodHand: { x: 0, y: 0 },
    bobber: { x: 0, y: 0, scale: 1, visible: false, bob: 0 },
    castTarget: { x: 0, y: 0 },
    landPoint: { x: 0, y: 0 },
    glowX: 0, glowY: 0,
    figureH: 0, seatX: 0, seatY: 0
  };

  /* ---------------------------------------------------------------- stars */
  let stars = null;
  function buildStars() {
    const q = VF.state.data.settings.quality;
    const n = q === 'low' ? 80 : q === 'medium' ? 165 : 255;
    stars = new Array(n);
    const rnd = VF.rng.make(0xBEEF ^ VF.locations.index(VF.state.data.location) * 7919);
    for (let i = 0; i < n; i++) {
      stars[i] = {
        x: rnd(), y: Math.pow(rnd(), 1.35),
        s: 0.4 + Math.pow(rnd(), 2.6) * 2.1,
        tw: rnd() * TAU,
        sp: 0.4 + rnd() * 1.5,
        bright: 0.35 + rnd() * 0.65,
        big: rnd() < 0.05
      };
    }
  }

  /* --------------------------------------------------------------- grain
     One 128px noise tile handed to the CSS layer. Static after boot. */
  function buildGrain() {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.random() * 255;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = v < 128 ? 0 : Math.round((v - 128) * 1.9);
    }
    g.putImageData(img, 0, 0);
    const el = document.getElementById('grain');
    if (!el) return;
    try { el.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')'; }
    catch (e) { el.style.display = 'none'; }
  }

  /* ------------------------------------------------------- backdrop cache */
  let backdrop = null, backdropKey = '';

  function buildBackdrop() {
    const loc = VF.locations.current();
    const key = loc.id + ':' + Math.round(W) + 'x' + Math.round(H) + ':' + VF.state.data.settings.quality;
    if (backdropKey === key && backdrop) return;
    backdropKey = key;

    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H));
    const g = c.getContext('2d');
    const rnd = VF.rng.make(0xC0FFEE ^ VF.locations.index(loc.id) * 104729);
    const hy = L.horizonY;
    drawSilhouette(g, loc.silhouette, rnd, hy);
    backdrop = c;
  }

  /* Distant land: layered dark shapes sitting on the horizon line. */
  function drawSilhouette(g, style, rnd, hy) {
    if (style === 'none') return;
    const layers = 3;
    for (let l = 0; l < layers; l++) {
      const depth = l / (layers - 1 || 1);
      const alpha = 0.30 + depth * 0.55;
      const maxH = H * (0.026 + depth * 0.052);
      g.globalAlpha = alpha;
      g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(-4, hy + 2);

      if (style === 'rocks') {
        // eroded, rounded headlands rather than sharp peaks
        let x = -4;
        let prev = 0;
        while (x < W + 8) {
          const wid = W * (0.08 + rnd() * 0.16);
          const ht = maxH * (0.30 + rnd() * 0.85);
          g.quadraticCurveTo(x + wid * 0.18, hy - ht * 0.85, x + wid * 0.42, hy - ht);
          g.quadraticCurveTo(x + wid * 0.70, hy - ht * (0.72 + rnd() * 0.28), x + wid, hy - prev);
          prev = maxH * (0.10 + rnd() * 0.30);
          x += wid;
        }
      } else if (style === 'trees') {
        let x = -4;
        while (x < W + 8) {
          const wid = W * (0.010 + rnd() * 0.024);
          const ht = maxH * (0.5 + rnd() * 1.3);
          g.lineTo(x, hy - ht * 0.2);
          g.lineTo(x + wid * 0.5, hy - ht);
          g.lineTo(x + wid, hy - ht * 0.15);
          x += wid * (1 + rnd() * 0.8);
        }
      } else if (style === 'spires') {
        let x = -4;
        while (x < W + 8) {
          const wid = W * (0.02 + rnd() * 0.05);
          const ht = maxH * (0.5 + rnd() * 1.6);
          g.lineTo(x + wid * 0.5, hy - ht);
          g.lineTo(x + wid, hy - ht * 0.08);
          x += wid * (1.1 + rnd() * 1.6);
        }
      } else if (style === 'crystals') {
        let x = -4;
        while (x < W + 8) {
          const wid = W * (0.03 + rnd() * 0.07);
          const ht = maxH * (0.4 + rnd() * 1.5);
          g.lineTo(x + wid * 0.2, hy - ht * 0.5);
          g.lineTo(x + wid * 0.5, hy - ht);
          g.lineTo(x + wid * 0.78, hy - ht * 0.42);
          g.lineTo(x + wid, hy);
          x += wid * (1 + rnd() * 1.1);
        }
      } else if (style === 'ruins') {
        let x = -4;
        while (x < W + 8) {
          const wid = W * (0.03 + rnd() * 0.08);
          const ht = maxH * (0.3 + rnd() * 1.2);
          if (rnd() < 0.7) {
            g.lineTo(x, hy - ht);
            g.lineTo(x + wid, hy - ht * (0.6 + rnd() * 0.5));
            g.lineTo(x + wid, hy);
          }
          x += wid * (1 + rnd() * 1.5);
        }
      } else if (style === 'bones') {
        let x = -4;
        while (x < W + 8) {
          const wid = W * (0.02 + rnd() * 0.05);
          const ht = maxH * (0.6 + rnd() * 1.5);
          g.lineTo(x + wid * 0.5, hy - ht);
          g.lineTo(x + wid * 0.5 + wid * 0.16, hy - ht * 0.86);
          g.lineTo(x + wid, hy - ht * 0.1);
          x += wid * (1.4 + rnd() * 2.4);
        }
      }
      g.lineTo(W + 8, hy + 2);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- setup */

  function init(cv) {
    canvas = cv;
    ctx = cv.getContext('2d', { alpha: false });
    buildGrain();
    resize();
    VF.bus.on('location:changed', function () { backdropKey = ''; buildStars(); seedAmbient(); });
    VF.bus.on('settings:quality', function () { backdropKey = ''; buildStars(); VF.particles.clearAll(); seedAmbient(); });
  }

  function resize() {
    if (!canvas) return;
    DPR = Math.min(window.devicePixelRatio || 1, VF.state.data.settings.quality === 'low' ? 1 : 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(240, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    L.w = W; L.h = H;
    computeLayout();
    backdropKey = '';
    if (!stars) buildStars();
  }

  function computeLayout() {
    const loc = VF.locations.current();
    L.horizonY = Math.round(H * (1 - loc.depth));
    L.waterH = H - L.horizonY;
    L.figureH = Math.min(H * 0.30, W * 0.20);
    L.glowX = W * 0.70;
    L.glowY = L.horizonY - H * 0.145;
    L.seatX = W * 0.20;
    L.seatY = H * 0.90;
    L.landPoint.x = W * 0.42;
    L.landPoint.y = L.horizonY + L.waterH * 0.90;
  }

  function seedAmbient() {
    VF.particles.clearKind(VF.particles.KIND.MOTE);
    const q = VF.state.data.settings.quality;
    const n = q === 'low' ? 14 : q === 'medium' ? 30 : 52;
    VF.particles.ambient(W, H, n, VF.palette.P.star);
  }

  /* ---------------------------------------------------------------- update */

  let castLateral = 0.62;

  function update(dt) {
    t += dt;

    computeLayout();
    updateRod(dt);
    updateBobber(dt);
    updateWeatherParticles(dt);
    VF.particles.update(dt, W, H, L.horizonY + L.waterH * 0.35);
  }

  /* Rod geometry. Bends under load and drifts gently when idle. */
  const rodState = { angle: 0, bend: 0, sway: 0 };

  function updateRod(dt) {
    const S = VF.fishing.S;
    const fh = L.figureH;
    // the body poses first; the rod hangs off whatever the hands are doing
    VF.anglerArt.update(dt, S);
    const h = VF.anglerArt.hand(fh, 'sit', 1);
    L.rodHand.x = L.seatX + h.x;
    L.rodHand.y = L.seatY + h.y;

    let targetAngle = -0.62;                       // radians, up and to the right
    let targetBend = 0.10;

    if (S.state === 'casting') {
      const k = U.clamp(S.flight / 0.35, 0, 1);
      targetAngle = U.lerp(-1.25, -0.42, U.easeOutCubic(k));
      targetBend = U.lerp(0.55, 0.06, k);
    } else if (S.charging) {
      targetAngle = U.lerp(-0.62, -1.15, U.easeInOutSine(S.charge));
      targetBend = 0.10 + S.charge * 0.34;
    } else if (S.state === 'reeling' && S.fight) {
      targetAngle = -0.62 + S.fight.tension * 0.22;
      targetBend = 0.16 + S.fight.tension * 0.40 + S.fight.surge * 0.16;
    } else if (S.state === 'bite') {
      targetBend = 0.10 + Math.sin(t * 26) * 0.16;
    }

    rodState.sway = Math.sin(t * 0.55) * 0.014 + Math.sin(t * 0.23) * 0.02;
    rodState.angle = U.approach(rodState.angle, targetAngle, 0.0015, dt);
    // a rod bends, it does not fold — the cap keeps the tip in front of the angler
    rodState.bend = U.clamp(U.approach(rodState.bend, targetBend, 0.002, dt), 0, 0.78);
  }

  function rodTipPoint() {
    const fh = L.figureH;
    const len = fh * 1.85 * VF.rods.get(VF.state.data.rod).art.len;
    const a = rodState.angle + rodState.sway;
    const bend = rodState.bend;
    // quadratic curve: control point offset perpendicular to the rod line
    const ex = L.rodHand.x + Math.cos(a) * len;
    const ey = L.rodHand.y + Math.sin(a) * len;
    const nx = -Math.sin(a), ny = Math.cos(a);
    // the blank curves progressively: little deflection at the butt, most at the tip
    const cx = L.rodHand.x + Math.cos(a) * len * 0.5 + nx * len * bend * 0.10;
    const cy = L.rodHand.y + Math.sin(a) * len * 0.5 + ny * len * bend * 0.10;
    const tx = ex + nx * len * bend * 0.30;
    const ty = ey + ny * len * bend * 0.30;
    return { x: tx, y: ty, cx: cx, cy: cy, len: len, a: a };
  }

  function updateBobber(dt) {
    const S = VF.fishing.S;
    const tip = rodTipPoint();
    L.rodTip.x = tip.x; L.rodTip.y = tip.y;

    const b = L.bobber;
    const near = L.horizonY + L.waterH * 0.80;
    const far = L.horizonY + L.waterH * 0.09;
    const distT = U.clamp(S.castDist / 1.5, 0, 1);
    L.castTarget.x = W * castLateral;
    L.castTarget.y = U.lerp(near, far, distT);

    if (S.state === 'idle' || S.state === 'landed') { b.visible = false; return; }
    b.visible = true;

    if (S.state === 'casting') {
      const k = U.easeOutCubic(S.flight);
      b.x = U.lerp(tip.x, L.castTarget.x, k);
      const arc = Math.sin(S.flight * Math.PI) * L.waterH * 0.55;
      b.y = U.lerp(tip.y, L.castTarget.y, k) - arc;
      b.scale = U.lerp(1.0, scaleAt(L.castTarget.y), k);
    } else if (S.state === 'reeling' && S.fight) {
      const k = U.clamp(S.fight.distance, 0, 1);
      const swing = Math.sin(t * 3.1 + S.fight.elapsed) * S.fight.surge * L.waterH * 0.05;
      b.x = U.lerp(L.landPoint.x, L.castTarget.x, k) + swing;
      b.y = U.lerp(L.landPoint.y, L.castTarget.y, k);
      b.scale = scaleAt(b.y);
      b.bob = Math.sin(t * 9) * (0.5 + S.fight.surge) * 2.2;
    } else {
      b.x = L.castTarget.x;
      b.y = L.castTarget.y;
      b.scale = scaleAt(b.y);
      const nib = S.state === 'bite' ? 1 : S.nibble * 0.35;
      b.bob = Math.sin(t * (S.state === 'bite' ? 21 : 1.7)) * (1.4 + nib * 5.5);
    }
  }

  function scaleAt(y) {
    const k = U.clamp((y - L.horizonY) / Math.max(1, L.waterH), 0, 1);
    return U.lerp(0.34, 1.0, Math.pow(k, 0.85));
  }

  function newCastLateral() {
    castLateral = 0.54 + VF.rng.g() * 0.22;
  }

  /* ------------------------------------------------- weather particles */

  function updateWeatherParticles(dt) {
    const K = VF.particles.KIND;
    const q = VF.state.data.settings.quality;
    const scale = q === 'low' ? 0.35 : q === 'medium' ? 0.65 : 1;

    const rain = VF.weather.rain();
    if (rain > 0.02) {
      const want = Math.round(rain * 190 * scale);
      const have = VF.particles.countOf(K.RAIN);
      const spawnN = Math.min(14, Math.max(0, Math.round((want - have) * 0.3)));
      for (let i = 0; i < spawnN; i++) {
        VF.particles.spawn({
          x: Math.random() * (W * 1.3) - W * 0.15, y: -20,
          vx: 30 + rain * 60, vy: 620 + Math.random() * 340,
          life: 4, size: 0.5 + Math.random() * 1.1,
          color: [186, 214, 236], alpha: 0.26 + Math.random() * 0.34,
          kind: K.RAIN, drag: 1, grav: 60
        });
      }
    } else if (VF.particles.countOf(K.RAIN) > 0 && Math.random() < 0.2) {
      VF.particles.clearKind(K.RAIN);
    }

    const met = VF.weather.meteors();
    if (met > 0.05 && Math.random() < dt * 1.9 * met) spawnMeteor();

    // distant lightning: a soft sky-wide bloom, well behind the horizon
    if (VF.weather.id() === 'storm') {
      lightning -= dt;
      if (lightning <= 0) {
        lightning = VF.rng.g.range(9, 26);
        flashT = 0.55;
        flashX = VF.rng.g.range(0.1, 0.9);
        VF.audio.thunder(VF.rng.g.range(1.4, 3.2));
      }
    }
    if (flashT > 0) flashT = Math.max(0, flashT - dt);

    updateSkyfall(dt);
  }

  let lightning = 12, flashT = 0, flashX = 0.5;

  /* Lightning is drawn as a bloom in the cloud layer, not a full-screen strobe. */
  function drawLightning(P) {
    if (flashT <= 0 || VF.state.data.settings.reduceFlash) return;
    const k = Math.pow(flashT / 0.55, 1.8) * (0.55 + 0.45 * Math.sin(flashT * 47));
    if (k <= 0.01) return;
    const x = flashX * W, y = L.horizonY * 0.52;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.55);
    g.addColorStop(0, 'rgba(210,225,255,' + (0.30 * k).toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(170,195,240,' + (0.09 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(150,180,230,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, L.horizonY);
    ctx.restore();
  }

  /* SKYFALL. Conditions have visual flags but nothing has ever read one except
     `calm`, so this is the only place the event exists on screen: lights that
     come down slowly, hit the water, and leave a ring. They are tracked here
     rather than handed to the particle system because the whole point is what
     happens when one lands. */
  const falling = [];
  const FALL_MAX = 26;

  function updateSkyfall(dt) {
    const k = VF.conditions ? VF.conditions.flag('skyfall') : 0;
    if (k <= 0.01 && !falling.length) return;
    const q = VF.state.data.settings.quality;
    const scale = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;

    if (k > 0.05 && falling.length < FALL_MAX * scale &&
        Math.random() < dt * 5.2 * k * scale) {
      const x = Math.random() * W;
      falling.push({
        x: x, y: -30 - Math.random() * H * 0.2,
        vx: (Math.random() - 0.5) * 26,
        vy: 105 + Math.random() * 130,
        // where the water is under this one, so it lands on the surface
        hit: L.horizonY + L.waterH * (0.06 + Math.random() * 0.72),
        r: 1.1 + Math.random() * 1.9,
        sway: Math.random() * 6.28
      });
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 34 * dt;
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(f.y * 0.012 + f.sway) * 9) * dt;
      if (f.y < f.hit) continue;
      falling.splice(i, 1);
      // it goes in, and the water says so
      VF.fx.ripple(f.x, f.hit, W * (0.020 + f.r * 0.010), 1.5, [255, 226, 160], 1.2);
      VF.particles.burst(f.x, f.hit, 5, {
        color: [255, 232, 176], angle: -Math.PI / 2, spread: 1.5,
        speedMin: 20, speedMax: 74, sizeMax: 1.7, grav: 190, lifeMax: 0.55
      });
      if (Math.random() < 0.22) VF.audio.splash(0.3);
    }
  }

  function drawSkyfall() {
    if (!falling.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < falling.length; i++) {
      const f = falling[i];
      const tail = Math.min(46, f.vy * 0.17);
      const g = ctx.createLinearGradient(f.x, f.y - tail, f.x, f.y + f.r);
      g.addColorStop(0, 'rgba(255,214,130,0)');
      g.addColorStop(1, 'rgba(255,238,190,0.75)');
      ctx.strokeStyle = g;
      ctx.lineWidth = f.r * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x - Math.sin(f.y * 0.012 + f.sway) * 3, f.y - tail);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
      const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 5);
      rg.addColorStop(0, 'rgba(255,244,206,0.85)');
      rg.addColorStop(0.4, 'rgba(255,214,130,0.22)');
      rg.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function spawnMeteor() {
    const K = VF.particles.KIND;
    const x = Math.random() * W * 1.2 - W * 0.1;
    const y = -20 - Math.random() * H * 0.15;
    const a = 0.55 + Math.random() * 0.5;
    const sp = 520 + Math.random() * 500;
    VF.particles.spawn({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.6 + Math.random() * 0.7, size: 1 + Math.random() * 2.1,
      color: [255, 232, 190], alpha: 0.9, kind: K.METEOR, drag: 1, grav: 0
    });
  }

  /* ---------------------------------------------------------------- draw */

  /* Opt-in stage timing. Off by default; VF.scene.profile(true) turns it on. */
  let prof = null;
  function mark(name, fn) {
    if (!prof) { fn(); return; }
    const t0 = performance.now();
    fn();
    prof.acc[name] = (prof.acc[name] || 0) + (performance.now() - t0);
  }

  function draw() {
    const P = VF.palette.P;
    const wrongK = VF.wrong ? VF.wrong.intensity() : 0;
    const q = VF.state.data.settings.quality;
    const shakeOff = VF.fx.shakeOffset();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (shakeOff) ctx.translate(shakeOff.x, shakeOff.y);

    buildBackdrop();
    mark('sky', function () { drawSky(P); });
    mark('stars', function () { drawStars(P, q); });
    mark('horizon', function () { drawHorizonFeature(P); });
    mark('land', function () { if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H); });
    mark('aurora', function () { drawAurora(P); });
    mark('lightning', function () { drawLightning(P); });
    mark('fog', function () { drawFog(P, q); });
    mark('water', function () { drawWater(P, q); });
    mark('under', function () { drawUnderwater(P); });
    mark('skyfall', function () { drawSkyfall(); });
    mark('ripples', function () { VF.fx.drawRipples(ctx, 0.26); });
    mark('line', function () { drawLineAndBobber(P); });
    mark('particles', function () { VF.particles.draw(ctx); });
    mark('fore', function () { drawForeground(P); });
    mark('cutscene', function () { drawCutscene(); });
    mark('overlay', function () { VF.fx.drawOverlay(ctx, W, H); });
    syncVignette();

    if (wrongK > 0.01) drawWrong(wrongK);
    if (prof) { prof.frames++; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function drawSky(P) {
    const g = ctx.createLinearGradient(0, 0, 0, L.horizonY);
    g.addColorStop(0, U.rgbToCss(P.skyTop));
    g.addColorStop(1, U.rgbToCss(P.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(-30, -30, W + 60, L.horizonY + 31);

    // light gathering at the horizon — this is what makes distant land read
    const band = H * 0.26;
    const hg = ctx.createLinearGradient(0, L.horizonY - band, 0, L.horizonY);
    hg.addColorStop(0, U.rgbToCss(P.glow, 0));
    hg.addColorStop(0.62, U.rgbToCss(P.glow, 0.045 * P.bright + 0.020));
    hg.addColorStop(1, U.rgbToCss(P.glow, 0.115 * P.bright + 0.045));
    ctx.fillStyle = hg;
    ctx.fillRect(0, L.horizonY - band, W, band);
  }

  function drawStars(P, q) {
    if (P.starAlpha <= 0.01 || !stars) return;
    const sky = L.horizonY;
    const col = U.rgbToCss(P.star);
    ctx.fillStyle = col;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const y = s.y * sky;
      if (y > sky - 2) continue;
      const tw = 0.62 + 0.38 * Math.sin(t * s.sp + s.tw);
      const a = P.starAlpha * s.bright * tw;
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      const x = s.x * W;
      if (s.big && q === 'high') {
        ctx.globalAlpha = a * 0.22;
        ctx.beginPath(); ctx.arc(x, y, s.s * 3.2, 0, TAU); ctx.fill();
        ctx.globalAlpha = a;
      }
      ctx.fillRect(x - s.s * 0.5, y - s.s * 0.5, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  /* The one big light source: moon, ring, arch, monolith, crystal, tear, eye. */
  function drawHorizonFeature(P) {
    const loc = VF.locations.current();
    const gx = L.glowX, gy = L.glowY;
    const R = Math.min(W, H) * 0.046 * P.glowSize;
    const glow = U.rgbToCss(P.glow);

    // ambient bloom around the feature
    drawBloom(P, gx, gy, R);

    ctx.save();
    switch (loc.horizon) {
      case 'moon': {
        ctx.fillStyle = U.rgbToCss(U.shade(P.glow, 0.55));
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(gx, gy, R, 0, TAU); ctx.fill();
        // craters
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(gx - R * 0.28, gy - R * 0.18, R * 0.22, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(gx + R * 0.30, gy + R * 0.22, R * 0.15, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(gx + R * 0.05, gy - R * 0.42, R * 0.10, 0, TAU); ctx.fill();
        break;
      }
      case 'ring': {
        ctx.strokeStyle = glow; ctx.globalAlpha = 0.55; ctx.lineWidth = R * 0.16;
        ctx.beginPath(); ctx.ellipse(gx, gy, R * 3.1, R * 0.85, -0.13, Math.PI * 0.06, Math.PI * 1.34); ctx.stroke();
        ctx.globalAlpha = 0.28; ctx.lineWidth = R * 0.07;
        ctx.beginPath(); ctx.ellipse(gx, gy, R * 3.6, R * 1.0, -0.13, Math.PI * 1.5, Math.PI * 1.92); ctx.stroke();
        ctx.globalAlpha = 0.85; ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(gx, gy, R * 0.42, 0, TAU); ctx.fill();
        break;
      }
      case 'arch': {
        ctx.strokeStyle = glow; ctx.globalAlpha = 0.42; ctx.lineWidth = R * 0.20;
        ctx.beginPath(); ctx.arc(gx, L.horizonY, R * 3.4, Math.PI, TAU); ctx.stroke();
        ctx.globalAlpha = 0.20; ctx.lineWidth = R * 0.09;
        ctx.beginPath(); ctx.arc(gx, L.horizonY, R * 4.3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        break;
      }
      case 'monolith': {
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#05070b';
        const mw = R * 0.72, mh = R * 6.2;
        ctx.fillRect(gx - mw / 2, L.horizonY - mh, mw, mh);
        ctx.globalAlpha = 0.55; ctx.fillStyle = glow;
        ctx.fillRect(gx - mw * 0.10, L.horizonY - mh * 0.86, mw * 0.20, mh * 0.66);
        break;
      }
      case 'crystal': {
        ctx.globalAlpha = 0.70; ctx.fillStyle = glow;
        for (let i = 0; i < 5; i++) {
          const ox = gx + (i - 2) * R * 1.25;
          const hh = R * (2.0 + (i % 3) * 1.5);
          ctx.beginPath();
          ctx.moveTo(ox, L.horizonY - hh);
          ctx.lineTo(ox + R * 0.42, L.horizonY - hh * 0.35);
          ctx.lineTo(ox + R * 0.22, L.horizonY + 2);
          ctx.lineTo(ox - R * 0.26, L.horizonY + 2);
          ctx.lineTo(ox - R * 0.44, L.horizonY - hh * 0.38);
          ctx.closePath();
          ctx.globalAlpha = 0.22 + (i % 3) * 0.16;
          ctx.fill();
        }
        break;
      }
      case 'tear': {
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(gx, gy - R * 3.0);
        ctx.quadraticCurveTo(gx + R * 0.55, gy, gx, gy + R * 2.6);
        ctx.quadraticCurveTo(gx - R * 0.34, gy, gx, gy - R * 3.0);
        ctx.fill();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = glow; ctx.lineWidth = R * 0.06;
        ctx.stroke();
        break;
      }
      case 'eye': {
        const open = 0.34 + 0.14 * Math.sin(t * 0.19);
        ctx.globalAlpha = 0.34; ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(gx, gy, R * 4.2, R * 4.2 * open, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(gx, gy, R * 1.5, R * 1.5 * Math.min(1, open * 2.4), 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(gx + R * 0.4, gy - R * 0.4, R * 0.22, 0, TAU); ctx.fill();
        break;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* The bloom around the horizon feature is a big translucent radial fill, so it
     is rendered once into a small sprite and blitted, rebuilt only when its
     colour or brightness actually moves. */
  let bloom = null, bloomKey = '';
  function drawBloom(P, gx, gy, R) {
    const key = (P.glow[0] | 0) + ',' + (P.glow[1] | 0) + ',' + (P.glow[2] | 0) + ',' + Math.round(P.bright * 12);
    if (key !== bloomKey || !bloom) {
      bloomKey = key;
      const S = 192;
      const c = bloom && bloom.width === S ? bloom : document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, U.rgbToCss(P.glow, 0.44 * P.bright + 0.16));
      grad.addColorStop(0.14, U.rgbToCss(P.glow, 0.20 * P.bright + 0.07));
      grad.addColorStop(0.42, U.rgbToCss(P.glow, 0.055 * P.bright + 0.022));
      grad.addColorStop(1, U.rgbToCss(P.glow, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      bloom = c;
    }
    const d = R * 24;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(bloom, gx - d / 2, gy - d / 2, d, d);
    ctx.restore();
  }

  function drawAurora(P) {
    const a = VF.weather.aurora();
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const phase = t * (0.12 + b * 0.05) + b * 2.1;
      const baseY = L.horizonY * (0.24 + b * 0.14);
      const amp = L.horizonY * (0.06 + b * 0.03);
      const g = ctx.createLinearGradient(0, baseY - amp * 3, 0, baseY + amp * 3.5);
      const hue = b === 0 ? [90, 230, 190] : b === 1 ? [120, 170, 255] : [200, 130, 240];
      g.addColorStop(0, U.rgbToCss(hue, 0));
      g.addColorStop(0.5, U.rgbToCss(hue, 0.13 * a));
      g.addColorStop(1, U.rgbToCss(hue, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, baseY);
      for (let x = -10; x <= W + 10; x += 26) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.0055 + phase) * amp + Math.sin(x * 0.0021 - phase * 1.6) * amp * 0.7);
      }
      ctx.lineTo(W + 10, baseY - amp * 4);
      for (let x = W + 10; x >= -10; x -= 26) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.0055 + phase) * amp - amp * (2.6 + Math.sin(x * 0.004 + phase) * 0.9));
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFog(P, q) {
    const amt = P.fogAmt;
    if (amt <= 0.02) return;
    const bands = q === 'high' ? 3 : q === 'medium' ? 2 : 1;
    for (let i = 0; i < bands; i++) {
      const y = L.horizonY - H * (0.02 + i * 0.055);
      const hgt = H * (0.05 + i * 0.045);
      const g = ctx.createLinearGradient(0, y - hgt, 0, y + hgt * 0.5);
      g.addColorStop(0, U.rgbToCss(P.fog, 0));
      g.addColorStop(0.55, U.rgbToCss(P.fog, amt * (0.30 - i * 0.06)));
      g.addColorStop(1, U.rgbToCss(P.fog, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y - hgt, W, hgt * 1.5);
    }
    // ground haze sitting on the water
    const g2 = ctx.createLinearGradient(0, L.horizonY - H * 0.01, 0, L.horizonY + L.waterH * 0.32);
    g2.addColorStop(0, U.rgbToCss(P.fog, amt * 0.34));
    g2.addColorStop(1, U.rgbToCss(P.fog, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, L.horizonY - H * 0.01, W, L.waterH * 0.34);
  }

  /* ---------------------------------------------------------------- water */

  function drawWater(P, q) {
    const hy = L.horizonY, wh = L.waterH;

    // one gradient carries the whole depth ramp, including the near-shore
    // darkening that used to be a second translucent pass
    // the ramp is tilted rather than vertical, so the side away from the light
    // sits deeper without costing a second full-water pass
    const tilt = U.clamp(L.glowX / W, 0.15, 0.85);
    const g = ctx.createLinearGradient(W * tilt * 0.9, hy - wh * 0.10, W * (1 - tilt) * 0.7, H);
    g.addColorStop(0, U.rgbToCss(P.waterTop));
    g.addColorStop(0.50, U.rgbToCss(U.mixRgb(P.waterTop, P.waterBot, 0.68)));
    g.addColorStop(0.78, U.rgbToCss(P.waterBot));
    g.addColorStop(1, U.rgbToCss(U.mixRgb(P.waterBot, [0, 0, 0], 0.45)));
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, W, wh + 2);

    // horizon seam: brightest where the light source meets it, gone at the edges
    const seam = ctx.createLinearGradient(0, 0, W, 0);
    const seamA = 0.55 * P.bright + 0.16;
    seam.addColorStop(0, U.rgbToCss(P.glow, seamA * 0.18));
    seam.addColorStop(U.clamp(L.glowX / W, 0.05, 0.95), U.rgbToCss(P.glow, seamA));
    seam.addColorStop(1, U.rgbToCss(P.glow, seamA * 0.22));
    ctx.fillStyle = seam;
    ctx.fillRect(0, hy - 1, W, 1.4);
    ctx.globalAlpha = 1;

    if (q !== 'low') { drawBackdropReflection(P); drawReflection(P); }
    drawMoonpath(P);
    drawSwell(P, q);
    drawWaveLines(P, q);

  }

  /* Mirror the distant land into the water. The flip and the depth fade are
     baked into a cached strip, so each frame is a single sheared blit. */
  let reflect = null, reflectKey = '';

  function buildReflection() {
    const key = backdropKey + ':' + Math.round(L.horizonY);
    if (reflectKey === key && reflect) return;
    if (!backdrop) return;
    reflectKey = key;
    const hy = L.horizonY;
    const depth = Math.max(2, Math.round(Math.min(L.waterH * 0.42, H * 0.20)));
    const c = reflect && reflect.width === Math.round(W) ? reflect : document.createElement('canvas');
    c.width = Math.max(1, Math.round(W));
    c.height = depth;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, depth);
    g.save();
    g.globalAlpha = 0.32;
    g.translate(0, hy);
    g.scale(1, -1);
    g.drawImage(backdrop, 0, 0, W, H);
    g.restore();
    // erase with a downward ramp so the mirror dissolves into the water
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, 0, 0, depth);
    fade.addColorStop(0, 'rgba(0,0,0,0.12)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, c.width, depth);
    g.globalCompositeOperation = 'source-over';
    reflect = c;
  }

  function drawBackdropReflection(P) {
    buildReflection();
    if (!reflect) return;
    ctx.save();
    ctx.translate(0, L.horizonY);
    // a slight shear makes the mirror read as a moving surface
    ctx.transform(1, 0, Math.sin(t * 0.5) * 0.012, 1, 0, 0);
    ctx.drawImage(reflect, 0, 0);
    ctx.restore();
  }

  function drawReflection(P) {
    if (P.starAlpha <= 0.03 || !stars) return;
    const hy = L.horizonY;
    ctx.fillStyle = U.rgbToCss(P.star);
    const limit = Math.min(stars.length, VF.state.data.settings.quality === 'high' ? 110 : 70);
    for (let i = 0; i < limit; i++) {
      const s = stars[i];
      const sy = s.y * hy;
      const ry = hy + (hy - sy) * 0.55;
      if (ry > H) continue;
      const depth = (ry - hy) / Math.max(1, L.waterH);
      const wob = Math.sin(ry * 0.09 + t * 1.15) * (2 + depth * 12);
      const a = P.starAlpha * s.bright * 0.34 * (1 - depth * 0.8);
      if (a <= 0.015) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(s.x * W + wob - s.s * 0.6, ry, s.s * 1.3, s.s * 0.8);
    }
    ctx.globalAlpha = 1;
  }

  /* The signature look. A real moonpath is not a painted stripe — it is one
     soft wedge of haze with a few hundred separate specular flecks blinking on
     and off inside it, denser and narrower the closer you look to the source.
     So that is what this draws: a wedge, then the flecks. */
  function moonSpread(k) { return U.lerp(W * 0.020, W * 0.30, Math.pow(k, 0.72)); }

  function drawMoonpath(P) {
    const hy = L.horizonY, wh = L.waterH;
    const q = VF.state.data.settings.quality;
    const gx = L.glowX;
    const calmK = VF.encounters ? 1 - VF.encounters.calm() * 0.85 : 1;
    const chop = (0.55 + VF.weather.wind() * 0.9 + VF.weather.rain() * 0.5) * calmK;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* The diffuse wedge, as a stack of horizontally-belled bands. A clipped
       shape would give the path a hard V for an edge; this way every edge of
       it is soft, which is the only way it reads as light on water. */
    const bands = q === 'low' ? 6 : q === 'medium' ? 9 : 11;
    for (let i = 0; i < bands; i++) {
      const k0 = i / bands, k1 = (i + 1) / bands;
      const y0 = hy + Math.pow(k0, 1.30) * wh;
      const y1 = hy + Math.pow(k1, 1.30) * wh;
      if (y0 > H) break;
      const km = (k0 + k1) * 0.5;
      const spread = moonSpread(km) * 1.45;
      const wob = Math.sin(y0 * 0.03 + t * 0.5) * spread * 0.10 * chop;
      const a = (0.30 * P.bright + 0.06) * (1 - Math.pow(km, 1.35) * 0.60);
      if (a <= 0.006) continue;
      const cx = gx + wob;
      const bandG = ctx.createLinearGradient(cx - spread, 0, cx + spread, 0);
      bandG.addColorStop(0, U.rgbToCss(P.glow, 0));
      bandG.addColorStop(0.26, U.rgbToCss(P.glow, a * 0.28));
      bandG.addColorStop(0.50, U.rgbToCss(P.glow, a));
      bandG.addColorStop(0.74, U.rgbToCss(P.glow, a * 0.28));
      bandG.addColorStop(1, U.rgbToCss(P.glow, 0));
      ctx.fillStyle = bandG;
      ctx.fillRect(cx - spread, y0, spread * 2, y1 - y0 + 1.2);
    }

    /* the flecks. Placement is seeded so they stay put and blink rather than
       sliding across the surface, which is what real chop does. */
    const n = q === 'low' ? 44 : q === 'medium' ? 90 : 132;
    const glow = P.glow;
    let bucket = -1;
    for (let i = 0; i < n; i++) {
      const r1 = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const r2 = ((Math.sin(i * 78.2331) * 43758.5453) % 1 + 1) % 1;
      const r3 = ((Math.sin(i * 41.1177) * 43758.5453) % 1 + 1) % 1;

      const k = Math.pow(r1, 0.85);
      const y = hy + Math.pow(k, 1.30) * wh;
      if (y > H + 2) continue;
      const spread = moonSpread(k);
      // clustered toward the centre line, the way specular scatter falls off
      const off = (r2 * 2 - 1);
      const lateral = off * Math.abs(off) * spread;
      const drift = (Math.sin(y * 0.045 + t * (0.9 + r3 * 0.7)) * spread * 0.24 +
                     Math.sin(y * 0.018 - t * 0.55) * spread * 0.16) * chop;
      const x = gx + lateral + drift;

      // each fleck has its own blink, and the near ones are longer and lazier
      const sp = 1.1 + r3 * 3.2;
      let tw = Math.sin(t * sp + r2 * 12.0) * 0.5 + 0.5;
      tw = tw * tw * (1 - Math.abs(off) * 0.55);
      const a = tw * (0.42 * P.bright + 0.09) * (1 - Math.pow(k, 2.1) * 0.55) * calmK;
      if (a <= 0.012) continue;

      const wdt = U.lerp(1.6, 30, Math.pow(k, 1.25)) * (0.55 + r3 * 0.9);
      const hgt = Math.max(0.7, U.lerp(0.7, 2.6, k));
      // four alpha buckets keep the fill-style churn down
      const b = a < 0.08 ? 0 : a < 0.16 ? 1 : a < 0.26 ? 2 : 3;
      if (b !== bucket) {
        bucket = b;
        ctx.fillStyle = U.rgbToCss(glow, [0.08, 0.18, 0.30, 0.46][b]);
      }
      ctx.fillRect(x - wdt * 0.5, y, wdt, hgt);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* Broad, slow bands of sheen. The wave lines give the surface its texture;
     this gives it a body of water underneath, moving on a much longer period. */
  function drawSwell(P, q) {
    if (q === 'low') return;
    const hy = L.horizonY, wh = L.waterH;
    const calm = VF.encounters ? VF.encounters.calm() : 0;
    const n = q === 'medium' ? 2 : 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ph = i * 2.399;
      const k = 0.34 + i * 0.15;
      const y = hy + Math.pow(k, 1.30) * wh + Math.sin(t * 0.20 + ph) * wh * 0.045;
      const h = wh * (0.055 + i * 0.018);
      const a = (0.055 * P.bright + 0.014) * (0.55 + 0.45 * Math.sin(t * 0.28 + ph)) * (1 - calm * 0.5);
      if (a <= 0.004) continue;
      const g = ctx.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, U.rgbToCss(P.glow, 0));
      g.addColorStop(0.5, U.rgbToCss(P.glow, a));
      g.addColorStop(1, U.rgbToCss(P.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h, W, h * 2);
    }
    ctx.restore();
  }

  /* One shared height field. Sampling every line from it is what makes the
     surface coherent — the lines behave like contours of a single moving
     sheet of water rather than a stack of independent wiggles. */
  function field(x, y, sp) {
    return Math.sin(x * 0.0042 + y * 0.0060 + t * sp * 0.85)
         + Math.sin(x * 0.0113 - y * 0.0038 + t * sp * 1.45) * 0.44
         + Math.sin(x * 0.0271 + y * 0.0021 + t * sp * 2.10) * 0.17;
  }

  /* The surface. Lines are spaced and shaped irregularly and each carries its
     own phase and amplitude, so it reads as swell rather than as scanlines. */
  function drawWaveLines(P, q) {
    const hy = L.horizonY, wh = L.waterH;
    const lines = q === 'low' ? 15 : q === 'medium' ? 24 : 32;
    const seg = q === 'low' ? 11 : 18;
    const calm = Math.max(VF.encounters ? VF.encounters.calm() : 0,
                          VF.conditions ? VF.conditions.flag('calm') * 0.8 : 0,
                          VF.wrong ? VF.wrong.intensity() : 0);
    const wind = (0.35 + VF.weather.wind() * 1.3) * (1 - calm * 0.88);
    const chop = (1 + VF.weather.rain() * 0.9 + VF.weather.wind() * 0.8) * (1 - calm * 0.92);

    const crest = U.mixRgb(P.waterTop, P.glow, 0.80);
    const trough = U.mixRgb(P.waterBot, [0, 0, 0], 0.35);

    const crestCss = U.rgbToCss(crest);
    const troughCss = U.rgbToCss(trough);

    for (let i = 0; i < lines; i++) {
      // uneven spacing: each band is nudged by a fixed per-line offset
      const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const k = U.clamp((i + 0.35 + jitter * 0.55) / lines, 0, 1);
      const y = hy + Math.pow(k, 1.42) * wh;
      if (y > H + 4) continue;

      const amp = U.lerp(0.4, 13, Math.pow(k, 1.55)) * chop;
      const ph = i * 2.399;                       // golden-angle phase spread
      const speed = wind * (0.45 + k * 1.1);

      // brighter bands catch the light, darker ones read as troughs
      const bright = 0.5 + 0.5 * Math.sin(i * 1.7 + t * 0.35);
      const col = bright > 0.55 ? crest : trough;
      const a = U.lerp(0.08, 0.46, Math.pow(k, 1.10)) * (0.35 + P.bright * 0.85) *
                (1 - calm * 0.5) * (bright > 0.55 ? bright : 0.55);
      if (a <= 0.012) continue;

      ctx.globalAlpha = a;
      ctx.strokeStyle = bright > 0.55 ? crestCss : troughCss;
      // near swell is heavier than the compressed bands out by the horizon
      ctx.lineWidth = U.lerp(0.85, 1.5, Math.pow(k, 2.2));
      ctx.beginPath();
      for (let j = 0; j <= seg; j++) {
        const x = (j / seg) * (W + 60) - 30;
        // every line samples the same field, so neighbours rise and fall
        // together and the surface reads as swell instead of as loose squiggles
        const yy = y + field(x, y, speed) * amp
          + Math.sin(x * 0.019 + t * speed * 1.9 + ph * 1.7) * amp * 0.14;
        if (j === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // a handful of bright glints where the light lands on a crest
    if (q !== 'low') {
      ctx.globalCompositeOperation = 'lighter';
      const n = 9;
      for (let i = 0; i < n; i++) {
        const jitter = ((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1;
        const k = 0.12 + jitter * 0.8;
        const y = hy + Math.pow(k, 1.4) * wh;
        const drift = (t * (6 + jitter * 14)) % (W + 200) - 100;
        const x = ((jitter * W * 1.7) + drift) % (W + 120) - 60;
        const tw = 0.5 + 0.5 * Math.sin(t * (1.4 + jitter * 2.6) + i);
        const ga = 0.19 * tw * tw * (0.3 + P.bright) * (1 - calm * 0.7);
        if (ga <= 0.012) continue;
        const gw = U.lerp(5, 26, k), gh = U.lerp(0.6, 1.7, k);
        ctx.globalAlpha = ga;
        // a soft halo with a hard core reads as light on water, not as a dash
        const hg = ctx.createRadialGradient(x, y, 0, x, y, gw);
        hg.addColorStop(0, U.rgbToCss(P.glow, 0.9));
        hg.addColorStop(0.35, U.rgbToCss(P.glow, 0.30));
        hg.addColorStop(1, U.rgbToCss(P.glow, 0));
        ctx.fillStyle = hg;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, gh / gw);
        ctx.beginPath();
        ctx.arc(0, 0, gw, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /* Slow dark shapes drifting under the surface. Pure atmosphere. */
  const shadows = [];
  function addShadow(opts) {
    if (shadows.length > 6) shadows.shift();
    shadows.push(Object.assign({ life: 9, max: 9, x: -0.1, y: 0.5, sp: 0.06, size: 1, alpha: 0.5 }, opts));
  }

  function drawUnderwater(P) {
    const hy = L.horizonY, wh = L.waterH;
    for (let i = shadows.length - 1; i >= 0; i--) {
      const s = shadows[i];
      s.life -= 1 / 60;
      s.x += s.sp / 60;
      if (s.life <= 0 || s.x > 1.2) { shadows.splice(i, 1); continue; }
      const k = U.clamp(s.life / s.max, 0, 1);
      const fade = Math.sin(k * Math.PI);
      const y = hy + wh * s.y;
      const sc = scaleAt(y) * s.size;
      ctx.globalAlpha = s.alpha * fade;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(s.x * W, y + Math.sin(t * 0.8 + i) * 3, W * 0.075 * sc, wh * 0.028 * sc, Math.sin(t * 0.4 + i) * 0.12, 0, TAU);
      ctx.fill();
      if (s.glow) {
        ctx.globalAlpha = s.alpha * fade * 0.55;
        ctx.fillStyle = s.glow;
        ctx.beginPath();
        ctx.ellipse(s.x * W, y, W * 0.030 * sc, wh * 0.012 * sc, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------- line + bobber */

  function drawLineAndBobber(P) {
    const b = L.bobber;
    if (!b.visible) return;
    const S = VF.fishing.S;
    const tip = L.rodTip;

    // The line sags when slack and straightens under tension.
    let tension = 0.25;
    if (S.state === 'reeling' && S.fight) tension = 0.15 + S.fight.tension * 0.85;
    else if (S.state === 'bite') tension = 0.55;
    const sag = (1 - tension) * Math.hypot(b.x - tip.x, b.y - tip.y) * 0.16;
    const mx = (tip.x + b.x) / 2;
    const my = (tip.y + b.y) / 2 + sag;

    const shake = (S.state === 'reeling' && S.fight) ? S.fight.shakeAmt : 0;
    const lineCfg = VF.cosmetics.cfg('line');
    const lineRgb = lineCfg.col ? U.hexToRgb(lineCfg.col) : U.mixRgb(P.glow, [255, 255, 255], 0.4);
    const lineA = (lineCfg.a === undefined ? 0.30 : lineCfg.a * 0.7) + tension * 0.35 + shake * 0.3;
    if (lineCfg.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgbToCss(lineRgb, 0.22);
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y + b.bob);
      ctx.stroke();
      ctx.restore();
    }
    const pulse = lineCfg.pulse ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
    ctx.strokeStyle = U.rgbToCss(lineRgb, lineA * pulse);
    ctx.lineWidth = 1 + shake * 0.8;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(mx + (shake ? Math.sin(t * 47) * shake * 4 : 0), my, b.x, b.y + b.bob);
    ctx.stroke();

    // The fish itself, rising as it comes in.
    if (S.state === 'reeling' && S.fight) drawHookedFish(S.fight, b);

    const by = b.y + b.bob;
    const r = 5.5 * b.scale;

    // bobber shadow on the water
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(b.x, by + r * 0.9, r * 1.5, r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const bc = VF.cosmetics.cfg('bobber');
    const cy2 = by - r * 0.3;
    if (bc.glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(b.x, cy2, 0, b.x, cy2, r * 5);
      g.addColorStop(0, U.rgbToCss(U.hexToRgb(bc.bot || '#ffd060'), 0.5));
      g.addColorStop(1, U.rgbToCss(U.hexToRgb(bc.bot || '#ffd060'), 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - r * 5, cy2 - r * 5, r * 10, r * 10);
      ctx.restore();
    }
    if (bc.hole) {
      ctx.fillStyle = '#05030a';
      ctx.beginPath(); ctx.arc(b.x, cy2, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = U.rgbToCss(U.hexToRgb(bc.bot || '#1a1030'), 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, cy2, r, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = bc.top || '#c8402f';
      ctx.beginPath(); ctx.arc(b.x, cy2, r, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = bc.bot || '#e8e4dc';
      ctx.beginPath(); ctx.arc(b.x, cy2, r, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(b.x, cy2, r, 0, TAU); ctx.stroke();
    }
    if (bc.lamp) {
      ctx.fillStyle = '#ffe8a0';
      ctx.beginPath(); ctx.arc(b.x, cy2 - r * 0.2, r * 0.42, 0, TAU); ctx.fill();
    }
    if (bc.eye) {
      ctx.fillStyle = '#f4efe4';
      ctx.beginPath(); ctx.arc(b.x, cy2, r * 0.44, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a0810';
      ctx.beginPath(); ctx.arc(b.x + Math.sin(t * 0.8) * r * 0.12, cy2, r * 0.2, 0, TAU); ctx.fill();
    }
    if (bc.star) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff6d0';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(b.x, cy2, r * 2.6, r * 0.16, t * 0.5 + i * Math.PI / 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = U.rgbToCss(P.glow, 0.7);
    ctx.fillRect(b.x - r * 0.18, by - r * 1.5, r * 0.36, r * 0.7);
  }

  function drawHookedFish(f, b) {
    const c = f.c;
    const k = 1 - U.clamp(f.distance, 0, 1);
    if (k < 0.12) return;
    const sc = scaleAt(b.y);
    const rank = VF.rarities.rank(c.rarity);
    const size = Math.min(W, H) * 0.055 * sc * (0.5 + k) * (0.7 + rank * 0.09);
    const y = b.y + 14 * sc + Math.sin(t * 4) * 3 * f.surge;
    const x = b.x + Math.sin(t * 2.3) * 8 * sc * (0.4 + f.surge);
    ctx.save();
    ctx.globalAlpha = U.clamp((k - 0.1) * 1.4, 0, 1) * 0.85;
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3.4) * 0.22 * (0.5 + f.surge));
    if (c.kind === 'treasure') {
      // an object has no species art, so it comes up as a plain dark mass
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.85, size * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.55;
      ctx.strokeStyle = c.treasure.color;
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.stroke();
    } else if (c.fish && c.fish.id) {
      // it comes out of the dark as it comes up
      VF.fishArt.drawSilhouette(ctx, c.fish, size, k * 0.9, Math.pow(k, 1.5));
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------- foreground */

  /* Where the top of the ledge is at a given x. Both quadratics of the lip are
     inverted numerically so a figure can stand anywhere along it. */
  function quadSolve(p0, p1, p2, x) {
    const a = p0 - 2 * p1 + p2, b = 2 * (p1 - p0), c = p0 - x;
    if (Math.abs(a) < 1e-6) return b === 0 ? 0 : U.clamp(-c / b, 0, 1);
    const disc = b * b - 4 * a * c;
    if (disc < 0) return 0.5;
    const r = Math.sqrt(disc);
    const u1 = (-b + r) / (2 * a), u2 = (-b - r) / (2 * a);
    if (u1 >= -0.001 && u1 <= 1.001) return U.clamp(u1, 0, 1);
    return U.clamp(u2, 0, 1);
  }
  function quadY(p0, p1, p2, u) {
    const m = 1 - u;
    return m * m * p0 + 2 * m * u * p1 + u * u * p2;
  }

  function groundY(x) {
    const fh = L.figureH, seatX = L.seatX, lipY = L.seatY + fh * 0.16;
    const midX = seatX + fh * 0.10;
    if (x <= midX) {
      const u = quadSolve(-12, W * 0.07, midX, U.clamp(x, -12, midX));
      return quadY(lipY - fh * 0.10, lipY - fh * 0.16, lipY - fh * 0.03, u);
    }
    const endX = seatX + fh * 0.98;
    const u = quadSolve(midX, seatX + fh * 0.62, endX, U.clamp(x, midX, endX));
    return quadY(lipY - fh * 0.03, lipY + fh * 0.10, lipY + fh * 0.52, u);
  }

  /* Where the two of you end up standing. The angler steps off the seat and
     turns; the visitor comes in along the shore from the left. */
  function visitSpots() {
    const fh = L.figureH, seatX = L.seatX;
    return {
      anglerFrom: seatX,
      anglerTo: seatX + fh * 0.04,
      npcFrom: -fh * 0.55,
      npcTo: seatX - fh * 0.60
    };
  }

  function drawForeground(P) {
    const fh = L.figureH;
    const seatX = L.seatX, seatY = L.seatY;
    const rimA = 0.13 + P.bright * 0.16;
    const rim = U.rgbToCss(P.glow, rimA);
    const dark = '#03050a';

    /* --- the ledge the angler is sitting on --- */
    const lipY = seatY + fh * 0.16;
    ctx.beginPath();
    ctx.moveTo(-12, H + 12);
    ctx.lineTo(-12, lipY - fh * 0.10);
    ctx.quadraticCurveTo(W * 0.07, lipY - fh * 0.16, seatX + fh * 0.10, lipY - fh * 0.03);
    ctx.quadraticCurveTo(seatX + fh * 0.62, lipY + fh * 0.10, seatX + fh * 0.98, lipY + fh * 0.52);
    ctx.lineTo(seatX + fh * 1.3, H + 12);
    ctx.closePath();
    // a hair above pure black so the silhouette separates from the deep water
    const lg = ctx.createLinearGradient(0, lipY - fh * 0.2, 0, H);
    lg.addColorStop(0, '#080c13');
    lg.addColorStop(1, '#010204');
    ctx.fillStyle = lg;
    ctx.fill();

    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-12, lipY - fh * 0.10);
    ctx.quadraticCurveTo(W * 0.07, lipY - fh * 0.16, seatX + fh * 0.10, lipY - fh * 0.03);
    ctx.quadraticCurveTo(seatX + fh * 0.62, lipY + fh * 0.10, seatX + fh * 0.98, lipY + fh * 0.52);
    ctx.stroke();

    if (VF.visit && VF.visit.active()) { L.merchant = null; drawVisit(P, rim); return; }

    ctx.save();
    ctx.translate(seatX, seatY);
    const look = L.bobber.visible ? L.bobber : L.castTarget;
    VF.anglerArt.draw(ctx, VF.cosmetics.cfg('outfit'), fh, t, {
      mode: 'sit',
      rim: rim,
      hand: { x: L.rodHand.x - seatX, y: L.rodHand.y - seatY },
      rodAngle: rodState.angle + rodState.sway,
      aim: { x: look.x - seatX, y: look.y - seatY },
      handOver: true
    });
    ctx.restore();
    drawRod(P);
    // the hand closes over the grip, so it goes on after the rod
    VF.anglerArt.drawHand(ctx, VF.cosmetics.cfg('outfit'), fh, L.rodHand,
                          rodState.angle + rodState.sway);

    drawMerchant(P, rim);
  }

  /* The wanderer stands a little up the shore with a case at his side and the
     time he has left over his head. He is drawn after the angler so he reads
     as further along the ledge, and the rectangle he occupies is kept on L so
     the input layer can tell when he has been clicked. */
  const MERCH_NPC = { id: 'merchant', name: 'The Wanderer', color: '#e8c88a' };

  function drawMerchant(P, rim) {
    L.merchant = null;
    if (!VF.merchant || !VF.merchant.here()) return;
    const fh = L.figureH;
    // up the shore rather than down it: to the right the ledge falls away and
    // he ends up standing off the bottom of the frame
    const x = L.seatX - fh * 0.58;
    const y = groundY(x);
    // a slow arrival, so he does not simply blink into existence
    const inK = U.clamp((VF.merchant.STAY - VF.merchant.leavesIn()) / 1400, 0, 1);
    const outK = U.clamp(VF.merchant.leavesIn() / 4000, 0, 1);
    const a = U.smoothstep(Math.min(inK, outK));
    if (a <= 0.01) return;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    VF.npcArt.draw(ctx, MERCH_NPC, fh, t, {
      facing: 1, rim: rim, walk: 0, phase: 0, talking: false
    });
    ctx.restore();

    /* the countdown, on a small plate above him */
    const ms = VF.merchant.leavesIn();
    const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
    const label = mm + ':' + (ss < 10 ? '0' : '') + ss;
    const py = y - fh * 1.08;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '600 ' + Math.round(fh * 0.085) + 'px ui-monospace, monospace';
    const tw = ctx.measureText(label).width;
    const pw = tw + fh * 0.15, ph = fh * 0.145;
    ctx.fillStyle = 'rgba(8,11,17,0.82)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - pw / 2, py - ph, pw, ph, ph * 0.32); ctx.fill(); }
    else ctx.fillRect(x - pw / 2, py - ph, pw, ph);
    ctx.strokeStyle = 'rgba(232,200,138,' + (0.45 + 0.25 * Math.sin(t * 2.2)).toFixed(2) + ')';
    ctx.lineWidth = 1.1;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - pw / 2, py - ph, pw, ph, ph * 0.32); ctx.stroke(); }
    ctx.fillStyle = ms < 60000 ? '#ff9a8a' : '#e8c88a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, py - ph * 0.52);
    // and a nudge that he can be clicked
    ctx.font = '500 ' + Math.round(fh * 0.062) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232,200,138,' + (0.34 + 0.24 * Math.sin(t * 2.2)).toFixed(2) + ')';
    ctx.fillText('click to trade', x, py + fh * 0.075);
    ctx.restore();

    L.merchant = { x: x - fh * 0.34, y: y - fh * 1.30, w: fh * 0.68, h: fh * 1.34 };
  }

  /* Both figures on the near shore. The rod stays behind, propped on the ledge
     where it was put down, because you do not carry a rod to a conversation. */
  function drawVisit(P, rim) {
    const V = VF.visit.S;
    const fh = L.figureH;
    const sp = visitSpots();
    const out = V.phase === 'out';
    const back = V.phase === 'back';
    const k = U.smoothstep(V.k);

    const ax = back ? U.lerp(sp.anglerTo, sp.anglerFrom, k)
                    : out ? U.lerp(sp.anglerFrom, sp.anglerTo, k) : sp.anglerTo;
    const nx = back ? U.lerp(sp.npcTo, sp.npcFrom, k)
                    : out ? U.lerp(sp.npcFrom, sp.npcTo, k) : sp.npcTo;

    drawRestingRod(P);

    // the visitor: walks in facing the way they are going, then turns to you
    if (V.npc) {
      ctx.save();
      ctx.translate(nx, groundY(nx));
      VF.npcArt.draw(ctx, V.npc, fh, t, {
        facing: back ? -1 : 1,
        rim: rim,
        walk: V.walk,
        phase: t * 6.2,
        talking: V.phase === 'talk' && !!VF.visit.line()
      });
      ctx.restore();
    }

    // the angler, standing, facing whoever they came to see
    // the angler does not walk anywhere — they get up off the ledge and turn.
    // The visitor is the one crossing the shore.
    ctx.save();
    ctx.translate(ax, groundY(ax));
    VF.anglerArt.draw(ctx, VF.cosmetics.cfg('outfit'), fh, t, {
      mode: 'stand',
      rim: rim,
      walk: 0,
      phase: 0,
      facing: back ? 1 : -1,
      // look at whoever you came to see
      aim: { x: (nx - ax) * 0.6, y: -fh * 0.55 }
    });
    ctx.restore();
  }

  /* The rod, left leaning against the ledge at the seat. */
  function drawRestingRod(P) {
    const fh = L.figureH;
    let rod = VF.rods.get(VF.state.data.rod);
    const skin = VF.cosmetics.cfg('rodSkin');
    if (skin && skin.c1) rod = { art: Object.assign({}, rod.art, skin, { len: rod.art.len }) };
    const len = fh * 1.30 * rod.art.len;
    const bx = L.seatX + fh * 0.46, by = L.seatY + fh * 0.22;
    const a = -1.06;
    const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
    VF.rodArt.draw(ctx, rod, {
      bx: bx, by: by,
      cx: (bx + tx) / 2 + fh * 0.02, cy: (by + ty) / 2,
      tx: tx, ty: ty, len: len, angle: a
    }, t, { spin: t * 0.25 });
  }

  /* Rod geometry lives here; the drawing is shared with the shop previews. */
  function drawRod(P) {
    let rod = VF.rods.get(VF.state.data.rod);
    const skin = VF.cosmetics.cfg('rodSkin');
    if (skin && skin.c1) {
      // a finish repaints the rod without touching its length or its stats
      rod = { art: Object.assign({}, rod.art, skin, { len: rod.art.len }) };
    }
    const tip = rodTipPoint();
    const hand = L.rodHand;
    const a = tip.a;
    const S = VF.fishing.S;
    const reeling = S.state === 'reeling' && S.fight && S.fight.reeling;
    VF.rodArt.draw(ctx, rod, {
      bx: hand.x - Math.cos(a) * tip.len * 0.13,
      by: hand.y - Math.sin(a) * tip.len * 0.13,
      cx: tip.cx, cy: tip.cy,
      tx: tip.x, ty: tip.y,
      len: tip.len, angle: a
    }, t, { spin: reeling ? t * 12 : t * 0.4 });
  }

  /* The two sequences, drawn over the shore rather than instead of it: the
     water and the sky keep running underneath, which is most of why it reads
     as something happening here rather than as a cut to somewhere else.

     Nessie is drawn at very nearly the height of the frame. That is not a
     flourish — the whole claim the tier makes about her is scale, and a
     tastefully sized Nessie would be a different animal. */
  function drawCutscene() {
    const C = VF.cutscene && VF.cutscene.state();
    if (!C) return;
    const fish = C.fish && C.fish.fish;

    // the frame goes down, but never all the way — the water stays visible
    if (C.dark > 0.01) {
      const g = ctx.createRadialGradient(W * 0.5, L.horizonY + L.waterH * 0.30, 0,
                                         W * 0.5, L.horizonY + L.waterH * 0.30,
                                         Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,' + (C.dark * 0.42).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.96, C.dark * 1.05).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // something the width of the bay, passing underneath
    if (C.shadow > 0.01) {
      const y = L.horizonY + L.waterH * 0.46;
      const sg = ctx.createLinearGradient(0, y - L.waterH * 0.30, 0, y + L.waterH * 0.34);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, 'rgba(0,0,0,' + (0.80 * C.shadow).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.save();
      ctx.translate(Math.sin(t * 0.22) * W * 0.05, 0);
      ctx.beginPath();
      ctx.ellipse(W * 0.5, y, W * 0.78, L.waterH * 0.30, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (!fish || C.rise <= 0.01) return;

    /* Both of them are drawn from their own centre, and neither one is
       centred inside its own silhouette: she is nearly all neck above hers,
       he is a person and splits about evenly. So the frame is worked out from
       the parts that have to be in shot rather than from the middle. */
    const isNessie = C.id === 'nessie';
    const TOP = isNessie ? 1.00 : 0.90;    // reach above centre, in half-heights
    const BOT = isNessie ? 0.50 : 0.95;    // reach below it
    const box = isNessie ? Math.min(H * 1.10, W * 1.15) : Math.min(H * 0.76, W * 0.55);
    const size = VF.fishArt.fitSize(fish, box);
    const half = size * 2 * VF.fishArt.bodyRatio('being', fish.art.being);
    const surface = L.horizonY + L.waterH * (isNessie ? 0.62 : 0.58);
    const k = U.smootherstep(U.clamp(C.rise, 0, 1));

    /* The letterbox bars are DOM, drawn over the canvas, so the renderer has
       to know where they land or it will put the best part of the shot behind
       one. They are 11vh, 8vh on a narrow screen. */
    const bar = H * (W < 760 ? 0.085 : 0.115);
    const ceiling = bar + H * 0.035 + half * TOP;

    /* She sits at her own waterline; he stands on the surface. Either way the
       figure is pushed down far enough to clear the top bar — a reveal you
       cannot see the head of is not a reveal. */
    const cyEnd = Math.max(ceiling,
                           isNessie ? surface - half * 0.36 : surface - half * BOT);
    const cyStart = surface + half * (BOT + 1.30);
    const cy = U.lerp(cyStart, cyEnd, k);
    const cx = W * (isNessie ? 0.50 : 0.50);

    ctx.save();
    // clip at the surface so nothing floats above water it has not left yet
    ctx.beginPath();
    ctx.rect(-20, -20, W + 40, surface + L.waterH * 0.30 + 20);
    ctx.clip();
    ctx.translate(cx, cy);

    // the water it is displacing
    ctx.save();
    ctx.globalAlpha = 0.55 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, half * 0.92, size * 1.25, L.waterH * 0.055, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (C.lit > 0.02) {
      // a light on it that is not coming from the sky
      const gl = ctx.createRadialGradient(0, -half * 0.2, 0, 0, -half * 0.2, size * 1.6);
      const acc = U.hexToRgb(fish.art.c3);
      gl.addColorStop(0, U.rgbToCss(acc, 0.20 * C.lit));
      gl.addColorStop(1, U.rgbToCss(acc, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(-size * 1.8, -size * 1.8, size * 3.6, size * 3.6);
    }

    // she comes out of the dark as she comes up, the same way a hooked fish does
    if (C.lit < 0.96) {
      ctx.save();
      ctx.globalAlpha = 1 - C.lit;
      VF.fishArt.drawSilhouette(ctx, fish, size, 0.96, k * 0.85);
      ctx.restore();
    }
    if (C.lit > 0.02) {
      ctx.save();
      ctx.globalAlpha = C.lit;
      VF.fishArt.draw(ctx, fish, size, { time: t, traits: C.fish ? C.fish.traits : null });
      ctx.restore();
    }
    ctx.restore();
  }

  /* Nothing dramatic — the colour drains, the frame stops, and a few lights
     appear where there is no reason for lights. */
  function drawWrong(k) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'hsl(0,' + Math.round((1 - k) * 100) + '%,50%)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const seed = i * 12.9898;
      const x = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1 * W;
      const y = L.horizonY - H * (0.05 + (((Math.sin(seed * 1.7) * 43758.5453) % 1 + 1) % 1) * 0.25);
      const r = H * 0.02 * (0.6 + Math.sin(t * 0.6 + i) * 0.4);
      const a = k * 0.5 * (0.4 + 0.6 * Math.sin(t * 0.35 + i * 2));
      if (a <= 0.01 || r <= 0) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r * 6));
      g.addColorStop(0, 'rgba(210,225,255,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(210,225,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    }
    ctx.restore();
  }

  /* The vignette is a CSS layer; only its pulse strength is driven from here. */
  let pulseEl = null, lastPulse = -1;
  function syncVignette() {
    if (!pulseEl) pulseEl = document.getElementById('vigPulse');
    if (!pulseEl) return;
    const v = Math.round(VF.fx.pulseAmt() * 100) / 100;
    if (v !== lastPulse) { lastPulse = v; pulseEl.style.opacity = v; }
  }

  VF.scene = {
    init: init, resize: resize, update: update, draw: draw,
    L: L, addShadow: addShadow, newCastLateral: newCastLateral,
    groundY: groundY, visitSpots: visitSpots,
    /* Is this canvas point on the wanderer? The input layer asks before it
       decides a press was the start of a cast. */
    merchantHit: function (px, py) {
      const r = L.merchant;
      if (!r) return false;
      const pad = L.figureH * 0.10;
      return px >= r.x - pad && px <= r.x + r.w + pad &&
             py >= r.y - pad && py <= r.y + r.h + pad;
    },
    spawnMeteor: spawnMeteor, seedAmbient: seedAmbient,
    rebuild: function () { backdropKey = ''; buildStars(); },
    profile: function (on) {
      if (on) { prof = { acc: {}, frames: 0 }; return; }
      if (!prof) return null;
      const out = { frames: prof.frames, ms: {} };
      let total = 0;
      for (const k in prof.acc) { out.ms[k] = +(prof.acc[k] / prof.frames).toFixed(3); total += prof.acc[k]; }
      out.totalPerFrame = +(total / prof.frames).toFixed(3);
      prof = null;
      return out;
    },
    size: function () { return { w: W, h: H }; },
    ctx: function () { return ctx; }
  };
})(window.VF = window.VF || {});
