import {
  AiController,
  GRADE_COLOR,
  GRADE_LABEL,
  PARK_BY_ID,
  SIM_DT,
  createMatch,
  defaultMatchConfig,
  drainEvents,
  emptyInput,
  isBeyondArc,
  stepMatch,
  type Difficulty,
  type MatchConfig,
  type MatchState,
  type PlayerInput,
  type PlayerMatchStats,
  type SimEvent,
  type SimPlayerConfig,
  type Side,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { GameLoop } from '../engine/loop.ts';
import { InputManager } from '../engine/input.ts';
import { audio } from '../engine/audio.ts';
import { CourtRenderer } from '../render/court.ts';
import { PlayerRenderer } from '../render/players.ts';
import { Hud } from '../render/hud.ts';
import { store } from '../state/store.ts';
import { el, clear } from './dom.ts';
import { buildTouchControls } from './touch.ts';

export interface MatchResult {
  won: boolean;
  score: [number, number];
  stats: PlayerMatchStats;
  opponentStats: PlayerMatchStats;
  durationSeconds: number;
  greenRate: number;
  quit: boolean;
  simBadges: SimPlayerConfig['badges'];
}

export interface NetAdapter {
  /** Latest remote input for this frame. */
  remoteInput(frame: number): PlayerInput;
  /** Push the local input up to the server. */
  sendInput(frame: number, input: PlayerInput): void;
  /** Reconcile against an authoritative snapshot if one arrived. */
  reconcile(state: MatchState): void;
  latencyMs(): number;
  close(): void;
}

export interface MatchOptions {
  opponent: SimPlayerConfig;
  difficulty: Difficulty;
  parkId: string;
  config?: Partial<MatchConfig>;
  localSide?: Side;
  net?: NetAdapter | null;
  seed?: number;
  onFinish: (result: MatchResult) => void;
}

export function createMatchScreen(opts: MatchOptions): HTMLElement {
  const root = el('div', { class: 'match-root' });
  const canvas = el('canvas', { id: 'gamecanvas' }) as HTMLCanvasElement;
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false })!;
  const settings = store.settings;
  const localSide: Side = opts.localSide ?? 0;
  const remoteSide: Side = localSide === 0 ? 1 : 0;

  const localCfg = store.simConfig();
  const configs: [SimPlayerConfig, SimPlayerConfig] =
    localSide === 0 ? [localCfg, opts.opponent] : [opts.opponent, localCfg];

  const matchConfig = defaultMatchConfig({ parkId: opts.parkId, ...opts.config });
  const seed = opts.seed ?? (Math.random() * 0xffffffff) >>> 0;
  const state = createMatch(configs[0], configs[1], matchConfig, seed);

  const ai = opts.net ? null : new AiController(remoteSide, opts.difficulty, seed ^ 0x5bf03, true);
  const park = PARK_BY_ID[opts.parkId] ?? PARK_BY_ID['downtown'];

  const cam = new Camera();
  const courtRenderer = new CourtRenderer();
  const playerRenderer = new PlayerRenderer();
  const hud = new Hud();
  const input = new InputManager();
  input.attach();
  audio.masterVolume = settings.masterVolume;
  audio.sfxVolume = settings.sfxVolume;
  audio.unlock();

  let paused = false;
  let finished = false;
  let netSwing = 0;
  let shake = 0;
  let dribbleTimer = 0;
  let elapsedRealSeconds = 0;
  let localAttempts = 0;
  let localGreens = 0;
  const courtColor = courtColorFor(store.player.loadout.courtId);

  // ------------------------------------------------------------------ canvas
  let width = 0;
  let height = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 1 : settings.quality === 'medium' ? 1.5 : 2);
    width = root.clientWidth || window.innerWidth;
    height = root.clientHeight || window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ pause
  const pauseHost = el('div', { style: 'position:absolute;inset:0;pointer-events:none' });
  root.appendChild(pauseHost);

  const closeAndFinish = (quit: boolean) => {
    if (finished) return;
    finished = true;
    loop.stop();
    input.detach();
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    opts.net?.close();
    const winner = state.winner;
    opts.onFinish({
      won: winner === localSide,
      score: [state.score[localSide], state.score[remoteSide]],
      stats: state.stats[localSide],
      opponentStats: state.stats[remoteSide],
      durationSeconds: elapsedRealSeconds,
      greenRate: localAttempts > 0 ? localGreens / localAttempts : 0,
      quit,
      simBadges: state.players[localSide].cfg.badges,
    });
  };

  const renderPause = () => {
    clear(pauseHost);
    if (!paused) {
      pauseHost.style.pointerEvents = 'none';
      return;
    }
    pauseHost.style.pointerEvents = 'auto';
    pauseHost.appendChild(
      el(
        'div',
        { class: 'overlay', style: 'position:absolute' },
        el(
          'div',
          { class: 'box', style: 'max-width:420px' },
          el('h2', { style: 'margin:0 0 4px;font-size:24px;font-weight:900' }, 'Paused'),
          el('p', { class: 'dim', style: 'margin:0 0 20px' }, `${state.score[0]} – ${state.score[1]} · first to ${matchConfig.targetScore}`),
          el(
            'div',
            { style: 'display:grid;gap:8px' },
            el('button', { class: 'btn primary block', onclick: () => togglePause(false) }, 'Resume'),
            el(
              'button',
              {
                class: 'btn block',
                onclick: () => {
                  const styles = ['arcBar', 'sideBar', 'circleRing', 'dualPips', 'hidden'] as const;
                  const next = styles[(styles.indexOf(store.settings.shotMeterStyle) + 1) % styles.length];
                  store.update((p) => {
                    p.settings.shotMeterStyle = next;
                  });
                  renderPause();
                },
              },
              `Shot meter: ${store.settings.shotMeterStyle}`,
            ),
            el('button', { class: 'btn danger block', onclick: () => closeAndFinish(true) }, 'Forfeit match'),
          ),
        ),
      ),
    );
  };

  const togglePause = (value: boolean) => {
    if (opts.net) return; // online matches never pause the world
    paused = value;
    renderPause();
  };
  input.onPause = () => togglePause(!paused);

  // ----------------------------------------------------------- touch controls
  if (settings.touchControls) {
    root.appendChild(buildTouchControls(input.touch));
  }

  // -------------------------------------------------------------------- step
  const step = (dt: number) => {
    if (paused || finished) return;
    elapsedRealSeconds += dt;

    const localInput = input.sample();
    let remote: PlayerInput;
    if (opts.net) {
      opts.net.sendInput(state.frame, localInput);
      remote = opts.net.remoteInput(state.frame);
    } else {
      remote = ai ? ai.update(state, dt) : emptyInput();
    }

    const inputs: [PlayerInput, PlayerInput] =
      localSide === 0 ? [localInput, remote] : [remote, localInput];

    stepWorld(inputs, dt);
    opts.net?.reconcile(state);
  };

  const stepWorld = (inputs: [PlayerInput, PlayerInput], dt: number) => {
    const before = state.phase;
    stepMatch(state, inputs, dt);
    if (before !== 'over' && state.phase === 'over') {
      audio.play('buzzer');
      setTimeout(() => closeAndFinish(false), 1800);
    }
    handleEvents(drainEvents(state));
  };

  const handleEvents = (events: SimEvent[]) => {
    for (const e of events) {
      switch (e.type) {
        case 'shotRelease': {
          const p = state.players[e.side];
          if (e.side === localSide) {
            localAttempts++;
            if (e.grade === 'green') localGreens++;
            hud.flashGrade(e.grade);
          }
          ai?.notifyOpponentShot(e.side !== remoteSide && e.grade === 'green');
          hud.push(GRADE_LABEL[e.grade], GRADE_COLOR[e.grade], p.x, p.z, e.grade === 'green');
          if (e.grade === 'green') audio.play('green');
          break;
        }
        case 'score': {
          const p = state.players[e.side];
          netSwing = 1;
          audio.play('swish');
          hud.push(`+${e.value}`, '#3ef07a', p.x, p.z, true);
          break;
        }
        case 'miss':
          audio.play('rim');
          netSwing = 0.35;
          break;
        case 'block': {
          const p = state.players[e.side];
          audio.play('block');
          shake = Math.min(1, shake + (e.chaseDown ? 1 : 0.6));
          hud.push(e.chaseDown ? 'CHASE-DOWN!' : 'BLOCKED!', '#4aa3ff', p.x, p.z, true);
          break;
        }
        case 'steal': {
          const p = state.players[e.side];
          audio.play('steal');
          hud.push('STRIPPED', '#ffc53d', p.x, p.z);
          break;
        }
        case 'ankleBreaker': {
          const p = state.players[e.side];
          audio.play('ankle');
          shake = Math.min(1, shake + 0.7);
          hud.push('ANKLES!', '#ff5c8a', p.x, p.z, true);
          break;
        }
        case 'contactDunk': {
          const p = state.players[e.side];
          audio.play('dunk');
          shake = 1;
          hud.push('POSTER!', '#ff7a3d', p.x, p.z, true);
          break;
        }
        case 'dunk':
          audio.play('dunk');
          shake = Math.min(1, shake + 0.5);
          break;
        case 'rebound': {
          const p = state.players[e.side];
          if (e.offensive) hud.push('OFF. BOARD', '#4aa3ff', p.x, p.z);
          break;
        }
        case 'turnover':
          audio.play('whistle');
          break;
        case 'phase':
          if (e.phase === 'checkball') audio.play('whistle');
          break;
        default:
          break;
      }
    }
  };

  // ------------------------------------------------------------------ render
  const render = (_alpha: number, dt: number) => {
    if (width === 0) resize();
    hud.update(dt);
    netSwing = Math.max(0, netSwing - dt * 2.2);
    shake = Math.max(0, shake - dt * 3.4);

    const local = state.players[localSide];
    const remotePlayer = state.players[remoteSide];
    const handler = state.ball.owner !== null ? state.players[state.ball.owner] : local;
    const spread = Math.hypot(local.x - remotePlayer.x, local.z - remotePlayer.z);
    cam.follow(handler.x, handler.z, spread, dt);
    cam.update(width, height);

    ctx.save();
    if (shake > 0 && settings.cameraShake && !settings.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 9);
    }

    courtRenderer.drawBackdrop(ctx, park, width, height, state.time);
    courtRenderer.drawCourt(ctx, cam, park, courtColor);
    courtRenderer.drawHoop(ctx, cam, park, netSwing);

    // Shadows first so nobody's shadow lands on a body.
    for (const p of state.players) {
      playerRenderer.drawShadow(ctx, cam, p.x, p.z, p.y, 1.05);
    }

    // Depth sort: draw far (small z) before near (large z).
    const drawables: { z: number; draw: () => void }[] = [
      ...state.players.map((p) => ({
        z: p.z,
        draw: () =>
          playerRenderer.draw(ctx, cam, p, state.time, p.side === localSide, state.ball.owner === p.side),
      })),
      { z: state.ball.z, draw: () => playerRenderer.drawBall(ctx, cam, state.ball, state.time) },
    ];
    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) d.draw();

    playerRenderer.drawShotTrail(ctx, cam, state);
    if (state.ball.owner === localSide && state.ball.state === 'held') {
      playerRenderer.drawRangeMarker(ctx, cam, local, isBeyondArc(local.x, local.z));
    }

    hud.drawWorldPopups(ctx, cam);
    hud.drawShotMeter(ctx, cam, state, localSide, settings.shotMeterStyle, width, height);
    ctx.restore();

    hud.drawScoreBug(ctx, state, width, localSide, store.player.rank.points);
    hud.drawCallouts(ctx, state, localSide, width, height);
    drawFooter(ctx, width, height, loop.fps, opts.net?.latencyMs() ?? null, settings.touchControls);

    // Dribble sound cadence.
    dribbleTimer -= dt;
    if (dribbleTimer <= 0 && state.ball.state === 'held' && state.phase === 'live') {
      const p = state.ball.owner !== null ? state.players[state.ball.owner] : null;
      if (p && p.state === 'dribble') {
        audio.play('dribble', 0.9 + Math.random() * 0.25);
        dribbleTimer = 0.34;
      } else {
        dribbleTimer = 0.16;
      }
    }
  };

  const loop = new GameLoop(step, render, SIM_DT);
  loop.fpsCap = settings.fpsCap;
  loop.start();

  return root;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fps: number,
  latency: number | null,
  touch: boolean,
): void {
  ctx.save();
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(150,162,184,0.6)';
  const bits = [`${Math.round(fps)} FPS`];
  if (latency !== null) bits.push(`${Math.round(latency)} ms`);
  ctx.fillText(bits.join('  ·  '), w - 14, h - 12);

  if (!touch) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,162,184,0.42)';
    ctx.fillText('SPACE shoot / contest · E drive · F steal · J L crossover · K stepback · ESC pause', 16, h - 12);
  }
  ctx.restore();
}

function courtColorFor(courtId: string): string | null {
  const map: Record<string, string> = {
    'court-standard': '',
    'court-hardwood': '#c08c4a',
    'court-neon': '#101018',
    'court-sand': '#e0c48a',
    'court-marble': '#e8e4dc',
  };
  const c = map[courtId];
  return c ? c : null;
}
