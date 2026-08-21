/* VOID FISHING — thumbnails for cosmetics, drawn from their slot and config. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;

  function draw(ctx, cos, w, h, t) {
    t = t || 0;
    const cx = w / 2, cy = h / 2;
    const S = Math.min(w, h) * 0.34;
    const c = cos.c || {};
    ctx.save();
    ctx.translate(cx, cy);

    switch (cos.slot) {
      case 'rodSkin': {
        const fake = { art: Object.assign({ c1: '#7a5c3a', c2: '#4a3722', grip: '#2a1f14',
                                            tip: '#c8a878', len: 1, curve: 0.1, glow: 0,
                                            style: 'plain' }, c) };
        ctx.translate(-w / 2, -h / 2);
        VF.rodArt.preview(ctx, fake, w, h, t);
        break;
      }
      case 'bobber': {
        const r = S * 0.95;
        if (c.glow) {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
          g.addColorStop(0, U.rgbToCss(U.hexToRgb(c.bot), 0.4));
          g.addColorStop(1, U.rgbToCss(U.hexToRgb(c.bot), 0));
          ctx.fillStyle = g;
          ctx.fillRect(-r * 3, -r * 3, r * 6, r * 6);
        }
        if (c.hole) {
          ctx.fillStyle = '#05030a';
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = U.rgbToCss(U.hexToRgb(c.bot), 0.8);
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        } else {
          ctx.fillStyle = c.top || '#c8402f';
          ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, TAU); ctx.fill();
          ctx.fillStyle = c.bot || '#e8e4dc';
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        }
        if (c.eye) {
          ctx.fillStyle = '#f4efe4';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0a0810';
          ctx.beginPath(); ctx.arc(Math.sin(t) * r * 0.1, 0, r * 0.2, 0, TAU); ctx.fill();
        }
        if (c.star) {
          ctx.fillStyle = '#fff6d0';
          for (let i = 0; i < 4; i++) {
            const a = t * 0.6 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.5, r * 0.10, a, 0, TAU);
            ctx.fill();
          }
        }
        if (c.sheen) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.26, r * 0.16, -0.5, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'line': {
        ctx.strokeStyle = c.col || '#ffffff';
        ctx.globalAlpha = c.a === undefined ? 0.5 : c.a;
        ctx.lineWidth = c.glow ? 2.4 : 1.6;
        if (c.glow) { ctx.shadowColor = c.col; ctx.shadowBlur = 8; }
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const x = -w * 0.36 + (i / 24) * w * 0.72;
          const amp = c.pulse ? Math.sin(i * 0.5 - t * 3) * h * 0.10 : 0;
          const y = Math.sin(i * 0.32 + t * 0.6) * h * 0.14 + amp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        break;
      }
      case 'splash': case 'cast': case 'catchFx': {
        const col = c.col || [200, 228, 248];
        const n = (c.n || 1) * 9;
        const rnd = VF.rng.make(VF.fishArt.hash(cos.id));
        if (c.halo || c.ring) {
          ctx.strokeStyle = U.rgbToCss(col, 0.5);
          ctx.lineWidth = 1.4;
          for (let i = 0; i < (c.ring || 1); i++) {
            const rr = S * (0.7 + i * 0.45) * (1 + Math.sin(t * 1.2 + i) * 0.06);
            ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.42, 0, 0, TAU); ctx.stroke();
          }
        }
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU;
          const d = S * (0.25 + rnd() * 1.15);
          const bob = Math.sin(t * 2 + i) * S * 0.08;
          ctx.globalAlpha = 0.35 + rnd() * 0.55;
          ctx.fillStyle = U.rgbToCss(col);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.7 + bob, S * (0.05 + rnd() * 0.10), 0, TAU);
          ctx.fill();
        }
        if (c.tail) {
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = U.rgbToCss(col);
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-S * 1.3, S * 0.5);
          ctx.quadraticCurveTo(0, -S * 0.3, S * 1.3, -S * 0.7);
          ctx.stroke();
        }
        if (c.shard) {
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = U.rgbToCss(col);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + t * 0.3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * S * 0.5, Math.sin(a) * S * 0.4);
            ctx.lineTo(Math.cos(a + 0.2) * S * 1.4, Math.sin(a + 0.2) * S * 1.0);
            ctx.lineTo(Math.cos(a - 0.2) * S * 1.2, Math.sin(a - 0.2) * S * 0.9);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'theme': {
        const ink = c.ink || '#e9eff6';
        const accent = c.accent || '#7fa8c8';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-w * 0.36, -h * 0.30, w * 0.72, h * 0.60);
        ctx.strokeStyle = U.rgbToCss(U.hexToRgb(ink), 0.22);
        ctx.strokeRect(-w * 0.36, -h * 0.30, w * 0.72, h * 0.60);
        ctx.fillStyle = accent;
        ctx.fillRect(-w * 0.30, -h * 0.20, w * 0.26, h * 0.055);
        ctx.fillStyle = U.rgbToCss(U.hexToRgb(ink), 0.55);
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(-w * 0.30, -h * 0.06 + i * h * 0.10, w * (0.5 - i * 0.09), h * 0.035);
        }
        if (c.glitch) {
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 12);
          ctx.fillStyle = '#66ffe0';
          ctx.fillRect(-w * 0.30 + 2, -h * 0.20, w * 0.26, h * 0.055);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'outfit': {
        ctx.translate(0, h * 0.30);
        const fh = h * 0.80;
        VF.anglerArt.draw(ctx, c, fh, t, true);
        break;
      }
    }
    ctx.restore();
  }

  VF.cosmeticArt = { draw: draw };
})(window.VF = window.VF || {});
