import {
  DUNK_PACKAGE_BY_ID,
  PARK_BY_ID,
  SIM_DT,
  createMatch,
  defaultMatchConfig,
  drainEvents,
  emptyInput,
  stepMatch,
  type SimPlayerConfig,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { CourtRenderer } from '../render/court.ts';
import { PlayerRenderer } from '../render/players.ts';
import {
  cutToDunk,
  drawReplayFrame,
  replayRimBend,
  snapshotFrame,
  type ReplayFrame,
} from './livereplay.ts';

/**
 * The package preview is the replay, one for one.
 *
 * The old preview was the hand-built dunk scene with its own blocky figure —
 * you would buy a package off one animation and see a different one in the
 * game. This runs the *actual simulation*: your build, the package equipped,
 * a real drive, a real green, the real flight and hang, recorded exactly the
 * way the in-game replay recorder records, and drawn by the same frame
 * renderer. What the preview shows is what the game does, because it is the
 * game doing it.
 */

const recordingCache = new Map<string, ReplayFrame[] | null>();

/**
 * Records one emphatic dunk with this package by actually playing it.
 *
 * Attributes are raised to the package's own gates (a preview must never show
 * nothing because your build cannot throw it yet — the card already says what
 * it needs), then the release timing is swept until the meter greens. The
 * sweep is deterministic, so a package always previews the same dunk.
 */
export function recordPackageDunk(
  baseCfg: SimPlayerConfig,
  packageId: string,
  poster: boolean,
): ReplayFrame[] | null {
  const key = `${baseCfg.id}:${packageId}:${poster}`;
  const cached = recordingCache.get(key);
  if (cached !== undefined) return cached;

  const pkg = DUNK_PACKAGE_BY_ID[packageId];
  if (!pkg) {
    recordingCache.set(key, null);
    return null;
  }

  const cfg: SimPlayerConfig = {
    ...baseCfg,
    attrs: { ...baseCfg.attrs },
    dunkPackageId: packageId,
  };
  cfg.attrs.dunk = Math.max(cfg.attrs.dunk, pkg.requires, 82);
  cfg.attrs.vertical = Math.max(cfg.attrs.vertical, pkg.requiresVertical, 80);
  cfg.attrs.speed = Math.max(cfg.attrs.speed, 86);
  cfg.attrs.speedWithBall = Math.max(cfg.attrs.speedWithBall, 86);
  cfg.attrs.acceleration = Math.max(cfg.attrs.acceleration, 86);
  cfg.attrs.strength = Math.max(cfg.attrs.strength, 84);
  cfg.attrs.stamina = 95;

  const victim: SimPlayerConfig = {
    ...baseCfg,
    id: 'preview-defender',
    name: 'Defender',
    isBot: true,
    jerseyPrimary: '#8c93a6',
    jerseySecondary: '#41485c',
    ankleThreat: 0,
  };

  for (let release = 22; release <= 68; release += 2) {
    const state = createMatch(
      cfg,
      victim,
      defaultMatchConfig({ manualCheck: false, instantInbound: true, shotClock: 999 }),
      4242 + release,
    );
    for (let i = 0; i < 160; i++) stepMatch(state, [emptyInput(), emptyInput()], SIM_DT);

    const p = state.players[0];
    const d = state.players[1];
    p.x = 1;
    p.z = 16;
    p.state = 'dribble';
    p.stamina = 1;
    state.ball.owner = 0;
    state.ball.state = 'held';
    state.needsClear = false;

    const drive = { ...emptyInput(), mz: -1, sprint: true };
    const parkDefender = () => {
      if (d.state === 'fallen') return;
      if (poster) {
        // Planted in the lane, standing his ground: the most posterisable
        // thing in basketball, and exactly what the game itself calls one.
        d.x = p.x * 0.5;
        d.z = Math.max(6.5, p.z - 3);
        d.handUp = true;
      } else {
        d.x = 18;
        d.z = 27;
      }
      d.vx = 0;
      d.vz = 0;
    };

    for (let i = 0; i < 40; i++) {
      parkDefender();
      stepMatch(state, [drive, emptyInput()], SIM_DT);
    }

    const buffer: ReplayFrame[] = [];
    let cued: boolean | null = null;
    for (let i = 0; i < 540 && cued === null; i++) {
      parkDefender();
      stepMatch(state, [i < release ? { ...drive, shoot: true } : drive, emptyInput()], SIM_DT);
      buffer.push(snapshotFrame(state));
      for (const e of drainEvents(state)) {
        if (e.type === 'dunkHighlight') cued = e.posterized;
      }
    }
    if (cued !== null && (!poster || cued)) {
      const frames = cutToDunk(buffer, 0);
      recordingCache.set(key, frames);
      return frames;
    }
  }

  recordingCache.set(key, null);
  return null;
}

/**
 * Plays a recorded package dunk on a preview canvas, on a loop: slow motion
 * through the flight, real time through the hang, a beat of black, again.
 * Returns a stop function; it also stops itself when the canvas leaves the
 * document, so callers that forget are not leaking animation frames.
 */
export function mountDunkPreview(
  canvas: HTMLCanvasElement,
  baseCfg: SimPlayerConfig,
  packageId: string,
  poster: boolean,
): () => void {
  const frames = recordPackageDunk(baseCfg, packageId, poster);
  let raf = 0;
  let stopped = false;

  if (!frames || frames.length < 12) {
    // Nothing recordable (an unknown id): leave the canvas dark rather than
    // pretending with a staged scene.
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return () => undefined;
  }

  const cam = new Camera();
  cam.fov = 26 * (Math.PI / 180);
  cam.hFov = 38 * (Math.PI / 180);
  const courtRenderer = new CourtRenderer();
  const playerRenderer = new PlayerRenderer();
  const park = PARK_BY_ID['downtown'];

  let flightStart = frames.length - 1;
  let slamAt = frames.length - 1;
  for (let i = 0; i < frames.length; i++) {
    const st = frames[i].players[0].state;
    if (st === 'finishing' && flightStart === frames.length - 1) flightStart = i;
    if (st === 'rimHang') {
      slamAt = i;
      break;
    }
  }
  const rate = (idx: number) => (idx >= flightStart - 4 && idx <= slamAt + 6 ? 0.45 : 0.95);

  let pointer = 0;
  let lastNow = performance.now();
  let holdUntil = 0;

  const draw = (now: number) => {
    if (stopped) return;
    if (!canvas.isConnected) {
      stopped = true;
      return;
    }
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
      if (holdUntil === 0) holdUntil = now + 800;
      else if (now >= holdUntil) {
        pointer = 0;
        holdUntil = 0;
      }
    }

    const frame = frames[Math.max(0, Math.min(frames.length - 1, Math.floor(pointer)))];
    const dunker = frame.players[0];

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 420;
    const height = canvas.clientHeight || 260;
    if (canvas.width !== Math.floor(width * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = pointer / Math.max(1, frames.length - 1);
    cam.pos = { x: 13 - t * 4, y: 6.2 + t * 1.2, z: 50 };
    cam.target = {
      x: dunker.x * 0.7,
      y: Math.max(4.5, dunker.y + 3.4),
      z: Math.min(22, dunker.z + 2),
    };
    cam.update(width, height);

    drawReplayFrame(ctx, cam, courtRenderer, playerRenderer, frame, {
      park,
      courtColor: null,
      surface: null,
      width,
      height,
      rimBend: replayRimBend(frames, Math.min(frames.length - 1, Math.floor(pointer)), 0),
    });

    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
