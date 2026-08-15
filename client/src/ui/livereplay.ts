import {
  COURT,
  DUNK_PACKAGE_BY_ID,
  type Ball,
  type CourtSurface,
  type MatchState,
  type ParkDef,
  type SimPlayer,
  type Side,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { CourtRenderer } from '../render/court.ts';
import { PlayerRenderer } from '../render/players.ts';
import { captureSceneKeys, el } from './dom.ts';
import { audio } from '../engine/audio.ts';

/**
 * The dunk replay, made of the dunk that actually happened.
 *
 * The live game records a rolling few seconds of the sim's own player and
 * ball state every rendered frame. When a dunk earns a replay, the recording
 * is played back through the *same* court and player renderers the game just
 * drew it with — same players, same gear, same package choreography, same
 * poster fall, same rim hang — from a low tracking camera, with the flight in
 * slow motion. Nothing is re-staged: if the defender ended up on the floor in
 * the game, he ends up on the floor here, because these are the frames the
 * game produced.
 *
 * The previous replay was a separate hand-built scene with its own blocky
 * figures. It looked fine and it was a lie — it showed *a* dunk, not the one
 * you did.
 */

export interface ReplayFrame {
  /** every player on the floor, indexed by pid — two in 1v1, six in 3v3 */
  players: SimPlayer[];
  ball: Ball;
  time: number;
}

/**
 * A frame the recorder can keep: scalars copied, the heavy immutable config
 * shared by reference, the little mutable objects (flight, shot profile)
 * copied so later sim frames cannot rewrite history.
 */
export function snapshotFrame(state: MatchState): ReplayFrame {
  const snap = (p: SimPlayer): SimPlayer => ({
    ...p,
    dunk: p.dunk ? { ...p.dunk } : null,
    shotProfile: p.shotProfile ? { ...p.shotProfile } : null,
  });
  return {
    players: state.players.map(snap),
    ball: { ...state.ball },
    time: state.time,
  };
}

export interface LiveReplayOptions {
  frames: ReplayFrame[];
  /** pid of the player who threw it down */
  side: number;
  park: ParkDef;
  courtColor: string | null;
  surface: CourtSurface | null;
  posterized: boolean;
  packageId: string;
  dunkerName: string;
  victimName: string;
}

/**
 * Cuts the recording to the dunk: a beat of the drive, the whole flight, the
 * slam, and every frame of the hang. The recording ends at the moment the
 * replay was cued (the hang ended), so the cut is "walk back to the takeoff,
 * then a second more".
 */
export function cutToDunk(frames: ReplayFrame[], side: number): ReplayFrame[] {
  let takeoff = frames.length - 1;
  for (let i = frames.length - 1; i >= 0; i--) {
    const st = frames[i].players[side].state;
    if (st !== 'rimHang' && st !== 'finishing' && st !== 'airborne') {
      takeoff = i;
      break;
    }
  }
  const start = Math.max(0, takeoff - 55);
  return frames.slice(start);
}

export interface FrameDrawOptions {
  park: ParkDef;
  courtColor: string | null;
  surface: CourtSurface | null;
  width: number;
  height: number;
  rimBend: number;
}

/**
 * One recorded frame, drawn exactly the way the live game draws a frame:
 * backdrop, court, hoop (with whatever the slam is doing to the rim), shadows,
 * then players and ball in depth order. The in-game replay and the package
 * previews both call this, which is what keeps "the preview shows the same
 * thing as the replay" true by construction.
 */
export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  courtRenderer: CourtRenderer,
  playerRenderer: PlayerRenderer,
  frame: ReplayFrame,
  opts: FrameDrawOptions,
): void {
  courtRenderer.drawBackdrop(ctx, opts.park, opts.width, opts.height, frame.time);
  courtRenderer.drawCourt(ctx, cam, opts.park, opts.courtColor, opts.surface);
  courtRenderer.drawHoop(ctx, cam, opts.park, 0, opts.rimBend);

  for (const p of frame.players) playerRenderer.drawShadow(ctx, cam, p.x, p.z, p.y, 0.9 + (p.cfg.heightIn - 70) * 0.012);
  const carried = frame.ball.state === 'dunking' ? frame.ball.owner : null;
  const drawables: { z: number; draw: () => void }[] = [
    ...frame.players.map((p) => ({
      z: p.z,
      draw: () =>
        playerRenderer.draw(
          ctx,
          cam,
          p,
          frame.time,
          false,
          frame.ball.owner === p.pid,
          carried === p.pid ? frame.ball : null,
        ),
    })),
    ...(carried === null
      ? [{ z: frame.ball.z, draw: () => playerRenderer.drawBall(ctx, cam, frame.ball, frame.time) }]
      : []),
  ];
  drawables.sort((a, b) => a.z - b.z);
  for (const d of drawables) d.draw();
}

/**
 * What the slam is doing to the rim at a point in a recording: nothing until
 * the slam, then a damped spring, held down while somebody is hanging on it.
 * Time comes from the recorded sim clock, so slow motion slows the spring too.
 */
