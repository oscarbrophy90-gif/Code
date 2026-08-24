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


  /* ---- the ornament kit ----------------------------------------------------
     Past the ordinary ladder a rod has to look like it cost something, and that
     is mostly four things: light with a volume to it, parts that sit off the
     blank at a depth you believe, metal with a lit edge and a dark one, and
     stones that catch. These are those four, so each flourish below spends its
     lines on what makes it itself rather than on plumbing. */

  /* Upper left, in screen space. Everything on a rod that is supposed to look
     turned rather than drawn is shaded against this one direction. */
  const KEY = [-0.55, -0.835];

  /* The blank as a tube rather than a stroke. A gradient down its length is a
     flat ribbon however good the colours are; what says cylinder is the
     shading across it — dark at both edges, one hot line where the surface
     turns into the light. That has to be redrawn along the bend, so the blank
     goes down in runs with a cross-section ramp each. */
  function drawBlank(ctx, g, wButt, wTip, c1, c2, tipRgb, scale) {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const k0 = i / N, k1 = (i + 1) / N, km = (k0 + k1) / 2;
      const p = nAt(g, km);
      const w = U.lerp(wButt, wTip, km) * 0.5;
      // the colour this far along, matching the ramp the blank always had
      const col = km < 0.30 ? U.mixRgb(U.shade(c2, -0.15), c2, km / 0.30)
                : km < 0.72 ? U.mixRgb(c2, c1, (km - 0.30) / 0.42)
                            : U.mixRgb(c1, U.mixRgb(c1, tipRgb, 0.75), (km - 0.72) / 0.28);
      // where round the tube the light lands
      const t = U.clamp(0.5 + 0.5 * (p.nx * KEY[0] + p.ny * KEY[1]), 0.14, 0.86);
      const cg = ctx.createLinearGradient(p.x - p.nx * w, p.y - p.ny * w,
                                          p.x + p.nx * w, p.y + p.ny * w);
      cg.addColorStop(0, U.rgbToCss(U.shade(col, -0.66)));
      cg.addColorStop(U.clamp(t - 0.30, 0.02, 0.96), U.rgbToCss(U.shade(col, -0.22)));
      cg.addColorStop(t, U.rgbToCss(U.mixRgb(col, [255, 255, 255], 0.34)));
      cg.addColorStop(U.clamp(t + 0.26, 0.04, 0.98), U.rgbToCss(col));
      cg.addColorStop(1, U.rgbToCss(U.shade(col, -0.58)));
      ctx.fillStyle = cg;
      // a hair of overlap, or consecutive runs antialias a seam between them
      taper(ctx, g, Math.max(0, k0 - 0.005), Math.min(1, k1 + 0.005),
            U.lerp(wButt, wTip, k0), U.lerp(wButt, wTip, k1), 3);
      ctx.fill();
    }
  }

  /* A point of light with body. Several passes, widest and faintest first —
     one flat radial gradient is what gives canvas glow away. */
  function bloom(ctx, x, y, r, rgb, k) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const PASS = [[3.6, 0.085], [2.0, 0.16], [1.05, 0.34], [0.44, 0.85]];
    for (let i = 0; i < PASS.length; i++) {
      const rr = r * PASS[i][0];
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, U.rgbToCss(rgb, PASS[i][1] * k));
      gr.addColorStop(1, U.rgbToCss(rgb, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* Bloom with the streak a lens puts through it. Kept for the one point on a
     rod that is meant to be unbearable to look at. */
  function flare(ctx, x, y, r, rgb, ang, k, t) {
    bloom(ctx, x, y, r, rgb, k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    ctx.rotate(ang);
    const pulse = 0.86 + 0.14 * Math.sin(t * 1.9);
    /* two crossed streaks, drawn as circles under a squash so the falloff stays
       soft at the ends instead of stopping at a box edge */
    [[7.0, 0.13, 0.30, 0], [2.6, 0.42, 0.20, Math.PI / 2]].forEach(function (s) {
      ctx.save();
      ctx.rotate(s[3]);
      ctx.scale(s[0], s[1]);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, U.rgbToCss([255, 255, 255], s[2] * k * pulse));
      gr.addColorStop(0.4, U.rgbToCss(rgb, s[2] * 0.5 * k * pulse));
      gr.addColorStop(1, U.rgbToCss(rgb, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  /* A point on a ring around the blank at k, seen very nearly edge on. The ring
     projects to an ellipse lying across the blank; `d` runs -1 (behind the rod)
     to 1 (in front of it), which is the whole reason a mote on one of these
     reads as going round rather than sliding back and forth. */
  function orbit(g, k, radius, phase, squash) {
    const p = nAt(g, k);
    const c = Math.cos(phase), s = Math.sin(phase);
    const e = squash === undefined ? 0.26 : squash;
    return {
      x: p.x + p.nx * radius * c + p.tx * radius * e * s,
      y: p.y + p.ny * radius * c + p.ty * radius * e * s,
      d: s, near: 0.5 + 0.5 * s,
      nx: p.nx, ny: p.ny, tx: p.tx, ty: p.ty
    };
  }

  /* The whole ellipse of one of those rings, as a path. Callers stroke it. */
  function ringPath(ctx, g, k, radius, squash) {
    const p = nAt(g, k);
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const ph = (i / 26) * TAU;
      const o = orbit(g, k, radius, ph, squash);
      if (i === 0) ctx.moveTo(o.x, o.y); else ctx.lineTo(o.x, o.y);
    }
    ctx.closePath();
    return p;
  }

  /* A cut stone: table, crown facets off it, one hard specular. Small, but it
     is the difference between a coloured dot and something set into metal. */
  function gem(ctx, x, y, r, ang, rgb, faces) {
    faces = faces || 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const gr = ctx.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.04, 0, 0, r);
    gr.addColorStop(0, U.rgbToCss(U.mixRgb(rgb, [255, 255, 255], 0.78)));
    gr.addColorStop(0.42, U.rgbToCss(rgb));
    gr.addColorStop(1, U.rgbToCss(U.shade(rgb, -0.58)));
    ctx.fillStyle = gr;
    ctx.beginPath();
    for (let i = 0; i < faces; i++) {
      const a = (i / faces) * TAU;
      const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.84;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = U.rgbToCss(U.mixRgb(rgb, [255, 255, 255], 0.55), 0.45);
    ctx.lineWidth = Math.max(0.22, r * 0.085);
    for (let i = 0; i < faces; i++) {
      const a = (i / faces) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.28);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.84);
      ctx.stroke();
    }
    ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.92);
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.3, r * 0.21, r * 0.12, -0.55, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* A machined band around the blank: dark far edge, lit near one, and the
     hairline between. Rods at this end of the list have hardware on them. */
  function collar(ctx, g, k, half, w, rgb, lit) {
    const p = nAt(g, k);
    const gr = ctx.createLinearGradient(p.x - p.nx * w, p.y - p.ny * w,
                                        p.x + p.nx * w, p.y + p.ny * w);
    gr.addColorStop(0, U.rgbToCss(U.shade(rgb, -0.64)));
    gr.addColorStop(0.32, U.rgbToCss(U.mixRgb(rgb, [255, 255, 255], lit === undefined ? 0.6 : lit)));
    gr.addColorStop(0.58, U.rgbToCss(rgb));
    gr.addColorStop(1, U.rgbToCss(U.shade(rgb, -0.72)));
    ctx.fillStyle = gr;
    taper(ctx, g, Math.max(0, k - half), Math.min(1, k + half), w * 2, w * 2, 3);
    ctx.fill();
  }

  /* ---- the shared apex treatment -------------------------------------------
     Every rod carrying `apex` gets this before its own flourish goes on, so the
     class reads as a class: the blank lit from inside rather than outlined, a
     wash the size of the rod so it looks like it lights the space it is in, and
     a field of small things keeping station around it. The field is drawn in
     two halves with the blank between them — that is what stops it looking like
     confetti pasted over a line. */

  /* The mote field is computed once a frame and drawn twice — half of it under
     the blank and half over — so the positions are worked out into a buffer
     that is allocated once rather than rebuilt for each half. */
  const MOTES = 13;
  const moteBuf = [];
  for (let i = 0; i < MOTES; i++) moteBuf.push({ x: 0, y: 0, near: 0, front: false });

  function apexMotes(ctx, g, t, scale, rgb, front, glow) {
    if (!front) {
      for (let i = 0; i < MOTES; i++) {
        const k = 0.16 + ((i * 0.6180339887) % 1) * 0.80;
        const rad = (2.4 + (i % 5) * 1.15) * scale * 1.7;
        const ph = t * (0.42 + (i % 4) * 0.16) * (i % 2 ? 1 : -1) + i * 1.37;
        const o = orbit(g, k, rad, ph);
        const m = moteBuf[i];
        m.x = o.x; m.y = o.y; m.near = o.near; m.front = o.d > 0;
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MOTES; i++) {
      const m = moteBuf[i];
      if (m.front !== front) continue;
      ctx.fillStyle = U.rgbToCss(rgb, (0.08 + 0.42 * m.near) * glow *
                                      (0.62 + 0.38 * Math.sin(t * 2.1 + i)));
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(0.3, (0.55 + 0.95 * m.near) * scale), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* The halo is four strokes along the blank rather than a disc behind it. A
     disc the size of the rod is a quarter of a million blended pixels every
     frame for a shape nobody can point to; the strokes read the same and cost
     what the blank costs. */
  const HALO = [[26, 0.030], [14, 0.050], [7.5, 0.075], [3.4, 0.12]];

  function apexUnder(ctx, art, g, t, scale, tipRgb) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < HALO.length; i++) {
      ctx.strokeStyle = U.rgbToCss(tipRgb, HALO[i][1] * art.glow);
      ctx.lineWidth = Math.max(2, HALO[i][0] * scale);
      ctx.beginPath();
      ctx.moveTo(g.bx, g.by);
      ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty);
      ctx.stroke();
    }
    ctx.restore();
    apexMotes(ctx, g, t, scale, tipRgb, false, art.glow);
  }

  /* Where the guides sit. They crowd together toward the tip on a real rod,
     because that is where the blank bends most. */
  /* An ornament that moves can read the line instead of reading a clock.
     `pull` is how hard something is pulling on the rod right now; `wingPhase`
     integrates a rate taken from it, so a wing that speeds up does it by
     beating faster rather than by jumping to a new place in its stroke. */
  let wingPhase = 0;

  function pull() {
    const S = VF.fishing && VF.fishing.S;
    if (!S) return 0;
    if (S.state === 'reeling' && S.fight) {
      return U.clamp(S.fight.tension * 0.85 + S.fight.surge * 0.45, 0, 1);
    }
    if (S.state === 'bite') return 0.40;
    if (S.charging) return U.clamp(S.charge, 0, 1) * 0.45;
    return 0;
  }

  /* Driven once a frame from the scene. Previews share it, which is right —
     a rod on a stand has nothing pulling on it and holds its wings out. */
  function tick(dt) {
    wingPhase += Math.min(0.08, dt) * (0.62 + pull() * 7.2);
    if (wingPhase > TAU * 4096) wingPhase -= TAU * 4096;
  }

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

    if (art.apex) {
      apexUnder(ctx, art, g, t, scale, tipRgb);
    } else if (art.glow > 0.02) {
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
    drawBlank(ctx, g, wButt, wTip, c1, c2, tipRgb, scale);

    drawStyle(ctx, art, g, t, scale, tipRgb);
    if (art.apex) apexMotes(ctx, g, t, scale, tipRgb, true, art.glow);

    /* ---- guides ----
       A guide is a chromed ring on a wire foot, and a ring is two strokes: a
       dark one that gives it a body and a bright arc where it turns into the
       light. One thin ellipse is a drawing of a guide. */
    const ringLit = U.mixRgb(tipRgb, [235, 245, 255], 0.62);
    const ringDark = U.shade(U.mixRgb(tipRgb, [120, 140, 160], 0.5), -0.55);
    for (let i = 0; i < GUIDES.length; i++) {
      const k = GUIDES[i];
      const p = ptAt(g, k);
      const m = Math.hypot(p.dx, p.dy) || 1;
      const nx = -p.dy / m * under, ny = p.dx / m * under;
      const ang = Math.atan2(p.dy, p.dx);
      const rr = Math.max(0.8, U.lerp(3.0, 1.1, k) * scale);
      const foot = rr * 1.35;
      const cx2 = p.x + nx * (foot + rr * 0.7), cy2 = p.y + ny * (foot + rr * 0.7);

      // the wire foot, tapering out of the blank rather than a bare line
      ctx.lineCap = 'round';
      ctx.strokeStyle = U.rgbToCss(ringDark, 0.9);
      ctx.lineWidth = Math.max(0.5, 1.15 * scale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + nx * foot, p.y + ny * foot);
      ctx.stroke();
      ctx.strokeStyle = U.rgbToCss(ringLit, 0.55);
      ctx.lineWidth = Math.max(0.3, 0.5 * scale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + nx * foot * 0.9, p.y + ny * foot * 0.9);
      ctx.stroke();

      // the ring: body first, then the lit side over the top of it
      ctx.strokeStyle = U.rgbToCss(ringDark, 0.95);
      ctx.lineWidth = Math.max(0.5, 1.25 * scale);
      ctx.beginPath();
      ctx.ellipse(cx2, cy2, rr, rr * 0.72, ang, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = U.rgbToCss(ringLit, 0.85);
      ctx.lineWidth = Math.max(0.3, 0.55 * scale);
      ctx.beginPath();
      ctx.ellipse(cx2, cy2, rr, rr * 0.72, ang, Math.PI * 0.85, Math.PI * 1.95);
      ctx.stroke();
      if (scale > 0.9) {
        ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.7);
        ctx.beginPath();
        ctx.arc(cx2 - nx * rr * 0.62, cy2 - ny * rr * 0.62, Math.max(0.25, 0.34 * scale), 0, TAU);
        ctx.fill();
      }
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

    /* cork tooth: flecks, denser where the grip turns away from the light, so
       the grip reads as a material rather than as a shaded tube */
    if (scale > 0.7) {
      ctx.save();
      taper(ctx, g, 0, gripEnd, wButt * 1.55, wButt * 1.25, 6);
      ctx.clip();
      const fr = VF.rng.make(0x9c0b);
      const flecks = Math.round(46 * U.clamp(scale, 0.6, 2.2));
      for (let i = 0; i < flecks; i++) {
        const k = fr() * gripEnd;
        const q = nAt(g, k);
        const off = (fr() * 2 - 1);
        const w2 = wButt * 1.8 * 0.5;
        ctx.fillStyle = U.rgbToCss(U.shade(gripRgb, off > 0 ? -0.62 : 0.22), 0.32 + fr() * 0.3);
        ctx.beginPath();
        ctx.ellipse(q.x + q.nx * off * w2, q.y + q.ny * off * w2,
                    Math.max(0.3, 0.7 * scale * (0.5 + fr())),
                    Math.max(0.2, 0.4 * scale * (0.5 + fr())), q.tx === 0 ? 0 : Math.atan2(q.ty, q.tx),
                    0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

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

    /* the hardware that says what it cost: a machined winding check either
       side of the seat, and a stone set into the near face of the upper one */
    if (art.apex) {
      const metal = U.hexToRgb(art.metal || art.c1);
      collar(ctx, g, 0.170, 0.016, wButt * 1.5, metal);
      collar(ctx, g, 0.228, 0.011, wButt * 1.25, metal);
      const sp = ptAt(g, 0.228);
      gem(ctx, sp.x, sp.y, Math.max(1.0, wButt * 0.62), a,
          U.hexToRgb(art.stone || art.tip), 6);
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
        /* Not a dot with a glow on it. A disc seen almost edge on, brighter on
           the side coming toward you, with the far half of it bent up over the
           top of the hole because the light off it has nowhere else to go. */
        ctx.save();
        const p = nAt(g, 1);
        const r = Math.max(2.2, 5.2 * scale);
        const R = r * 4.0, RY = r * 0.38;
        const ang = Math.atan2(p.ty, p.tx);
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);

        /* one gradient does the Doppler for both halves: the limb turning
           toward you is the bright one and it stays the bright one */
        const disc = function (alpha) {
          const gr = ctx.createLinearGradient(-R, 0, R, 0);
          gr.addColorStop(0, U.rgbToCss(tipRgb, 0.05 * alpha));
          gr.addColorStop(0.34, U.rgbToCss(U.mixRgb(tipRgb, [255, 240, 250], 0.35), 0.55 * alpha));
          gr.addColorStop(0.5, U.rgbToCss([255, 255, 255], 0.85 * alpha));
          gr.addColorStop(0.7, U.rgbToCss(U.mixRgb(tipRgb, [255, 200, 230], 0.2), 0.40 * alpha));
          gr.addColorStop(1, U.rgbToCss(tipRgb, 0.05 * alpha));
          return gr;
        };

        ctx.globalCompositeOperation = 'lighter';
        // the far half, which passes behind the hole
        ctx.strokeStyle = disc(0.85);
        ctx.lineWidth = Math.max(1.0, 2.2 * scale);
        ctx.beginPath(); ctx.ellipse(0, 0, R, RY, 0, Math.PI, TAU); ctx.stroke();
        // and the same half again, lensed up over the top of it
        ctx.strokeStyle = disc(0.55);
        ctx.lineWidth = Math.max(0.6, 1.3 * scale);
        ctx.beginPath(); ctx.ellipse(0, 0, R * 0.62, r * 2.35, 0, Math.PI, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, R * 0.62, r * 2.35, 0, 0, Math.PI); ctx.stroke();

        // the hole. Nothing additive about it — it is the one place on any of
        // these rods that takes light out rather than putting it in
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        // the photon ring sitting right on the edge of it
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], 0.7), 0.9);
        ctx.lineWidth = Math.max(0.35, 0.75 * scale);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.10, 0, TAU); ctx.stroke();
        // the near half, over the top of the hole
        ctx.strokeStyle = disc(1);
        ctx.lineWidth = Math.max(1.2, 2.6 * scale);
        ctx.beginPath(); ctx.ellipse(0, 0, R, RY, 0, 0, Math.PI); ctx.stroke();

        // and what is still falling in, going round faster the closer it gets
        for (let i = 0; i < 10; i++) {
          const u = ((t * 0.30 + i / 10) % 1);
          const rad = R * (1 - u * 0.86);
          const th = i * 2.1 + t * (0.8 + 3.4 * u * u);
          ctx.fillStyle = U.rgbToCss(U.mixRgb(tipRgb, [255, 255, 255], u), (1 - u * 0.5) * 0.7);
          ctx.beginPath();
          ctx.arc(Math.cos(th) * rad, Math.sin(th) * rad * (RY / R),
                  Math.max(0.25, (0.9 - u * 0.4) * scale), 0, TAU);
          ctx.fill();
        }
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
      /* The rod that came down out of the sky, and the only one in the list
         that argues with a fish about whether it got away. Nothing on it is
         subtle: shafts of light leaving the blank, three haloes standing off
         it and turning at their own rates, rings of standing fire down its
         length, and a star at the tip that is too bright to look at. */
      case 'heavens': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gold = U.hexToRgb(art.metal || art.tip);
        const pale = U.mixRgb(U.hexToRgb(art.stone || art.tip), [255, 255, 255], 0.5);

        /* ---- three haloes standing off the blank, each on its own period,
           each with one bead on it so the turn is legible ---- */
        const HALO = [[0.40, 15.5, 0.30, 0.55], [0.60, 11.5, 0.20, -0.85], [0.78, 7.8, 0.36, 1.25]];
        for (let h = 0; h < HALO.length; h++) {
          const k = HALO[h][0], rad = HALO[h][1] * scale * 1.5;
          const sq = HALO[h][2] + 0.10 * Math.sin(t * 0.4 + h), sp = HALO[h][3];
          ringPath(ctx, g, k, rad, sq);
          ctx.strokeStyle = U.rgbToCss(gold, 0.42 - h * 0.06);
          ctx.lineWidth = Math.max(0.7, 1.8 * scale);
          ctx.stroke();
          ringPath(ctx, g, k, rad * 0.90, sq);
          ctx.strokeStyle = U.rgbToCss(pale, 0.22);
          ctx.lineWidth = Math.max(0.3, 0.7 * scale);
          ctx.stroke();
          const o = orbit(g, k, rad, t * sp + h * 2.3, sq);
          bloom(ctx, o.x, o.y, Math.max(1.0, (1.4 + 1.6 * o.near) * scale), pale,
                0.35 + 0.55 * o.near);
        }

        /* ---- the standing fire down the blank. Bigger than it was, with a
           bright core inside each ring and the pulse running tipward ---- */
        for (let i = 0; i < 6; i++) {
          const k = 0.26 + i * 0.132;
          const p = nAt(g, Math.min(0.985, k));
          const ang = Math.atan2(p.ty, p.tx);
          const puls = 0.55 + 0.45 * Math.sin(t * 2.2 - i * 0.85);
          const r = Math.max(2.6, (8.4 - i * 0.85) * scale) * puls;
          ctx.strokeStyle = U.rgbToCss(gold, 0.6 * puls);
          ctx.lineWidth = Math.max(0.8, 1.9 * scale);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.30, ang, 0, TAU);
          ctx.stroke();
          const cg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          cg.addColorStop(0, U.rgbToCss(pale, 0.42 * puls));
          cg.addColorStop(0.55, U.rgbToCss(gold, 0.16 * puls));
          cg.addColorStop(1, U.rgbToCss(gold, 0));
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.30, ang, 0, TAU);
          ctx.fill();
        }

        /* ---- what is travelling up it ---- */
        for (let i = 0; i < 9; i++) {
          const k = ((t * 0.34 + i / 9) % 1) * 0.76 + 0.22;
          const p = nAt(g, k);
          const side = (i % 3 - 1) * 2.4 * scale;
          bloom(ctx, p.x + p.nx * side, p.y + p.ny * side,
                Math.max(0.8, 1.7 * scale), pale, 0.75 * Math.sin(k * Math.PI));
        }

        /* ---- and the star it stops at ---- */
        const tp = nAt(g, 1);
        flare(ctx, tp.x, tp.y, Math.max(2.4, 6.2 * scale), gold,
              Math.atan2(tp.ty, tp.tx), 1, t);
        ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.95);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, Math.max(0.9, 2.0 * scale), 0, TAU);
        ctx.fill();

        /* ---- leaf: light coming off it and going down, slowly, for good ---- */
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 10; i++) {
          const ph = ((t * 0.14 + i / 10) % 1);
          const p = nAt(g, 0.24 + ((i * 0.6180339887) % 1) * 0.72);
          const fall = ph * ph * 26 * scale;
          ctx.fillStyle = U.rgbToCss(U.mixRgb(gold, pale, 1 - ph), (1 - ph) * 0.7);
          ctx.beginPath();
          ctx.arc(p.x + Math.sin(t * 0.8 + i) * 3 * scale, p.y + fall,
                  Math.max(0.3, (1.0 - ph * 0.6) * scale), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      /* ==================== the admin rod ====================
         A whole animal, laid along the blank: tail off the butt, haunches over
         the reel, a chest and four legs, wings off the shoulder, a neck, and a
         head past the tip with its mouth open. The rod is its spine — which is
         why the crystal grows out of the top of it — and everything here is
         sized off the rod's own length so the dragon is the same dragon on a
         preview card and in somebody's hands. */
      case 'amethyst': {
        ctx.save();
        /* The animal's colours come off the rod's own paint rather than out of
           this file, so a finish reaches the dragon and not only the stick it
           is wrapped around. Amethyst is what the defaults spell; a Gilt one
           is a gold dragon on a gold rod. */
        const AME = U.hexToRgb(art.c1);
        const DEEP = U.hexToRgb(art.c2);
        const LIT = U.hexToRgb(art.metal || art.tip);
        const HOT = U.hexToRgb(art.stone || art.tip);
        const PALE = U.mixRgb(U.hexToRgb(art.tip), [255, 255, 255], 0.45);

        /* One dragon unit. It has to be read against the blank, not against the
           frame: the rod is about ten pixels thick, so a body six units across
           at a hundredth of the rod's length is an animal with a stick in it
           rather than an animal built on one. */
        const Uu = g.len * 0.0050;
        const F = function (k) { return nAt(g, U.clamp(k, 0, 1)); };
        /* Which way the normal points depends on where the rod is swinging, and
           a dragon has a definite back and a definite belly, so it is worked
           out once rather than assumed. */
        const mid = F(0.5);
        const up = mid.ny < 0 ? 1 : -1;
        // a point at k along the blank, o units toward the back (+) or belly (-)
        const at2 = function (k, o) {
          const p = F(k);
          return [p.x + p.nx * o * Uu * up, p.y + p.ny * o * Uu * up];
        };

        /* how thick the animal is at each point down its length */
        const GIRTH = [[0.00, 4.0], [0.09, 5.3], [0.20, 5.8], [0.31, 6.3],
                       [0.42, 6.4], [0.53, 5.5], [0.64, 4.0], [0.75, 3.0],
                       [0.86, 2.6], [1.00, 2.4]];
        const girth = function (k) {
          for (let i = 0; i < GIRTH.length - 1; i++) {
            if (k <= GIRTH[i + 1][0]) {
              const u = (k - GIRTH[i][0]) / (GIRTH[i + 1][0] - GIRTH[i][0]);
              return U.lerp(GIRTH[i][1], GIRTH[i + 1][1], U.clamp(u, 0, 1));
            }
          }
          return GIRTH[GIRTH.length - 1][1];
        };

        const facet = function (pts, fill, stroke, lw) {
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]);
          }
          ctx.closePath();
          if (fill) { ctx.fillStyle = fill; ctx.fill(); }
          if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
        };

        /* ---------------------------------------------------------- the tail
           It leaves the butt going back and down, and it does not stop where
           the rod does. */
        const b0 = F(0);
        const TN = 16, tailPts = [], tailW = [];
        for (let i = 0; i <= TN; i++) {
          const u = i / TN;
          const back = u * 30 * Uu;
          const sag = Math.pow(u, 1.75) * 20 * Uu;
          const wig = Math.sin(u * 3.2 + t * 0.55) * 3.4 * Uu * u;
          tailPts.push([b0.x - b0.tx * back + b0.nx * wig,
                        b0.y - b0.ty * back + sag + b0.ny * wig]);
          tailW.push(U.lerp(4.0, 0.35, Math.pow(u, 0.85)) * Uu);
        }
        const tg = ctx.createLinearGradient(tailPts[0][0], tailPts[0][1],
                                            tailPts[TN][0], tailPts[TN][1]);
        tg.addColorStop(0, U.rgbToCss(AME));
        tg.addColorStop(1, U.rgbToCss(U.mixRgb(AME, DEEP, 0.5)));
        ctx.fillStyle = tg;
        ctx.beginPath();
        for (let i = 0; i <= TN; i++) {
          const n = i < TN ? [tailPts[i + 1][0] - tailPts[i][0], tailPts[i + 1][1] - tailPts[i][1]]
                           : [tailPts[i][0] - tailPts[i - 1][0], tailPts[i][1] - tailPts[i - 1][1]];
          const m = Math.hypot(n[0], n[1]) || 1;
          const px = -n[1] / m * tailW[i], py = n[0] / m * tailW[i];
          if (i === 0) ctx.moveTo(tailPts[i][0] + px, tailPts[i][1] + py);
          else ctx.lineTo(tailPts[i][0] + px, tailPts[i][1] + py);
        }
        for (let i = TN; i >= 0; i--) {
          const n = i < TN ? [tailPts[i + 1][0] - tailPts[i][0], tailPts[i + 1][1] - tailPts[i][1]]
                           : [tailPts[i][0] - tailPts[i - 1][0], tailPts[i][1] - tailPts[i - 1][1]];
          const m = Math.hypot(n[0], n[1]) || 1;
          ctx.lineTo(tailPts[i][0] + n[1] / m * tailW[i], tailPts[i][1] - n[0] / m * tailW[i]);
        }
        ctx.closePath();
        ctx.fill();
        // the blade on the end of it
        {
          const e = tailPts[TN], d = tailPts[TN - 3];
          const dx = e[0] - d[0], dy = e[1] - d[1];
          const m = Math.hypot(dx, dy) || 1;
          const fxv = dx / m, fyv = dy / m, nxv = -fyv, nyv = fxv;
          facet([[e[0] + fxv * 9 * Uu, e[1] + fyv * 9 * Uu],
                 [e[0] + nxv * 4.2 * Uu, e[1] + nyv * 4.2 * Uu],
                 [e[0] - fxv * 5 * Uu, e[1] - fyv * 5 * Uu],
                 [e[0] - nxv * 4.2 * Uu, e[1] - nyv * 4.2 * Uu]],
                U.rgbToCss(U.mixRgb(AME, LIT, 0.35)), U.rgbToCss(LIT, 0.5),
                Math.max(0.3, 0.5 * scale));
        }

        /* --------------------------------------------------------- the wings
           Off the shoulder, not off the reel, and sized against the rod rather
           than against the reel housing — which is why they were thumbnails. */
        const SH = 0.48;
        const sh = F(SH);
        const wingUnit = g.len * 0.040;
        /* The wings answer the line rather than a clock. Slack, they are held
           out and all but still. Under tension they beat, and the harder it
           pulls the wider and faster they go, because whatever is on the far
           end of that line is being lifted. */
        const pu = pull();
        const amp = 0.05 + pu * 0.26;
        const w0 = Math.sin(wingPhase);
        // a wingbeat is a quick downstroke and a slower recovery, not a sine
        const stroke = (w0 < 0 ? -1 : 1) * Math.pow(Math.abs(w0), 0.68);
        const beat = 1 - amp * 0.5 + amp * 0.5 * stroke;
        for (let wi = 0; wi < 2; wi++) {
          const far = wi === 0;                        // the far wing, behind
          const sc = (far ? 0.86 : 1.0) * beat;
          const lift = far ? 2.40 : 0.0;
          const hub = [sh.x + sh.nx * 1.5 * Uu * up + sh.tx * (far ? -10 : 4) * Uu,
                       sh.y + sh.ny * 1.5 * Uu * up + sh.ty * (far ? -10 : 4) * Uu];
          // the arm goes up and back; the fingers fan off the wrist
          const dir = function (bk, u2) {
            return [hub[0] - sh.tx * bk * wingUnit * sc + sh.nx * u2 * wingUnit * sc * up,
                    hub[1] - sh.ty * bk * wingUnit * sc + sh.ny * u2 * wingUnit * sc * up];
          };
          const elbow = dir(1.1, 2.1 + lift);
          const wrist = dir(0.2, 4.6 + lift);
          const tips = [dir(2.4, 6.4 + lift), dir(5.0, 5.6 + lift),
                        dir(6.8, 3.6 + lift), dir(7.4, 1.1 + lift)];
          const root = dir(3.0, -0.2);

          const mg = ctx.createLinearGradient(hub[0], hub[1], tips[1][0], tips[1][1]);
          const dim = far ? 0.55 : 1;
          mg.addColorStop(0, U.rgbToCss(U.mixRgb(AME, DEEP, far ? 0.55 : 0.22), 0.95 * dim));
          mg.addColorStop(0.45, U.rgbToCss(U.mixRgb(AME, DEEP, far ? 0.4 : 0), 0.70 * dim));
          mg.addColorStop(1, U.rgbToCss(U.mixRgb(AME, HOT, 0.30), 0.34 * dim));
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.moveTo(hub[0], hub[1]);
          ctx.lineTo(elbow[0], elbow[1]);
          ctx.lineTo(wrist[0], wrist[1]);
          ctx.lineTo(tips[0][0], tips[0][1]);
          for (let i = 0; i < tips.length - 1; i++) {
            const mx = (tips[i][0] + tips[i + 1][0]) / 2, my = (tips[i][1] + tips[i + 1][1]) / 2;
            ctx.quadraticCurveTo(U.lerp(mx, wrist[0], 0.26), U.lerp(my, wrist[1], 0.26),
                                 tips[i + 1][0], tips[i + 1][1]);
          }
          ctx.quadraticCurveTo(U.lerp(root[0], wrist[0], 0.2), U.lerp(root[1], wrist[1], 0.2),
                               root[0], root[1]);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = U.rgbToCss(U.mixRgb(LIT, AME, far ? 0.7 : 0.3), far ? 0.5 : 0.92);
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(0.6, 2.2 * scale * sc);
          ctx.beginPath();
          ctx.moveTo(hub[0], hub[1]); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(wrist[0], wrist[1]);
          ctx.stroke();
          ctx.lineWidth = Math.max(0.4, 1.4 * scale * sc);
          for (let i = 0; i < tips.length; i++) {
            ctx.beginPath();
            ctx.moveTo(wrist[0], wrist[1]); ctx.lineTo(tips[i][0], tips[i][1]); ctx.stroke();
          }
          // the thumb claw on the wrist
          if (!far) {
            const cwv = dir(-0.9, 5.6);
            facet([wrist, cwv, dir(0.9, 5.0)], U.rgbToCss(PALE, 0.92), null, 0);
          }
        }

        /* ----------------------------------------------------------- the legs
           Two pairs. The far one of each pair is dimmer and set back, which is
           the cheapest depth there is and the only one that reads at this size. */
        const LEGS = [[0.17, 1.0], [0.15, 0.72], [0.44, 0.95], [0.42, 0.70]];
        for (let li = 0; li < LEGS.length; li++) {
          const k = LEGS[li][0], sc = LEGS[li][1];
          const near = sc > 0.8;
          const p = F(k);
          const hip = [p.x - p.nx * girth(k) * 0.55 * Uu * up,
                       p.y - p.ny * girth(k) * 0.55 * Uu * up];
          const swing = Math.sin(t * 0.5 + li) * 0.12;
          const knee = [hip[0] - p.nx * 5.0 * Uu * up * sc + p.tx * (2.4 + swing) * Uu,
                        hip[1] - p.ny * 5.0 * Uu * up * sc + p.ty * (2.4 + swing) * Uu];
          const foot = [knee[0] - p.nx * 5.2 * Uu * up * sc - p.tx * 1.6 * Uu,
                        knee[1] - p.ny * 5.2 * Uu * up * sc - p.ty * 1.6 * Uu];
          const col = U.rgbToCss(U.mixRgb(AME, DEEP, near ? 0.18 : 0.52));
          ctx.strokeStyle = col;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1, 3.4 * scale * sc);
          ctx.beginPath();
          ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1]);
          ctx.stroke();
          // three claws off the foot, splayed forward
          ctx.strokeStyle = U.rgbToCss(PALE, near ? 0.9 : 0.5);
          ctx.lineWidth = Math.max(0.5, 1.5 * scale * sc);
          for (let c = -1; c <= 1; c++) {
            ctx.beginPath();
            ctx.moveTo(foot[0], foot[1]);
            ctx.lineTo(foot[0] + p.tx * (2.6 + c * 0.5) * Uu * sc - p.nx * (0.8 + c * 0.9) * Uu * up * sc,
                       foot[1] + p.ty * (2.6 + c * 0.5) * Uu * sc - p.ny * (0.8 + c * 0.9) * Uu * up * sc);
            ctx.stroke();
          }
        }

        /* ----------------------------------------------------------- the body
           A run of flat plates down the blank rather than one smooth shape, so
           it belongs to the same world as the fish. */
        const BN = 22;
        for (let i = 0; i < BN; i++) {
          const k0 = (i / BN) * 0.94, k1 = ((i + 1) / BN) * 0.94;
          const w0 = girth(k0), w1 = girth(k1);
          const a0 = at2(k0, w0 * 0.72), a1 = at2(k1, w1 * 0.72);
          const c0 = at2(k0, -w0), c1 = at2(k1, -w1);
          const m0 = at2(k0, w0 * 0.02), m1 = at2(k1, w1 * 0.02);
          const lam = 0.5 + 0.5 * Math.sin(i * 0.9);
          // the lit back
          facet([a0, a1, m1, m0], U.rgbToCss(U.shade(U.mixRgb(AME, LIT, 0.42), -0.06 + 0.20 * lam)));
          // and the belly in shadow, one tone flatter
          facet([m0, m1, c1, c0], U.rgbToCss(U.shade(U.mixRgb(AME, DEEP, 0.50), 0.10 * lam)));
        }
        // scale rows, read as chevrons rather than as a texture
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(AME, DEEP, 0.62), 0.75);
        ctx.lineWidth = Math.max(0.3, 0.7 * scale);
        for (let i = 1; i < 20; i++) {
          const k = (i / 20) * 0.92;
          const w = girth(k);
          const a = at2(k, w * 0.6), c = at2(k, -w * 0.9), m = at2(k + 0.016, -w * 0.1);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]); ctx.lineTo(m[0], m[1]); ctx.lineTo(c[0], c[1]);
          ctx.stroke();
        }

        /* ---------------------------------------------------- the spine crest
           Crystal, growing out of the back, biggest over the shoulders. */
        for (let i = 0; i < 17; i++) {
          const k = 0.03 + i * 0.056;
          if (k > 0.97) break;
          const p = F(k);
          const swell = Math.sin(U.clamp(k / 0.55, 0, 1) * Math.PI * 0.9) * 0.75 + 0.35;
          const h = (girth(k) * 0.55 + 6.4 * swell) * Uu;
          const w = (0.7 + 0.9 * swell) * Uu;
          const base = at2(k, girth(k) * 0.66);
          const apex = [base[0] + p.nx * h * up - p.tx * h * 0.34,
                        base[1] + p.ny * h * up - p.ty * h * 0.34];
          const b1 = [base[0] + p.tx * w, base[1] + p.ty * w];
          const b2 = [base[0] - p.tx * w, base[1] - p.ty * w];
          const midp = [(apex[0] + b1[0]) / 2, (apex[1] + b1[1]) / 2];
          facet([b1, apex, midp], U.rgbToCss(U.mixRgb(LIT, AME, 0.30)));
          facet([b2, apex, midp], U.rgbToCss(U.mixRgb(AME, DEEP, 0.24)));
        }

        /* ----------------------------------------------------------- the head
           Built in its own frame — forward from the tip, and up toward the back
           — because a skull is easier to state as proportions than as pixels.
           The mouth is open: an upper skull with a lip line, a jaw hinged
           behind the cheek, and a row of teeth on each so you can see both. */
        const T = F(1);
        const HS = Uu * 9.2;
        const hp = function (f, u2) {
          return [T.x + T.tx * f * HS + T.nx * u2 * HS * up,
                  T.y + T.ty * f * HS + T.ny * u2 * HS * up];
        };
        const gape = 0.20 + 0.26 * (0.5 + 0.5 * Math.sin(t * 0.7));
        const hinge = [0.28, -0.20];
        const swing = function (q) {
          const dx = q[0] - hinge[0], dy = q[1] - hinge[1];
          const c = Math.cos(-gape), s2 = Math.sin(-gape);
          return [hinge[0] + dx * c - dy * s2, hinge[1] + dx * s2 + dy * c];
        };
        const hpoly = function (pts, fill, stroke, lw) {
          facet(pts.map(function (q) { return hp(q[0], q[1]); }), fill, stroke, lw);
        };

        // horns first — they sit behind the skull, so the skull closes on them
        for (let h = 0; h < 2; h++) {
          const o = h * 0.20, ln = 2.2 - h * 0.7;
          hpoly([[0.16 + o, 0.68], [-0.5 - ln * 0.45, 1.42 + o], [-1.5 - ln, 1.72 + o],
                 [-0.7 - ln * 0.45, 1.06 + o], [-0.05 + o, 0.34]],
                U.rgbToCss(U.mixRgb(AME, DEEP, 0.28 + h * 0.22)),
                U.rgbToCss(LIT, 0.45), Math.max(0.3, 0.5 * scale));
        }
        // and the fan of spines off the cheek
        for (let h = 0; h < 3; h++) {
          const o = h * 0.22;
          hpoly([[0.10, -0.12 - o * 0.5], [-0.85 - o, -0.55 - o], [-1.15 - o, -0.05 - o * 0.4],
                 [-0.35, 0.05 - o * 0.3]],
                U.rgbToCss(U.mixRgb(AME, DEEP, 0.45), 0.9), U.rgbToCss(LIT, 0.28),
                Math.max(0.25, 0.4 * scale));
        }

        // the lower jaw, swung open about the hinge
        const JAW = [[0.28, -0.20], [0.95, -0.14], [1.70, -0.16], [2.42, -0.24],
                     [2.30, -0.48], [1.55, -0.58], [0.85, -0.52], [0.30, -0.40]];
        hpoly(JAW.map(swing), U.rgbToCss(U.mixRgb(AME, DEEP, 0.36)),
              U.rgbToCss(LIT, 0.42), Math.max(0.3, 0.55 * scale));
        // lower teeth, standing up off the biting edge
        ctx.fillStyle = U.rgbToCss(PALE, 0.95);
        for (let i = 0; i < 7; i++) {
          const u2 = 0.10 + i * 0.135;
          const f0 = U.lerp(0.42, 2.34, u2), b1 = U.lerp(-0.19, -0.24, u2);
          const th = 0.30 - i * 0.018;
          hpoly([swing([f0 - 0.10, b1]), swing([f0 + 0.10, b1]), swing([f0, b1 + th])],
                U.rgbToCss(PALE, 0.95));
        }

        // the mouth itself, behind both jaws
        hpoly([[0.34, -0.18], [2.30, -0.20], swing([2.26, -0.22]), swing([0.40, -0.24])],
              U.rgbToCss([26, 4, 40]));

        // the upper skull
        const sg = ctx.createLinearGradient(hp(0, 1.0)[0], hp(0, 1.0)[1],
                                            hp(1.6, -0.5)[0], hp(1.6, -0.5)[1]);
        sg.addColorStop(0, U.rgbToCss(U.mixRgb(AME, LIT, 0.42)));
        sg.addColorStop(0.55, U.rgbToCss(AME));
        sg.addColorStop(1, U.rgbToCss(U.mixRgb(AME, DEEP, 0.55)));
        hpoly([[-0.34, 0.26], [-0.12, 0.80], [0.30, 1.04], [1.00, 0.78], [1.78, 0.54],
               [2.40, 0.32], [2.72, 0.06], [2.52, -0.12], [1.60, -0.08], [0.86, -0.04],
               [0.28, -0.20], [-0.34, -0.04]],
              sg, U.rgbToCss(LIT, 0.55), Math.max(0.35, 0.65 * scale));
        // the brow, which is the line that makes a skull look like it has a top
        ctx.strokeStyle = U.rgbToCss(LIT, 0.55);
        ctx.lineWidth = Math.max(0.3, 0.6 * scale);
        ctx.beginPath();
        const br0 = hp(0.34, 0.80), br1 = hp(1.10, 0.56), br2 = hp(2.30, 0.16);
        ctx.moveTo(br0[0], br0[1]); ctx.lineTo(br1[0], br1[1]); ctx.lineTo(br2[0], br2[1]);
        ctx.stroke();
        // upper teeth, hanging off the lip
        for (let i = 0; i < 8; i++) {
          const u2 = 0.06 + i * 0.126;
          const f0 = U.lerp(0.72, 2.46, u2), b1 = U.lerp(-0.05, -0.11, u2);
          const th = 0.30 - i * 0.016;
          hpoly([[f0 - 0.10, b1], [f0 + 0.10, b1], [f0, b1 - th]], U.rgbToCss(PALE, 0.95));
        }
        // nostril, and the eye
        hpoly([[2.30, 0.18], [2.44, 0.12], [2.36, 0.04]], U.rgbToCss([30, 6, 46], 0.9));
        const ey = hp(0.86, 0.44);
        ctx.globalCompositeOperation = 'lighter';
        bloom(ctx, ey[0], ey[1], HS * 0.26, HOT, 0.95);
        ctx.globalCompositeOperation = 'source-over';
        hpoly([[0.62, 0.44], [0.90, 0.56], [1.16, 0.42], [0.90, 0.34]],
              U.rgbToCss(U.mixRgb(HOT, [255, 255, 255], 0.55)));
        hpoly([[0.84, 0.52], [0.92, 0.52], [0.92, 0.36], [0.84, 0.36]], '#12001e');

        /* ------------------------------------------------------ what it carries
           Shards keeping station, and the arcs that jump between the ones that
           drift close to each other. */
        ctx.globalCompositeOperation = 'lighter';
        const shard = [];
        for (let i = 0; i < 9; i++) {
          const k = 0.24 + ((i * 0.6180339887) % 1) * 0.62;
          const rad = (girth(k) + 7 + (i % 3) * 5) * Uu;
          const o = orbit(g, k, rad, t * (0.26 + (i % 3) * 0.11) * (i % 2 ? 1 : -1) + i * 1.7);
          shard.push(o);
          const sz = (1.0 + 1.3 * o.near) * Uu;
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(t * 0.6 + i);
          facet([[0, -sz * 2.1], [sz, -sz * 0.4], [sz * 0.6, sz * 1.8],
                 [-sz * 0.6, sz * 1.8], [-sz, -sz * 0.4]],
                U.rgbToCss(U.mixRgb(AME, LIT, 0.25 + 0.5 * o.near), 0.88));
          facet([[0, -sz * 2.1], [sz, -sz * 0.4], [sz * 0.6, sz * 1.8], [0, sz * 1.8]],
                U.rgbToCss(U.mixRgb(AME, DEEP, 0.5), 0.9));
          ctx.restore();
          bloom(ctx, o.x, o.y, sz * 1.4, HOT, 0.14 + 0.26 * o.near);
        }
        ctx.strokeStyle = U.rgbToCss(HOT, 0.5);
        ctx.lineWidth = Math.max(0.3, 0.7 * scale);
        for (let i = 0; i < shard.length; i++) {
          const a1 = shard[i], b1 = shard[(i + 4) % shard.length];
          if (Math.hypot(b1.x - a1.x, b1.y - a1.y) > 20 * Uu) continue;
          ctx.beginPath();
          ctx.moveTo(a1.x, a1.y);
          for (let j = 1; j < 4; j++) {
            const u2 = j / 4;
            ctx.lineTo(U.lerp(a1.x, b1.x, u2) + Math.sin(t * 9 + i * 3 + j) * 1.8 * Uu,
                       U.lerp(a1.y, b1.y, u2) + Math.cos(t * 11 + i * 2 + j) * 1.8 * Uu);
          }
          ctx.lineTo(b1.x, b1.y);
          ctx.stroke();
        }

        /* --------------------------------------------------- and what it breathes */
        const mouth = hp(2.55, -0.16);
        const fwd = Math.atan2(T.ty, T.tx);
        for (let i = 0; i < 13; i++) {
          const ph = ((t * 0.72 + i / 13) % 1);
          const spread = (i % 5 - 2) * 0.10;
          const d = ph * HS * 3.6;
          ctx.fillStyle = U.rgbToCss(U.mixRgb(HOT, LIT, ph), (1 - ph) * 0.6);
          ctx.beginPath();
          ctx.arc(mouth[0] + Math.cos(fwd + spread) * d, mouth[1] + Math.sin(fwd + spread) * d,
                  Math.max(0.4, (0.5 + ph * 1.6) * Uu), 0, TAU);
          ctx.fill();
        }
        bloom(ctx, mouth[0], mouth[1], HS * 0.40, HOT, 0.7 + 0.3 * Math.sin(t * 3));
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
        /* The blank is not one object. It is a stack of slices that mostly
           agree about where they are, and every so often one of them stops
           agreeing. Held on a stepped clock — a fault that re-rolls every frame
           reads as noise, and noise is not the same as something being wrong. */
        ctx.save();
        const step = Math.floor(t * 6.5);
        const rnd = function (n) {
          const v = Math.sin(step * 37.13 + n * 91.7) * 43758.5453;
          return v - Math.floor(v);
        };
        const RED = [255, 45, 85], CYAN = [102, 255, 224];

        ctx.globalCompositeOperation = 'lighter';
        // the channels come apart, and stay apart for as long as the fault holds
        const off = (0.5 + rnd(1) * 2.8) * scale;
        [[RED, -off], [CYAN, off]].forEach(function (pair) {
          const q = nAt(g, 0.5);
          ctx.strokeStyle = U.rgbToCss(pair[0], 0.42 + 0.22 * rnd(2));
          ctx.lineWidth = Math.max(0.7, 1.4 * scale);
          ctx.beginPath();
          ctx.moveTo(g.bx + q.nx * pair[1], g.by + q.ny * pair[1]);
          ctx.quadraticCurveTo(g.cx + q.nx * pair[1], g.cy + q.ny * pair[1],
                               g.tx + q.nx * pair[1], g.ty + q.ny * pair[1]);
          ctx.stroke();
        });

        // slices: short runs of the blank redrawn somewhere they are not
        for (let i = 0; i < 6; i++) {
          if (rnd(10 + i) > 0.55) continue;
          const k0 = 0.08 + rnd(20 + i) * 0.80;
          const kl = 0.03 + rnd(30 + i) * 0.10;
          const q = nAt(g, k0);
          const shift = (rnd(40 + i) - 0.5) * 17 * scale;
          const w0 = U.lerp(5.0, 0.9, k0) * scale;
          ctx.save();
          ctx.translate(q.nx * shift, q.ny * shift);
          ctx.fillStyle = U.rgbToCss(rnd(50 + i) > 0.5 ? CYAN : RED, 0.55);
          taper(ctx, g, k0, Math.min(1, k0 + kl), w0, w0 * 0.8, 3);
          ctx.fill();
          ctx.restore();
        }

        // and blocks that are not on the blank at all and never were
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 5; i++) {
          if (rnd(60 + i) > 0.42) continue;
          const q = nAt(g, 0.10 + rnd(70 + i) * 0.86);
          const d = (rnd(80 + i) - 0.5) * 26 * scale;
          const bw = (2 + rnd(90 + i) * 12) * scale, bh = (0.6 + rnd(100 + i) * 1.6) * scale;
          ctx.fillStyle = U.rgbToCss(rnd(110 + i) > 0.5 ? CYAN : RED, 0.5 + 0.4 * rnd(120 + i));
          ctx.save();
          ctx.translate(q.x + q.nx * d, q.y + q.ny * d);
          ctx.rotate(Math.atan2(q.ty, q.tx));
          ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
          ctx.restore();
        }

        // scanlines, dropped across the whole length of it
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(2,4,8,0.55)';
        ctx.lineWidth = Math.max(0.4, 0.9 * scale);
        for (let i = 0; i < 4; i++) {
          const k = (rnd(130 + i) + t * 0.35) % 1;
          const q = nAt(g, U.clamp(k, 0.03, 0.98));
          const w = U.lerp(9, 3, k) * scale;
          ctx.beginPath();
          ctx.moveTo(q.x - q.nx * w, q.y - q.ny * w);
          ctx.lineTo(q.x + q.nx * w, q.y + q.ny * w);
          ctx.stroke();
        }
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
            const len = g.len * (0.295 - Math.abs(off) * 0.104);
            const ex = pF.x + Math.cos(a) * len, ey = pF.y + Math.sin(a) * len;
            const nx = -Math.sin(a), ny = Math.cos(a);
            const w = g.len * (0.026 - Math.abs(off) * 0.0104);
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

      /* ==================== the apex flourishes ====================
         Six rods that are not a continuation of anything. Each one breaks the
         silhouette somewhere — a head past the tip, rings standing off the
         blank, a chain going round it — because past a certain point a rod
         being a brighter line than the last rod stops meaning anything. */

      /* Gold that has not finished setting. Scrollwork chased into it, a seam
         still running, and leaf coming off the edges and going nowhere. */
      case 'gilded': {
        ctx.save();
        const gold = U.hexToRgb(art.metal || art.tip), deep = U.hexToRgb(art.c2);

        // a chased lozenge chain down the spine, which is where the eye goes
        ctx.fillStyle = U.rgbToCss(U.mixRgb(gold, [255, 252, 226], 0.35), 0.85);
        for (let i = 0; i < 14; i++) {
          const k = 0.20 + i * 0.055;
          if (k > 0.97) break;
          const p = nAt(g, k);
          const w = U.lerp(2.0, 0.6, k) * scale;
          ctx.beginPath();
          ctx.moveTo(p.x + p.tx * w * 1.5, p.y + p.ty * w * 1.5);
          ctx.lineTo(p.x + p.nx * w, p.y + p.ny * w);
          ctx.lineTo(p.x - p.tx * w * 1.5, p.y - p.ty * w * 1.5);
          ctx.lineTo(p.x - p.nx * w, p.y - p.ny * w);
          ctx.closePath();
          ctx.fill();
        }

        // chased scrollwork: paired curls either side, tightening toward the tip
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(gold, [255, 255, 255], 0.2), 0.5);
        ctx.lineWidth = Math.max(0.35, 0.75 * scale);
        for (let i = 0; i < 10; i++) {
          const k = 0.22 + i * 0.075;
          if (k > 0.96) break;
          const p = nAt(g, k);
          const w = U.lerp(4.6, 1.3, k) * scale;
          for (let s = -1; s <= 1; s += 2) {
            ctx.beginPath();
            ctx.moveTo(p.x + p.nx * w * 0.8 * s, p.y + p.ny * w * 0.8 * s);
            ctx.quadraticCurveTo(p.x + p.nx * w * 2.6 * s + p.tx * w * 1.2,
                                 p.y + p.ny * w * 2.6 * s + p.ty * w * 1.2,
                                 p.x + p.tx * w * 3.4, p.y + p.ty * w * 3.4);
            ctx.stroke();
          }
        }

        // the seam, travelling: a bright band that runs the length and repeats
        ctx.globalCompositeOperation = 'lighter';
        const seam = (t * 0.20) % 1.35 - 0.2;
        for (let i = 0; i <= 16; i++) {
          const k = 0.06 + (i / 16) * 0.92;
          const p = nAt(g, k);
          const d = Math.abs(k - seam);
          if (d > 0.22) continue;
          const a = (1 - d / 0.22) * 0.95;
          ctx.fillStyle = U.rgbToCss(U.mixRgb(gold, [255, 255, 255], 0.6), a);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, U.lerp(4.6, 1.4, k) * scale, U.lerp(2.0, 0.6, k) * scale,
                      Math.atan2(p.ty, p.tx), 0, TAU);
          ctx.fill();
        }

        // leaf: thin flakes peeling off and drifting, catching light on one
        // face only, which is what makes them read as flat rather than round.
        // Opaque, not additive — foil that glows is not foil.
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 9; i++) {
          const ph = ((t * 0.16 + i / 9) % 1);
          const p = nAt(g, 0.18 + ((i * 0.4142) % 1) * 0.78);
          const side = i % 2 ? 1 : -1;
          const dist = ph * 22 * scale;
          const x = p.x + p.nx * dist * side - p.tx * dist * 0.25;
          const y = p.y + p.ny * dist * side - p.ty * dist * 0.25;
          const spin = t * 1.6 + i * 2.1;
          const fold = Math.abs(Math.cos(spin));            // edge-on to face-on
          ctx.fillStyle = U.rgbToCss(U.mixRgb(U.shade(gold, -0.10), [255, 250, 220], fold),
                                     (1 - ph) * (0.62 + 0.38 * fold));
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(spin * 0.5);
          // a lozenge rather than a disc: leaf is beaten flat and tears square
          const lw = 2.4 * scale, lh = 2.4 * scale * fold;
          ctx.beginPath();
          ctx.moveTo(0, -lh);
          ctx.lineTo(lw * 0.62, 0);
          ctx.lineTo(0, lh);
          ctx.lineTo(-lw * 0.62, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // and it is still running off the tip
        ctx.globalCompositeOperation = 'lighter';
        const tp = nAt(g, 1);
        bloom(ctx, tp.x, tp.y, Math.max(1.6, 3.4 * scale), gold, 0.9);
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.55 + i / 3) % 1);
          const fall = ph * ph * 30 * scale;
          ctx.fillStyle = U.rgbToCss(U.mixRgb(gold, deep, ph * 0.5), (1 - ph) * 0.8);
          ctx.beginPath();
          ctx.ellipse(tp.x + tp.tx * 2 * scale, tp.y + fall,
                      Math.max(0.4, (1.3 - ph * 0.6) * scale),
                      Math.max(0.5, (1.7 + ph * 1.4) * scale), 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      /* One white line going in and the whole spectrum coming out sideways.
         The fan sweeps, so the colour on any part of the blank is a function
         of where the light happens to be entering it. */
      case 'prism': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const BANDS = [[255, 70, 90], [255, 160, 60], [255, 232, 90],
                       [110, 235, 130], [90, 190, 255], [140, 120, 255], [210, 110, 255]];
        const sweep = 0.30 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.55));

        // the fan: each band leaves the blank at its own angle, and the angles
        // spread with distance the way a real split does
        for (let b = 0; b < BANDS.length; b++) {
          const u = b / (BANDS.length - 1);
          const p = nAt(g, sweep);
          const spread = (u - 0.5) * 0.62;
          const len = (34 + u * 9) * scale;
          const ex = p.x + p.nx * len * Math.cos(spread) - p.tx * len * Math.sin(spread) * 0.9;
          const ey = p.y + p.ny * len * Math.cos(spread) - p.ty * len * Math.sin(spread) * 0.9;
          const gr = ctx.createLinearGradient(p.x, p.y, ex, ey);
          gr.addColorStop(0, U.rgbToCss(BANDS[b], 0.55));
          gr.addColorStop(0.35, U.rgbToCss(BANDS[b], 0.30));
          gr.addColorStop(1, U.rgbToCss(BANDS[b], 0));
          ctx.strokeStyle = gr;
          ctx.lineWidth = Math.max(1.1, 2.6 * scale);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        // the white that is going in
        const ip = nAt(g, sweep);
        bloom(ctx, ip.x, ip.y, Math.max(1.4, 3.0 * scale), [255, 255, 255], 1);

        // shards keeping station, each throwing its own small spectrum
        for (let i = 0; i < 9; i++) {
          const k = 0.20 + ((i * 0.6180339887) % 1) * 0.74;
          const o = orbit(g, k, (4.2 + (i % 3) * 2.4) * scale * 1.8,
                          t * 0.34 * (i % 2 ? 1 : -1) + i * 1.9);
          const sz = Math.max(1.1, (1.5 + 1.6 * o.near) * scale);
          const c = BANDS[i % BANDS.length];
          ctx.fillStyle = U.rgbToCss(c, 0.18 + 0.42 * o.near);
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(t * 0.8 + i);
          ctx.beginPath();
          ctx.moveTo(0, -sz * 2.1);
          ctx.lineTo(sz * 0.8, 0);
          ctx.lineTo(0, sz * 2.1);
          ctx.lineTo(-sz * 0.8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.3 + 0.5 * o.near);
          ctx.beginPath();
          ctx.moveTo(0, -sz * 2.1);
          ctx.lineTo(sz * 0.3, 0);
          ctx.lineTo(0, sz * 2.1);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        break;
      }

      /* Curtains. They hang off the blank rather than sit on it, they are
         brightest where they fold, and the fold moves. */
      case 'aurora': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const TOP = [120, 255, 190], MID = [90, 200, 255], LOW = [180, 110, 255];

        for (let b = 0; b < 4; b++) {
          const k0 = 0.19 + b * 0.175, k1 = k0 + 0.22;
          const hgt = (24 + b * 6) * scale;
          const off = t * 0.7 + b * 1.7;
          const pts = [];
          const N = 22;
          for (let i = 0; i <= N; i++) {
            const u = i / N;
            const k = Math.min(0.995, k0 + (k1 - k0) * u);
            const p = nAt(g, k);
            // the fold: how far this column of the curtain has swung out, and
            // how far along the blank it has been dragged doing it
            const fold = Math.sin(u * 5.4 + off);
            const drag = Math.cos(u * 3.1 + off * 0.8) * hgt * 0.16;
            // ends taper off rather than stopping, so it hangs instead of sitting
            const ends = Math.sin(u * Math.PI);
            pts.push({ x: p.x + p.tx * drag, y: p.y + p.ty * drag,
                       nx: p.nx, ny: p.ny,
                       w: hgt * (0.42 + 0.58 * (0.5 + 0.5 * fold)) * (0.35 + 0.65 * ends),
                       lit: (0.35 + 0.65 * (0.5 + 0.5 * fold)) * ends });
          }
          /* One polygon and one gradient for the whole curtain. Per-segment
             gradients meant ninety built and thrown away every frame, and
             batching them into runs put a visible seam wherever two runs met,
             because each run anchored its gradient somewhere else. A curtain is
             shaped by where it is wide, not by where it is brighter, so the
             width carries it and the light stays one piece. */
          let lit = 0;
          for (let i = 0; i < pts.length; i++) lit += pts[i].lit;
          lit /= pts.length;
          const mid = pts[(pts.length / 2) | 0];
          const gr = ctx.createLinearGradient(mid.x, mid.y,
                                              mid.x + mid.nx * mid.w, mid.y + mid.ny * mid.w);
          const strength = 0.86 * lit;
          gr.addColorStop(0, U.rgbToCss(TOP, strength));
          gr.addColorStop(0.30, U.rgbToCss(MID, strength * 0.72));
          gr.addColorStop(0.68, U.rgbToCss(LOW, strength * 0.38));
          gr.addColorStop(1, U.rgbToCss(LOW, 0));
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          for (let i = pts.length - 1; i >= 0; i--) {
            ctx.lineTo(pts[i].x + pts[i].nx * pts[i].w, pts[i].y + pts[i].ny * pts[i].w);
          }
          ctx.closePath();
          ctx.fill();

          // rays: the striations down a curtain, which is the thing that makes
          // one legible as a curtain rather than as a wash of green
          ctx.lineWidth = Math.max(0.3, 0.6 * scale);
          for (let i = 1; i < pts.length; i += 2) {
            const q = pts[i];
            const rg = ctx.createLinearGradient(q.x, q.y, q.x + q.nx * q.w, q.y + q.ny * q.w);
            rg.addColorStop(0, U.rgbToCss(U.mixRgb(TOP, [255, 255, 255], 0.5), 0.34 * q.lit));
            rg.addColorStop(0.5, U.rgbToCss(MID, 0.20 * q.lit));
            rg.addColorStop(1, U.rgbToCss(LOW, 0));
            ctx.strokeStyle = rg;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.lineTo(q.x + q.nx * q.w, q.y + q.ny * q.w);
            ctx.stroke();
          }
          // the hard bright line where the curtain leaves the blank
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(TOP, [255, 255, 255], 0.55), 0.55);
          ctx.lineWidth = Math.max(0.4, 0.9 * scale);
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
        // a few fixed stars behind all of it
        for (let i = 0; i < 10; i++) {
          const p = nAt(g, 0.24 + ((i * 0.7548) % 1) * 0.7);
          const d = ((i * 0.3399) % 1 - 0.5) * 40 * scale;
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + i * 2.3));
          ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.5 * tw);
          ctx.beginPath();
          ctx.arc(p.x + p.nx * d, p.y + p.ny * d, Math.max(0.25, 0.6 * scale * tw), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      /* A head past the tip, and a crown standing off the blank behind it.
         Everything on it is falling, slowly, and none of it lands. */
      case 'trident': {
        ctx.save();
        const steel = U.hexToRgb(art.metal || '#cfe4ee');
        const tp = nAt(g, 1);
        const L = Math.max(9, 24 * scale);
        const W = Math.max(0.9, 2.2 * scale);

        // a tapered spike from a point, through a bend, to a point
        const spike = function (x0, y0, bx2, by2, x1, y1, w, fill) {
          const mx = -(y1 - y0), my = (x1 - x0);
          const m = Math.hypot(mx, my) || 1;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.moveTo(x0 + mx / m * w, y0 + my / m * w);
          ctx.quadraticCurveTo(bx2 + mx / m * w * 0.5, by2 + my / m * w * 0.5, x1, y1);
          ctx.quadraticCurveTo(bx2 - mx / m * w * 0.5, by2 - my / m * w * 0.5,
                               x0 - mx / m * w, y0 - my / m * w);
          ctx.closePath();
          ctx.fill();
        };

        const shaft = ctx.createLinearGradient(tp.x, tp.y, tp.x + tp.tx * L, tp.y + tp.ty * L);
        shaft.addColorStop(0, U.rgbToCss(U.shade(steel, -0.3)));
        shaft.addColorStop(0.55, U.rgbToCss(steel));
        shaft.addColorStop(1, U.rgbToCss(U.mixRgb(steel, [255, 255, 255], 0.85)));

        // the outer two, which leave the shaft, bow out, and come back parallel
        for (let s = -1; s <= 1; s += 2) {
          spike(tp.x - tp.tx * L * 0.18, tp.y - tp.ty * L * 0.18,
                tp.x + tp.nx * L * 0.62 * s + tp.tx * L * 0.30,
                tp.y + tp.ny * L * 0.62 * s + tp.ty * L * 0.30,
                tp.x + tp.nx * L * 0.46 * s + tp.tx * L * 0.92,
                tp.y + tp.ny * L * 0.46 * s + tp.ty * L * 0.92,
                W * 0.8, shaft);
        }
        // and the middle one, longer, with a barb where it leaves
        spike(tp.x - tp.tx * L * 0.22, tp.y - tp.ty * L * 0.22,
              tp.x + tp.tx * L * 0.55, tp.y + tp.ty * L * 0.55,
              tp.x + tp.tx * L * 1.28, tp.y + tp.ty * L * 1.28, W, shaft);
        for (let s = -1; s <= 1; s += 2) {
          ctx.fillStyle = U.rgbToCss(U.shade(steel, -0.15));
          ctx.beginPath();
          ctx.moveTo(tp.x + tp.tx * L * 0.52, tp.y + tp.ty * L * 0.52);
          ctx.lineTo(tp.x + tp.tx * L * 0.36 + tp.nx * L * 0.20 * s,
                     tp.y + tp.ty * L * 0.36 + tp.ny * L * 0.20 * s);
          ctx.lineTo(tp.x + tp.tx * L * 0.70, tp.y + tp.ty * L * 0.70);
          ctx.closePath();
          ctx.fill();
        }
        // the ferrule the three of them come out of
        collar(ctx, g, 0.985, 0.014, Math.max(1.2, 3.0 * scale), steel);

        // the crown: rings standing off the blank, turning at their own rates
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < 3; r++) {
          const k = 0.62 + r * 0.11;
          const rad = (9 - r * 1.6) * scale * 1.5;
          ringPath(ctx, g, k, rad, 0.24 + 0.10 * Math.sin(t * 0.5 + r));
          ctx.strokeStyle = U.rgbToCss(U.mixRgb(steel, tipRgb, 0.5), 0.30 - r * 0.05);
          ctx.lineWidth = Math.max(0.4, 0.9 * scale);
          ctx.stroke();
          // one bead per ring, so the turn is legible
          const o = orbit(g, k, rad, t * (0.6 + r * 0.25) + r * 2.1, 0.24);
          ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.25 + 0.6 * o.near);
          ctx.beginPath();
          ctx.arc(o.x, o.y, Math.max(0.4, (0.8 + 0.9 * o.near) * scale), 0, TAU);
          ctx.fill();
        }

        // and the water coming off all of it, which never gets anywhere
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.32);
        ctx.lineWidth = Math.max(0.3, 0.6 * scale);
        for (let i = 0; i < 9; i++) {
          const k = 0.42 + ((i * 0.6180339887) % 1) * 0.56;
          const p = nAt(g, k);
          const ph = ((t * 0.6 + i / 9) % 1);
          const y0 = ph * 20 * scale, y1 = y0 + 6 * scale;
          ctx.globalAlpha = (1 - ph) * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + y0);
          ctx.lineTo(p.x, p.y + y1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        break;
      }

      /* Brass rings going round the blank on three different periods, each with
         a weight on it. Whatever they are counting, they have not finished. */
      case 'orrery': {
        ctx.save();
        const brass = U.hexToRgb(art.metal || '#d8a44e');
        const RINGS = [[0.36, 13, 0.31, 1.00], [0.55, 9.5, 0.42, -0.62], [0.74, 6.4, 0.26, 1.55]];

        for (let r = 0; r < RINGS.length; r++) {
          const k = RINGS[r][0], rad = RINGS[r][1] * scale * 1.5;
          const sq = RINGS[r][2], sp = RINGS[r][3];

          // the ring, lit on the near side and dark on the far one
          for (let half = 0; half < 2; half++) {
            ctx.beginPath();
            for (let i = 0; i <= 16; i++) {
              const ph = (half ? 0 : Math.PI) + (i / 16) * Math.PI;
              const o = orbit(g, k, rad, ph, sq);
              if (i === 0) ctx.moveTo(o.x, o.y); else ctx.lineTo(o.x, o.y);
            }
            ctx.strokeStyle = U.rgbToCss(half ? U.mixRgb(brass, [255, 245, 210], 0.45)
                                              : U.shade(brass, -0.55), half ? 0.95 : 0.7);
            ctx.lineWidth = Math.max(0.5, (half ? 1.5 : 1.1) * scale);
            ctx.stroke();
          }
          // teeth on the outer ring, because it is driving the other two
          if (r === 0) {
            ctx.strokeStyle = U.rgbToCss(U.shade(brass, -0.25), 0.85);
            ctx.lineWidth = Math.max(0.35, 0.7 * scale);
            for (let i = 0; i < 22; i++) {
              const ph = (i / 22) * TAU + t * sp * 0.18;
              const a = orbit(g, k, rad, ph, sq);
              const b = orbit(g, k, rad + 2.1 * scale, ph, sq);
              ctx.globalAlpha = 0.35 + 0.65 * a.near;
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
          // the weight it carries, in front of the blank on the near half and
          // behind it on the far one, which is the whole illusion
          const o = orbit(g, k, rad, t * sp * 0.55 + r * 2.3, sq);
          const sz = Math.max(0.8, (1.4 + 1.5 * o.near) * scale);
          bloom(ctx, o.x, o.y, sz * 1.4, tipRgb, 0.25 + 0.55 * o.near);
          gem(ctx, o.x, o.y, sz, t * 0.4 + r, U.mixRgb(U.hexToRgb(art.stone || art.tip),
                                                       [255, 255, 255], o.near * 0.35), 6);
        }

        // an escapement at the seat: a small wheel that ticks rather than turns
        const ep = nAt(g, 0.26);
        const tick = Math.floor(t * 2.2) * 0.34;
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(brass, [255, 240, 200], 0.3), 0.9);
        ctx.lineWidth = Math.max(0.35, 0.7 * scale);
        const er = Math.max(1.4, 3.2 * scale);
        ctx.beginPath();
        ctx.ellipse(ep.x, ep.y, er, er * 0.9, 0, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const a2 = (i / 9) * TAU + tick;
          ctx.beginPath();
          ctx.moveTo(ep.x + Math.cos(a2) * er * 0.45, ep.y + Math.sin(a2) * er * 0.45);
          ctx.lineTo(ep.x + Math.cos(a2) * er, ep.y + Math.sin(a2) * er);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      /* A chain wound down the blank, and it is not decorative — every link is
         under load, and the barnacles are on the links rather than the rod. */
      case 'leviathan': {
        ctx.save();
        const iron = U.hexToRgb(art.metal || '#7d8894');
        const TURNS = 2.6;
        const links = [];
        for (let i = 0; i <= 44; i++) {
          const k = 0.17 + (i / 44) * 0.79;
          const rad = U.lerp(6.4, 2.2, k) * scale * 1.6;
          const ph = k * TURNS * TAU - t * 0.28;
          links.push({ o: orbit(g, k, rad, ph), k: k, i: i });
        }
        // far side first, so the near links close over the top of them
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < links.length; i++) {
            const l = links[i];
            if ((l.o.d > 0) !== !!pass) continue;
            const sz = U.lerp(2.9, 1.1, l.k) * scale * (0.74 + 0.26 * l.o.near);
            ctx.save();
            ctx.translate(l.o.x, l.o.y);
            ctx.rotate(Math.atan2(l.o.ty, l.o.tx) + (l.i % 2 ? 1.35 : 0));
            // a dark seat, then the lit face of the link inside it
            ctx.strokeStyle = U.rgbToCss(U.shade(iron, -0.88), pass ? 1 : 0.6);
            ctx.lineWidth = Math.max(0.7, (pass ? 2.1 : 1.4) * scale);
            ctx.beginPath();
            ctx.ellipse(0, 0, sz * 1.45, sz * 0.70, 0, 0, TAU);
            ctx.stroke();
            // only the near half is worth the second stroke that makes the
            // link read as round; the far half is a silhouette either way
            if (pass) {
              ctx.strokeStyle = U.rgbToCss(U.mixRgb(U.shade(iron, -0.18), [235, 244, 255],
                                                    0.34 * l.o.near), 0.95);
              ctx.lineWidth = Math.max(0.3, 0.95 * scale);
              ctx.beginPath();
              ctx.ellipse(0, 0, sz * 1.45, sz * 0.70, 0, 0, TAU);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        // barnacles, clustered where the chain has been sitting longest
        for (let i = 0; i < 14; i++) {
          const l = links[(i * 7 + 3) % links.length];
          if (l.o.d < -0.2) continue;
          const r = Math.max(0.35, (0.7 + 0.5 * l.o.near) * scale * (0.7 + (i % 3) * 0.3));
          ctx.fillStyle = U.rgbToCss(U.mixRgb([214, 208, 190], iron, 0.35), 0.55 + 0.3 * l.o.near);
          ctx.beginPath(); ctx.arc(l.o.x, l.o.y, r, 0, TAU); ctx.fill();
          ctx.fillStyle = U.rgbToCss([30, 34, 32], 0.7);
          ctx.beginPath(); ctx.arc(l.o.x, l.o.y, r * 0.36, 0, TAU); ctx.fill();
        }
        // whatever the chain is holding is still pulling: the last link is not
        // on the rod, it is out past the tip and going down
        ctx.globalCompositeOperation = 'lighter';
        const tp = nAt(g, 1);
        ctx.strokeStyle = U.rgbToCss(tipRgb, 0.5);
        ctx.lineWidth = Math.max(0.4, 1.0 * scale);
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.quadraticCurveTo(tp.x + 5 * scale, tp.y + 14 * scale,
                             tp.x - 2 * scale, tp.y + 26 * scale);
        ctx.stroke();
        bloom(ctx, tp.x - 2 * scale, tp.y + 26 * scale, 2.4 * scale, tipRgb, 0.7);
        ctx.restore();
        break;
      }
    }
  }

  /* Some of the strange rods do not have a reel so much as something sitting
     where a reel would be. This runs over the top of the drawn one, so the
     housing underneath still reads as a housing. */
  const REEL_STYLES = { kraken: 1, thunder: 1, corded: 1, neon: 1, hemo: 1,
                        twinsun: 1, glacier: 1, halo: 1, pyre: 1, seraph: 1,
                        leviathan: 1, orrery: 1, gilded: 1, prism: 1, heavens: 1, amethyst: 1 };

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

      /* The reel is inside something's mouth. It opens and closes on its own
         schedule and the schedule has nothing to do with you. */
      case 'leviathan': {
        const iron = U.hexToRgb(art.metal || '#7d8894');
        const open = 0.26 + 0.74 * (0.5 + 0.5 * Math.sin(t * 0.75));
        const hx = cx - Math.cos(a) * rr * 1.9, hy = cy - Math.sin(a) * rr * 1.9;
        for (let s = -1; s <= 1; s += 2) {
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(a);
          ctx.scale(1, under);                 // the reel hangs where it hangs
          ctx.rotate(s * open * 0.40);
          const jg = ctx.createLinearGradient(0, -rr * 2.0 * s, 0, rr * 0.4 * s);
          jg.addColorStop(0, U.rgbToCss(U.mixRgb(iron, [255, 255, 255], 0.36)));
          jg.addColorStop(0.55, U.rgbToCss(iron));
          jg.addColorStop(1, U.rgbToCss(U.shade(iron, -0.68)));
          ctx.fillStyle = jg;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(rr * 2.3, -rr * 2.05 * s, rr * 4.7, -rr * 0.35 * s);
          ctx.quadraticCurveTo(rr * 2.3, -rr * 0.62 * s, 0, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.shade(iron, -0.78), 0.85);
          ctx.lineWidth = Math.max(0.3, 0.6 * scale);
          ctx.stroke();
          // teeth off the inner edge, longest halfway along where a jaw bites
          ctx.fillStyle = U.rgbToCss([238, 234, 220], 0.95);
          for (let i = 0; i < 7; i++) {
            const u = 0.13 + i * 0.125, m = 1 - u;
            const ex = 2 * m * u * rr * 2.3 + u * u * rr * 4.7;
            const ey = (2 * m * u * -rr * 0.62 + u * u * -rr * 0.35) * s;
            const th = rr * (0.26 + 0.30 * Math.sin(u * Math.PI));
            ctx.beginPath();
            ctx.moveTo(ex - rr * 0.17, ey);
            ctx.lineTo(ex, ey + th * s);
            ctx.lineTo(ex + rr * 0.17, ey);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        // and something lit a long way back down the throat of it
        ctx.globalCompositeOperation = 'lighter';
        bloom(ctx, cx + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5,
              rr * 0.85, tipRgb, 0.45 + 0.3 * Math.sin(t * 1.4));
        break;
      }

      /* Two more wheels than the reel needs, meshing with it and with each
         other. Every tooth is where the next one is going to be. */
      case 'orrery': {
        const brass = U.hexToRgb(art.metal || '#d8a44e');
        const cog = function (gx, gy, R, teeth, spin, dark) {
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(spin);
          const gr = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.05, 0, 0, R);
          gr.addColorStop(0, U.rgbToCss(U.mixRgb(brass, [255, 246, 214], dark ? 0.1 : 0.45)));
          gr.addColorStop(1, U.rgbToCss(U.shade(brass, dark ? -0.62 : -0.35)));
          ctx.fillStyle = gr;
          ctx.beginPath();
          const w = TAU / teeth;
          for (let i = 0; i < teeth; i++) {
            // root, up the leading flank, across the tip, down the trailing one
            const a0 = i * w;
            ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
            ctx.lineTo(Math.cos(a0 + w * 0.17) * R * 1.20, Math.sin(a0 + w * 0.17) * R * 1.20);
            ctx.lineTo(Math.cos(a0 + w * 0.40) * R * 1.20, Math.sin(a0 + w * 0.40) * R * 1.20);
            ctx.lineTo(Math.cos(a0 + w * 0.57) * R, Math.sin(a0 + w * 0.57) * R);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.shade(brass, -0.7), 0.8);
          ctx.lineWidth = Math.max(0.25, R * 0.055);
          ctx.stroke();
          // the arbor, and four lightening holes: what makes it read as machined
          ctx.fillStyle = U.rgbToCss(U.shade(brass, -0.62), 0.8);
          for (let i = 0; i < 4; i++) {
            const a2 = (i / 4) * TAU + 0.4;
            ctx.beginPath();
            ctx.arc(Math.cos(a2) * R * 0.55, Math.sin(a2) * R * 0.55, R * 0.155, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = U.rgbToCss(U.shade(brass, -0.82), 0.95);
          ctx.beginPath(); ctx.arc(0, 0, R * 0.20, 0, TAU); ctx.fill();
          ctx.restore();
        };
        const R1 = rr * 1.20, R2 = rr * 0.78;
        cog(cx - Math.cos(a) * rr * 2.15 + nx * rr * 1.05,
            cy - Math.sin(a) * rr * 2.15 + ny * rr * 1.05, R1, 14, -t * 0.5, true);
        cog(cx + Math.cos(a) * rr * 1.75 + nx * rr * 1.30,
            cy + Math.sin(a) * rr * 1.75 + ny * rr * 1.30, R2, 10, t * 0.86, false);
        break;
      }

      /* The reel got the same treatment as the rest of it: a rosette, and one
         stone in the middle doing the work of a drag knob. */
      case 'gilded': {
        const gold = U.hexToRgb(art.metal || '#e8b445');
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(gold, [255, 246, 210], 0.4), 0.85);
        ctx.lineWidth = Math.max(0.3, 0.65 * scale);
        for (let i = 0; i < 7; i++) {
          const a2 = (i / 7) * TAU + t * 0.12;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a2) * rr * 0.42, cy + Math.sin(a2) * rr * 0.42);
          ctx.quadraticCurveTo(cx + Math.cos(a2 + 0.34) * rr * 0.95,
                               cy + Math.sin(a2 + 0.34) * rr * 0.95,
                               cx + Math.cos(a2 + 0.62) * rr * 1.02,
                               cy + Math.sin(a2 + 0.62) * rr * 1.02);
          ctx.stroke();
        }
        gem(ctx, cx, cy, rr * 0.34, t * 0.3, U.hexToRgb(art.stone || '#ff4d6a'), 8);
        break;
      }

      /* Six wings and a ring standing on edge behind the whole reel. Whatever
         made this did not intend it to be carried discreetly. */
      case 'heavens': {
        ctx.globalCompositeOperation = 'lighter';
        const gold = U.hexToRgb(art.metal || art.tip || '#f0cf78');
        const pale = U.mixRgb(U.hexToRgb(art.stone || art.tip || '#fff0b8'), [255, 255, 255], 0.5);
        const beat = 0.86 + 0.14 * Math.sin(t * 0.9);

        // the aureole: a ring the size of the whole reel assembly, seen on edge
        const AR = rr * 5.4;
        for (let ring = 0; ring < 2; ring++) {
          const rr2 = AR * (1 - ring * 0.14);
          ctx.strokeStyle = U.rgbToCss(gold, (0.34 - ring * 0.14));
          ctx.lineWidth = Math.max(0.7, (1.9 - ring * 0.8) * scale);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr2, rr2 * 0.92, a + t * 0.05, 0, TAU);
          ctx.stroke();
        }
        // and the spokes of it, which are what makes it a gate rather than a hoop
        ctx.strokeStyle = U.rgbToCss(gold, 0.22);
        ctx.lineWidth = Math.max(0.35, 0.8 * scale);
        for (let i = 0; i < 16; i++) {
          const a2 = (i / 16) * TAU + t * 0.05;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a2) * AR * 0.80, cy + Math.sin(a2) * AR * 0.74);
          ctx.lineTo(cx + Math.cos(a2) * AR, cy + Math.sin(a2) * AR * 0.92);
          ctx.stroke();
        }

        /* Six wings, three pairs. Two goes at this got a dandelion and then a
           comb, both for the same reason: a wing is a mass with the quills
           drawn inside it, not a set of separate spikes leaving a point. So
           the membrane goes down first — hub, out along the leading edge, back
           along the tips of the feathers — and the quills are detail on top. */
        const PAIRS = [[1.20, 9.6, 0.60], [0.62, 8.0, 0.50], [0.06, 6.6, 0.54]];
        for (let pair = 0; pair < PAIRS.length; pair++) {
          const lift = PAIRS[pair][0];
          const reach = rr * PAIRS[pair][1] * beat;
          const fan = PAIRS[pair][2];
          const N = 7;
          for (let side = -1; side <= 1; side += 2) {
            const lead = a + Math.PI * 0.98 + side * lift;
            const lx = Math.cos(lead), ly = Math.sin(lead);
            const wobble = Math.sin(t * 0.8 + pair) * 0.03;

            // where each quill starts on the leading edge, and where it ends
            const root = [], tip = [];
            for (let f = 0; f < N; f++) {
              const u = f / (N - 1);
              const rx = cx + lx * reach * 0.50 * u, ry = cy + ly * reach * 0.50 * u;
              const fa = lead + side * fan * (1 - u * 0.66) + wobble;
              const len = reach * (0.44 + 0.56 * Math.sin((0.20 + u * 0.80) * Math.PI * 0.84));
              root.push([rx, ry]);
              tip.push([rx + Math.cos(fa) * len, ry + Math.sin(fa) * len]);
            }

            // the membrane
            const wg = ctx.createLinearGradient(cx, cy,
                                                cx + lx * reach * 0.5 + (tip[N - 1][0] - cx) * 0.5,
                                                cy + ly * reach * 0.5 + (tip[N - 1][1] - cy) * 0.5);
            wg.addColorStop(0, U.rgbToCss(pale, 0.50 - pair * 0.07));
            wg.addColorStop(0.38, U.rgbToCss(gold, 0.34 - pair * 0.05));
            wg.addColorStop(1, U.rgbToCss(gold, 0.04));
            ctx.fillStyle = wg;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let f = 0; f < N; f++) ctx.lineTo(root[f][0], root[f][1]);
            for (let f = N - 1; f >= 0; f--) ctx.lineTo(tip[f][0], tip[f][1]);
            ctx.closePath();
            ctx.fill();

            // the quills inside it
            for (let f = 0; f < N; f++) {
              const g2 = ctx.createLinearGradient(root[f][0], root[f][1], tip[f][0], tip[f][1]);
              g2.addColorStop(0, U.rgbToCss(pale, 0.42));
              g2.addColorStop(0.55, U.rgbToCss(pale, 0.20));
              g2.addColorStop(1, U.rgbToCss(gold, 0));
              ctx.strokeStyle = g2;
              ctx.lineWidth = Math.max(0.3, (1.1 - pair * 0.2) * scale);
              ctx.beginPath();
              ctx.moveTo(root[f][0], root[f][1]);
              ctx.lineTo(tip[f][0], tip[f][1]);
              ctx.stroke();
            }

            // and the bone along the front of it
            ctx.strokeStyle = U.rgbToCss(pale, 0.50);
            ctx.lineWidth = Math.max(0.45, 1.2 * scale);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + lx * reach * 0.50, cy + ly * reach * 0.50);
            ctx.stroke();
          }
        }

        // and what all of it is coming out of
        flare(ctx, cx, cy, rr * 0.85, gold, a, 0.60, t);
        ctx.fillStyle = U.rgbToCss([255, 255, 255], 0.95);
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 0.36, 0, TAU);
        ctx.fill();
        break;
      }

      /* The wings moved to the shoulder where they belong, so what is left at
         the seat is the near hind foot, holding on to it. */
      case 'amethyst': {
        const AME = U.hexToRgb(art.metal || art.tip || '#c89aff');
        const PALE = U.mixRgb(U.hexToRgb(art.tip || '#e0b0ff'), [255, 255, 255], 0.45);
        const HOT = U.hexToRgb(art.stone || '#ff5fe0');
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(AME, [20, 6, 44], 0.35), 0.95);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.8, 2.6 * scale);
        for (let i = -1; i <= 1; i++) {
          const sp = 0.55 + i * 0.42;
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * rr * 0.4, cy - Math.sin(a) * rr * 0.4);
          ctx.quadraticCurveTo(cx + nx * rr * sp * 1.6, cy + ny * rr * sp * 1.6,
                               cx + Math.cos(a) * rr * (1.2 + i * 0.5) + nx * rr * 2.1,
                               cy + Math.sin(a) * rr * (1.2 + i * 0.5) + ny * rr * 2.1);
          ctx.stroke();
        }
        ctx.strokeStyle = U.rgbToCss(PALE, 0.85);
        ctx.lineWidth = Math.max(0.4, 1.2 * scale);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * rr * (1.2 + i * 0.5) + nx * rr * 2.1,
                     cy + Math.sin(a) * rr * (1.2 + i * 0.5) + ny * rr * 2.1);
          ctx.lineTo(cx + Math.cos(a) * rr * (2.2 + i * 0.7) + nx * rr * 2.6,
                     cy + Math.sin(a) * rr * (2.2 + i * 0.7) + ny * rr * 2.6);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        bloom(ctx, cx, cy, rr * 1.1, HOT, 0.45 + 0.2 * Math.sin(t * 1.6));
        break;
      }

      /* Nothing sits on the reel — the light goes into it and comes out the
         other side already taken apart. */
      case 'prism': {
        ctx.globalCompositeOperation = 'lighter';
        const BANDS = [[255, 70, 90], [255, 190, 60], [120, 240, 140], [90, 190, 255], [175, 120, 255]];
        for (let i = 0; i < BANDS.length; i++) {
          const u = i / (BANDS.length - 1) - 0.5;
          const ang = a + Math.PI * 0.5 + u * 0.75;
          const len = rr * (3.4 + Math.abs(u) * 1.2);
          const gr = ctx.createLinearGradient(cx, cy, cx + Math.cos(ang) * len * under,
                                              cy + Math.sin(ang) * len * under);
          gr.addColorStop(0, U.rgbToCss(BANDS[i], 0.45));
          gr.addColorStop(1, U.rgbToCss(BANDS[i], 0));
          ctx.strokeStyle = gr;
          ctx.lineWidth = Math.max(0.8, 2.0 * scale);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * len * under, cy + Math.sin(ang) * len * under);
          ctx.stroke();
        }
        bloom(ctx, cx, cy, rr * 0.7, [255, 255, 255], 0.9);
        break;
      }
    }
    ctx.restore();
  }

  /* Lay a rod out across a box, butt at the lower left, tip at the upper
     right, with a gentle idle flex. Used for shop previews. */
  function preview(ctx, rod, w, h, t) {
    /* A rod with a head past the tip needs the room for it — the head is the
       rod, and a preview that crops it is showing the wrong object. `reach`
       says how far past the tip-top the thing goes, in tip-to-butt lengths. */
    const reach = rod.art.reach || 0;
    const pad = w * 0.035;
    const bx = pad, by = h * 0.86;
    const tx = w - pad - w * 0.13 * reach, ty = h * 0.16 + h * 0.34 * reach;
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

  VF.rodArt = { draw: draw, preview: preview, quadAt: quadAt, tick: tick };
})(window.VF = window.VF || {});
