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
/**
 * One frame of a dunk.
 *
 * The layout is deliberately not to scale. A six-and-a-half foot player with a
 * normal standing reach only needs about sixteen inches of hops to touch a ten
 * foot rim, so drawn honestly he barely leaves the floor and the whole thing
 * reads as a tall man putting his hand up — which is exactly how it looked. The
 * figure is therefore small against a high rim, so the leap is a third of the
 * frame and he finishes clearly above the ring and in front of it.
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
  const floorY = h * 0.9;
  const rimX = w * 0.6;
  const rimY = h * 0.3;
  const u = h / 360;
  const bodyH = h * FIGURE_H;
  const style = styleFor(opts.packageId);

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

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, floorY, w, h - floorY);

  // ---------------------------------------------------------------- timing
  const hangStart = 1 - style.hangFor;
  const riseStart = Math.max(0.18, hangStart - 0.3);
  const approach = Math.min(1, t / riseStart);
  const rise = t < riseStart ? 0 : Math.min(1, (t - riseStart) / (hangStart - riseStart));
  const hang = t < hangStart ? 0 : Math.min(1, (t - hangStart) / style.hangFor);
  const flush = Math.max(0, Math.min(1, (t - hangStart) / 0.14));

  // Backboard, drawn behind everything the player does.
  ctx.strokeStyle = 'rgba(238,242,248,0.8)';
  ctx.lineWidth = 3 * u;
  ctx.strokeRect(rimX + 26 * u, rimY - 54 * u, 76 * u, 66 * u);

  // ------------------------------------------------------------- the leap
  // Feet at the flush sit a whole body-and-a-third above the rim line, so the
  // hands clear the ring rather than arriving level with it.
  const airFeetY = rimY + bodyH * 1.26;
  const release = Math.max(0, (hang - 0.72) / 0.28);
  const arc = Math.sin(Math.min(1, rise) * Math.PI * 0.5);

  // In front of the ring, on the near side, not underneath it.
  const gripX = rimX - 16 * u;
  const startX = style.from < 0 ? w * 0.06 : w * 0.94;
  const runX = startX + (gripX - startX) * easeOut(approach);
  const swing = hang > 0 ? Math.sin(hang * Math.PI * 2.2) * (1 - hang) * style.swing : 0;

  // The approach has a shape of its own. A hop step is a bounce off one foot
  // before the gather; a eurostep is two long strides that carry sideways. Both
  // used to be a straight glide identical to every other package.
  let entryLift = 0;
  let entryShift = 0;
  if (t < riseStart) {
    if (style.entry === 'hop') {
      entryLift = Math.abs(Math.sin(approach * Math.PI * 2)) * bodyH * 0.16;
    } else if (style.entry === 'euro') {
      // Two strides, the second one long and across the body.
      const stride = Math.sin(approach * Math.PI * 2);
      entryShift = -style.from * stride * 30 * u;
      entryLift = Math.abs(stride) * bodyH * 0.07;
    }
  }

  const px = hang > 0 ? gripX + swing * 22 * u : runX + entryShift;
  const py =
    hang > 0
      ? airFeetY + release * (floorY - airFeetY) * 0.95
      : floorY - arc * (floorY - airFeetY) - entryLift;

  // The rim bends under the weight and springs back as he lets go.
  const rimFlex = hang > 0 ? Math.sin(Math.min(1, hang * 1.6) * Math.PI * 0.7) * (1 - release) * 9 * u * style.flex : 0;
  const rimYNow = rimY + rimFlex;

  // Rim and net.
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
    const fall = Math.max(0, (t - hangStart * 0.9) / 0.4);
    drawFigure(ctx, rimX - 74 * u, floorY, h, opts.victim.jerseyPrimary, opts.victim.jerseySecondary, {
      armsUp: 1 - fall,
      lean: fall * 1.35,
      scale: 0.92,
    });
  }

  // ------------------------------------------------------- the dunker
  // Where the ball is, as an angle swung around the shoulder. This is what
  // actually separates a windmill from a tomahawk from a cradle: the path the
  // ball takes on the way to the rim, not how long he hangs afterwards.
  const swingT = hang > 0 ? 1 : rise;
  const ballAngle = ballAngleFor(style.motion, swingT, hang);
  const bodySpin = spinFor(style.motion, rise, hang);

  const hand = drawFigure(ctx, px, py + (hang > 0 ? rimFlex : 0), h, primary, accent, {
    armsUp: 0.35 + arc * 1.1,
    lean: hang > 0 ? swing * 0.9 : -0.2 - rise * 0.3,
    scale: 1,
    tuck: hang > 0 ? (1 - release) * 0.8 : 0,
    spin: bodySpin,
    oneHand: style.oneHand,
    facing: turnedAway(style.motion, rise, hang) ? ((style.from * -1) as -1 | 1) : style.from,
    ballAngle,
    reaching: Math.max(rise, hang > 0 ? 1 : 0),
  });

  // The ball. On a running dunk it is in his hand the whole way up; on an oop, a
  // board or a putback it is in the air first and he takes it out of the air,
  // which is the entire difference between those packages and a plain slam.
  const ballR = h * 0.032;
  const catchAt = riseStart * 0.92;
  const loose = looseBall(style.entry, t, catchAt, style.from, startX, gripX, floorY, rimX, rimY, u);
  ctx.fillStyle = '#e0762c';
  ctx.beginPath();
  if (loose) {
    ctx.arc(loose.x, loose.y, ballR, 0, Math.PI * 2);
  } else if (t < hangStart) {
    ctx.arc(hand.x, hand.y, ballR, 0, Math.PI * 2);
  } else {
    const drop = Math.min(1, (t - hangStart) / 0.32);
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
 * Which way the ball is held, as an angle from straight overhead. Positive is
 * behind the head, negative is out in front and low.
 */
