import { DUNK_PACKAGE_BY_ID, type SimPlayerConfig } from '@hoops/shared';

import { captureSceneKeys, el } from './dom.ts';

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
      releaseKeys();
      scene.classList.add('out');
      window.setTimeout(() => {
        scene.remove();
        resolve();
      }, 200);
    };
    const releaseKeys = captureSceneKeys(() => finish());
    scene.addEventListener('click', finish);
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
  const flush = Math.max(0, (t - (1 - styleFor(opts.packageId).hangFor)) / 0.2);

  // Backboard.
  ctx.strokeStyle = 'rgba(238,242,248,0.8)';
  ctx.lineWidth = 3 * u;
  ctx.strokeRect(rimX + 26 * u, rimY - 54 * u, 76 * u, 66 * u);

  // Where the dunker is: run-up, gather, rise, then hanging off the rim. How
  // long each beat lasts is the package's business.
  const style = styleFor(opts.packageId);
  const hangStart = 1 - style.hangFor;
  const riseStart = hangStart - 0.24;
  const approach = Math.min(1, t / riseStart);
  const rise = t < riseStart ? 0 : Math.min(1, (t - riseStart) / (hangStart - riseStart));
  const hang = t < hangStart ? 0 : Math.min(1, (t - hangStart) / style.hangFor);

  // The reach: 0.74 up the body plus the arm, which is where drawFigure puts
  // the grabbing hand. Solving for the feet puts that hand exactly on the rim.
  const reachUp = 0.35 + rise * 1.1;
  const bodyH = h * FIGURE_H;
  const handAbove = bodyH * (0.74 + reachUp * 0.42);

  // Hanging: one hand on the iron, body swinging under it, letting go at the
  // very end. This is the bit that makes a dunk feel like a dunk.
  const swing = hang > 0 ? Math.sin(hang * Math.PI * 2.2) * (1 - hang) * style.swing : 0;
  const release = Math.max(0, (hang - 0.75) / 0.25);
  const gripX = rimX + style.finishSide * 4 * u;

  // Run in from whichever side the package uses.
  const startX = style.from < 0 ? w * 0.08 : w * 0.95;
  const runX = startX + (gripX - style.from * 26 * u - startX) * easeOut(approach);
  const px = hang > 0 ? gripX - style.finishSide * 20 * u + swing * 26 * u : runX;
  const py =
    hang > 0
      ? rimY + handAbove + release * (floorY - rimY - handAbove) * 0.9
      : floorY - Math.sin(rise * Math.PI * 0.5) * (floorY - rimY - handAbove);

  // The rim bends under the weight and springs back as he lets go.
  const rimFlex = hang > 0 ? Math.sin(Math.min(1, hang * 1.6) * Math.PI * 0.7) * (1 - release) * 9 * u * style.flex : 0;

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
    // A reverse turns his back to you on the way up and finishes facing away.
    spin: style.spin * Math.min(1, rise + hang),
    oneHand: style.oneHand,
    facing: style.from,
  });

  // The ball: in the hand, then through the rim.
  const ballR = h * 0.036;
  ctx.fillStyle = '#e0762c';
  ctx.beginPath();
  if (t < hangStart) {
    // Cocked back and up as he gathers — the bigger the windup, the further
    // behind the head it travels before it comes over the top.
    const cock = style.windup * Math.sin(Math.min(1, rise) * Math.PI * 0.9);
    ctx.arc(
      px + bodyH * (0.2 + reachUp * 0.16) - style.from * cock * bodyH * 0.55,
      py - bodyH * (0.72 + reachUp * 0.3) - cock * bodyH * 0.35,
      ballR,
      0,
      Math.PI * 2,
    );
  } else {
    const drop = Math.min(1, (t - hangStart) / 0.3);
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
 * What makes one package different from another.
 *
 * Every dunk used to run the identical path — same side, same rise, same hang —
 * so the five packages were five names on one animation. These are the knobs
 * the scene reads, and each package sets them differently.
 */
interface DunkStyle {
  /** run-up side: -1 comes in from the left, +1 from the right */
  from: -1 | 1;
  /** how far the ball is cocked back behind the head before the flush */
  windup: number;
  /** true for a one-hand finish, false for a two-hand flush */
  oneHand: boolean;
  /** fraction of the scene spent hanging off the rim */
  hangFor: number;
  /** how hard the body swings under the rim */
  swing: number;
  /**
   * Radians of extra body turn on the way up. The figure rotates about its
   * feet, so this stays small — a big angle swings the whole body out of the
   * frame instead of turning it. The mirrored `from` is what actually sells a
   * reverse; this is the lean on top of it.
   */
  spin: number;
  /** which side of the rim he finishes on */
  finishSide: -1 | 1;
  /** how much the rim bends */
  flex: number;
}

const DUNK_STYLE: Record<string, DunkStyle> = {
  // Straight on, two hands, down and off. No showmanship.
  'basic-slam': { from: -1, windup: 0.1, oneHand: false, hangFor: 0.12, swing: 0.25, spin: 0, finishSide: -1, flex: 0.7 },
  // Long approach from the left, ball cocked right back, one hand over the top.
  tomahawk: { from: -1, windup: 1, oneHand: true, hangFor: 0.2, swing: 0.5, spin: 0, finishSide: -1, flex: 1 },
  // The whole point is the hang, so it gets most of the scene.
  'rim-hang': { from: 1, windup: 0.45, oneHand: true, hangFor: 0.46, swing: 1.15, spin: 0, finishSide: -1, flex: 1.25 },
  // Straight into contact, two hands, the rim takes a beating.
  poster: { from: -1, windup: 0.6, oneHand: false, hangFor: 0.24, swing: 0.4, spin: 0, finishSide: -1, flex: 1.6 },
  // In from the baseline, turning under the rim to finish on the far side.
  'reverse-flush': { from: 1, windup: 0.25, oneHand: true, hangFor: 0.22, swing: 0.35, spin: 0.3, finishSide: 1, flex: 0.85 },
};

function styleFor(id: string): DunkStyle {
  return DUNK_STYLE[id] ?? derivedStyle(id);
}

/** Stable hash of a package id, so a dunk always animates the same way. */
function hashId(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

/**
 * Choreography built from the package id.
 *
 * Fifty packages is far past what is worth hand-tuning, and the five knobs the
 * scene reads already produce visibly different dunks. The hash sets each one,
 * so two packages animate identically only if they share an id.
 */
function derivedStyle(id: string): DunkStyle {
  const n = hashId(id);
  const bit = (shift: number, mask: number) => (n >>> shift) & mask;
  const unit = (shift: number, mask: number) => bit(shift, mask) / mask;
  const from: -1 | 1 = bit(0, 1) ? 1 : -1;
  return {
    from,
    windup: 0.15 + unit(1, 15) * 0.95,
    oneHand: bit(5, 1) === 1,
    // The hang is the most visible difference between two dunks, so it gets the
    // widest spread: some are down and off, some live on the rim.
    hangFor: 0.12 + unit(6, 15) * 0.36,
    swing: 0.2 + unit(10, 7) * 1.1,
    // Rotation pivots about the feet, so it stays small — see the note above.
    spin: bit(13, 3) === 0 ? 0.3 : 0,
    finishSide: bit(15, 1) ? 1 : -1,
    flex: 0.6 + unit(16, 15) * 1.1,
  };
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
  pose: {
    armsUp: number;
    lean: number;
    scale: number;
    tuck?: number;
    /** extra body rotation, for reverses */
    spin?: number;
    /** one-hand finish rather than a two-hand flush */
    oneHand?: boolean;
    /** -1 faces right, +1 faces left — which way the run-up came from */
    facing?: -1 | 1;
  },
): void {
  // The figure stands a little under half the frame, so the rim, the ball and
  // the caption all still read. The first cut of this was ten times too big.
  const bodyH = h * FIGURE_H * pose.scale;
  ctx.save();
  ctx.translate(x, y);
  if ((pose.facing ?? -1) > 0) ctx.scale(-1, 1);
  ctx.rotate(pose.lean * 0.18 + (pose.spin ?? 0));

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
  // The off arm either trails (one-hand) or goes up with it (two-hand flush).
  const off = pose.oneHand === false ? reach : reach * 0.18;
  ctx.beginPath();
  ctx.moveTo(-bodyH * 0.12, -bodyH * 0.74);
  ctx.lineTo(-bodyH * 0.26, -bodyH * (0.68 + off * 0.2));
  if (pose.oneHand === false) ctx.lineTo(-bodyH * 0.3, -bodyH * (0.74 + off * 0.42));
  ctx.stroke();

  // Head.
  ctx.fillStyle = 'rgba(200,138,96,1)';
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.88, bodyH * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
