import { COURT, type ParkDef } from '@hoops/shared';
import type { Camera } from '../engine/camera.ts';

/** Draws the park backdrop and the halfcourt itself in projected 3D. */
export class CourtRenderer {
  private crowdSeed: number[] = [];

  constructor() {
    for (let i = 0; i < 260; i++) this.crowdSeed.push(Math.random());
  }

  drawBackdrop(ctx: CanvasRenderingContext2D, park: ParkDef, w: number, h: number, time: number): void {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, park.palette.sky[0]);
    sky.addColorStop(1, park.palette.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (park.timeOfDay === 'night') this.drawStars(ctx, w, h);
    if (park.id === 'beach') this.drawSun(ctx, w, h, time);
    if (park.id === 'downtown' || park.id === 'night' || park.id === 'rooftop') this.drawSkyline(ctx, park, w, h);
    if (park.id === 'training') this.drawGymWall(ctx, park, w, h);
  }

  private drawStars(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const s = this.crowdSeed[i];
      const x = ((s * 9871) % 1) * w;
      const y = ((s * 3571) % 1) * h * 0.5;
      ctx.globalAlpha = 0.25 + ((s * 17) % 1) * 0.6;
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.restore();
  }

  private drawSun(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    const x = w * 0.78;
    const y = h * 0.2;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, h * 0.42);
    glow.addColorStop(0, 'rgba(255,244,210,0.95)');
    glow.addColorStop(0.25, 'rgba(255,214,140,0.35)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.42 + Math.sin(time * 0.6) * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSkyline(ctx: CanvasRenderingContext2D, park: ParkDef, w: number, h: number): void {
    const base = h * 0.56;
    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      const shade = layer === 0 ? 0.55 : 0.8;
      ctx.fillStyle = mix(park.palette.sky[1], '#05070b', shade);
      let x = -40 - layer * 30;
      let i = layer * 40;
      while (x < w + 40) {
        const s = this.crowdSeed[i % this.crowdSeed.length];
        const bw = 32 + s * 70;
        const bh = (48 + s * 150) * (layer === 0 ? 0.7 : 1);
        ctx.fillRect(x, base - bh + layer * 22, bw, bh + 200);
        if (park.timeOfDay === 'night' || park.timeOfDay === 'dusk') {
          ctx.fillStyle = 'rgba(255,214,120,0.5)';
          for (let wy = 0; wy < Math.floor(bh / 16); wy++) {
            for (let wx = 0; wx < Math.floor(bw / 14); wx++) {
              if ((this.crowdSeed[(i * 7 + wy * 3 + wx) % this.crowdSeed.length] ?? 0) > 0.66) {
                ctx.fillRect(x + 6 + wx * 14, base - bh + layer * 22 + 8 + wy * 16, 5, 7);
              }
            }
          }
          ctx.fillStyle = mix(park.palette.sky[1], '#05070b', shade);
        }
        x += bw + 6 + s * 14;
        i++;
      }
    }
    ctx.restore();
  }

  private drawGymWall(ctx: CanvasRenderingContext2D, park: ParkDef, w: number, h: number): void {
    ctx.fillStyle = mix(park.palette.sky[1], '#000000', 0.35);
    ctx.fillRect(0, 0, w, h * 0.62);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h * 0.62; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Floodlight banks.
    for (const lx of [w * 0.22, w * 0.78]) {
      const g = ctx.createRadialGradient(lx, h * 0.1, 2, lx, h * 0.1, h * 0.5);
      g.addColorStop(0, 'rgba(255,255,240,0.4)');
      g.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, h * 0.1, h * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Fills a world-space polygon. */
  private poly(ctx: CanvasRenderingContext2D, cam: Camera, pts: [number, number][], fill: string, y = 0): boolean {
    ctx.beginPath();
    let started = false;
    for (const [x, z] of pts) {
      const p = cam.project(x, y, z);
      if (p.depth <= 0.05) return false;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    return true;
  }

  private strokePath(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    pts: [number, number][],
    color: string,
    widthFeet: number,
    close = false,
  ): void {
    ctx.beginPath();
    let started = false;
    let scaleSum = 0;
    let n = 0;
    for (const [x, z] of pts) {
      const p = cam.project(x, 0.02, z);
      if (p.depth <= 0.05) continue;
      scaleSum += p.scale;
      n++;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (!started) return;
    if (close) ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, (scaleSum / Math.max(1, n)) * widthFeet);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  drawCourt(ctx: CanvasRenderingContext2D, cam: Camera, park: ParkDef, courtColor: string | null): void {
    const floor = courtColor ?? park.palette.floor;
    const HW = COURT.halfWidth;
    const D = COURT.playDepth;

    // Apron beyond the playing surface so the court sits in a place.
    this.poly(ctx, cam, [
      [-HW - 9, -5],
      [HW + 9, -5],
      [HW + 9, D + 10],
      [-HW - 9, D + 10],
    ], mix(floor, '#05070b', 0.55));

    // Main surface with a subtle depth gradient painted per-strip.
    const strips = 22;
    for (let i = 0; i < strips; i++) {
      const z0 = (i / strips) * D;
      const z1 = ((i + 1) / strips) * D;
      const t = i / strips;
      this.poly(
        ctx,
        cam,
        [
          [-HW, z0],
          [HW, z0],
          [HW, z1],
          [-HW, z1],
        ],
        mix(floor, park.palette.ambient, 0.06 + t * 0.1),
      );
    }

    const line = park.palette.line;

    // Paint / key.
    this.poly(ctx, cam, [
      [-COURT.keyHalfWidth, 0],
      [COURT.keyHalfWidth, 0],
      [COURT.keyHalfWidth, COURT.freeThrowZ],
      [-COURT.keyHalfWidth, COURT.freeThrowZ],
    ], hexA(park.palette.paint, 0.85), 0.01);

    // Sidelines and baseline.
    this.strokePath(ctx, cam, [
      [-HW, 0],
      [HW, 0],
      [HW, D],
      [-HW, D],
    ], line, 0.28, true);

    // Key outline + free throw circle.
    this.strokePath(ctx, cam, [
      [-COURT.keyHalfWidth, 0],
      [-COURT.keyHalfWidth, COURT.freeThrowZ],
      [COURT.keyHalfWidth, COURT.freeThrowZ],
      [COURT.keyHalfWidth, 0],
    ], line, 0.24);
    this.strokePath(ctx, cam, circle(0, COURT.freeThrowZ, 6, 44), line, 0.2, true);

    // Three point line: corners then the arc.
    const cornerZ = COURT.rimZ + Math.sqrt(Math.max(0, COURT.threeRadius ** 2 - COURT.cornerThreeX ** 2));
    this.strokePath(ctx, cam, [
      [-COURT.cornerThreeX, 0],
      [-COURT.cornerThreeX, cornerZ],
    ], line, 0.26);
    this.strokePath(ctx, cam, [
      [COURT.cornerThreeX, 0],
      [COURT.cornerThreeX, cornerZ],
    ], line, 0.26);
    this.strokePath(ctx, cam, arc(0, COURT.rimZ, COURT.threeRadius, -COURT.cornerThreeX, COURT.cornerThreeX, 64), line, 0.26);

    // Restricted area.
    this.strokePath(ctx, cam, arc(0, COURT.rimZ, COURT.restrictedRadius, -COURT.restrictedRadius, COURT.restrictedRadius, 28), hexA(line, 0.6), 0.16);

    // Half-court cut-off.
    this.strokePath(ctx, cam, [
      [-HW, D],
      [HW, D],
    ], hexA(line, 0.55), 0.22);
  }

  /** Backboard, rim and net, drawn after the floor and before the players. */
  drawHoop(ctx: CanvasRenderingContext2D, cam: Camera, park: ParkDef, netSwing: number): void {
    const bbHalf = COURT.backboardWidth / 2;
    const zb = COURT.backboardZ;
    const yTop = COURT.backboardBottomY + COURT.backboardHeight;
    const yBot = COURT.backboardBottomY;

    // Stanchion: a slim pole set behind the baseline with a short arm out to
    // the board, so it frames the hoop instead of blocking the court.
    const poleZ = -3.2;
    const base = cam.project(0, 0, poleZ);
    const bend = cam.project(0, COURT.rimY + 1.4, poleZ);
    const arm = cam.project(0, COURT.rimY + 1.4, zb - 0.3);
    if (base.depth > 0 && bend.depth > 0 && arm.depth > 0) {
      ctx.strokeStyle = '#2a3038';
      ctx.lineWidth = Math.max(2, base.scale * 0.34);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(bend.x, bend.y);
      ctx.lineTo(arm.x, arm.y);
      ctx.stroke();
    }

    // Backboard glass.
    const c1 = cam.project(-bbHalf, yTop, zb);
    const c2 = cam.project(bbHalf, yTop, zb);
    const c3 = cam.project(bbHalf, yBot, zb);
    const c4 = cam.project(-bbHalf, yBot, zb);
    if (c1.depth > 0 && c3.depth > 0) {
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(226,240,255,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,248,255,0.85)';
      ctx.lineWidth = Math.max(1.5, c1.scale * 0.16);
      ctx.stroke();

      // Inner square.
      const s1 = cam.project(-1, COURT.rimY + 1.5, zb);
      const s2 = cam.project(1, COURT.rimY + 1.5, zb);
      const s3 = cam.project(1, COURT.rimY - 0.1, zb);
      const s4 = cam.project(-1, COURT.rimY - 0.1, zb);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.strokeStyle = park.palette.accent;
      ctx.lineWidth = Math.max(1.2, c1.scale * 0.1);
      ctx.stroke();
    }

    // Rim.
    const rimPts = circle(COURT.rimX, COURT.rimZ, COURT.rimRadius, 26);
    ctx.beginPath();
    let started = false;
    let scale = 0;
    for (const [x, z] of rimPts) {
      const p = cam.project(x, COURT.rimY, z);
      if (p.depth <= 0) continue;
      scale = p.scale;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    if (started) {
      ctx.closePath();
      ctx.strokeStyle = '#ff6b2c';
      ctx.lineWidth = Math.max(2, scale * 0.19);
      ctx.stroke();
    }

    // Net: vertical strands that sway after a make.
    ctx.strokeStyle = 'rgba(245,250,255,0.62)';
    ctx.lineWidth = Math.max(0.8, scale * 0.045);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rx = COURT.rimX + Math.cos(a) * COURT.rimRadius;
      const rz = COURT.rimZ + Math.sin(a) * COURT.rimRadius;
      const swayX = Math.cos(a) * netSwing * 0.35;
      const swayZ = Math.sin(a) * netSwing * 0.35;
      const p1 = cam.project(rx, COURT.rimY, rz);
      const p2 = cam.project(
        COURT.rimX + (rx - COURT.rimX) * 0.55 + swayX,
        COURT.rimY - 1.35 - netSwing * 0.2,
        COURT.rimZ + (rz - COURT.rimZ) * 0.55 + swayZ,
      );
      if (p1.depth <= 0 || p2.depth <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ geometry

function circle(cx: number, cz: number, r: number, segments: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

/** Arc sampled between two x extents, used for the three point line. */
function arc(cx: number, cz: number, r: number, xFrom: number, xTo: number, segments: number): [number, number][] {
  const pts: [number, number][] = [];
  const a0 = Math.asin(Math.max(-1, Math.min(1, (xFrom - cx) / r)));
  const a1 = Math.asin(Math.max(-1, Math.min(1, (xTo - cx) / r)));
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return pts;
}

// -------------------------------------------------------------------- colour

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

export function hexA(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g);
    if (m) return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