function ballAngleFor(motion: DunkMotion, rise: number, hang: number): number {
  const settle = hang > 0 ? 1 - Math.min(1, hang * 4) : 1;
  switch (motion) {
    case 'tomahawk':
      // Cocked right back behind the head, then chopped over the top.
      return (2.4 * Math.sin(rise * Math.PI * 0.9)) * settle;
    case 'windmill':
      // A full circle: down past the hip, out wide, over the top.
      return (-2.2 + rise * 5.0) * settle;
    case 'cradle':
      // Rocked into the chest, held there, and only extended at the last beat.
      return (-1.8 + Math.max(0, rise - 0.6) * 4.5) * settle;
    case 'doubleClutch':
      // Up, pulled back down, and up again.
      return (1.6 * Math.sin(rise * Math.PI * 2)) * settle;
    case 'reverse':
      // Carried across the body to finish on the far side of the ring.
      return (-1.4 * Math.sin(rise * Math.PI)) * settle;
    case 'spin':
      // Held tight while the body does the work.
      return 0.5 * Math.sin(rise * Math.PI) * settle;
    case 'hammer':
      // Straight up and driven straight down, no flourish.
      return 0.25 * rise * settle;
    case 'betweenLegs':
      // All the way down past the waist, through, and up the far side. The big
      // negative swing is the point — the ball has to get below the hips.
      return (-3.4 * Math.sin(Math.min(1, rise * 1.35) * Math.PI) + rise * 2.2) * settle;
    case 'behindBack':
      // Swung out and round the back, so it disappears behind the body before
      // it comes over the top.
      return (3.6 * Math.sin(Math.min(1, rise * 1.2) * Math.PI * 0.8)) * settle;
    case 'doublePump':
      // Three beats rather than the double clutch's two, and shallower.
      return (1.2 * Math.sin(rise * Math.PI * 3)) * settle;
    case 'spin360':
    case 'spin540':
      // Held tight to the chest — on a rotating dunk the body does all of it.
      return 0.3 * Math.sin(rise * Math.PI) * settle;
    default:
      return 0;
  }
}

/**
 * How far the body tilts through the leap.
 *
 * Deliberately small. The figure rotates about its feet, so a real 360 swings
 * the whole body out of frame and lands it sideways — which is what the first
 * cut did. A turn is sold by the figure flipping to show its back instead, and
 * this is only the lean on top of that.
 */
function spinFor(motion: DunkMotion, rise: number, hang: number): number {
  const through = hang > 0 ? 1 : rise;
  if (motion === 'spin') return Math.sin(through * Math.PI * 2) * 0.4;
  if (motion === 'spin360') return Math.sin(through * Math.PI * 2) * 0.5;
  // One and a half turns, so it wobbles more on the way round.
  if (motion === 'spin540') return Math.sin(through * Math.PI * 3) * 0.5;
  if (motion === 'reverse') return through * 0.3;
  if (motion === 'windmill') return through * 0.2;
  if (motion === 'behindBack') return through * 0.26;
  return 0;
}

