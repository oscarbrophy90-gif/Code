import { SEASON_COVERS, type SeasonDef } from '@hoops/shared';

import { hashString } from '@hoops/shared';

/**
 * The season cover, drawn rather than shipped.
 *
 * A new season every twenty days means a new cover every twenty days, and no
 * catalogue of hand-made art survives that pace — so the cover is generated from
 * the season the same way the name is. Six layouts, two accent colours and a
 * seed off the season id give each one its own look while staying recognisably
 * the same product.
 *
 * Everything is geometry and gradients. Nothing here loads a file, which is what
 * keeps the standalone build a single HTML document.
 */
export function drawSeasonCover(canvas: HTMLCanvasElement, season: SeasonDef, t = 0): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 220;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const seed = hashString(season.id);
  const { accent, accentAlt } = season;

  // Ground: a wash from one accent to the other over the panel's dark.
  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, '#0b0e16');
  sky.addColorStop(0.55, mix('#0b0e16', accentAlt, 0.3));
  sky.addColorStop(1, mix('#0b0e16', accent, 0.42));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const design = season.cover % SEASON_COVERS;
  switch (design) {
    case 0:
      skyline(ctx, w, h, accent, accentAlt, seed);
      break;
    case 1:
      circuit(ctx, w, h, accent, accentAlt, seed, t);
      break;
    case 2:
      sunburst(ctx, w, h, accent, accentAlt, t);
      break;
    case 3:
      rooftop(ctx, w, h, accent, accentAlt, seed);
      break;
    case 4:
      girders(ctx, w, h, accent, accentAlt);
      break;
    default:
      halfCourt(ctx, w, h, accent, accentAlt);
      break;
  }

  // Vignette, so the season title always has something to sit on.
  const shade = ctx.createLinearGradient(0, h, 0, 0);
  shade.addColorStop(0, 'rgba(6,8,14,0.86)');
  shade.addColorStop(0.6, 'rgba(6,8,14,0.18)');
  shade.addColorStop(1, 'rgba(6,8,14,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}

/** City blocks against the light. */
function skyline(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string, seed: number): void {
  let n = seed;
  const rand = () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);

  glow(ctx, w * 0.7, h * 0.28, h * 0.9, accent);
  for (let layer = 0; layer < 2; layer++) {
    const base = h * (0.96 - layer * 0.06);
    ctx.fillStyle = layer === 0 ? 'rgba(8,10,18,0.92)' : mix('#0b0e16', alt, 0.22);
    let x = -10;
    while (x < w + 10) {
      const bw = 18 + rand() * 46;
      const bh = (0.2 + rand() * (layer === 0 ? 0.42 : 0.6)) * h;
      ctx.fillRect(x, base - bh, bw, bh);
      // A few lit windows on the near blocks.
      if (layer === 0 && rand() > 0.45) {
        ctx.fillStyle = `${accent}55`;
        for (let wy = base - bh + 8; wy < base - 8; wy += 12) {
          for (let wx = x + 5; wx < x + bw - 5; wx += 9) if (rand() > 0.72) ctx.fillRect(wx, wy, 3, 5);
        }
        ctx.fillStyle = 'rgba(8,10,18,0.92)';
      }
      x += bw + 5 + rand() * 8;
    }
  }
}

/** Reactive lines under the floor. */
function circuit(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string, seed: number, t: number): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * h;
    const pulse = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.7 + seed * 0.001));
    ctx.strokeStyle = `${i % 3 === 0 ? accent : alt}${toHex(pulse)}`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    let x = 0;
    let cy = y;
    while (x < w) {
      const step = 26 + ((i * 13 + x) % 40);
      x += step;
      cy += ((i + x) % 3) - 1 > 0 ? -9 : 9;
      ctx.lineTo(x, cy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Low sun and long light. */
function sunburst(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string, t: number): void {
  const cx = w * 0.5;
  const cy = h * 0.92;
  glow(ctx, cx, cy, h * 1.2, accent);
  ctx.save();
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + t * 0.12;
    ctx.strokeStyle = i % 2 === 0 ? accent : alt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
    ctx.stroke();
  }
  ctx.restore();
}

/** A hoop above the traffic. */
function rooftop(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string, seed: number): void {
  skyline(ctx, w, h * 0.8, alt, accent, seed);
  const x = w * 0.74;
  const y = h * 0.3;
  ctx.strokeStyle = 'rgba(232,238,245,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 34, y - 22, 68, 44);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 20, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,238,245,0.55)';
  ctx.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 5.5, y + 27);
    ctx.lineTo(x + i * 3, y + 46);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(232,238,245,0.7)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y + 22);
  ctx.lineTo(x, h);
  ctx.stroke();
}

/** Heavy iron and cold air. */
function girders(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string): void {
  ctx.save();
  ctx.strokeStyle = `${alt}66`;
  ctx.lineWidth = 8;
  for (let i = -1; i < 6; i++) {
    const x = (i / 5) * w;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + w * 0.16, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w * 0.16, h);
    ctx.stroke();
  }
  ctx.strokeStyle = `${accent}99`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.lineTo(w, h * 0.55);
  ctx.stroke();
  ctx.restore();
}

/** Just the lines. */
function halfCourt(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, alt: string): void {
  glow(ctx, w * 0.5, h * 1.05, h * 1.3, alt);
  ctx.save();
  ctx.strokeStyle = `${accent}cc`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 1.02, h * 0.5, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 1.02, h * 0.86, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232,238,245,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.5 - 44, h * 0.6, 88, h * 0.5);
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `${color}88`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function toHex(alpha: number): string {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
}

function mix(a: string, b: string, amount: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}
