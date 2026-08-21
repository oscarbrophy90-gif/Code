/* VOID FISHING — procedural creature rendering.
   Every species is drawn from its art{} spec: a body silhouette, fins, a set of
   extras, and eyes. The exception is body 'object', which is not a creature at
   all and takes the object pipeline near the bottom of this file instead. Randomness is seeded from the species id so a given fish
   always looks the same. Fish face right; local origin is the body centre. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Half-height of each body as a fraction of total length. The renderers and
     the UI sizing helpers all read this, so proportions stay consistent. */
  const BODY_H = {
    torpedo: 0.30, round: 0.38, eel: 0.13, serpent: 0.15, blob: 0.36,
    jelly: 0.34, ray: 0.22, shard: 0.34, orb: 0.46, crustacean: 0.32,
    whale: 0.27, ribbon: 0.20, anomaly: 0.36, fractal: 0.38,
    /* the ones that are not really fish */
    hole: 0.34, swarm: 0.33, mirror: 0.32, spiral: 0.40,
    tally: 0.30, unfinished: 0.31, folded: 0.35, column: 0.44
  };
  /* A being is not a fish and not an object. There are two of them and they
     are the whole of the tier above the last one. */
  const BEING_H = { nessie: 0.62, human: 0.82 };

  /* `obj` is only consulted for body 'object' and body 'being', where the
     proportions belong to the thing itself rather than to any fish
     silhouette. */
  function bodyRatio(kind, obj) {
    if (kind === 'object') return OBJ_H[obj] === undefined ? 0.50 : OBJ_H[obj];
    if (kind === 'being') return BEING_H[obj] === undefined ? 0.60 : BEING_H[obj];
    return BODY_H[kind] === undefined ? 0.30 : BODY_H[kind];
  }

  /* ------------------------------------------------------------- bodies
     Each returns the path on ctx and reports its bounding half-height. */

  function bodyPath(ctx, kind, L, sway, rnd) {
    const H = L * bodyRatio(kind);

    ctx.beginPath();
    switch (kind) {
      case 'round':
        ctx.moveTo(L * 0.52, 0);
        ctx.bezierCurveTo(L * 0.44, -H * 1.05, -L * 0.16, -H * 1.10, -L * 0.40, -H * 0.34);
        ctx.bezierCurveTo(-L * 0.50, -H * 0.14, -L * 0.50, H * 0.14, -L * 0.40, H * 0.34);
        ctx.bezierCurveTo(-L * 0.16, H * 1.10, L * 0.44, H * 1.05, L * 0.52, 0);
        break;

      case 'orb':
        ctx.ellipse(0, 0, L * 0.50, H, 0, 0, TAU);
        break;

      case 'eel':
      case 'serpent': {
        const segs = 22, amp = H * (kind === 'serpent' ? 4.2 : 2.6);
        ctx.moveTo(L * 0.52, 0);
        for (let i = 0; i <= segs; i++) {
          const k = i / segs;
          const x = L * 0.52 - k * L;
          const y = Math.sin(k * Math.PI * 2.1 + sway) * amp * k;
          const th = H * (1 - k * 0.72) * (kind === 'serpent' ? 1 : 0.9);
          ctx.lineTo(x, y - th);
        }
        for (let i = segs; i >= 0; i--) {
          const k = i / segs;
          const x = L * 0.52 - k * L;
          const y = Math.sin(k * Math.PI * 2.1 + sway) * amp * k;
          const th = H * (1 - k * 0.72) * (kind === 'serpent' ? 1 : 0.9);
          ctx.lineTo(x, y + th);
        }
        break;
      }

      case 'ribbon': {
        const segs = 18;
        ctx.moveTo(L * 0.50, -H * 0.5);
        for (let i = 0; i <= segs; i++) {
          const k = i / segs;
          ctx.lineTo(L * 0.50 - k * L, Math.sin(k * 4.2 + sway) * H * 1.9 * k - H * (1 - k * 0.3));
        }
        for (let i = segs; i >= 0; i--) {
          const k = i / segs;
          ctx.lineTo(L * 0.50 - k * L, Math.sin(k * 4.2 + sway) * H * 1.9 * k + H * (1 - k * 0.3));
        }
        break;
      }

      case 'blob':
        ctx.moveTo(L * 0.48, -H * 0.12);
        ctx.bezierCurveTo(L * 0.34, -H * 1.15, -L * 0.22, -H * 1.25, -L * 0.44, -H * 0.30);
        ctx.bezierCurveTo(-L * 0.55, H * 0.10, -L * 0.34, H * 1.05, -L * 0.02, H * 1.02);
        ctx.bezierCurveTo(L * 0.28, H * 1.00, L * 0.50, H * 0.42, L * 0.48, -H * 0.12);
        break;

      case 'jelly': {
        ctx.moveTo(-L * 0.46, H * 0.08);
        ctx.bezierCurveTo(-L * 0.48, -H * 1.25, L * 0.48, -H * 1.25, L * 0.46, H * 0.08);
        const lobes = 5;
        for (let i = lobes; i >= 0; i--) {
          const k = i / lobes;
          const x = U.lerp(L * 0.46, -L * 0.46, 1 - k);
          ctx.quadraticCurveTo(x + L * 0.09, H * (0.42 + Math.sin(sway + i) * 0.12), x, H * 0.06);
        }
        break;
      }

      case 'ray': {
        // seen from above: broad wings, a pair of cephalic lobes at the head,
        // and a narrow body tapering to a whip
        const spanX = L * 0.42, spanY = H * 3.0;
        ctx.moveTo(spanX, -H * 0.30);
        ctx.quadraticCurveTo(L * 0.52, -H * 0.10, spanX + L * 0.02, H * 0.06);
        ctx.quadraticCurveTo(L * 0.50, H * 0.24, spanX - L * 0.02, H * 0.34);
        ctx.bezierCurveTo(L * 0.26, spanY * 0.34, L * 0.00, spanY * 0.94, -L * 0.34, spanY);
        ctx.bezierCurveTo(-L * 0.24, spanY * 0.40, -L * 0.30, spanY * 0.10, -L * 0.50, H * 0.06);
        ctx.lineTo(-L * 0.50, -H * 0.06);
        ctx.bezierCurveTo(-L * 0.30, -spanY * 0.10, -L * 0.24, -spanY * 0.40, -L * 0.34, -spanY);
        ctx.bezierCurveTo(L * 0.00, -spanY * 0.94, L * 0.26, -spanY * 0.34, spanX, -H * 0.30);
        break;
      }

      case 'shard':
        ctx.moveTo(L * 0.52, 0);
        ctx.lineTo(L * 0.06, -H);
        ctx.lineTo(-L * 0.30, -H * 0.52);
        ctx.lineTo(-L * 0.52, -H * 0.86);
        ctx.lineTo(-L * 0.40, 0);
        ctx.lineTo(-L * 0.52, H * 0.86);
        ctx.lineTo(-L * 0.30, H * 0.52);
        ctx.lineTo(L * 0.06, H);
        break;

      case 'crustacean':
        // carapace: wider than long, slightly squared at the front
        ctx.moveTo(L * 0.34, -H * 0.35);
        ctx.bezierCurveTo(L * 0.46, -H * 0.95, -L * 0.10, -H * 1.20, -L * 0.36, -H * 0.72);
        ctx.bezierCurveTo(-L * 0.50, -H * 0.34, -L * 0.50, H * 0.34, -L * 0.36, H * 0.72);
        ctx.bezierCurveTo(-L * 0.10, H * 1.20, L * 0.46, H * 0.95, L * 0.34, H * 0.35);
        ctx.quadraticCurveTo(L * 0.40, 0, L * 0.34, -H * 0.35);
        break;

      case 'whale':
        // blunt head, long tapering body, deeply forked flukes
        ctx.moveTo(L * 0.50, H * 0.05);
        ctx.bezierCurveTo(L * 0.50, -H * 0.85, L * 0.20, -H * 1.05, -L * 0.05, -H * 0.85);
        ctx.bezierCurveTo(-L * 0.22, -H * 0.70, -L * 0.30, -H * 0.42, -L * 0.36, -H * 0.20);
        ctx.lineTo(-L * 0.60, -H * 1.45);
        ctx.quadraticCurveTo(-L * 0.44, -H * 0.22, -L * 0.42, 0);
        ctx.quadraticCurveTo(-L * 0.44, H * 0.22, -L * 0.60, H * 1.45);
        ctx.lineTo(-L * 0.36, H * 0.20);
        ctx.bezierCurveTo(-L * 0.24, H * 0.62, L * 0.14, H * 1.00, L * 0.44, H * 0.72);
        ctx.quadraticCurveTo(L * 0.53, H * 0.42, L * 0.50, H * 0.05);
        break;

      case 'anomaly': {
        const pts = 11;
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * TAU;
          const wob = 0.62 + rnd() * 0.62;
          const x = Math.cos(a) * L * 0.50 * wob;
          const y = Math.sin(a) * H * wob;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        break;
      }

      case 'fractal': {
        const pts = 9;
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * TAU;
          const r = (i % 2 === 0) ? 1 : 0.42;
          if (i === 0) ctx.moveTo(Math.cos(a) * L * 0.5 * r, Math.sin(a) * H * r);
          else ctx.lineTo(Math.cos(a) * L * 0.5 * r, Math.sin(a) * H * r);
        }
        break;
      }

      /* ------------------------------------------------ the wrong shapes
         Everything below is deliberately not a fish. They still have to close
         a path, because the whole pipeline fills, clips and strokes it. */

      case 'hole': {
        // fish-shaped absence — tail included, or it reads as a lens rather
        // than as the outline of something that is not there
        ctx.moveTo(L * 0.50, 0);
        ctx.bezierCurveTo(L * 0.30, -H * 1.12, -L * 0.06, -H * 1.00, -L * 0.26, -H * 0.34);
        ctx.lineTo(-L * 0.50, -H * 1.05);
        ctx.quadraticCurveTo(-L * 0.40, 0, -L * 0.50, H * 1.05);
        ctx.lineTo(-L * 0.26, H * 0.34);
        ctx.bezierCurveTo(-L * 0.06, H * 1.00, L * 0.30, H * 1.12, L * 0.50, 0);
        break;
      }

      case 'swarm': {
        // one fish made of many, so the outline is lumpy with backs and tails
        const n = 13;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const lump = 0.80 + 0.34 * Math.abs(Math.sin(a * 4.5 + rnd() * 0.7));
          const x = Math.cos(a) * L * 0.48 * lump;
          const y = Math.sin(a) * H * lump;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        break;
      }

      case 'mirror': {
        // two front halves, joined where the tails should be
        ctx.moveTo(L * 0.50, 0);
        ctx.bezierCurveTo(L * 0.34, -H * 1.05, L * 0.06, -H * 0.92, 0, -H * 0.30);
        ctx.bezierCurveTo(-L * 0.06, -H * 0.92, -L * 0.34, -H * 1.05, -L * 0.50, 0);
        ctx.bezierCurveTo(-L * 0.34, H * 1.05, -L * 0.06, H * 0.92, 0, H * 0.30);
        ctx.bezierCurveTo(L * 0.06, H * 0.92, L * 0.34, H * 1.05, L * 0.50, 0);
        break;
      }

      case 'spiral': {
        // a body that goes round and does not come back
        const turns = 2.6, steps = 46;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const a = u * TAU * turns;
          const r = (1 - u * 0.86);
          ctx.lineTo(Math.cos(a) * L * 0.46 * r, Math.sin(a) * H * 1.05 * r);
        }
        for (let i = steps; i >= 0; i--) {
          const u = i / steps;
          const a = u * TAU * turns;
          const r = (1 - u * 0.86) * 0.72;
          ctx.lineTo(Math.cos(a) * L * 0.46 * r, Math.sin(a) * H * 1.05 * r);
        }
        break;
      }

      case 'tally': {
        // counting marks, bundled in fives. It is a number, on a hook.
        const groups = 4, mw = L * 0.020, gap = L * 0.042;
        for (let gI = 0; gI < groups; gI++) {
          const gx = -L * 0.42 + gI * L * 0.238;
          for (let m = 0; m < 4; m++) {
            const x = gx + m * gap;
            ctx.moveTo(x, -H);
            ctx.lineTo(x + mw, -H);
            ctx.lineTo(x + mw, H);
            ctx.lineTo(x, H);
            ctx.closePath();
          }
          // the fifth, struck clean across the other four
          const x0 = gx - mw * 0.8, x1 = gx + gap * 3 + mw * 1.8;
          ctx.moveTo(x0, H * 0.80);
          ctx.lineTo(x1, -H * 0.80);
          ctx.lineTo(x1, -H * 0.80 + mw * 1.5);
          ctx.lineTo(x0, H * 0.80 + mw * 1.5);
          ctx.closePath();
        }
        break;
      }

      case 'unfinished': {
        // the render stopped part way and nobody came back to it
        ctx.moveTo(L * 0.48, 0);
        ctx.bezierCurveTo(L * 0.30, -H * 1.05, -L * 0.10, -H * 0.98, -L * 0.30, -H * 0.30);
        ctx.lineTo(-L * 0.30, -H * 0.06);
        ctx.lineTo(-L * 0.02, -H * 0.06);
        ctx.lineTo(-L * 0.02, H * 0.34);
        ctx.lineTo(L * 0.18, H * 0.34);
        ctx.lineTo(L * 0.18, H * 0.72);
        ctx.bezierCurveTo(L * 0.30, H * 0.86, L * 0.40, H * 0.44, L * 0.48, 0);
        break;
      }

      case 'folded': {
        // creased flat and folded twice, like a letter that swims
        ctx.moveTo(-L * 0.46, -H * 0.62);
        ctx.lineTo(L * 0.10, -H * 0.98);
        ctx.lineTo(L * 0.48, -H * 0.18);
        ctx.lineTo(L * 0.16, H * 0.36);
        ctx.lineTo(L * 0.44, H * 0.86);
        ctx.lineTo(-L * 0.20, H * 0.98);
        ctx.lineTo(-L * 0.48, H * 0.20);
        ctx.closePath();
        break;
      }

      case 'column': {
        // taller than it is long, and it does not appear to end downward
        ctx.moveTo(-L * 0.18, -H * 1.02);
        ctx.quadraticCurveTo(0, -H * 1.20, L * 0.18, -H * 1.02);
        ctx.lineTo(L * 0.22, H * 0.86);
        ctx.quadraticCurveTo(L * 0.24, H * 1.10, L * 0.10, H * 1.06);
        ctx.lineTo(-L * 0.10, H * 1.06);
        ctx.quadraticCurveTo(-L * 0.24, H * 1.10, -L * 0.22, H * 0.86);
        ctx.closePath();
        break;
      }

      case 'object':
        // objects are not silhouetted from a path; this is only a safety net
        ctx.rect(-L * 0.40, -H * 0.80, L * 0.80, H * 1.60);
        break;

      default: /* torpedo */
        ctx.moveTo(L * 0.52, 0);
        ctx.bezierCurveTo(L * 0.34, -H * 1.02, -L * 0.14, -H * 1.00, -L * 0.36, -H * 0.30);
        ctx.quadraticCurveTo(-L * 0.42, 0, -L * 0.36, H * 0.30);
        ctx.bezierCurveTo(-L * 0.14, H * 1.00, L * 0.34, H * 1.02, L * 0.52, 0);
        break;
    }
    ctx.closePath();
    return H;
  }

  /* --------------------------------------------------------------- fins */

  /* Fins are membrane plus rays: fill the shape, then stroke thin supports
     radiating from where the fin meets the body. That single detail is most of
     what separates a fin from a triangle. */
  /* Set by drawFins so a fin can be painted as a membrane rather than a flat
     shape: thick and opaque where it leaves the body, thinning to translucent
     at the trailing edge. */
  let FIN = null;

  function paintFin(ctx, path, col, alpha, rays) {
    ctx.globalAlpha = alpha;
    if (FIN && rays && rays.len > 0) {
      const g = ctx.createRadialGradient(rays.x, rays.y, 0, rays.x, rays.y, rays.len * 1.02);
      g.addColorStop(0, U.rgbToCss(U.shade(FIN.base, -0.30)));
      g.addColorStop(0.45, U.rgbToCss(FIN.base));
      g.addColorStop(1, U.rgbToCss(U.mixRgb(FIN.base, FIN.tip, 0.42), 0.62));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = col;
    }
    ctx.fill(path);
    if (rays && rays.n > 1) {
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = rays.col;
      ctx.globalAlpha = alpha * 0.72;
      ctx.lineWidth = rays.w;
      ctx.lineCap = 'round';
      for (let i = 0; i < rays.n; i++) {
        const t = i / (rays.n - 1);
        const a = rays.a0 + (rays.a1 - rays.a0) * t;
        ctx.beginPath();
        ctx.moveTo(rays.x, rays.y);
        ctx.lineTo(rays.x + Math.cos(a) * rays.len, rays.y + Math.sin(a) * rays.len);
        ctx.stroke();
      }
      ctx.restore();
    }
    // the margin, where a fin catches the light along its trailing edge
    if (FIN) {
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(FIN.tip, [255, 255, 255], 0.35));
      ctx.lineWidth = FIN.edge;
      ctx.stroke(path);
    }
    ctx.globalAlpha = alpha;
  }

  function drawFins(ctx, style, L, H, sway, col, alpha, accent, baseRgb, tipRgb) {
    if (style === 'none') return;
    FIN = baseRgb ? { base: baseRgb, tip: tipRgb || baseRgb,
                      edge: Math.max(0.5, L * 0.0045) } : null;
    const rayCol = accent || col;
    const rw = Math.max(0.6, L * 0.006);
    const tailX = -L * 0.36;

    switch (style) {
      case 'legs': {
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, L * 0.020);
        for (let side = -1; side <= 1; side += 2) {
          for (let j = 0; j < 4; j++) {
            const x = L * (0.14 - j * 0.15);
            const reach = H * (0.95 + j * 0.12);
            ctx.beginPath();
            ctx.moveTo(x, side * H * 0.62);
            ctx.quadraticCurveTo(x - L * 0.10, side * reach * 0.9,
                                 x - L * 0.22, side * reach + sway * 2);
            ctx.stroke();
          }
        }
        // claws: an upper arm, a forearm, then a two-part pincer
        for (let side = -1; side <= 1; side += 2) {
          const ex = L * 0.30, ey = side * H * 1.05;      // elbow
          const cx = L * 0.56, cy = side * H * 0.86;      // claw base
          ctx.lineWidth = Math.max(1.4, L * 0.030);
          ctx.beginPath();
          ctx.moveTo(L * 0.20, side * H * 0.55);
          ctx.lineTo(ex, ey);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(side * -0.5);
          ctx.beginPath();
          ctx.ellipse(0, 0, L * 0.085, H * 0.38, 0, 0, TAU);
          ctx.fill();
          ctx.lineWidth = Math.max(1.1, L * 0.020);
          ctx.beginPath();
          ctx.moveTo(L * 0.05, -H * 0.14);
          ctx.lineTo(L * 0.17, -H * 0.30);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(L * 0.05, H * 0.10);
          ctx.lineTo(L * 0.17, H * 0.02);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case 'wing': {
        for (let w = 0; w < 2; w++) {
          const dir = w ? 1 : -1;
          const reach = w ? 1 : 0.55;
          const p = new Path2D();
          p.moveTo(L * 0.18, dir * H * 0.30);
          p.quadraticCurveTo(L * 0.02, dir * H * (1.9 * reach) + sway * 5,
                             -L * 0.30, dir * H * (2.3 * reach) + sway * 7);
          p.quadraticCurveTo(-L * 0.14, dir * H * (1.0 * reach), -L * 0.10, dir * H * 0.28);
          p.closePath();
          paintFin(ctx, p, col, alpha * (w ? 1 : 0.55), {
            col: rayCol, w: rw, n: 6, x: L * 0.12, y: dir * H * 0.32, len: L * 0.62,
            a0: dir > 0 ? 0.5 : -0.5, a1: dir > 0 ? 2.5 : -2.5
          });
        }
        const d = new Path2D();
        d.moveTo(L * 0.10, -H * 0.78);
        d.quadraticCurveTo(-L * 0.04, -H * 1.7, -L * 0.24, -H * 0.70);
        d.closePath();
        paintFin(ctx, d, col, alpha, { col: rayCol, w: rw, n: 5, x: -L * 0.06,
          y: -H * 0.70, len: H * 1.2, a0: -2.2, a1: -1.0 });
        break;
      }

      case 'veil': {
        const t = new Path2D();
        t.moveTo(tailX, -H * 0.28);
        t.bezierCurveTo(-L * 0.72, -H * 1.5 + sway * 9, -L * 0.95, -H * 0.5, -L * 0.78, H * 0.15 + sway * 5);
        t.bezierCurveTo(-L * 0.95, H * 0.9, -L * 0.66, H * 1.6, tailX, H * 0.28);
        t.closePath();
        paintFin(ctx, t, col, alpha * 0.82, { col: rayCol, w: rw, n: 9,
          x: tailX, y: 0, len: L * 0.62, a0: -2.55, a1: 2.55 });
        const d = new Path2D();
        d.moveTo(L * 0.14, -H * 0.72);
        d.quadraticCurveTo(-L * 0.05, -H * 2.0 + sway * 7, -L * 0.30, -H * 0.7);
        d.closePath();
        paintFin(ctx, d, col, alpha * 0.82, { col: rayCol, w: rw, n: 7,
          x: -L * 0.08, y: -H * 0.70, len: H * 1.5, a0: -2.4, a1: -0.9 });
        break;
      }

      case 'long': {
        const t = new Path2D();
        t.moveTo(tailX, -H * 0.22);
        t.lineTo(-L * 0.88, -H * 1.25 + sway * 8);
        t.lineTo(-L * 0.66, 0);
        t.lineTo(-L * 0.88, H * 1.25 + sway * 8);
        t.lineTo(tailX, H * 0.22);
        t.closePath();
        paintFin(ctx, t, col, alpha, { col: rayCol, w: rw, n: 9,
          x: tailX, y: 0, len: L * 0.60, a0: -2.5, a1: 2.5 });
        const d = new Path2D();
        d.moveTo(L * 0.20, -H * 0.70);
        d.quadraticCurveTo(L * 0.02, -H * 1.85, -L * 0.28, -H * 0.66);
        d.closePath();
        paintFin(ctx, d, col, alpha, { col: rayCol, w: rw, n: 7,
          x: -L * 0.04, y: -H * 0.66, len: H * 1.4, a0: -2.3, a1: -0.85 });
        break;
      }

      case 'spiky': {
        const t = new Path2D();
        t.moveTo(tailX, -H * 0.24);
        t.lineTo(-L * 0.70, -H * 1.05 + sway * 6);
        t.lineTo(-L * 0.56, -H * 0.20);
        t.lineTo(-L * 0.72, H * 0.25);
        t.lineTo(-L * 0.62, H * 1.05 + sway * 6);
        t.lineTo(tailX, H * 0.24);
        t.closePath();
        paintFin(ctx, t, col, alpha, { col: rayCol, w: rw, n: 7,
          x: tailX, y: 0, len: L * 0.44, a0: -2.4, a1: 2.4 });
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) {
          const x = L * (0.24 - i * 0.13);
          ctx.beginPath();
          ctx.moveTo(x, -H * 0.75);
          ctx.lineTo(x - L * 0.05, -H * (1.35 - i * 0.09));
          ctx.lineTo(x - L * 0.10, -H * 0.72);
          ctx.closePath(); ctx.fill();
        }
        break;
      }

      case 'frill': {
        const d = new Path2D();
        d.moveTo(L * 0.30, -H * 0.62);
        for (let i = 0; i <= 9; i++) {
          const k = i / 9;
          const x = U.lerp(L * 0.30, -L * 0.42, k);
          d.lineTo(x, -H * (0.55 + Math.abs(Math.sin(k * 6 + sway)) * 0.95));
        }
        d.lineTo(-L * 0.42, -H * 0.4);
        d.closePath();
        paintFin(ctx, d, col, alpha, { col: rayCol, w: rw, n: 10,
          x: -L * 0.06, y: -H * 0.5, len: H * 1.5, a0: -2.7, a1: -0.5 });
        const t = new Path2D();
        t.moveTo(tailX, -H * 0.24);
        t.quadraticCurveTo(-L * 0.74, 0 + sway * 8, tailX, H * 0.24);
        t.closePath();
        paintFin(ctx, t, col, alpha, null);
        break;
      }

      default: { /* normal */
        const t = new Path2D();
        t.moveTo(tailX, -H * 0.24);
        t.lineTo(-L * 0.66, -H * 0.92 + sway * 7);
        t.lineTo(-L * 0.58, 0);
        t.lineTo(-L * 0.66, H * 0.92 + sway * 7);
        t.lineTo(tailX, H * 0.24);
        t.closePath();
        paintFin(ctx, t, col, alpha, { col: rayCol, w: rw, n: 8,
          x: tailX, y: 0, len: L * 0.36, a0: -2.4, a1: 2.4 });
        const d = new Path2D();
        d.moveTo(L * 0.16, -H * 0.72);
        d.quadraticCurveTo(-L * 0.02, -H * 1.5, -L * 0.24, -H * 0.68);
        d.closePath();
        paintFin(ctx, d, col, alpha, { col: rayCol, w: rw, n: 6,
          x: -L * 0.04, y: -H * 0.68, len: H * 1.1, a0: -2.3, a1: -0.9 });
        const an = new Path2D();
        an.moveTo(L * 0.10, H * 0.62);
        an.quadraticCurveTo(L * 0.00, H * 1.25, -L * 0.16, H * 0.60);
        an.closePath();
        paintFin(ctx, an, col, alpha, { col: rayCol, w: rw, n: 5,
          x: -L * 0.03, y: H * 0.60, len: H * 0.9, a0: 0.9, a1: 2.3 });
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- extras */

  function drawExtras(ctx, list, L, H, sway, art, rnd, tm) {
    const acc = art.c3;
    const accRgb = art.r3 || U.hexToRgb(art.c3);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      ctx.save();
      switch (e) {
        case 'tentacles': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.6; ctx.lineCap = 'round';
          const n = 6;
          for (let j = 0; j < n; j++) {
            const x = U.lerp(-L * 0.38, L * 0.38, j / (n - 1));
            const len = H * (1.4 + rnd() * 1.9);
            ctx.lineWidth = Math.max(1, L * 0.014);
            ctx.beginPath();
            ctx.moveTo(x, H * 0.55);
            ctx.quadraticCurveTo(x + Math.sin(sway * 1.4 + j) * L * 0.10, H * 0.55 + len * 0.55,
                                 x + Math.sin(sway * 1.9 + j * 1.7) * L * 0.16, H * 0.55 + len);
            ctx.stroke();
          }
          break;
        }
        case 'threads': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.34; ctx.lineWidth = Math.max(0.7, L * 0.006);
          for (let j = 0; j < 7; j++) {
            const a0 = rnd() * TAU;
            const r0 = H * (0.5 + rnd() * 0.5);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a0) * L * 0.3, Math.sin(a0) * r0);
            ctx.quadraticCurveTo(Math.cos(a0) * L * 0.6, Math.sin(a0) * r0 * 2.1 + Math.sin(sway + j) * 5,
                                 Math.cos(a0) * L * 0.5 - L * 0.3, Math.sin(a0) * r0 * 2.6);
            ctx.stroke();
          }
          break;
        }
        case 'halo': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.5;
          ctx.lineWidth = Math.max(1, L * 0.012);
          ctx.beginPath();
          ctx.ellipse(L * 0.06, 0, L * 0.62, H * 1.5, Math.sin(tm * 0.3) * 0.15, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.ellipse(L * 0.06, 0, L * 0.74, H * 1.8, -Math.sin(tm * 0.24) * 0.2, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'rings': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.42;
          ctx.lineWidth = Math.max(1, L * 0.010);
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, L * (0.34 + j * 0.14), H * (0.30 + j * 0.12),
                        tm * (0.2 + j * 0.1), 0, TAU);
            ctx.stroke();
          }
          break;
        }
        case 'crystals': {
          ctx.fillStyle = acc; ctx.globalAlpha = 0.72;
          for (let j = 0; j < 5; j++) {
            const x = U.lerp(-L * 0.3, L * 0.3, rnd());
            const y = (rnd() - 0.5) * H * 1.1;
            const s = L * (0.05 + rnd() * 0.07);
            ctx.beginPath();
            ctx.moveTo(x, y - s * 1.7); ctx.lineTo(x + s * 0.6, y);
            ctx.lineTo(x, y + s * 1.2); ctx.lineTo(x - s * 0.6, y);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'spine': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.75;
          ctx.lineWidth = Math.max(1, L * 0.011);
          for (let j = 0; j < 8; j++) {
            const k = j / 8;
            const x = U.lerp(L * 0.30, -L * 0.30, k);
            ctx.beginPath();
            ctx.moveTo(x, -H * 0.68);
            ctx.lineTo(x - L * 0.02, -H * (1.05 + Math.sin(k * 4) * 0.25));
            ctx.stroke();
          }
          break;
        }
        case 'teeth': {
          // an open jaw at the head: dark inside, teeth along both edges
          const mx = L * 0.50, back = L * 0.14;
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = 'rgba(6,4,11,0.7)';
          ctx.beginPath();
          ctx.moveTo(mx, -H * 0.20);
          ctx.quadraticCurveTo(back + L * 0.08, -H * 0.10, back, H * 0.04);
          ctx.quadraticCurveTo(back + L * 0.08, H * 0.26, mx, H * 0.40);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#f4efe2';
          const nT = 8;
          for (let j = 0; j < nT; j++) {
            const t = j / (nT - 1);
            const xt = U.lerp(mx - L * 0.03, back + L * 0.04, t);
            const yTop = U.lerp(-H * 0.18, H * 0.02, t);
            const yBot = U.lerp(H * 0.37, H * 0.05, t);
            const sz = L * 0.015 * (1 - t * 0.45);
            ctx.beginPath();
            ctx.moveTo(xt - sz, yTop); ctx.lineTo(xt + sz, yTop);
            ctx.lineTo(xt, yTop + sz * 2.4); ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(xt - sz, yBot); ctx.lineTo(xt + sz, yBot);
            ctx.lineTo(xt, yBot - sz * 2.4); ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'lantern': {
          const lx = L * 0.66, ly = -H * 1.15;
          ctx.strokeStyle = art.c2; ctx.globalAlpha = 0.85;
          ctx.lineWidth = Math.max(1, L * 0.012);
          ctx.beginPath();
          ctx.moveTo(L * 0.30, -H * 0.62);
          ctx.quadraticCurveTo(L * 0.62, -H * 1.5, lx, ly);
          ctx.stroke();
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, L * 0.30);
          g.addColorStop(0, acc);
          g.addColorStop(0.3, U.rgbToCss(accRgb, 0.5));
          g.addColorStop(1, U.rgbToCss(accRgb, 0));
          ctx.globalAlpha = 0.9; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(lx, ly, L * 0.30, 0, TAU); ctx.fill();
          ctx.fillStyle = acc; ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(lx, ly, L * 0.045, 0, TAU); ctx.fill();
          break;
        }
        case 'horns': {
          ctx.fillStyle = acc; ctx.globalAlpha = 0.9;
          for (let j = -1; j <= 1; j += 2) {
            ctx.beginPath();
            ctx.moveTo(L * 0.18, -H * 0.7);
            ctx.quadraticCurveTo(L * (0.30 + j * 0.06), -H * 1.9, L * (0.40 + j * 0.10), -H * 2.1);
            ctx.quadraticCurveTo(L * 0.30, -H * 1.5, L * 0.26, -H * 0.68);
            ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'antenna': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.8;
          ctx.lineWidth = Math.max(0.8, L * 0.008);
          for (let j = -1; j <= 1; j += 2) {
            ctx.beginPath();
            ctx.moveTo(L * 0.40, H * 0.10 * j);
            ctx.quadraticCurveTo(L * 0.62, H * 0.5 * j, L * 0.78, H * 0.28 * j + Math.sin(sway + j) * 4);
            ctx.stroke();
          }
          break;
        }
        case 'runes': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(0.8, L * 0.008);
          for (let j = 0; j < 5; j++) {
            const x = U.lerp(-L * 0.28, L * 0.30, rnd());
            const y = (rnd() - 0.5) * H * 1.0;
            const s = L * 0.05;
            ctx.beginPath();
            ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s * 0.3);
            ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.lineTo(x + s * 0.7, y + s);
            ctx.stroke();
          }
          break;
        }
        case 'chains': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.5;
          ctx.lineWidth = Math.max(1, L * 0.013);
          for (let j = 0; j < 3; j++) {
            const y0 = (j - 1) * H * 0.5;
            ctx.beginPath();
            for (let k = 0; k <= 8; k++) {
              const x = U.lerp(L * 0.40, -L * 0.46, k / 8);
              ctx.lineTo(x, y0 + Math.sin(k * 1.3 + sway + j) * H * 0.25);
            }
            ctx.stroke();
          }
          break;
        }
        case 'bubbles': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.4;
          ctx.lineWidth = Math.max(0.7, L * 0.006);
          for (let j = 0; j < 6; j++) {
            const x = L * 0.42 + rnd() * L * 0.35;
            const y = -H * (0.4 + rnd() * 1.6) - (tm * 12 % (H * 2));
            ctx.beginPath(); ctx.arc(x, y, L * (0.012 + rnd() * 0.022), 0, TAU); ctx.stroke();
          }
          break;
        }
        case 'fracture': {
          ctx.strokeStyle = acc; ctx.globalAlpha = 0.7;
          ctx.lineWidth = Math.max(0.9, L * 0.009);
          for (let j = 0; j < 4; j++) {
            let x = (rnd() - 0.5) * L * 0.7, y = (rnd() - 0.5) * H * 1.2;
            ctx.beginPath(); ctx.moveTo(x, y);
            for (let k = 0; k < 4; k++) {
              x += (rnd() - 0.5) * L * 0.28; y += (rnd() - 0.5) * H * 0.7;
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          break;
        }
        case 'stars': {
          ctx.fillStyle = acc; ctx.globalAlpha = 0.85;
          for (let j = 0; j < 9; j++) {
            const x = (rnd() - 0.5) * L * 0.80;
            const y = (rnd() - 0.5) * H * 1.5;
            const s = L * (0.008 + rnd() * 0.018);
            ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'wings': {
          ctx.fillStyle = acc; ctx.globalAlpha = 0.30;
          const f = Math.sin(tm * 3) * 0.25 + 1;
          for (let j = -1; j <= 1; j += 2) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-L * 0.2, j * H * 2.6 * f, L * 0.34, j * H * 1.9 * f);
            ctx.quadraticCurveTo(L * 0.2, j * H * 0.8, 0, 0);
            ctx.fill();
          }
          break;
        }
        case 'mask': {
          ctx.fillStyle = acc; ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.moveTo(L * 0.46, -H * 0.5);
          ctx.lineTo(L * 0.14, -H * 0.62);
          ctx.lineTo(L * 0.08, H * 0.42);
          ctx.lineTo(L * 0.44, H * 0.32);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#000'; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.ellipse(L * 0.32, -H * 0.14, L * 0.05, H * 0.10, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(L * 0.16, -H * 0.10, L * 0.04, H * 0.09, 0, 0, TAU); ctx.fill();
          break;
        }
        case 'eyes_extra': {
          ctx.fillStyle = '#f6f2e6'; ctx.globalAlpha = 0.92;
          for (let j = 0; j < 5; j++) {
            const x = (rnd() - 0.5) * L * 0.65;
            const y = (rnd() - 0.5) * H * 1.15;
            const s = L * (0.020 + rnd() * 0.020);
            ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
            ctx.fillStyle = '#0a0810';
            ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU); ctx.fill();
            ctx.fillStyle = '#f6f2e6';
          }
          break;
        }

        /* -------------------------------------------- the wrong details
           These are for the far end of the catalogue, where a thing on the
           hook is not really an animal any more. */

        case 'static': {
          // a band of interference across the middle of it
          const rows = 9;
          for (let j = 0; j < rows; j++) {
            const y = -H * 0.7 + (j / rows) * H * 1.4;
            const w = L * (0.20 + rnd() * 0.70);
            const x = -L * 0.42 + rnd() * (L * 0.84 - w);
            ctx.globalAlpha = 0.20 + rnd() * 0.55;
            ctx.fillStyle = j % 2 ? '#66ffe0' : '#ff2d55';
            ctx.fillRect(x, y, w, Math.max(1, H * 0.055));
          }
          break;
        }

        case 'duplicate': {
          // it is also slightly to the left, and slightly earlier
          ctx.globalAlpha = 0.30;
          for (let j = 1; j <= 2; j++) {
            const off = j * L * 0.045;
            ctx.fillStyle = j === 1 ? '#ff2d55' : '#66ffe0';
            ctx.save();
            ctx.translate(-off, off * 0.35);
            bodyPath(ctx, 'torpedo', L * 0.92, 0, VF.rng.make(0x51 + j));
            ctx.fill();
            ctx.restore();
          }
          break;
        }

        case 'eyes_many': {
          // not five. a field of them, and they are not arranged.
          ctx.globalAlpha = 0.9;
          for (let j = 0; j < 22; j++) {
            const x = (rnd() - 0.5) * L * 0.82;
            const y = (rnd() - 0.5) * H * 1.5;
            const sz = L * (0.008 + rnd() * 0.020);
            ctx.fillStyle = '#f6f2e6';
            ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
            ctx.fillStyle = '#0a0810';
            ctx.beginPath();
            ctx.arc(x + sz * 0.2 * Math.sin(tm * 0.7 + j), y, sz * 0.52, 0, TAU);
            ctx.fill();
          }
          break;
        }

        case 'barcode': {
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = '#0a0810';
          let x = -L * 0.34;
          while (x < L * 0.34) {
            const w = L * (0.006 + rnd() * 0.016);
            ctx.fillRect(x, -H * 0.55, w, H * 1.1);
            x += w + L * (0.008 + rnd() * 0.014);
          }
          break;
        }

        case 'wrongscale': {
          // there is a smaller one inside it, at the wrong scale entirely
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = acc;
          ctx.save();
          ctx.scale(0.30, 0.30);
          bodyPath(ctx, 'torpedo', L, 0, VF.rng.make(0x9c));
          ctx.fill();
          ctx.restore();
          break;
        }

        case 'cursor': {
          // caught in it, and still blinking
          const cx = L * 0.02, cy = -H * 0.42;
          ctx.globalAlpha = 0.85 + 0.15 * Math.sin(tm * 6);
          ctx.fillStyle = '#f6f2e6';
          ctx.strokeStyle = '#0a0810';
          ctx.lineWidth = Math.max(0.6, L * 0.005);
          const u = L * 0.095;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy + u * 1.5);
          ctx.lineTo(cx + u * 0.38, cy + u * 1.1);
          ctx.lineTo(cx + u * 0.62, cy + u * 1.7);
          ctx.lineTo(cx + u * 0.86, cy + u * 1.56);
          ctx.lineTo(cx + u * 0.62, cy + u * 0.97);
          ctx.lineTo(cx + u * 1.05, cy + u * 0.90);
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          break;
        }

        case 'stitches': {
          // it was assembled, and whoever did it was in a hurry
          ctx.strokeStyle = acc;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = Math.max(0.7, L * 0.006);
          ctx.lineCap = 'round';
          for (let j = 0; j < 14; j++) {
            const u = j / 13;
            const x = U.lerp(-L * 0.30, L * 0.30, u);
            const y = Math.sin(u * 3.1) * H * 0.30;
            ctx.beginPath();
            ctx.moveTo(x - L * 0.012, y - H * 0.10);
            ctx.lineTo(x + L * 0.012, y + H * 0.10);
            ctx.stroke();
          }
          break;
        }

        case 'roots': {
          // it has taken hold of something and is unwilling to discuss it
          ctx.strokeStyle = acc;
          ctx.globalAlpha = 0.55;
          ctx.lineCap = 'round';
          for (let j = 0; j < 7; j++) {
            const x0 = U.lerp(-L * 0.30, L * 0.26, j / 6);
            ctx.lineWidth = Math.max(0.6, L * 0.009 * (1 - j / 9));
            ctx.beginPath();
            ctx.moveTo(x0, H * 0.55);
            let x = x0, y = H * 0.55;
            for (let k2 = 0; k2 < 4; k2++) {
              x += (rnd() - 0.5) * L * 0.10;
              y += H * (0.22 + rnd() * 0.20);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          break;
        }

        case 'crown': {
          ctx.fillStyle = acc;
          ctx.globalAlpha = 0.9;
          const cw = L * 0.22, ch = H * 0.55, cx2 = L * 0.16, cy2 = -H * 0.95;
          ctx.beginPath();
          ctx.moveTo(cx2 - cw * 0.5, cy2);
          for (let j = 0; j < 4; j++) {
            const x = cx2 - cw * 0.5 + (j / 3) * cw;
            ctx.lineTo(x, cy2 - ch * (j % 2 ? 0.55 : 1));
            ctx.lineTo(x + cw / 6, cy2 - ch * 0.2);
          }
          ctx.lineTo(cx2 + cw * 0.5, cy2);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'countdown': {
          // a number over it, and the number is going down
          const n = Math.max(0, 9 - Math.floor(tm * 0.9) % 10);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = '#66ffe0';
          ctx.font = Math.round(H * 1.1) + 'px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n), 0, 0);
          break;
        }
      }
      ctx.restore();
    }
  }

  /* --------------------------------------------------- surface detail
     Everything here paints inside the already-clipped body path. */

  /* Rows of overlapping arcs. Reads as scales without costing a texture. */
  function scaleTexture(ctx, L, H, col, rnd, dense) {
    const step = L * (dense ? 0.042 : 0.058);
    const r = step * 0.85;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.4, L * 0.0035);
    ctx.globalAlpha = 0.13;
    let row = 0;
    for (let y = -H * 1.05; y < H * 1.05; y += step * 0.68) {
      const off = (row++ % 2) * step * 0.5;
      ctx.beginPath();
      for (let x = -L * 0.55 + off; x < L * 0.55; x += step) {
        ctx.moveTo(x - r * 0.5, y);
        ctx.arc(x, y, r * 0.5, Math.PI * 0.15, Math.PI * 0.85);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* The pale seam along the flank that most fish carry. */
  function lateralLine(ctx, L, H, col) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = Math.max(0.6, L * 0.005);
    ctx.beginPath();
    ctx.moveTo(L * 0.38, -H * 0.12);
    ctx.quadraticCurveTo(0, H * 0.06, -L * 0.42, H * 0.02);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* Operculum: the plate behind the head. */
  function gillPlate(ctx, L, H, col) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.30;
    ctx.lineWidth = Math.max(0.6, L * 0.006);
    ctx.beginPath();
    ctx.moveTo(L * 0.30, -H * 0.70);
    ctx.quadraticCurveTo(L * 0.21, 0, L * 0.30, H * 0.62);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function mouthLine(ctx, L, H, col) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = Math.max(0.6, L * 0.006);
    ctx.beginPath();
    ctx.moveTo(L * 0.52, H * 0.02);
    ctx.quadraticCurveTo(L * 0.44, H * 0.16, L * 0.34, H * 0.12);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* A pectoral fin sitting in front of the flank, which is what gives a fish
     its sense of depth rather than reading as a flat cutout. */
  function pectoral(ctx, L, H, col, accent, sway) {
    const p = new Path2D();
    p.moveTo(L * 0.20, H * 0.12);
    p.quadraticCurveTo(L * 0.10, H * 0.78 + sway * 2, -L * 0.04, H * 0.56);
    p.quadraticCurveTo(L * 0.08, H * 0.34, L * 0.20, H * 0.12);
    p.closePath();
    paintFin(ctx, p, col, 0.38, { col: accent, w: Math.max(0.5, L * 0.004), n: 4,
      x: L * 0.19, y: H * 0.14, len: H * 0.8, a0: 1.3, a1: 2.4 });
    ctx.globalAlpha = 1;
  }

  function eye(ctx, x, y, r, iris) {
    ctx.fillStyle = '#f7f3e8';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = iris;
    ctx.beginPath(); ctx.arc(x + r * 0.14, y, r * 0.74, 0, TAU); ctx.fill();
    ctx.fillStyle = '#08060e';
    ctx.beginPath(); ctx.arc(x + r * 0.20, y, r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(x - r * 0.30, y - r * 0.32, r * 0.24, 0, TAU); ctx.fill();
  }

  /* Bodies built from panels rather than scales — the strange ones. */
  const SCALED = { torpedo: 1, round: 1, eel: 1, serpent: 1, shard: 1, crustacean: 1,
                   whale: 1, mirror: 1, swarm: 1 };

  /* --------------------------------------------------------------- main */

  /* Traits stack: each one tints the body further, the rarest one hardest, so a
     four-trait fish is visibly the sum of its parts. */
  function palette(art, traits) {
    let c1 = U.hexToRgb(art.c1), c2 = U.hexToRgb(art.c2), c3 = U.hexToRgb(art.c3);
    const ids = !traits ? [] : (typeof traits === 'string' ? [traits] : traits);
    let top = null;
    const fx = { glow: 0, shimmer: 0, metal: 0, facet: 0, crust: 0, fracture: 0, darken: 0 };

    for (let i = 0; i < ids.length; i++) {
      const m = VF.traits.get(ids[i]);
      if (!m || !m.color) continue;
      if (!top || m.tier > top.tier) top = m;
      const col = U.hexToRgb(m.color);
      // later, rarer traits pull the body further toward their own colour
      const w = 0.26 + m.tier * 0.055;
      c1 = U.mixRgb(c1, col, w);
      c2 = U.mixRgb(c2, col, w * 0.72);
      c3 = U.mixRgb(c3, U.hexToRgb(m.tint || m.color), w * 0.85);
      for (const k in fx) if (m[k]) fx[k] = Math.max(fx[k], m[k]);
    }
    if (fx.darken) { c1 = U.shade(c1, -fx.darken * 0.45); c2 = U.shade(c2, -fx.darken * 0.5); }

    // both forms: the css strings for anything that just needs a fill, and the
    // raw triples for anything that has to keep mixing. Running the strings
    // back through hexToRgb parses "rgb(…)" as hex and yields black, which is
    // exactly what used to happen to every body on screen.
    return {
      c1: U.rgbToCss(c1), c2: U.rgbToCss(c2), c3: U.rgbToCss(c3),
      r1: c1, r2: c2, r3: c3,
      mut: top, traits: ids, fx: fx
    };
  }

  /* size = half the body length in px. */
  function draw(ctx, fish, size, opts) {
    opts = opts || {};
    const art = fish.art;
    // an object is not a fish and takes none of the fish treatment; nor is a
    // being, and there are exactly two of those
    if (art.body === 'object') return drawObject(ctx, fish, size, opts);
    if (art.body === 'being') return drawBeing(ctx, fish, size, opts);
    const tm = opts.time === undefined ? 0 : opts.time;
    const sway = Math.sin(tm * 2.1) * 0.55;
    const rnd = VF.rng.make(hash(fish.id));
    const L = size * 2;
    const pal = palette(art, opts.traits || opts.mutation);
    const glow = Math.min(1.4, art.glow * (pal.mut ? 1.25 : 1) + pal.fx.glow * 0.7);
    const j = jitter(fish.id);
    // below roughly 22px the fine detail is sub-pixel noise, so skip it
    const detail = opts.detail === undefined ? size >= 22 : opts.detail;

    ctx.save();
    // per-species proportion jitter, so two fish sharing a body type are never
    // the same fish in a different colour
    ctx.scale(j.x, j.y);

    // outer glow
    if (glow > 0.05) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.95);
      g.addColorStop(0, U.rgbToCss(pal.r3, 0.30 * glow));
      g.addColorStop(0.5, U.rgbToCss(pal.r3, 0.10 * glow));
      g.addColorStop(1, U.rgbToCss(pal.r3, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-L, -L, L * 2, L * 2);
    }

    // fins go behind the body
    const probe = VF.rng.make(hash(fish.id));
    const H0 = measureH(art.body, L);
    // a ray's body already is its wings, so a wing fin would only double it up
    if (!(art.body === 'ray' && art.fin === 'wing')) {
      drawFins(ctx, art.fin, L, H0, sway, pal.c2, 0.85, pal.c3, pal.r2, pal.r3);
    }

    // body
    const H = bodyPath(ctx, art.body, L, sway, probe);
    const c1 = pal.r1, c2 = pal.r2, c3 = pal.r3;
    const rnd2 = VF.rng.make(hash(fish.id) ^ 0x1234);

    /* Counter-shading: dark along the back, pale along the belly. This is the
       single thing that stops a fish reading as a flat coloured shape. */
    const bg = ctx.createLinearGradient(0, -H * 1.05, 0, H * 1.05);
    // the belly lightens out of the body colour, never all the way to the
    // accent, or pale species bleach out entirely
    const belly = U.mixRgb(c1, c3, 0.38);
    // pale species need the back pushed toward a common deep, or -46% of an
    // already-white c2 is still white and the counter-shading vanishes
    const back = U.mixRgb(U.shade(c2, -0.28), [11, 15, 24], 0.40);
    bg.addColorStop(0.00, U.rgbToCss(back));
    bg.addColorStop(0.16, U.rgbToCss(U.mixRgb(U.mixRgb(c2, c1, 0.40), back, 0.45)));
    bg.addColorStop(0.34, U.rgbToCss(U.mixRgb(c2, c1, 0.62)));
    bg.addColorStop(0.58, U.rgbToCss(c1));
    bg.addColorStop(0.84, U.rgbToCss(U.mixRgb(c1, belly, 0.7)));
    bg.addColorStop(1.00, U.rgbToCss(belly));
    ctx.fillStyle = bg;
    ctx.fill();

    /* A hole is not a body. It is the shape of one, with nothing in it — so it
       takes none of the modelling, just a flat absence and a lit rim. */
    if (art.body === 'hole') {
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.35),
                                   0.55 + 0.25 * Math.sin(tm * 1.4));
      ctx.lineWidth = Math.max(1, L * 0.010);
      ctx.stroke();
    }

    /* The silhouette gets an edge: a lit rim along the back, shadow through
       the middle, and a little bounce off the belly. Without it the body has
       no boundary and every fish reads as a sticker. */
    const eg = ctx.createLinearGradient(0, -H * 1.02, 0, H * 1.02);
    eg.addColorStop(0.00, U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.45), 0.46));
    eg.addColorStop(0.30, U.rgbToCss(U.shade(back, -0.35), 0.40));
    eg.addColorStop(0.72, U.rgbToCss(U.shade(c2, -0.45), 0.28));
    eg.addColorStop(1.00, U.rgbToCss(U.mixRgb(belly, [255, 255, 255], 0.30), 0.34));
    ctx.strokeStyle = eg;
    ctx.lineWidth = Math.max(0.7, L * 0.0055);
    ctx.stroke();

    ctx.save();
    ctx.clip();

    // scale texture — skipped at small sizes where it would only be noise
    if (detail && SCALED[art.body]) scaleTexture(ctx, L, H, U.rgbToCss(U.shade(c2, -0.5)), rnd, art.body === 'round');

    // specular band along the upper flank
    const sp = ctx.createLinearGradient(0, -H * 0.95, 0, H * 0.10);
    sp.addColorStop(0, U.rgbToCss(c3, 0));
    sp.addColorStop(0.42, U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.35), 0.18));
    sp.addColorStop(1, U.rgbToCss(c3, 0));
    ctx.fillStyle = sp;
    ctx.fillRect(-L, -H * 1.2, L * 2, H * 1.4);

    // and a soft glow from the belly for anything luminous
    if (glow > 0.15) {
      const bl = ctx.createRadialGradient(0, H * 0.6, 0, 0, H * 0.6, L * 0.55);
      bl.addColorStop(0, U.rgbToCss(c3, Math.min(0.34, 0.30 * glow)));
      bl.addColorStop(1, U.rgbToCss(c3, 0));
      ctx.fillStyle = bl;
      ctx.fillRect(-L, -H * 1.2, L * 2, H * 2.4);
    }

    /* trait surface treatments */
    if (pal.fx.metal) {
      const g = ctx.createLinearGradient(-L * 0.4, -H, L * 0.4, H);
      g.addColorStop(0, U.rgbToCss(c3, 0));
      g.addColorStop(0.42, U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.6), 0.42));
      g.addColorStop(0.56, U.rgbToCss(c3, 0.08));
      g.addColorStop(1, U.rgbToCss(c3, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-L, -H * 1.3, L * 2, H * 2.6);
    }
    if (pal.fx.facet) {
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.5), 0.34);
      ctx.lineWidth = Math.max(0.6, L * 0.006);
      for (let i = 0; i < 7; i++) {
        const x0 = -L * 0.5 + (i / 6) * L;
        ctx.beginPath();
        ctx.moveTo(x0, -H * 1.2);
        ctx.lineTo(x0 + L * 0.16, H * 1.2);
        ctx.stroke();
      }
    }
    if (pal.fx.crust) {
      ctx.fillStyle = U.rgbToCss(U.shade(c2, -0.3), 0.5);
      for (let i = 0; i < 14; i++) {
        const x = (rnd2() - 0.5) * L * 0.85;
        const y = (rnd2() - 0.5) * H * 1.7;
        ctx.beginPath();
        ctx.arc(x, y, L * (0.008 + rnd() * 0.017), 0, TAU);
        ctx.fill();
      }
    }
    if (pal.fx.shimmer) {
      const g = ctx.createLinearGradient(-L * 0.5, 0, L * 0.5, 0);
      const hue = (tm * 40) % 360;
      for (let i = 0; i <= 4; i++) {
        const h = (hue + i * 72) % 360;
        g.addColorStop(i / 4, 'hsla(' + h.toFixed(0) + ',85%,72%,0.22)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(-L, -H * 1.3, L * 2, H * 2.6);
    }
    if (pal.fx.fracture) {
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.4), 0.6);
      ctx.lineWidth = Math.max(0.7, L * 0.007);
      for (let i = 0; i < 4; i++) {
        let x = (rnd() - 0.5) * L * 0.6, y = (rnd() - 0.5) * H * 1.2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rnd() - 0.5) * L * 0.24; y += (rnd() - 0.5) * H * 0.7;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    if (detail) {
      lateralLine(ctx, L, H, U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.3)));
      if (SCALED[art.body] && art.body !== 'eel' && art.body !== 'serpent') {
        gillPlate(ctx, L, H, U.rgbToCss(U.shade(c2, -0.55)));
        if ((art.ex || []).indexOf('teeth') < 0) mouthLine(ctx, L, H, U.rgbToCss(U.shade(c2, -0.55)));
      }
    }
    ctx.restore();

    // pectoral fin, in front of the flank
    if (detail && SCALED[art.body] && art.body !== 'eel' && art.body !== 'serpent') {
      pectoral(ctx, L, H, pal.c2, pal.c3, sway);
    }

    // Outline, then a rim light. Without the rim the near-black species read as
    // holes rather than creatures.
    ctx.strokeStyle = U.rgbToCss(U.shade(pal.r2, -0.5), 0.55);
    ctx.lineWidth = Math.max(0.8, L * 0.009);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = U.rgbToCss(pal.r3, 0.42);
    ctx.lineWidth = Math.max(0.7, L * 0.005);
    ctx.stroke();
    ctx.restore();

    drawExtras(ctx, art.ex || [], L, H, sway,
               { c1: pal.c1, c2: pal.c2, c3: pal.c3, r3: pal.r3 }, rnd, tm);

    // eyes, irised in the species accent so they carry its colour
    const n = art.eyes | 0;
    if (n > 0) {
      const er = Math.max(1.2, L * 0.032);
      const iris = U.rgbToCss(U.mixRgb(c3, [40, 30, 60], 0.35));
      for (let i = 0; i < n; i++) {
        const ex = L * (0.32 - (i % 3) * 0.09);
        const ey = -H * 0.24 + Math.floor(i / 3) * H * 0.42;
        eye(ctx, ex, ey, er, iris);
      }
    }

    ctx.restore();
  }

  function measureH(kind, L, obj) { return L * bodyRatio(kind, obj); }

  /* Deterministic proportion jitter keyed to the species id. */
  const jitterCache = Object.create(null);
  function jitter(id) {
    let j = jitterCache[id];
    if (!j) {
      const r = VF.rng.make(hash(id) ^ 0x5bf03635);
      j = jitterCache[id] = { x: 0.90 + r() * 0.24, y: 0.84 + r() * 0.34 };
    }
    return j;
  }

  /* ------------------------------------------------------------- beings
     Filled from three colours so the same code draws the lit version and the
     shape coming up out of the dark. `P` is { a: body, b: shadow, c: accent }. */

  function beingShape(ctx, kind, L, H, P, tm) {
    if (kind === 'human') { humanShape(ctx, L, H, P, tm); return; }
    nessieShape(ctx, L, H, P, tm);
  }

  /* A long neck out of the water, a body under it, and the rest of her behind
     that as humps. Drawn facing right; the waterline is at y = H * 0.34, which
     is why everything below it is only ever hinted at. */
  function nessieShape(ctx, L, H, P, tm) {
    const sway = Math.sin(tm * 0.7) * 0.035;
    const waterY = H * 0.36;

    // the humps, furthest first so they sit behind
    ctx.fillStyle = P.b;
    for (let i = 0; i < 3; i++) {
      const hx = -L * (0.30 + i * 0.20);
      const hr = L * (0.125 - i * 0.026);
      ctx.beginPath();
      ctx.ellipse(hx, waterY - hr * 0.30 + Math.sin(tm * 0.9 + i) * H * 0.012,
                  hr, hr * 0.58, 0, Math.PI, 0);
      ctx.fill();
    }

    // the body, mostly under
    ctx.fillStyle = P.a;
    ctx.beginPath();
    ctx.ellipse(-L * 0.04, waterY - H * 0.03, L * 0.24, H * 0.22, -0.05, 0, TAU);
    ctx.fill();

    /* The neck. It is the whole silhouette, so it is slim and it is long — at
       any thickness above about a sixth of the height it stops reading as a
       neck and starts reading as a fin. Two bezier edges with their control
       points staggered give it the shallow S every photograph claims. */
    const sx = L * 0.00, sy = waterY - H * 0.14;        // shoulder
    const hx2 = L * 0.20 + Math.sin(tm * 0.6) * L * 0.010;
    const hy2 = -H * 0.80 + sway * H;                    // base of the head
    const wS = H * 0.100, wH = H * 0.044;
    ctx.beginPath();
    ctx.moveTo(sx - wS, sy);
    // back of the neck, bowing left then carrying right into the skull
    ctx.bezierCurveTo(sx - wS * 2.6, sy - H * 0.60,
                      hx2 - H * 0.24, hy2 - H * 0.05, hx2 - wH, hy2 - wH * 0.3);
    ctx.lineTo(hx2 + wH * 0.8, hy2 + wH * 1.1);
    // front of the neck, bowing the other way
    ctx.bezierCurveTo(hx2 - H * 0.05, hy2 + H * 0.34,
                      sx + wS * 4.2, sy - H * 0.46, sx + wS, sy);
    ctx.closePath();
    ctx.fill();

    // the head: a blunt wedge with a jaw, tipped forward off the neck
    ctx.save();
    ctx.translate(hx2, hy2);
    ctx.rotate(-0.22 + sway);
    const hh = H * 0.098;                                // head half-height
    ctx.beginPath();
    ctx.moveTo(-hh * 0.9, hh * 0.55);
    ctx.quadraticCurveTo(-hh * 1.15, -hh * 0.95, hh * 0.35, -hh * 1.05);
    ctx.quadraticCurveTo(hh * 2.05, -hh * 0.90, hh * 2.30, -hh * 0.10);
    ctx.quadraticCurveTo(hh * 2.20, hh * 0.55, hh * 1.30, hh * 0.62);
    ctx.quadraticCurveTo(hh * 0.30, hh * 0.72, -hh * 0.9, hh * 0.55);
    ctx.closePath();
    ctx.fill();
    // the jawline, so the head has a mouth rather than a profile
    ctx.save();
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = P.b;
    ctx.beginPath();
    ctx.moveTo(hh * 0.25, hh * 0.16);
    ctx.quadraticCurveTo(hh * 1.40, hh * 0.34, hh * 2.24, hh * 0.02);
    ctx.quadraticCurveTo(hh * 1.40, hh * 0.74, hh * 0.25, hh * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // the eye, small and set well forward
    ctx.fillStyle = P.c;
    ctx.beginPath();
    ctx.ellipse(hh * 1.10, -hh * 0.40, hh * 0.24, hh * 0.20, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // a flipper breaking the surface in front of the body
    ctx.fillStyle = P.b;
    ctx.save();
    ctx.translate(L * 0.09, waterY + H * 0.09);
    ctx.rotate(0.40 + Math.sin(tm * 1.1) * 0.10);
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.12, H * 0.070, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // the waterline: everything below it is displaced rather than seen
    ctx.fillStyle = P.c;
    ctx.globalAlpha *= 0.28;
    ctx.beginPath();
    ctx.ellipse(-L * 0.05, waterY + H * 0.05, L * 0.40, H * 0.052, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha /= 0.28;
  }

  /* A person, standing. The accent colour is his hair, which is the one
     detail anybody actually reports afterwards. */
  function humanShape(ctx, L, H, P, tm) {
    const breathe = Math.sin(tm * 0.9) * H * 0.006;
    const headR = H * 0.125;
    const headY = -H * 0.75 + breathe;
    const shoulderY = headY + headR * 1.75;

    // legs
    ctx.fillStyle = P.b;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * H * 0.045 - H * 0.050, H * 0.04);
      ctx.lineTo(i * H * 0.045 + H * 0.050, H * 0.04);
      ctx.lineTo(i * H * 0.075 + H * 0.046, H * 0.94);
      ctx.lineTo(i * H * 0.075 - H * 0.050, H * 0.94);
      ctx.closePath();
      ctx.fill();
    }

    /* Arms first and behind, so the torso closes over the shoulder and he
       stops reading as a set of slabs stood next to each other. */
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * H * 0.155, shoulderY + H * 0.02);
      ctx.rotate(i * (0.055 + Math.sin(tm * 0.8) * 0.015));
      ctx.beginPath();
      ctx.moveTo(-H * 0.046, -H * 0.03);
      ctx.lineTo(H * 0.046, -H * 0.03);
      ctx.lineTo(H * 0.036, H * 0.60);
      ctx.lineTo(-H * 0.042, H * 0.60);
      ctx.closePath();
      ctx.fill();
      // the hand, so the arm ends in something
      ctx.beginPath();
      ctx.ellipse(-H * 0.003, H * 0.635, H * 0.040, H * 0.048, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // torso: shoulders, then in to the waist
    ctx.fillStyle = P.a;
    ctx.beginPath();
    ctx.moveTo(-H * 0.175, shoulderY);
    ctx.quadraticCurveTo(-H * 0.195, headY + headR * 2.9, -H * 0.125, H * 0.07);
    ctx.lineTo(H * 0.125, H * 0.07);
    ctx.quadraticCurveTo(H * 0.195, headY + headR * 2.9, H * 0.175, shoulderY);
    ctx.quadraticCurveTo(0, shoulderY - headR * 0.30, -H * 0.175, shoulderY);
    ctx.closePath();
    ctx.fill();

    // the collar, which is most of what says "dressed" at this size
    ctx.save();
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = P.b;
    ctx.beginPath();
    ctx.moveTo(-H * 0.062, shoulderY - headR * 0.12);
    ctx.lineTo(0, shoulderY + headR * 0.55);
    ctx.lineTo(H * 0.062, shoulderY - headR * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // neck and head
    ctx.fillStyle = P.a;
    ctx.fillRect(-H * 0.040, headY + headR * 0.45, H * 0.080, headR * 1.2);
    ctx.beginPath();
    ctx.ellipse(0, headY, headR * 0.84, headR, 0, 0, TAU);
    ctx.fill();

    // the face stays in shadow under the fringe — one band is enough at any
    // size this is ever drawn, and a drawn-on face would be worse
    ctx.save();
    ctx.globalAlpha *= 0.30;
    ctx.fillStyle = P.b;
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.10, headR * 0.78, headR * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // the hair. Fringe forward, a little length at the back.
    ctx.fillStyle = P.c;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.94, headY + headR * 0.42);
    ctx.quadraticCurveTo(-headR * 1.14, headY - headR * 0.98,
                         0, headY - headR * 1.04);
    ctx.quadraticCurveTo(headR * 1.14, headY - headR * 0.98,
                         headR * 0.94, headY + headR * 0.34);
    ctx.quadraticCurveTo(headR * 0.74, headY - headR * 0.10,
                         headR * 0.22, headY - headR * 0.22);
    ctx.quadraticCurveTo(-headR * 0.52, headY - headR * 0.26,
                         -headR * 0.94, headY + headR * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  function drawBeing(ctx, fish, size, opts) {
    const art = fish.art;
    const tm = opts.time === undefined ? 0 : opts.time;
    const L = size * 2;
    const H = L * bodyRatio('being', art.being);
    const pal = palette(art, opts.traits || opts.mutation);

    ctx.save();
    // the light it is standing in, which is not coming from anywhere
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.95);
    g.addColorStop(0, U.rgbToCss(pal.r3, 0.20 * (art.glow || 0.5)));
    g.addColorStop(1, U.rgbToCss(pal.r3, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-L, -L, L * 2, L * 2);

    beingShape(ctx, art.being, L, H, { a: pal.c1, b: pal.c2, c: pal.c3 }, tm);

    // one rim along the lit edge, so it is a body and not a cut-out
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    ctx.translate(-Math.max(0.6, L * 0.004), -Math.max(0.6, L * 0.004));
    beingShape(ctx, art.being, L, H,
               { a: U.rgbToCss(U.mixRgb(pal.r1, [255, 255, 255], 0.6)),
                 b: U.rgbToCss(U.mixRgb(pal.r2, [255, 255, 255], 0.45)),
                 c: U.rgbToCss(pal.r3) }, tm);
    ctx.restore();
  }

  /* The largest half-size a creature can be drawn at and still fit a box. */
  function fitSize(fish, box) {
    const kind = fish.art.body;
    if (kind === 'being') {
      const rb = bodyRatio(kind, fish.art.being);
      return Math.max(6, Math.min(box * 0.40, (box * 0.44) / (rb * 2)));
    }
    if (kind === 'object') {
      // an object fills its box in both directions, so fit the taller of the two
      const ro = bodyRatio(kind, fish.art.object);
      return Math.max(6, Math.min(box * 0.40, (box * 0.42) / (ro * 2)));
    }
    const r = bodyRatio(kind);
    // the paths overshoot the nominal half-height, most of all on the winged bodies
    const over = kind === 'ray' ? 3.3 : kind === 'jelly' ? 2.2
              : (kind === 'serpent' || kind === 'eel' || kind === 'ribbon') ? 3.4 : 1.35;
    const byHeight = (box * 0.46) / (r * 2 * over * 1.18);
    return Math.max(6, Math.min(box * 0.40, byHeight));
  }

  /* The shape coming up through the water. `near` is 0 out in the dark and 1
     just under the surface — the closer it gets, the more of its own colour
     the water gives back, so the reveal happens gradually instead of the fish
     staying a black cut-out until the catch card opens. */
  function drawSilhouette(ctx, fish, size, alpha, near) {
    const art = fish.art;
    const L = size * 2;
    /* An object comes up as the object. The same shape code runs with all three
       colours collapsed to one, so what surfaces out of the dark is a
       chair-shaped absence rather than a fish-shaped one. */
    /* A being surfaces as itself too. Nessie in particular has to be the
       right shape while she is still a shadow, because that is most of what
       makes the last few seconds of the fight work. */
    if (art.body === 'being') {
      const lb = U.clamp(near === undefined ? 0 : near, 0, 1);
      const flatB = U.rgbToCss(U.mixRgb([2, 3, 6], U.shade(U.hexToRgb(art.c1), -0.40), lb * 0.85));
      const accB = U.rgbToCss(U.mixRgb([2, 3, 6], U.shade(U.hexToRgb(art.c3), -0.35), lb * 0.9));
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 0.8 : alpha;
      beingShape(ctx, art.being, L, L * bodyRatio('being', art.being),
                 { a: flatB, b: flatB, c: accB }, 0);
      ctx.restore();
      return;
    }
    if (art.body === 'object') {
      const lift0 = U.clamp(near === undefined ? 0 : near, 0, 1);
      const flat = U.rgbToCss(U.mixRgb([2, 3, 6], U.shade(U.hexToRgb(art.c1), -0.40),
                                       lift0 * 0.85));
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 0.8 : alpha;
      objectShape(ctx, art.object, L, L * bodyRatio('object', art.object),
                  { a: flat, b: flat, c: flat }, 0);
      ctx.restore();
      return;
    }
    const rnd = VF.rng.make(hash(fish.id));
    const H = measureH(art.body, L);
    const j = jitter(fish.id);
    const lift = U.clamp(near === undefined ? 0 : near, 0, 1);
    const c1 = U.hexToRgb(art.c1), c2 = U.hexToRgb(art.c2);
    const body = U.rgbToCss(U.mixRgb([2, 3, 6], U.shade(c1, -0.45), lift * 0.85));
    const fin = U.rgbToCss(U.mixRgb([1, 2, 4], U.shade(c2, -0.55), lift * 0.8));

    ctx.save();
    ctx.scale(j.x, j.y);
    ctx.globalAlpha = alpha === undefined ? 0.8 : alpha;
    drawFins(ctx, art.fin, L, H, 0, fin, 1);
    bodyPath(ctx, art.body, L, 0, rnd);
    ctx.fillStyle = body;
    ctx.fill();
    // one thin highlight along the back, where the surface light would land
    if (lift > 0.15) {
      ctx.strokeStyle = U.rgbToCss(U.mixRgb(c1, [190, 215, 245], 0.5), 0.26 * lift);
      ctx.lineWidth = Math.max(0.7, L * 0.006);
      ctx.stroke();
    }
    if (art.glow > 0.35) {
      ctx.globalAlpha *= art.glow * 0.5;
      ctx.fillStyle = art.c3;
      ctx.beginPath(); ctx.arc(L * 0.30, -H * 0.20, Math.max(1, L * 0.035), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }


  /* ------------------------------------------------------------- objects
     Nothing in the !@#$%^&$# tier is a fish, and none of it should be drawn
     like one. A hook is a hook. A chair is a chair. These get no body, no
     fins, no gills and no counter-shading — they are the object, at whatever
     size the line brought it up at, with only the wrongness laid over the top.

     Every one is drawn into a box 2L wide and 2L*OBJ_H high, centred on the
     origin, from three colours. `flat` collapses all three to one, which is
     how the same code draws the shape rising through the dark water. */

  const OBJ_H = {
    hook: 0.62, chair: 0.60, door: 0.78, boot: 0.44, bulb: 0.56, clock: 0.50,
    key: 0.30, sign: 0.72, ladder: 0.80, bench: 0.40, screen: 0.40,
    window: 0.62, umbrella: 0.52, cage: 0.66, bucket: 0.48, calendar: 0.52,
    hands: 0.44, pricetag: 0.40, cursor: 0.52, counter: 0.34, missing: 0.44,
    angler: 0.62, viewer: 0.58, lamp: 0.70, cup: 0.42, stairs: 0.56
  };

  /* Line weight that survives being drawn at 20px and at 300px. */
  function ow(L, k) { return Math.max(0.6, L * k); }

  function objectShape(ctx, kind, L, H, P, t) {
    const w = ow(L, 0.016);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    switch (kind) {

      case 'hook': {
        // one hook: eye at the top, shank down, the bend under it, and the
        // point turning back up. Nothing else — it is a hook.
        const hx = -L * 0.04, hy = H * 0.16, hr = L * 0.30;
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.080);
        ctx.beginPath();
        ctx.moveTo(-L * 0.34, -H * 0.82);
        ctx.lineTo(-L * 0.34, hy);
        // left, under, right, and a little past the horizontal
        ctx.arc(hx, hy, hr, Math.PI, -Math.PI * 0.22, true);
        ctx.stroke();
        // the lit side of the wire, which is what makes it steel
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.026);
        ctx.beginPath();
        ctx.moveTo(-L * 0.365, -H * 0.78);
        ctx.lineTo(-L * 0.365, hy);
        ctx.arc(hx, hy, hr * 1.09, Math.PI, -Math.PI * 0.10, true);
        ctx.stroke();
        // the eye
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.048);
        ctx.beginPath();
        ctx.ellipse(-L * 0.34, -H * 0.88, L * 0.075, L * 0.055, 0, 0, TAU);
        ctx.stroke();
        // the point, carrying on past where the bend stops
        const pa = -Math.PI * 0.22;
        const px = hx + Math.cos(pa) * hr, py = hy + Math.sin(pa) * hr;
        ctx.fillStyle = P.c;
        ctx.beginPath();
        ctx.moveTo(px - L * 0.035, py + L * 0.030);
        ctx.lineTo(px + L * 0.090, py - L * 0.260);
        ctx.lineTo(px + L * 0.045, py + L * 0.015);
        ctx.closePath();
        ctx.fill();
        // and the barb behind it
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.028);
        ctx.beginPath();
        ctx.moveTo(px + L * 0.055, py - L * 0.14);
        ctx.lineTo(px + L * 0.150, py - L * 0.02);
        ctx.stroke();
        break;
      }

      case 'chair': {
        // a dining chair, side-on, four legs and a slatted back
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.055);
        ctx.beginPath();
        // back uprights
        ctx.moveTo(-L * 0.30, H * 0.92); ctx.lineTo(-L * 0.30, -H * 0.95);
        ctx.moveTo(-L * 0.20, H * 0.92); ctx.lineTo(-L * 0.20, -H * 0.95);
        // front legs
        ctx.moveTo(L * 0.26, H * 0.92); ctx.lineTo(L * 0.26, H * 0.02);
        ctx.moveTo(L * 0.16, H * 0.92); ctx.lineTo(L * 0.16, H * 0.02);
        // stretcher
        ctx.moveTo(-L * 0.28, H * 0.58); ctx.lineTo(L * 0.24, H * 0.58);
        ctx.stroke();
        // the seat
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.34, H * 0.06);
        ctx.lineTo(L * 0.32, -H * 0.02);
        ctx.lineTo(L * 0.32, H * 0.14);
        ctx.lineTo(-L * 0.34, H * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.020);
        ctx.stroke();
        // back slats
        ctx.lineWidth = ow(L, 0.038);
        ctx.strokeStyle = P.c;
        for (let i = 0; i < 3; i++) {
          const y = -H * (0.30 + i * 0.26);
          ctx.beginPath();
          ctx.moveTo(-L * 0.31, y); ctx.lineTo(-L * 0.19, y);
          ctx.stroke();
        }
        // top rail
        ctx.lineWidth = ow(L, 0.060);
        ctx.strokeStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.33, -H * 0.94); ctx.lineTo(-L * 0.17, -H * 0.94);
        ctx.stroke();
        break;
      }

      case 'door': {
        // a door, in a frame, standing open onto nothing
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.26, -H * 0.94, L * 0.52, H * 1.88);
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.030);
        ctx.strokeRect(-L * 0.26, -H * 0.94, L * 0.52, H * 1.88);
        // two panels, which is what makes a rectangle a door
        ctx.lineWidth = ow(L, 0.022);
        ctx.strokeRect(-L * 0.17, -H * 0.78, L * 0.34, H * 0.66);
        ctx.strokeRect(-L * 0.17, H * 0.06, L * 0.34, H * 0.72);
        // the handle
        ctx.fillStyle = P.c;
        ctx.beginPath();
        ctx.arc(L * 0.17, H * 0.02, ow(L, 0.035), 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(L * 0.13, H * 0.02, L * 0.045, L * 0.018, 0, 0, TAU);
        ctx.fill();
        // and the gap it is open by, which is not dark, it is bright
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.30 + 0.20 * Math.sin(t * 1.3);
        ctx.fillRect(-L * 0.32, -H * 0.94, L * 0.055, H * 1.88);
        ctx.globalAlpha = 1;
        break;
      }

      case 'boot': {
        // the boot. Every fisherman has heard of it. Nobody has seen one.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.20, -H * 0.90);
        ctx.lineTo(L * 0.04, -H * 0.90);
        ctx.lineTo(L * 0.06, H * 0.20);
        ctx.quadraticCurveTo(L * 0.10, H * 0.42, L * 0.34, H * 0.50);
        ctx.quadraticCurveTo(L * 0.44, H * 0.56, L * 0.42, H * 0.76);
        ctx.lineTo(-L * 0.20, H * 0.76);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.026);
        ctx.stroke();
        // sole
        ctx.fillStyle = P.b;
        ctx.beginPath();
        ctx.moveTo(-L * 0.22, H * 0.76);
        ctx.lineTo(L * 0.44, H * 0.76);
        ctx.lineTo(L * 0.44, H * 0.94);
        ctx.lineTo(-L * 0.22, H * 0.94);
        ctx.closePath();
        ctx.fill();
        // eyelets, and the lace that is still done up
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.022);
        for (let i = 0; i < 4; i++) {
          const y = -H * (0.74 - i * 0.26);
          ctx.beginPath();
          ctx.moveTo(-L * 0.16, y); ctx.lineTo(L * 0.00, y + H * 0.10);
          ctx.moveTo(L * 0.00, y); ctx.lineTo(-L * 0.16, y + H * 0.10);
          ctx.stroke();
        }
        break;
      }

      case 'bulb': {
        // a bulb, still lit, with no fitting and nothing to be lit by
        const on = 0.7 + 0.3 * Math.sin(t * 2.2);
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.arc(0, -H * 0.22, L * 0.30, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.020);
        ctx.stroke();
        // the neck and the screw cap
        ctx.fillStyle = P.b;
        ctx.beginPath();
        ctx.moveTo(-L * 0.12, H * 0.14);
        ctx.lineTo(L * 0.12, H * 0.14);
        ctx.lineTo(L * 0.10, H * 0.34);
        ctx.lineTo(-L * 0.10, H * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-L * 0.10, H * 0.34, L * 0.20, H * 0.52);
        ctx.strokeStyle = P.a;
        ctx.lineWidth = ow(L, 0.018);
        for (let i = 0; i < 4; i++) {
          const y = H * (0.40 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(-L * 0.10, y); ctx.lineTo(L * 0.10, y);
          ctx.stroke();
        }
        // the filament, which is the only part doing anything
        ctx.strokeStyle = P.c;
        ctx.globalAlpha = on;
        ctx.lineWidth = ow(L, 0.024);
        ctx.beginPath();
        ctx.moveTo(-L * 0.06, H * 0.12);
        for (let i = 0; i <= 8; i++) {
          ctx.lineTo(-L * 0.06 + (i / 8) * L * 0.12, -H * 0.10 + (i % 2 ? -H * 0.16 : 0));
        }
        ctx.lineTo(L * 0.06, H * 0.12);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }

      case 'clock': {
        // a wall clock. The hands are at a time that does not occur.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.arc(0, 0, L * 0.44, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.045);
        ctx.stroke();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.020);
        for (let i = 0; i < 12; i++) {
          const a = i * (TAU / 12);
          const r0 = L * (i % 3 === 0 ? 0.31 : 0.35);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * L * 0.39, Math.sin(a) * L * 0.39);
          ctx.stroke();
        }
        // both hands on the same number, and the second hand going backwards
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.036);
        [0.22, 0.32].forEach(function (r) {
          const a = -Math.PI * 0.5 + 0.06;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * L * r, Math.sin(a) * L * r);
          ctx.stroke();
        });
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.018);
        const sa = -t * 1.1;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sa) * L * 0.36, Math.sin(sa) * L * 0.36);
        ctx.stroke();
        ctx.fillStyle = P.b;
        ctx.beginPath(); ctx.arc(0, 0, ow(L, 0.030), 0, TAU); ctx.fill();
        break;
      }

      case 'key': {
        // a house key. Not brass, not ancient — the one on your keyring.
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.085);
        ctx.beginPath();
        ctx.moveTo(-L * 0.22, 0); ctx.lineTo(L * 0.40, 0);
        ctx.stroke();
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.ellipse(-L * 0.34, 0, L * 0.16, L * 0.16, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.030);
        ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(-L * 0.34, 0, L * 0.07, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // the bitting
        ctx.fillStyle = P.b;
        const teeth = [0.24, 0.42, 0.20, 0.46, 0.30];
        for (let i = 0; i < teeth.length; i++) {
          const x = L * (0.16 + i * 0.055);
          ctx.fillRect(x, 0, L * 0.042, H * teeth[i]);
        }
        break;
      }

      case 'sign': {
        // a road sign, on its post, for a road
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.045);
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.20); ctx.lineTo(0, H * 0.94);
        ctx.stroke();
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.34, -H * 0.86);
        ctx.lineTo(L * 0.34, -H * 0.86);
        ctx.lineTo(L * 0.34, -H * 0.18);
        ctx.lineTo(-L * 0.34, -H * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.026);
        ctx.stroke();
        // the arrow, pointing at the bottom of the water: shaft, then head
        ctx.fillStyle = P.b;
        ctx.fillRect(-L * 0.22, -H * 0.58, L * 0.30, H * 0.12);
        ctx.beginPath();
        ctx.moveTo(L * 0.06, -H * 0.68);
        ctx.lineTo(L * 0.26, -H * 0.52);
        ctx.lineTo(L * 0.06, -H * 0.36);
        ctx.closePath();
        ctx.fill();

        // and lettering that is not lettering at this size
        ctx.fillStyle = P.b;
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) ctx.fillRect(-L * 0.24 + i * L * 0.17, -H * 0.32, L * 0.13, H * 0.05);
        ctx.globalAlpha = 1;
        break;
      }

      case 'ladder': {
        // a ladder. It goes down. It was already going down.
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.055);
        ctx.beginPath();
        ctx.moveTo(-L * 0.20, -H * 0.96); ctx.lineTo(-L * 0.28, H * 0.96);
        ctx.moveTo(L * 0.20, -H * 0.96); ctx.lineTo(L * 0.28, H * 0.96);
        ctx.stroke();
        ctx.strokeStyle = P.a;
        ctx.lineWidth = ow(L, 0.045);
        for (let i = 0; i < 7; i++) {
          const u = i / 6;
          const y = -H * 0.86 + u * H * 1.72;
          const x = L * (0.20 + u * 0.08);
          ctx.beginPath();
          ctx.moveTo(-x, y); ctx.lineTo(x, y);
          ctx.stroke();
        }
        // the bottom rungs going into a dark that is inside the object
        ctx.fillStyle = P.b;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(-L * 0.30, H * 0.62);
        ctx.lineTo(L * 0.30, H * 0.62);
        ctx.lineTo(L * 0.30, H * 0.99);
        ctx.lineTo(-L * 0.30, H * 0.99);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }

      case 'bench': {
        // the bench from the shore. It is not on the shore any more.
        ctx.fillStyle = P.a;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(-L * 0.44, -H * (0.62 - i * 0.30), L * 0.88, H * 0.20);
        }
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.020);
        for (let i = 0; i < 3; i++) {
          ctx.strokeRect(-L * 0.44, -H * (0.62 - i * 0.30), L * 0.88, H * 0.20);
        }
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.050);
        [-0.32, 0.32].forEach(function (x) {
          ctx.beginPath();
          ctx.moveTo(L * x, -H * 0.70); ctx.lineTo(L * x, H * 0.94);
          ctx.stroke();
        });
        // the cast-iron scroll on the end, which is the whole personality
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.026);
        [-0.32, 0.32].forEach(function (x) {
          ctx.beginPath();
          ctx.arc(L * x, H * 0.42, L * 0.09, 0, Math.PI, x < 0);
          ctx.stroke();
        });
        break;
      }

      case 'screen': {
        // a lit rectangle. It is still warm.
        ctx.fillStyle = P.b;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-L * 0.46, -H * 0.80, L * 0.92, H * 1.44, L * 0.03);
        else ctx.rect(-L * 0.46, -H * 0.80, L * 0.92, H * 1.44);
        ctx.fill();
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 3.1);
        ctx.fillRect(-L * 0.42, -H * 0.72, L * 0.84, H * 1.28);
        ctx.globalAlpha = 1;
        // scanlines, because it is not a modern one
        ctx.strokeStyle = P.b;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = ow(L, 0.010);
        for (let y = -H * 0.70; y < H * 0.56; y += H * 0.10) {
          ctx.beginPath();
          ctx.moveTo(-L * 0.42, y); ctx.lineTo(L * 0.42, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // the stand
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.08, H * 0.64, L * 0.16, H * 0.20);
        ctx.fillRect(-L * 0.26, H * 0.84, L * 0.52, H * 0.12);
        break;
      }

      case 'window': {
        // somebody else's window, with their room still on the other side
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 0.8);
        ctx.fillRect(-L * 0.36, -H * 0.86, L * 0.72, H * 1.72);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = P.a;
        ctx.lineWidth = ow(L, 0.055);
        ctx.strokeRect(-L * 0.36, -H * 0.86, L * 0.72, H * 1.72);
        ctx.lineWidth = ow(L, 0.036);
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.86); ctx.lineTo(0, H * 0.86);
        ctx.moveTo(-L * 0.36, 0); ctx.lineTo(L * 0.36, 0);
        ctx.stroke();
        // the sill, and the shape standing at it in the far pane
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.44, H * 0.86, L * 0.88, H * 0.12);
        ctx.fillStyle = P.b;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(L * 0.18, -H * 0.46, L * 0.055, L * 0.070, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(L * 0.12, -H * 0.36, L * 0.12, H * 0.34);
        ctx.globalAlpha = 1;
        break;
      }

      case 'umbrella': {
        // open, which is the part that is wrong
        const half = L * 0.46, rim = -H * 0.12, top = -H * 0.86;
        ctx.beginPath();
        ctx.moveTo(-half, rim);
        ctx.quadraticCurveTo(-half * 0.72, top, 0, top);
        ctx.quadraticCurveTo(half * 0.72, top, half, rim);
        // the scalloped trailing edge, panel by panel
        for (let i = 4; i > 0; i--) {
          const x0 = -half + (i / 4) * half * 2;
          const x1 = -half + ((i - 1) / 4) * half * 2;
          ctx.quadraticCurveTo((x0 + x1) / 2, rim + H * 0.20, x1, rim);
        }
        ctx.closePath();
        ctx.fillStyle = P.a;
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.022);
        ctx.stroke();
        // ribs, from the ferrule out to each seam between the scallops
        for (let i = 1; i < 4; i++) {
          const x = -half + (i / 4) * half * 2;
          ctx.beginPath();
          ctx.moveTo(0, top);
          ctx.quadraticCurveTo(x * 0.55, (top + rim) * 0.5, x, rim);
          ctx.stroke();
        }
        // ferrule, shaft and the crook
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.040);
        ctx.beginPath();
        ctx.moveTo(0, top - H * 0.10);
        ctx.lineTo(0, H * 0.70);
        ctx.arc(-L * 0.09, H * 0.70, L * 0.09, 0, Math.PI, false);
        ctx.stroke();
        break;
      }

      case 'cage': {
        // a birdcage, open, and empty in a way that is load-bearing
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.030);
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.96); ctx.lineTo(0, -H * 0.80);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -H * 0.86, L * 0.06, 0, TAU);
        ctx.stroke();
        for (let i = 0; i <= 8; i++) {
          const u = (i / 8) * 2 - 1;
          const x = L * 0.30 * u;
          ctx.beginPath();
          ctx.moveTo(x * 0.35, -H * 0.72);
          ctx.quadraticCurveTo(x, -H * 0.30, x, H * 0.64);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-L * 0.32, H * 0.64); ctx.lineTo(L * 0.32, H * 0.64);
        ctx.moveTo(-L * 0.24, H * 0.06); ctx.lineTo(L * 0.24, H * 0.06);
        ctx.stroke();
        // the base, and the door standing open
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.36, H * 0.64, L * 0.72, H * 0.22);
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.026);
        ctx.beginPath();
        ctx.moveTo(L * 0.24, H * 0.06);
        ctx.lineTo(L * 0.44, H * 0.20);
        ctx.lineTo(L * 0.44, H * 0.58);
        ctx.lineTo(L * 0.26, H * 0.60);
        ctx.stroke();
        break;
      }

      case 'bucket': {
        // your bucket. It was beside you. Check beside you.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.34, -H * 0.36);
        ctx.lineTo(L * 0.34, -H * 0.36);
        ctx.lineTo(L * 0.24, H * 0.82);
        ctx.lineTo(-L * 0.24, H * 0.82);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.028);
        ctx.stroke();
        // rim
        ctx.fillStyle = P.b;
        ctx.beginPath();
        ctx.ellipse(0, -H * 0.36, L * 0.34, L * 0.075, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, -H * 0.34, L * 0.28, L * 0.056, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        // handle
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.026);
        ctx.beginPath();
        ctx.arc(0, -H * 0.36, L * 0.34, Math.PI, 0, true);
        ctx.stroke();
        break;
      }

      case 'calendar': {
        // one day, torn off. It is slightly damp.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.34, -H * 0.72);
        ctx.lineTo(L * 0.34, -H * 0.72);
        ctx.lineTo(L * 0.34, H * 0.70);
        // the torn lower edge
        for (let i = 6; i >= 0; i--) {
          ctx.lineTo(-L * 0.34 + (i / 6) * L * 0.68, H * (i % 2 ? 0.78 : 0.64));
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.018);
        ctx.stroke();
        // the header band, the number, and the ruled lines
        ctx.fillStyle = P.c;
        ctx.fillRect(-L * 0.34, -H * 0.72, L * 0.68, H * 0.28);
        ctx.fillStyle = P.b;
        ctx.fillRect(-L * 0.12, -H * 0.34, L * 0.24, H * 0.40);
        ctx.globalAlpha = 0.55;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(-L * 0.26, H * (0.18 + i * 0.14), L * 0.52, H * 0.05);
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'hands': {
        // applause. Two hands, mid-clap, and nothing they are attached to.
        const clap = Math.abs(Math.sin(t * 3.4)) * L * 0.10;
        [-1, 1].forEach(function (s) {
          ctx.save();
          ctx.translate(s * (L * 0.14 + clap), 0);
          ctx.scale(s, 1);
          ctx.fillStyle = P.a;
          ctx.beginPath();
          ctx.moveTo(0, -H * 0.50);
          ctx.quadraticCurveTo(L * 0.20, -H * 0.62, L * 0.26, -H * 0.20);
          ctx.quadraticCurveTo(L * 0.30, H * 0.30, L * 0.14, H * 0.70);
          ctx.lineTo(-L * 0.02, H * 0.72);
          ctx.quadraticCurveTo(-L * 0.04, H * 0.10, 0, -H * 0.50);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = P.b;
          ctx.lineWidth = ow(L, 0.020);
          ctx.stroke();
          // fingers
          ctx.lineWidth = ow(L, 0.016);
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(L * (0.06 + i * 0.06), -H * 0.44);
            ctx.quadraticCurveTo(L * (0.16 + i * 0.05), -H * 0.10, L * (0.10 + i * 0.05), H * 0.30);
            ctx.stroke();
          }
          ctx.restore();
        });
        break;
      }

      case 'pricetag': {
        // a price and no name. Do not read it twice.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.44, -H * 0.30);
        ctx.lineTo(L * 0.24, -H * 0.62);
        ctx.lineTo(L * 0.44, -H * 0.10);
        ctx.lineTo(L * 0.44, H * 0.44);
        ctx.lineTo(-L * 0.44, H * 0.62);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.022);
        ctx.stroke();
        // the eyelet and the string
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(L * 0.30, -H * 0.24, L * 0.045, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.016);
        ctx.beginPath();
        ctx.moveTo(L * 0.30, -H * 0.24);
        ctx.quadraticCurveTo(L * 0.48, -H * 0.60, L * 0.36, -H * 0.90);
        ctx.stroke();
        // the figure, which is legible and which you are not going to read
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 7.3);
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(-L * 0.30 + i * L * 0.12, -H * 0.06, L * 0.075, H * 0.30);
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'cursor': {
        // the pointer. Tip, two edges, the notch and the tail — anything less
        // is a triangle, and a triangle is not what has been following you.
        const cw = L * 0.62, ch = H * 0.92;
        const pts = [[0, 0], [0, 1], [0.28, 0.73], [0.45, 1.06],
                     [0.61, 0.99], [0.44, 0.67], [0.72, 0.63]];
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = -L * 0.26 + pts[i][0] * cw;
          const y = -H * 0.88 + pts[i][1] * ch;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = P.c;
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.026);
        ctx.stroke();
        // and it is still blinking
        ctx.fillStyle = P.c;
        ctx.globalAlpha = (Math.floor(t * 1.6) % 2) ? 0.9 : 0.12;
        ctx.fillRect(L * 0.34, -H * 0.30, L * 0.05, H * 0.62);
        ctx.globalAlpha = 1;
        break;
      }

      case 'counter': {
        // a counter reading zero, including this time
        ctx.fillStyle = P.b;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-L * 0.46, -H * 0.80, L * 0.92, H * 1.60, L * 0.05);
        else ctx.rect(-L * 0.46, -H * 0.80, L * 0.92, H * 1.60);
        ctx.fill();
        for (let i = 0; i < 3; i++) {
          const x = -L * 0.34 + i * L * 0.28;
          ctx.fillStyle = P.a;
          ctx.fillRect(x - L * 0.11, -H * 0.58, L * 0.22, H * 1.16);
          // the digit: a zero, drawn as a ring so it reads at any size
          ctx.strokeStyle = P.c;
          ctx.lineWidth = ow(L, 0.030);
          ctx.beginPath();
          ctx.ellipse(x, 0, L * 0.065, H * 0.36, 0, 0, TAU);
          ctx.stroke();
        }
        break;
      }

      case 'missing': {
        // the catalogue has no entry for this, and says so in its own way
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.40, -H * 0.80, L * 0.80, H * 1.60);
        ctx.strokeStyle = P.c;
        ctx.lineWidth = ow(L, 0.030);
        ctx.setLineDash([L * 0.05, L * 0.04]);
        ctx.strokeRect(-L * 0.40, -H * 0.80, L * 0.80, H * 1.60);
        ctx.setLineDash([]);
        // the broken-image cross
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.045);
        ctx.beginPath();
        ctx.moveTo(-L * 0.22, -H * 0.44); ctx.lineTo(L * 0.22, H * 0.44);
        ctx.moveTo(L * 0.22, -H * 0.44); ctx.lineTo(-L * 0.22, H * 0.44);
        ctx.stroke();
        break;
      }

      case 'angler':
      case 'viewer': {
        // a person, seated. One of them is holding a rod and one of them is
        // holding a lit rectangle, and only one of those is you.
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.arc(-L * 0.06, -H * 0.62, L * 0.13, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-L * 0.20, -H * 0.44);
        ctx.quadraticCurveTo(-L * 0.02, -H * 0.52, L * 0.08, -H * 0.36);
        ctx.lineTo(L * 0.14, H * 0.16);
        ctx.lineTo(-L * 0.22, H * 0.20);
        ctx.closePath();
        ctx.fill();
        // thighs forward, shins down: the sitting is the whole tell
        ctx.strokeStyle = P.a;
        ctx.lineWidth = ow(L, 0.075);
        ctx.beginPath();
        ctx.moveTo(-L * 0.06, H * 0.16); ctx.lineTo(L * 0.30, H * 0.28);
        ctx.lineTo(L * 0.32, H * 0.82);
        ctx.stroke();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.026);
        if (kind === 'angler') {
          // the rod, and the line going down, which nobody follows
          ctx.beginPath();
          ctx.moveTo(-L * 0.02, -H * 0.20);
          ctx.lineTo(L * 0.44, -H * 0.78);
          ctx.stroke();
          ctx.strokeStyle = P.c;
          ctx.lineWidth = ow(L, 0.012);
          ctx.beginPath();
          ctx.moveTo(L * 0.44, -H * 0.78);
          ctx.quadraticCurveTo(L * 0.52, -H * 0.10, L * 0.46, H * 0.92);
          ctx.stroke();
        } else {
          // the rectangle, lit, held at exactly the distance you are holding one
          ctx.fillStyle = P.c;
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 4.4);
          ctx.save();
          ctx.translate(L * 0.20, -H * 0.14);
          ctx.rotate(-0.42);
          ctx.fillRect(-L * 0.10, -L * 0.07, L * 0.20, L * 0.14);
          ctx.restore();
          ctx.globalAlpha = 1;
          // and the light of it, on the face
          ctx.fillStyle = P.c;
          ctx.globalAlpha = 0.30;
          ctx.beginPath();
          ctx.arc(-L * 0.04, -H * 0.60, L * 0.11, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }

      case 'lamp': {
        // a standard lamp, still on, at the depth it was left
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.26, -H * 0.42);
        ctx.lineTo(L * 0.26, -H * 0.42);
        ctx.lineTo(L * 0.34, -H * 0.86);
        ctx.lineTo(-L * 0.34, -H * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.024);
        ctx.stroke();
        ctx.fillStyle = P.c;
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 1.7);
        ctx.beginPath();
        ctx.ellipse(0, -H * 0.42, L * 0.26, L * 0.05, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.035);
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.42); ctx.lineTo(0, H * 0.82);
        ctx.stroke();
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.ellipse(0, H * 0.86, L * 0.24, L * 0.055, 0, 0, TAU);
        ctx.fill();
        break;
      }

      case 'cup': {
        // a mug of tea, full, and at the temperature it was poured at
        ctx.fillStyle = P.a;
        ctx.beginPath();
        ctx.moveTo(-L * 0.26, -H * 0.44);
        ctx.lineTo(L * 0.22, -H * 0.44);
        ctx.lineTo(L * 0.17, H * 0.66);
        ctx.quadraticCurveTo(0, H * 0.84, -L * 0.21, H * 0.66);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.026);
        ctx.stroke();
        // the handle
        ctx.beginPath();
        ctx.moveTo(L * 0.20, -H * 0.28);
        ctx.quadraticCurveTo(L * 0.50, -H * 0.02, L * 0.16, H * 0.30);
        ctx.lineWidth = ow(L, 0.055);
        ctx.stroke();
        // and what is in it
        ctx.fillStyle = P.c;
        ctx.beginPath();
        ctx.ellipse(-L * 0.02, -H * 0.42, L * 0.24, L * 0.055, 0, 0, TAU);
        ctx.fill();
        // steam, which is the part that should not be possible down here
        ctx.strokeStyle = P.c;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = ow(L, 0.018);
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          const x = -L * 0.10 + i * L * 0.16;
          ctx.moveTo(x, -H * 0.52);
          ctx.quadraticCurveTo(x + Math.sin(t * 1.6 + i) * L * 0.07, -H * 0.68,
                               x, -H * 0.86);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }

      case 'stairs': {
        // four steps. There is no building and they still go up.
        ctx.fillStyle = P.a;
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.022);
        for (let i = 0; i < 4; i++) {
          const x = -L * 0.44 + i * L * 0.22;
          const y = H * 0.86 - i * H * 0.44;
          ctx.beginPath();
          ctx.rect(x, y - H * 0.16, L * 0.30, H * 0.16);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = P.b;
          ctx.fillRect(x, y - H * 0.16, L * 0.30, H * 0.04);
          ctx.fillStyle = P.a;
        }
        // the riser faces, in shadow
        ctx.fillStyle = P.b;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 4; i++) {
          const x = -L * 0.44 + i * L * 0.22;
          const y = H * 0.86 - i * H * 0.44;
          ctx.fillRect(x, y, L * 0.22, H * 0.44);
        }
        ctx.globalAlpha = 1;
        break;
      }

      default: {
        // an object with no drawing is still an object: a plain crate
        ctx.fillStyle = P.a;
        ctx.fillRect(-L * 0.36, -H * 0.70, L * 0.72, H * 1.40);
        ctx.strokeStyle = P.b;
        ctx.lineWidth = ow(L, 0.030);
        ctx.strokeRect(-L * 0.36, -H * 0.70, L * 0.72, H * 1.40);
        break;
      }
    }
  }

  /* The full object: the thing itself, then whatever is wrong with it. */
  function drawObject(ctx, fish, size, opts) {
    const art = fish.art;
    const tm = opts.time === undefined ? 0 : opts.time;
    const L = size * 2;
    const H = L * bodyRatio('object', art.object);
    const pal = palette(art, opts.traits || opts.mutation);
    const P = { a: pal.c1, b: pal.c2, c: pal.c3 };
    const glitch = art.glitch === undefined ? 1 : art.glitch;

    ctx.save();
    // the ground it is standing on, which there is none of
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.9);
    g.addColorStop(0, U.rgbToCss(pal.r3, 0.22 * (art.glow || 0.5)));
    g.addColorStop(1, U.rgbToCss(pal.r3, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-L, -L, L * 2, L * 2);

    // the channel split, drawn as two offset copies before the object proper
    if (glitch > 0.02) {
      const off = Math.max(0.7, L * 0.013) * glitch *
                  (0.55 + 0.45 * Math.sin(tm * 5.7 + Math.sin(tm * 2.3) * 3));
      ctx.globalCompositeOperation = 'lighter';
      [[-off, '#ff2d55'], [off, '#66ffe0']].forEach(function (pair) {
        ctx.save();
        ctx.translate(pair[0], 0);
        ctx.globalAlpha = 0.42 * glitch;
        objectShape(ctx, art.object, L, H, { a: pair[1], b: pair[1], c: pair[1] }, tm);
        ctx.restore();
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    objectShape(ctx, art.object, L, H, P, tm);

    // torn scan bands: slices of the object displaced sideways, redrawn on a
    // clock of their own so it never settles into a pattern
    if (glitch > 0.02) {
      const rnd = VF.rng.make((Math.floor(tm * 6) * 2654435761) ^ hash(fish.id));
      const bands = 1 + Math.floor(rnd() * 3 * glitch);
      for (let i = 0; i < bands; i++) {
        const y = (rnd() - 0.5) * H * 1.8;
        const h = H * (0.05 + rnd() * 0.16);
        const dx = (rnd() - 0.5) * L * 0.22 * glitch;
        ctx.save();
        ctx.beginPath();
        ctx.rect(-L, y, L * 2, h);
        ctx.clip();
        ctx.translate(dx, 0);
        objectShape(ctx, art.object, L, H, P, tm);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  VF.fishArt = { draw: draw, drawSilhouette: drawSilhouette, palette: palette,
                 hash: hash, bodyRatio: bodyRatio, fitSize: fitSize,
                 objectShape: objectShape, OBJ_H: OBJ_H };
})(window.VF = window.VF || {});
