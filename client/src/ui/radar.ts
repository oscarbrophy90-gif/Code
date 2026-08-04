import { ATTRIBUTE_META, type Attributes, type AttributeKey } from '@hoops/shared';
import { el } from './dom.ts';

export interface RadarAxis {
  label: string;
  /** attributes averaged into this axis */
  keys: AttributeKey[];
}

/** Seven axes summarise nineteen attributes without becoming unreadable. */
export const RADAR_AXES: RadarAxis[] = [
  { label: 'Outside', keys: ['threePoint', 'midRange', 'freeThrow'] },
  { label: 'Inside', keys: ['closeShot', 'layup', 'dunk'] },
  { label: 'Handles', keys: ['ballHandle', 'passAccuracy'] },
  { label: 'Athletic', keys: ['speed', 'acceleration', 'vertical'] },
  { label: 'Strength', keys: ['strength', 'stamina'] },
  { label: 'Perim D', keys: ['perimeterDefense', 'steal'] },
  { label: 'Int D', keys: ['interiorDefense', 'block', 'offensiveRebound', 'defensiveRebound'] },
];

export function axisValue(attrs: Attributes, axis: RadarAxis): number {
  return axis.keys.reduce((sum, k) => sum + attrs[k], 0) / axis.keys.length;
}

/**
 * Attribute graph. Draws the current spread against the build's ceiling so a
 * player can see both what they are and what they could become.
 */
export function drawRadar(
  canvas: HTMLCanvasElement,
  attrs: Attributes,
  caps: Attributes | null,
  size = 260,
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

  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = size * 0.27;
  const n = RADAR_AXES.length;
  const angleFor = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  // Ratings below 25 never occur, so the web starts there rather than at zero.
  const norm = (v: number) => Math.max(0, Math.min(1, (v - 25) / 74));

  // Web rings.
  ctx.strokeStyle = 'rgba(98,110,134,0.22)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = angleFor(i % n);
      const r = (radius * ring) / 4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Spokes.
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
  }

  const polygon = (values: number[], fill: string, stroke: string, width: number, dash: number[] = []) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angleFor(i);
      const r = radius * values[i];
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash(dash);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Ceiling first, so the current spread reads on top of it.
  if (caps) {
    polygon(RADAR_AXES.map((ax) => norm(axisValue(caps, ax))), 'rgba(255,122,61,0.07)', 'rgba(255,122,61,0.5)', 1.4, [4, 4]);
  }
  polygon(RADAR_AXES.map((ax) => norm(axisValue(attrs, ax))), 'rgba(62,240,122,0.2)', '#3ef07a', 2);

  // Vertices.
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    const r = radius * norm(axisValue(attrs, RADAR_AXES[i]));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#3ef07a';
    ctx.fill();
  }

  // Labels with the numeric value, so the graph is readable without a legend.
  ctx.font = '800 9.5px Inter, system-ui, sans-serif';
  for (let i = 0; i < n; i++) {
    const a = angleFor(i);
    const lx = cx + Math.cos(a) * (radius + 20);
    const ly = cy + Math.sin(a) * (radius + 20);
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#97a2b8';
    ctx.fillText(RADAR_AXES[i].label.toUpperCase(), lx, ly - 5);
    ctx.fillStyle = '#eef2f8';
    ctx.font = '900 11px Inter, system-ui, sans-serif';
    ctx.fillText(String(Math.round(axisValue(attrs, RADAR_AXES[i]))), lx, ly + 6);
    ctx.font = '800 9.5px Inter, system-ui, sans-serif';
  }
}

export function radarEl(attrs: Attributes, caps: Attributes | null, size = 260): HTMLElement {
  const canvas = el('canvas', { style: 'display:block;margin:0 auto' }) as HTMLCanvasElement;
  drawRadar(canvas, attrs, caps, size);
  return canvas;
}

export { ATTRIBUTE_META };