/**
 * True while a turning dunk has his back to you.
 *
 * This is how a rotation is actually sold. The figure pivots about its feet, so
 * turning it far enough to read as a spin throws it out of frame — flipping which
 * way it faces does the job and stays where it is put. The number of flips is
 * what separates a 360 from a 540.
 */
function turnedAway(motion: DunkMotion, rise: number, hang: number): boolean {
  const through = hang > 0 ? 1 : rise;
  if (motion === 'spin') return through > 0.35 && through < 0.85;
  // A full turn: away and back again by the flush.
  if (motion === 'spin360') return through > 0.3 && through < 0.8;
  // One and a half: away, back, away, and it stays turned at the rim.
  if (motion === 'spin540') return through % 0.66 > 0.33;
  if (motion === 'reverse') return through > 0.55;
  if (motion === 'behindBack') return through > 0.4 && through < 0.75;
  return false;
}

/**
 * Where the ball is before he has it, as a point in the frame, or null while it
 * is simply in his hand.
 *
 * `oop`, `glass` and `putback` all start with the ball somewhere other than the
 * hand, which is the whole difference between them and a running dunk.
 */
function looseBall(
  entry: DunkEntry,
  t: number,
  catchAt: number,
  from: -1 | 1,
  startX: number,
  gripX: number,
  floorY: number,
  rimX: number,
  rimY: number,
  u: number,
): { x: number; y: number } | null {
  if (entry !== 'oop' && entry !== 'glass' && entry !== 'putback') return null;
  if (t >= catchAt) return null;
  const k = Math.min(1, t / Math.max(0.001, catchAt));
  // Where he will be when he takes it: up in front of the ring.
  const catchX = gripX + from * 10 * u;
  const catchY = rimY + 26 * u;

  if (entry === 'putback') {
    // It came off the iron: up off the ring, then down into his hands.
    const x = rimX + 6 * u + (catchX - rimX - 6 * u) * k;
    const up = Math.sin(k * Math.PI * 0.9) * 30 * u;
    const y = rimY - 14 * u - up + (catchY - (rimY - 14 * u)) * (k * k);
    return { x, y };
  }

  if (entry === 'glass') {
    // Thrown at the board, off it, and back out to him.
    const boardX = rimX + 44 * u;
    const boardY = rimY - 26 * u;
    if (k < 0.55) {
      const j = k / 0.55;
      return {
        x: startX + (boardX - startX) * j,
        y: floorY - bodyOffset(u) - Math.sin(j * Math.PI * 0.5) * (floorY - boardY - bodyOffset(u)),
      };
    }
    const j = (k - 0.55) / 0.45;
    return { x: boardX + (catchX - boardX) * j, y: boardY + (catchY - boardY) * j };
  }

  // Self alley-oop: tossed up ahead of himself and taken out of the air.
  const x = startX + (catchX - startX) * k;
  const peak = rimY - 34 * u;
  const y =
    k < 0.5
      ? floorY - bodyOffset(u) + (peak - (floorY - bodyOffset(u))) * (k / 0.5)
      : peak + (catchY - peak) * ((k - 0.5) / 0.5);
  return { x, y };
}

/** Roughly chest height, for where a toss leaves the hands. */
function bodyOffset(u: number): number {
  return 60 * u;
}

/**
 * The named motions. This is what makes a Windmill a windmill: the packages had
 * five knobs that changed how long a dunk hung and which side it came from, and
 * nothing that changed what the arms actually did, so fifty packages ran one
 * animation at different speeds.
 */
export type DunkMotion =
  | 'flush'
  | 'tomahawk'
  | 'windmill'
  | 'cradle'
  | 'doubleClutch'
  | 'reverse'
  | 'spin'
  | 'hammer'
  | 'betweenLegs'
  | 'behindBack'
  | 'doublePump'
  | 'spin360'
  | 'spin540';

/**
 * How the dunker gets to the rim, and where the ball is while he does.
 *
 * Separate from the motion because they are genuinely different things: a Self
 * Alley-Oop Windmill is a windmill whose ball is in the air rather than in a
 * hand for the first half, and the arms do the same thing either way. Folding
 * them together would have needed a motion per pairing.
 */
export type DunkEntry =
  | 'run'
  | 'hop'
  | 'euro'
  | 'putback'
  | 'oop'
  | 'glass';

