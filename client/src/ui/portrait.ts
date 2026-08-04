import { SKIN_TONES, type MyPlayer } from '@hoops/shared';
import { jerseyColors } from '../state/store.ts';
import { el } from './dom.ts';

/**
 * Draws a MyPlayer portrait procedurally. Nothing is loaded from disk, so the
 * look of a build is derived entirely from its own data.
 */
export function drawPortrait(canvas: HTMLCanvasElement, player: MyPlayer, size = 96): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const [primary, secondary] = jerseyColors(player.loadout.jerseyId);
  const skin = SKIN_TONES[player.body.skinTone] ?? SKIN_TONES[3];
  const s = size / 100;

  // Backdrop wedge.
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, shade(primary, -0.55));
  g.addColorStop(1, shade(primary, -0.82));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = hexA(secondary, 0.16);
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, size * 0.34);
  ctx.lineTo(size, size);
  ctx.closePath();
  ctx.fill();

  // Shoulders / jersey.
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(size * 0.14, size);
  ctx.quadraticCurveTo(size * 0.5, size * 0.6, size * 0.86, size);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(size * 0.36, size * 0.86);
  ctx.quadraticCurveTo(size * 0.5, size * 0.74, size * 0.64, size * 0.86);
  ctx.stroke();

  // Neck + head.
  ctx.fillStyle = shade(skin, -0.18);
  ctx.fillRect(size * 0.43, size * 0.6, size * 0.14, size * 0.16);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.46, size * 0.17, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair.
  const hair = hairShape(player.body.hairstyleId);
  if (hair !== 'bald') {
    ctx.fillStyle = '#1c1310';
    ctx.beginPath();
    if (hair === 'afro') {
      ctx.arc(size * 0.5, size * 0.36, size * 0.235, Math.PI, Math.PI * 2);
    } else if (hair === 'tall') {
      ctx.ellipse(size * 0.5, size * 0.33, size * 0.18, size * 0.14, 0, Math.PI, Math.PI * 2);
      ctx.rect(size * 0.44, size * 0.22, size * 0.12, size * 0.12);
    } else {
      ctx.ellipse(size * 0.5, size * 0.38, size * 0.175, size * 0.115, 0, Math.PI, Math.PI * 2);
    }
    ctx.fill();
    if (hair === 'long') {
      ctx.fillRect(size * 0.32, size * 0.38, size * 0.06, size * 0.24);
      ctx.fillRect(size * 0.62, size * 0.38, size * 0.06, size * 0.24);
    }
  }

  // Facial hair.
  if (player.body.facialHairId !== 'face-none') {
    ctx.fillStyle = 'rgba(24,16,12,0.8)';
    if (player.body.facialHairId === 'face-mustache') {
      ctx.fillRect(size * 0.44, size * 0.53, size * 0.12, size * 0.022);
    } else {
      ctx.beginPath();
      ctx.ellipse(size * 0.5, size * 0.56, size * 0.11, size * 0.075, 0, 0, Math.PI);
      ctx.fill();
    }
  }

  // Eyes.
  ctx.fillStyle = 'rgba(18,12,10,0.85)';
  ctx.fillRect(size * 0.435, size * 0.455, size * 0.035, size * 0.022);
  ctx.fillRect(size * 0.53, size * 0.455, size * 0.035, size * 0.022);

  // Face-scan placeholder marker.
  if (player.body.faceScanId) {
    ctx.strokeStyle = 'rgba(62,240,122,0.75)';
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(size * 0.3, size * 0.24, size * 0.4, size * 0.44);
    ctx.setLineDash([]);
  }
}

export function portraitEl(player: MyPlayer, size = 96): HTMLCanvasElement {
  const canvas = el('canvas', {}) as HTMLCanvasElement;
  drawPortrait(canvas, player, size);
  return canvas;
}

function hairShape(id: string): 'short' | 'afro' | 'long' | 'tall' | 'bald' {
  switch (id) {
    case 'hair-bald':
      return 'bald';
    case 'hair-afro':
      return 'afro';
    case 'hair-braids':
    case 'hair-locs':
      return 'long';
    case 'hair-topknot':
      return 'tall';
    default:
      return 'short';
  }
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = toRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function hexA(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws an original team crest from its procedural descriptor. */
export function drawCrest(
  canvas: HTMLCanvasElement,
  crest: { shape: string; glyph: string; motif: string },
  primary: string,
  accent: string,
  size = 64,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const c = size / 2;
  ctx.save();
  ctx.beginPath();
  switch (crest.shape) {
    case 'circle':
      ctx.arc(c, c, size * 0.44, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(c, size * 0.05);
      ctx.lineTo(size * 0.95, c);
      ctx.lineTo(c, size * 0.95);
      ctx.lineTo(size * 0.05, c);
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * size * 0.45;
        const y = c + Math.sin(a) * size * 0.45;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      break;
    case 'blade':
      ctx.moveTo(size * 0.1, size * 0.1);
      ctx.lineTo(size * 0.9, size * 0.22);
      ctx.lineTo(size * 0.72, size * 0.92);
      ctx.lineTo(size * 0.14, size * 0.7);
      break;
    default:
      ctx.moveTo(size * 0.12, size * 0.1);
      ctx.lineTo(size * 0.88, size * 0.1);
      ctx.lineTo(size * 0.88, size * 0.58);
      ctx.quadraticCurveTo(size * 0.88, size * 0.9, c, size * 0.96);
      ctx.quadraticCurveTo(size * 0.12, size * 0.9, size * 0.12, size * 0.58);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, primary);
  g.addColorStop(1, shade(primary, -0.45));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.045;
  ctx.stroke();
  ctx.clip();

  // Motif band.
  ctx.strokeStyle = hexA(accent, 0.55);
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  switch (crest.motif) {
    case 'bolt':
      ctx.moveTo(size * 0.58, size * 0.12);
      ctx.lineTo(size * 0.36, size * 0.52);
      ctx.lineTo(size * 0.54, size * 0.52);
      ctx.lineTo(size * 0.36, size * 0.9);
      break;
    case 'wave':
      for (let i = 0; i <= 20; i++) {
        const x = (i / 20) * size;
        const y = c + Math.sin((i / 20) * Math.PI * 3) * size * 0.12;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      break;
    case 'ring':
      ctx.arc(c, c, size * 0.28, 0, Math.PI * 2);
      break;
    case 'peak':
      ctx.moveTo(size * 0.16, size * 0.72);
      ctx.lineTo(c, size * 0.28);
      ctx.lineTo(size * 0.84, size * 0.72);
      break;
    case 'orbit':
      ctx.ellipse(c, c, size * 0.34, size * 0.14, Math.PI / 5, 0, Math.PI * 2);
      break;
    case 'claw':
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(c + i * size * 0.16, size * 0.22);
        ctx.lineTo(c + i * size * 0.22, size * 0.74);
      }
      break;
    case 'flame':
      ctx.moveTo(c, size * 0.18);
      ctx.quadraticCurveTo(size * 0.82, c, c, size * 0.86);
      ctx.quadraticCurveTo(size * 0.18, c, c, size * 0.18);
      break;
    default:
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * size * 0.3;
        const y = c + Math.sin(a) * size * 0.3;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
  }
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = `900 ${size * 0.3}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.08;
  ctx.fillText(crest.glyph, c, c + size * 0.02);
  ctx.restore();
}
