/* VOID FISHING — objects pulled out of the water, drawn from their icon type. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;

  function draw(ctx, t, size, tm) {
    const col = U.hexToRgb(t.color);
    const S = size;
    ctx.save();

    // everything sits in a soft pool of its own colour
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 2.6);
    g.addColorStop(0, U.rgbToCss(col, 0.24));
    g.addColorStop(1, U.rgbToCss(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-S * 2.6, -S * 2.6, S * 5.2, S * 5.2);

    const line = U.rgbToCss(U.shade(col, -0.45));
    const face = U.rgbToCss(col);
    const lit = U.rgbToCss(U.shade(col, 0.35));
    ctx.lineWidth = Math.max(1, S * 0.045);
    ctx.strokeStyle = line;
    ctx.lineJoin = 'round';

    switch (t.icon) {
      case 'coin': {
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * S * 0.42, y = Math.abs(i - 1) * S * 0.22;
          ctx.fillStyle = i === 1 ? lit : face;
          ctx.beginPath(); ctx.ellipse(x, y, S * 0.46, S * 0.46, 0, 0, TAU); ctx.fill();
          ctx.stroke();
          ctx.beginPath(); ctx.ellipse(x, y, S * 0.26, S * 0.26, 0, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'bottle': {
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.moveTo(-S * 0.22, -S * 0.9);
        ctx.lineTo(S * 0.22, -S * 0.9);
        ctx.lineTo(S * 0.22, -S * 0.45);
        ctx.quadraticCurveTo(S * 0.58, -S * 0.2, S * 0.55, S * 0.55);
        ctx.quadraticCurveTo(S * 0.5, S * 0.95, 0, S * 0.95);
        ctx.quadraticCurveTo(-S * 0.5, S * 0.95, -S * 0.55, S * 0.55);
        ctx.quadraticCurveTo(-S * 0.58, -S * 0.2, -S * 0.22, -S * 0.45);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8dcc0';
        ctx.fillRect(-S * 0.3, -S * 0.05, S * 0.6, S * 0.55);
        ctx.strokeRect(-S * 0.3, -S * 0.05, S * 0.6, S * 0.55);
        ctx.fillStyle = U.rgbToCss(U.shade(col, -0.3));
        ctx.fillRect(-S * 0.24, -S * 1.05, S * 0.48, S * 0.2);
        break;
      }
      case 'shell': {
        ctx.fillStyle = face;
        ctx.beginPath();
        for (let a = 0; a < TAU * 2.6; a += 0.12) {
          const r = S * 0.12 + a * S * 0.16;
          const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        break;
      }
      case 'box': {
        ctx.fillStyle = face;
        ctx.fillRect(-S * 0.75, -S * 0.45, S * 1.5, S * 0.95);
        ctx.strokeRect(-S * 0.75, -S * 0.45, S * 1.5, S * 0.95);
        ctx.strokeStyle = lit;
        for (let i = 0; i < 5; i++) {
          const x = -S * 0.55 + i * S * 0.28;
          ctx.beginPath();
          ctx.moveTo(x, S * 0.35);
          ctx.quadraticCurveTo(x + S * 0.10, -S * 0.1, x - S * 0.04, -S * 0.32);
          ctx.stroke();
        }
        break;
      }
      case 'ring': {
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(2, S * 0.16);
        ctx.beginPath(); ctx.ellipse(0, S * 0.12, S * 0.62, S * 0.66, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = lit;
        ctx.beginPath();
        ctx.moveTo(0, -S * 0.95); ctx.lineTo(S * 0.24, -S * 0.6);
        ctx.lineTo(0, -S * 0.3); ctx.lineTo(-S * 0.24, -S * 0.6);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'fossil': {
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.ellipse(0, 0, S * 0.9, S * 0.72, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = U.rgbToCss(U.shade(col, -0.5));
        ctx.lineWidth = Math.max(1, S * 0.05);
        ctx.beginPath();
        ctx.moveTo(-S * 0.55, S * 0.1);
        ctx.quadraticCurveTo(0, -S * 0.42, S * 0.55, S * 0.02);
        ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const x = -S * 0.5 + i * S * 0.17;
          ctx.beginPath();
          ctx.moveTo(x, S * 0.06 - Math.abs(i - 3) * S * 0.03);
          ctx.lineTo(x - S * 0.04, S * 0.36 - Math.abs(i - 3) * S * 0.05);
          ctx.stroke();
        }
        break;
      }
      case 'crystal': {
        for (let i = -1; i <= 1; i++) {
          const h = S * (1.0 - Math.abs(i) * 0.32);
          const x = i * S * 0.42;
          ctx.fillStyle = i === 0 ? lit : face;
          ctx.beginPath();
          ctx.moveTo(x, -h);
          ctx.lineTo(x + S * 0.26, -h * 0.32);
          ctx.lineTo(x + S * 0.16, S * 0.75);
          ctx.lineTo(x - S * 0.16, S * 0.75);
          ctx.lineTo(x - S * 0.26, -h * 0.32);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'key': {
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(2, S * 0.15);
        ctx.beginPath(); ctx.arc(-S * 0.42, 0, S * 0.36, 0, TAU); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-S * 0.06, 0); ctx.lineTo(S * 0.85, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(S * 0.62, 0); ctx.lineTo(S * 0.62, S * 0.34);
        ctx.moveTo(S * 0.82, 0); ctx.lineTo(S * 0.82, S * 0.24);
        ctx.stroke();
        break;
      }
      case 'plate': {
        ctx.fillStyle = face;
        ctx.fillRect(-S * 0.8, -S * 0.6, S * 1.6, S * 1.2);
        ctx.strokeRect(-S * 0.8, -S * 0.6, S * 1.6, S * 1.2);
        ctx.strokeStyle = U.rgbToCss(U.shade(col, -0.5));
        ctx.lineWidth = Math.max(1, S * 0.035);
        for (let i = 0; i < 6; i++) {
          const y = -S * 0.4 + i * S * 0.17;
          ctx.beginPath();
          ctx.moveTo(-S * 0.62, y);
          ctx.lineTo(-S * 0.62 + S * (0.5 + ((i * 37) % 60) / 100), y);
          ctx.stroke();
        }
        break;
      }
      case 'lens': {
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(2, S * 0.14);
        ctx.beginPath(); ctx.arc(0, 0, S * 0.7, 0, TAU); ctx.stroke();
        const lg = ctx.createRadialGradient(-S * 0.2, -S * 0.2, 0, 0, 0, S * 0.7);
        lg.addColorStop(0, 'rgba(255,255,255,0.35)');
        lg.addColorStop(1, U.rgbToCss(col, 0.28));
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(0, 0, S * 0.66, 0, TAU); ctx.fill();
        break;
      }
      case 'chart': {
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.moveTo(-S * 0.85, -S * 0.62);
        ctx.lineTo(S * 0.85, -S * 0.55);
        ctx.lineTo(S * 0.72, S * 0.62);
        ctx.lineTo(-S * 0.78, S * 0.55);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = U.rgbToCss(U.shade(col, -0.45));
        ctx.lineWidth = Math.max(1, S * 0.03);
        ctx.beginPath();
        ctx.moveTo(-S * 0.6, S * 0.2);
        ctx.quadraticCurveTo(-S * 0.1, -S * 0.3, S * 0.55, S * 0.05);
        ctx.stroke();
        ctx.strokeStyle = '#e05a5a';
        ctx.lineWidth = Math.max(1.4, S * 0.05);
        const cx = S * 0.34, cy = -S * 0.22;
        ctx.beginPath(); ctx.arc(cx, cy, S * 0.14, 0, TAU); ctx.stroke();
        break;
      }
      case 'shard': {
        ctx.fillStyle = '#08040f';
        ctx.beginPath();
        ctx.moveTo(0, -S * 1.0);
        ctx.lineTo(S * 0.42, -S * 0.1);
        ctx.lineTo(S * 0.18, S * 0.9);
        ctx.lineTo(-S * 0.34, S * 0.42);
        ctx.lineTo(-S * 0.3, -S * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = face; ctx.lineWidth = Math.max(1.2, S * 0.05);
        ctx.stroke();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(tm * 2);
        ctx.strokeStyle = lit;
        ctx.beginPath();
        ctx.moveTo(-S * 0.1, -S * 0.6); ctx.lineTo(S * 0.06, S * 0.1); ctx.lineTo(-S * 0.06, S * 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'lantern': {
        ctx.strokeStyle = face; ctx.lineWidth = Math.max(1.4, S * 0.06);
        ctx.beginPath(); ctx.arc(0, -S * 0.95, S * 0.24, Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = U.rgbToCss(U.shade(col, -0.45));
        ctx.fillRect(-S * 0.5, -S * 0.7, S * 1.0, S * 0.18);
        ctx.fillRect(-S * 0.5, S * 0.55, S * 1.0, S * 0.2);
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.75);
        fg.addColorStop(0, 'rgba(255,240,200,0.95)');
        fg.addColorStop(0.5, U.rgbToCss(col, 0.5));
        fg.addColorStop(1, U.rgbToCss(col, 0));
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(0, -S * 0.05, S * 0.75, 0, TAU); ctx.fill();
        ctx.strokeStyle = face;
        ctx.strokeRect(-S * 0.42, -S * 0.55, S * 0.84, S * 1.1);
        break;
      }
      case 'eye': {
        const open = 0.55 + 0.12 * Math.sin(tm * 0.7);
        ctx.fillStyle = '#f4f0e6';
        ctx.beginPath();
        ctx.ellipse(0, 0, S * 1.0, S * 1.0 * open, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = line; ctx.stroke();
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.arc(Math.sin(tm * 0.4) * S * 0.12, 0, S * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#08060e';
        ctx.beginPath(); ctx.arc(Math.sin(tm * 0.4) * S * 0.12, 0, S * 0.2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(-S * 0.2, -S * 0.2, S * 0.1, 0, TAU); ctx.fill();
        break;
      }
      case 'rod': {
        // a rod, wrapped, as it comes up: you cannot tell which one yet
        const a = -0.72;
        const dx = Math.cos(a), dy = Math.sin(a);
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(1.4, S * 0.13);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-dx * S * 1.15, -dy * S * 1.15);
        ctx.lineTo(dx * S * 1.25, dy * S * 1.25);
        ctx.stroke();
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(1, S * 0.07);
        ctx.beginPath();
        ctx.moveTo(-dx * S * 1.10, -dy * S * 1.10);
        ctx.lineTo(dx * S * 1.20, dy * S * 1.20);
        ctx.stroke();
        // the wrapping that has kept it together down there
        ctx.strokeStyle = lit;
        ctx.lineWidth = Math.max(0.8, S * 0.05);
        for (let i = 0; i < 5; i++) {
          const u = -0.5 + i * 0.34;
          const x = dx * S * u, y = dy * S * u;
          ctx.beginPath();
          ctx.moveTo(x + dy * S * 0.16, y - dx * S * 0.16);
          ctx.lineTo(x - dy * S * 0.16, y + dx * S * 0.16);
          ctx.stroke();
        }
        // the reel, and a short length of line still on it
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.arc(-dx * S * 0.72 + dy * S * 0.30, -dy * S * 0.72 - dx * S * 0.30, S * 0.28, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(0.8, S * 0.045);
        ctx.stroke();
        break;
      }
      default: { /* strange */
        ctx.strokeStyle = face;
        ctx.lineWidth = Math.max(1.2, S * 0.05);
        const rnd = VF.rng.make(0xBEEF);
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = 0.45 + 0.4 * Math.sin(tm * 1.4 + i);
          ctx.beginPath();
          let x = (rnd() - 0.5) * S, y = (rnd() - 0.5) * S;
          ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (rnd() - 0.5) * S * 1.1; y += (rnd() - 0.5) * S * 1.1;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
    }
    ctx.restore();
  }

  VF.treasureArt = { draw: draw };
})(window.VF = window.VF || {});