interface DunkStyle {
  /** run-up side: -1 comes in from the left, +1 from the right */
  from: -1 | 1;
  /** what the arms do on the way up */
  motion: DunkMotion;
  /** how he arrives, and where the ball comes from */
  entry: DunkEntry;
  /** true for a one-hand finish, false for a two-hand flush */
  oneHand: boolean;
  /** fraction of the scene spent hanging off the rim */
  hangFor: number;
  /** how hard the body swings under the rim */
  swing: number;
  /** how much the rim bends */
  flex: number;
}

const DUNK_STYLE: Record<string, DunkStyle> = {
  'basic-slam': { from: -1, motion: 'flush', entry: 'run', oneHand: false, hangFor: 0.14, swing: 0.25, flex: 0.7 },
  tomahawk: { from: -1, motion: 'tomahawk', entry: 'run', oneHand: true, hangFor: 0.2, swing: 0.5, flex: 1 },
  'rim-hang': { from: 1, motion: 'flush', entry: 'run', oneHand: true, hangFor: 0.44, swing: 1.15, flex: 1.25 },
  poster: { from: -1, motion: 'hammer', entry: 'run', oneHand: false, hangFor: 0.24, swing: 0.4, flex: 1.7 },
  'reverse-flush': { from: 1, motion: 'reverse', entry: 'run', oneHand: true, hangFor: 0.2, swing: 0.35, flex: 0.85 },
};

/**
 * Names carry the motion. A package called Windmill windmills, a package called
 * Cradle Slam rocks the ball into the chest — read straight off the id rather
 * than hand-assigned, so a new package named after a real dunk gets that dunk.
 */
const MOTION_KEYWORDS: [string, DunkMotion][] = [
  // Order matters: the first key found in the id wins, so the compound names go
  // above the plain ones. 'between-the-legs-windmill' is a between-the-legs.
  ['between-the-legs', 'betweenLegs'],
  ['behind-the-back', 'behindBack'],
  ['540', 'spin540'],
  ['360', 'spin360'],
  ['double-pump', 'doublePump'],
  ['windmill', 'windmill'],
  ['tomahawk', 'tomahawk'],
  ['cradle', 'cradle'],
  ['rock-the-baby', 'cradle'],
  ['double-clutch', 'doubleClutch'],
  ['clutch', 'doubleClutch'],
  ['reverse', 'reverse'],
  ['under-the-rim', 'reverse'],
  ['turn-back', 'reverse'],
  ['half-turn', 'spin'],
  ['full-turn', 'spin'],
  ['shoulder-roll', 'spin'],
  ['scissor', 'windmill'],
  ['split-step', 'windmill'],
  ['hammer', 'hammer'],
  ['anvil', 'hammer'],
  ['sledge', 'hammer'],
  ['guillotine', 'hammer'],
  ['battering', 'hammer'],
  ['freight', 'hammer'],
  ['cocked-back', 'tomahawk'],
  ['loaded', 'tomahawk'],
  ['slingshot', 'tomahawk'],
  ['catapult', 'tomahawk'],
  ['trigger', 'doubleClutch'],
  ['leg-kick', 'windmill'],
  ['statue', 'cradle'],
  ['curtain', 'hammer'],
];

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

function derivedStyle(id: string): DunkStyle {
  const n = hashId(id);
  const bit = (shift: number, mask: number) => (n >>> shift) & mask;
  const unit = (shift: number, mask: number) => bit(shift, mask) / mask;

  // The name wins if it describes a real dunk; otherwise the hash picks one.
  const named = MOTION_KEYWORDS.find(([key]) => id.includes(key));
  const pool: DunkMotion[] = ['flush', 'tomahawk', 'windmill', 'cradle', 'doubleClutch', 'reverse', 'spin', 'hammer'];
  const motion = named ? named[1] : pool[bit(0, 7) % pool.length];
  const entry = ENTRY_KEYWORDS.find(([key]) => id.includes(key))?.[1] ?? 'run';
  // A contact finish hangs on and bends the iron; that is what the word means.
  const contact = id.includes('contact') || id.includes('poster');

  return {
    from: bit(4, 1) ? 1 : -1,
    motion,
    entry,
    oneHand: motion !== 'flush' && motion !== 'hammer' ? true : bit(5, 1) === 1,
    hangFor: contact ? 0.3 + unit(6, 15) * 0.18 : 0.14 + unit(6, 15) * 0.34,
    swing: contact ? 0.7 + unit(10, 7) * 0.8 : 0.2 + unit(10, 7) * 1.1,
    flex: contact ? 1.5 + unit(16, 15) * 0.5 : 0.6 + unit(16, 15) * 1.1,
  };
}

