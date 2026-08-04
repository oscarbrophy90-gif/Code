import {
  GRADE_COLOR,
  GRADE_LABEL,
  activeShotMeter,
  currentContest,
  rankLabel,
  type MatchState,
  type ShotGrade,
  type ShotMeterStyle,
  type ShotProfile,
  type Side,
} from '@hoops/shared';
import type { Camera } from '../engine/camera.ts';

export interface FeedbackPopup {
  text: string;
  color: string;
  x: number;
  z: number;
  life: number;
  maxLife: number;
  big: boolean;
}

/** Screen-space HUD: score bug, shot clock, meter, stamina, callouts. */
export class Hud {
  popups: FeedbackPopup[] = [];
  private lastGrade: ShotGrade | null = null;
  private gradeFlash = 0;

  push(text: string, color: string, x: number, z: number, big = false): void {
    this.popups.push({ text, color, x, z, life: big ? 1.5 : 1.1, maxLife: big ? 1.5 : 1.1, big });
    if (this.popups.length > 12) this.popups.shift();
  }

  flashGrade(grade: ShotGrade): void {
    this.lastGrade = grade;
    this.gradeFlash = 1.1;
  }

  update(dt: number): void {
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter((p) => p.life > 0);
    this.gradeFlash = Math.max(0, this.gradeFlash - dt);
  }

