import { DUNK_PACKAGE_BY_ID, type SimPlayerConfig } from '@hoops/shared';

import { el } from './dom.ts';

export interface DunkSceneOptions {
  dunker: SimPlayerConfig;
  victim: SimPlayerConfig | null;
  packageId: string;
  posterized: boolean;
  value: 1 | 2;
}

/** How long the cutaway runs before it returns to the game, in seconds. */
const SCENE_SECONDS = 2.4;

/**
 * The cutaway on a greened dunk. It is the equipped dunk package played out at
 * size, and it is always skippable — a highlight you cannot skip stops being a
 * highlight by the third time you see it.
 */
export function playDunkScene(host: HTMLElement, opts: DunkSceneOptions): Promise<void> {
  return new Promise((resolve) => {
    const pkg = DUNK_PACKAGE_BY_ID[opts.packageId] ?? DUNK_PACKAGE_BY_ID['basic-slam'];
    let done = false;
    let raf = 0;
    const started = performance.now();

    const canvas = el('canvas', { class: 'dunk-canvas' }) as HTMLCanvasElement;
    const scene = el(
      'div',
      { class: `dunk-scene ${opts.posterized ? 'poster' : ''}` },
      canvas,
      el(
        'div',
        { class: 'dunk-caption' },
        el('div', { class: 'dunk-kicker' }, opts.posterized ? 'POSTERIZED' : 'THROWN DOWN'),
        el('div', { class: 'dunk-name' }, pkg.name),
        el(
          'div',
          { class: 'dunk-sub' },
          opts.posterized && opts.victim ? `on ${opts.victim.name}` : opts.dunker.name,
        ),
      ),
      el('button', { class: 'dunk-skip' }, 'Skip'),
    );

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      scene.classList.add('out');
      window.setTimeout(() => {
        scene.remove();
        resolve();
      }, 200);
    };
    const onKey = () => finish();
    scene.addEventListener('click', finish);
    window.addEventListener('keydown', onKey);
    host.appendChild(scene);

    const ctx = canvas.getContext('2d');
    const draw = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - started) / (SCENE_SECONDS * 1000));
      if (ctx) drawDunkFrame(ctx, canvas, opts, t);
      if (t >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
}

/**
 * Draws one frame of the dunk. It is a side-on silhouette: a run-up, a gather,
 * the rise, the flush, and the hang — driven entirely by `t`, so the same
 * function renders the locker preview and the in-game cutaway.
 */
