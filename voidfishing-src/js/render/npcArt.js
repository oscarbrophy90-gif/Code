/* VOID FISHING — the five people you can actually go and stand in front of.

   Each one is a standing silhouette with its own build, garment and prop, so
   you can tell who is waiting for you from across the shore before a word
   appears. Drawn with the ground at the local origin; the caller translates
   and the scene supplies the moonlight. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;
  const MOON = [148, 178, 220];

  /* build:  1 = spare, 2 = broad
     stoop:  how far the spine folds forward
     hat:    'cap' | 'brim' | 'hood' | 'tall' | null
     coat:   'apron' | 'robe' | 'oilskin' | 'rags' | 'tails'
     prop:   'book' | 'rod' | 'case' | 'lantern' | null      */
  const KIND = {
    keeper:    { h: 0.94, build: 1.22, stoop: 0.10, hat: 'cap',  coat: 'apron',   prop: null,      arms: 'crossed' },
    archivist: { h: 1.06, build: 0.86, stoop: 0.05, hat: null,   coat: 'robe',    prop: 'book',    arms: 'hold' },
    fisherman: { h: 0.92, build: 1.05, stoop: 0.30, hat: 'brim', coat: 'oilskin', prop: 'rod',     arms: 'shoulder' },
    drifter:   { h: 1.00, build: 0.95, stoop: 0.00, hat: 'hood', coat: 'rags',    prop: null,      arms: 'down', drift: 1 },
    collector: { h: 1.02, build: 0.92, stoop: 0.02, hat: 'tall', coat: 'tails',   prop: 'case',    arms: 'one' },
    astronomer:{ h: 1.04, build: 0.88, stoop: 0.14, hat: 'hood', coat: 'robe',    prop: 'scope',   arms: 'one' },
    merchant:  { h: 0.98, build: 1.10, stoop: 0.08, hat: 'brim', coat: 'tails',   prop: 'case',    arms: 'one' }
  };

  function tone(rgb, k) {
    return U.rgbToCss(k >= 0 ? U.mixRgb(rgb, MOON, k) : U.shade(rgb, k));
  }

  function ribbon(ctx, ax, ay, bx, by, cx, cy, w0, w1, steps) {
    steps = steps || 7;
    const lhs = [], rhs = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, iu = 1 - u;
      const x = iu * iu * ax + 2 * iu * u * bx + u * u * cx;
      const y = iu * iu * ay + 2 * iu * u * by + u * u * cy;
      const dx = 2 * iu * (bx - ax) + 2 * u * (cx - bx);
      const dy = 2 * iu * (by - ay) + 2 * u * (cy - by);
      const m = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * u) * 0.5;
      lhs.push(x - dy / m * w, y + dx / m * w);
      rhs.push(x + dy / m * w, y - dx / m * w);
    }
    ctx.beginPath();
    ctx.moveTo(lhs[0], lhs[1]);
    for (let i = 2; i < lhs.length; i += 2) ctx.lineTo(lhs[i], lhs[i + 1]);
    for (let i = rhs.length - 2; i >= 0; i -= 2) ctx.lineTo(rhs[i], rhs[i + 1]);
    ctx.closePath();
  }

  function tube(ctx, rgb, lo, hi, ax, ay, bx, by, w0, w1) {
    const dx = bx - ax, dy = by - ay;
    const m = Math.hypot(dx, dy) || 1;
    let nx = -dy / m, ny = dx / m;
    if (nx * 0.45 - ny < 0) { nx = -nx; ny = -ny; }
    const r = Math.max(1, (w0 + w1) * 0.5);
    const g = ctx.createLinearGradient(ax + nx * r, ay + ny * r, ax - nx * r, ay - ny * r);
    g.addColorStop(0, tone(rgb, hi));
    g.addColorStop(0.5, tone(rgb, U.lerp(lo, hi, 0.4)));
    g.addColorStop(1, tone(rgb, lo));
    ctx.fillStyle = g;
    ribbon(ctx, ax, ay, (ax + bx) / 2, (ay + by) / 2, bx, by, w0, w1, 5);
    ctx.fill();
  }

  /* opts: { facing, rim, walk, phase, talking } */
  function draw(ctx, npc, fh, t, opts) {
    opts = opts || {};
    const k = KIND[npc.id] || KIND.drifter;
    const face = opts.facing === undefined ? 1 : opts.facing;
    const rim = opts.rim || 'rgba(200,220,255,0.22)';
    const accent = U.hexToRgb(npc.color || '#8fa8c0');
    // the cloth is nearly black; the accent only tints it and lights the prop
    const cloth = U.mixRgb([7, 9, 15], accent, 0.16);

    const H = fh * k.h;
    const walk = opts.walk || 0;
    const ph = opts.phase || 0;
    const drift = k.drift ? Math.sin(t * 0.55) * H * 0.012 : 0;
    const breath = Math.sin(t * 0.8 + npc.id.length) * H * 0.004;
    // a person listening shifts their weight; a person talking gestures a bit
    const weight = Math.sin(t * 0.42 + npc.id.length * 2) * H * 0.006;
    const gest = opts.talking ? Math.sin(t * 2.3) * 0.5 + 0.5 : 0;

    const bob = walk ? Math.abs(Math.sin(ph)) * H * 0.020 : 0;
    const hipY = -H * 0.50 + bob + drift + breath;
    const hipX = weight;
    const stoop = k.stoop;
    const neckX = hipX + face * H * 0.045 * (1 + stoop * 2.2);
    const neckY = hipY - H * 0.40 * (1 - stoop * 0.16);
    const headR = H * 0.072;
    const headX = neckX + face * H * (0.020 + stoop * 0.075);
    const headY = neckY - headR * 1.18;
    const shN = { x: neckX + face * H * 0.100 * k.build, y: neckY + H * 0.052 };
    const shF = { x: neckX - face * H * 0.072 * k.build, y: neckY + H * 0.064 };

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (k.drift) ctx.globalAlpha *= 0.82 + 0.10 * Math.sin(t * 0.7);

    /* ---- legs ---- */
    const sw = walk * H * 0.19;
    const a0 = Math.sin(ph), a1 = Math.sin(ph + Math.PI);
    const legW = H * 0.085 * k.build;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? a0 : a1;
      const back = i === 0;
      const footX = hipX + face * s * sw + (i ? face * H * 0.020 : -face * H * 0.012);
      const footY = -Math.max(0, s * walk) * H * 0.045;
      const kneeX = hipX + face * s * sw * 0.55 + (i ? face * H * 0.018 : -face * H * 0.010);
      const kneeY = hipY * 0.48;
      tube(ctx, cloth, back ? -0.72 : -0.55, back ? 0.04 : 0.20,
           hipX + (i ? face * H * 0.02 : -face * H * 0.015), hipY, kneeX, kneeY,
           legW * 1.25, legW);
      tube(ctx, cloth, back ? -0.72 : -0.55, back ? 0.04 : 0.20,
           kneeX, kneeY, footX, footY, legW, legW * 0.72);
      // boot
      ctx.fillStyle = tone(cloth, back ? -0.62 : -0.42);
      ctx.beginPath();
      ctx.ellipse(footX + face * H * 0.014, footY - H * 0.008, H * 0.045, H * 0.028, 0, 0, TAU);
      ctx.fill();
    }

    /* ---- the far arm, behind the garment ---- */
    const armLo = -0.66, armHi = 0.16;
    drawArm(ctx, cloth, armLo, armHi, shF, k, H, face, ph, walk, gest, 0.85, true);

    /* ---- garment ---- */
    drawCoat(ctx, k, cloth, accent, H, face, hipX, hipY, shN, shF, neckX, neckY, t, walk, ph);

    /* ---- head ---- */
    drawHead(ctx, k, cloth, accent, headX, headY, headR, face, H, neckX, neckY, t);

    /* ---- the near arm and whatever it is holding ---- */
    const hand = drawArm(ctx, cloth, -0.40, 0.42, shN, k, H, face, ph, walk, gest, 1, false);
    drawProp(ctx, k, cloth, accent, hand, H, face, t, shN);

    /* ---- rim ---- */
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, H * 0.010);
    ctx.beginPath();
    ctx.moveTo(shF.x - face * H * 0.03, shF.y);
    ctx.quadraticCurveTo(neckX, neckY - H * 0.018, shN.x + face * H * 0.045, shN.y);
    ctx.quadraticCurveTo(hipX + face * H * 0.15, hipY - H * 0.20, hipX + face * H * 0.13, hipY + H * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(headX, headY, headR * 1.04, -Math.PI * 0.95, -Math.PI * 0.10);
    ctx.stroke();

    ctx.restore();
    return { headX: headX, headY: headY, headR: headR, top: headY - headR * 2.2 };
  }

  function drawArm(ctx, cloth, lo, hi, sh, k, H, face, ph, walk, gest, wmul, isFar) {
    const upper = H * 0.165, fore = H * 0.155;
    let hx, hy;
    switch (k.arms) {
      case 'crossed':
        hx = sh.x + face * H * (isFar ? 0.11 : 0.13);
        hy = sh.y + H * 0.20;
        break;
      case 'hold':
        hx = sh.x + face * H * 0.13;
        hy = sh.y + H * 0.21;
        break;
      case 'shoulder':
        if (!isFar) { hx = sh.x - face * H * 0.02; hy = sh.y - H * 0.09; }
        else { hx = sh.x + face * H * 0.05; hy = sh.y + H * 0.26; }
        break;
      case 'one':
        if (!isFar) { hx = sh.x + face * H * 0.04; hy = sh.y + H * 0.30; }
        else { hx = sh.x - face * H * 0.02; hy = sh.y + H * 0.29; }
        break;
      default: {
        const swing = walk * Math.sin(ph + (isFar ? 0 : Math.PI)) * H * 0.10;
        hx = sh.x + face * (swing + H * 0.02) + face * gest * H * 0.05;
        hy = sh.y + H * (0.30 - gest * 0.06);
      }
    }
    // elbow: dropped and slightly behind, which is where a relaxed one sits
    const mx = (sh.x + hx) / 2 - face * H * 0.035;
    const my = (sh.y + hy) / 2 + H * 0.035;
    tube(ctx, cloth, lo, hi, sh.x, sh.y, mx, my, H * 0.080 * wmul, H * 0.063 * wmul);
    tube(ctx, cloth, lo, hi, mx, my, hx, hy, H * 0.063 * wmul, H * 0.048 * wmul);
    ctx.fillStyle = tone(cloth, isFar ? -0.30 : 0.06);
    ctx.beginPath();
    ctx.arc(hx, hy, H * 0.030 * wmul, 0, TAU);
    ctx.fill();
    return { x: hx, y: hy };
  }

  function drawCoat(ctx, k, cloth, accent, H, face, hipX, hipY, shN, shF, neckX, neckY, t, walk, ph) {
    const hem = k.coat === 'robe' ? hipY + H * 0.34
              : k.coat === 'tails' ? hipY + H * 0.19
              : k.coat === 'rags' ? hipY + H * 0.27 : hipY + H * 0.13;
    const flare = k.coat === 'robe' ? 0.150 : k.coat === 'rags' ? 0.158 : 0.122;
    const sway = Math.sin(t * 1.0 + H) * H * 0.014 + walk * Math.sin(ph * 2) * H * 0.022;

    const g = ctx.createLinearGradient(shN.x + face * H * 0.10, shN.y - H * 0.05,
                                       hipX - face * H * 0.16, hem);
    g.addColorStop(0, tone(cloth, 0.30));
    g.addColorStop(0.36, tone(cloth, 0.02));
    g.addColorStop(1, tone(cloth, -0.55));
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.moveTo(hipX - face * H * flare - sway * 0.5, hem);
    ctx.quadraticCurveTo(shF.x - face * H * 0.075, (shF.y + hipY) / 2, shF.x - face * H * 0.050, shF.y);
    ctx.quadraticCurveTo(neckX, neckY - H * 0.020, shN.x + face * H * 0.055, shN.y);
    ctx.quadraticCurveTo(hipX + face * H * 0.145, (shN.y + hipY) / 2,
                         hipX + face * H * flare + sway * 0.6, hem);
    ctx.quadraticCurveTo(hipX + sway * 0.2, hem + H * (k.coat === 'rags' ? 0.02 : 0.045),
                         hipX - face * H * flare - sway * 0.5, hem);
    ctx.closePath();
    ctx.fill();

    if (k.coat === 'rags') {
      // a frayed hem, so the drifter never quite ends anywhere
      ctx.fillStyle = tone(cloth, -0.62);
      for (let i = 0; i < 6; i++) {
        const x = hipX - face * H * flare + face * (i / 5) * H * flare * 2;
        const d = H * (0.03 + ((i * 37) % 11) / 11 * 0.07) + Math.sin(t * 1.3 + i) * H * 0.012;
        ctx.beginPath();
        ctx.moveTo(x - H * 0.022, hem - H * 0.01);
        ctx.lineTo(x + H * 0.022, hem - H * 0.01);
        ctx.lineTo(x, hem + d);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (k.coat === 'apron') {
      ctx.fillStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.17), 0.9);
      ctx.beginPath();
      ctx.moveTo(hipX - face * H * 0.030, neckY + H * 0.13);
      ctx.lineTo(hipX + face * H * 0.058, neckY + H * 0.14);
      ctx.quadraticCurveTo(hipX + face * H * 0.098, hipY - H * 0.06,
                           hipX + face * H * 0.090, hem + H * 0.055);
      ctx.lineTo(hipX - face * H * 0.070, hem + H * 0.045);
      ctx.quadraticCurveTo(hipX - face * H * 0.062, hipY - H * 0.06,
                           hipX - face * H * 0.030, neckY + H * 0.13);
      ctx.closePath();
      ctx.fill();
      // the strap over the shoulder
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.22), 0.8);
      ctx.lineWidth = Math.max(0.8, H * 0.011);
      ctx.beginPath();
      ctx.moveTo(hipX - face * H * 0.020, neckY + H * 0.135);
      ctx.lineTo(neckX - face * H * 0.010, neckY + H * 0.055);
      ctx.stroke();
    }
    if (k.coat === 'tails') {
      ctx.fillStyle = tone(cloth, -0.50);
      ctx.beginPath();
      ctx.moveTo(hipX - face * H * 0.10, hipY + H * 0.02);
      ctx.quadraticCurveTo(hipX - face * H * 0.19, hipY + H * 0.30,
                           hipX - face * H * 0.12 - sway, hipY + H * 0.50);
      ctx.lineTo(hipX - face * H * 0.02 - sway, hipY + H * 0.46);
      ctx.quadraticCurveTo(hipX - face * H * 0.04, hipY + H * 0.24, hipX + face * H * 0.02, hipY + H * 0.02);
      ctx.closePath();
      ctx.fill();
      // a collar
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.45), 0.7);
      ctx.lineWidth = Math.max(0.8, H * 0.010);
      ctx.beginPath();
      ctx.moveTo(neckX - face * H * 0.035, neckY + H * 0.045);
      ctx.lineTo(neckX + face * H * 0.030, neckY + H * 0.075);
      ctx.stroke();
    }
    if (k.coat === 'robe') {
      // a tall stiff collar, the archivist's whole personality
      ctx.fillStyle = tone(cloth, 0.16);
      ctx.beginPath();
      ctx.moveTo(neckX - face * H * 0.055, neckY + H * 0.075);
      ctx.quadraticCurveTo(neckX - face * H * 0.070, neckY - H * 0.055,
                           neckX - face * H * 0.020, neckY - H * 0.060);
      ctx.lineTo(neckX + face * H * 0.055, neckY - H * 0.040);
      ctx.quadraticCurveTo(neckX + face * H * 0.080, neckY + H * 0.050,
                           neckX + face * H * 0.055, neckY + H * 0.085);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHead(ctx, k, cloth, accent, hx, hy, r, face, H, neckX, neckY, t) {
    ctx.fillStyle = tone(cloth, -0.10);
    ribbon(ctx, neckX, neckY + H * 0.02, neckX, neckY - H * 0.01,
           hx - face * r * 0.12, hy + r * 0.72, H * 0.048, H * 0.040, 3);
    ctx.fill();

    ctx.fillStyle = tone(cloth, 0.06);
    ctx.beginPath();
    ctx.ellipse(hx, hy, r * 0.93, r * 1.05, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + face * r * 0.44, hy + r * 0.32, r * 0.44, r * 0.32, 0, 0, TAU);
    ctx.fill();

    switch (k.hat) {
      case 'cap': {
        ctx.fillStyle = tone(cloth, 0.20);
        ctx.beginPath();
        ctx.ellipse(hx, hy - r * 0.55, r * 1.06, r * 0.62, 0, Math.PI, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hx + face * r * 0.75, hy - r * 0.48, r * 0.85, r * 0.16, 0.06 * face, 0, TAU);
        ctx.fill();
        break;
      }
      case 'brim': {
        ctx.fillStyle = tone(cloth, 0.13);
        ctx.beginPath();
        ctx.ellipse(hx, hy - r * 0.72, r * 0.86, r * 0.80, 0, Math.PI, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hx + face * r * 0.18, hy - r * 0.42, r * 1.85, r * 0.22, 0.05 * face, 0, TAU);
        ctx.fill();
        break;
      }
      case 'tall': {
        ctx.fillStyle = tone(cloth, 0.18);
        ctx.save();
        ctx.translate(hx, hy - r * 0.55);
        ctx.rotate(0.06 * face);
        ctx.fillRect(-r * 0.80, -r * 1.55, r * 1.60, r * 1.60);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.42, r * 0.20, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.28), 0.75);
        ctx.fillRect(-r * 0.80, -r * 0.30, r * 1.60, r * 0.20);
        ctx.restore();
        break;
      }
      case 'hood': {
        ctx.fillStyle = tone(cloth, 0.10);
        ctx.beginPath();
        ctx.moveTo(hx - face * r * 1.08, hy + r * 1.14);
        ctx.quadraticCurveTo(hx - face * r * 1.40, hy - r * 0.60, hx - face * r * 0.56, hy - r * 1.24);
        ctx.quadraticCurveTo(hx - face * r * 0.04, hy - r * 1.66, hx + face * r * 0.70, hy - r * 1.02);
        ctx.quadraticCurveTo(hx + face * r * 1.22, hy - r * 0.62, hx + face * r * 1.10, hy - r * 0.02);
        ctx.quadraticCurveTo(hx + face * r * 0.44, hy + r * 0.04, hx - face * r * 0.02, hy + r * 0.76);
        ctx.quadraticCurveTo(hx - face * r * 0.60, hy + r * 1.22, hx - face * r * 1.08, hy + r * 1.14);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }

    // one cold catchlight where an eye would be
    ctx.fillStyle = U.rgbToCss(U.mixRgb(accent, [255, 255, 255], 0.4), 0.28);
    ctx.beginPath();
    ctx.ellipse(hx + face * r * 0.50, hy + r * (k.hat === 'brim' ? 0.16 : 0.02),
                r * 0.12, r * 0.085, -0.2 * face, 0, TAU);
    ctx.fill();
  }

  function drawProp(ctx, k, cloth, accent, hand, H, face, t, sh) {
    switch (k.prop) {
      case 'book': {
        ctx.save();
        ctx.translate(hand.x - face * H * 0.008, hand.y - H * 0.004);
        ctx.rotate(-0.18 * face);
        ctx.fillStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.22));
        ctx.fillRect(-H * 0.040, -H * 0.034, H * 0.080, H * 0.068);
        ctx.fillStyle = 'rgba(214,226,240,0.34)';
        ctx.fillRect(-H * 0.034, -H * 0.028, H * 0.068, H * 0.009);
        ctx.restore();
        break;
      }
      case 'rod': {
        // carried over the shoulder, butt down and behind
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.30));
        ctx.lineWidth = Math.max(1, H * 0.011);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hand.x - face * H * 0.20, hand.y + H * 0.30);
        ctx.quadraticCurveTo(hand.x, hand.y - H * 0.06, hand.x + face * H * 0.22, hand.y - H * 0.34);
        ctx.stroke();
        break;
      }
      /* A short refractor, carried muzzle-up the way you carry something you
         have already decided not to put down. */
      case 'scope': {
        ctx.save();
        ctx.translate(hand.x, hand.y);
        ctx.rotate(face * -0.62 + Math.sin(t * 0.5) * 0.02);
        const L = H * 0.20, w = H * 0.026;
        ctx.fillStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.28));
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-w * 0.5, -L * 0.62, w, L, w * 0.4); ctx.fill(); }
        else ctx.fillRect(-w * 0.5, -L * 0.62, w, L);
        // the wider objective at the sky end
        ctx.fillStyle = U.rgbToCss(U.mixRgb(accent, [255, 255, 255], 0.35), 0.85);
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-w * 0.78, -L * 0.70, w * 1.56, L * 0.16, w * 0.3); ctx.fill(); }
        else ctx.fillRect(-w * 0.78, -L * 0.70, w * 1.56, L * 0.16);
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(accent, [255, 255, 255], 0.5), 0.30);
        ctx.lineWidth = Math.max(0.5, H * 0.004);
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, -L * 0.20); ctx.lineTo(w * 0.5, -L * 0.20);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'case': {
        ctx.fillStyle = U.rgbToCss(U.mixRgb(cloth, accent, 0.16));
        ctx.save();
        ctx.translate(hand.x, hand.y + H * 0.048);
        ctx.rotate(Math.sin(t * 0.7) * 0.04);
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-H * 0.058, -H * 0.038, H * 0.116, H * 0.076, H * 0.008); ctx.fill(); }
        else ctx.fillRect(-H * 0.058, -H * 0.038, H * 0.116, H * 0.076);
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(accent, [255, 255, 255], 0.4), 0.32);
        ctx.lineWidth = Math.max(0.6, H * 0.005);
        ctx.beginPath();
        ctx.moveTo(-H * 0.058, 0); ctx.lineTo(H * 0.058, 0);
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }

  VF.npcArt = { draw: draw, kinds: KIND };
})(window.VF = window.VF || {});
