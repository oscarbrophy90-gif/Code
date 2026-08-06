import {
  AiController,
  GRADE_COLOR,
  GRADE_LABEL,
  PARK_BY_ID,
  SIM_DT,
  COURT,
  createMatch,
  defaultMatchConfig,
  drainEvents,
  emptyInput,
  forcePossession,
  isBeyondArc,
  stepMatch,
  type Difficulty,
  type DrillDef,
  type MatchConfig,
  type MatchState,
  type PlayerInput,
  type PlayerMatchStats,
  type SimEvent,
  type SimPlayerConfig,
  type Side,
  STORE_BY_ID,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { GameLoop } from '../engine/loop.ts';
import { InputManager } from '../engine/input.ts';
import { audio } from '../engine/audio.ts';
import { CourtRenderer } from '../render/court.ts';
import { PlayerRenderer } from '../render/players.ts';
import { Hud } from '../render/hud.ts';
import { store } from '../state/store.ts';
import { el, clear, toast } from './dom.ts';
import { buildTouchControls } from './touch.ts';
import { playDunkScene } from './dunkscene.ts';

export interface MatchResult {
  won: boolean;
  score: [number, number];
  stats: PlayerMatchStats;
  opponentStats: PlayerMatchStats;
  durationSeconds: number;
  greenRate: number;
  quit: boolean;
  simBadges: SimPlayerConfig['badges'];
  /** reps landed, when this was a training drill */
  drillReps: number;
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
  /** when set, the screen runs a timed training drill instead of a game */
  drill?: DrillDef | null;
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

  // Shooting and finishing drills have nobody guarding you, so the bot is
  // parked out of the way and never given a controller.
  const drill = opts.drill ?? null;
  const parkedBot = !!drill && (drill.mode === 'shooting' || drill.mode === 'finishing');
  const ai = opts.net || parkedBot ? null : new AiController(remoteSide, opts.difficulty, seed ^ 0x5bf03, true, false);
  const park = PARK_BY_ID[opts.parkId] ?? PARK_BY_ID['downtown'];

  const cam = new Camera();
  const courtRenderer = new CourtRenderer();
  const playerRenderer = new PlayerRenderer();
  const hud = new Hud();
  hud.touch = settings.touchControls;
  const input = new InputManager();
  input.attach();
  audio.masterVolume = settings.masterVolume;
  audio.sfxVolume = settings.sfxVolume;
  audio.unlock();

  let paused = false;
  let finished = false;
  /** true while a dunk cutaway owns the screen */
  let cutscene = false;
  let netSwing = 0;
  let shake = 0;
  let dribbleTimer = 0;
  let elapsedRealSeconds = 0;
  let localAttempts = 0;
  let localGreens = 0;
  let drillReps = 0;
  let drillTimeLeft = drill ? drill.durationSeconds : 0;
  let drillRunning = false;
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

  // ------------------------------------------------------------- drill banner
  let drillBanner: HTMLElement | null = null;
  let drillClock: HTMLElement | null = null;
  let drillCount: HTMLElement | null = null;
  if (drill) {
    drillClock = el('b', { class: 'drill-clock' }, '0:00');
    drillCount = el('b', { class: 'drill-count' }, '0');
    drillBanner = el(
      'div',
      { class: 'drill-bar', style: `--tint:${drill.color}` },
      el('div', { class: 'drill-title' }, drill.name),
      el('div', { class: 'drill-goal' }, drill.goal),
      el(
        'div',
        { class: 'drill-meters' },
        el('span', {}, drillClock, el('em', {}, drill.freeplay ? 'in the gym' : 'left')),
        drill.freeplay ? null : el('span', {}, drillCount, el('em', {}, `reps · gold at ${drill.tiers[2]}`)),
      ),
    );
    root.appendChild(drillBanner);
  }

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
      drillReps,
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
          el(
            'p',
            { class: 'dim', style: 'margin:0 0 20px' },
            drill
              ? drill.freeplay
                ? `${drill.name} · shoot as long as you like`
                : `${drill.name} · ${drillReps} reps with ${Math.ceil(drillTimeLeft)}s left`
              : `${state.score[0]} – ${state.score[1]} · first to ${matchConfig.targetScore}`,
          ),
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
            el('button', { class: 'btn danger block', onclick: () => closeAndFinish(true) }, drill ? 'End drill' : 'Forfeit match'),
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
    root.appendChild(buildTouchControls(input.touch, () => togglePause(!paused)));
  }

  // ------------------------------------------------------------------ emotes
  /** Plays the emote in one of the six slots the Locker equipped. */
  const fireEmote = (slot: number) => {
    const id = store.player.loadout.emoteSlots?.[slot] ?? null;
    if (!id) {
      toast(`Emote slot ${slot + 1} is empty — equip one in the Locker`, 'info');
      return;
    }
    const item = STORE_BY_ID[id];
    if (!item) return;
    const me = state.players[localSide];
    hud.showEmote(item.name, item.colors[0], me.x, me.z);
    audio.play('ui', 1.1);
  };

  // -------------------------------------------------------------------- step
  const step = (dt: number) => {
    // Consumed before the guard below, so a digit pressed while the game is
    // paused or a cutaway is up is dropped rather than firing on the way back.
    const emoteSlot = input.takeEmote();
    if (emoteSlot !== null && !paused && !finished && !cutscene && state.phase !== 'over') {
      fireEmote(emoteSlot);
    }
    if (paused || finished || cutscene) return;
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
    if (drill) updateDrill(dt);
  };

  /**
   * Drills borrow the match sim but not its rules: the clock is the drill's
   * own, and the ball is put back where the drill needs it every time it
   * changes hands.
   */
  const updateDrill = (dt: number) => {
    if (!drill || finished) return;

    if (parkedBot) {
      // Stand the bot in the far corner so nothing contests and nothing
      // wanders into a rebound.
      const bot = state.players[remoteSide];
      bot.x = -(COURT.halfWidth - 3);
      bot.z = COURT.playDepth - 2;
      bot.vx = 0;
      bot.vz = 0;
      bot.y = 0;
      bot.vy = 0;
    } else if (state.possession === localSide) {
      // Defensive drills: you never get to keep the ball, they attack again.
      forcePossession(state, remoteSide);
    }

    if (!drillRunning && state.phase === 'live') drillRunning = true;
    if (!drillRunning) return;
    drillTimeLeft -= dt;
    if (drillTimeLeft <= 0) {
      drillTimeLeft = 0;
      audio.play('buzzer');
      closeAndFinish(false);
    }
  };

  const countDrillEvent = (e: SimEvent): void => {
    if (!drill || !drillRunning) return;
    switch (drill.mode) {
      case 'shooting':
        // Threes only, and a green counts double.
        if (e.type === 'shotRelease' && e.side === localSide && e.made && e.value === 2) {
          drillReps += e.grade === 'green' ? 2 : 1;
        }
        break;
      case 'finishing':
        // Anything finished inside the arc; dunks and greens count double.
        if (e.type === 'shotRelease' && e.side === localSide && e.made && e.value === 1) {
          const slam = e.shotType === 'dunk' || e.shotType === 'contactDunk';
          drillReps += slam || e.grade === 'green' ? 2 : 1;
        }
        break;
      case 'takeaway':
        if ((e.type === 'block' || e.type === 'steal') && e.side === localSide) drillReps++;
        break;
      case 'stops':
        if (e.type === 'miss' && e.side === remoteSide) drillReps++;
        else if (e.type === 'turnover' && e.side === remoteSide) drillReps++;
        else if ((e.type === 'block' || e.type === 'steal') && e.side === localSide) drillReps++;
        break;
      default:
        break;
    }
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
      countDrillEvent(e);
      switch (e.type) {
        case 'shotRelease': {
          const p = state.players[e.side];
          if (e.side === localSide) {
            localAttempts++;
            if (e.grade === 'green') localGreens++;
            hud.flashGrade(e.grade);
            // Scouting report: the CPU learns what kind of shots you take.
            const wasDrive = e.shotType === 'layup' || e.shotType === 'dunk' || e.shotType === 'contactDunk' || e.shotType === 'euroLayup';
            ai?.notifyOpponentShot(e.grade === 'green', e.value === 2, wasDrive);
          }
          hud.push(GRADE_LABEL[e.grade], GRADE_COLOR[e.grade], p.x, p.z, e.grade === 'green');
          if (e.grade === 'green') audio.play('green');
          break;
        }
        case 'foul': {
          const p = state.players[e.on];
          audio.play('whistle');
          hud.push(e.shots === 2 ? 'FOUL — 2 SHOTS' : 'FOUL — 1 SHOT', '#ffc53d', p.x, p.z, true);
          break;
        }
        case 'freeThrow': {
          const p = state.players[e.side];
          if (!e.made) hud.push('MISS', '#ff4d5e', p.x, p.z);
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
        case 'dunkHighlight': {
          // Cut away to the animation. The world is frozen while it plays so
          // nothing happens off screen, and it is always skippable.
          if (e.side === localSide && !settings.reducedMotion) {
            audio.play('dunk');
            cutscene = true;
            void playDunkScene(root, {
              dunker: configs[e.side],
              victim: configs[e.side === 0 ? 1 : 0],
              packageId: e.packageId,
              posterized: e.posterized,
              value: e.value,
            }).then(() => {
              cutscene = false;
            });
          }
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

    if (drill) {
      if (drillClock) drillClock.textContent = formatClock(drill.freeplay ? drill.durationSeconds - drillTimeLeft : drillTimeLeft);
      if (drillCount) drillCount.textContent = String(drillReps);
    } else {
      hud.drawScoreBug(ctx, state, width, localSide);
    }
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

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
    ctx.fillText('SPACE shoot / contest · E drive · F steal · J L crossover · HOLD K stepback jumper · ESC pause', 16, h - 12);
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