export function replayRimBend(frames: ReplayFrame[], idx: number, side: number): number {
  let slamIdx = -1;
  for (let i = 0; i <= idx; i++) {
    if (frames[i].players[side].state === 'rimHang') {
      slamIdx = i;
      break;
    }
  }
  if (slamIdx < 0) return 0;
  const since = frames[idx].time - frames[slamIdx].time;
  const spring = Math.exp(-3.4 * since) * Math.abs(Math.cos(since * 9));
  const hanging = frames[idx].players[side].state === 'rimHang';
  return Math.max(spring, hanging ? 0.5 : 0);
}

export function playLiveReplay(host: HTMLElement, opts: LiveReplayOptions): Promise<void> {
  const frames = cutToDunk(opts.frames, opts.side);
  if (frames.length < 12) return Promise.resolve();

  const pkg = DUNK_PACKAGE_BY_ID[opts.packageId];

  return new Promise((resolve) => {
    let done = false;
    let raf = 0;

    const canvas = el('canvas', { class: 'dunk-canvas' }) as HTMLCanvasElement;
    const scene = el(
      'div',
      { class: `dunk-scene ${opts.posterized ? 'poster' : ''}` },
      canvas,
      el(
        'div',
        { class: 'dunk-caption' },
        el('div', { class: 'dunk-kicker' }, opts.posterized ? 'POSTERIZED' : 'THROWN DOWN'),
        el('div', { class: 'dunk-name' }, pkg?.name ?? 'Dunk'),
        el(
          'div',
          { class: 'dunk-sub' },
          opts.posterized && opts.victimName ? `${opts.dunkerName} on ${opts.victimName}` : opts.dunkerName,
        ),
      ),
      el('div', { class: 'dunk-replay-tag' }, 'REPLAY'),
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
      }, 240);
    };
    const releaseKeys = captureSceneKeys(finish);
    scene.addEventListener('click', finish);
    host.appendChild(scene);

    const cam = new Camera();
    // A telephoto lens, low and to the side of the approach: the broadcast
    // camera watches the game from up high, the replay gets down at shoulder
    // height where a dunk actually looks like one. The position keeps every
    // court polygon safely in front of the near plane.
    cam.fov = 26 * (Math.PI / 180);
    cam.hFov = 38 * (Math.PI / 180);
    const approachX = frames[0].players[opts.side].x;
    const camSide = approachX >= 0 ? 1 : -1;

    const courtRenderer = new CourtRenderer();
    const playerRenderer = new PlayerRenderer();

    // Where the slow motion lives: from takeoff to the slam, then real time
    // through the hang.
    let flightStart = frames.length - 1;
    let slamAt = frames.length - 1;
    for (let i = 0; i < frames.length; i++) {
      const st = frames[i].players[opts.side].state;
      if (st === 'finishing' && flightStart === frames.length - 1) flightStart = i;
      if (st === 'rimHang') {
        slamAt = i;
        break;
      }
    }

    const rate = (idx: number) => (idx >= flightStart - 4 && idx <= slamAt + 6 ? 0.4 : 0.95);

    let pointer = 0;
    let lastNow = performance.now();
    let holdUntil = 0;
    audio.play('ui', 0.7);

    const draw = (now: number) => {
      if (done) return;
      // Floored at zero: a rAF timestamp is the frame's vsync time and the very
    // first one can predate the performance.now() taken at mount, and a
    // negative dt walked the pointer to frames[-1].
    const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

      const idx = Math.min(frames.length - 1, Math.floor(pointer));
      const frameDt = idx + 1 < frames.length ? Math.max(1 / 240, frames[idx + 1].time - frames[idx].time) : 1 / 60;
      pointer = Math.max(0, pointer + (dt * rate(idx)) / frameDt);

      if (pointer >= frames.length - 1) {
        pointer = frames.length - 1;
        if (holdUntil === 0) holdUntil = now + 700;
        else if (now >= holdUntil) {
          finish();
          return;
        }
      }

      const frame = frames[Math.max(0, Math.min(frames.length - 1, Math.floor(pointer)))];
      const dunker = frame.players[opts.side];

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== Math.floor(width * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Track the dunker; drift the camera slowly across so the shot moves.
      const t = pointer / Math.max(1, frames.length - 1);
      cam.pos = { x: camSide * (15 - t * 5), y: 6.2 + t * 1.4, z: 50 };
      cam.target = {
        x: dunker.x * 0.7,
        y: Math.max(4.5, dunker.y + 3.6),
        z: Math.min(24, dunker.z + 2),
      };
      cam.update(width, height);

      drawReplayFrame(ctx, cam, courtRenderer, playerRenderer, frame, {
        park: opts.park,
        courtColor: opts.courtColor,
        surface: opts.surface,
        width,
        height,
        rimBend: replayRimBend(frames, Math.max(0, Math.min(frames.length - 1, Math.floor(pointer))), opts.side),
      });

      // Letterbox, which is most of what "this is a replay" reads as.
      ctx.fillStyle = 'rgba(4, 5, 9, 0.92)';
      const bar = height * 0.085;
      ctx.fillRect(0, 0, width, bar);
      ctx.fillRect(0, height - bar, width, bar);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    void COURT;
  });
}