/**
 * How he arrives. Same idea as the motion keywords: a package called Off-Backboard
 * throws it off the glass, a Putback takes it off the iron, a Self Alley-Oop
 * throws it to itself.
 */
const ENTRY_KEYWORDS: [string, DunkEntry][] = [
  ['off-backboard', 'glass'],
  ['off-the-glass', 'glass'],
  ['self-alley-oop', 'oop'],
  ['alley-oop', 'oop'],
  ['putback', 'putback'],
  ['hop-step', 'hop'],
  ['hop-dunk', 'hop'],
  ['euro', 'euro'],
  ['gather-step', 'hop'],
  ['long-stride', 'euro'],
];

/**
 * Figure height as a fraction of the frame. Small, on purpose — see the note on
 * drawDunkFrame about why an honestly scaled player cannot look like he is
 * dunking.
 */
const FIGURE_H = 0.235;

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** A blocky side-on figure. Returns where the dunking hand ended up. */
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
    spin?: number;
    oneHand?: boolean;
    facing?: -1 | 1;
    /** where the ball hand is, as an angle from straight overhead */
    ballAngle?: number;
    /** 0 on the floor, 1 fully extended at the rim */
    reaching?: number;
  },
): { x: number; y: number } {
  const bodyH = h * FIGURE_H * pose.scale;
  ctx.save();
  ctx.translate(x, y);
  if ((pose.facing ?? -1) > 0) ctx.scale(-1, 1);
  ctx.rotate(pose.lean * 0.18 + (pose.spin ?? 0));

  // Legs. Hanging off the rim they tuck up rather than dangling straight.
  const tuck = pose.tuck ?? 0;
  ctx.strokeStyle = 'rgba(180,120,80,1)';
  ctx.lineWidth = bodyH * 0.085;
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
  ctx.lineWidth = bodyH * 0.014;
  ctx.stroke();

  // Arms. The ball arm swings to wherever the motion has put the ball; the off
  // arm either goes up with it or trails for balance.
  ctx.strokeStyle = 'rgba(190,128,86,1)';
  ctx.lineWidth = bodyH * 0.07;
  const shoulderY = -bodyH * 0.74;
  // Arm length is half a body at full extension, which puts the hand about
  // 1.24 body-heights above the feet — the same figure airFeetY uses to park him
  // at the rim, so the hand lands on the ring rather than sailing past it. The
  // first cut had the arm nearly as long as the whole body.
  const armLen = bodyH * (0.3 + (pose.reaching ?? 0) * 0.2);
  const angle = pose.ballAngle ?? 0;
  // Angle zero is straight up; positive swings behind, negative out in front.
  const handX = bodyH * 0.12 + Math.sin(angle) * armLen;
  const handY = shoulderY - Math.cos(angle) * armLen;
  const elbowX = bodyH * 0.12 + Math.sin(angle * 0.65) * armLen * 0.55;
  const elbowY = shoulderY - Math.cos(angle * 0.65) * armLen * 0.55;
  ctx.beginPath();
  ctx.moveTo(bodyH * 0.12, shoulderY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  const twoHand = pose.oneHand === false;
  ctx.beginPath();
  ctx.moveTo(-bodyH * 0.12, shoulderY);
  if (twoHand) {
    ctx.lineTo(-elbowX * 0.8, elbowY);
    ctx.lineTo(-handX * 0.55, handY);
  } else {
    ctx.lineTo(-bodyH * 0.28, shoulderY + bodyH * (0.06 - (pose.reaching ?? 0) * 0.18));
  }
  ctx.stroke();

  // Head.
  ctx.fillStyle = 'rgba(200,138,96,1)';
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.88, bodyH * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Hand position back in canvas space, so the ball can sit in it.
  const flip = (pose.facing ?? -1) > 0 ? -1 : 1;
  const rot = pose.lean * 0.18 + (pose.spin ?? 0);
  const hx = handX * flip;
  return {
    x: x + hx * Math.cos(rot) - handY * Math.sin(rot),
    y: y + hx * Math.sin(rot) + handY * Math.cos(rot),
  };
}
