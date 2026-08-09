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
  ballThroughRim,
  dribbleBounceIndex,
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

export interface MatchOptions {
  opponent: SimPlayerConfig;
  difficulty: Difficulty;
  parkId: string;
  config?: Partial<MatchConfig>;
  localSide?: Side;
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
  const ai = parkedBot ? null : new AiController(remoteSide, opts.difficulty, seed ^ 0x5bf03, true, false);
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
  /** last bounce index heard per side, so each bounce plays exactly once */
  let lastBounce: [number | null, number | null] = [null, null];
  /** a made shot is in the air and its net has not sounded yet */
  let swishPending = false;
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
    paused = value;
    renderPause();
  };
  input.onPause = () => togglePause(!paused);

  // ----------------------------------------------------------- touch controls
  if (settings.touchControls) {
    root.appendChild(buildTouchControls(input.touch, () => togglePause(!paused)));
  }

  // -------------------------------------------------------------------- step
  const step = (dt: number) => {
    if (paused || finished || cutscene) return;
    elapsedRealSeconds += dt;

    const localInput = input.sample();
    // The simulation owns the cooldown and the ball, but it has no idea which
    // emote sits on which key — so equipment is checked here, and an emote that
    // cannot fire says why instead of silently doing nothing.
    if (localInput.emote !== null) {
      const me = state.players[localSide];
      if (!store.player.loadout.emoteSlots?.[localInput.emote]) {
        toast(`Emote slot ${localInput.emote + 1} is empty — equip one in the Locker`, 'info');
        localInput.emote = null;
      } else if (me.emoteCooldown > 0) {
        toast(`Emote cooling down — ${Math.ceil(me.emoteCooldown)}s`, 'info');
        localInput.emote = null;
      } else if (state.phase !== 'live' || state.ball.owner !== localSide) {
        toast('You can only emote with the ball, in play', 'info');
        localInput.emote = null;
      }
    }
    const remote: PlayerInput = ai ? ai.update(state, dt) : emptyInput();

    const inputs: [PlayerInput, PlayerInput] =
      localSide === 0 ? [localInput, remote] : [remote, localInput];

    stepWorld(inputs, dt);
    if (drill) updateDrill(dt);
    playDribbleBounce();
    playNetSwish();
  };

  /**
   * The net, fired on the exact frame the ball drops through the ring.
   *
   * It used to hang off the `score` event, which is the wrong moment twice over:
   * scoring happens when the flight *ends*, a foot below the rim, so the sound
   * always trailed the picture. `ballThroughRim` flips true on the frame the ball
   * crosses the ring itself — measured one to two sim frames ahead of the score,
   * with the ball between 9.84 and 10.00 feet. That is the frame you see it go in.
   *
   * `score` stays as the fallback for the two cases that have no flight to watch:
   * free throws, which resolve straight off the meter, and the occasional make
   * whose crossing and landing fall on the same frame.
   */
  const playNetSwish = () => {
    if (!swishPending || !ballThroughRim(state)) return;
    swishPending = false;
    netSwing = 1;
    audio.swish();
  };

  /**
   * The dribble sound, fired on the exact frame the ball reaches the floor.
   *
   * It used to run off a fixed 0.34s timer in the render loop, which had no
   * relationship at all to the ball on screen — the ball bounces at a rate set
   * by the handler's Speed With Ball, so the sound and the picture drifted apart
   * immediately and never lined back up.
   *
   * The ball's height is |sin(time × tempo)|, so it is on the floor every time
   * that sine crosses zero. Counting those crossings gives an index that ticks
   * over on one specific simulation frame, and the sample is played then. This
   * runs inside step rather than render, so it is on the 120 Hz fixed timestep
   * and cannot be early or late by a variable frame.
   */
  const playDribbleBounce = () => {
    if (state.phase !== 'live') {
      lastBounce = [null, null];
      return;
    }
    for (const side of [0, 1] as Side[]) {
      const index = dribbleBounceIndex(state, side);
      if (index === null) {
        lastBounce[side] = null;
        continue;
      }
      if (lastBounce[side] === index) continue;
      const first = lastBounce[side] === null;
      lastBounce[side] = index;
      // Do not fire on the first frame of a possession: the count is picked up
      // mid-bounce, so that one would land wherever the ball happens to be.
      if (first) continue;
      const me = state.players[localSide];
      const them = state.players[side];
      const distance = side === localSide ? 0 : Math.hypot(me.x - them.x, me.z - them.z);
      // A touch of pitch drift keyed to the bounce number rather than random, so
      // it is the same match every time it is replayed.
      audio.dribble(distance, 0.95 + ((index * 37) % 11) / 100);
    }
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
          // Arm the net for this shot. A miss or a block disarms it again.
          swishPending = e.made;
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
          // Normally the net has already sounded, on the frame the ball crossed
          // the ring. This catches the shots that never had a flight to watch.
          if (swishPending) {
            swishPending = false;
            netSwing = 1;
            audio.swish();
          }
          hud.push(`+${e.value}`, '#3ef07a', p.x, p.z, true);
          break;
        }
        case 'miss':
          swishPending = false;
          audio.play('rim');
          netSwing = 0.35;
          break;
        case 'block': {
          const p = state.players[e.side];
          swishPending = false;
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
        case 'emote': {
          // The simulation decides an emote actually happened — it owns the
          // cooldown and the ball bounce — so the caption hangs off the event
          // rather than off the keypress that asked for it.
          const p = state.players[e.side];
          const id = e.side === localSide ? (store.player.loadout.emoteSlots?.[e.slot] ?? null) : null;
          const item = id ? STORE_BY_ID[id] : undefined;
          hud.showEmote(item?.name ?? 'Emote', item?.colors[0] ?? '#8a93a6', p.x, p.z);
          audio.play('ui', 1.1);
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
    drawFooter(ctx, width, height, loop.fps, null, settings.touchControls);

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