export function drawDunkFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  opts: Pick<DunkSceneOptions, 'dunker' | 'victim' | 'packageId' | 'posterized'>,
  t: number,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 360;
  if (canvas.width !== Math.floor(w * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const primary = opts.dunker.jerseyPrimary;
  const accent = opts.dunker.jerseySecondary;
  const floorY = h * 0.86;
  const rimX = w * 0.68;
  const rimY = h * 0.24;

  // Backdrop.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#131a27');
  sky.addColorStop(1, '#080b12');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Speed lines rising as the dunker does.
  ctx.strokeStyle = `rgba(255,255,255,${0.05 + t * 0.09})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const y = (i / 16) * h + ((t * 240) % 40);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - 18);
    ctx.stroke();
  }

  // Floor.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, floorY, w, h - floorY);

  // One unit, relative to a reference height, so the furniture scales with the
  // canvas — the locker preview is a third the height of the in-game cutaway.
  const u = h / 360;
  const flush = Math.max(0, (t - 0.62) / 0.2);

  // Backboard.
  ctx.strokeStyle = 'rgba(238,242,248,0.8)';
  ctx.lineWidth = 3 * u;
  ctx.strokeRect(rimX + 26 * u, rimY - 54 * u, 76 * u, 66 * u);

  // Where the dunker is: run-up, gather, rise, then hanging off the rim.
  const approach = Math.min(1, t / 0.42);
  const rise = t < 0.42 ? 0 : Math.min(1, (t - 0.42) / 0.24);
  const hang = t < 0.66 ? 0 : Math.min(1, (t - 0.66) / 0.34);

  // The reach: 0.74 up the body plus the arm, which is where drawFigure puts
  // the grabbing hand. Solving for the feet puts that hand exactly on the rim.
  const reachUp = 0.35 + rise * 1.1;
  const bodyH = h * FIGURE_H;
  const handAbove = bodyH * (0.74 + reachUp * 0.42);

  // Hanging: one hand on the iron, body swinging under it, letting go at the
  // very end. This is the bit that makes a dunk feel like a dunk.
  const swing = hang > 0 ? Math.sin(hang * Math.PI * 2.2) * (1 - hang) * 0.5 : 0;
  const release = Math.max(0, (hang - 0.75) / 0.25);
  const gripX = rimX - 4 * u;

  const runX = w * 0.1 + (gripX - 26 * u - w * 0.1) * easeOut(approach);
  const px = hang > 0 ? gripX - 20 * u + swing * 26 * u : runX;
  const py =
    hang > 0
      ? rimY + handAbove + release * (floorY - rimY - handAbove) * 0.9
      : floorY - Math.sin(rise * Math.PI * 0.5) * (floorY - rimY - handAbove);

  // The rim bends under the weight and springs back as he lets go.
  const rimFlex = hang > 0 ? Math.sin(Math.min(1, hang * 1.6) * Math.PI * 0.7) * (1 - release) * 9 * u : 0;

  // Rim and net, bent by whoever is hanging off them.
  const rimYNow = rimY + rimFlex;
  ctx.strokeStyle = '#ff7a3d';
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.moveTo(rimX - 22 * u, rimYNow);
  ctx.lineTo(rimX + 26 * u, rimY);
  ctx.stroke();
  ctx.strokeStyle = `rgba(238,242,248,${0.55 + flush * 0.35})`;
  ctx.lineWidth = 1.4 * u;
  for (let i = 0; i <= 5; i++) {
    const nx = rimX - 22 * u + (i / 5) * 48 * u;
    ctx.beginPath();
    ctx.moveTo(nx, rimYNow + rimFlex * 0.4);
    ctx.lineTo(rimX + 2 * u + (nx - rimX) * 0.4, rimYNow + (26 + Math.min(1, flush) * 12) * u + rimFlex);
    ctx.stroke();
  }

  // The victim, planted under the rim and going down.
  if (opts.posterized && opts.victim) {
    const fall = Math.max(0, (t - 0.6) / 0.4);
    drawFigure(ctx, rimX - 66 * (h / 360), floorY, h, opts.victim.jerseyPrimary, opts.victim.jerseySecondary, {
      armsUp: 1 - fall,
      lean: fall * 1.35,
      scale: 0.92,
    });
  }

  drawFigure(ctx, px, py + (hang > 0 ? rimFlex : 0), h, primary, accent, {
    armsUp: reachUp,
    lean: hang > 0 ? swing * 0.9 : -0.25 - rise * 0.35,
    scale: 1,
    tuck: hang > 0 ? (1 - release) * 0.8 : 0,
  });

  // The ball: in the hand, then through the rim.
  const ballR = h * 0.036;
  ctx.fillStyle = '#e0762c';
  ctx.beginPath();
  if (t < 0.62) {
    ctx.arc(px + bodyH * 0.2, py - bodyH * 0.72, ballR, 0, Math.PI * 2);
  } else {
    const drop = Math.min(1, (t - 0.62) / 0.3);
    ctx.arc(rimX + 2 * u, rimYNow + drop * (floorY - rimYNow) * 0.92, ballR, 0, Math.PI * 2);
  }
  ctx.fill();

  // Impact flash on the flush.
  if (flush > 0 && flush < 1) {
    ctx.fillStyle = `rgba(255,255,255,${(1 - flush) * 0.35})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Figure height as a fraction of the frame. Small enough that the rim sits
 * clearly above a standing player, so hanging off it actually lifts him — at
 * the first size he could touch the rim flat-footed and the hang read as
 * standing with an arm up.
 */
const FIGURE_H = 0.33;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** A blocky side-on figure. Enough to read as a body at speed. */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  jersey: string,
  accent: string,
  pose: { armsUp: number; lean: number; scale: number; tuck?: number },
): void {
  // The figure stands a little under half the frame, so the rim, the ball and
  // the caption all still read. The first cut of this was ten times too big.
  const bodyH = h * FIGURE_H * pose.scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.lean * 0.18);

  // Legs. Hanging off the rim they tuck up rather than dangling straight.
  const tuck = pose.tuck ?? 0;
  ctx.strokeStyle = 'rgba(180,120,80,1)';
  ctx.lineWidth = bodyH * 0.075;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    const kneeY = -bodyH * (0.22 + tuck * 0.12);
    const footY = -bodyH * tuck * 0.34;
    ctx.beginPath();
    ctx.moveTo(0, -bodyH * 0.46);
    ctx.lineTo(dir * bodyH * (0.1 + tuck * 0.08), kneeY);
    ctx.lineTo(dir * bodyH * 0.16 - bodyH * (0.06 - tuck * 0.16), footY);
    ctx.stroke();
  }

  // Torso.
  ctx.fillStyle = jersey;
  ctx.beginPath();
  ctx.moveTo(-bodyH * 0.13, -bodyH * 0.78);
  ctx.lineTo(bodyH * 0.13, -bodyH * 0.78);
  ctx.lineTo(bodyH * 0.1, -bodyH * 0.44);
  ctx.lineTo(-bodyH * 0.1, -bodyH * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = bodyH * 0.012;
  ctx.stroke();

  // Arms — the reaching one goes up with the pose.
  ctx.strokeStyle = 'rgba(190,128,86,1)';
  ctx.lineWidth = bodyH * 0.06;
  const reach = pose.armsUp;
  ctx.beginPath();
  ctx.moveTo(bodyH * 0.12, -bodyH * 0.74);
  ctx.lineTo(bodyH * 0.26, -bodyH * (0.74 + reach * 0.18));
  ctx.lineTo(bodyH * 0.34, -bodyH * (0.74 + reach * 0.42));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-bodyH * 0.12, -bodyH * 0.74);
  ctx.lineTo(-bodyH * 0.24, -bodyH * (0.6 + reach * 0.1));
  ctx.stroke();

  // Head.
  ctx.fillStyle = 'rgba(200,138,96,1)';
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.88, bodyH * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
