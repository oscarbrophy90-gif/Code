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


  /* ==================== low-poly bodies ====================
     A fish is a generalised cylinder: a spine, and a cross-section at every
     point along it. Sampling that as quads and shading each one flat against a
     light is what makes a model read as a model. One smooth gradient inside a
     bezier outline — which is what this was — reads as a sticker of a fish.

     `r` is the vertical half-height along the body, sampled evenly from tail
     tip to snout and read between samples as a straight line. That is the
     point rather than a shortcut: a lathe built on straight runs has a faceted
     outline, and the outline is most of what tells you a thing is low-poly.
     `d` is how deep the fish is against how tall — near 1 for something that
     is basically a ball, near a third for something you could post. */

  const PROFILE = {
    torpedo:    { x: [-0.44, 0.52], d: 0.46, nu: 9, r: [0.07, 0.29, 0.57, 0.81, 0.96, 1.00, 0.94, 0.73, 0.26] },
    round:      { x: [-0.44, 0.52], d: 0.38, r: [0.11, 0.42, 0.75, 0.93, 1.00, 0.98, 0.88, 0.64, 0.22] },
    orb:        { x: [-0.50, 0.50], d: 0.94, r: [0.04, 0.46, 0.74, 0.91, 1.00, 0.98, 0.87, 0.62, 0.16] },
    whale:      { x: [-0.48, 0.52], d: 0.66, r: [0.09, 0.33, 0.63, 0.85, 0.96, 1.00, 0.98, 0.88, 0.48] },
    blob:       { x: [-0.42, 0.46], d: 0.82, r: [0.26, 0.58, 0.83, 0.96, 1.00, 0.96, 0.85, 0.66, 0.30] },
    shard:      { x: [-0.46, 0.52], d: 0.30, r: [0.05, 0.44, 0.80, 1.00, 0.90, 0.76, 0.58, 0.38, 0.10], nu: 9 },
    crustacean: { x: [-0.44, 0.48], d: 0.74, r: [0.18, 0.54, 0.83, 0.98, 1.00, 0.92, 0.79, 0.60, 0.24] },
    anomaly:    { x: [-0.46, 0.50], d: 0.62, r: [0.14, 0.52, 0.72, 0.96, 0.84, 1.00, 0.78, 0.58, 0.20], nu: 11 },

    /* The long ones carry their wave on the spine rather than in the outline,
       so the cross-section stays round all the way down and the facets go
       round the body instead of sliding along it. */
    eel: { x: [-0.50, 0.52], d: 0.86, nu: 20,
           rf: function (u) { return 0.28 + 0.72 * Math.pow(u, 0.75) - 0.26 * Math.pow(u, 9); },
           wave: function (u, s) { return Math.sin((1 - u) * Math.PI * 2.1 + s) * 2.6 * (1 - u); } },
    serpent: { x: [-0.52, 0.52], d: 0.82, nu: 22,
           rf: function (u) { return 0.26 + 0.74 * Math.pow(u, 0.7) - 0.24 * Math.pow(u, 9); },
           wave: function (u, s) { return Math.sin((1 - u) * Math.PI * 2.1 + s) * 4.2 * (1 - u); } },
    ribbon: { x: [-0.50, 0.50], d: 0.24, nu: 18,
           rf: function (u) { return 0.60 + 0.40 * Math.pow(u, 0.6) - 0.30 * Math.pow(u, 8); },
           wave: function (u, s) { return Math.sin((1 - u) * 4.2 + s) * 1.9 * (1 - u); } }
  };

  /* Upper left and a little in front — the same key the scene puts on the
     angler, so a fish held up on the catch card belongs to the same picture. */
  const LIGHT = (function () {
    const x = -0.52, y = -0.34, z = 0.78;
    const m = Math.hypot(x, y, z);
    return [x / m, y / m, z / m];
  })();

  function sampleR(P, u) {
    if (P.rf) return P.rf(u);
    const a = P.r, n = a.length - 1;
    const f = U.clamp(u, 0, 1) * n;
    const i = Math.min(n - 1, f | 0);
    return U.lerp(a[i], a[i + 1], f - i);
  }

  /* One mesh is wanted twice in a row — once for the outline, once for the
     shading — so the last one is kept rather than built again. */
  let meshCache = null, meshKey = '';

  function meshFor(kind, L, H, sway, q) {
    const P = PROFILE[kind];
    if (!P) return null;
    const key = kind + '|' + L.toFixed(2) + '|' + H.toFixed(2) + '|' + sway.toFixed(3) + '|' + q;
    if (meshKey === key) return meshCache;

    const NU = Math.max(4, Math.round((P.nu || 9) * q));
    const NV = Math.max(3, Math.round(5 * q));     // steps across the front half
    const stride = NV + 1;
    const v = new Float64Array((NU + 1) * stride * 3);
    for (let iu = 0; iu <= NU; iu++) {
      const u = iu / NU;
      const x = U.lerp(P.x[0], P.x[1], u) * L;
      const rr = sampleR(P, u) * H;
      const dd = rr * P.d;
      const sy = P.wave ? P.wave(u, sway) * H : 0;
      for (let iv = 0; iv <= NV; iv++) {
        // v runs 0 (belly edge) to PI (back edge); the half nearer the viewer
        const a = (iv / NV) * Math.PI;
        const o = (iu * stride + iv) * 3;
        v[o] = x;
        v[o + 1] = sy + Math.cos(a) * rr;
        v[o + 2] = Math.sin(a) * dd;
      }
    }
    meshKey = key;
    meshCache = { v: v, NU: NU, NV: NV, stride: stride, H: H };
    return meshCache;
  }

  /* ---------------------------------------------------------- bent lathes
     The same idea as above, run along a curve instead of along a straight
     line. `spine` is a list of { x, y, r } — where the axis is at that point
     and how thick the body is there — and the cross-section is swept around
     the spine's own normal, so the facets go round a bent body the way they go
     round a straight one.

     This is what a neck needs. The alternative, and what was here, is an
     ellipse for the neck and another for the body and a seam everywhere they
     meet: at any alpha below 1 every overlap shows, and the animal reads as a
     pile of ovals rather than as one thing. A tube along a curve has no seams
     because there is only ever one surface. */
  function splineAt(pts, u, k) {
    const n = pts.length - 1;
    const f = U.clamp(u, 0, 1) * n;
    const i = Math.min(n - 1, f | 0);
    const t = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    // Catmull-Rom, so a spine can be placed by hand as a handful of joints
    return 0.5 * (2 * p1[k] +
                  (-p0[k] + p2[k]) * t +
                  (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                  (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }

  /* Control points are written in body units; sx and sy scale them into pixels
     and r is scaled by sy so a body does not change thickness when the box
     does. */
  function spineFrom(pts, steps, sx, sy) {
    /* Sampled by how much the body is doing rather than by u. Spread evenly, a
       long smooth neck eats most of the facets and the head — which is where
       all the shape is — gets two, so it comes out as a stub. Cost counts
       distance travelled and thickness changed, so the facets land where the
       animal changes and the straight runs get one long plane each, which is
       what a low-poly body is supposed to look like anyway. */
    const N = 160;
    const px = new Float64Array(N + 1), py = new Float64Array(N + 1);
    const pr = new Float64Array(N + 1), cost = new Float64Array(N + 1);
    let rMax = 0;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      px[i] = splineAt(pts, u, 0) * sx;
      py[i] = splineAt(pts, u, 1) * sy;
      pr[i] = Math.max(0.0008, splineAt(pts, u, 2)) * sy;
      if (i) {
        let turn = 0;
        if (i > 1) {
          const ax = px[i - 1] - px[i - 2], ay = py[i - 1] - py[i - 2];
          const bx = px[i] - px[i - 1], by = py[i] - py[i - 1];
          const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
          if (al > 1e-9 && bl > 1e-9) {
            turn = Math.acos(U.clamp((ax * bx + ay * by) / (al * bl), -1, 1));
          }
        }
        rMax = Math.max(rMax, pr[i]);
        /* Distance covered, thickness changed, and corner turned. Without the
           last one a bend gets one facet and a curved neck comes out as a
           zigzag; with it the curve gets the planes it needs and the straight
           runs still get one each. */
        cost[i] = cost[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]) +
                  Math.abs(pr[i] - pr[i - 1]) * 3 + turn * rMax * 7;
      }
    }
    const total = cost[N] || 1;
    const out = new Array(steps + 1);
    let j = 0;
    for (let i = 0; i <= steps; i++) {
      const want = (i / steps) * total;
      while (j < N && cost[j + 1] < want) j++;
      const span = cost[j + 1] - cost[j];
      const t = span > 1e-9 ? (want - cost[j]) / span : 0;
      const k = Math.min(N, j + 1);
      out[i] = { x: U.lerp(px[j], px[k], t),
                 y: U.lerp(py[j], py[k], t),
                 r: U.lerp(pr[j], pr[k], t) };
    }
    return out;
  }

  /* The radius of the circle the spine is turning on here, near enough. Two
     segments and the angle between them give it: a straight run has no bend
     and no limit, a hairpin has almost none. */
  function bendLimit(spine, i) {
    const a = spine[Math.max(0, i - 1)], b = spine[i], c = spine[Math.min(spine.length - 1, i + 1)];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const ul = Math.hypot(ux, uy), vl = Math.hypot(vx, vy);
    if (ul < 1e-6 || vl < 1e-6) return Infinity;
    const cosA = U.clamp((ux * vx + uy * vy) / (ul * vl), -1, 1);
    const turn = Math.acos(cosA);
    if (turn < 1e-4) return Infinity;
    return ((ul + vl) / 2 / turn) * 0.92;
  }

  function tubeMesh(spine, d, NV, H) {
    const NU = spine.length - 1;
    NV = Math.max(3, NV || 5);
    const stride = NV + 1;
    const v = new Float64Array((NU + 1) * stride * 3);
    const cs = new Float64Array((NU + 1) * stride);
    for (let iu = 0; iu <= NU; iu++) {
      const p = spine[iu];
      const a0 = spine[Math.max(0, iu - 1)], a1 = spine[Math.min(NU, iu + 1)];
      let tx = a1.x - a0.x, ty = a1.y - a0.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = ty, ny = -tx;                 // points to the body's back
      /* A tube cannot be thicker than the bend it is going round. Past that
         the inside of the curve folds through itself and the surface comes out
         as a row of shards — which is exactly what a body drawn round a tight
         coil did. Cap the radius at the local turn instead, so a hard bend
         narrows rather than inverting. */
      const r = Math.min(p.r, bendLimit(spine, iu));
      for (let iv = 0; iv <= NV; iv++) {
        const a = (iv / NV) * Math.PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        const o = (iu * stride + iv) * 3;
        v[o] = p.x - nx * ca * r;
        v[o + 1] = p.y - ny * ca * r;
        v[o + 2] = sa * r * d;
        // 0 at the belly edge, 1 at the back, following the body round the bend
        cs[iu * stride + iv] = (1 - ca) / 2;
      }
    }
    return { v: v, NU: NU, NV: NV, stride: stride, H: H, cs: cs };
  }

  /* The boundary of the front half is the belly run out and the back run home,
     which is exactly the silhouette — and it is made of straight pieces. */
  function meshOutline(ctx, m) {
    const v = m.v, s = m.stride, NV = m.NV;
    ctx.beginPath();
    for (let iu = 0; iu <= m.NU; iu++) {
      const o = (iu * s) * 3;
      if (iu === 0) ctx.moveTo(v[o], v[o + 1]); else ctx.lineTo(v[o], v[o + 1]);
    }
    for (let iu = m.NU; iu >= 0; iu--) {
      const o = (iu * s + NV) * 3;
      ctx.lineTo(v[o], v[o + 1]);
    }
    ctx.closePath();
  }

  /* Flat shading. Every quad takes one colour off its own normal, and is then
     stroked in that colour as well — abutting fills antialias against each
     other and leave a hairline of background between them otherwise. */
  function shadeMesh(ctx, m, back, mid, belly, spec, seed) {
    const v = m.v, s = m.stride, NU = m.NU, NV = m.NV;
    const rnd = VF.rng.make(seed);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.5, m.H * 0.025);
    for (let iu = 0; iu < NU; iu++) {
      for (let iv = 0; iv < NV; iv++) {
        const o0 = (iu * s + iv) * 3, o1 = ((iu + 1) * s + iv) * 3;
        const o2 = ((iu + 1) * s + iv + 1) * 3, o3 = (iu * s + iv + 1) * 3;
        // the diagonal alternates, so the facets do not all lean the same way
        const flip = (iu + iv) & 1;
        const tris = flip ? [[o0, o1, o2], [o0, o2, o3]]
                          : [[o0, o1, o3], [o1, o2, o3]];
        for (let k = 0; k < 2; k++) {
          const a = tris[k][0], b = tris[k][1], c = tris[k][2];
          const ax = v[b] - v[a], ay = v[b + 1] - v[a + 1], az = v[b + 2] - v[a + 2];
          const bx = v[c] - v[a], by = v[c + 1] - v[a + 1], bz = v[c + 2] - v[a + 2];
          let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
          const nm = Math.hypot(nx, ny, nz) || 1;
          nx /= nm; ny /= nm; nz /= nm;
          if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }

          const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          /* Counter-shading from the pigment: dark along the back, pale along
             the belly. Read off the triangle's own height rather than its row,
             so the two halves of a quad differ here as well. */
          const my = (v[a + 1] + v[b + 1] + v[c + 1]) / 3;
          /* A bent body carries its own: on a neck standing straight up the
             back is the left edge, not the top, and reading it off the screen
             would put the dark on the head and the pale at the shoulder. */
          const t = m.cs
            ? (m.cs[a / 3] + m.cs[b / 3] + m.cs[c / 3]) / 3
            : U.clamp(0.5 - my / (m.H * 2.0), 0, 1);         // 0 belly .. 1 back
          let col = t < 0.5 ? U.mixRgb(belly, mid, t * 2) : U.mixRgb(mid, back, (t - 0.5) * 2);
          // then the light, with enough range in it to see a plane turn
          col = U.shade(col, (-0.90 + 1.15 * lam) * (0.90 + rnd() * 0.20));
          if (spec > 0) {
            const sp = Math.pow(lam, 11) * spec;
            if (sp > 0.01) col = U.mixRgb(col, [255, 255, 255], Math.min(0.55, sp));
          }
          // and the grazing edge takes the deep tone, the way a real one does
          col = U.mixRgb(col, back, Math.pow(1 - nz, 4) * 0.5);

          const css = U.rgbToCss(col);
          ctx.fillStyle = css;
          ctx.strokeStyle = css;
          ctx.beginPath();
          ctx.moveTo(v[a], v[a + 1]);
          ctx.lineTo(v[b], v[b + 1]);
          ctx.lineTo(v[c], v[c + 1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  /* The shapes that are not a lathe — a ray is a wing, a jelly is a bell — keep
     the outline they were drawn with and take the facets as a clipped grid
     instead, with the normal guessed from how far up the shape a facet sits.
     Not a model, but it breaks the flat gradient the same way. */
  function facetFill(ctx, L, H, back, mid, belly, spec, seed) {
    const rnd = VF.rng.make(seed);
    const cell = Math.max(5, H * 0.38);
    const x0 = -L * 0.62, x1 = L * 0.62, y0 = -H * 1.30, y1 = H * 1.30;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1;
    for (let y = y0; y < y1; y += cell) {
      for (let x = x0; x < x1; x += cell) {
        // each cell is split into two triangles so the grid does not read as
        // a grid; the diagonal alternates
        for (let tri = 0; tri < 2; tri++) {
          const flip = ((x / cell + y / cell) | 0) % 2;
          const pts = (tri ^ flip)
            ? [[x, y], [x + cell, y], [x + cell, y + cell]]
            : [[x, y], [x + cell, y + cell], [x, y + cell]];
          const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
          const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
          const ny = U.clamp(cy / (H * 1.05), -1, 1);
          const nxr = U.clamp(cx / (L * 0.62), -1, 1) * 0.45;
          const nz = Math.sqrt(Math.max(0.02, 1 - ny * ny - nxr * nxr));
          const lam = Math.max(0, nxr * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const t = U.clamp(0.5 - ny * 0.5, 0, 1);
          let col = t < 0.5 ? U.mixRgb(belly, mid, t * 2) : U.mixRgb(mid, back, (t - 0.5) * 2);
          col = U.shade(col, (-0.86 + 1.10 * lam) * (0.90 + rnd() * 0.20));
          if (spec > 0) {
            const sp = Math.pow(lam, 9) * spec;
            if (sp > 0.01) col = U.mixRgb(col, [255, 255, 255], Math.min(0.45, sp));
          }
          const css = U.rgbToCss(col);
          ctx.fillStyle = css; ctx.strokeStyle = css;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(pts[1][0], pts[1][1]);
          ctx.lineTo(pts[2][0], pts[2][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  /* ------------------------------------------------------------- bodies
     Each returns the path on ctx and reports its bounding half-height. */

  function bodyPath(ctx, kind, L, sway, rnd) {
    const H = L * bodyRatio(kind);

    /* If the kind is one of the lathed ones its outline is the boundary of the
       mesh, so the silhouette, the clip and the drawn body are all the same
       object rather than three that have to be kept agreeing. */
    const m = meshFor(kind, L, H, sway, 1);
    if (m) { meshOutline(ctx, m); return H; }

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
    const fan = FIN && rays && rays.len > 0 && rays.a1 !== rays.a0;

    /* A fin is a membrane stretched on spines, and it folds between them. One
       smooth radial wash across the whole thing gives a flat triangle sitting
       next to a modelled body; panels between the spines, each catching the
       light at its own angle, give a fin. */
    if (fan) {
      ctx.fillStyle = U.rgbToCss(U.shade(FIN.base, -0.20));
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      /* The sweep goes all the way round the root rather than following the
         ray angles, because those point along the spines and a tail's spines
         point away from the tail. Clipped to the fin, the panels that land on
         it are the ones that show. */
      const N = 18, reach = rays.len * 2.2;
      for (let i = 0; i < N; i++) {
        const b0 = (i / N) * TAU, b1 = ((i + 1) / N) * TAU;
        const bm = (b0 + b1) / 2;
        // alternate panels lean toward the viewer and away from them
        const lean = (i & 1) ? 0.46 : -0.46;
        const nx = Math.cos(bm + Math.PI / 2) * lean;
        const ny = Math.sin(bm + Math.PI / 2) * lean;
        const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        ctx.fillStyle = U.rgbToCss(U.shade(FIN.base, -0.66 + 1.05 * lam));
        ctx.beginPath();
        ctx.moveTo(rays.x, rays.y);
        ctx.lineTo(rays.x + Math.cos(b0) * reach, rays.y + Math.sin(b0) * reach);
        ctx.lineTo(rays.x + Math.cos(b1) * reach, rays.y + Math.sin(b1) * reach);
        ctx.closePath();
        ctx.fill();
      }
      /* One wash over the top of the panels puts the membrane back: thick and
         opaque where it leaves the body, thinning at the trailing edge. */
      const wash = ctx.createRadialGradient(rays.x, rays.y, 0, rays.x, rays.y, rays.len * 1.35);
      wash.addColorStop(0, U.rgbToCss(U.shade(FIN.base, -0.28), 0.55));
      wash.addColorStop(0.5, U.rgbToCss(FIN.base, 0.12));
      wash.addColorStop(1, U.rgbToCss(U.mixRgb(FIN.base, FIN.tip, 0.5), 0.42));
      ctx.fillStyle = wash;
      ctx.fill(path);
      ctx.restore();
    } else if (FIN && rays && rays.len > 0) {
      const g = ctx.createRadialGradient(rays.x, rays.y, 0, rays.x, rays.y, rays.len * 1.02);
      g.addColorStop(0, U.rgbToCss(U.shade(FIN.base, -0.30)));
      g.addColorStop(0.45, U.rgbToCss(FIN.base));
      g.addColorStop(1, U.rgbToCss(U.mixRgb(FIN.base, FIN.tip, 0.42), 0.62));
      ctx.fillStyle = g;
      ctx.fill(path);
    } else {
      ctx.fillStyle = col;
      ctx.fill(path);
    }
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

  /* A limb, as a solid rather than as a line with a cap on the end. Points are
     already in pixels: [x, y, radius]. Used wherever something has an arm, a
     leg or a claw, so those come out modelled like the body they hang off
     instead of as strokes with an ellipse stuck on the end. */
  function limbTube(ctx, pts, d, H, base, tip, spec, seed) {
    const spine = spineFrom(pts, Math.max(3, pts.length - 1), 1, 1);
    const m = tubeMesh(spine, d, 3, H);
    shadeMesh(ctx, m, U.shade(base, -0.34), base,
              U.mixRgb(tip || base, [255, 255, 255], 0.14), spec, seed);
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
        /* Eight walking legs and two claws, every one a tapered solid. What
           was here was a round-capped stroke per leg and a plain ellipse for
           each claw — which is the whole complaint: a crab drawn as sticks
           with an oval on the end of each arm. A claw is two tapered fingers
           meeting at a hinge, and it only looks like a claw if it is built
           that way. */
        const legBase = baseRgb || U.hexToRgb('#888888');
        const legTip = tipRgb || legBase;
        ctx.globalAlpha = alpha;
        for (let side = -1; side <= 1; side += 2) {
          for (let j = 0; j < 4; j++) {
            const x = L * (0.14 - j * 0.15);
            const reach = H * (0.95 + j * 0.12);
            const th = Math.max(0.9, L * 0.016) * (1 - j * 0.10);
            limbTube(ctx, [
              [x, side * H * 0.52, th * 1.25],
              [x - L * 0.06, side * reach * 0.60, th],
              [x - L * 0.14, side * reach * 0.92, th * 0.72],
              [x - L * 0.22, side * reach + sway * 2, th * 0.20]
            ], 0.40, H, legBase, legTip, 0.26, 0x3a1 + j * 7 + (side + 1) * 31);
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const ex = L * 0.30, ey = side * H * 1.05;      // elbow
          const cx = L * 0.49, cy = side * H * 0.88;      // the hinge
          const aw = Math.max(1.2, L * 0.026);
          // shoulder to elbow to hinge, one piece
          limbTube(ctx, [
            [L * 0.18, side * H * 0.48, aw * 1.15],
            [ex, ey, aw],
            [(ex + cx) / 2, (ey + cy) / 2, aw * 0.92],
            [cx, cy, aw * 0.80]
          ], 0.40, H, legBase, legTip, 0.26, 0x9c4 + (side + 1) * 17);

          /* A palm with two fingers off it. The heavy one is fixed and the
             light one closes onto it, and the wedge of nothing between them is
             the entire reason the shape reads as a claw. */
          const rot = -side * 0.42;
          const ux = Math.cos(rot), uy = Math.sin(rot);
          const px = -uy, py = ux;
          const at = function (a, b2, r) {
            return [cx + ux * a + px * b2 * side, cy + uy * a + py * b2 * side, r];
          };
          limbTube(ctx, [
            at(-L * 0.03, 0, aw * 1.5), at(L * 0.03, H * 0.02, aw * 2.2),
            at(L * 0.09, H * 0.02, aw * 1.9), at(L * 0.13, H * 0.01, aw * 1.2)
          ], 0.38, H, legBase, legTip, 0.26, 0x2f7 + (side + 1) * 5);
          // the fixed finger, along the underside
          limbTube(ctx, [
            at(L * 0.08, H * 0.055, aw * 1.35), at(L * 0.15, H * 0.075, aw * 1.05),
            at(L * 0.22, H * 0.070, aw * 0.62), at(L * 0.28, H * 0.045, aw * 0.16)
          ], 0.34, H, legBase, legTip, 0.26, 0x71e + (side + 1) * 5);
          // and the one that moves, held a little open
          limbTube(ctx, [
            at(L * 0.08, -H * 0.050, aw * 1.15), at(L * 0.15, -H * 0.085, aw * 0.88),
            at(L * 0.21, -H * 0.070, aw * 0.52), at(L * 0.26, -H * 0.020, aw * 0.14)
          ], 0.34, H, U.shade(legBase, -0.12), legTip, 0.26, 0x4b2 + (side + 1) * 5);
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
          /* Plates standing off the back, each one a solid taking the light
             off its own lean. Eight identical strokes read as a comb glued on;
             a row of triangles with two tones reads as part of the animal. */
          ctx.globalAlpha = 0.92;
          for (let j = 0; j < 8; j++) {
            const k = j / 8, k2 = (j + 1) / 8;
            const x = U.lerp(L * 0.30, -L * 0.30, k);
            const x2 = U.lerp(L * 0.30, -L * 0.30, k2);
            const h2 = H * (0.34 + Math.sin(k * 4) * 0.22);
            const lean = j & 1 ? 0.16 : -0.10;
            // the lit face
            ctx.fillStyle = U.rgbToCss(U.mixRgb(accRgb, [255, 255, 255], 0.30 - lean));
            ctx.beginPath();
            ctx.moveTo(x, -H * 0.70);
            ctx.lineTo(x - L * 0.018 + h2 * lean, -H * 0.70 - h2);
            ctx.lineTo((x + x2) / 2, -H * 0.70);
            ctx.closePath();
            ctx.fill();
            // and the one turned away from it
            ctx.fillStyle = U.rgbToCss(U.shade(accRgb, -0.42));
            ctx.beginPath();
            ctx.moveTo((x + x2) / 2, -H * 0.70);
            ctx.lineTo(x - L * 0.018 + h2 * lean, -H * 0.70 - h2);
            ctx.lineTo(x2, -H * 0.70);
            ctx.closePath();
            ctx.fill();
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

    /* The modelling. A lathed body is shaded facet by facet off its own
       normals; the shapes that are not a lathe take a clipped facet grid
       instead. Either way the smooth gradient underneath is only there to
       stop a seam showing, and what you actually see is planes. */
    const spec = 0.30 + 0.55 * (pal.fx.metal ? 1 : 0) + glow * 0.10;
    /* Only the absence stays flat — it is not a surface, it is the lack of
       one. Everything else is a body and gets facets, including the two that
       were sitting here as a single smooth gradient inside an outline. */
    const faceted = art.body !== 'hole';
    if (faceted && detail) {
      const mesh = meshFor(art.body, L, H, sway, size >= 90 ? 1 : 0.62);
      if (mesh) shadeMesh(ctx, mesh, back, c1, belly, spec, hash(fish.id) ^ 0x2f1a);
      else facetFill(ctx, L, H, back, c1, belly, spec, hash(fish.id) ^ 0x2f1a);
    }

    /* Scales over facets is two surface treatments arguing with each other,
       and the planes are the ones doing the modelling. Where the body is
       faceted the scales come back only as a whisper of tooth. */
    if (detail && SCALED[art.body]) {
      const scaleAlpha = faceted ? 0.30 : 1;
      ctx.save();
      ctx.globalAlpha = scaleAlpha;
      scaleTexture(ctx, L, H, U.rgbToCss(U.shade(c2, -0.5)), rnd, art.body === 'round');
      ctx.restore();
    }

    /* A specular band across the whole flank would flatten the facets back
       out, so a faceted body takes its highlight per plane and only the
       un-faceted ones get the band. */
    if (!faceted || !detail) {
      const sp = ctx.createLinearGradient(0, -H * 0.95, 0, H * 0.10);
      sp.addColorStop(0, U.rgbToCss(c3, 0));
      sp.addColorStop(0.42, U.rgbToCss(U.mixRgb(c3, [255, 255, 255], 0.35), 0.18));
      sp.addColorStop(1, U.rgbToCss(c3, 0));
      ctx.fillStyle = sp;
      ctx.fillRect(-L, -H * 1.2, L * 2, H * 1.4);
    }

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
     Two things in the water that are not fish, and the only two that have a
     skeleton worth building. Both are made the same way: a set of tubes run
     along hand-placed spines, meeting at shared joints, shaded flat off the
     same key light as everything else.

     What this replaced was a pile of ellipses — three humps over a body under
     a neck beside a flipper — each one its own fill. At full opacity the
     overlaps merely looked wrong; at the alpha the surfacing silhouette uses,
     every overlap showed as a lighter patch and the animal came apart into the
     ovals it was made of. A tube has no seams because there is only one
     surface, and the parts that do meet meet inside each other. */

  /* Control points are [x, y, r]: x and y in body units off the centre, r the
     radius there. The whole animal is one run from the tip of the tail to the
     end of the snout, so the coils, the back, the shoulder, the neck and the
     head are the same piece of her. */
  const NESSIE_SPINE = [
    [-0.58,  0.52, 0.012],   // the tail, well under and going away
    [-0.45,  0.41, 0.050],
    [-0.31,  0.33, 0.092],   // a low coil breaking the surface
    [-0.16,  0.40, 0.142],   // and down again
    [ 0.02,  0.26, 0.198],   // her back, the largest thing showing
    [ 0.18,  0.32, 0.148],   // sloping away to the shoulder
    [ 0.28,  0.04, 0.090],   // where the neck leaves the water
    [ 0.24, -0.26, 0.072],   // and bows back on itself
    [ 0.25, -0.52, 0.061],
    [ 0.31, -0.70, 0.063],   // the base of the skull
    [ 0.39, -0.77, 0.082],   // the skull
    [ 0.48, -0.79, 0.052],   // the snout
    [ 0.55, -0.76, 0.013]    // and the end of her
  ];

  /* A pair of paddles rather than a pair of ovals: each one is its own short
     tube, rooted inside the body so the join is buried. */
  const NESSIE_FINS = [
    { root: [ 0.12, 0.33], pts: [[0, 0, 0.052], [0.07, 0.08, 0.078], [0.14, 0.15, 0.062], [0.19, 0.20, 0.020]], d: 0.34, sw: 0.07 },
    { root: [-0.10, 0.38], pts: [[0, 0, 0.044], [-0.06, 0.07, 0.066], [-0.12, 0.13, 0.050], [-0.16, 0.17, 0.016]], d: 0.34, sw: 0.04 }
  ];

  /* Every limb is a tube and every joint is shared, so an elbow is one surface
     bending rather than two slabs crossing. x and y are both in half-height
     units — a person's proportions belong to the person, not to the box. */
  const HUMAN_PARTS = [
    { id: 'legL', d: 'limb', pts: [[-0.082, 0.08, 0.086], [-0.096, 0.42, 0.060], [-0.100, 0.72, 0.045], [-0.086, 0.93, 0.038]] },
    { id: 'legR', d: 'limb', pts: [[ 0.082, 0.08, 0.086], [ 0.098, 0.42, 0.060], [ 0.102, 0.72, 0.045], [ 0.088, 0.93, 0.038]] },
    { id: 'armL', d: 'limb', pts: [[-0.196, -0.38, 0.054], [-0.232, -0.13, 0.041], [-0.234, 0.13, 0.032], [-0.224, 0.25, 0.024]] },
    { id: 'armR', d: 'limb', pts: [[ 0.196, -0.38, 0.054], [ 0.232, -0.13, 0.041], [ 0.234, 0.13, 0.032], [ 0.224, 0.25, 0.024]] },
    { id: 'torso', d: 'torso', pts: [[0, 0.18, 0.146], [0, 0.02, 0.142], [0, -0.16, 0.182], [0, -0.34, 0.222], [0, -0.46, 0.146], [0, -0.55, 0.060]] },
    { id: 'head', d: 'head', pts: [[0, -0.52, 0.050], [0, -0.62, 0.098], [0, -0.73, 0.120], [0, -0.84, 0.100], [0, -0.91, 0.032]] }
  ];

  /* How many facets long. A stout fish is nine and the serpent — the longest
     body in the game — is twenty-two, and that coarseness is as much of the
     look as the flatness is: finely tessellated is smooth, and smooth is the
     one thing this game is not. These sit in the same range, measured against
     how long the animal is rather than how many joints it has. */
  const BEING_STEPS = { nessie: 20, human: 6 };

  /* How deep a body is against how tall. The fish sit between 0.22 and 0.46 —
     they are plates with folds in them, seen side on, and that flatness is the
     whole look. A tube at 0.9 is a cylinder: the shading wraps all the way
     round it, there is a specular band down the middle, and it reads as a 3D
     render dropped into a flat picture. Everything here stays in the fishes'
     range so a neck is a folded ribbon like everything else. */
  const BEING_D = { body: 0.38, fin: 0.26, limb: 0.36, torso: 0.32, head: 0.44 };

  /* The waterline. Above it she is lit; below it the same facets are shaded
     down and cooled, which is what makes the coils read as being under
     something rather than as a paler shape laid over the top. */
  const NESSIE_WATER = 0.36;
  const DEEP_WATER = [10, 22, 30];

  /* Every tube the creature is made of, in pixels, back to front. */
  function beingTubes(kind, L, H, tm) {
    const out = [];
    if (kind === 'human') {
      const lean = Math.sin(tm * 0.9) * 0.006;
      for (let i = 0; i < HUMAN_PARTS.length; i++) {
        const part = HUMAN_PARTS[i];
        const pts = part.pts.map(function (p, k) {
          // the breath is in the spine, so the whole figure moves as one
          return [p[0], p[1] + (p[1] < 0 ? lean * (k + 1) : 0), p[2]];
        });
        out.push({ id: part.id, d: BEING_D[part.d],
                   trunk: part.id === 'torso' || part.id === 'head',
                   spine: spineFrom(pts, BEING_STEPS.human, H, H) });
      }
      return out;
    }

    const sway = Math.sin(tm * 0.7) * 0.030;
    const body = NESSIE_SPINE.map(function (p, i) {
      const u = i / (NESSIE_SPINE.length - 1);
      /* The coils breathe and the neck sways, and both are the same motion
         travelling along her: the further from the water the more of it. */
      const swell = Math.sin(tm * 0.9 + u * 5.2) * 0.014 * (1 - u * 0.4);
      return [p[0] + sway * Math.max(0, u - 0.5) * 1.4, p[1] + swell, p[2]];
    });
    /* The paddles go down first, so where they meet her the body covers the
       join — the same order a fish's fins are drawn in, and the reason a fin
       can have its own edge without drawing a line through the body. */
    for (let i = 0; i < NESSIE_FINS.length; i++) {
      const f = NESSIE_FINS[i];
      const beat = Math.sin(tm * 1.1 + i * 2.0) * f.sw;
      const pts = f.pts.map(function (p, k) {
        return [f.root[0] + p[0], f.root[1] + p[1] + beat * k * 0.5, p[2]];
      });
      out.push({ id: 'fin' + i, d: BEING_D.fin, spine: spineFrom(pts, 4, L, H) });
    }
    out.push({ id: 'body', d: BEING_D.body, trunk: true,
              spine: spineFrom(body, BEING_STEPS.nessie, L, H) });
    return out;
  }

  /* One path holding every part. A flat fill of this is the silhouette, and
     because it is a single fill the overlaps cannot show through each other at
     any alpha — which is the bug that made her look assembled. */
  function beingSilhouette(ctx, kind, L, H, tm, only) {
    const tubes = beingTubes(kind, L, H, tm);
    ctx.beginPath();
    for (let i = 0; i < tubes.length; i++) {
      // `only` takes the trunk on its own, for the edge that runs along a back
      if (only && !tubes[i].trunk) continue;
      const m = tubeMesh(tubes[i].spine, tubes[i].d, 3, H);
      const v = m.v, st = m.stride;
      for (let iu = 0; iu <= m.NU; iu++) {
        const o = (iu * st) * 3;
        if (iu === 0) ctx.moveTo(v[o], v[o + 1]); else ctx.lineTo(v[o], v[o + 1]);
      }
      for (let iu = m.NU; iu >= 0; iu--) {
        const o = (iu * st + m.NV) * 3;
        ctx.lineTo(v[o], v[o + 1]);
      }
      ctx.closePath();
    }
  }

  /* The edge every fish gets: lit along the back, shadow through the middle, a
     little bounce off the belly. Measured across the part's own height — taken
     across the whole animal instead, an arm hanging at chest height sits in the
     lit end of the ramp for its whole length and comes out with a bright line
     down each side. Drawn in part order, so a piece laid down later covers the
     edge of the piece it sits on, which is how a flipper can have its own
     outline without drawing a line across the body. */
  function edgeStroke(ctx, pal, m, L) {
    const v = m.v;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < v.length; i += 3) { if (v[i] < y0) y0 = v[i]; if (v[i] > y1) y1 = v[i]; }
    if (!(y1 > y0)) { y0 = -1; y1 = 1; }
    const eg = ctx.createLinearGradient(0, y0, 0, y1);
    eg.addColorStop(0.00, U.rgbToCss(U.mixRgb(pal.r3, [255, 255, 255], 0.45), 0.42));
    eg.addColorStop(0.34, U.rgbToCss(U.shade(pal.r2, -0.45), 0.36));
    eg.addColorStop(0.74, U.rgbToCss(U.shade(pal.r2, -0.45), 0.24));
    eg.addColorStop(1.00, U.rgbToCss(U.mixRgb(pal.r1, [255, 255, 255], 0.30), 0.30));
    ctx.strokeStyle = eg;
    ctx.lineWidth = Math.max(0.7, L * 0.0055);
    ctx.lineJoin = 'round';
    const st = m.stride;
    ctx.beginPath();
    for (let iu = 0; iu <= m.NU; iu++) {
      const o = (iu * st) * 3;
      if (iu === 0) ctx.moveTo(v[o], v[o + 1]); else ctx.lineTo(v[o], v[o + 1]);
    }
    for (let iu = m.NU; iu >= 0; iu--) {
      const o = (iu * st + m.NV) * 3;
      ctx.lineTo(v[o], v[o + 1]);
    }
    ctx.closePath();
    ctx.stroke();
  }

  /* The lit model. */
  function beingModel(ctx, kind, L, H, art, pal, tm, q) {
    const tubes = beingTubes(kind, L, H, tm);
    const back = U.shade(pal.r1, -0.42);
    const mid = pal.r1;
    const belly = U.mixRgb(pal.r2, [255, 255, 255], 0.10);
    // the same key the fish take, so nothing here is shinier than the rest
    const spec = 0.30 + (art.glow || 0) * 0.10;
    const NV = 3;                      // three panels across, like a fish's

    if (kind === 'nessie') {
      const waterY = H * NESSIE_WATER;
      /* Twice through the same mesh, split at the surface. Same facets, same
         normals — only the palette changes at the line, so there is no seam to
         see and the parts under the water are genuinely under it. */
      const passes = [
        { y0: -H * 4, y1: waterY, back: back, mid: mid, belly: belly, spec: spec },
        /* Under the surface. Darker and colder, and pulled toward the deep
           rather than toward her own accent — mixing toward the accent is how
           the submerged half ended up brighter than the half in the air, which
           is the wrong way round in every body of water there is. */
        { y0: waterY, y1: H * 4,
          back: U.mixRgb(U.shade(back, -0.52), DEEP_WATER, 0.42),
          mid: U.mixRgb(U.shade(mid, -0.56), DEEP_WATER, 0.46),
          belly: U.mixRgb(U.shade(belly, -0.58), DEEP_WATER, 0.44), spec: spec * 0.12 }
      ];
      for (let i = 0; i < tubes.length; i++) {
        const m = tubeMesh(tubes[i].spine, tubes[i].d, NV, H);
        for (let pi = 0; pi < passes.length; pi++) {
          const pass = passes[pi];
          ctx.save();
          ctx.beginPath();
          ctx.rect(-L * 1.2, pass.y0, L * 2.4, pass.y1 - pass.y0);
          ctx.clip();
          shadeMesh(ctx, m, pass.back, pass.mid, pass.belly, pass.spec, 0x4e55 + i);
          ctx.restore();
        }
        // only the trunk: the ramp runs back-to-belly, and on a limb standing
        // upright that puts the lit end at both ends and outlines the whole
        // thing, which is a wireframe rather than a body
        if (tubes[i].trunk) edgeStroke(ctx, pal, m, L);
      }
      nessieHead(ctx, tubes[tubes.length - 1].spine, L, H, pal, tm);
      waterCut(ctx, kind, L, H, waterY, pal, tm);
      return;
    }

    for (let i = 0; i < tubes.length; i++) {
      const t = tubes[i];
      const m = tubeMesh(t.spine, t.d, NV, H);
      // the limbs sit behind the trunk, so they take a little less light
      const k = (t.id === 'torso' || t.id === 'head') ? 1 : 0.86;
      shadeMesh(ctx, m, U.shade(back, (k - 1) * 0.9), U.shade(mid, (k - 1) * 0.9),
                U.shade(belly, (k - 1) * 0.9), spec * k, 0x51aa + i);
      if (t.trunk) edgeStroke(ctx, pal, m, L);
    }
    humanFace(ctx, L, H, pal, tm);
  }

  /* The one part of her that is not a lathe: a jaw, and an eye. Both are hung
     off the far end of the same spine, so they travel with the head instead of
     being placed at a remembered coordinate. */
  function nessieHead(ctx, spine, L, H, pal, tm) {
    const n = spine.length - 1;
    const a = spine[n - 3], b = spine[n];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = ty, ny = -tx;
    const jaw = spine[n - 2];
    const hh = H * 0.075;

    // the mouth line, cut into the underside of the snout
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = U.rgbToCss(U.shade(pal.r1, -0.62));
    ctx.lineWidth = Math.max(0.7, H * 0.011);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(jaw.x - nx * jaw.r * 0.35, jaw.y - ny * jaw.r * 0.35);
    ctx.lineTo(b.x - nx * hh * 0.12, b.y - ny * hh * 0.12);
    ctx.stroke();
    ctx.restore();

    // the eye, set back and high on the skull
    const e = spine[n - 3];
    const ex = e.x + nx * e.r * 0.20 + tx * hh * 0.30;
    const ey = e.y + ny * e.r * 0.20 + ty * hh * 0.30;
    ctx.fillStyle = U.rgbToCss(U.shade(pal.r3, -0.55));
    ctx.beginPath();
    ctx.ellipse(ex, ey, hh * 0.30, hh * 0.24, Math.atan2(ty, tx), 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.rgbToCss(U.mixRgb(pal.r3, [255, 255, 255], 0.55));
    ctx.beginPath();
    ctx.arc(ex - hh * 0.05, ey - hh * 0.05, hh * 0.11, 0, TAU);
    ctx.fill();

    /* A crest of low plates down the back of the neck, which is most of what
       separates a neck from a hose. Each one is a flat triangle taking the
       light off its own lean. */
    const crestFrom = Math.round(spine.length * 0.56);
    for (let i = crestFrom; i < spine.length - 4; i += 2) {
      const p = spine[i], q = spine[i + 1];
      let dx = q.x - p.x, dy = q.y - p.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const px = dy, py = -dx;
      const h2 = p.r * (0.55 + 0.30 * Math.sin(i * 1.7 + tm * 0.6));
      ctx.fillStyle = U.rgbToCss(U.shade(pal.r2, -0.18 + (i % 4 === 0 ? 0.10 : 0)));
      ctx.beginPath();
      ctx.moveTo(p.x + px * p.r * 0.92, p.y + py * p.r * 0.92);
      ctx.lineTo(p.x + px * (p.r + h2) - dx * h2 * 0.5,
                 p.y + py * (p.r + h2) - dy * h2 * 0.5);
      ctx.lineTo(q.x + px * q.r * 0.92, q.y + py * q.r * 0.92);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* Where she goes into the water: a bright line on the surface and a short
     disturbance either side of it. Not an ellipse laid over her — the parts
     below are already shaded as submerged, so this only has to be the line. */
  function waterCut(ctx, kind, L, H, waterY, pal, tm) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* The bright part is only where she actually crosses it, so it is clipped
       to her — a band drawn straight across the frame is a stripe over the
       picture, which is what it looked like. */
    ctx.save();
    beingSilhouette(ctx, kind, L, H, tm);
    ctx.clip();
    const g = ctx.createLinearGradient(0, waterY - H * 0.038, 0, waterY + H * 0.038);
    g.addColorStop(0, U.rgbToCss(pal.r3, 0));
    g.addColorStop(0.5, U.rgbToCss(U.mixRgb(pal.r3, [255, 255, 255], 0.45), 0.20));
    g.addColorStop(1, U.rgbToCss(pal.r3, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-L, waterY - H * 0.038, L * 2, H * 0.076);
    ctx.restore();

    // and the water she is displacing, only as far out as she reaches
    const g2 = ctx.createRadialGradient(0, waterY, 0, 0, waterY, L * 0.52);
    g2.addColorStop(0, U.rgbToCss(pal.r3, 0.10));
    g2.addColorStop(1, U.rgbToCss(pal.r3, 0));
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(0, waterY, L * 0.52, H * 0.055 * (1 + Math.sin(tm * 0.8) * 0.12), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* A face, at the scale a face is actually seen at from a boat: two dark
     sockets, a mouth, and the hair that is the one detail anybody reports. */
  function humanFace(ctx, L, H, pal, tm) {
    const cy = -H * 0.74;
    const r = H * 0.115;
    ctx.save();
    // hair, over the crown and down the back of the skull
    ctx.fillStyle = U.rgbToCss(U.shade(pal.r3, -0.20));
    ctx.beginPath();
    ctx.moveTo(-r * 1.02, cy + r * 0.30);
    ctx.quadraticCurveTo(-r * 1.20, cy - r * 1.30, 0, cy - r * 1.22);
    ctx.quadraticCurveTo(r * 1.20, cy - r * 1.30, r * 1.02, cy + r * 0.30);
    ctx.quadraticCurveTo(r * 0.86, cy - r * 0.28, 0, cy - r * 0.42);
    ctx.quadraticCurveTo(-r * 0.86, cy - r * 0.28, -r * 1.02, cy + r * 0.30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = U.rgbToCss(U.shade(pal.r1, -0.70));
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.ellipse(i * r * 0.38, cy + r * 0.02, r * 0.17, r * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.ellipse(0, cy + r * 0.56, r * 0.26, r * 0.09 * (1 + Math.sin(tm * 0.8) * 0.3), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
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

    beingModel(ctx, art.being, L, H, art, pal, tm, size >= 90 ? 1 : 0.62);

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
      const H0 = L * bodyRatio('being', art.being);
      const flatB = U.rgbToCss(U.mixRgb([2, 3, 6], U.shade(U.hexToRgb(art.c1), -0.40), lb * 0.85));
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 0.8 : alpha;
      /* One path, one fill. Every part of her is a subpath of it, so the
         coils, the flippers and the neck cannot show through each other —
         which at this alpha is exactly what they used to do, and is why what
         came up out of the dark looked like a stack of ovals. */
      beingSilhouette(ctx, art.being, L, H0, 0);
      ctx.fillStyle = flatB;
      ctx.fill();
      /* And the thin edge where the surface light lands, once she is near it —
         the same one every fish gets. Only along the trunk: stroking the whole
         silhouette follows every subpath, so it would draw the flippers' own
         edges straight through the body. */
      if (lb > 0.15) {
        beingSilhouette(ctx, art.being, L, H0, 0, true);
        ctx.strokeStyle = U.rgbToCss(U.mixRgb(U.hexToRgb(art.c3), [190, 215, 245], 0.5), 0.30 * lb);
        ctx.lineWidth = Math.max(0.7, L * 0.005);
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
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
