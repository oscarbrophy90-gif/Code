import {
  EMOTE_DURATION,
  makePlayer,
  type SimPlayer,
  type SimPlayerConfig,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { PlayerRenderer } from '../render/players.ts';

export interface AvatarOptions {
  /** an emote or celebration id to perform, or null to just stand there */
  emoteId?: string | null;
  /** 0..1 through the emote */
  t?: number;
  /** how much of the frame the figure fills */
  zoom?: number;
}

/**
 * Draws a player head to toe, using the very same renderer and camera the court
 * uses.
 *
 * This is deliberately not a second drawing routine. A preview built from its
 * own code is a preview that can quietly disagree with the game — which is
 * exactly what the head-only portrait did: it showed a jersey colour and a face
 * and nothing else, so shoes, hair, sleeves, tattoos and your number were all
 * invisible until you were already on the floor wearing them.
 */
export class AvatarRenderer {
  private cam = new Camera();
  private renderer = new PlayerRenderer();
  private player: SimPlayer | null = null;

  draw(canvas: HTMLCanvasElement, cfg: SimPlayerConfig, opts: AvatarOptions = {}): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 240;
    const h = canvas.clientHeight || 360;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // A slab of floor and a wall behind, so the figure is standing somewhere
    // rather than hanging in a void.
    const heightFt = cfg.heightIn / 12;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#182130');
    sky.addColorStop(0.72, '#10151f');
    sky.addColorStop(1, '#0a0d14');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Reuse the sim's own player so every field the renderer reads is real.
    if (!this.player || this.player.cfg !== cfg) this.player = makePlayer(0, cfg);
    const p = this.player;
    p.x = 0;
    p.z = 0;
    p.y = 0;
    p.vx = 0;
    p.vz = 0;
    p.facing = 0;
    p.stamina = 1;
    p.stagger = 0;

    if (opts.emoteId) {
      p.state = 'emoting';
      p.emoteSlot = 0;
      // The renderer reads the slot out of the appearance, so point slot 0 at
      // whatever we are previewing.
      if (p.cfg.appearance) p.cfg.appearance.emoteSlots = [opts.emoteId];
      p.emoteTimer = (1 - Math.min(1, Math.max(0, opts.t ?? 0))) * EMOTE_DURATION;
    } else {
      p.state = 'idle';
      p.emoteSlot = -1;
      p.emoteTimer = 0;
    }

    // Frame the player head to toe with a little air.
    //
    // Two things have to be forced. The camera fits on whichever axis is
    // tighter, so the horizontal field is opened right up to make sure the
    // vertical one binds — otherwise a portrait canvas shrinks the figure to
    // fit a width nothing is using. And the court camera biases the horizon
    // upward on a tall viewport, which parks the player at the top of the
    // frame over a floor nobody needs to see, so the aim point is lowered to
    // put him back in the middle.
    const zoom = opts.zoom ?? 1;
    const fov = 46 * (Math.PI / 180);
    // Vertical framing has to win. The camera fits on whichever axis is
    // tighter and focal length falls as the field widens, so the horizontal
    // field is made *narrow* — a wide one produces the smaller focal length and
    // shrinks the figure to fit a width nothing is using.
    const fit = heightFt * 1.5;
    const dist = fit / (2 * Math.tan(fov / 2)) / zoom;
    // Eye level a little above the middle of the body, looking level. That puts
    // the head near the top of the frame and the feet near the bottom under
    // both the portrait and the landscape canvas, which centre their horizon
    // at different heights.
    const eye = heightFt * 0.58;
    this.cam.pos = { x: dist * 0.3, y: eye, z: dist };
    this.cam.target = { x: 0, y: eye, z: 0 };
    this.cam.fov = fov;
    this.cam.hFov = 20 * (Math.PI / 180);
    this.cam.update(w, h);

    const floor = this.cam.project(0, 0, 0);
    if (floor.depth > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(0, floor.y, w, h - floor.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, floor.y);
      ctx.lineTo(w, floor.y);
      ctx.stroke();
    }

    this.renderer.drawShadow(ctx, this.cam, 0, 0, 0, 1.1);
    this.renderer.draw(ctx, this.cam, p, performance.now() / 1000, false, false);
  }
}

/**
 * A canvas that keeps redrawing itself until it leaves the page. Used for every
 * animated preview, so none of them leak a requestAnimationFrame loop.
 */
export function livePreview(
  canvas: HTMLCanvasElement,
  render: (elapsedSeconds: number) => void,
): void {
  const start = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    if (!canvas.isConnected) {
      cancelAnimationFrame(raf);
      return;
    }
    render((now - start) / 1000);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
