/* VOID FISHING — pooled particle system.
   Fixed-size pool, no allocation during the frame loop. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const MAX = 900;

  const p = {
    x: new Float32Array(MAX), y: new Float32Array(MAX),
    vx: new Float32Array(MAX), vy: new Float32Array(MAX),
    life: new Float32Array(MAX), max: new Float32Array(MAX),
    size: new Float32Array(MAX), rot: new Float32Array(MAX),
    r: new Uint8Array(MAX), g: new Uint8Array(MAX), b: new Uint8Array(MAX),
    a: new Float32Array(MAX), kind: new Uint8Array(MAX), drag: new Float32Array(MAX),
    grav: new Float32Array(MAX)
  };
  let count = 0;
  const KIND = { MOTE: 0, RAIN: 1, SPLASH: 2, METEOR: 3, SPARK: 4, BUBBLE: 5, DUST: 6, LEAF: 7 };

  function spawn(o) {
    if (count >= MAX) {
      // recycle the oldest-looking slot rather than dropping the effect entirely
      let worst = 0, wv = Infinity;
      for (let i = 0; i < 24; i++) {
        const j = (Math.random() * count) | 0;
        if (p.life[j] < wv) { wv = p.life[j]; worst = j; }
      }
      release(worst);
    }
    const i = count++;
    p.x[i] = o.x; p.y[i] = o.y;
    p.vx[i] = o.vx || 0; p.vy[i] = o.vy || 0;
    p.max[i] = p.life[i] = o.life || 1;
    p.size[i] = o.size || 2;
    p.rot[i] = o.rot || 0;
    const c = o.color || [255, 255, 255];
    p.r[i] = c[0]; p.g[i] = c[1]; p.b[i] = c[2];
    p.a[i] = o.alpha === undefined ? 1 : o.alpha;
    p.kind[i] = o.kind || 0;
    p.drag[i] = o.drag === undefined ? 0.6 : o.drag;
    p.grav[i] = o.grav || 0;
    return i;
  }

  function release(i) {
    const last = --count;
    if (i !== last) {
      p.x[i] = p.x[last]; p.y[i] = p.y[last]; p.vx[i] = p.vx[last]; p.vy[i] = p.vy[last];
      p.life[i] = p.life[last]; p.max[i] = p.max[last]; p.size[i] = p.size[last];
      p.rot[i] = p.rot[last]; p.r[i] = p.r[last]; p.g[i] = p.g[last]; p.b[i] = p.b[last];
      p.a[i] = p.a[last]; p.kind[i] = p.kind[last]; p.drag[i] = p.drag[last]; p.grav[i] = p.grav[last];
    }
  }

  function update(dt, w, h, waterY) {
    for (let i = count - 1; i >= 0; i--) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) { release(i); continue; }
      p.vy[i] += p.grav[i] * dt;
      const d = Math.pow(p.drag[i], dt);
      p.vx[i] *= d; p.vy[i] *= d;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;

      const k = p.kind[i];
      if (k === KIND.RAIN && p.y[i] >= waterY) {
        // rain hitting the water throws a tiny splash
        if (Math.random() < 0.35) {
          spawn({ x: p.x[i], y: waterY, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 45,
                  life: 0.28, size: 1.1, color: [200, 225, 240], alpha: 0.5, kind: KIND.SPLASH, grav: 180 });
        }
        release(i); continue;
      }
      if (k === KIND.MOTE || k === KIND.DUST) {
        // gentle drift, wraps around the viewport so the field never empties
        if (p.x[i] < -20) p.x[i] = w + 20;
        else if (p.x[i] > w + 20) p.x[i] = -20;
        if (p.y[i] < -20) p.y[i] = h + 20;
        else if (p.y[i] > h + 20) p.y[i] = -20;
      }
    }
  }

  function draw(ctx) {
    for (let i = 0; i < count; i++) {
      const t = p.life[i] / p.max[i];
      const k = p.kind[i];
      let alpha = p.a[i];
      if (k === KIND.MOTE || k === KIND.DUST) alpha *= Math.min(1, t * 4) * (0.55 + 0.45 * Math.sin(p.rot[i] + p.life[i] * 2.2));
      else alpha *= t < 0.25 ? t / 0.25 : 1;
      if (alpha <= 0.004) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgb(' + p.r[i] + ',' + p.g[i] + ',' + p.b[i] + ')';

      if (k === KIND.RAIN) {
        // streak length follows fall speed, so heavy rain reads as heavy rain
        const len = Math.max(5, p.vy[i] * 0.022);
        ctx.fillRect(p.x[i], p.y[i], p.size[i] > 1.1 ? 1.6 : 1, len);
      } else if (k === KIND.METEOR) {
        const len = p.size[i] * 9;
        const nx = p.vx[i], ny = p.vy[i];
        const m = Math.hypot(nx, ny) || 1;
        ctx.beginPath();
        ctx.moveTo(p.x[i], p.y[i]);
        ctx.lineTo(p.x[i] - nx / m * len, p.y[i] - ny / m * len);
        ctx.lineWidth = p.size[i];
        ctx.strokeStyle = 'rgb(' + p.r[i] + ',' + p.g[i] + ',' + p.b[i] + ')';
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        const s = p.size[i] * (k === KIND.SPARK ? t : 1);
        if (s < 1.2) ctx.fillRect(p.x[i] - s * 0.5, p.y[i] - s * 0.5, s, s);
        else { ctx.beginPath(); ctx.arc(p.x[i], p.y[i], s, 0, U.TAU); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ emitters */

  function burst(x, y, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const a = opts.angle === undefined ? Math.random() * U.TAU
              : opts.angle + (Math.random() - 0.5) * (opts.spread || 1.2);
      const sp = U.lerp(opts.speedMin || 40, opts.speedMax || 160, Math.random());
      spawn({
        x: x + (Math.random() - 0.5) * (opts.jitter || 4),
        y: y + (Math.random() - 0.5) * (opts.jitter || 4),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: U.lerp(opts.lifeMin || 0.35, opts.lifeMax || 0.9, Math.random()),
        size: U.lerp(opts.sizeMin || 1, opts.sizeMax || 3, Math.random()),
        color: opts.color || [200, 225, 240],
        alpha: opts.alpha === undefined ? 0.85 : opts.alpha,
        kind: opts.kind === undefined ? KIND.SPLASH : opts.kind,
        drag: opts.drag === undefined ? 0.25 : opts.drag,
        grav: opts.grav === undefined ? 220 : opts.grav
      });
    }
  }

  function ambient(w, h, n, color) {
    for (let i = 0; i < n; i++) {
      spawn({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 9, vy: -3 - Math.random() * 8,
        life: 1e9, size: 0.5 + Math.random() * 1.6,
        color: color, alpha: 0.10 + Math.random() * 0.28,
        kind: KIND.MOTE, drag: 1, grav: 0, rot: Math.random() * U.TAU
      });
    }
  }

  function clearKind(k) {
    for (let i = count - 1; i >= 0; i--) if (p.kind[i] === k) release(i);
  }
  function countOf(k) {
    let n = 0;
    for (let i = 0; i < count; i++) if (p.kind[i] === k) n++;
    return n;
  }
  function clearAll() { count = 0; }

  VF.particles = {
    KIND: KIND, spawn: spawn, update: update, draw: draw,
    burst: burst, ambient: ambient, clearKind: clearKind, countOf: countOf,
    clearAll: clearAll,
    count: function () { return count; }
  };
})(window.VF = window.VF || {});