  drawWorldPopups(ctx: CanvasRenderingContext2D, cam: Camera): void {
    for (const p of this.popups) {
      const t = 1 - p.life / p.maxLife;
      const proj = cam.project(p.x, 6.5 + t * 4.5, p.z);
      if (proj.depth <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2.4);
      ctx.font = `900 ${Math.max(12, proj.scale * (p.big ? 0.95 : 0.62))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,6,10,0.85)';
      ctx.strokeText(p.text, proj.x, proj.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, proj.x, proj.y);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------- score bug
  drawScoreBug(ctx: CanvasRenderingContext2D, state: MatchState, w: number, localSide: Side, rankPoints: number): void {
    const pad = 14;
    const barW = Math.min(430, w - pad * 2);
    const x = (w - barW) / 2;
    const y = pad;
    const h = 52;

    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.82)';
    roundRect(ctx, x, y, barW, h, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(42,51,70,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const names = [state.players[0].cfg.name, state.players[1].cfg.name];
    const colors = [state.players[0].cfg.jerseyPrimary, state.players[1].cfg.jerseyPrimary];

    for (const side of [0, 1] as Side[]) {
      const left = side === 0;
      const cx = left ? x + 14 : x + barW - 14;
      ctx.textAlign = left ? 'left' : 'right';

      ctx.fillStyle = colors[side];
      const swatchX = left ? cx : cx - 4;
      ctx.fillRect(left ? swatchX : swatchX, y + 12, 4, 28);

      ctx.font = '800 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = side === localSide ? '#3ef07a' : '#97a2b8';
      ctx.fillText(names[side].slice(0, 14).toUpperCase(), left ? cx + 10 : cx - 10, y + 22);

      ctx.font = '900 26px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#eef2f8';
      ctx.fillText(String(state.score[side]), left ? cx + 10 : cx - 10, y + 44);
    }

    // Shot clock in the middle.
    ctx.textAlign = 'center';
    const clock = Math.max(0, state.shotClock);
    ctx.font = '900 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = clock < 5 ? '#ff4d5e' : '#eef2f8';
    ctx.fillText(clock.toFixed(1), x + barW / 2, y + 33);
    ctx.font = '800 8px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#626e86';
    ctx.fillText('SHOT CLOCK', x + barW / 2, y + 44);

    ctx.font = '800 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#626e86';
    ctx.fillText(`FIRST TO ${state.config.targetScore} • WIN BY ${state.config.winBy}`, x + barW / 2, y + 14);
    ctx.restore();

    // Rank chip under the bug for ranked play.
    if (state.config.playlist === 'ranked') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '800 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#97a2b8';
      ctx.fillText(rankLabel(rankPoints).toUpperCase(), x + barW / 2, y + h + 16);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------- shot meter
  drawShotMeter(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    state: MatchState,
    side: Side,
    style: ShotMeterStyle,
    w: number,
    h: number,
  ): void {
    if (style === 'hidden') return;
    const meter = activeShotMeter(state, side);
    if (!meter) return;
    const p = state.players[side];
    const { progress, profile } = meter;

    switch (style) {
      case 'arcBar':
        this.arcMeter(ctx, cam, p.x, p.z, p.y, progress, profile);
        break;
      case 'circleRing':
        this.ringMeter(ctx, cam, p.x, p.z, p.y, progress, profile);
        break;
      case 'dualPips':
        this.pipMeter(ctx, cam, p.x, p.z, p.y, progress, profile);
        break;
      case 'sideBar':
        this.sideMeter(ctx, progress, profile, w, h);
        break;
    }
  }

  private bandGeometry(profile: ShotProfile): { greenFrom: number; greenTo: number; excFrom: number; excTo: number } {
    const span = 1.25; // the meter renders 0..1.25 of the animation
    return {
      greenFrom: (profile.idealPoint - profile.greenHalfWidth) / span,
      greenTo: (profile.idealPoint + profile.greenHalfWidth) / span,
      excFrom: (profile.idealPoint - profile.excellentHalfWidth) / span,
      excTo: (profile.idealPoint + profile.excellentHalfWidth) / span,
    };
  }

  private arcMeter(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    x: number,
    z: number,
    y: number,
    progress: number,
    profile: ShotProfile,
  ): void {
    const anchor = cam.project(x, y + 8.8, z);
    if (anchor.depth <= 0) return;
    const r = Math.max(38, anchor.scale * 2.2);
    const a0 = Math.PI * 0.84;
    const a1 = Math.PI * 0.16;
    const at = (t: number) => a0 + (a1 - a0) * Math.min(1, Math.max(0, t));
    const g = this.bandGeometry(profile);
    const green = profile.heavilyContested ? '#ffc53d' : '#3ef07a';
    // A perfect window is only a few dozen milliseconds wide, so enforce a
    // floor in screen space — an invisible target is not a skill test.
    const minSweep = 5 / r;

    ctx.save();
    ctx.lineCap = 'butt';

    ctx.lineWidth = 13;
    ctx.strokeStyle = 'rgba(8,10,16,0.9)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, a0, a1, true);
    ctx.stroke();

    ctx.lineWidth = 11;
    ctx.strokeStyle = 'rgba(120,132,155,0.35)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, at(g.excFrom), at(g.excTo), true);
    ctx.stroke();

    // Fill sweep first so the green band always reads on top of it.
    ctx.lineWidth = 11;
    ctx.strokeStyle = 'rgba(238,242,248,0.55)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, a0, at(progress / 1.25), true);
    ctx.stroke();

    const gStart = at(g.greenFrom);
    const gEnd = at(g.greenTo);
    const sweep = Math.max(minSweep, Math.abs(gStart - gEnd));
    const gMid = (gStart + gEnd) / 2;
    ctx.lineWidth = 13;
    ctx.strokeStyle = green;
    ctx.shadowColor = green;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, gMid + sweep / 2, gMid - sweep / 2, true);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle.
    const na = at(progress / 1.25);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(anchor.x + Math.cos(na) * (r - 10), anchor.y + Math.sin(na) * (r - 10));
    ctx.lineTo(anchor.x + Math.cos(na) * (r + 10), anchor.y + Math.sin(na) * (r + 10));
    ctx.stroke();
    ctx.restore();
  }

  private ringMeter(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    x: number,
    z: number,
    y: number,
    progress: number,
    profile: ShotProfile,
  ): void {
    const anchor = cam.project(x, 0.05, z);
    if (anchor.depth <= 0) return;
    void y;
    const r = Math.max(22, anchor.scale * 2.1);
    const g = this.bandGeometry(profile);
    const at = (t: number) => -Math.PI / 2 + Math.min(1, Math.max(0, t)) * Math.PI * 2;

    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8,10,16,0.75)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,132,155,0.45)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, at(g.excFrom), at(g.excTo));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(238,242,248,0.6)';
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, at(0), at(progress / 1.25));
    ctx.stroke();

    const green = profile.heavilyContested ? '#ffc53d' : '#3ef07a';
    const gStart = at(g.greenFrom);
    const gEnd = Math.max(at(g.greenTo), gStart + 6 / r);
    ctx.strokeStyle = green;
    ctx.shadowColor = green;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, r, gStart, gEnd);
    ctx.stroke();
    ctx.restore();
  }

  private pipMeter(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    x: number,
    z: number,
    y: number,
    progress: number,
    profile: ShotProfile,
  ): void {
    const anchor = cam.project(x, y + 8.2, z);
    if (anchor.depth <= 0) return;
    const width = Math.max(60, anchor.scale * 4);
    const g = this.bandGeometry(profile);
    const left = anchor.x - width / 2;
    const pips = 22;

    ctx.save();
    for (let i = 0; i < pips; i++) {
      const t = i / (pips - 1);
      const px = left + t * width;
      const inGreen = t >= g.greenFrom && t <= g.greenTo;
      const inExc = t >= g.excFrom && t <= g.excTo;
      const filled = t <= progress / 1.25;
      ctx.fillStyle = inGreen
        ? profile.heavilyContested
          ? '#ffc53d'
          : '#3ef07a'
        : inExc
          ? 'rgba(120,132,155,0.75)'
          : 'rgba(60,70,90,0.6)';
      const hh = inGreen ? 15 : 10;
      ctx.fillRect(px - 1.6, anchor.y - hh / 2, 3.2, hh);
      if (filled) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(px - 1.6, anchor.y - hh / 2, 3.2, hh);
      }
    }
    ctx.restore();
  }

  private sideMeter(
    ctx: CanvasRenderingContext2D,
    progress: number,
    profile: ShotProfile,
    w: number,
    h: number,
  ): void {
    const bw = 16;
    const bh = Math.min(280, h * 0.42);
    const x = w - 46;
    const y = (h - bh) / 2;
    const g = this.bandGeometry(profile);
    const toY = (t: number) => y + bh - Math.min(1, Math.max(0, t)) * bh;

    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.8)';
    roundRect(ctx, x, y, bw, bh, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(120,132,155,0.4)';
    ctx.fillRect(x, toY(g.excTo), bw, toY(g.excFrom) - toY(g.excTo));
    ctx.fillStyle = profile.heavilyContested ? '#ffc53d' : '#3ef07a';
    ctx.fillRect(x, toY(g.greenTo), bw, Math.max(6, toY(g.greenFrom) - toY(g.greenTo)));

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const py = toY(progress / 1.25);
    ctx.fillRect(x - 4, py - 1.5, bw + 8, 3);
    ctx.restore();
  }

  // ---------------------------------------------------------------- callouts
  drawCallouts(ctx: CanvasRenderingContext2D, state: MatchState, side: Side, w: number, h: number): void {
    const p = state.players[side];

    // Stamina bar, bottom-left.
    const sw = Math.min(210, w * 0.4);
    const sx = 16;
    const sy = h - 34;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.75)';
    roundRect(ctx, sx, sy, sw, 12, 3);
    ctx.fill();
    const staminaColor = p.stamina > 0.55 ? '#3ef07a' : p.stamina > 0.28 ? '#ffc53d' : '#ff4d5e';
    ctx.fillStyle = staminaColor;
    roundRect(ctx, sx + 2, sy + 2, (sw - 4) * p.stamina, 8, 2);
    ctx.fill();
    ctx.font = '800 9px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#626e86';
    ctx.textAlign = 'left';
    ctx.fillText('STAMINA', sx, sy - 5);

    // Contest read, so the shooter can see pressure building.
    if (state.ball.owner === side && state.ball.state === 'held') {
      const contest = currentContest(state, side);
      const cw = 110;
      const cx = sx + sw + 16;
      if (cx + cw < w - 16) {
        ctx.fillStyle = 'rgba(8,10,16,0.75)';
        roundRect(ctx, cx, sy, cw, 12, 3);
        ctx.fill();
        ctx.fillStyle = contest > 0.72 ? '#ff4d5e' : contest > 0.4 ? '#ffc53d' : '#4aa3ff';
        roundRect(ctx, cx + 2, sy + 2, (cw - 4) * contest, 8, 2);
        ctx.fill();
        ctx.fillStyle = '#626e86';
        ctx.fillText('CONTEST', cx, sy - 5);
      }
    }
    ctx.restore();

    // Big centre callouts.
    ctx.save();
    ctx.textAlign = 'center';
    if (state.needsClear && state.ball.owner === side) {
      ctx.font = '900 18px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#ffc53d';
      ctx.fillText('CLEAR THE BALL', w / 2, h - 74);
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#97a2b8';
      ctx.fillText('Take it back behind the arc before you can score', w / 2, h - 58);
    }

    if (state.phase === 'checkball') {
      ctx.font = '900 26px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#eef2f8';
      ctx.fillText('CHECK BALL', w / 2, h / 2 - 40);
    }

    if (this.gradeFlash > 0 && this.lastGrade) {
      const a = Math.min(1, this.gradeFlash * 1.6);
      ctx.globalAlpha = a;
      ctx.font = '900 34px Inter, system-ui, sans-serif';
      ctx.fillStyle = GRADE_COLOR[this.lastGrade];
      ctx.fillText(GRADE_LABEL[this.lastGrade], w / 2, 128);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
