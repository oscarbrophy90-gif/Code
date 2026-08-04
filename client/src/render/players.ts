import { COURT, SKIN_TONES, type Ball, type MatchState, type SimPlayer } from '@hoops/shared';
import type { Camera } from '../engine/camera.ts';
import { hexA, mix } from './court.ts';

/**
 * Players are drawn as articulated billboards: a stick-and-slab figure whose
 * limb angles are driven by the sim state, so animation always matches what
 * the simulation actually did.
 */
export class PlayerRenderer {
  drawShadow(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, y: number, radius: number): void {
    const p = cam.project(x, 0.01, z);
    if (p.depth <= 0) return;
    const lift = 1 / (1 + y * 0.24);
    ctx.save();
    ctx.globalAlpha = 0.36 * lift;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.scale * radius * (1 / lift) * 0.9, p.scale * radius * 0.42 * (1 / lift), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    p: SimPlayer,
    time: number,
    isLocal: boolean,
    hasBall: boolean,
  ): void {
    const feet = cam.project(p.x, p.y, p.z);
    if (feet.depth <= 0.05) return;

    const heightFt = (p.cfg.heightIn / 12) * 1.06;
    const s = feet.scale;
    const px = feet.x;
    const py = feet.y;

    const skin = SKIN_TONES[p.cfg.skinTone] ?? SKIN_TONES[3];
    const jersey = p.cfg.jerseyPrimary;
    const trim = p.cfg.jerseySecondary;

    const speed = Math.hypot(p.vx, p.vz);
    const stride = Math.sin(time * (6 + speed * 0.7) + p.side * 2) * Math.min(1, speed / 9);
    const lean = Math.max(-0.5, Math.min(0.5, (p.vx * Math.cos(p.facing) - p.vz * Math.sin(p.facing)) / 22));

    // Pose selection straight off the sim state.
    let armLift = 0;
    let crouch = 0;
    let spread = 1;
    switch (p.state) {
      case 'shooting': {
        const t = p.shotProfile ? Math.min(1, p.shotElapsed / p.shotProfile.meterDuration) : 0;
        armLift = 0.35 + t * 0.85;
        crouch = 0.22 * (1 - t);
        break;
      }
      case 'finishing':
      case 'airborne':
        armLift = 1.25;
        break;
      case 'contesting':
        armLift = 1.4;
        spread = 1.25;
        break;
      case 'staggered':
        crouch = 0.5;
        spread = 1.5;
        break;
      case 'stealing':
        armLift = 0.55;
        spread = 1.35;
        break;
      case 'moveLock':
        crouch = 0.34;
        spread = 1.2;
        break;
      case 'celebrating':
        armLift = 1.3 + Math.sin(time * 6) * 0.2;
        break;
      default:
        crouch = hasBall ? 0.2 : 0.12;
    }

    const bodyH = heightFt * (1 - crouch * 0.22);
    const hipY = bodyH * 0.48;
    const shoulderY = bodyH * 0.83;
    const headY = bodyH * 0.94;

    const at = (yFt: number, dx = 0, dz = 0) => cam.project(p.x + dx, p.y + yFt, p.z + dz);

    const hip = at(hipY, lean * 0.3);
    const shoulder = at(shoulderY, lean * 0.55);
    const head = at(headY, lean * 0.7);
    const lineW = Math.max(1.6, s * 0.34);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Legs.
    ctx.strokeStyle = mix(skin, '#000000', 0.18);
    ctx.lineWidth = lineW * 0.92;
    const footSpread = 0.42 * spread;
    for (const sign of [-1, 1]) {
      const swing = sign * stride * 0.55;
      const knee = at(hipY * 0.5, sign * footSpread * 0.6 + swing * 0.4, swing * 0.3);
      const foot = at(0.06, sign * footSpread + swing, swing * 0.6);
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
    }

    // Shoes.
    ctx.fillStyle = trim;
    for (const sign of [-1, 1]) {
      const swing = sign * stride * 0.55;
      const foot = at(0.06, sign * footSpread + swing, swing * 0.6);
      ctx.beginPath();
      ctx.ellipse(foot.x, foot.y, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Torso as a jersey slab.
    const shoulderHalf = 0.52 + (p.cfg.weightLb - 200) / 900;
    const tl = at(shoulderY, -shoulderHalf + lean * 0.55);
    const tr = at(shoulderY, shoulderHalf + lean * 0.55);
    const bl = at(hipY, -shoulderHalf * 0.74 + lean * 0.3);
    const br = at(hipY, shoulderHalf * 0.74 + lean * 0.3);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
    grad.addColorStop(0, mix(jersey, '#ffffff', 0.16));
    grad.addColorStop(1, mix(jersey, '#000000', 0.28));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = hexA(trim, 0.9);
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.stroke();

    // Arms.
    ctx.strokeStyle = skin;
    ctx.lineWidth = lineW * 0.78;
    for (const sign of [-1, 1]) {
      const raise = armLift * (p.state === 'shooting' && sign < 0 ? 0.72 : 1);
      const elbow = at(shoulderY - 0.34 + raise * 0.42, sign * (shoulderHalf + 0.24) * spread, -raise * 0.12);
      const hand = at(shoulderY - 0.68 + raise * 1.05, sign * (shoulderHalf + 0.12 + raise * 0.1) * spread, -raise * 0.3);
      ctx.beginPath();
      ctx.moveTo(sign < 0 ? tl.x : tr.x, sign < 0 ? tl.y : tr.y);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(hand.x, hand.y);
      ctx.stroke();
    }

    // Head + hair.
    ctx.beginPath();
    ctx.arc(head.x, head.y, s * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    if (p.cfg.skinTone !== undefined) {
      ctx.beginPath();
      ctx.arc(head.x, head.y - s * 0.09, s * 0.34, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = mix(skin, '#120b08', 0.72);
      ctx.lineWidth = s * 0.2;
      ctx.stroke();
    }

    // Local-player ring so you always know which one you are.
    if (isLocal) {
      const ring = cam.project(p.x, 0.02, p.z);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.scale * 1.5, ring.scale * 0.62, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hexA('#3ef07a', 0.85);
      ctx.lineWidth = Math.max(1.5, ring.scale * 0.11);
      ctx.stroke();
    }

    // Stagger / ankle-break wobble marker.
    if (p.stagger > 0.05) {
      const ring = cam.project(p.x, 0.03, p.z);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.scale * 1.9 * p.stagger, ring.scale * 0.8 * p.stagger, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hexA('#ff4d5e', 0.6 * p.stagger);
      ctx.lineWidth = Math.max(1.5, ring.scale * 0.1);
      ctx.stroke();
    }

    // Stamina ring above the head, only when it starts to matter.
    if (p.stamina < 0.62) {
      const top = cam.project(p.x, p.y + heightFt + 0.7, p.z);
      const w = s * 1.5;
      ctx.fillStyle = 'rgba(8,10,14,0.7)';
      ctx.fillRect(top.x - w / 2, top.y, w, s * 0.16);
      ctx.fillStyle = p.stamina < 0.3 ? '#ff4d5e' : '#ffc53d';
      ctx.fillRect(top.x - w / 2, top.y, w * p.stamina, s * 0.16);
    }

    ctx.restore();
  }

  drawBall(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball, time: number): void {
    const p = cam.project(ball.x, ball.y, ball.z);
    if (p.depth <= 0.05) return;
    const r = Math.max(2, p.scale * 0.4);

    // Ground shadow.
    const sh = cam.project(ball.x, 0.01, ball.z);
    if (sh.depth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3 / (1 + ball.y * 0.2);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, sh.scale * 0.42, sh.scale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(p.x - r * 0.34, p.y - r * 0.34, r * 0.15, p.x, p.y, r);
    g.addColorStop(0, '#ffa463');
    g.addColorStop(0.6, '#ef7a2f');
    g.addColorStop(1, '#a8441a');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Seams, spinning with flight time.
    ctx.strokeStyle = 'rgba(40,18,8,0.75)';
    ctx.lineWidth = Math.max(0.7, r * 0.11);
    const spin = time * 5 + ball.flightTime * 9;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * Math.abs(Math.cos(spin)), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * Math.abs(Math.sin(spin + 1)), r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Shows where an in-flight shot will land, which teaches shot feedback. */
  drawShotTrail(ctx: CanvasRenderingContext2D, cam: Camera, state: MatchState): void {
    const ball = state.ball;
    if (ball.state !== 'shot') return;
    ctx.save();
    ctx.strokeStyle = ball.shotWillGoIn ? 'rgba(62,240,122,0.35)' : 'rgba(255,122,61,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const x = ball.fromX + (ball.toX - ball.fromX) * t;
      const z = ball.fromZ + (ball.toZ - ball.fromZ) * t;
      const arcY = 4 * (ball.apex - (ball.fromY + ball.toY) / 2) * t * (1 - t);
      const y = ball.fromY + (ball.toY - ball.fromY) * t + arcY;
      const pr = cam.project(x, y, z);
      if (pr.depth <= 0) continue;
      if (!started) {
        ctx.moveTo(pr.x, pr.y);
        started = true;
      } else ctx.lineTo(pr.x, pr.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Distance-to-rim readout on the floor, so shot value is never a guess. */
  drawRangeMarker(ctx: CanvasRenderingContext2D, cam: Camera, p: SimPlayer, isThree: boolean): void {
    const marker = cam.project(p.x, 0.04, p.z);
    if (marker.depth <= 0) return;
    ctx.save();
    ctx.font = `800 ${Math.max(9, marker.scale * 0.42)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isThree ? 'rgba(62,240,122,0.9)' : 'rgba(238,242,248,0.6)';
    ctx.fillText(isThree ? '2PT' : '1PT', marker.x, marker.y + marker.scale * 0.95);
    ctx.restore();
  }
}

export const RIM_WORLD = { x: COURT.rimX, y: COURT.rimY, z: COURT.rimZ };
