import {
  AiController,
  SquadController,
  createTeamMatch,
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
  JUMPSHOT_BY_ID,
  type ShotProfile,
  ballThroughRim,
  dribbleBounceIndex,
  type CourtSurface,
} from '@hoops/shared';

import { Camera } from '../engine/camera.ts';
import { GameLoop } from '../engine/loop.ts';
import { InputManager } from '../engine/input.ts';
import { audio } from '../engine/audio.ts';
import { CourtRenderer } from '../render/court.ts';
import { PlayerRenderer } from '../render/players.ts';
import { Hud, roundRect } from '../render/hud.ts';
import { store } from '../state/store.ts';
import { el, clear, toast } from './dom.ts';
import { buildTouchControls } from './touch.ts';
import { playLiveReplay, snapshotFrame, type ReplayFrame } from './livereplay.ts';
import {
  onCheckGo,
  onGuestInput,
  onMatchEnded,
  onReadyCount,
  onScore,
  onSnapshot,
  sendInput,
  sendNewCheck,
  sendReady,
  sendScore,
  sendSnapshot,
  sendForfeit,
  onMatchResult,
  netTrace,
  type NetSnapshot,
} from '../net/multiplayer.ts';

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
  /**
   * 3v3: the other two CPU opponents beside `opponent`, and your two AI
   * teammates. Absent (or null) for every 1v1 game — and 1v1 runs exactly
   * the code it always ran.
   */
  squads?: { opponents: SimPlayerConfig[]; teammates: SimPlayerConfig[] } | null;
  difficulty: Difficulty;
  parkId: string;
  config?: Partial<MatchConfig>;
  localSide?: Side;
  seed?: number;
  /** when set, the screen runs a timed training drill instead of a game */
  drill?: DrillDef | null;
  /** extra sharpening on top of the difficulty preset, 0 to 1 */
  aiEdge?: number;
  /**
   * A real 1v1 against another person.
   *
   * Present ONLY for Online mode. When set no CPU controller is created at all;
   * the host client runs the simulation for both people and publishes it, and
   * the guest sends its input and draws what comes back. Absent everywhere
   * else, so single-player, the difficulty ladder, ranked, 3v3 and the practice
   * gym all run precisely the code they always ran.
   */
  online?: { role: 'host' | 'guest'; mode: 'casual' | 'ranked' } | null;
  /** the court drawn for this game; falls back to the park's own palette */
  surface?: CourtSurface | null;
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
  const squads = opts.squads ?? null;

  const matchConfig = defaultMatchConfig({ parkId: opts.parkId, ...opts.config });
  const seed = opts.seed ?? (Math.random() * 0xffffffff) >>> 0;

  // 3v3 always seats the human at pid 0 on team 0; 1v1 keeps the historical
  // side choice. Either way `configs` is indexed by pid.
  const state = squads
    ? createTeamMatch([localCfg, ...squads.teammates], [opts.opponent, ...squads.opponents], matchConfig, seed)
    : createMatch(
        localSide === 0 ? localCfg : opts.opponent,
        localSide === 0 ? opts.opponent : localCfg,
        matchConfig,
        seed,
      );
  const configs: SimPlayerConfig[] = state.players.map((p) => p.cfg);
  const localPid = squads ? 0 : localSide;

  // Shooting and finishing drills have nobody guarding you, so the bot is
  // parked out of the way and never given a controller.
  const drill = opts.drill ?? null;
  const online = opts.online ?? null;
  const parkedBot = !!drill && (drill.mode === 'shooting' || drill.mode === 'finishing');
  // Online is the one mode with no CPU at all: the other side of the court is
  // a person. Every other mode builds its controller exactly as before.
  const ai = parkedBot || squads || online
    ? null
    : new AiController(remoteSide, opts.difficulty, seed ^ 0x5bf03, true, false, opts.aiEdge ?? 0);
  // Team AI: one controller per side's CPU players. Your teammates play at the
  // same difficulty you chose, so the whole floor sharpens together.
  const oppSquad = squads ? new SquadController(1, state.teams[1], opts.difficulty, seed ^ 0x77a1) : null;
  const mateSquad = squads ? new SquadController(0, state.teams[0].filter((pid) => pid !== localPid), opts.difficulty, seed ^ 0x18d3) : null;
  const park = PARK_BY_ID[opts.parkId] ?? PARK_BY_ID['downtown'];

  const cam = new Camera();
  const replayBuffer: ReplayFrame[] = [];
  // Seconds since the last slam hit the iron; drives the rim's spring-back.
  // Starts large-but-finite, never Infinity: Math.cos(Infinity) is NaN, and
  // one NaN in the bend made every rim point project to NaN — which is a rim
  // that silently never draws until the first dunk of the game.
  let slamAge = 1e6;
  let slamPower = 0;

  // Test rig, only alive when the page was opened with ?dunkdebug: parks the
  // local player on a runway to the rim with the ball so an automated browser
  // can practise dunks without playing the whole game first. It writes plain
  // sim state, the same fields the game itself resets between possessions.
  if (new URLSearchParams(window.location.search).has('dunkdebug')) {
    (window as unknown as { __dunkDebug?: unknown }).__dunkDebug = {
      /** the last shot the local side released, so a test can aim its timing */
      lastRelease: null as { grade: string; shotType: string; made: boolean } | null,
      runway() {
        const p = state.players[localPid];
        p.x = 1;
        p.z = 16;
        p.state = 'dribble';
        p.stamina = 1;
        state.ball.owner = localPid;
        state.ball.state = 'held';
        state.needsClear = false;
        state.shotClock = 14;
        state.phase = 'live';
        state.check = null;
      },
      /** live read of the ball and both men, for asserting on what the sim did */
      peek() {
        const ball = state.ball;
        return {
          time: state.time,
          phase: state.phase,
          // Online only: which end of the wire this is and the server's count.
          net: netRole ? { role: netRole, ready: readyCount, total: readyTotal } : null,
          shotClock: state.shotClock,
          score: [state.score[0], state.score[1]],
          ball: { state: ball.state, owner: ball.owner, x: ball.x, y: ball.y, z: ball.z, settled: ball.settled },
          players: state.players.map((p) => ({
            state: p.state,
            x: p.x,
            y: p.y,
            z: p.z,
            reboundLock: p.reboundLock,
            speed: Math.hypot(p.vx, p.vz),
            // How hard this player's legs are actually swinging, straight off
            // the renderer — the thing that was churning for standing players.
            stride: playerRenderer.strideOf(p.pid),
          })),
        };
      },
    };
  }
  // --------------------------------------------------------------- online 1v1
  // Everything from here to `netReleases` is reached ONLY by Online. Single
  // player, the difficulty ladder, ranked, 3v3 and the practice gym all leave
  // `online` null, so none of it runs and the CPU game is the game it was.
  //
  // The split: the server owns the match — pairing, the check count, the score
  // and disconnects — and the host client owns the basketball, running the very
  // same `stepMatch` every offline mode runs.
  //
  // The guest simulates nothing at all — not the ball, not possession, not a
  // shot, not a rebound. There is one basketball game and it runs on the host.
  // A guest running its own physics collects its own rebound a fraction of a
  // second before or after the host does, and from that moment the two people
  // are playing different matches with different scores. So the guest sends its
  // input, and draws the match the host sends back: both players, the ball,
  // possession, the phase and the score, complete, thirty times a second.
  const netRole = online?.role ?? null;

  /** Server-authoritative check count, drawn as 0/2 → 2/2. */
  let readyCount = 0;
  let readyTotal = 2;
  /** SPACE checked in; the button stays dead until it is let go. */
  let shootLock = false;
  let prevShoot = false;
  /** Host: the server reached 2/2, so the ball gets checked in. */
  let checkGoPending = false;
  /** Host: this check has already been announced to the server. */
  let checkAnnounced = false;
  /** Host: the guest's latest input. Edge presses are consumed exactly once. */
  let guestInput: PlayerInput = emptyInput();
  /** Host: seconds since a guest input arrived, so a stale one is not held. */
  let sinceGuestInput = 0;
  /** Host: seconds since the last snapshot went out. */
  let netAccum = 0;
  /** Host: the score the server was last told about. */
  let lastNetScore: [number, number] = [0, 0];
  /** Guest: the world as the host last drew it. */
  let netTarget: NetSnapshot | null = null;
  let pendingInput: PlayerInput | null = null;
  /** Guest: the host's own input, so their player keeps moving between frames. */
  let hostInput: PlayerInput = emptyInput();
  /** Guest: seconds since the last snapshot, so a stalled host is visible. */
  let sinceSnapshot = 0;
  let stallReported = false;
  /** The server has settled this match; there is nothing left to wait for. */
  let matchSettled = false;
  /** Guest: the input being held right now, for the lead below. */
  let guestHeld: PlayerInput = emptyInput();
  /**
   * Guest: how far ahead of the host's picture this player is drawn, in feet.
   *
   * The host's answer about where you are is always one round trip old, so
   * without this your own body sets off a beat after you press the key. This
   * is a bounded, decaying lead along the direction you are ASKING for — a
   * foot, less than half a stride. It is a rendering lead and nothing more:
   * the ball, possession, contests, shots and the score are all decided by the
   * host from the authoritative position, never from this.
   */
  let leadX = 0;
  let leadZ = 0;
  /** Where the host last said the local player was, to pay the lead off. */
  let leadAuthX = 0;
  let leadAuthZ = 0;
  const LEAD_CAP = 1;
  /** Host: the input that went into the frame being published. */
  let lastHostInput: PlayerInput = emptyInput();

  const netReleases: (() => void)[] = [];
  if (netRole) {
    netTrace(
      'role',
      () =>
        `you are the ${netRole} — Player ${localPid + 1} (${localCfg.name}); ` +
        `${netRole === 'host' ? 'this client simulates the match' : 'the host simulates; this client sends input and draws what comes back'}`,
      true,
    );
    netReleases.push(
      onReadyCount((r) => {
        readyCount = r.count;
        readyTotal = r.total;
      }),
      onCheckGo(() => {
        checkGoPending = true;
      }),
      onMatchEnded(() => {
        if (finished) return;
        toast('Your opponent left — back to matchmaking', 'info');
        closeAndFinish(true);
      }),
      // The server has decided the match. That is the end of it, for both
      // people, whatever either simulation currently thinks.
      //
      // This used to be left to the host's snapshot carrying `phase: 'over'`.
      // It never arrived: the winning score settles the match on the server,
      // which tears the room down, and the snapshot behind it — rate limited to
      // 30 Hz — was then relayed to nobody. The guest sat on an empty court
      // forever, never saw the result, and never got its ladder back. Ending on
      // the result instead makes the finish independent of packet timing.
      onMatchResult(() => {
        if (finished) return;
        // Settled: the host has nothing left to send, so a "waiting for the
        // other player" notice from here on is telling the truth about a fact
        // that no longer matters, and reads like something went wrong.
        matchSettled = true;
        netTrace('result', () => 'the server settled the match — closing out', true);
        // A beat, so the basket that won it and the final score are seen. The
        // simulation may also have scheduled this; `closeAndFinish` runs once.
        window.setTimeout(() => closeAndFinish(false), 1800);
      }),
    );
  }
  if (netRole === 'host') {
    netReleases.push(
      onGuestInput((i) => {
        sinceGuestInput = 0;
        // Held buttons take the newest value; edge presses stick until the
        // simulation has consumed them, so a tap between two sim frames is
        // never swallowed and never fires twice.
        guestInput = {
          ...guestInput,
          mx: i.mx,
          mz: i.mz,
          sprint: i.sprint,
          shoot: i.shoot,
          moveShoot: i.moveShoot,
          drive: i.drive,
          contest: i.contest,
          moveDirX: i.moveDirX,
          moveDirZ: i.moveDirZ,
          move: i.move ?? guestInput.move,
          steal: guestInput.steal || i.steal,
          fake: guestInput.fake || i.fake,
          pass: guestInput.pass || i.pass,
          emote: i.emote ?? guestInput.emote,
        };
      }),
    );
  }
  if (netRole === 'guest') {
    netReleases.push(
      onSnapshot((snap) => applySnapshot(snap)),
      onScore((s2) => {
        state.score[0] = s2.score[0];
        state.score[1] = s2.score[1];
      }),
    );
  }

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
  /** last bounce index heard per player, so each bounce plays exactly once */
  let lastBounce: (number | null)[] = state.players.map(() => null);
  /** a made shot is in the air and its net has not sounded yet */
  let swishPending = false;
  let elapsedRealSeconds = 0;
  let localAttempts = 0;
  let localGreens = 0;
  let drillReps = 0;
  let drillTimeLeft = drill ? drill.durationSeconds : 0;
  let drillRunning = false;
  // The drawn court wins over an equipped one: the draw is the whole point of
  // the reel, and a cosmetic that quietly overrode it would make the animation
  // a lie.
  const surface = opts.surface ?? null;
  const courtColor = surface ? surface.floor : courtColorFor(store.player.loadout.courtId);
  // 3v3 scorebug names the squads after who leads them.
  const teamLabels: [string, string] = [`${localCfg.name} ×3`, `${opts.opponent.name} ×3`];

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
    // Walking out of an online game is a forfeit, and the server treats it as
    // one: in Ranked that is a loss for you and a win for them, and in Casual
    // it is nothing at all. Told once, on the way out, and only when YOU are
    // the one leaving — a match that ended on the scoreline has already been
    // settled by the server off the score it was keeping.
    if (quit && netRole) {
      netTrace('result', () => 'forfeiting the match', true);
      sendForfeit();
    }
    loop.stop();
    input.detach();
    for (const release of netReleases) release();
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    const winner = state.winner;
    const localTeam = state.players[localPid].side;
    const oppTeam = localTeam === 0 ? 1 : 0;
    // Your line is yours alone; the opposing line is the whole opposing team,
    // summed — the number the scoreboard was actually up against.
    const oppStats = state.teams[oppTeam]
      .map((pid) => state.stats[pid])
      .reduce((acc, s2) => {
        const out = { ...acc };
        for (const k of Object.keys(out) as (keyof PlayerMatchStats)[]) out[k] += s2[k];
        return out;
      });
    opts.onFinish({
      won: winner === localTeam,
      score: [state.score[localTeam], state.score[oppTeam]],
      stats: state.stats[localPid],
      opponentStats: oppStats,
      durationSeconds: elapsedRealSeconds,
      greenRate: localAttempts > 0 ? localGreens / localAttempts : 0,
      quit,
      simBadges: state.players[localPid].cfg.badges,
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
    if (finished) return;
    // Offline, pausing or a dunk replay stops the world, which is exactly what
    // you want when the world is yours alone. Online it is not: one player
    // opening the pause menu, or watching their own replay, used to stop the
    // simulation AND the snapshots — so the other person sat there watching a
    // frozen court with a controller that did nothing. An online match keeps
    // running; the pause menu simply stops feeding YOUR input into it.
    if (!netRole && (paused || cutscene)) return;
    elapsedRealSeconds += dt;

    const localInput = paused && netRole ? emptyInput() : input.sample();
    // The simulation owns the cooldown and the ball, but it has no idea which
    // emote sits on which key — so equipment is checked here, and an emote that
    // cannot fire says why instead of silently doing nothing.
    if (localInput.emote !== null) {
      const me = state.players[localPid];
      if (!store.player.loadout.emoteSlots?.[localInput.emote]) {
        toast(`Emote slot ${localInput.emote + 1} is empty — equip one in the Locker`, 'info');
        localInput.emote = null;
      } else if (me.emoteCooldown > 0) {
        toast(`Emote cooling down — ${Math.ceil(me.emoteCooldown)}s`, 'info');
        localInput.emote = null;
      } else if (state.phase !== 'live' || state.ball.owner !== localPid) {
        toast('You can only emote with the ball, in play', 'info');
        localInput.emote = null;
      }
    }

    // Online: SPACE is the check-in and the SERVER counts it, so both screens
    // agree on 0/2 → 2/2. The button stays dead until the ball is live, which
    // is the same protection `checkGuard` gives the offline game: a space still
    // held from the check can never fire a shot the instant play starts.
    if (netRole) {
      const checking = state.phase === 'checkball';
      const pressed = localInput.shoot && !prevShoot;
      prevShoot = localInput.shoot;
      if (checking && pressed && !shootLock) {
        sendReady();
        shootLock = true;
      }
      if (shootLock && !localInput.shoot) shootLock = false;
      if (checking || shootLock) localInput.shoot = false;
    }

    if (netRole === 'guest') {
      // Every simulated frame, not every other one. Input is a handful of small
      // numbers and the guest has nothing else to say; batching it only put a
      // few more milliseconds between pressing a key and the host hearing about
      // it, which on a client that predicts nothing is felt directly.
      queueInput(localInput);
      if (pendingInput) sendInput(pendingInput);
      pendingInput = null;
      guestHeld = localInput;
      netTrace(
        'local-input',
        () =>
          `local input — move (${localInput.mx.toFixed(2)}, ${localInput.mz.toFixed(2)}) ` +
          `sprint ${localInput.sprint} shoot ${localInput.shoot} drive ${localInput.drive}`,
      );
      guestStep(dt);
      playDribbleBounce();
      return;
    }

    const inputs: PlayerInput[] = state.players.map(() => emptyInput());
    inputs[localPid] = localInput;
    if (ai) inputs[remoteSide] = ai.update(state, dt);
    if (oppSquad) for (const [pid, inp] of oppSquad.update(state, dt)) inputs[pid] = inp;
    if (mateSquad) for (const [pid, inp] of mateSquad.update(state, dt)) inputs[pid] = inp;

    // Online host: the other player on the floor is the other person, driven by
    // their keyboard down the wire. Their input reaches only their own pid, and
    // yours reaches only yours.
    if (netRole === 'host') {
      // A held key that stops arriving is not a held key. Without this a guest
      // who tabs out, hiccups or drops leaves their player sprinting into the
      // corner on the host's screen, holding a direction nobody is pressing.
      sinceGuestInput += dt;
      if (sinceGuestInput > 0.5) guestInput = emptyInput();
      inputs[remoteSide] = guestInput;
      guestInput = { ...guestInput, move: null, steal: false, fake: false, pass: false, emote: null };
      // Published with the snapshot: the guest carries the host's player on
      // this course until the next one arrives, instead of standing still and
      // then jumping.
      lastHostInput = inputs[localPid];
      netTrace(
        'local-input',
        () =>
          `local input — move (${localInput.mx.toFixed(2)}, ${localInput.mz.toFixed(2)}) ` +
          `sprint ${localInput.sprint} shoot ${localInput.shoot} drive ${localInput.drive}`,
      );
      // 2/2. Pressing the check for the offence here runs the game's own
      // check-ball ceremony — ball out, ball back, then play — rather than a
      // second copy of it written for online.
      if (checkGoPending && state.check && state.check.stage === 'wait' && state.phaseTimer <= 0) {
        inputs[state.check.from] = { ...inputs[state.check.from], shoot: true };
        checkGoPending = false;
      }
    }

    stepWorld(inputs, dt);

    if (netRole === 'host') hostPublish(dt);

    if (drill) updateDrill(dt);
    playDribbleBounce();
    playNetSwish();
  };

  // ------------------------------------------------------------ host → guest

  /**
   * What the host tells the server and the guest, once per simulated frame.
   *
   * The two authoritative facts — a new check has begun, and the score changed
   * — go to the server the moment they happen. The world itself goes out at
   * 30 Hz, which the guest smooths back up to its own frame rate.
   */
  let tracedPhase: string = state.phase;
  let tracedBall: string = state.ball.state;
  const hostPublish = (dt: number) => {
    if (state.phase !== tracedPhase) {
      netTrace('phase', () => `match phase ${tracedPhase} -> ${state.phase}`, true);
      tracedPhase = state.phase;
    }
    if (state.ball.state !== tracedBall) {
      netTrace(
        'ball',
        () => `ball ${tracedBall} -> ${state.ball.state} (owner ${state.ball.owner}, settled ${state.ball.settled})`,
        true,
      );
      tracedBall = state.ball.state;
    }
    if (state.phase === 'checkball') {
      if (!checkAnnounced) {
        checkAnnounced = true;
        // Tip-off, or the restart after a bucket: the server puts both players
        // back to 0/2 and waits for two presses.
        sendNewCheck();
      }
    } else {
      checkAnnounced = false;
    }

    if (state.score[0] !== lastNetScore[0] || state.score[1] !== lastNetScore[1]) {
      lastNetScore = [state.score[0], state.score[1]];
      sendScore(lastNetScore);
    }

    netAccum += dt;
    if (netAccum < 1 / 30) return;
    netAccum = 0;
    sendSnapshot(takeSnapshot());
  };

  /**
   * The whole match, as the host has it this frame.
   *
   * Not a summary of it — everything the guest needs to draw the same game,
   * because anything left out is something the two screens can disagree about.
   * The static half (who the players are, their build, their kit, the rules)
   * is set up identically on both clients at tip-off and never travels.
   *
   * Numbers are rounded on the way out: a foot of court measured to eleven
   * decimal places is eleven characters of bandwidth thirty times a second and
   * not one pixel of difference.
   */
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const takeSnapshot = (): NetSnapshot => ({
    frame: state.frame,
    t: r3(state.time),
    rng: state.rngState,
    phase: state.phase,
    phaseTimer: r3(state.phaseTimer),
    shotClock: r2(state.shotClock),
    clock: r2(state.clock),
    score: [state.score[0], state.score[1]],
    possession: state.possession,
    needsClear: state.needsClear,
    winner: state.winner,
    check: state.check
      ? { stage: state.check.stage, timer: r3(state.check.timer), from: state.check.from, to: state.check.to }
      : null,
    freeThrow: state.freeThrow ? { side: state.freeThrow.side, remaining: state.freeThrow.remaining } : null,
    checkGuard: state.checkGuard.slice(),
    passRequest: state.passRequest ? { pid: state.passRequest.pid, timer: r3(state.passRequest.timer) } : null,
    hostInput: lastHostInput,
    players: state.players.map((p) => ({
      x: r3(p.x),
      z: r3(p.z),
      y: r3(p.y),
      vx: r2(p.vx),
      vz: r2(p.vz),
      vy: r2(p.vy),
      facing: r3(p.facing),
      state: p.state,
      stateTimer: r3(p.stateTimer),
      stamina: r3(p.stamina),
      stagger: r3(p.stagger),
      staggerTimer: r3(p.staggerTimer),
      reboundLock: r3(p.reboundLock),
      moveId: p.moveId,
      moveTimer: r3(p.moveTimer),
      moveDuration: r3(p.moveDuration),
      moveDirX: r2(p.moveDirX),
      moveDirZ: r2(p.moveDirZ),
      moveCooldown: r2(p.moveCooldown),
      dribbleHand: p.dribbleHand,
      shotElapsed: r3(p.shotElapsed),
      shotType: p.shotType,
      shotFromX: r2(p.shotFromX),
      shotFromZ: r2(p.shotFromZ),
      shotIsThree: p.shotIsThree,
      shotDrift: r2(p.shotDrift),
      shotOnMoveKey: p.shotOnMoveKey,
      handUp: p.handUp,
      contestTimer: r2(p.contestTimer),
      stealCooldown: r2(p.stealCooldown),
      fakeTimer: r2(p.fakeTimer),
      greenStreak: p.greenStreak,
      makeStreak: p.makeStreak,
      distanceRun: r2(p.distanceRun),
      fumbleChecked: p.fumbleChecked,
      ankledStreak: p.ankledStreak,
      ankledResetIn: r2(p.ankledResetIn),
      outOfBoundsTimer: r2(p.outOfBoundsTimer),
      meter: p.shotProfile
        ? {
            duration: p.shotProfile.meterDuration,
            ideal: p.shotProfile.idealPoint,
            green: p.shotProfile.greenHalfWidth,
            excellent: p.shotProfile.excellentHalfWidth,
            slight: p.shotProfile.slightHalfWidth,
            early: p.shotProfile.earlyHalfWidth,
            contested: p.shotProfile.heavilyContested,
          }
        : null,
      emoteTimer: r3(p.emoteTimer),
      emoteSlot: p.emoteSlot,
      emoteCooldown: r2(p.emoteCooldown),
      celebration: p.celebration,
      celebrationTimer: r3(p.celebrationTimer),
      comboCount: p.comboCount,
      comboTimer: r2(p.comboTimer),
      dunk: p.dunk,
    })),
    ball: {
      x: r3(state.ball.x),
      y: r3(state.ball.y),
      z: r3(state.ball.z),
      vx: r2(state.ball.vx),
      vy: r2(state.ball.vy),
      vz: r2(state.ball.vz),
      state: state.ball.state,
      owner: state.ball.owner,
      shotBy: state.ball.shotBy,
      passTo: state.ball.passTo,
      passFrom: state.ball.passFrom,
      shotWillGoIn: state.ball.shotWillGoIn,
      shotValue: state.ball.shotValue,
      shotGrade: state.ball.shotGrade,
      flightTime: r3(state.ball.flightTime),
      flightDuration: r3(state.ball.flightDuration),
      fromX: r2(state.ball.fromX),
      fromY: r2(state.ball.fromY),
      fromZ: r2(state.ball.fromZ),
      toX: r2(state.ball.toX),
      toY: r2(state.ball.toY),
      toZ: r2(state.ball.toZ),
      apex: r2(state.ball.apex),
      settled: state.ball.settled,
    },
    stats: statsIfChanged(),
  });

  /**
   * The box score, but only when it has moved.
   *
   * Re-sending nineteen counters per player thirty times a second to say
   * "still 0" is a fifth of the payload for nothing. The guest keeps what it
   * has when this is omitted.
   */
  let lastStatsSent = '';
  const statsIfChanged = () => {
    const now = JSON.stringify(state.stats);
    if (now === lastStatsSent) return undefined;
    lastStatsSent = now;
    return state.stats.map((st) => ({ ...st }));
  };

  // ------------------------------------------------------------ guest ← host

  /**
   * One frame of input, merged into whatever has not been sent yet.
   *
   * Held buttons take the latest reading. Edge presses — a dribble move, a
   * strip, a pump fake, an emote — are sticky, so a press that lands between
   * two sends still gets there.
   */
  const queueInput = (i: PlayerInput) => {
    if (!pendingInput) {
      pendingInput = { ...i };
      return;
    }
    const q = pendingInput;
    q.mx = i.mx;
    q.mz = i.mz;
    q.sprint = i.sprint;
    q.shoot = i.shoot;
    q.moveShoot = i.moveShoot;
    q.drive = i.drive;
    q.contest = i.contest;
    q.moveDirX = i.moveDirX;
    q.moveDirZ = i.moveDirZ;
    q.move = i.move ?? q.move;
    q.steal = q.steal || i.steal;
    q.fake = q.fake || i.fake;
    q.pass = q.pass || i.pass;
    q.emote = i.emote ?? q.emote;
  };

  /**
   * One frame on the guest.
   *
   * The guest simulates nothing. Not the ball, not possession, not a shot, not
   * a rebound — there is exactly one basketball game and it runs on the host. A
   * guest running its own physics picks up its own rebound a fraction of a
   * second before or after the host does, and from that moment the two people
   * are playing different matches. So this draws, and only draws.
   *
   * What it does do is fill in the 33 ms between snapshots, so thirty packets a
   * second look like a hundred and twenty frames of basketball.
   */
  const guestStep = (dt: number) => {
    sinceSnapshot += dt;
    if (sinceSnapshot > 1.5 && !stallReported && !matchSettled) {
      stallReported = true;
      netTrace('state', () => `no snapshot for ${sinceSnapshot.toFixed(1)}s — the host has stopped sending`, true);
      toast('Waiting on the other player…', 'info');
    }
    advanceGuest(dt);
  };

  /**
   * A snapshot from the host: the state of the match, applied whole.
   *
   * Everything the simulation decides is taken exactly as sent — the phase, the
   * check, the score, who has the ball, what both players are doing, how far
   * through a shot meter they are, the ball's flight and where it will land.
   * The only thing not set outright is where the bodies and the ball are
   * *drawn*, and that is a rendering decision rather than a disagreement:
   * `advanceGuest` eases toward the host's coordinates so a packet boundary is
   * not a visible jump.
   */
  const applySnapshot = (snap: NetSnapshot) => {
    const before = state.phase;
    const beforeBall = state.ball.state;
    const beforeOwner = state.ball.owner;
    netTarget = snap;
    sinceSnapshot = 0;
    stallReported = false;
    hostInput = snap.hostInput ?? emptyInput();

    state.frame = snap.frame;
    state.rngState = snap.rng;
    state.phase = snap.phase as MatchState['phase'];
    state.phaseTimer = snap.phaseTimer;
    state.shotClock = snap.shotClock;
    state.clock = snap.clock;
    state.possession = snap.possession as Side;
    state.needsClear = snap.needsClear;
    state.winner = snap.winner as Side | null;
    state.check = snap.check
      ? {
          stage: snap.check.stage as 'wait' | 'out' | 'back',
          timer: snap.check.timer,
          from: snap.check.from,
          to: snap.check.to,
        }
      : null;
    state.freeThrow = snap.freeThrow ? { side: snap.freeThrow.side, remaining: snap.freeThrow.remaining } : null;
    state.checkGuard = snap.checkGuard.slice();
    state.passRequest = snap.passRequest ? { pid: snap.passRequest.pid, timer: snap.passRequest.timer } : null;

    const scored = snap.score[0] !== state.score[0] || snap.score[1] !== state.score[1];
    state.score[0] = snap.score[0];
    state.score[1] = snap.score[1];
    // The guest runs no simulation, so it gets no events: the net sounds off
    // the one thing it can see, which is the score going up.
    if (scored) {
      netSwing = 1;
      audio.swish();
    }

    for (let i = 0; i < state.players.length && i < snap.players.length; i++) {
      const p = state.players[i];
      const n = snap.players[i];
      p.state = n.state as typeof p.state;
      p.stateTimer = n.stateTimer;
      p.stamina = n.stamina;
      p.stagger = n.stagger;
      p.staggerTimer = n.staggerTimer;
      p.reboundLock = n.reboundLock;
      p.moveId = n.moveId as typeof p.moveId;
      p.moveTimer = n.moveTimer;
      p.moveDuration = n.moveDuration;
      p.moveDirX = n.moveDirX;
      p.moveDirZ = n.moveDirZ;
      p.moveCooldown = n.moveCooldown;
      p.dribbleHand = n.dribbleHand as typeof p.dribbleHand;
      p.shotElapsed = n.shotElapsed;
      p.shotType = n.shotType as typeof p.shotType;
      p.shotFromX = n.shotFromX;
      p.shotFromZ = n.shotFromZ;
      p.shotIsThree = n.shotIsThree;
      p.shotDrift = n.shotDrift;
      p.shotOnMoveKey = n.shotOnMoveKey;
      p.handUp = n.handUp;
      p.contestTimer = n.contestTimer;
      p.stealCooldown = n.stealCooldown;
      p.fakeTimer = n.fakeTimer;
      p.greenStreak = n.greenStreak;
      p.makeStreak = n.makeStreak;
      p.distanceRun = n.distanceRun;
      p.fumbleChecked = n.fumbleChecked;
      p.ankledStreak = n.ankledStreak;
      p.ankledResetIn = n.ankledResetIn;
      p.outOfBoundsTimer = n.outOfBoundsTimer;
      p.emoteTimer = n.emoteTimer;
      p.emoteSlot = n.emoteSlot;
      p.emoteCooldown = n.emoteCooldown;
      p.celebration = n.celebration as typeof p.celebration;
      p.celebrationTimer = n.celebrationTimer;
      p.comboCount = n.comboCount;
      p.comboTimer = n.comboTimer;
      p.dunk = n.dunk as typeof p.dunk;
      p.vx = n.vx;
      p.vz = n.vz;
      p.vy = n.vy;
      // Enough of the shot profile to draw the meter the host is running. The
      // jumpshot is looked up locally — both clients have the same catalogue —
      // so the release animation is the shooter's own.
      p.shotProfile = n.meter
        ? ({
            meterDuration: n.meter.duration,
            idealPoint: n.meter.ideal,
            greenHalfWidth: n.meter.green,
            excellentHalfWidth: n.meter.excellent,
            slightHalfWidth: n.meter.slight,
            earlyHalfWidth: n.meter.early,
            greenMakeChance: 1,
            slightMakeChance: 0.5,
            falloff: 2,
            heavilyContested: n.meter.contested,
            jumpshot: JUMPSHOT_BY_ID[p.cfg.jumpshotId] ?? JUMPSHOT_BY_ID['jumpshot-classic'],
          } as ShotProfile)
        : null;
    }

    const b = state.ball;
    const nb = snap.ball;
    b.state = nb.state as typeof b.state;
    b.owner = nb.owner;
    b.shotBy = nb.shotBy;
    b.passTo = nb.passTo;
    b.passFrom = nb.passFrom;
    b.shotWillGoIn = nb.shotWillGoIn;
    b.shotValue = nb.shotValue as 1 | 2;
    b.shotGrade = nb.shotGrade as typeof b.shotGrade;
    b.flightTime = nb.flightTime;
    b.flightDuration = nb.flightDuration;
    b.fromX = nb.fromX;
    b.fromY = nb.fromY;
    b.fromZ = nb.fromZ;
    b.toX = nb.toX;
    b.toY = nb.toY;
    b.toZ = nb.toZ;
    b.apex = nb.apex;
    b.settled = nb.settled;
    b.vx = nb.vx;
    b.vy = nb.vy;
    b.vz = nb.vz;

    // Omitted means unchanged since the last one that carried them.
    if (snap.stats) {
      for (let i = 0; i < state.stats.length && i < snap.stats.length; i++) {
        Object.assign(state.stats[i], snap.stats[i]);
      }
    }

    if (state.phase !== before) {
      netTrace('phase', () => `match phase ${before} -> ${state.phase}`, true);
    }
    if (b.state !== beforeBall || b.owner !== beforeOwner) {
      const who = (o: number | null) => (o === null ? 'loose' : `player ${o + 1}`);
      netTrace(
        'ball',
        () => `ball ${beforeBall} -> ${b.state}, possession ${who(beforeOwner)} -> ${who(b.owner)} (settled ${b.settled})`,
        true,
      );
    }

    if (before !== 'over' && state.phase === 'over') {
      audio.play('buzzer');
      setTimeout(() => closeAndFinish(false), 1800);
    }
  };

  /** Shortest signed way round from `from` to `to`, so facing never spins. */
  const angleDelta = (from: number, to: number): number => {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /**
   * Drawing the 33 ms between snapshots.
   *
   * Nothing here decides anything. Bodies and the ball ease toward where the
   * host put them, aimed at where the host's own velocity says they will be by
   * now — without that lead the whole picture sits permanently a packet behind,
   * which is the drag people read as lag. A jump too big to be a step, which is
   * a bucket, a reset or a steal, is taken whole: easing through one draws a
   * player skating across the floor.
   *
   * The animation timers keep running locally, so a 30 Hz feed does not turn
   * into a 30 fps dribble.
   */
  const advanceGuest = (dt: number) => {
    state.time += dt;
    const snap = netTarget;
    if (!snap) return;
    const lead = Math.min(sinceSnapshot, 0.12);
    // 40 was measured, not guessed: at 26 the interpolator trailed the moving
    // target and corrected every frame (jerk 13.8 milli-ft, 64 ms behind the
    // host); at 55 the jerk climbed to 22.4 for no further gain. Here it tracks
    // the velocity-led target closely enough that each frame's correction is
    // tiny — 0.15 milli-ft of jerk, 49 ms behind.
    const k = Math.min(1, dt * 40);
    const fast = Math.min(1, dt * 34);
    for (let i = 0; i < state.players.length && i < snap.players.length; i++) {
      const p = state.players[i];
      const n = snap.players[i];
      let tx = n.x + n.vx * lead;
      let tz = n.z + n.vz * lead;
      if (i === localPid) {
        // Your own body only. Outside live play nothing is led at all, so a
        // check-ball freeze is exactly as frozen here as it is on the host.
        const live = state.phase === 'live';
        const push = live ? Math.hypot(guestHeld.mx, guestHeld.mz) : 0;
        if (push > 0.1) {
          const g = Math.min(1, dt * 8);
          leadX += ((guestHeld.mx / push) * LEAD_CAP - leadX) * g;
          leadZ += ((guestHeld.mz / push) * LEAD_CAP - leadZ) * g;
        } else {
          // Let go. The lead is NOT eased back to zero: doing that drags your
          // body backwards across the floor, which is worse than the lag it was
          // hiding. It is paid off out of the host's own forward progress
          // instead — some of each step settles the debt, the rest still moves
          // you — so the drawn body only ever slows to a stop.
          const mag = Math.hypot(leadX, leadZ);
          if (mag > 1e-4) {
            const paid = Math.hypot(n.x - leadAuthX, n.z - leadAuthZ) * 0.6;
            const keep = Math.max(0, mag - paid) / mag;
            leadX *= keep;
            leadZ *= keep;
          } else {
            leadX = 0;
            leadZ = 0;
          }
        }
        leadAuthX = n.x;
        leadAuthZ = n.z;
        tx += leadX;
        tz += leadZ;
      }
      const jumped = Math.hypot(tx - p.x, tz - p.z) > 6;
      p.x = jumped ? tx : p.x + (tx - p.x) * k;
      p.z = jumped ? tz : p.z + (tz - p.z) * k;
      p.y = jumped ? n.y : p.y + (n.y - p.y) * fast;
      p.facing += angleDelta(p.facing, n.facing) * Math.min(1, dt * 16);
      p.stateTimer += dt;
      p.moveTimer += dt;
      if (p.state === 'shooting') p.shotElapsed += dt;
      if (p.emoteTimer > 0) p.emoteTimer = Math.max(0, p.emoteTimer - dt);
      if (p.emoteCooldown > 0) p.emoteCooldown = Math.max(0, p.emoteCooldown - dt);
      if (p.celebrationTimer > 0) p.celebrationTimer = Math.max(0, p.celebrationTimer - dt);
      if (p.reboundLock > 0) p.reboundLock = Math.max(0, p.reboundLock - dt);
    }

    const b = state.ball;
    const nb = snap.ball;
    // A held ball is wherever its holder's hands are, and the holder is being
    // eased toward the host — so it rides with them rather than with the packet,
    // and never trails behind the man carrying it.
    const holder = b.owner !== null && (b.state === 'held' || b.state === 'dunking') ? state.players[b.owner] : null;
    const host = holder ? snap.players[holder.pid] : null;
    const bx = holder && host ? nb.x + (holder.x - host.x) : nb.x + nb.vx * lead;
    const bz = holder && host ? nb.z + (holder.z - host.z) : nb.z + nb.vz * lead;
    const by = holder && host ? nb.y + (holder.y - host.y) : nb.y + nb.vy * lead;
    const jumped = Math.hypot(bx - b.x, bz - b.z) > 6 || Math.abs(by - b.y) > 5;
    b.x = jumped ? bx : b.x + (bx - b.x) * fast;
    b.y = jumped ? by : b.y + (by - b.y) * fast;
    b.z = jumped ? bz : b.z + (bz - b.z) * fast;
    if (b.state === 'shot' || b.state === 'pass') b.flightTime += dt;
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
    for (let side = 0; side < state.players.length; side++) {
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
      const me = state.players[localPid];
      const them = state.players[side];
      const distance = side === localPid ? 0 : Math.hypot(me.x - them.x, me.z - them.z);
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

  const stepWorld = (inputs: PlayerInput[], dt: number) => {
    const before = state.phase;
    stepMatch(state, inputs, dt);
    const events = drainEvents(state);
    if (before !== 'over' && state.phase === 'over') {
      audio.play('buzzer');
      setTimeout(() => closeAndFinish(false), 1800);
    }
    handleEvents(events);
  };

  const handleEvents = (events: SimEvent[]) => {
    for (const e of events) {
      countDrillEvent(e);
      switch (e.type) {
        case 'shotRelease': {
          const dbg = (window as unknown as { __dunkDebug?: { lastRelease: unknown } }).__dunkDebug;
          if (dbg && e.side === localPid) dbg.lastRelease = { grade: e.grade, shotType: e.shotType, made: e.made };
          const p = state.players[e.side];
          // Arm the net for this shot. A miss or a block disarms it again.
          swishPending = e.made;
          if (e.side === localPid) {
            localAttempts++;
            if (e.grade === 'green') localGreens++;
            hud.flashGrade(e.grade);
            // Scouting report: the CPU learns what kind of shots you take.
            const wasDrive = e.shotType === 'layup' || e.shotType === 'dunk' || e.shotType === 'contactDunk' || e.shotType === 'euroLayup';
            ai?.notifyOpponentShot(e.grade === 'green', e.value === 2, wasDrive);
          }
          // Only your own meter grades flash — a floor of six players all
          // captioning their releases is noise, not information.
          if (e.side === localPid || !squads) {
            hud.push(GRADE_LABEL[e.grade], GRADE_COLOR[e.grade], p.x, p.z, e.grade === 'green');
          }
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
          slamAge = 0;
          slamPower = 1;
          hud.push('POSTER!', '#ff7a3d', p.x, p.z, true);
          break;
        }
        case 'dunkHighlight': {
          // The replay: the recorded frames of the dunk that just happened,
          // played back through the game's own renderer from a low camera.
          // The world is frozen while it plays and it is always skippable.
          // Never online: a cutaway on one screen is a freeze on the other.
          if (e.side === localPid && !settings.reducedMotion && !netRole) {
            audio.play('dunk');
            cutscene = true;
            void playLiveReplay(root, {
              frames: [...replayBuffer],
              side: e.side,
              park,
              courtColor,
              surface: surface ?? null,
              posterized: e.posterized,
              packageId: e.packageId,
              dunkerName: configs[e.side].name,
              victimName: configs[e.victim >= 0 ? e.victim : e.side === 0 ? 1 : 0]?.name ?? '',
            }).then(() => {
              cutscene = false;
            });
          }
          break;
        }
        case 'pass': {
          audio.play('ui', 0.9);
          break;
        }
        case 'tip': {
          // Knocking a pass down is a defensive play worth naming, whoever
          // made it — you read the lane, or the CPU did.
          const p = state.players[e.side];
          audio.play('steal');
          shake = Math.min(1, shake + 0.35);
          hud.push('TIPPED', '#8fd0ff', p.x, p.z, e.side === localPid);
          break;
        }
        case 'passCall': {
          // Your own call flashes so you know the request registered.
          if (e.side === localPid) {
            const p = state.players[e.side];
            hud.push('CALLING FOR IT', '#8fd0ff', p.x, p.z);
          }
          break;
        }
        case 'emote': {
          // The simulation decides an emote actually happened — it owns the
          // cooldown and the ball bounce — so the caption hangs off the event
          // rather than off the keypress that asked for it.
          const p = state.players[e.side];
          const id = e.side === localPid ? (store.player.loadout.emoteSlots?.[e.slot] ?? null) : null;
          const item = id ? STORE_BY_ID[id] : undefined;
          hud.showEmote(item?.name ?? 'Emote', item?.colors[0] ?? '#8a93a6', p.x, p.z);
          audio.play('ui', 1.1);
          break;
        }
        case 'dunk':
          audio.play('dunk');
          shake = Math.min(1, shake + 0.5);
          slamAge = 0;
          slamPower = 0.8;
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

    const local = state.players[localPid];
    const handler = state.ball.owner !== null ? state.players[state.ball.owner] : local;
    // The camera frames the action: how far the floor is spread is measured
    // from the handler to the farthest player who matters (you included).
    let spread = Math.hypot(local.x - handler.x, local.z - handler.z);
    for (const p of state.players) {
      spread = Math.max(spread, Math.hypot(p.x - handler.x, p.z - handler.z) * (squads ? 0.72 : 1));
    }
    cam.follow(handler.x, handler.z, spread, dt, settings.cameraDistance ?? 1);
    cam.update(width, height);

    ctx.save();
    if (shake > 0 && settings.cameraShake && !settings.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 9);
    }

    // The replay recorder: the last few seconds of real sim frames, kept so a
    // dunk replay can be the dunk that actually happened. Recorded here, after
    // the sim stepped and before anything is drawn, so a recorded frame is
    // exactly a drawn frame.
    replayBuffer.push(snapshotFrame(state));
    if (replayBuffer.length > 620) replayBuffer.shift();

    courtRenderer.drawBackdrop(ctx, park, width, height, state.time);
    courtRenderer.drawCourt(ctx, cam, park, courtColor, surface);
    // The rim: a slam snaps it down and it springs back with a damped
    // oscillation; a body hanging off it holds it pulled down until they let
    // go. A power slam is the rim moving, not the screen shaking.
    slamAge += dt;
    const spring = slamPower * Math.exp(-3.4 * slamAge) * Math.abs(Math.cos(slamAge * 9));
    const hanging = state.players.some((pp) => pp.state === 'rimHang');
    const rimBend = Math.max(spring, hanging ? 0.5 : 0);
    courtRenderer.drawHoop(ctx, cam, park, netSwing, rimBend);

    // Shadows first so nobody's shadow lands on a body.
    for (const p of state.players) {
      playerRenderer.drawShadow(ctx, cam, p.x, p.z, p.y, 0.9 + (p.cfg.heightIn - 70) * 0.012);
    }

    // Depth sort: draw far (small z) before near (large z).
    // A ball being carried through a dunk flight is drawn by the dunker's own
    // draw call, in the posed hand — the standalone pass would put it at the
    // sim's rough overhead point while the choreography swings the hands away.
    const carried = state.ball.state === 'dunking' ? state.ball.owner : null;
    const drawables: { z: number; draw: () => void }[] = [
      ...state.players.map((p) => ({
        z: p.z,
        draw: () =>
          playerRenderer.draw(
            ctx,
            cam,
            p,
            state.time,
            p.pid === localPid,
            state.ball.owner === p.pid,
            carried === p.pid ? state.ball : null,
          ),
      })),
      ...(carried === null
        ? [{ z: state.ball.z, draw: () => playerRenderer.drawBall(ctx, cam, state.ball, state.time) }]
        : []),
    ];
    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) d.draw();

    playerRenderer.drawShotTrail(ctx, cam, state);
    if (state.ball.owner === localPid && state.ball.state === 'held') {
      playerRenderer.drawRangeMarker(ctx, cam, local, isBeyondArc(local.x, local.z));
    }

    hud.drawWorldPopups(ctx, cam);
    hud.drawShotMeter(ctx, cam, state, localPid, settings.shotMeterStyle, width, height);
    ctx.restore();

    if (drill) {
      if (drillClock) drillClock.textContent = formatClock(drill.freeplay ? drill.durationSeconds - drillTimeLeft : drillTimeLeft);
      if (drillCount) drillCount.textContent = String(drillReps);
    } else {
      hud.drawScoreBug(ctx, state, width, localSide, squads ? teamLabels : null);
    }
    // Online replaces the single-player check prompt with the shared one: the
    // server's count, so both people see the same 0/2 → 2/2.
    hud.drawCallouts(
      ctx,
      state,
      localPid,
      width,
      height,
      netRole ? { count: readyCount, total: readyTotal } : null,
    );
    // Nothing has arrived from the host for a while. Say so: a court that is
    // still drawing while the controls do nothing looks like broken controls,
    // and it is not — it is the other end that has gone quiet.
    if (netRole === 'guest' && sinceSnapshot > 1 && !matchSettled) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,16,0.78)';
      roundRect(ctx, width / 2 - 170, 78, 340, 44, 6);
      ctx.fill();
      ctx.font = '900 15px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#ffc53d';
      ctx.fillText('WAITING FOR THE OTHER PLAYER', width / 2, 100);
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#97a2b8';
      ctx.fillText(`no update for ${sinceSnapshot.toFixed(1)}s`, width / 2, 114);
      ctx.restore();
    }
    drawFooter(ctx, width, height, loop.fps, null, settings.touchControls, !!squads);

  };

  const loop = new GameLoop(step, render, SIM_DT);
  loop.fpsCap = settings.fpsCap;
  // Online only: somebody else is waiting on this simulation, so it must not
  // stop because this tab went to the background. Every offline mode keeps the
  // old behaviour of pausing with the tab.
  loop.backgroundSafe = !!netRole;
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
  team = false,
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
    ctx.fillText(
      team
        ? 'SPACE shoot · E drive · TAB pass / call for it · F steal · J L crossover · ESC pause'
        : 'SPACE shoot / contest · E drive · F steal · J L crossover · HOLD K stepback jumper · ESC pause',
      16,
      h - 12,
    );
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
