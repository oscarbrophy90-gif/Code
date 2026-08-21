/* VOID FISHING — rod rendering.
   Shared by the scene (where geometry comes from the angler's hand and the
   bend under load) and the shop (where the rod is laid out flat in a box).
   `art.style` adds the flourish that makes each tier visually distinct. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;

  function quadAt(p0, p1, p2, k) {
    const m = 1 - k;
    return m * m * p0 + 2 * m * k * p1 + k * k * p2;
  }

  /* Point and tangent anywhere along the blank. */
  function ptAt(g, k) {
    const m = 1 - k;
    return {
      x: m * m * g.bx + 2 * m * k * g.cx + k * k * g.tx,
      y: m * m * g.by + 2 * m * k * g.cy + k * k * g.ty,
      dx: 2 * m * (g.cx - g.bx) + 2 * k * (g.tx - g.cx),
      dy: 2 * m * (g.cy - g.by) + 2 * k * (g.ty - g.cy)
    };
  }

  /* Point, unit tangent and unit normal at k. The flourishes past the ordinary
     tiers all build shapes off the blank rather than along it, and every one of
     them needs the same three vectors. */
  function nAt(g, k) {
    const p = ptAt(g, k);
    const m = Math.hypot(p.dx, p.dy) || 1;
    const tx = p.dx / m, ty = p.dy / m;
    return { x: p.x, y: p.y, tx: tx, ty: ty, nx: -ty, ny: tx };
  }

  /* A tapered ribbon along the blank between two k values. Widths are in
     pixels and interpolate along the run. */
  function taper(ctx, g, k0, k1, w0, w1, steps) {
    steps = steps || 14;
    const lhs = [], rhs = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const k = k0 + (k1 - k0) * u;
      const p = ptAt(g, k);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const w = (w0 + (w1 - w0) * u) * 0.5;
      const nx = -p.dy / m * w, ny = p.dx / m * w;
      lhs.push(p.x + nx, p.y + ny);
      rhs.push(p.x - nx, p.y - ny);
    }
    ctx.beginPath();
    ctx.moveTo(lhs[0], lhs[1]);
    for (let i = 2; i < lhs.length; i += 2) ctx.lineTo(lhs[i], lhs[i + 1]);
    for (let i = rhs.length - 2; i >= 0; i -= 2) ctx.lineTo(rhs[i], rhs[i + 1]);
    ctx.closePath();
  }

  /* Where the guides sit. They crowd together toward the tip on a real rod,
     because that is where the blank bends most. */
  const GUIDES = [0.30, 0.45, 0.58, 0.695, 0.795, 0.88, 0.95];

  /* g: { bx, by, cx, cy, tx, ty, len, angle } — butt, control, tip. */
  function draw(ctx, rod, g, t, opts) {
    opts = opts || {};
    const art = rod.art;
    // stroke weight tracks rod length; `weight` compensates for canvases
    // drawn at a higher resolution than they are displayed
    const scale = U.clamp(g.len / 300, 0.55, 1.35) * (opts.weight || 1);
    const tipRgb = U.hexToRgb(art.tip);
    const c1 = U.hexToRgb(art.c1), c2 = U.hexToRgb(art.c2);
    const gripRgb = U.hexToRgb(art.grip);
    const under = opts.under === undefined ? 1 : opts.under;   // which side the reel hangs

    if (art.glow > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgbToCss(tipRgb, 0.13 * art.glow);
      ctx.lineWidth = Math.max(4, 7 * scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.bx, g.by);
      ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
      ctx.stroke();
      ctx.restore();
    }

    /* ---- the blank: one continuous taper from a thick butt to a hair tip ---- */
    const wButt = Math.max(1.8, 5.0 * scale);
    const wTip = Math.max(0.55, 0.85 * scale);
    const blank = ctx.createLinearGradient(g.bx, g.by, g.tx, g.ty);
    blank.addColorStop(0, U.rgbToCss(U.shade(c2, -0.15)));
    blank.addColorStop(0.30, U.rgbToCss(c2));
    blank.addColorStop(0.72, U.rgbToCss(c1));
    blank.addColorStop(1, U.rgbToCss(U.mixRgb(c1, tipRgb, 0.75)));
    ctx.fillStyle = blank;
    taper(ctx, g, 0, 1, wButt, wTip, 12);
    ctx.fill();

    /* a specular line along the lit edge — the thing that makes a blank look
       like lacquered graphite rather than a drawn stroke */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(c1, [255, 255, 255], 0.55));
    ctx.lineWidth = Math.max(0.5, 0.9 * scale);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const k = 0.06 + (i / 10) * 0.92;
      const p = ptAt(g, k);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const w = U.lerp(wButt, wTip, k) * 0.26;
      const x = p.x + p.dy / m * w * under, y = p.y - p.dx / m * w * under;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    drawStyle(ctx, art, g, t, scale, tipRgb);

    /* ---- guides ---- */
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [220, 235, 250], 0.35), 0.72);
    for (let i = 0; i < GUIDES.length; i++) {
      const k = GUIDES[i];
      const p = ptAt(g, k);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const nx = -p.dy / m * under, ny = p.dx / m * under;
      const rr = Math.max(0.8, U.lerp(3.0, 1.1, k) * scale);
      const foot = rr * 1.35;
      ctx.lineWidth = Math.max(0.4, 0.7 * scale);
      // the foot that binds the guide to the blank
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + nx * foot, p.y + ny * foot);
      ctx.stroke();
      // the ring itself
      ctx.beginPath();
      ctx.ellipse(p.x + nx * (foot + rr * 0.7), p.y + ny * (foot + rr * 0.7),
                  rr, rr * 0.72, Math.atan2(p.dy, p.dx), 0, TAU);
      ctx.stroke();
    }
    // tip-top ring
    {
      const p = ptAt(g, 1);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const rr = Math.max(0.8, 1.5 * scale);
      ctx.lineWidth = Math.max(0.4, 0.7 * scale);
      ctx.beginPath();
      ctx.ellipse(p.x + p.dx / m * rr * 0.8, p.y + p.dy / m * rr * 0.8,
                  rr, rr * 0.78, Math.atan2(p.dy, p.dx), 0, TAU);
      ctx.stroke();
    }

    /* ---- grip, reel seat, reel ---- */
    const a = g.angle;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const gripEnd = 0.20;

    // cork, fattest in the middle where a hand closes on it
    const gg = ctx.createLinearGradient(g.bx - sinA * wButt * under, g.by + cosA * wButt * under,
                                        g.bx + sinA * wButt * under, g.by - cosA * wButt * under);
    gg.addColorStop(0, U.rgbToCss(U.shade(gripRgb, -0.35)));
    gg.addColorStop(0.55, U.rgbToCss(U.shade(gripRgb, 0.18)));
    gg.addColorStop(1, U.rgbToCss(U.shade(gripRgb, -0.5)));
    ctx.fillStyle = gg;
    taper(ctx, g, 0, gripEnd * 0.55, wButt * 1.55, wButt * 1.9, 5);
    ctx.fill();
    taper(ctx, g, gripEnd * 0.55, gripEnd, wButt * 1.9, wButt * 1.25, 5);
    ctx.fill();

    // butt cap
    ctx.fillStyle = U.rgbToCss(U.shade(gripRgb, -0.55));
    ctx.beginPath();
    ctx.ellipse(g.bx, g.by, wButt * 0.95, wButt * 0.95, 0, 0, TAU);
    ctx.fill();

    // binding bands
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [0, 0, 0], 0.35), 0.7);
    ctx.lineWidth = Math.max(0.5, 1.0 * scale);
    for (let i = 0; i < 2; i++) {
      const k = 0.055 + i * 0.085;
      const p = ptAt(g, k);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const w = wButt * 1.75;
      ctx.beginPath();
      ctx.moveTo(p.x - p.dy / m * w * 0.5, p.y + p.dx / m * w * 0.5);
      ctx.lineTo(p.x + p.dy / m * w * 0.5, p.y - p.dx / m * w * 0.5);
      ctx.stroke();
    }

    drawReel(ctx, g, art, t, scale, opts, under, tipRgb, c1, c2);
    drawReelStyle(ctx, art, g, t, scale, under, tipRgb, c1, c2);
  }

  /* A spinning reel: seat, stem, spool with a line wrap, bail and a crank
     that actually turns when the player is reeling. */
  function drawReel(ctx, g, art, t, scale, opts, under, tipRgb, c1, c2) {
    const a = g.angle;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const nx = -sinA * under, ny = cosA * under;
    const rr = Math.max(2.8, 6.0 * scale);
    const sx = g.bx + cosA * g.len * 0.215;
    const sy = g.by + sinA * g.len * 0.215;
    const cx = sx + nx * rr * 1.9, cy = sy + ny * rr * 1.9;

    // reel seat: a short collar on the blank
    ctx.fillStyle = U.rgbToCss(U.shade(c2, 0.25));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-rr * 1.1, -rr * 0.55, rr * 2.2, rr * 1.1, rr * 0.3);
    else ctx.rect(-rr * 1.1, -rr * 0.55, rr * 2.2, rr * 1.1);
    ctx.fill();
    ctx.restore();

    // stem down to the reel body
    ctx.strokeStyle = U.rgbToCss(U.shade(c2, 0.15));
    ctx.lineWidth = Math.max(1, rr * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(cx - nx * rr * 0.6, cy - ny * rr * 0.6);
    ctx.stroke();

    // body
    const bg = ctx.createLinearGradient(cx - nx * rr, cy - ny * rr, cx + nx * rr, cy + ny * rr);
    bg.addColorStop(0, U.rgbToCss(U.shade(c1, 0.30)));
    bg.addColorStop(1, U.rgbToCss(U.shade(c2, -0.30)));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 1.05, rr * 0.98, a, 0, TAU);
    ctx.fill();

    // the spool sits inside the housing, dark and recessed
    ctx.fillStyle = U.rgbToCss(U.shade(c2, -0.55));
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.66, 0, TAU);
    ctx.fill();
    // one bright rim is worth more than three faint ones at this size
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.4), 0.85);
    ctx.lineWidth = Math.max(0.5, 0.9 * scale);
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.66, 0, TAU);
    ctx.stroke();
    // the wrap of line on the spool
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [235, 245, 255], 0.55), 0.35);
    ctx.lineWidth = Math.max(0.35, 0.6 * scale);
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 0.42, 0, TAU);
    ctx.stroke();

    const spin = opts.spin === undefined ? t * 0.4 : opts.spin;

    // bail: half an arc across the face, not a closed ring
    ctx.lineWidth = Math.max(0.5, 0.85 * scale);
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [220, 235, 250], 0.45), 0.9);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rr * 0.94, rr * 0.94, spin * 0.35, Math.PI * 0.15, Math.PI * 1.05);
    ctx.stroke();

    // the crank reaches clear of the housing so the turn is legible
    const hx = cx + Math.cos(spin) * rr * 1.75;
    const hy = cy + Math.sin(spin) * rr * 1.35;
    ctx.strokeStyle = U.rgbToCss(U.shade(c1, 0.42));
    ctx.lineWidth = Math.max(0.8, 1.3 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(spin) * rr * 0.4, cy + Math.sin(spin) * rr * 0.3);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = U.rgbToCss(U.shade(U.hexToRgb(art.grip), 0.20));
    ctx.beginPath();
    ctx.ellipse(hx, hy, rr * 0.36, rr * 0.28, spin, 0, TAU);
    ctx.fill();
  }

  /* Per-tier flourishes along the blank. */
  function drawStyle(ctx, art, g, t, scale, tipRgb) {
    const at = function (k) {
      return { x: quadAt(g.bx, g.cx, g.tx, k), y: quadAt(g.by, g.cy, g.ty, k) };
    };
    switch (art.style) {
      case 'wrap': {
        ctx.strokeStyle = art.tip;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(0.7, 1.2 * scale);
        for (let i = 0; i < 5; i++) {
          const p = at(0.26 + i * 0.15);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.6, 2.6 * scale), 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'runic': {
        ctx.strokeStyle = art.tip;
        ctx.lineWidth = Math.max(0.6, 1 * scale);
        for (let i = 0; i < 6; i++) {
          const p = at(0.20 + i * 0.13);
          const pulse = 0.35 + 0.35 * Math.sin(t * 1.6 + i);
          ctx.globalAlpha = pulse;
          const s = Math.max(1.4, 2.4 * scale);
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y);
          ctx.lineTo(p.x - s, p.y + s);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'lunar': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.22);
        ctx.lineWidth = Math.max(1.6, 2.6 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'celestial': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const p = at(0.24 + i * 0.17);
          // keep the twinkle strictly positive: a negative radius throws
          const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7);
          const r = Math.max(0.8, Math.max(1.6, 3.4 * scale) * tw);
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.9);
          grd.addColorStop(0, U.rgbToCss(tipRgb, 0.62));
          grd.addColorStop(0.4, U.rgbToCss(tipRgb, 0.16));
          grd.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.9, 0, TAU); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'glass': {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(0.5, 0.9 * scale);
        ctx.beginPath();
        ctx.moveTo(U.lerp(g.bx, g.tx, 0.16), U.lerp(g.by, g.ty, 0.16));
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        break;
      }
      case 'void': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const k = ((t * 0.14 + i / 7) % 1) * 0.85 + 0.12;
          const p = at(k);
          ctx.fillStyle = U.rgbToCss(tipRgb, 0.5 * Math.sin(k * Math.PI));
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.9, 1.7 * scale), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'singularity': {
        ctx.save();
        const r = Math.max(3, 6 * scale);
        const grd = ctx.createRadialGradient(g.tx, g.ty, 0, g.tx, g.ty, r * 2.6);
        grd.addColorStop(0, 'rgba(0,0,0,0.95)');
        grd.addColorStop(0.55, U.rgbToCss(tipRgb, 0.45));
        grd.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(g.tx, g.ty, r * 2.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.7);
        ctx.lineWidth = Math.max(0.6, 1 * scale);
        ctx.beginPath();
        ctx.ellipse(g.tx, g.ty, r * 1.9, r * 0.7, t * 0.7, 0, TAU);
        ctx.stroke();
        ctx.restore();
        break;
      }
      /* --- the wanderer's four families --- */

      /* a wave running the length of it */
      case 'tide': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.34);
        ctx.lineWidth = Math.max(0.7, 1.3 * scale);
        ctx.beginPath();
        for (let i = 0; i <= 22; i++) {
          const k = 0.16 + (i / 22) * 0.82;
          const p = at(k);
          const q2 = at(Math.min(0.999, k + 0.01));
          const m = Math.hypot(q2.x - p.x, q2.y - p.y) || 1;
          const w = Math.sin(k * 11 - t * 2.4) * Math.max(1.6, 3.4 * scale);
          const x = p.x - (q2.y - p.y) / m * w, y = p.y + (q2.x - p.x) / m * w;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }

      /* sparks coming off it and going out */
      case 'ember': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const seed = (t * 0.5 + i * 0.61) % 1;
          const p = at(0.22 + ((i * 0.13) % 0.74));
          const rise = seed * Math.max(6, 13 * scale);
          const a = (1 - seed) * 0.6;
          const r = Math.max(0.6, 1.5 * scale) * (1 - seed * 0.5);
          const g2 = ctx.createRadialGradient(p.x, p.y - rise, 0, p.x, p.y - rise, r * 3);
          g2.addColorStop(0, U.rgbToCss(tipRgb, a));
          g2.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(p.x, p.y - rise, r * 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
        break;
      }

      /* spurs of ice growing out of the blank */
      case 'frost': {
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.55);
        ctx.lineWidth = Math.max(0.5, 0.95 * scale);
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          const k = 0.24 + i * 0.125;
          const p = at(k), q2 = at(Math.min(0.999, k + 0.01));
          const m = Math.hypot(q2.x - p.x, q2.y - p.y) || 1;
          const nx = -(q2.y - p.y) / m, ny = (q2.x - p.x) / m;
          const side = i % 2 ? 1 : -1;
          const L2 = Math.max(2.4, (5.4 - i * 0.4) * scale) * (0.8 + 0.2 * Math.sin(t * 1.1 + i));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + nx * L2 * side, p.y + ny * L2 * side);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x + nx * L2 * 0.55 * side, p.y + ny * L2 * 0.55 * side);
          ctx.lineTo(p.x + nx * L2 * 0.8 * side + (q2.x - p.x) / m * L2 * 0.4,
                     p.y + ny * L2 * 0.8 * side + (q2.y - p.y) / m * L2 * 0.4);
          ctx.stroke();
        }
        break;
      }

      /* Rings of light standing off the blank, sparks running up it, and a
         burst of feathered gold where the hand goes. It is not subtle. It is
         not supposed to be. */
      case 'heavens': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < 5; i++) {
          const k = 0.30 + i * 0.155;
          const p = at(k);
          const q = at(Math.min(0.999, k + 0.02));
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          const puls = 0.62 + 0.38 * Math.sin(t * 2.1 - i * 0.9);
          const r = Math.max(2.2, (5.6 - i * 0.5) * scale) * puls;
          ctx.strokeStyle = U.rgbToCss(tipRgb, 0.55 * puls);
          ctx.lineWidth = Math.max(0.7, 1.5 * scale);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.34, ang, 0, TAU);
          ctx.stroke();
        }

        // sparks travelling toward the tip
        for (let i = 0; i < 6; i++) {
          const k = ((t * 0.30 + i / 6) % 1) * 0.74 + 0.24;
          const p = at(k);
          const a = 0.6 * Math.sin(k * Math.PI);
          const r = Math.max(0.9, 2.0 * scale);
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
          grd.addColorStop(0, U.rgbToCss(tipRgb, a));
          grd.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, TAU); ctx.fill();
        }

        // the burst at the butt
        const b = at(0.16);
        const br = Math.max(5, 11 * scale);
        const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, br);
        bg.addColorStop(0, U.rgbToCss(tipRgb, 0.55));
        bg.addColorStop(0.45, U.rgbToCss(tipRgb, 0.16));
        bg.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(b.x, b.y, br, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.42);
        ctx.lineWidth = Math.max(0.6, 1.1 * scale);
        for (let i = 0; i < 7; i++) {
          const a2 = (i / 7) * TAU + t * 0.25;
          const l = br * (0.62 + 0.38 * Math.sin(t * 1.7 + i * 2.1));
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(a2) * br * 0.28, b.y + Math.sin(a2) * br * 0.28);
          ctx.lineTo(b.x + Math.cos(a2) * l, b.y + Math.sin(a2) * l);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      /* A black core with the fire coming off it in feathers rather than in
         flames — jagged barbs that leave the shaft and thin to nothing, and a
         fine spatter thrown clear of them. */
      case 'pyre': {
        ctx.save();
        const hot = U.mixRgb(tipRgb, [255, 255, 255], 0.35);
        for (let i = 0; i < 11; i++) {
          const k = 0.14 + i * 0.076;
          if (k > 0.98) break;
          const p = nAt(g, k);
          const side = i % 2 ? 1 : -1;
          const beat = 0.72 + 0.28 * Math.sin(t * 2.6 + i * 1.3);
          // barbs are longest at the middle of the blank and short at the ends
          const taperK = Math.sin(Math.min(1, Math.max(0, (k - 0.10) / 0.88)) * Math.PI);
          const len = (7 + 20 * taperK) * scale * beat;
          const lean = 0.55;               // they all sweep toward the tip
          const bx2 = p.x + p.nx * len * side + p.tx * len * lean;
          const by2 = p.y + p.ny * len * side + p.ty * len * lean;
          const grd = ctx.createLinearGradient(p.x, p.y, bx2, by2);
          grd.addColorStop(0, U.rgbToCss(hot, 0.92));
          grd.addColorStop(0.45, U.rgbToCss(tipRgb, 0.70));
          grd.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = grd;
          // a barb is a thin leaf, not a line: two curves meeting at the point
          const w = (2.6 + 2.2 * taperK) * scale;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + p.nx * len * 0.45 * side - p.tx * w,
                               p.y + p.ny * len * 0.45 * side - p.ty * w, bx2, by2);
          ctx.quadraticCurveTo(p.x + p.nx * len * 0.40 * side + p.tx * w * 1.9,
                               p.y + p.ny * len * 0.40 * side + p.ty * w * 1.9, p.x, p.y);
          ctx.fill();
        }
        // the spatter, thrown clear and going out
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          const seed = ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
          const ph = (t * 0.55 + seed) % 1;
          const p = nAt(g, 0.20 + seed * 0.72);
          const side = seed > 0.5 ? 1 : -1;
          const d = (10 + 34 * ph) * scale;
          const r = Math.max(0.5, (1.7 - ph * 1.2) * scale);
          ctx.fillStyle = U.rgbToCss(tipRgb, (1 - ph) * 0.75);
          ctx.beginPath();
          ctx.arc(p.x + p.nx * d * side + p.tx * d * 0.35,
                  p.y + p.ny * d * side + p.ty * d * 0.35, r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      /* Standing rings of fire down the blank and a pair of wings opened at
         the hand. Sized off the length of the rod rather than off the stroke
         weight, because these have to read as the largest thing on it — at
         stroke scale they came out as beads. Drawn additively: the point of
         this rod is that it is the brightest object on the screen. */
      case 'seraph': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const R0 = g.len * 0.062;        // the ring at the bottom of the blank

        for (let i = 0; i < 6; i++) {
          const k = 0.24 + i * 0.138;
          const p = nAt(g, k);
          const ang = Math.atan2(p.ty, p.tx);
          const puls = 0.62 + 0.38 * Math.sin(t * 1.9 - i * 0.8);
          // they close toward the tip, the way the reference does
          const r = R0 * (1 - i * 0.11) * puls;
          ctx.strokeStyle = U.rgbToCss(tipRgb, 0.78 * puls);
          ctx.lineWidth = Math.max(1.1, 2.4 * scale);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.30, ang, 0, TAU);
          ctx.stroke();
          // a wider, fainter ring standing just outside it
          ctx.strokeStyle = U.rgbToCss(tipRgb, 0.26 * puls);
          ctx.lineWidth = Math.max(0.6, 1.1 * scale);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r * 1.5, r * 0.46, ang, 0, TAU);
          ctx.stroke();
          // and the coal each ring stands on
          const gd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 0.85);
          gd.addColorStop(0, U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.55), 0.55 * puls));
          gd.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = gd;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.85, 0, TAU); ctx.fill();
        }

        // a bright seam running the length of the blank
        const seam = ctx.createLinearGradient(g.bx, g.by, g.tx, g.ty);
        seam.addColorStop(0, U.rgbToCss(tipRgb, 0.12));
        seam.addColorStop(0.5, U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.6), 0.6));
        seam.addColorStop(1, U.rgbToCss(tipRgb, 0.20));
        ctx.strokeStyle = seam;
        ctx.lineWidth = Math.max(0.6, 1.3 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'glitch': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const off = Math.max(1, 2 * scale);
        [['#ff2d55', -off], ['#66ffe0', off]].forEach(function (pair) {
          ctx.strokeStyle = pair[0];
          ctx.globalAlpha = 0.4 + 0.25 * Math.sin(t * 9 + (pair[1] > 0 ? 1 : 0));
          ctx.lineWidth = Math.max(0.7, 1.3 * scale);
          ctx.beginPath();
          ctx.moveTo(g.bx + pair[1], g.by);
          ctx.quadraticCurveTo(g.cx + pair[1], g.cy, g.tx + pair[1], g.ty);
          ctx.stroke();
        });
        ctx.restore();
        break;
      }

      /* ------------------------------------------------- the far end ----
         These are the rods that are supposed to be absurd. Each one gets a
         mechanism of its own rather than another set of dots on the blank. */

      case 'storm': {
        // charge that has not finished leaving the blank: forks jumping
        // between the guides, redrawn on their own irregular clock
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const seed = Math.floor(t * 9);
        const rnd = VF.rng.make(seed * 2654435761 ^ 0x5701);
        const forks = 3;
        for (let f = 0; f < forks; f++) {
          const k0 = 0.18 + rnd() * 0.55;
          const k1 = Math.min(0.99, k0 + 0.14 + rnd() * 0.30);
          const a0 = at(k0), a1 = at(k1);
          ctx.strokeStyle = U.rgbToCss(tipRgb, 0.30 + rnd() * 0.5);
          ctx.lineWidth = Math.max(0.6, (0.8 + rnd() * 1.4) * scale);
          ctx.beginPath();
          ctx.moveTo(a0.x, a0.y);
          const steps = 4;
          for (let i = 1; i <= steps; i++) {
            const u = i / steps;
            const px = U.lerp(a0.x, a1.x, u) + (rnd() - 0.5) * 9 * scale;
            const py = U.lerp(a0.y, a1.y, u) + (rnd() - 0.5) * 9 * scale;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        // a standing charge along the whole blank
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.16 + 0.10 * Math.sin(t * 5.5));
        ctx.lineWidth = Math.max(1.4, 2.4 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'bone': {
        // vertebrae down the blank, thinning toward a fang
        ctx.fillStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.25), 0.85);
        ctx.strokeStyle = U.rgbToCss(U.shade(tipRgb, -0.55), 0.7);
        ctx.lineWidth = Math.max(0.4, 0.6 * scale);
        for (let i = 0; i < 9; i++) {
          const k = 0.14 + i * 0.093;
          const p = at(k);
          const w = Math.max(1, (3.6 - i * 0.30) * scale);
          const ang = Math.atan2(p.y - at(Math.max(0, k - 0.02)).y, p.x - at(Math.max(0, k - 0.02)).x);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, w * 0.62, w, 0, 0, TAU);
          ctx.fill();
          ctx.stroke();
          // the transverse spurs, swept back the way a spine's are
          ctx.lineWidth = Math.max(0.5, 0.9 * scale);
          ctx.beginPath();
          ctx.moveTo(-w * 0.2, -w * 0.7); ctx.lineTo(-w * 1.1, -w * 2.0);
          ctx.moveTo(-w * 0.2, w * 0.7); ctx.lineTo(-w * 1.1, w * 2.0);
          ctx.stroke();
          ctx.lineWidth = Math.max(0.4, 0.6 * scale);
          ctx.restore();
        }
        // and it ends in the point it was taken from
        {
          const p = at(1), q = at(0.94);
          const ang = Math.atan2(p.y - q.y, p.x - q.x);
          const fw = Math.max(1.2, 2.2 * scale);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(-fw * 3.2, -fw);
          ctx.quadraticCurveTo(fw * 1.2, -fw * 0.5, fw * 3.4, 0);
          ctx.quadraticCurveTo(fw * 1.2, fw * 0.5, -fw * 3.2, fw);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        // marrow-light bleeding up the inside
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.10 + 0.06 * Math.sin(t * 1.3));
        ctx.lineWidth = Math.max(0.8, 1.6 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'chorus': {
        // a voice at every guide: rings that swell out of phase, and motes
        // that rise off the blank and go out
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const p = at(0.22 + i * 0.14);
          const ph = (t * 0.55 + i * 0.17) % 1;
          const r = Math.max(1, (2 + ph * 11) * scale);
          ctx.strokeStyle = U.rgbToCss(tipRgb, (1 - ph) * 0.45);
          ctx.lineWidth = Math.max(0.5, (1.4 - ph) * scale);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
          // the mote itself
          ctx.fillStyle = U.rgbToCss(tipRgb, 0.55 + 0.35 * Math.sin(t * 2.1 + i));
          ctx.beginPath();
          ctx.arc(p.x, p.y - ph * 9 * scale, Math.max(0.7, 1.5 * scale), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'eclipse': {
        // a covered sun at the tip, with a corona and a shadow pointing wrong
        ctx.save();
        const r = Math.max(3.2, 6.6 * scale);
        const pulse = 0.82 + 0.18 * Math.sin(t * 0.9);
        ctx.globalCompositeOperation = 'lighter';
        const cor = ctx.createRadialGradient(g.tx, g.ty, r * 0.9, g.tx, g.ty, r * 3.4 * pulse);
        cor.addColorStop(0, U.rgbToCss(tipRgb, 0.75));
        cor.addColorStop(0.30, U.rgbToCss(tipRgb, 0.22));
        cor.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = cor;
        ctx.beginPath(); ctx.arc(g.tx, g.ty, r * 3.4 * pulse, 0, TAU); ctx.fill();
        // flares licking off the rim
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.5);
        ctx.lineWidth = Math.max(0.5, 0.9 * scale);
        for (let i = 0; i < 7; i++) {
          const a = t * 0.5 + i * (TAU / 7);
          const len = r * (1.25 + 0.55 * Math.sin(t * 2.3 + i * 1.9));
          ctx.beginPath();
          ctx.moveTo(g.tx + Math.cos(a) * r, g.ty + Math.sin(a) * r);
          ctx.lineTo(g.tx + Math.cos(a) * len, g.ty + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.restore();
        // the disc itself, which is simply absent
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(g.tx, g.ty, r, 0, TAU); ctx.fill();
        // the second shadow, cast up the blank the wrong way
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1.2, 2.6 * scale);
        ctx.beginPath();
        ctx.moveTo(U.lerp(g.bx, g.tx, 0.25) + 5 * scale, U.lerp(g.by, g.ty, 0.25) + 5 * scale);
        ctx.quadraticCurveTo(g.cx + 5 * scale, g.cy + 5 * scale, g.tx + 5 * scale, g.ty + 5 * scale);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'origin': {
        // the rod the others were drawn from: construction lines, ticks and
        // a core of raw light where the blank should be
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.85);
        ctx.lineWidth = Math.max(0.8, 1.5 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.setLineDash([3 * scale, 4 * scale]);
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.30);
        ctx.lineWidth = Math.max(0.4, 0.6 * scale);
        // the chord the curve was struck against
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by); ctx.lineTo(g.tx, g.ty);
        ctx.stroke();
        // and the control handle
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by); ctx.lineTo(g.cx, g.cy); ctx.lineTo(g.tx, g.ty);
        ctx.stroke();
        ctx.setLineDash([]);
        // measurement ticks along the blank
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.45);
        for (let i = 1; i < 10; i++) {
          const k = i / 10;
          const p = at(k), q = at(Math.max(0, k - 0.015));
          const m = Math.hypot(p.x - q.x, p.y - q.y) || 1;
          const nx = -(p.y - q.y) / m, ny = (p.x - q.x) / m;
          const h = (i % 5 === 0 ? 5 : 3) * scale;
          ctx.beginPath();
          ctx.moveTo(p.x - nx * h, p.y - ny * h);
          ctx.lineTo(p.x + nx * h, p.y + ny * h);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'everything': {
        // it is every rod, so it runs every mechanism — three at a time,
        // rotating, so the blank never looks the same twice
        const all = ['storm', 'bone', 'chorus', 'eclipse', 'origin',
                     'celestial', 'void', 'runic', 'lunar', 'glitch',
                     'kraken', 'shatter', 'thunder', 'glacier', 'hemo',
                     'halo', 'plume', 'twinsun', 'neon', 'corded'];
        const base = Math.floor(t * 0.5) % all.length;
        for (let i = 0; i < 3; i++) {
          const which = all[(base + i * 3) % all.length];
          ctx.save();
          ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 1.3 + i * 2.1);
          drawStyle(ctx, { style: which, tip: art.tip, glow: art.glow }, g, t + i * 3.7, scale, tipRgb);
          ctx.restore();
        }
        // and a halo that belongs to nothing else
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.4 + i / 3) % 1;
          ctx.strokeStyle = U.rgbToCss(tipRgb, (1 - ph) * 0.4);
          ctx.lineWidth = Math.max(0.6, 1.6 * scale * (1 - ph));
          ctx.beginPath();
          ctx.arc(g.tx, g.ty, Math.max(1, ph * 26 * scale), 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      /* --------------------------------------------------- the strange shelf
         The ten below are meant to be too much. Each is built from a mechanism
         that could not belong to any of the others, and each is drawn off the
         blank rather than on it, so the shape of the rod changes and not only
         its colour. */

      case 'glacier': {
        // an instant of freezing water, caught mid-spike: blades sheathing the
        // upper blank, wider than the blank and still going wider
        ctx.save();
        const white = [235, 252, 255];
        const shards = 12;
        for (let i = 0; i < shards; i++) {
          const k = 0.24 + (i / (shards - 1)) * 0.72;
          const p = nAt(g, k);
          const side = i % 2 ? 1 : -1;
          const grow = 0.55 + 0.45 * Math.sin(t * 0.5 + i * 0.9);
          const out = (4 + k * 10) * scale * grow;
          const along = (6 + k * 8) * scale;
          ctx.beginPath();
          ctx.moveTo(p.x - p.tx * along * 0.55, p.y - p.ty * along * 0.55);
          ctx.lineTo(p.x + p.nx * out * side, p.y + p.ny * out * side);
          ctx.lineTo(p.x + p.tx * along, p.y + p.ty * along);
          ctx.closePath();
          const grd = ctx.createLinearGradient(p.x, p.y, p.x + p.nx * out * side, p.y + p.ny * out * side);
          grd.addColorStop(0, U.rgbToCss([70, 190, 240], 0.92));
          grd.addColorStop(0.5, U.rgbToCss([120, 220, 250], 0.66));
          grd.addColorStop(1, U.rgbToCss(white, 0.10));
          ctx.fillStyle = grd;
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(white, 0.6);
          ctx.lineWidth = Math.max(0.4, 0.6 * scale);
          ctx.stroke();
        }
        // and the point it froze into: a spear of clear ice past the tip
        const pIce = nAt(g, 1);
        const sp = 17 * scale;
        ctx.beginPath();
        ctx.moveTo(pIce.x - pIce.nx * 3.2 * scale, pIce.y - pIce.ny * 3.2 * scale);
        ctx.lineTo(pIce.x + pIce.tx * sp, pIce.y + pIce.ty * sp);
        ctx.lineTo(pIce.x + pIce.nx * 3.2 * scale, pIce.y + pIce.ny * 3.2 * scale);
        ctx.closePath();
        const sg = ctx.createLinearGradient(pIce.x, pIce.y, pIce.x + pIce.tx * sp, pIce.y + pIce.ty * sp);
        sg.addColorStop(0, U.rgbToCss([90, 205, 245], 0.95));
        sg.addColorStop(1, U.rgbToCss(white, 0.18));
        ctx.fillStyle = sg;
        ctx.fill();
        ctx.strokeStyle = U.rgbToCss(white, 0.75);
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        ctx.stroke();
        // cold coming off it
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const ph = ((t * 0.22 + i / 6) % 1);
          const p = nAt(g, 0.30 + ph * 0.66);
          ctx.fillStyle = U.rgbToCss(white, (1 - ph) * 0.30);
          ctx.beginPath();
          ctx.arc(p.x + p.nx * ph * 14 * scale, p.y + p.ny * ph * 14 * scale,
                  Math.max(0.6, (1 + ph * 2.6) * scale), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'shatter': {
        // it broke and the pieces have not landed. The chips drift a little
        // further out every year and take the dark cubes of the break with them
        ctx.save();
        const dk = U.hexToRgb(art.c2 || '#2e2450');
        const rs = VF.rng.make(0x5eed1234);
        for (let i = 0; i < 16; i++) {
          const k = 0.14 + (i / 15) * 0.82;
          const p = nAt(g, k);
          const side = rs() < 0.5 ? -1 : 1;
          const drift = (0.35 + rs() * 0.95) * (3 + k * 13) * scale;
          const bob = Math.sin(t * (0.5 + rs() * 0.5) + i * 1.7);
          const ox = p.nx * (drift + bob * 2 * scale) * side + p.tx * bob * 1.6 * scale;
          const oy = p.ny * (drift + bob * 2 * scale) * side + p.ty * bob * 1.6 * scale;
          const r = Math.max(1, (1.6 + rs() * 3.6) * scale);
          ctx.save();
          ctx.translate(p.x + ox, p.y + oy);
          ctx.rotate(t * (0.15 + rs() * 0.3) * side + i);
          ctx.beginPath();
          // a chip, not a circle: four unequal corners
          ctx.moveTo(-r, -r * 0.55);
          ctx.lineTo(r * 0.7, -r);
          ctx.lineTo(r, r * 0.6);
          ctx.lineTo(-r * 0.6, r * 0.9);
          ctx.closePath();
          const isDark = rs() < 0.28;
          ctx.fillStyle = isDark ? U.rgbToCss(U.shade(dk, -0.35), 0.94)
                                 : U.rgbToCss(U.mixRgb(tipRgb, [150, 110, 255], 0.45), 0.72);
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.6), isDark ? 0.35 : 0.85);
          ctx.lineWidth = Math.max(0.35, 0.55 * scale);
          ctx.stroke();
          ctx.restore();
        }
        // the spearhead the break left pointing forward
        const pSh = nAt(g, 1);
        const L2 = 22 * scale, W2 = 7 * scale;
        ctx.beginPath();
        ctx.moveTo(pSh.x + pSh.tx * L2, pSh.y + pSh.ty * L2);
        ctx.lineTo(pSh.x + pSh.nx * W2, pSh.y + pSh.ny * W2);
        ctx.lineTo(pSh.x - pSh.tx * L2 * 0.38, pSh.y - pSh.ty * L2 * 0.38);
        ctx.lineTo(pSh.x - pSh.nx * W2, pSh.y - pSh.ny * W2);
        ctx.closePath();
        const hg = ctx.createLinearGradient(pSh.x - pSh.nx * W2, pSh.y - pSh.ny * W2,
                                            pSh.x + pSh.nx * W2, pSh.y + pSh.ny * W2);
        hg.addColorStop(0, U.rgbToCss(U.mixRgb(tipRgb, [120, 90, 255], 0.55), 0.92));
        hg.addColorStop(0.5, 'rgba(255,255,255,0.88)');
        hg.addColorStop(1, U.rgbToCss(tipRgb, 0.7));
        ctx.fillStyle = hg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'corded': {
        // sixty years of binding. The cord sits ON the blank rather than beside
        // it, so the wraps hug the taper: short, dense, all leaning the same
        // way, with a dark band every few turns where he stopped for the night.
        ctx.save();
        const cord = U.hexToRgb(art.tip);
        const dkc = U.hexToRgb(art.c2 || '#12141f');
        const turns = 44;
        ctx.lineCap = 'round';
        for (let i = 0; i < turns; i++) {
          const k = 0.045 + (i / turns) * 0.93;
          const p = nAt(g, k);
          // the blank's own half-width here, plus just enough to sit proud
          const w = U.lerp(3.1, 0.8, k) * scale;
          const lean = 0.75;
          const band = i % 7 === 0;
          ctx.strokeStyle = band ? U.rgbToCss(U.shade(dkc, 0.30), 0.95)
                                 : U.rgbToCss(U.shade(cord, i % 2 ? -0.10 : -0.40), 0.92);
          ctx.lineWidth = Math.max(0.7, U.lerp(2.6, 1.0, k) * scale) * (band ? 1.5 : 1);
          ctx.beginPath();
          ctx.moveTo(p.x - p.nx * w - p.tx * w * lean, p.y - p.ny * w - p.ty * w * lean);
          ctx.quadraticCurveTo(p.x, p.y,
                               p.x + p.nx * w + p.tx * w * lean, p.y + p.ny * w + p.ty * w * lean);
          ctx.stroke();
          // the lit edge of each turn, which is what makes it cord and not paint
          if (!band) {
            ctx.strokeStyle = U.rgbToCss(U.mixRgb(cord, [255, 225, 225], 0.55), 0.5);
            ctx.lineWidth = Math.max(0.3, 0.5 * scale);
            ctx.beginPath();
            ctx.moveTo(p.x - p.nx * w * 0.8 - p.tx * w * lean * 0.8,
                       p.y - p.ny * w * 0.8 - p.ty * w * lean * 0.8);
            ctx.quadraticCurveTo(p.x - p.nx * w * 0.2, p.y - p.ny * w * 0.2,
                                 p.x + p.nx * w * 0.5 + p.tx * w * lean * 0.5,
                                 p.y + p.ny * w * 0.5 + p.ty * w * lean * 0.5);
            ctx.stroke();
          }
        }
        // the thread itself, running the whole length under the wraps
        ctx.strokeStyle = U.rgbToCss(cord, 0.85);
        ctx.lineWidth = Math.max(0.5, 1.0 * scale);
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const p = nAt(g, 0.04 + (i / 20) * 0.95);
          const off = Math.sin(i * 0.9) * 1.6 * scale;
          const x = p.x + p.nx * off, y = p.y + p.ny * off;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // ends he never trimmed, still moving in water that is not moving
        for (let i = 0; i < 5; i++) {
          const p = nAt(g, 0.16 + i * 0.175);
          const side = i % 2 ? 1 : -1;
          const len = (5 + i * 1.6) * scale;
          const wob = Math.sin(t * 1.1 + i * 2.2) * 2.4 * scale;
          ctx.strokeStyle = U.rgbToCss(cord, 0.7);
          ctx.lineWidth = Math.max(0.4, 0.9 * scale);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + p.nx * len * 0.6 * side + wob,
                               p.y + p.ny * len * 0.6 * side + wob,
                               p.x + p.nx * len * side - p.tx * len * 0.6,
                               p.y + p.ny * len * side - p.ty * len * 0.6);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'kraken': {
        // eight arms hold the blank. They are not a pattern: each leaves at its
        // own angle, reaches its own distance and hooks back, and the suckers
        // on the inside curve are the whole reason it reads as an arm.
        ctx.save();
        const arm = U.hexToRgb(art.c2 || '#3c1216');
        const skin = U.hexToRgb(art.c1 || '#8e2f34');
        const rk = VF.rng.make(0x0c70b005);
        for (let a = 0; a < 8; a++) {
          const k0 = 0.10 + a * 0.098 + rk() * 0.03;
          const side = (a % 2 ? 1 : -1) * (rk() < 0.18 ? -1 : 1);
          const span = 0.13 + rk() * 0.10;
          const reach = (9 + rk() * 13) * scale *
                        (0.72 + 0.34 * Math.sin(t * (0.6 + a * 0.12) + a * 1.7));
          const base = (5.4 - a * 0.22) * scale;
          const segs = 10;
          // the centreline, so the fill and the suckers agree where the arm is
          const cl = [];
          for (let i = 0; i <= segs; i++) {
            const u = i / segs;
            const p = nAt(g, Math.min(0.995, k0 + u * span));
            const curl = Math.sin(u * Math.PI * 1.28) * reach;
            cl.push({ p: p, x: p.x + p.nx * curl * side, y: p.y + p.ny * curl * side,
                      th: base * (1 - u * 0.88) });
          }
          ctx.beginPath();
          for (let i = 0; i <= segs; i++) {
            const c = cl[i];
            const x = c.x + c.p.tx * c.th, y = c.y + c.p.ty * c.th;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          for (let i = segs; i >= 0; i--) {
            const c = cl[i];
            ctx.lineTo(c.x - c.p.tx * c.th, c.y - c.p.ty * c.th);
          }
          ctx.closePath();
          const ag = ctx.createLinearGradient(cl[0].x, cl[0].y, cl[segs].x, cl[segs].y);
          ag.addColorStop(0, U.rgbToCss(U.shade(arm, 0.16)));
          ag.addColorStop(0.55, U.rgbToCss(skin));
          ag.addColorStop(1, U.rgbToCss(U.mixRgb(skin, tipRgb, 0.55)));
          ctx.fillStyle = ag;
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.shade(arm, -0.5), 0.8);
          ctx.lineWidth = Math.max(0.3, 0.5 * scale);
          ctx.stroke();
          // suckers, crowding toward the tip of the arm where it grips
          ctx.fillStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 225, 205], 0.45), 0.8);
          for (let i = 1; i < segs; i++) {
            const c = cl[i];
            const r = Math.max(0.25, c.th * 0.26);
            ctx.beginPath();
            ctx.arc(c.x - c.p.nx * c.th * 0.45 * side, c.y - c.p.ny * c.th * 0.45 * side, r, 0, TAU);
            ctx.fill();
          }
        }
        // the ninth: one thin arm the whole length and out past the tip, which
        // is the one actually doing the fishing
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(skin, tipRgb, 0.6), 0.9);
        ctx.lineWidth = Math.max(0.6, 1.6 * scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 22; i++) {
          const u = i / 22;
          const p = nAt(g, 0.14 + u * 0.85);
          const wig = Math.sin(u * 6.5 + t * 1.5) * (1 - u * 0.35) * 6 * scale;
          const x = p.x + p.nx * wig, y = p.y + p.ny * wig;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'hemo': {
        // it came up wet and never dried. What comes off the blank is torn, not
        // poured: barbed sheets with a point on them, thrown the same way each
        // time because whatever did this only did it once.
        ctx.save();
        const rh = VF.rng.make(0xb100d);
        const red = U.hexToRgb(art.tip);
        const deep = U.hexToRgb(art.c1 || '#6a0f18');
        ctx.globalAlpha = 0.88;
        for (let i = 0; i < 10; i++) {
          const k = 0.10 + (i / 9) * 0.86;
          const p = nAt(g, k);
          const side = rh() < 0.5 ? -1 : 1;
          const puls = 0.62 + 0.38 * Math.sin(t * 1.9 + i * 1.3);
          const out = (4 + rh() * 9) * scale * puls;
          const along = (7 + rh() * 9) * scale;
          const skew = (rh() - 0.3) * along * 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x - p.tx * along * 0.22, p.y - p.ty * along * 0.22);
          ctx.lineTo(p.x + p.nx * out * side * 0.6 - p.tx * along * 0.35,
                     p.y + p.ny * out * side * 0.6 - p.ty * along * 0.35);
          ctx.lineTo(p.x + p.nx * out * side + p.tx * (along * 0.5 + skew),
                     p.y + p.ny * out * side + p.ty * (along * 0.5 + skew));
          ctx.lineTo(p.x + p.nx * out * side * 0.42 + p.tx * along * 0.55,
                     p.y + p.ny * out * side * 0.42 + p.ty * along * 0.55);
          ctx.lineTo(p.x + p.nx * out * side * 0.66 + p.tx * along,
                     p.y + p.ny * out * side * 0.66 + p.ty * along);
          ctx.lineTo(p.x + p.tx * along * 0.28, p.y + p.ty * along * 0.28);
          ctx.closePath();
          const rg = ctx.createLinearGradient(p.x, p.y,
                                              p.x + p.nx * out * side, p.y + p.ny * out * side);
          rg.addColorStop(0, U.rgbToCss(U.shade(deep, -0.35), 0.95));
          rg.addColorStop(0.4, U.rgbToCss(red, 0.88));
          rg.addColorStop(1, U.rgbToCss(U.mixRgb(red, [255, 150, 150], 0.55), 0.12));
          ctx.fillStyle = rg;
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(red, [255, 210, 210], 0.5), 0.5);
          ctx.lineWidth = Math.max(0.3, 0.45 * scale);
          ctx.stroke();
        }
        // streaks flung clear, and drops that leave going the wrong way
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
          const ph = ((t * 0.5 + i / 16) % 1);
          const p = nAt(g, 0.12 + ((i * 0.41) % 1) * 0.84);
          const side = i % 2 ? 1 : -1;
          const dd = (4 + ph * 18) * scale;
          const r = Math.max(0.4, (1.7 - ph * 1.2) * scale);
          ctx.fillStyle = U.rgbToCss(red, (1 - ph) * 0.85);
          ctx.beginPath();
          ctx.ellipse(p.x + p.nx * dd * side - p.tx * ph * 8 * scale,
                      p.y + p.ny * dd * side - p.ty * ph * 8 * scale,
                      r * 0.55, r * 1.4, Math.atan2(p.ny * side, p.nx * side), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'thunder': {
        // struck through, and the strike is still in there looking for ground.
        // Molten seams branch down the blank and what leaves the top is not
        // sparks — it arcs, and it falls.
        ctx.save();
        const gold = U.hexToRgb(art.tip);
        ctx.globalCompositeOperation = 'lighter';
        const seed = Math.floor(t * 7);
        const rt = VF.rng.make((seed * 2246822519) ^ 0x7fed);
        for (let f = 0; f < 4; f++) {
          const k0 = 0.10 + rt() * 0.30;
          const k1 = Math.min(1, k0 + 0.30 + rt() * 0.55);
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(gold, [255, 255, 220], rt() * 0.5), 0.45 + rt() * 0.5);
          ctx.lineWidth = Math.max(0.5, (0.7 + rt() * 1.8) * scale);
          ctx.lineCap = 'round';
          ctx.beginPath();
          const steps = 7;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const p = nAt(g, k0 + (k1 - k0) * u);
            const off = (rt() - 0.5) * U.lerp(9, 3, u) * scale;
            const x = p.x + p.nx * off, y = p.y + p.ny * off;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // a core of molten gold sitting inside the char
        ctx.strokeStyle = U.rgbToCss(gold, 0.30 + 0.14 * Math.sin(t * 4.1));
        ctx.lineWidth = Math.max(1.2, 2.2 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        // and the throw-off from the top
        const pT = nAt(g, 1);
        for (let i = 0; i < 10; i++) {
          const ph = ((t * 0.7 + i / 10) % 1);
          const side = (i % 3) - 1;
          const r = Math.max(0.6, (2.6 - ph * 1.8) * scale);
          const up = ph * 28 * scale;
          const out = side * ph * 15 * scale;
          ctx.fillStyle = U.rgbToCss(U.mixRgb(gold, [255, 245, 200], ph * 0.6), (1 - ph) * 0.95);
          ctx.beginPath();
          ctx.arc(pT.x + pT.tx * up + pT.nx * out - pT.tx * ph * ph * 17 * scale,
                  pT.y + pT.ty * up + pT.ny * out - pT.ty * ph * ph * 17 * scale, r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'neon': {
        // nothing about this is decorative: a bright line inside a black tube,
        // the charge running up it, and hazard banding where a hand goes
        ctx.save();
        const neon = U.hexToRgb(art.tip);
        ctx.globalCompositeOperation = 'lighter';
        [[7.0, 0.10], [3.2, 0.22], [1.1, 0.95]].forEach(function (pair) {
          ctx.strokeStyle = U.rgbToCss(neon, pair[1]);
          ctx.lineWidth = Math.max(0.5, pair[0] * scale);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(g.bx, g.by);
          ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
          ctx.stroke();
        });
        for (let i = 0; i < 4; i++) {
          const ph = ((t * 0.75 + i / 4) % 1);
          const p = nAt(g, 0.10 + ph * 0.88);
          const w = U.lerp(9, 3, ph) * scale;
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(neon, [255, 255, 255], 0.45), (1 - ph) * 0.85);
          ctx.lineWidth = Math.max(0.5, 1.4 * scale);
          ctx.beginPath();
          ctx.moveTo(p.x - p.nx * w, p.y - p.ny * w);
          ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w);
          ctx.stroke();
        }
        ctx.restore();
        // banding, unlit, so the lit parts have something to be lit against
        ctx.save();
        ctx.strokeStyle = U.rgbToCss(U.shade(neon, -0.55), 0.85);
        ctx.lineWidth = Math.max(0.5, 1.1 * scale);
        for (let i = 0; i < 6; i++) {
          const p = nAt(g, 0.20 + i * 0.045);
          const w = U.lerp(6.5, 4.5, i / 6) * scale;
          ctx.beginPath();
          ctx.moveTo(p.x - p.nx * w, p.y - p.ny * w);
          ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'halo': {
        // rings of things believed long enough to become furniture. They orbit
        // at their own rates and none of them are level.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gold = U.hexToRgb(art.tip);
        for (let i = 0; i < 6; i++) {
          const p = nAt(g, 0.22 + i * 0.135);
          const spin = t * (0.35 + i * 0.11) + i * 1.4;
          const rx = (10 + i * 3.2) * scale;
          const ry = rx * (0.20 + 0.16 * Math.abs(Math.sin(spin)));
          const ang = Math.atan2(p.ty, p.tx) + Math.sin(spin * 0.7) * 0.55;
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(gold, [255, 255, 240], 0.3),
                                       0.55 + 0.35 * Math.sin(t * 1.1 + i));
          ctx.lineWidth = Math.max(0.5, 1.5 * scale);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rx, Math.max(0.6, ry), ang, 0, TAU);
          ctx.stroke();
          // one bead riding each ring
          const bx = p.x + Math.cos(ang) * Math.cos(spin * 1.6) * rx - Math.sin(ang) * Math.sin(spin * 1.6) * ry;
          const by = p.y + Math.sin(ang) * Math.cos(spin * 1.6) * rx + Math.cos(ang) * Math.sin(spin * 1.6) * ry;
          ctx.fillStyle = 'rgba(255,250,225,0.9)';
          ctx.beginPath();
          ctx.arc(bx, by, Math.max(0.5, 1.2 * scale), 0, TAU);
          ctx.fill();
        }
        // the light it is filed under
        const pH = nAt(g, 1);
        const r = Math.max(2.4, 5.4 * scale) * (0.9 + 0.15 * Math.sin(t * 1.3));
        const gr = ctx.createRadialGradient(pH.x, pH.y, 0, pH.x, pH.y, r * 3.2);
        gr.addColorStop(0, 'rgba(255,252,235,0.92)');
        gr.addColorStop(0.28, U.rgbToCss(gold, 0.42));
        gr.addColorStop(1, U.rgbToCss(gold, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(pH.x, pH.y, r * 3.2, 0, TAU); ctx.fill();
        // rays, uneven, the way a thing that answers is always drawn
        ctx.strokeStyle = U.rgbToCss(gold, 0.55);
        ctx.lineWidth = Math.max(0.4, 0.8 * scale);
        for (let i = 0; i < 9; i++) {
          const a = t * 0.25 + i * (TAU / 9);
          const len = r * (1.4 + 0.9 * Math.abs(Math.sin(t * 1.6 + i * 2.1)));
          ctx.beginPath();
          ctx.moveTo(pH.x + Math.cos(a) * r * 0.8, pH.y + Math.sin(a) * r * 0.8);
          ctx.lineTo(pH.x + Math.cos(a) * len, pH.y + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'plume': {
        // every colour is in the shaft rather than on it, and what is at the
        // top was moulted rather than made
        ctx.save();
        const band = ctx.createLinearGradient(g.bx, g.by, g.tx, g.ty);
        for (let i = 0; i <= 6; i++) {
          band.addColorStop(i / 6, 'hsla(' + (((t * 22) + i * 58) % 360).toFixed(0) + ',92%,66%,0.85)');
        }
        ctx.strokeStyle = band;
        ctx.lineWidth = Math.max(0.6, 1.6 * scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const p = nAt(g, 0.08 + (i / 12) * 0.88);
          const off = 2.4 * scale;
          const x = p.x + p.nx * off, y = p.y + p.ny * off;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // collars down the shaft
        ctx.strokeStyle = U.rgbToCss(U.hexToRgb(art.c2 || '#8a7aa8'), 0.85);
        for (let i = 0; i < 7; i++) {
          const p = nAt(g, 0.16 + i * 0.105);
          const w = U.lerp(6, 2.4, i / 7) * scale;
          ctx.lineWidth = Math.max(0.5, U.lerp(2.0, 0.9, i / 7) * scale);
          ctx.beginPath();
          ctx.moveTo(p.x - p.nx * w, p.y - p.ny * w);
          ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w);
          ctx.stroke();
        }
        // and the feather. It has to be the largest thing on the rod or it is a
        // leaf: a wide fan of barbs, the two longest laid over the rest.
        const pF = nAt(g, 0.96);
        const barbs = 7, mid = (barbs - 1) / 2;
        const baseA = Math.atan2(pF.ty, pF.tx);
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < barbs; i++) {
            const off = (i - mid) / mid;                  // -1 .. 1
            const isLong = Math.abs(off) < 0.34;
            if ((pass === 0) === isLong) continue;        // long ones drawn last
            const wob = Math.sin(t * 0.8 + i * 0.9) * 0.07;
            const a = baseA + off * 0.34 + wob;
            const len = (86 - Math.abs(off) * 30) * scale;
            const ex = pF.x + Math.cos(a) * len, ey = pF.y + Math.sin(a) * len;
            const nx = -Math.sin(a), ny = Math.cos(a);
            const w = (7.5 - Math.abs(off) * 3.0) * scale;
            ctx.beginPath();
            ctx.moveTo(pF.x, pF.y);
            ctx.bezierCurveTo(pF.x + Math.cos(a) * len * 0.30 + nx * w,
                              pF.y + Math.sin(a) * len * 0.30 + ny * w,
                              pF.x + Math.cos(a) * len * 0.78 + nx * w * 0.85,
                              pF.y + Math.sin(a) * len * 0.78 + ny * w * 0.85, ex, ey);
            ctx.bezierCurveTo(pF.x + Math.cos(a) * len * 0.78 - nx * w * 0.85,
                              pF.y + Math.sin(a) * len * 0.78 - ny * w * 0.85,
                              pF.x + Math.cos(a) * len * 0.30 - nx * w,
                              pF.y + Math.sin(a) * len * 0.30 - ny * w, pF.x, pF.y);
            ctx.closePath();
            const fg = ctx.createLinearGradient(pF.x, pF.y, ex, ey);
            const h = ((t * 20) + i * 34 + 268) % 360;
            fg.addColorStop(0, 'hsla(' + h.toFixed(0) + ',72%,50%,0.95)');
            fg.addColorStop(0.55, 'hsla(' + ((h + 26) % 360).toFixed(0) + ',88%,68%,0.80)');
            fg.addColorStop(1, 'hsla(' + ((h + 62) % 360).toFixed(0) + ',96%,82%,0.10)');
            ctx.fillStyle = fg;
            ctx.fill();
            // barbules: the fine combing that separates a feather from a blade
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = Math.max(0.25, 0.4 * scale);
            for (let b = 1; b < 7; b++) {
              const u = b / 7;
              const bx = pF.x + Math.cos(a) * len * u, by = pF.y + Math.sin(a) * len * u;
              const bw = w * Math.sin(u * Math.PI * 0.92);
              ctx.beginPath();
              ctx.moveTo(bx - nx * bw, by - ny * bw);
              ctx.lineTo(bx + nx * bw, by + ny * bw);
              ctx.stroke();
            }
            // the rachis, without which a feather is just a leaf
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = Math.max(0.3, 0.6 * scale);
            ctx.beginPath();
            ctx.moveTo(pF.x, pF.y); ctx.lineTo(ex, ey);
            ctx.stroke();
          }
        }
        ctx.restore();
        break;
      }

      case 'twinsun': {
        // one at each end, and the dark between them is the rod. Whatever is
        // burning is not on the blank, it is where the blank stops.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const white = [255, 255, 255];
        [[nAt(g, 1), 1.0], [nAt(g, 0.16), 0.78]].forEach(function (pair) {
          const p = pair[0], k = pair[1];
          const r = Math.max(2.2, 6.6 * scale) * k * (0.92 + 0.08 * Math.sin(t * 1.5 + k * 3));
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.6);
          gr.addColorStop(0, U.rgbToCss(white, 1));
          gr.addColorStop(0.18, U.rgbToCss(white, 0.85));
          gr.addColorStop(0.40, U.rgbToCss(tipRgb, 0.28));
          gr.addColorStop(1, U.rgbToCss(tipRgb, 0));
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.6, 0, TAU); ctx.fill();
          ctx.fillStyle = U.rgbToCss(white, 1);
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.82, 0, TAU); ctx.fill();
        });
        // a thin seam of light running between them along the dark blank
        ctx.strokeStyle = U.rgbToCss(white, 0.22 + 0.10 * Math.sin(t * 2.2));
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        ctx.beginPath();
        ctx.moveTo(g.bx, g.by);
        ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
        ctx.stroke();
        // and motes off both, going nowhere in particular
        for (let i = 0; i < 10; i++) {
          const ph = ((t * 0.30 + i / 10) % 1);
          const p = nAt(g, 0.16 + ((i * 0.37) % 1) * 0.84);
          const side = i % 2 ? 1 : -1;
          ctx.fillStyle = U.rgbToCss(white, (1 - ph) * 0.55);
          ctx.beginPath();
          ctx.arc(p.x + p.nx * ph * 15 * scale * side, p.y + p.ny * ph * 15 * scale * side,
                  Math.max(0.3, (1.1 - ph * 0.7) * scale), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
    }
  }

  /* Some of the strange rods do not have a reel so much as something sitting
     where a reel would be. This runs over the top of the drawn one, so the
     housing underneath still reads as a housing. */
  const REEL_STYLES = { kraken: 1, thunder: 1, corded: 1, neon: 1, hemo: 1,
                        twinsun: 1, glacier: 1, halo: 1, pyre: 1, seraph: 1 };

  function drawReelStyle(ctx, art, g, t, scale, under, tipRgb, c1, c2) {
    if (!REEL_STYLES[art.style]) return;
    const a = g.angle;
    const rr = Math.max(2.8, 6.0 * scale);
    const nx = -Math.sin(a) * under, ny = Math.cos(a) * under;
    const sx = g.bx + Math.cos(a) * g.len * 0.215;
    const sy = g.by + Math.sin(a) * g.len * 0.215;
    const cx = sx + nx * rr * 1.9, cy = sy + ny * rr * 1.9;

    ctx.save();
    switch (art.style) {
      case 'kraken': {
        // the mantle, over the housing, with the eye on the near side
        const mg = ctx.createRadialGradient(cx - nx * rr * 0.5, cy - ny * rr * 0.5, rr * 0.1,
                                            cx, cy, rr * 2.1);
        mg.addColorStop(0, U.rgbToCss(U.mixRgb(c1, [255, 210, 190], 0.30)));
        mg.addColorStop(0.6, U.rgbToCss(c1));
        mg.addColorStop(1, U.rgbToCss(U.shade(c2, -0.2)));
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.ellipse(cx + nx * rr * 0.35, cy + ny * rr * 0.35, rr * 1.6, rr * 1.3, a, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = U.rgbToCss(U.shade(c2, -0.5), 0.8);
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        ctx.stroke();
        // the eye: a horizontal slit, which is the whole tell
        const ex = cx + nx * rr * 0.15 - Math.cos(a) * rr * 0.55;
        const ey = cy + ny * rr * 0.15 - Math.sin(a) * rr * 0.55;
        ctx.fillStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 240, 200], 0.5), 0.95);
        ctx.beginPath();
        ctx.ellipse(ex, ey, rr * 0.58, rr * 0.44, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#080408';
        ctx.beginPath();
        ctx.ellipse(ex, ey, rr * 0.46, rr * 0.14, a + 0.15 * Math.sin(t * 0.6), 0, TAU);
        ctx.fill();
        // and short arms hanging clear of the mantle
        ctx.strokeStyle = U.rgbToCss(U.shade(c1, -0.1), 0.9);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const sw = Math.sin(t * 1.3 + i * 1.9) * rr * 0.8;
          ctx.lineWidth = Math.max(0.6, (1.7 - i * 0.35) * scale);
          ctx.beginPath();
          ctx.moveTo(cx + nx * rr * (0.9 + i * 0.25), cy + ny * rr * (0.9 + i * 0.25));
          ctx.quadraticCurveTo(cx + nx * rr * 2.2 + sw, cy + ny * rr * 2.2 + sw,
                               cx + nx * rr * 2.7 - Math.cos(a) * rr * (1 + i),
                               cy + ny * rr * 2.7 - Math.sin(a) * rr * (1 + i));
          ctx.stroke();
        }
        break;
      }
      case 'thunder': {
        // the strike found the reel and stayed there
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr * 3.0);
        gr.addColorStop(0, U.rgbToCss(U.mixRgb(tipRgb, [255, 250, 210], 0.5), 0.75));
        gr.addColorStop(0.45, U.rgbToCss(tipRgb, 0.25));
        gr.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 3.0, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.7);
        ctx.lineWidth = Math.max(0.4, 0.8 * scale);
        for (let i = 0; i < 7; i++) {
          const ang = t * 1.1 + i * (TAU / 7);
          const len = rr * (1.3 + 0.8 * Math.abs(Math.sin(t * 2.4 + i)));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * rr * 1.0, cy + Math.sin(ang) * rr * 1.0);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.stroke();
        }
        break;
      }
      case 'corded': {
        // he wound the spool too, and it went round one more time than it needed
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.8);
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        ctx.beginPath();
        for (let i = 0; i <= 46; i++) {
          const u = i / 46;
          const ang = u * TAU * 2.4 + t * 0.25;
          const r = rr * (0.16 + u * 0.78);
          const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.94;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'neon': {
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.8);
        gr.addColorStop(0, U.rgbToCss(tipRgb, 0.70));
        gr.addColorStop(0.4, U.rgbToCss(tipRgb, 0.18));
        gr.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 2.8, 0, TAU); ctx.fill();
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.9);
        ctx.lineWidth = Math.max(0.5, 1.0 * scale);
        ctx.beginPath(); ctx.arc(cx, cy, rr * 1.0, 0, TAU); ctx.stroke();
        break;
      }
      case 'hemo': {
        // it runs off the housing and never reaches the water
        for (let i = 0; i < 5; i++) {
          const ph = ((t * 0.5 + i / 5) % 1);
          ctx.fillStyle = U.rgbToCss(U.shade(tipRgb, -0.25), (1 - ph) * 0.75);
          ctx.beginPath();
          ctx.ellipse(cx + nx * rr * (1.1 + ph * 1.7), cy + ny * rr * (1.1 + ph * 1.7),
                      rr * 0.16, rr * (0.32 - ph * 0.13), a, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'twinsun': {
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.2);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)');
        gr.addColorStop(0.35, 'rgba(255,255,255,0.22)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 2.2, 0, TAU); ctx.fill();
        break;
      }
      case 'glacier': {
        // the housing has frozen into the seat
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.5), 0.7);
        ctx.lineWidth = Math.max(0.4, 0.7 * scale);
        for (let i = 0; i < 6; i++) {
          const ang = i * (TAU / 6) + 0.4;
          const len = rr * (1.5 + 0.5 * Math.sin(t * 0.7 + i));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * rr * 0.9, cy + Math.sin(ang) * rr * 0.9);
          ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
          ctx.stroke();
        }
        break;
      }
      /* the fire gathers where the hand is, and burns off the housing */
      case 'pyre': {
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 3.4);
        g2.addColorStop(0, U.rgbToCss(tipRgb, 0.55));
        g2.addColorStop(0.4, U.rgbToCss(tipRgb, 0.18));
        g2.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 3.4, 0, TAU); ctx.fill();
        // tongues coming off the rim, licking toward the tip
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.3), 0.7);
        ctx.lineWidth = Math.max(0.5, 1.0 * scale);
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          const a2 = a + (i / 6) * TAU + t * 0.5;
          const l = rr * (1.5 + 0.9 * Math.sin(t * 3.1 + i * 1.7));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a2) * rr * 0.85, cy + Math.sin(a2) * rr * 0.85);
          ctx.quadraticCurveTo(cx + Math.cos(a2) * l * 0.9 + Math.cos(a) * rr * 0.5,
                               cy + Math.sin(a2) * l * 0.9 + Math.sin(a) * rr * 0.5,
                               cx + Math.cos(a2) * l + Math.cos(a) * rr,
                               cy + Math.sin(a2) * l + Math.sin(a) * rr);
          ctx.stroke();
        }
        break;
      }

      /* A pair of wings opened at the hand, beating slowly. Also sized off the
         rod: at reel-radius they were a smudge behind the housing. */
      case 'seraph': {
        ctx.globalCompositeOperation = 'lighter';
        const beat = 0.80 + 0.20 * Math.sin(t * 1.6);
        const span = g.len * 0.30 * beat;
        for (let side = -1; side <= 1; side += 2) {
          // three long pinions per side, swept back toward the butt
          for (let i = 0; i < 3; i++) {
            const spread = (i - 1) * 0.40 + 0.34;          // all rake backwards
            const len = span * (1 - Math.abs(i - 1) * 0.24);
            const dx = nx * side * Math.cos(spread) - Math.cos(a) * Math.sin(spread);
            const dy = ny * side * Math.cos(spread) - Math.sin(a) * Math.sin(spread);
            const ex = cx + dx * len, ey = cy + dy * len;
            const grd = ctx.createLinearGradient(cx, cy, ex, ey);
            grd.addColorStop(0, U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.55), 0.62));
            grd.addColorStop(0.5, U.rgbToCss(tipRgb, 0.26));
            grd.addColorStop(1, U.rgbToCss(tipRgb, 0));
            ctx.fillStyle = grd;
            const w = len * 0.17;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.quadraticCurveTo(cx + dx * len * 0.5 - Math.cos(a) * w,
                                 cy + dy * len * 0.5 - Math.sin(a) * w, ex, ey);
            ctx.quadraticCurveTo(cx + dx * len * 0.42 + Math.cos(a) * w * 1.6,
                                 cy + dy * len * 0.42 + Math.sin(a) * w * 1.6, cx, cy);
            ctx.fill();
          }
        }
        // the coal they open from
        const cr = g.len * 0.045;
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        core.addColorStop(0, 'rgba(255,255,255,0.92)');
        core.addColorStop(0.32, U.rgbToCss(tipRgb, 0.58));
        core.addColorStop(1, U.rgbToCss(tipRgb, 0));
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
        break;
      }

      case 'halo': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.5);
        ctx.lineWidth = Math.max(0.4, 0.8 * scale);
        for (let i = 0; i < 2; i++) {
          const ph = ((t * 0.4 + i / 2) % 1);
          ctx.globalAlpha = (1 - ph) * 0.7;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr * (1 + ph * 1.8), rr * (1 + ph * 1.8) * 0.32,
                      a + t * 0.3, 0, TAU);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  }

  /* Lay a rod out across a box, butt at the lower left, tip at the upper
     right, with a gentle idle flex. Used for shop previews. */
  function preview(ctx, rod, w, h, t) {
    const pad = w * 0.035;
    const bx = pad, by = h * 0.86;
    const tx = w - pad, ty = h * 0.16;
    const len = Math.hypot(tx - bx, ty - by);
    const angle = Math.atan2(ty - by, tx - bx);
    const flex = 0.10 + Math.sin(t * 0.8) * 0.02;
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const g = {
      bx: bx, by: by,
      cx: (bx + tx) / 2 + nx * len * flex * 0.45,
      cy: (by + ty) / 2 + ny * len * flex * 0.45,
      tx: tx, ty: ty, len: len, angle: angle
    };
    draw(ctx, rod, g, t, { spin: t * 0.5, weight: 2.1 });

    /* a short length of line hanging from the tip sells it as a rod */
    ctx.strokeStyle = U.rgbToCss(U.hexToRgb(rod.art.tip), 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + w * 0.02, ty + h * 0.30, tx - w * 0.03, h * 0.92);
    ctx.stroke();
  }

  VF.rodArt = { draw: draw, preview: preview, quadAt: quadAt };
})(window.VF = window.VF || {});
