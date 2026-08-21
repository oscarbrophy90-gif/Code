/* VOID FISHING — screen-level effects: shake, flashes, ripples, floating text. */
(function (VF) {
  'use strict';

  const U = VF.util;

  let shakeAmt = 0, shakeDecay = 3.4, shakeT = 0;
  let flash = null;          // { color, amt, decay }
  let vignettePulse = 0;
  const ripples = [];        // { x, y, r, maxR, life, max, w, color }
  const MAX_RIPPLES = 40;

  function shake(amount, decay) {
    if (!VF.state.data.settings.screenShake) return;
    shakeAmt = Math.max(shakeAmt, amount);
    shakeDecay = decay || 3.4;
  }

  function doFlash(color, amt, decay) {
    if (VF.state.data.settings.reduceFlash) amt *= 0.35;
    flash = { color: color, amt: amt, decay: decay || 2.2 };
  }

  function pulse(a) { vignettePulse = Math.max(vignettePulse, a); }

  function ripple(x, y, maxR, life, color, width) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: x, y: y, r: maxR * 0.08, maxR: maxR, life: life, max: life,
                   color: color || [200, 225, 245], w: width || 1.4 });
  }

  function update(dt) {
    shakeT += dt * 34;
    shakeAmt = Math.max(0, shakeAmt - shakeAmt * shakeDecay * dt - dt * 0.35);
    if (flash) {
      flash.amt -= flash.amt * flash.decay * dt + dt * 0.05;
      if (flash.amt <= 0.004) flash = null;
    }
    vignettePulse = Math.max(0, vignettePulse - vignettePulse * 2.4 * dt - dt * 0.02);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life -= dt;
      if (r.life <= 0) { ripples.splice(i, 1); continue; }
      const t = 1 - r.life / r.max;
      r.r = r.maxR * U.easeOutCubic(t);
    }
  }

  function shakeOffset() {
    if (shakeAmt < 0.02) return null;
    return {
      x: Math.sin(shakeT * 1.7) * shakeAmt + Math.sin(shakeT * 3.1) * shakeAmt * 0.5,
      y: Math.cos(shakeT * 2.3) * shakeAmt * 0.8 + Math.sin(shakeT * 4.7) * shakeAmt * 0.3
    };
  }

  /* Ripples are drawn as squashed ellipses to sit flat on the water plane.
     A disturbance on water does not make one ring — it makes a leading crest
     with two or three slower rings chasing it, so that is what gets drawn. */
  const RINGS = [
    { k: 1.00, a: 1.00, w: 1.00, from: 0.00 },
    { k: 0.68, a: 0.52, w: 0.75, from: 0.12 },
    { k: 0.42, a: 0.26, w: 0.55, from: 0.28 }
  ];

  function drawRipples(ctx, squash) {
    const sq = squash === undefined ? 0.28 : squash;
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      const t = 1 - r.life / r.max;
      const base = (1 - t) * (1 - t) * 0.8;
      if (base <= 0.01) continue;
      const col = r.color;
      for (let j = 0; j < RINGS.length; j++) {
        const g = RINGS[j];
        if (t < g.from) continue;
        const rr = r.r * g.k;
        if (rr < 0.6) continue;
        const a = base * g.a;
        if (a <= 0.012) continue;
        ctx.globalAlpha = a;
        ctx.strokeStyle = U.rgbToCss(col);
        ctx.lineWidth = Math.max(0.5, r.w * g.w * (1 - t * 0.45));
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rr, rr * sq, 0, 0, U.TAU);
        ctx.stroke();
      }
      // the dark dimple in the middle, which is what you actually see first
      if (t < 0.5) {
        ctx.globalAlpha = base * 0.30 * (1 - t * 2);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r * 0.34, r.r * 0.34 * sq, 0, 0, U.TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay(ctx, w, h) {
    if (flash && flash.amt > 0.004) {
      ctx.globalAlpha = U.clamp(flash.amt, 0, 1);
      ctx.fillStyle = flash.color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  function reset() { ripples.length = 0; shakeAmt = 0; flash = null; vignettePulse = 0; }

  VF.fx = {
    shake: shake, flash: doFlash, pulse: pulse, ripple: ripple,
    update: update, shakeOffset: shakeOffset, drawRipples: drawRipples,
    drawOverlay: drawOverlay, reset: reset,
    pulseAmt: function () { return vignettePulse; },
    shakeAmt: function () { return shakeAmt; }
  };
})(window.VF = window.VF || {});
