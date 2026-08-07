import { awardBadgeProgress, badgeLevel } from '../badges.ts';
import { Rng } from '../rng.ts';
import {
  computeContest,
  computeShotProfile,
  isAutomatic,
  resolveShot,
  type ShotProfile,
  type ShotType,
} from '../shooting.ts';
import { COURT, clampToCourt, distanceToRim, isBeyondArc, shotValue } from './court.ts';
import { MOVE_BY_ID, DUNK_PACKAGE_BY_ID, type DribbleMoveDef, type DribbleMoveId } from './moves.ts';
import {
  emptyStats,
  type Ball,
  type MatchConfig,
  type MatchState,
  type PlayerInput,
  type SimEvent,
  type SimPlayer,
  type SimPlayerConfig,
  type Side,
} from './state.ts';

export const SIM_DT = 1 / 120;
const GRAVITY = 32.17; // ft/s^2

const other = (side: Side): Side => (side === 0 ? 1 : 0);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- attributes

function sprintSpeed(p: SimPlayer): number {
  const base = lerp(13.5, 21.5, clamp01((p.cfg.attrs.speed - 25) / 74));
  const weightDrag = 1 - clamp01((p.cfg.weightLb - 210) / 260) * 0.08;
  return base * weightDrag;
}

/**
 * How much of your open-floor speed you keep while dribbling. A guard with the
 * ball on a string barely slows down; a centre drops to a shuffle.
 */
function ballSpeedMult(p: SimPlayer): number {
  return lerp(0.66, 1.0, clamp01((p.cfg.attrs.speedWithBall - 25) / 74));
}

/** Seconds you have to wait before chaining the next dribble move. */
function moveCooldownFor(p: SimPlayer): number {
  // 0.30 s at 25 rated down to 0.05 s at 99: high enough and you can chain
  // through-the-legs almost continuously.
  return lerp(0.3, 0.05, clamp01((p.cfg.attrs.speedWithBall - 25) / 74));
}

/**
 * How fast the move itself is thrown. Together with the cooldown this is the
 * difference between a big man labouring through one crossover and a guard
 * putting the ball through his legs three times in a second.
 */
function moveTempo(p: SimPlayer): number {
  return lerp(1.25, 0.72, clamp01((p.cfg.attrs.speedWithBall - 25) / 74));
}

function accelRate(p: SimPlayer): number {
  return lerp(30, 68, clamp01((p.cfg.attrs.acceleration - 25) / 74));
}

function jumpHeight(p: SimPlayer): number {
  return lerp(1.9, 4.0, clamp01((p.cfg.attrs.vertical - 25) / 74));
}

/** Highest point the player can reach with the ball or a contest hand. */
function reachHeight(p: SimPlayer): number {
  const standing = (p.cfg.heightIn / 12) * 1.32 + (p.cfg.wingspanIn - p.cfg.heightIn) / 12;
  return standing + p.y;
}

function staminaDrainMult(p: SimPlayer): number {
  return lerp(1.4, 0.58, clamp01((p.cfg.attrs.stamina - 25) / 74));
}

/** How long the reach-in animation runs. */
export const STEAL_TIME = 0.34;

/** How long an emote holds you up for. */
export const EMOTE_DURATION = 1.6;
/** And how long before you are allowed another one. */
export const EMOTE_COOLDOWN = 10;
/** How long a three-point celebration runs — it has the dead-ball beat to fit in. */
export const THREE_CELEBRATION_TIME = 1.2;
/** The win celebration runs long, because nothing is waiting on it. */
export const WIN_CELEBRATION_TIME = 6;

// -------------------------------------------------------------- construction

/**
 * A player in its rest state. Exported so the cosmetics preview can build one
 * and hand it to the very same renderer the court uses — a preview drawn by
 * different code is a preview that can lie to you.
 */
export function makePlayer(side: Side, cfg: SimPlayerConfig): SimPlayer {
  return {
    side,
    cfg,
    x: side === 0 ? -3 : 3,
    z: side === 0 ? 24 : 18,
    vx: 0,
    vz: 0,
    y: 0,
    vy: 0,
    facing: side === 0 ? Math.PI : 0,
    state: 'idle',
    stateTimer: 0,
    stamina: 1,
    moveId: null,
    moveTimer: 0,
    moveDuration: 0,
    moveDirX: 0,
    moveDirZ: 0,
    stagger: 0,
    staggerTimer: 0,
    shotElapsed: 0,
    shotProfile: null,
    shotType: 'jumper',
    shotFromX: 0,
    shotFromZ: 0,
    shotIsThree: false,
    shotDrift: 0,
    shotOnMoveKey: false,
    emoteTimer: 0,
    emoteSlot: -1,
    emoteCooldown: 0,
    celebration: null,
    celebrationTimer: 0,
    handUp: false,
    contestTimer: 0,
    stealCooldown: 0,
    moveCooldown: 0,
    fakeTimer: 0,
    greenStreak: 0,
    makeStreak: 0,
    distanceRun: 0,
    fumbleChecked: false,
    dribbleHand: 1,
    ankledStreak: 0,
    ankledResetIn: 0,
    outOfBoundsTimer: 0,
    comboCount: 0,
    comboTimer: 0,
  };
}

function makeBall(): Ball {
  return {
    x: 0,
    y: 4,
    z: 20,
    vx: 0,
    vy: 0,
    vz: 0,
    state: 'held',
    owner: 0,
    shotWillGoIn: false,
    shotBy: null,
    shotValue: 1,
    shotGrade: null,
    flightTime: 0,
    flightDuration: 1,
    fromX: 0,
    fromY: 0,
    fromZ: 0,
    toX: 0,
    toY: 0,
    toZ: 0,
    apex: 14,
    settled: false,
  };
}

export function defaultMatchConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    targetScore: 11,
    winBy: 2,
    maxScore: 15,
    shotClock: 14,
    makeItTakeIt: true,
    turnoverOnMiss: false,
    manualCheck: true,
    instantInbound: false,
    timeLimit: 0,
    parkId: 'downtown',
    playlist: 'casual',
    ...overrides,
  };
}

export function createMatch(
  a: SimPlayerConfig,
  b: SimPlayerConfig,
  config: MatchConfig,
  seed: number,
): MatchState {
  const state: MatchState = {
    frame: 0,
    time: 0,
    rngState: seed >>> 0 || 1,
    phase: 'checkball',
    phaseTimer: 1.4,
    players: [makePlayer(0, a), makePlayer(1, b)],
    ball: makeBall(),
    score: [0, 0],
    possession: 0,
    needsClear: false,
    shotClock: config.shotClock,
    clock: config.timeLimit,
    stats: [emptyStats(), emptyStats()],
    freeThrow: null,
    checkGuard: [false, false],
    check: null,
    events: [],
    config,
    winner: null,
  };
  setupCheckball(state, 0);
  return state;
}

function setupCheckball(state: MatchState, offense: Side): void {
  const off = state.players[offense];
  const def = state.players[other(offense)];
  state.possession = offense;
  state.phase = 'checkball';
  state.phaseTimer = 1.2;
  state.shotClock = state.config.shotClock;
  state.needsClear = false;

  off.x = 0;
  off.z = 25;
  off.vx = off.vz = 0;
  off.y = off.vy = 0;
  off.state = 'dribble';
  off.stagger = 0;
  off.staggerTimer = 0;
  off.moveId = null;
  off.shotProfile = null;
  off.facing = Math.PI; // toward the rim

  def.x = 0;
  def.z = 20;
  def.vx = def.vz = 0;
  def.y = def.vy = 0;
  def.state = 'idle';
  def.stagger = 0;
  def.staggerTimer = 0;
  def.facing = 0;

  const ball = state.ball;
  ball.state = 'held';
  ball.owner = offense;
  ball.settled = false;
  ball.shotBy = null;
  ball.shotGrade = null;
  ball.vx = ball.vy = ball.vz = 0;
  state.check = state.config.manualCheck
    ? { stage: 'wait', timer: 0, from: offense, to: other(offense) }
    : null;
  state.events.push({ type: 'phase', phase: 'checkball' });
}

// ------------------------------------------------------------------ stepping

export function stepMatch(state: MatchState, inputs: [PlayerInput, PlayerInput], dt = SIM_DT): void {
  if (state.phase === 'over') return;
  const rng = new Rng(state.rngState);

  state.frame++;
  state.time += dt;

  if (state.phase === 'deadball' || state.phase === 'checkball') {
    state.phaseTimer -= dt;
    if (state.phase === 'deadball') {
      if (state.phaseTimer <= 0) setupCheckball(state, state.possession);
    } else if (state.config.manualCheck && state.check) {
      updateCheck(state, inputs, dt);
    } else if (state.phaseTimer <= 0) {
      state.phase = 'live';
      state.events.push({ type: 'phase', phase: 'live' });
    }
  }

  if (state.phase === 'freeThrow') {
    updateFreeThrow(state, inputs, dt, rng);
    state.rngState = rng.snapshot();
    return;
  }

  const live = state.phase === 'live';
  if (live) {
    state.shotClock -= dt;
    if (state.config.timeLimit > 0) state.clock = Math.max(0, state.clock - dt);
  }

  const checking = state.phase === 'checkball' && !!state.check;
  for (const side of [0, 1] as Side[]) {
    let input = live ? inputs[side] : checking ? frozen(inputs[side]) : neutral(inputs[side]);
    // The guard reads the RAW button, not the neutralised one: during the check
    // ceremony shoot is already forced false, so testing the processed input
    // would clear the guard immediately and let the held button fire a shot the
    // moment play went live.
    if (state.checkGuard[side]) {
      if (inputs[side].shoot) input = { ...input, shoot: false };
      else state.checkGuard[side] = false;
    }
    updatePlayer(state, side, input, dt, rng);
  }

  updateBall(state, dt, rng);
  resolveBodies(state, dt);

  // A shot already in the air beats the buzzer.
  const handler = state.players[state.possession];
  const shotUnderway = handler.state === 'shooting' || handler.state === 'finishing';
  if (live && state.shotClock <= 0 && state.ball.state === 'held' && !shotUnderway) {
    turnover(state, state.possession, 'shotClock');
  }

  if (state.config.timeLimit > 0 && state.clock <= 0 && state.winner === null) {
    finishGame(state, state.score[0] === state.score[1] ? state.possession : state.score[0] > state.score[1] ? 0 : 1);
  }

  state.rngState = rng.snapshot();
}

/** During dead ball phases we honour movement but suppress actions. */
function neutral(input: PlayerInput): PlayerInput {
  return { ...input, shoot: false, drive: false, move: null, steal: false, contest: false, fake: false };
}

/** Nobody moves during a check. You stand there and check the ball. */
function frozen(input: PlayerInput): PlayerInput {
  return { ...neutral(input), mx: 0, mz: 0, sprint: false };
}


// -------------------------------------------------------------- checking in

const CHECK_PASS_TIME = 0.42;

/**
 * The check-in ceremony. You press once; the ball is bounce-passed to the other
 * player and passed straight back, and only then does the clock start. Nothing
 * either player presses during it does anything else, so checking in can never
 * turn into a jump or a shot.
 */
function updateCheck(state: MatchState, inputs: [PlayerInput, PlayerInput], dt: number): void {
  const check = state.check;
  if (!check) return;
  const ball = state.ball;

  if (check.stage === 'wait') {
    // A short beat so the ball is visibly in hand before you can check it.
    if (state.phaseTimer > 0) return;
    if (!inputs[0].shoot && !inputs[1].shoot) return;
    state.checkGuard = [inputs[0].shoot, inputs[1].shoot];
    check.stage = 'out';
    check.timer = 0;
    ball.state = 'dead';
    ball.owner = null;
    return;
  }

  check.timer += dt;
  const t = clamp01(check.timer / CHECK_PASS_TIME);
  const outbound = check.stage === 'out';
  const a = state.players[outbound ? check.from : check.to];
  const b = state.players[outbound ? check.to : check.from];

  // A bounce pass, swung out to one side so it is not hidden behind a body —
  // the players stand nose to nose at the check and the camera looks straight
  // down that line.
  const swing = Math.sin(t * Math.PI) * 2.6;
  ball.x = lerp(a.x, b.x, t) + swing;
  ball.z = lerp(a.z, b.z, t);
  const chest = 3.4;
  ball.y = chest - Math.sin(t * Math.PI) * (chest - 0.7);

  if (t < 1) return;

  if (outbound) {
    check.stage = 'back';
    check.timer = 0;
    return;
  }

  // Back in the offence's hands: play on.
  ball.state = 'held';
  ball.owner = check.from;
  state.possession = check.from;
  state.check = null;
  state.phase = 'live';
  state.events.push({ type: 'phase', phase: 'live' });
}

// ------------------------------------------------------------------- players

function updatePlayer(state: MatchState, side: Side, input: PlayerInput, dt: number, rng: Rng): void {
  const p = state.players[side];
  const opp = state.players[other(side)];
  const hasBall = state.ball.owner === side && state.ball.state === 'held';

  // Timers -----------------------------------------------------------------
  p.stateTimer = Math.max(0, p.stateTimer - dt);
  p.stealCooldown = Math.max(0, p.stealCooldown - dt);
  p.moveCooldown = Math.max(0, p.moveCooldown - dt);
  p.fakeTimer = Math.max(0, p.fakeTimer - dt);
  p.emoteCooldown = Math.max(0, p.emoteCooldown - dt);
  if (p.celebrationTimer > 0) {
    p.celebrationTimer = Math.max(0, p.celebrationTimer - dt);
    if (p.celebrationTimer === 0) p.celebration = null;
  }
  p.comboTimer = Math.max(0, p.comboTimer - dt);
  if (p.comboTimer <= 0) p.comboCount = 0;

  if (p.staggerTimer > 0) {
    p.staggerTimer -= dt;
    p.stagger = clamp01(p.staggerTimer / 0.9);
    if (p.staggerTimer <= 0) {
      p.stagger = 0;
      if (p.state === 'staggered' || p.state === 'fallen') p.state = 'idle';
    }
  }

  // "Three in a row" is three inside a window, not three all game: stay on your
  // feet for six seconds and the count is wiped.
  if (p.ankledResetIn > 0) {
    p.ankledResetIn -= dt;
    if (p.ankledResetIn <= 0) p.ankledStreak = 0;
  }

  // Vertical ---------------------------------------------------------------
  if (p.y > 0 || p.vy > 0) {
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      if (p.state === 'airborne' || p.state === 'contesting') {
        p.state = 'landing';
        p.stateTimer = 0.14;
      }
    }
  }

  // Shot in progress -------------------------------------------------------
  if (p.state === 'shooting') {
    p.shotElapsed += dt;
    p.shotProfile = buildShotProfile(state, side, p.shotType);
    // A stepback is timed on the key that threw it, everything else on shoot.
    const holding = p.shotOnMoveKey ? input.moveShoot : input.shoot;
    const forced = p.shotElapsed >= p.shotProfile.meterDuration * 1.4;
    if (!holding || forced) {
      releaseShot(state, side, rng);
    }
    applyMovement(state, p, input, dt, 0.28);
    return;
  }

  if (p.state === 'finishing') {
    p.stateTimer -= 0;
    if (p.stateTimer <= 0) {
      completeFinish(state, side, rng);
    }
    return;
  }

  // Dribble move animation --------------------------------------------------
  if (p.state === 'moveLock' && p.moveId) {
    p.moveTimer += dt;
    const def = MOVE_BY_ID[p.moveId];
    const progress = p.moveTimer / p.moveDuration;
    // The eurostep is two beats — out to one side, then back across and
    // forward — so it reads as two planted steps rather than a slide.
    const shape =
      p.moveId === 'euro'
        ? Math.sin(Math.min(1, progress) * Math.PI * 2)
        : Math.sin(Math.min(1, progress) * Math.PI);
    p.vx += p.moveDirX * def.lateral * shape * dt * 9;
    p.vz += p.moveDirZ * def.lateral * shape * dt * 9;
    if (p.moveId === 'euro') {
      // Second step carries you to the rim, not just sideways.
      const toRim = normalize(COURT.rimX - p.x, COURT.rimZ - p.z);
      const forward = Math.max(0, Math.sin(Math.min(1, progress) * Math.PI));
      p.vx += toRim.x * def.burst * forward * dt * 6;
      p.vz += toRim.z * def.burst * forward * dt * 6;
    }
    // Retreat is always away from the rim, and it is a displacement rather than
    // a shove on the velocity. Nudging the velocity does not work: applyMovement
    // runs straight afterwards and drags it back toward the stick, which is zero
    // while you are stepping back, so friction ate the whole thing and a
    // "stepback" moved you about two inches. Driving the position directly means
    // the step is exactly def.retreat feet no matter what the friction is doing.
    // The sine is normalised so it integrates to 1 across the animation.
    if (def.retreat > 0) {
      const away = normalize(p.x - COURT.rimX, p.z - COURT.rimZ);
      const hop = ((Math.PI / 2) * Math.max(0, shape) * dt) / p.moveDuration;
      const stepped = clampToCourt(p.x + away.x * def.retreat * hop, p.z + away.z * def.retreat * hop);
      p.x = stepped.x;
      p.z = stepped.z;
    }
    const canCancel = progress >= def.cancelPoint;
    // The stepback is the one move you shoot with its own key. Pressing shoot
    // mid-stepback used to both start and end the meter in the same breath,
    // which is why it fired the instant it became legal and always graded very
    // early. Now you hold the stepback key: the meter starts when you clear the
    // step and runs for as long as you keep holding.
    const onMoveKey = p.moveId === 'stepback';
    const shotHeld = onMoveKey ? input.moveShoot : input.shoot;
    // A move built on a big retreat has to land the step before it rises into
    // the shot. Cancelling at the cancel point meant going up 35% of the way
    // through your own stepback, which threw away most of the room it made.
    // Small moves still cancel early — that is the whole point of them.
    const risesOnLanding = def.retreat > 3;
    if (canCancel && shotHeld && !risesOnLanding) {
      startShot(state, side, def.followUp === 'euroLayup' ? 'euroLayup' : (def.followUp as ShotType) ?? 'jumper');
      p.shotOnMoveKey = onMoveKey;
      return;
    }
    if (canCancel && input.drive && distanceToRim(p.x, p.z) < 12) {
      startFinish(state, side, rng);
      return;
    }
    // Fumble check, once, at the point the ball is most exposed. Poor handles
    // lose it through the legs or across the body and the defender can pounce.
    if (!p.fumbleChecked && progress >= 0.45 && hasBall) {
      p.fumbleChecked = true;
      if (tryFumble(state, side, def, rng)) return;
    }
    if (p.moveTimer >= p.moveDuration) {
      if (p.moveId === 'euro' && hasBall) {
        // A eurostep is two steps and then you have to go up with it — keep
        // moving after the second step and you have travelled. So it plants:
        // momentum dies and the layup starts.
        p.vx = 0;
        p.vz = 0;
        p.moveId = null;
        p.moveCooldown = moveCooldownFor(p);
        startShot(state, side, 'euroLayup');
        return;
      }
      if (risesOnLanding && shotHeld && hasBall) {
        // The step has landed and you are still holding it, so now you go up.
        // The room is already made, so the meter runs from a set base.
        p.moveId = null;
        p.moveCooldown = moveCooldownFor(p);
        startShot(state, side, (def.followUp as ShotType) ?? 'jumper');
        p.shotOnMoveKey = onMoveKey;
        return;
      }
      p.state = hasBall ? 'dribble' : 'idle';
      p.vx += p.moveDirX * def.burst * 0.6;
      p.vz += p.moveDirZ * def.burst * 0.6;
      p.moveId = null;
      p.moveCooldown = moveCooldownFor(p);
    }
    applyMovement(state, p, input, dt, 0.45);
    return;
  }

  // Emoting ------------------------------------------------------------------
  // You stand there bouncing the ball and taunting. It costs you tempo, not
  // possession: nobody can take it off you mid-emote, but the shot clock never
  // stops for it, so an emote with four seconds left is a genuine mistake.
  if (p.state === 'emoting') {
    p.emoteTimer -= dt;
    p.handUp = false;
    p.vx *= 0.8;
    p.vz *= 0.8;
    if (p.emoteTimer <= 0) {
      // Done: the ball comes back up into the hands and play carries on.
      p.emoteTimer = 0;
      p.emoteSlot = -1;
      p.state = hasBall ? 'dribble' : 'idle';
    }
    if (hasBall) placeHeldBall(state, p, state.ball);
    return;
  }

  if (p.state === 'landing') {
    if (p.stateTimer <= 0) p.state = hasBall ? 'dribble' : 'idle';
    applyMovement(state, p, input, dt, 0.35);
    return;
  }

  if (p.state === 'fallen') {
    // On the floor. No movement, no contest, nothing — that is the point.
    p.vx *= 0.85;
    p.vz *= 0.85;
    p.handUp = false;
    return;
  }

  if (p.state === 'staggered') {
    // Fully stopped while the stagger is fresh, then it eases back so he can
    // start recovering rather than sliding around broken.
    applyMovement(state, p, input, dt, p.stagger > 0.6 ? 0 : 0.25);
    return;
  }

  // --- action inputs -------------------------------------------------------
  if (hasBall) {
    if (input.fake && p.fakeTimer <= 0 && p.y === 0) {
      p.fakeTimer = 0.45;
      p.state = 'idle';
    }

    if (input.emote !== null && p.emoteCooldown <= 0 && p.y === 0) {
      p.state = 'emoting';
      p.emoteTimer = EMOTE_DURATION;
      p.emoteSlot = input.emote;
      p.emoteCooldown = EMOTE_COOLDOWN;
      p.vx = 0;
      p.vz = 0;
      state.events.push({ type: 'emote', side, slot: input.emote });
      return;
    }

    if (input.move && p.moveCooldown <= 0 && p.y === 0 && p.fakeTimer <= 0) {
      tryDribbleMove(state, side, input.move, input, rng);
      return;
    }

    // Sprint into the rim and press shoot: a dunk on the meter. Green it and
    // it is a highlight; a defender leaving his feet at you squeezes the window
    // to almost nothing, and hitting it anyway is a poster.
    if (
      input.shoot &&
      input.sprint &&
      p.y === 0 &&
      !state.needsClear &&
      Math.hypot(input.mx, input.mz) > 0.2 &&
      distanceToRim(p.x, p.z) < 11
    ) {
      // Sprinting at the rim with shoot held goes up with it. If the build
      // genuinely cannot dunk it becomes a layup rather than doing nothing —
      // an input that silently fails is worse than one that does the lesser
      // version of what you asked for.
      startShot(state, side, canDunkNow(state, side) ? dunkTypeFor(state, side) : 'layup');
      return;
    }

    if (input.drive && p.y === 0 && distanceToRim(p.x, p.z) < 13 && !state.needsClear) {
      startFinish(state, side, rng);
      return;
    }

    if (input.shoot && p.y === 0 && !state.needsClear) {
      const dist = distanceToRim(p.x, p.z);
      startShot(state, side, dist < 5.5 ? 'layup' : dist < 9 ? 'floater' : 'jumper');
      return;
    }

    p.state = 'dribble';
  } else {
    // --- defence ----------------------------------------------------------
    if (input.contest && p.y === 0 && p.state !== 'contesting') {
      const dx = opp.x - p.x;
      const dz = opp.z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Only leave the floor when it can plausibly reach something.
      if (dist < 7 || state.ball.state === 'shot') {
        p.state = 'contesting';
        p.vy = Math.sqrt(2 * GRAVITY * jumpHeight(p) * 0.92);
        p.y = 0.001;
        p.stamina = clamp01(p.stamina - 0.03 * staminaDrainMult(p));
        p.contestTimer = 0.6;
      }
    }

    if (input.steal && p.stealCooldown <= 0 && state.ball.state === 'held') {
      attemptSteal(state, side, rng);
    }

    p.handUp = input.contest || (p.state === 'contesting' && p.y > 0.2);
    if (p.state === 'idle' || p.state === 'dribble') p.state = 'idle';
  }

  applyMovement(state, p, input, dt, 1);
}

function normalize(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len < 1e-5) return { x: 0, z: 1 };
  return { x: x / len, z: z / len };
}

function applyMovement(state: MatchState, p: SimPlayer, input: PlayerInput, dt: number, control: number): void {
  const hasBall = state.ball.owner === p.side && state.ball.state === 'held';
  const staggerControl = 1 - p.stagger * 0.85;
  const airControl = p.y > 0 ? 0.25 : 1;
  const authority = control * staggerControl * airControl;

  let mag = Math.hypot(input.mx, input.mz);
  if (mag > 1) {
    input = { ...input, mx: input.mx / mag, mz: input.mz / mag };
    mag = 1;
  }

  const wantsSprint = input.sprint && p.stamina > 0.06 && mag > 0.2;
  const speedBooster = badgeLevel(p.cfg.badges, 'speedBooster');
  const quickFirst = badgeLevel(p.cfg.badges, 'quickFirstStep');

  let top = sprintSpeed(p) * (wantsSprint ? 1 : 0.62);
  // With the ball your top speed is Speed With Ball, not raw Speed. A big man
  // who cannot dribble genuinely cannot get anywhere with it.
  if (hasBall) top *= ballSpeedMult(p) * (1 + speedBooster * 0.07);
  // Low stamina bites into top speed.
  top *= lerp(0.72, 1, clamp01(p.stamina * 1.6));

  const accel = accelRate(p) * (1 + quickFirst * 0.18) * authority;
  const targetVx = input.mx * top * authority;
  const targetVz = input.mz * top * authority;

  p.vx += clamp(targetVx - p.vx, -accel * dt, accel * dt);
  p.vz += clamp(targetVz - p.vz, -accel * dt, accel * dt);

  // Ground friction when no input.
  if (mag < 0.05 && p.y === 0) {
    const decel = accel * 1.4 * dt;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed <= decel) {
      p.vx = 0;
      p.vz = 0;
    } else {
      p.vx -= (p.vx / speed) * decel;
      p.vz -= (p.vz / speed) * decel;
    }
  }

  const speed = Math.hypot(p.vx, p.vz);
  p.distanceRun += speed * dt;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const clamped = clampToCourt(p.x, p.z);
  const wentOut = clamped.x !== p.x || clamped.z !== p.z;
  if (clamped.x !== p.x) p.vx = 0;
  if (clamped.z !== p.z) p.vz = 0;
  p.x = clamped.x;
  p.z = clamped.z;

  // Out of bounds is a turnover, but brushing the line is not: you have to keep
  // driving into it for a beat. Clipping the sideline while cutting should cost
  // you a step, not the ball. The baseline is behind the hoop in a half-court
  // game, so only the sidelines and the half-court line count.
  const atSideline = Math.abs(clamped.x) >= COURT.halfWidth - 0.65;
  const atHalfCourt = clamped.z >= COURT.playDepth - 0.15;
  const drivingOut =
    (atSideline && input.mx * Math.sign(clamped.x) > 0.45) || (atHalfCourt && input.mz > 0.45);

  if (drivingOut && hasBall && state.phase === 'live' && !state.config.instantInbound) {
    p.outOfBoundsTimer += dt;
    if (p.outOfBoundsTimer > 0.4) {
      p.outOfBoundsTimer = 0;
      turnover(state, p.side, 'outOfBounds');
      return;
    }
  } else {
    p.outOfBoundsTimer = 0;
  }

  if (speed > 0.6) p.facing = Math.atan2(p.vx, -p.vz);
  else if (hasBall) p.facing = Math.atan2(COURT.rimX - p.x, -(COURT.rimZ - p.z));

  // Stamina model -----------------------------------------------------------
  const drain = staminaDrainMult(p);
  if (wantsSprint) {
    p.stamina = clamp01(p.stamina - 0.085 * drain * dt * (hasBall ? 1.12 : 1));
  } else if (speed > 1.5) {
    p.stamina = clamp01(p.stamina - 0.012 * drain * dt);
  } else {
    const handlesForDays = badgeLevel(p.cfg.badges, 'handlesForDays');
    p.stamina = clamp01(p.stamina + (0.115 + handlesForDays * 0.03) * dt / drain);
  }
  // Passive trickle so long possessions do not become unplayable.
  if (!wantsSprint) p.stamina = clamp01(p.stamina + 0.02 * dt / drain);

  // Clear check. This uses exactly the same test as the three-point line, so
  // anywhere the game already treats you as a three-point shooter counts as
  // cleared. It used to be a radial 23.75ft from the rim, which does not match
  // the painted line in the corners: standing at the corner three you were
  // visibly behind the arc but 22ft from the rim, so the game kept telling you
  // to clear and refused to let you shoot.
  if (state.needsClear && state.ball.owner === p.side && isBeyondArc(p.x, p.z)) {
    state.needsClear = false;
    state.events.push({ type: 'clear', side: p.side });
  }
}

/** Body-up: the defender slows and redirects a driving handler. */
function resolveBodies(state: MatchState, dt: number): void {
  const [a, b] = state.players;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = 1.75;
  if (dist >= minDist || dist < 1e-4) return;

  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;

  const handler = state.ball.owner === 0 ? a : state.ball.owner === 1 ? b : null;
  const defender = handler ? state.players[other(handler.side)] : null;

  let aShare = 0.5;
  if (handler && defender) {
    const handlerPower =
      handler.cfg.attrs.strength * 0.6 + handler.cfg.attrs.ballHandle * 0.4 + badgeLevel(handler.cfg.badges, 'bully') * 20;
    const defPower =
      defender.cfg.attrs.strength * 0.55 +
      defender.cfg.attrs.perimeterDefense * 0.45 +
      badgeLevel(defender.cfg.badges, 'immovable') * 22 +
      badgeLevel(defender.cfg.badges, 'clamps') * 12;
    const handlerWins = handlerPower / (handlerPower + defPower);
    aShare = handler === a ? 1 - handlerWins : handlerWins;
    // Bumping costs the handler speed and a sliver of stamina.
    const bumpLoss = 1 - clamp01(handlerWins) * 0.55;
    handler.vx *= 1 - 0.55 * bumpLoss * dt * 12;
    handler.vz *= 1 - 0.55 * bumpLoss * dt * 12;
    handler.stamina = clamp01(handler.stamina - 0.02 * dt * staminaDrainMult(handler));
    if (badgeLevel(defender.cfg.badges, 'menace') > 0) {
      handler.stamina = clamp01(handler.stamina - badgeLevel(defender.cfg.badges, 'menace') * 0.035 * dt);
    }
  }

  a.x -= nx * overlap * aShare;
  a.z -= nz * overlap * aShare;
  b.x += nx * overlap * (1 - aShare);
  b.z += nz * overlap * (1 - aShare);

  const ca = clampToCourt(a.x, a.z);
  a.x = ca.x;
  a.z = ca.z;
  const cb = clampToCourt(b.x, b.z);
  b.x = cb.x;
  b.z = cb.z;
}

// ------------------------------------------------------------- dribble moves


/**
 * A move you do not have the handle for gets away from you. The ball squirts
 * loose in the direction it was travelling, so the defender has a real chance
 * at it — which is what makes spamming moves on a low Ball Handle build a bad
 * idea rather than a free animation.
 */
function tryFumble(state: MatchState, side: Side, def: DribbleMoveDef, rng: Rng): boolean {
  const p = state.players[side];
  const handle = p.cfg.attrs.ballHandle;

  // Ball Handle alone decides this. Speed With Ball lets you throw more moves,
  // which means more chances to fumble — the two ratings pull against each
  // other on purpose, so a fast handle with no control is a liability.
  const skill = clamp01((handle - 30) / 69);
  let chance = (1 - skill) ** 2 * 0.16;
  chance *= def.signature ? 1.6 : def.requires > 0 ? 1.25 : 1;
  chance *= 1 + Math.min(4, p.comboCount - 1) * 0.22;
  chance *= 1 - badgeLevel(p.cfg.badges, 'tightHandles') * 0.3;
  chance *= 1 - badgeLevel(p.cfg.badges, 'handlesForDays') * 0.25;
  // Pressure matters: a defender in your chest turns a wobble into a turnover.
  const d = state.players[other(side)];
  const pressure = clamp01(1 - Math.hypot(d.x - p.x, d.z - p.z) / 7);
  chance *= 1 + pressure * 0.8;
  // A retreat pulls the ball away from the defender rather than across him, so
  // it is the safest moment in the move set. Without this the stepback carried
  // the same strip risk as a between-the-legs taken into a defender's chest.
  chance *= 1 - clamp01(def.retreat / 8) * 0.55;
  chance *= 1 - clamp01(p.stamina) * 0.15;

  if (!rng.chance(clamp01(chance))) return false;

  const ball = state.ball;
  const away = normalize(p.moveDirX || rng.range(-1, 1), p.moveDirZ || rng.range(-1, 1));
  ball.state = 'loose';
  ball.owner = null;
  ball.shotBy = null;
  const power = rng.range(7, 13);
  ball.vx = away.x * power;
  ball.vz = away.z * power;
  ball.vy = rng.range(1.5, 4);
  ball.y = Math.max(1, ball.y);

  p.state = 'staggered';
  p.stagger = Math.max(p.stagger, 0.5);
  p.staggerTimer = 0.3;
  p.moveId = null;
  p.comboCount = 0;
  state.stats[side].turnovers++;
  state.stats[side].gradePoints -= 0.4;
  state.events.push({ type: 'turnover', side, reason: 'strip' });
  return true;
}

function tryDribbleMove(state: MatchState, side: Side, moveId: DribbleMoveId, input: PlayerInput, rng: Rng): void {
  const p = state.players[side];
  const def = MOVE_BY_ID[moveId];
  if (!def) return;
  if (p.cfg.attrs[def.gate] < def.requires) return;
  if (p.stamina < def.staminaCost * 1.5) return;

  const dir = normalize(input.moveDirX || p.vx || 1, input.moveDirZ || p.vz || 0);

  // Which side the ball ends up on. A crossover and a behind-the-back go to the
  // side you aimed at; through-the-legs simply alternates, so repeated presses
  // send it back and forth.
  const rightX = Math.sin(p.facing + Math.PI / 2);
  const rightZ = -Math.cos(p.facing + Math.PI / 2);
  const aimedRight = dir.x * rightX + dir.z * rightZ >= 0 ? 1 : -1;
  if (moveId === 'crossover' || moveId === 'doubleCross' || moveId === 'behindBack') {
    p.dribbleHand = aimedRight as -1 | 1;
  } else if (moveId === 'betweenLegs') {
    p.dribbleHand = -p.dribbleHand as -1 | 1;
  }

  p.state = 'moveLock';
  p.moveId = moveId;
  p.moveTimer = 0;
  p.fumbleChecked = false;
  const tightHandles = badgeLevel(p.cfg.badges, 'tightHandles');
  p.moveDuration = def.duration * (1 - tightHandles * 0.16) * moveTempo(p);
  p.moveDirX = dir.x;
  p.moveDirZ = dir.z;
  p.comboCount++;
  p.comboTimer = 0.9;

  const handlesForDays = badgeLevel(p.cfg.badges, 'handlesForDays');
  p.stamina = clamp01(p.stamina - def.staminaCost * (1 - handlesForDays * 0.45) * staminaDrainMult(p));

  state.events.push({ type: 'move', side, move: moveId });
  awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'sizeUp', moveId === 'sizeUp' ? 1 : 0.25);
  if (p.comboCount >= 2) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'comboChain', 0.5);
  if (p.comboCount >= 4) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'moveChainLong', 1);

  resolveAnkleBreaker(state, side, def.ankleBase, def.misdirection, dir, rng);
}

function resolveAnkleBreaker(
  state: MatchState,
  side: Side,
  base: number,
  misdirection: number,
  dir: { x: number; z: number },
  rng: Rng,
): void {
  const p = state.players[side];
  const d = state.players[other(side)];
  const dist = Math.hypot(d.x - p.x, d.z - p.z);
  if (dist > 8) return;

  // The defender is punished for carrying momentum the wrong way.
  const defSpeed = Math.hypot(d.vx, d.vz);
  const wrongWay = defSpeed > 1 ? clamp01(-(d.vx * dir.x + d.vz * dir.z) / Math.max(1, defSpeed)) : 0.25;

  const handle = p.cfg.attrs.ballHandle + badgeLevel(p.cfg.badges, 'ankleTaker') * 22;
  const guard = d.cfg.attrs.perimeterDefense + badgeLevel(d.cfg.badges, 'clamps') * 20;
  const ratio = handle / (handle + guard);

  const proximity = clamp01(1 - dist / 8);
  const comboBonus = Math.min(3, p.comboCount) * 0.035;
  const chance = clamp01(base * misdirection * (0.35 + ratio * 1.6) * (0.4 + wrongWay) * (0.45 + proximity) + comboBonus);

  if (rng.chance(chance)) {
    const severity = clamp01(0.55 + ratio * 0.6 + wrongWay * 0.3);
    d.ankledStreak++;
    d.ankledResetIn = 6;

    // First time you break him down he is frozen for a beat. Do it again inside
    // the window and the legs go completely: three seconds on the floor.
    const floored = d.ankledStreak >= 2;
    if (floored) {
      d.ankledStreak = 0;
      d.ankledResetIn = 0;
      d.state = 'fallen';
      d.stateTimer = 3;
      d.staggerTimer = 3;
      d.stagger = 1;
      d.vx = 0;
      d.vz = 0;
      d.handUp = false;
      d.contestTimer = 0;
    } else {
      // A dead stop, not a slow-down — he is caught leaning the wrong way.
      d.staggerTimer = 1;
      d.stagger = 1;
      d.state = 'staggered';
      d.vx = 0;
      d.vz = 0;
      d.handUp = false;
    }
    void severity;
    state.stats[side].ankleBreakers++;
    state.stats[side].gradePoints += floored ? 1.1 : 0.6;
    state.events.push({ type: 'ankleBreaker', side, floored });
    awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'ankleBreaker', 1);
    awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'blowBy', 0.5);
  }
}


/**
 * Whether this build can get up for a dunk at all. The bar is deliberately low
 * — a starting build sits in the 30s and 40s, and gating dunks behind ratings
 * it takes hours to earn just made the button do nothing. Difficulty lives in
 * the green window instead, which is driven by the Dunk rating: a 40 gets a
 * sliver, a 90 gets a real target.
 */
function canDunkNow(state: MatchState, side: Side): boolean {
  const p = state.players[side];
  return (
    distanceToRim(p.x, p.z) < 11 &&
    p.cfg.attrs.dunk >= 38 &&
    p.cfg.attrs.vertical >= 35 &&
    p.stamina > 0.1
  );
}

/**
 * A dunk taken at somebody who has left their feet at you is a contact dunk —
 * the poster. It needs a package that can do it and the strength to finish it.
 */
function dunkTypeFor(state: MatchState, side: Side): ShotType {
  const p = state.players[side];
  const d = state.players[other(side)];
  const pkg = DUNK_PACKAGE_BY_ID[p.cfg.dunkPackageId] ?? DUNK_PACKAGE_BY_ID['basic-slam'];
  const defDist = Math.hypot(d.x - p.x, d.z - p.z);
  const contesting = d.y > 0.4 || d.state === 'contesting';
  return pkg.contactCapable && contesting && defDist < 4.2 ? 'contactDunk' : 'dunk';
}

// -------------------------------------------------------------------- shots

function buildShotProfile(state: MatchState, side: Side, shotType: ShotType): ShotProfile {
  const p = state.players[side];
  const d = state.players[other(side)];
  const dist = distanceToRim(p.x, p.z);
  const three = isBeyondArc(p.x, p.z);
  const defDist = Math.hypot(d.x - p.x, d.z - p.z);
  const toShooter = normalize(p.x - d.x, p.z - d.z);
  const defFacing = Math.sin(d.facing) * toShooter.x + -Math.cos(d.facing) * toShooter.z;
  const interior = dist < 9;

  const contest = computeContest({
    defenderDistance: defDist,
    defenderHandUp: d.handUp || d.state === 'contesting',
    defenderAirborne: d.y > 0.3,
    defenderFacing: defFacing,
    defenderStagger: d.stagger,
    shooterHeightAdv: p.cfg.heightIn - d.cfg.heightIn,
    interiorShot: interior,
    defenderAttrs: d.cfg.attrs,
    defenderBadges: d.cfg.badges,
  });

  const scoreDiff = Math.abs(state.score[0] - state.score[1]);
  const nearWin = Math.max(state.score[0], state.score[1]) >= state.config.targetScore - 1;

  return computeShotProfile({
    attrs: p.cfg.attrs,
    badges: p.cfg.badges,
    jumpshotId: p.cfg.jumpshotId,
    shotType,
    distance: dist,
    isThree: three,
    contest,
    stamina: p.stamina,
    driftSpeed: Math.hypot(p.vx, p.vz),
    greenStreak: p.greenStreak,
    makeStreak: p.makeStreak,
    clutch: nearWin || scoreDiff <= 1,
    heightDelta: d.cfg.heightIn - p.cfg.heightIn,
  });
}

function startShot(state: MatchState, side: Side, shotType: ShotType): void {
  const p = state.players[side];
  p.state = 'shooting';
  p.shotElapsed = 0;
  p.shotType = shotType;
  p.shotFromX = p.x;
  p.shotFromZ = p.z;
  p.shotIsThree = isBeyondArc(p.x, p.z);
  p.shotDrift = Math.hypot(p.vx, p.vz);
  p.shotOnMoveKey = false;
  p.shotProfile = buildShotProfile(state, side, shotType);
  const isFinish = shotType === 'layup' || shotType === 'floater' || shotType === 'euroLayup';
  p.vy = Math.sqrt(2 * GRAVITY * jumpHeight(p) * (isFinish ? 0.72 : 0.5));
  p.y = 0.001;
  p.stamina = clamp01(p.stamina - 0.022 * staminaDrainMult(p));
}

function releaseShot(state: MatchState, side: Side, rng: Rng): void {
  const p = state.players[side];
  const d = state.players[other(side)];
  const profile = p.shotProfile ?? buildShotProfile(state, side, p.shotType);
  const releasePoint = clamp(p.shotElapsed / profile.meterDuration, 0, 1.4);

  p.state = 'airborne';
  p.shotProfile = null;

  // Block check at the release point, then a foul check on what got through.
  const interior = distanceToRim(p.x, p.z) < 9;
  if (tryBlock(state, other(side), side, rng, false)) return;
  if (tryFoul(state, other(side), side, rng, interior)) return;

  const three = p.shotIsThree;
  const result = resolveShot(profile, releasePoint, rng.next(), three);
  const value = shotValue(p.shotFromX, p.shotFromZ);

  const stats = state.stats[side];
  stats.fga++;
  if (three) stats.tpa++;
  if (result.grade === 'green') {
    stats.greens++;
    p.greenStreak++;
  } else {
    p.greenStreak = 0;
  }

  state.events.push({
    type: 'shotRelease',
    side,
    grade: result.grade,
    made: result.made,
    value,
    timingError: result.timingError,
    shotType: p.shotType,
  });

  // A greened dunk earns the cutaway. A poster is one taken over a body.
  const isDunk = p.shotType === 'dunk' || p.shotType === 'contactDunk';
  if (isDunk && result.made && isAutomatic(result.grade)) {
    // What makes it a poster is that somebody was actually in the way — close,
    // and between you and the rim when you went up. It used to also require the
    // defender to have left his feet, so a man standing his ground under the
    // basket got you the ordinary animation: measured at 0% posters against a
    // defender planted directly in your path. Standing there and wearing it is
    // the most posterisable thing in basketball.
    const dx = d.x - p.shotFromX;
    const dz = d.z - p.shotFromZ;
    const defDist = Math.hypot(dx, dz);
    const toRim = normalize(COURT.rimX - p.shotFromX, COURT.rimZ - p.shotFromZ);
    const inFront = defDist > 0.01 ? (toRim.x * dx + toRim.z * dz) / defDist : 1;
    const inTheWay = defDist < 6.5 && inFront > 0.2;
    const posterized = p.shotType === 'contactDunk' || inTheWay || (profile.heavilyContested && d.y > 0.3);
    if (posterized) {
      state.stats[side].contactDunks++;
      awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'contactDunk', 2);
    }
    state.events.push({
      type: 'dunkHighlight',
      side,
      packageId: p.cfg.dunkPackageId,
      posterized,
      value,
    });
    if (posterized) {
      // Being posterised is its own punishment: you land badly.
      d.state = 'fallen';
      d.stateTimer = 1.2;
      d.staggerTimer = 1.2;
      d.stagger = 1;
    }
  }

  // Badge feed.
  const attrs = p.cfg.attrs;
  const badges = p.cfg.badges;
  if (result.made) {
    awardBadgeProgress(badges, attrs, 'anyMake', 1);
    if (profile.heavilyContested) awardBadgeProgress(badges, attrs, 'contestedMake', 1.5);
    if (p.shotDrift < 1.5) awardBadgeProgress(badges, attrs, 'setMake', 1);
    else awardBadgeProgress(badges, attrs, 'movingMake', 1);
    if (p.shotType === 'stepback' || p.shotType === 'fade') awardBadgeProgress(badges, attrs, 'stepbackMake', 1.5);
    if (p.shotType === 'hopJumper') awardBadgeProgress(badges, attrs, 'hopFinish', 1.5);
    if (distanceToRim(p.shotFromX, p.shotFromZ) > 27) awardBadgeProgress(badges, attrs, 'deepMake', 2);
    if (p.stamina < 0.4) awardBadgeProgress(badges, attrs, 'tiredMake', 1.5);
    if (p.makeStreak >= 2) awardBadgeProgress(badges, attrs, 'streakMake', 1);
    if (p.greenStreak >= 2) awardBadgeProgress(badges, attrs, 'greenStreak', 1);
    const nearWin = Math.max(state.score[0], state.score[1]) >= state.config.targetScore - 2;
    if (nearWin) awardBadgeProgress(badges, attrs, 'clutchMake', 2);
    if (p.shotType === 'layup' || p.shotType === 'floater') awardBadgeProgress(badges, attrs, 'layupMake', 1);
    if (p.shotType === 'euroLayup') awardBadgeProgress(badges, attrs, 'euroFinish', 1.5);
  }
  if (profile.heavilyContested) {
    awardBadgeProgress(d.cfg.badges, d.cfg.attrs, distanceToRim(p.x, p.z) < 9 ? 'rimContest' : 'smother', 1);
  }

  launchBall(state, side, result.made, value, result.timingError, rng);
  state.ball.shotGrade = result.grade;
}


/** True for the two shot types that go up at the rim rather than toward it. */
function isDunkShot(type: ShotType): boolean {
  return type === 'dunk' || type === 'contactDunk';
}

function launchBall(
  state: MatchState,
  side: Side,
  made: boolean,
  value: 1 | 2,
  timingError: number,
  rng: Rng,
): void {
  const p = state.players[side];
  const ball = state.ball;
  const dist = distanceToRim(p.x, p.z);

  ball.state = 'shot';
  ball.owner = null;
  ball.shotBy = side;
  ball.shotWillGoIn = made;
  ball.shotValue = value;
  ball.settled = false;
  ball.flightTime = 0;
  ball.flightDuration = 0.62 + dist * 0.028;

  ball.fromX = p.x;
  ball.fromZ = p.z;
  ball.fromY = reachHeight(p) * 0.94;

  if (made) {
    ball.toX = COURT.rimX;
    ball.toZ = COURT.rimZ;
    ball.toY = COURT.rimY - 0.2;
  } else {
    // Early releases fly long, late releases come up short. Wild misses stray
    // sideways too, so a bad shot reads instantly.
    const longShort = clamp(-timingError * 9, -1.5, 1.5);
    const lateral = rng.range(-1, 1) * (0.7 + Math.abs(timingError) * 4.5);
    const toRim = normalize(COURT.rimX - p.x, COURT.rimZ - p.z);
    ball.toX = COURT.rimX + toRim.x * longShort * 1.5 + -toRim.z * lateral;
    ball.toZ = COURT.rimZ + toRim.z * longShort * 1.5 + toRim.x * lateral;
    ball.toY = COURT.rimY + rng.range(-0.3, 0.5);
  }
  ball.apex = Math.max(ball.fromY, COURT.rimY) + 2.4 + dist * 0.16;
}

// ------------------------------------------------------------------ finishes

function startFinish(state: MatchState, side: Side, rng: Rng): void {
  const p = state.players[side];
  const d = state.players[other(side)];
  const dist = distanceToRim(p.x, p.z);
  const defDist = Math.hypot(d.x - p.x, d.z - p.z);

  const pkg = DUNK_PACKAGE_BY_ID[p.cfg.dunkPackageId] ?? DUNK_PACKAGE_BY_ID['basic-slam'];
  // Dunks need rim proximity and either a gather of speed or a standing
  // leaper's rating from right under the basket.
  const gather = Math.hypot(p.vx, p.vz);
  const canDunk =
    dist < 8 &&
    p.cfg.attrs.dunk >= 60 &&
    p.cfg.attrs.vertical >= 55 &&
    p.stamina > 0.2 &&
    (gather > 3.2 || (dist < 4.5 && p.cfg.attrs.dunk >= 72));

  if (canDunk) {
    const contactRoll =
      pkg.contactCapable && defDist < 3.4
        ? (p.cfg.attrs.dunk * 0.5 + p.cfg.attrs.strength * 0.3 + p.cfg.attrs.vertical * 0.2 +
            badgeLevel(p.cfg.badges, 'contactFinisher') * 25) /
          (d.cfg.attrs.interiorDefense * 0.55 + d.cfg.attrs.strength * 0.45 + badgeLevel(d.cfg.badges, 'rimProtector') * 22 + 40)
        : 0;
    const contact = contactRoll > 0 && rng.chance(clamp01((contactRoll - 0.6) * 1.8));
    p.shotType = contact ? 'contactDunk' : 'dunk';
    p.state = 'finishing';
    p.stateTimer = contact ? pkg.duration : pkg.duration * 0.85;
    p.vy = Math.sqrt(2 * GRAVITY * jumpHeight(p));
    p.y = 0.001;
    p.stamina = clamp01(p.stamina - 0.06 * staminaDrainMult(p));
    if (contact) {
      d.staggerTimer = 0.7;
      d.stagger = 1;
      d.state = 'staggered';
    }
  } else {
    const euro = p.moveId === 'euro';
    startShot(state, side, euro ? 'euroLayup' : dist < 4.5 ? 'layup' : 'floater');
    return;
  }
  p.shotFromX = p.x;
  p.shotFromZ = p.z;
  p.shotIsThree = false;
}

function completeFinish(state: MatchState, side: Side, rng: Rng): void {
  const p = state.players[side];
  const d = state.players[other(side)];
  p.state = 'airborne';

  if (tryBlock(state, other(side), side, rng, true)) return;
  if (tryFoul(state, other(side), side, rng, true)) return;

  const contact = p.shotType === 'contactDunk';
  const defDist = Math.hypot(d.x - p.x, d.z - p.z);
  const rimPressure = clamp01(1 - defDist / 6) * (d.y > 0.4 ? 1.2 : 0.75);
  const noFear = badgeLevel(p.cfg.badges, 'noFear');
  const base = contact ? 0.97 : 0.9;
  const chance = clamp01(
    base -
      rimPressure * 0.32 * (1 - noFear * 0.5) +
      (p.cfg.attrs.dunk - 70) / 300 +
      badgeLevel(p.cfg.badges, 'riseUp') * 0.06,
  );
  const made = rng.chance(chance);

  const stats = state.stats[side];
  stats.fga++;
  if (contact) stats.contactDunks++;

  state.events.push({
    type: 'shotRelease',
    side,
    grade: made ? 'green' : 'late',
    made,
    value: 1,
    timingError: 0,
    shotType: p.shotType,
  });
  state.events.push(contact ? { type: 'contactDunk', side } : { type: 'dunk', side });

  awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'dunkMake', 1);
  if (contact) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'contactDunk', 2);
  if (defDist < 4) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'contestedFinish', 1.5);
  if (d.cfg.heightIn > p.cfg.heightIn) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'finishOverTaller', 1.5);

  launchBall(state, side, made, 1, 0, rng);
  state.ball.flightDuration = 0.34;
  state.ball.shotGrade = made ? 'green' : 'late';
}

// -------------------------------------------------------------------- blocks

function tryBlock(state: MatchState, defSide: Side, offSide: Side, rng: Rng, atRim: boolean): boolean {
  const d = state.players[defSide];
  const p = state.players[offSide];
  if (d.y < 0.35) return false;

  const dx = p.x - d.x;
  const dz = p.z - d.z;
  const dist = Math.hypot(dx, dz);
  const chaseReach = badgeLevel(d.cfg.badges, 'chaseDownArtist');
  const maxReach = 3.6 + (d.cfg.wingspanIn - d.cfg.heightIn) / 12 + chaseReach * 1.6;
  if (dist > maxReach) return false;

  // Chase-down: defender is trailing from further out and closing hard.
  const defToRim = distanceToRim(d.x, d.z);
  const offToRim = distanceToRim(p.x, p.z);
  const chaseDown = defToRim > offToRim + 1.5 && Math.hypot(d.vx, d.vz) > 8 && atRim;

  const reachAdvantage = reachHeight(d) - reachHeight(p);
  const blockPower =
    d.cfg.attrs.block * 0.55 +
    d.cfg.attrs.vertical * 0.25 +
    (atRim ? d.cfg.attrs.interiorDefense : d.cfg.attrs.perimeterDefense) * 0.2 +
    badgeLevel(d.cfg.badges, 'anchor') * 12 +
    (chaseDown ? chaseReach * 26 : 0);
  const escapePower = p.cfg.attrs.layup * 0.3 + p.cfg.attrs.dunk * 0.3 + p.cfg.attrs.strength * 0.4 + 42;

  let chance = clamp01(
    (blockPower / (blockPower + escapePower) - 0.34) * (atRim ? 1.25 : 0.55) * clamp01(1 - dist / maxReach) +
      reachAdvantage * 0.05,
  );
  chance = clamp01(chance * (1 - d.stagger));

  if (!rng.chance(chance)) return false;

  const ball = state.ball;
  state.stats[defSide].blocks++;
  state.stats[defSide].gradePoints += 0.8;
  if (chaseDown) state.stats[defSide].chaseDownBlocks++;
  state.events.push({ type: 'block', side: defSide, chaseDown });
  awardBadgeProgress(d.cfg.badges, d.cfg.attrs, 'block', 1.5);
  if (chaseDown) awardBadgeProgress(d.cfg.badges, d.cfg.attrs, 'chaseDownBlock', 3);
  p.greenStreak = 0;
  p.makeStreak = 0;

  if (!state.config.instantInbound) {
    // A block is a stop, always: the ball goes to whoever swatted it. Only a
    // miss goes to the glass — you have to earn a block, so it should not turn
    // into a scramble the shooter can win back.
    changePossession(state, defSide, 'block');
  } else {
    ball.state = 'loose';
    ball.owner = null;
    ball.x = p.x;
    ball.z = p.z;
    ball.y = Math.max(6, reachHeight(d) * 0.85);
    const away = normalize(rng.range(-1, 1), rng.range(-0.2, 1));
    const power = chaseDown ? 22 : 14;
    ball.vx = away.x * power;
    ball.vz = away.z * power;
    ball.vy = 6;
  }
  return true;
}

/**
 * Hands the ball to `to` and resets for a check-ball. Used by the possession
 * ruleset for misses, blocks and strips.
 */
function changePossession(state: MatchState, to: Side, reason: 'miss' | 'block' | 'steal'): void {
  void reason;
  state.ball.state = 'dead';
  state.ball.owner = null;
  state.ball.shotBy = null;
  state.ball.shotGrade = null;
  state.phase = 'deadball';
  state.phaseTimer = 0.85;
  state.possession = to;
  state.events.push({ type: 'phase', phase: 'deadball' });
}

// -------------------------------------------------------------------- steals

function attemptSteal(state: MatchState, defSide: Side, rng: Rng): void {
  const d = state.players[defSide];
  const p = state.players[other(defSide)];
  if (state.ball.owner !== p.side) return;

  const dist = Math.hypot(p.x - d.x, p.z - d.z);
  // Reaching in is now a real decision rather than something you hold down. A
  // single reach lands far more often than it used to, so the gap between them
  // has to be long enough that spamming is worse than picking a moment.
  d.stealCooldown = 1.5;
  d.state = 'stealing';
  d.stateTimer = STEAL_TIME;

  // The ball is not available mid-emote. Reaching in while someone is showboating
  // gets you nothing but the recovery time, which is the trade: he loses tempo
  // off the shot clock, you lose position for a beat.
  if (p.state === 'emoting') {
    d.staggerTimer = 0.32;
    d.stagger = 0.6;
    return;
  }

  const reach = 3.2 + (d.cfg.wingspanIn - d.cfg.heightIn) / 12;
  if (dist > reach) return;

  const pickPocket = badgeLevel(d.cfg.badges, 'pickPocket');
  const unpluckable = badgeLevel(p.cfg.badges, 'unpluckable');
  // Mid-animation handles are the most vulnerable.
  const exposure = p.state === 'moveLock' ? 1.3 : p.state === 'shooting' ? 0.6 : 1;
  const stealPower = d.cfg.attrs.steal * (1 + pickPocket * 0.3);
  const holdPower = p.cfg.attrs.ballHandle * (1 + unpluckable * 0.35) + p.cfg.attrs.strength * 0.25;
  // Distance used to fall off linearly to nothing at the edge of the reach,
  // which made anything past arm's length worth about 1%. It now holds up until
  // the last foot or so, so closing to within a stride is what matters rather
  // than being exactly on top of him.
  const closeness = clamp01(1 - (dist / reach) ** 2 * 0.82);
  const chance = clamp01(
    (stealPower / (stealPower + holdPower) - 0.28) * 1.8 * exposure * closeness * (1 - d.stagger),
  );

  if (rng.chance(chance)) {
    state.ball.owner = defSide;
    state.ball.state = 'held';
    state.stats[defSide].steals++;
    state.stats[defSide].gradePoints += 0.7;
    state.stats[p.side].turnovers++;
    state.stats[p.side].gradePoints -= 0.6;
    state.events.push({ type: 'steal', side: defSide });
    awardBadgeProgress(d.cfg.badges, d.cfg.attrs, 'steal', 2);
    state.possession = defSide;
    state.needsClear = true;
    state.shotClock = state.config.shotClock;
    p.greenStreak = 0;
    // Getting stripped knocks you off balance. Without this the ball simply
    // changed hands and the handler carried on as if nothing had happened.
    p.staggerTimer = 0.3;
    p.stagger = 0.7;
    p.state = 'staggered';
  } else {
    // Reach-in leaves the defender out of position.
    d.staggerTimer = 0.3;
    d.stagger = 0.8;
    d.stealCooldown = 2.4;
    awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'stealDefended', 1);
  }
}

// ---------------------------------------------------------------------- ball

function updateBall(state: MatchState, dt: number, rng: Rng): void {
  const ball = state.ball;

  if (ball.state === 'held' && ball.owner !== null) {
    const p = state.players[ball.owner];
    placeHeldBall(state, p, ball);
    ball.vx = ball.vy = ball.vz = 0;
    return;
  }

  if (ball.state === 'shot') {
    ball.flightTime += dt;
    const t = clamp01(ball.flightTime / ball.flightDuration);
    ball.x = lerp(ball.fromX, ball.toX, t);
    ball.z = lerp(ball.fromZ, ball.toZ, t);
    // Parabola through (0, fromY), apex at t=0.55, (1, toY).
    const arc = 4 * (ball.apex - (ball.fromY + ball.toY) / 2) * t * (1 - t);
    ball.y = lerp(ball.fromY, ball.toY, t) + arc;

    if (t >= 1) {
      if (ball.shotWillGoIn) {
        scoreBasket(state, ball.shotBy as Side, ball.shotValue);
      } else if (state.config.turnoverOnMiss) {
        // Possession rules: you miss, they get the ball.
        const shooter = state.players[ball.shotBy as Side];
        shooter.makeStreak = 0;
        state.events.push({ type: 'miss', side: ball.shotBy as Side });
        changePossession(state, other(ball.shotBy as Side), 'miss');
      } else if (ball.shotBy !== null && isDunkShot(state.players[ball.shotBy].shotType) && !state.config.instantInbound) {
        // A missed dunk does not roll off gently — it clangs off the iron and
        // goes straight up, and comes down as a live ball.
        const off = normalize(ball.x - COURT.rimX + rng.range(-0.5, 0.5), ball.z - COURT.rimZ + rng.range(-0.5, 0.5));
        ball.state = 'loose';
        ball.x = COURT.rimX + off.x * 0.7;
        ball.z = COURT.rimZ + off.z * 0.7;
        ball.y = COURT.rimY;
        ball.vx = off.x * rng.range(3, 7);
        ball.vz = off.z * rng.range(3, 7);
        ball.vy = rng.range(14, 19);
        state.events.push({ type: 'miss', side: ball.shotBy as Side });
        state.players[ball.shotBy as Side].makeStreak = 0;
      } else if (state.config.instantInbound) {
        // Practice: the ball is back in your hands the moment it misses. There
        // is no drill in chasing a carom across an empty gym.
        const shooter = state.players[ball.shotBy as Side];
        shooter.makeStreak = 0;
        state.events.push({ type: 'miss', side: ball.shotBy as Side });
        returnBallTo(state, ball.shotBy as Side);
      } else {
        // Rim carom. Direction is derived from where the shot landed relative
        // to the rim so long misses bounce long.
        const off = normalize(ball.x - COURT.rimX + rng.range(-0.4, 0.4), ball.z - COURT.rimZ + rng.range(-0.4, 0.4));
        ball.state = 'loose';
        ball.x = COURT.rimX + off.x * 0.9;
        ball.z = COURT.rimZ + off.z * 0.9;
        ball.y = COURT.rimY - 0.4;
        // Off the iron and up. A long miss caroms out, a short one sits up over
        // the rim — either way it hangs high enough that going up and taking it
        // out of the air is a real option.
        const power = rng.range(4, 9);
        ball.vx = off.x * power;
        ball.vz = off.z * power;
        ball.vy = rng.range(7, 12);
        state.events.push({ type: 'miss', side: ball.shotBy as Side });
        const shooter = state.players[ball.shotBy as Side];
        shooter.makeStreak = 0;
      }
    }
    return;
  }

  if (ball.state === 'loose') {
    ball.vy -= GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.y += ball.vy * dt;
    if (ball.y <= 0.4) {
      ball.y = 0.4;
      ball.vy = Math.abs(ball.vy) * 0.62;
      ball.vx *= 0.82;
      ball.vz *= 0.82;
      if (Math.abs(ball.vy) < 1.6) ball.vy = 0;
    }
    // Walls keep the ball live in a 1v1 halfcourt.
    if (Math.abs(ball.x) > COURT.halfWidth - 1) {
      ball.x = Math.sign(ball.x) * (COURT.halfWidth - 1);
      ball.vx *= -0.6;
    }
    if (ball.z < 0.8) {
      ball.z = 0.8;
      ball.vz *= -0.6;
    }
    if (ball.z > COURT.playDepth) {
      ball.z = COURT.playDepth;
      ball.vz *= -0.6;
    }
    tryCollect(state, rng);
  }
}


/**
 * Where the ball sits in the handler's hands. Dribble moves drive it explicitly
 * so a between-the-legs actually goes between the legs and a crossover really
 * whips across — the animation is the move, not a decoration on top of it.
 */
function placeHeldBall(state: MatchState, p: SimPlayer, ball: Ball): void {
  const rightX = Math.sin(p.facing + Math.PI / 2);
  const rightZ = -Math.cos(p.facing + Math.PI / 2);
  const fwdX = -Math.sin(p.facing);
  const fwdZ = Math.cos(p.facing);

  if (p.state === 'shooting' || p.state === 'finishing') {
    ball.x = p.x + rightX * 0.35;
    ball.z = p.z + rightZ * 0.35;
    ball.y = reachHeight(p) * 0.9;
    return;
  }

  if (p.state === 'emoting') {
    // Held out to one side on a lazy bounce, which is the whole look of it —
    // and it is still yours, nobody can take it while this is running.
    const bounce = Math.abs(Math.sin(p.emoteTimer * 7.5));
    ball.x = p.x + rightX * 1.25 + fwdX * 0.3;
    ball.z = p.z + rightZ * 1.25 + fwdZ * 0.3;
    ball.y = 0.45 + bounce * 2.1;
    return;
  }

  if (p.state === 'moveLock' && p.moveId) {
    const t = clamp01(p.moveTimer / Math.max(0.001, p.moveDuration));
    const arc = Math.sin(t * Math.PI);
    switch (p.moveId) {
      case 'betweenLegs': {
        // Through the legs, hand to hand: it starts where the ball actually is
        // and finishes in the other hand, so pressing it again sends it back.
        const from = -p.dribbleHand;
        const lateral = Math.cos(t * Math.PI) * 0.95 * from;
        ball.x = p.x + rightX * lateral + fwdX * 0.15;
        ball.z = p.z + rightZ * lateral + fwdZ * 0.15;
        // Down through the legs at the midpoint, back up to the hand.
        ball.y = 0.4 + Math.abs(Math.cos(t * Math.PI)) * 1.9;
        return;
      }
      case 'crossover':
      case 'doubleCross': {
        // A crossover is a lie: the ball goes to the fake side first and then
        // whips across, low and fast, to the side you are actually going.
        const swings = p.moveId === 'doubleCross' ? 2 : 1;
        const go = p.dribbleHand; // set to the go-side when the move started
        const lateral = -Math.cos(t * Math.PI * swings) * 1.35 * go;
        ball.x = p.x + rightX * lateral + fwdX * 0.75;
        ball.z = p.z + rightZ * lateral + fwdZ * 0.75;
        ball.y = 0.5 + Math.abs(Math.sin(t * Math.PI * swings)) * 1.5;
        return;
      }
      case 'hesitation': {
        // Ball comes up over the head with the shooting motion — that is the
        // whole point of a hesi, and it is what the defender has to read.
        ball.x = p.x + rightX * 0.2;
        ball.z = p.z + rightZ * 0.2;
        ball.y = 1.6 + arc * (reachHeight(p) * 0.95 - 1.6);
        return;
      }
      case 'behindBack': {
        const lateral = Math.cos(t * Math.PI) * 1.1 * -p.dribbleHand;
        ball.x = p.x + rightX * lateral - fwdX * 0.9;
        ball.z = p.z + rightZ * lateral - fwdZ * 0.9;
        ball.y = 1.1 + arc * 1.1;
        return;
      }
      case 'spin': {
        const around = t * Math.PI * 2;
        ball.x = p.x + Math.sin(p.facing + around) * 1.0;
        ball.z = p.z - Math.cos(p.facing + around) * 1.0;
        ball.y = 2.2 + arc * 0.5;
        return;
      }
      default: {
        const lateral = Math.cos(t * Math.PI * 2) * 0.8;
        ball.x = p.x + rightX * lateral;
        ball.z = p.z + rightZ * lateral;
        ball.y = 1.0 + Math.abs(Math.sin(t * Math.PI * 3)) * 1.6;
        return;
      }
    }
  }

  // Resting dribble, in whichever hand the last move left it. The bob is tied
  // to how fast you can actually handle it, so a slow handle pounds it slowly.
  const tempo = 6.5 + (p.cfg.attrs.speedWithBall / 99) * 6;
  const bob = p.state === 'dribble' ? Math.abs(Math.sin(state.time * tempo)) * 2.2 + 1.4 : 3.2;
  ball.x = p.x + rightX * 0.9 * p.dribbleHand;
  ball.z = p.z + rightZ * 0.9 * p.dribbleHand;
  ball.y = bob;
}

function tryCollect(state: MatchState, rng: Rng): void {
  const ball = state.ball;
  const candidates: { side: Side; weight: number }[] = [];

  for (const side of [0, 1] as Side[]) {
    const p = state.players[side];
    const dist = Math.hypot(ball.x - p.x, ball.z - p.z);
    const boardBadge = badgeLevel(p.cfg.badges, 'reboundChaser');
    // Chasing your own miss is an offensive board; everything else is defensive.
    const boardRating = ball.shotBy === side ? p.cfg.attrs.offensiveRebound : p.cfg.attrs.defensiveRebound;
    const grabRadius = 2.0 + (boardRating / 99) * 1.4 + boardBadge * 0.9;
    const reach = reachHeight(p) + 0.6;
    if (dist <= grabRadius && ball.y <= reach && p.stagger < 0.7) {
      const weight =
        boardRating * 0.55 +
        p.cfg.attrs.vertical * 0.2 +
        p.cfg.attrs.strength * 0.15 +
        (p.cfg.heightIn - 72) * 0.6 +
        badgeLevel(p.cfg.badges, 'boxOut') * 18 +
        (p.y > 0.4 ? 12 : 0);
      candidates.push({ side, weight: Math.max(1, weight) });
    }
  }

  if (candidates.length === 0) return;

  let winner: Side;
  if (candidates.length === 1) {
    winner = candidates[0].side;
  } else {
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    winner = rng.next() * total < candidates[0].weight ? candidates[0].side : candidates[1].side;
    const loser = state.players[other(winner)];
    awardBadgeProgress(loser.cfg.badges, loser.cfg.attrs, 'boxOut', 0.5);
  }

  const p = state.players[winner];
  const wasShooter = ball.shotBy;
  const offensive = wasShooter === winner;

  // Getting a hand on it is not the same as coming down with it. A weak board
  // man tips it away and has to go again; a strong one snatches it clean.
  const grabRating = offensive ? p.cfg.attrs.offensiveRebound : p.cfg.attrs.defensiveRebound;
  const secure =
    0.42 +
    clamp01((grabRating - 25) / 74) * 0.5 +
    badgeLevel(p.cfg.badges, 'boxOut') * 0.06 +
    (p.y > 0.4 ? 0.08 : 0) +
    clamp01((p.cfg.attrs.strength - 25) / 74) * 0.08;
  if (!rng.chance(clamp01(secure))) {
    // Bobbled. It squirts away and stays live.
    const away = normalize(ball.x - p.x + rng.range(-1, 1), ball.z - p.z + rng.range(-1, 1));
    ball.vx = away.x * rng.range(5, 9);
    ball.vz = away.z * rng.range(5, 9);
    ball.vy = rng.range(3, 6);
    ball.y = Math.max(ball.y, 2.5);
    return;
  }

  ball.state = 'held';
  ball.owner = winner;
  ball.shotBy = null;
  ball.shotGrade = null;

  state.stats[winner].rebounds++;
  state.stats[winner].gradePoints += offensive ? 0.5 : 0.35;
  state.events.push({ type: 'rebound', side: winner, offensive });
  awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'rebound', 1);
  if (offensive) awardBadgeProgress(p.cfg.badges, p.cfg.attrs, 'putback', 1);

  state.possession = winner;
  // A clear is owed on a change of possession, and an offensive rebound is not
  // one — it is the same possession continuing. Asking for a clear on your own
  // board was 35% of all clears, almost all of them taken about three feet from
  // the rim: you cleared, worked into the mid range, missed, grabbed your own
  // miss, and the game told you to go back out again.
  //
  // Practice modes have no scoring rules to protect, so they never ask for a
  // clear — that was the stray CLEAR THE BALL prompt in the gym after a fumble.
  state.needsClear = !state.config.instantInbound && !offensive;
  state.shotClock = state.config.shotClock;
}

// -------------------------------------------------------------- free throws

/**
 * A defender who leaves his feet into a finisher gives up a shooting foul.
 * Rates are deliberately low — fouls should punish a reckless contest, not
 * interrupt the flow of every possession.
 */
function tryFoul(state: MatchState, defSide: Side, offSide: Side, rng: Rng, atRim: boolean): boolean {
  const d = state.players[defSide];
  const p = state.players[offSide];
  const dist = Math.hypot(p.x - d.x, p.z - d.z);
  if (dist > 3.4) return false;

  let chance = 0;
  if (d.y > 0.35) chance += atRim ? 0.17 : 0.08;
  if (dist < 2.0) chance += 0.05;
  if (d.stagger > 0.4) chance += 0.04; // beaten defenders grab
  if (chance <= 0) return false;

  // Discipline: a strong interior defender fouls less often on the same play.
  const discipline = clamp01((d.cfg.attrs.interiorDefense - 55) / 44) * 0.35 + badgeLevel(d.cfg.badges, 'immovable') * 0.25;
  chance *= 1 - discipline;

  if (!rng.chance(clamp01(chance))) return false;

  // Behind the arc is worth two at the stripe, inside it is worth one.
  const shots = isBeyondArc(p.x, p.z) ? 2 : 1;
  awardFreeThrows(state, offSide, defSide, shots);
  return true;
}

function awardFreeThrows(state: MatchState, offSide: Side, defSide: Side, shots: number): void {
  state.stats[offSide].foulsDrawn++;
  state.stats[defSide].foulsCommitted++;
  state.stats[defSide].gradePoints -= 0.25;
  state.events.push({ type: 'foul', on: offSide, by: defSide, shots });

  state.freeThrow = { side: offSide, remaining: shots };
  state.phase = 'freeThrow';
  state.phaseTimer = 1.1;
  state.possession = offSide;
  state.needsClear = false;
  state.events.push({ type: 'phase', phase: 'freeThrow' });

  setupFreeThrowPositions(state);
}

function setupFreeThrowPositions(state: MatchState): void {
  const shooterSide = state.freeThrow!.side;
  const shooter = state.players[shooterSide];
  const other_ = state.players[other(shooterSide)];

  shooter.x = 0;
  shooter.z = COURT.freeThrowZ;
  shooter.vx = shooter.vz = shooter.y = shooter.vy = 0;
  shooter.state = 'idle';
  shooter.stagger = 0;
  shooter.staggerTimer = 0;
  shooter.shotProfile = null;
  shooter.shotElapsed = 0;
  shooter.facing = Math.PI;

  other_.x = 7;
  other_.z = COURT.freeThrowZ - 6;
  other_.vx = other_.vz = other_.y = other_.vy = 0;
  other_.state = 'idle';
  other_.stagger = 0;
  other_.facing = 0;

  const ball = state.ball;
  ball.state = 'held';
  ball.owner = shooterSide;
  ball.shotBy = null;
  ball.shotGrade = null;
  // A trip to the line is also a breather.
  shooter.stamina = clamp01(shooter.stamina + 0.14);
  other_.stamina = clamp01(other_.stamina + 0.1);
}

function buildFreeThrowProfile(state: MatchState, side: Side): ShotProfile {
  const p = state.players[side];
  return computeShotProfile({
    attrs: p.cfg.attrs,
    badges: p.cfg.badges,
    jumpshotId: p.cfg.jumpshotId,
    shotType: 'freeThrow',
    distance: 15,
    isThree: false,
    // Nobody is allowed to contest a free throw, and the shooter is set.
    contest: 0,
    stamina: p.stamina,
    driftSpeed: 0,
    greenStreak: p.greenStreak,
    makeStreak: p.makeStreak,
    clutch: Math.max(state.score[0], state.score[1]) >= state.config.targetScore - 2,
    heightDelta: 0,
  });
}

function updateFreeThrow(state: MatchState, inputs: [PlayerInput, PlayerInput], dt: number, rng: Rng): void {
  const ft = state.freeThrow;
  if (!ft) {
    state.phase = 'live';
    return;
  }
  const shooter = state.players[ft.side];
  const input = inputs[ft.side];

  if (state.phaseTimer > 0) {
    state.phaseTimer -= dt;
    return;
  }

  // The ball is in the shooter's hands until the meter starts.
  if (shooter.state !== 'shooting') {
    if (input.shoot) {
      shooter.state = 'shooting';
      shooter.shotElapsed = 0;
      shooter.shotType = 'freeThrow';
      shooter.shotFromX = shooter.x;
      shooter.shotFromZ = shooter.z;
      shooter.shotIsThree = false;
      shooter.shotDrift = 0;
      shooter.shotProfile = buildFreeThrowProfile(state, ft.side);
    }
    state.ball.x = shooter.x + 0.8;
    state.ball.z = shooter.z;
    state.ball.y = 3.4;
    return;
  }

  shooter.shotElapsed += dt;
  shooter.shotProfile = buildFreeThrowProfile(state, ft.side);
  const profile = shooter.shotProfile;
  const forced = shooter.shotElapsed >= profile.meterDuration * 1.4;
  if (input.shoot && !forced) {
    state.ball.y = 3.4 + (shooter.shotElapsed / profile.meterDuration) * 3.2;
    return;
  }

  const releasePoint = clamp(shooter.shotElapsed / profile.meterDuration, 0, 1.4);
  const result = resolveShot(profile, releasePoint, rng.next(), false);

  shooter.state = 'idle';
  shooter.shotProfile = null;
  shooter.shotElapsed = 0;

  const stats = state.stats[ft.side];
  stats.fta++;
  if (result.grade === 'green') {
    stats.greens++;
    shooter.greenStreak++;
  } else {
    shooter.greenStreak = 0;
  }

  state.events.push({
    type: 'shotRelease',
    side: ft.side,
    grade: result.grade,
    made: result.made,
    value: 1,
    timingError: result.timingError,
    shotType: 'freeThrow',
  });

  ft.remaining--;
  state.events.push({ type: 'freeThrow', side: ft.side, made: result.made, remaining: ft.remaining });

  if (result.made) {
    stats.ftm++;
    stats.points++;
    state.score[ft.side] += 1;
    state.events.push({ type: 'score', side: ft.side, value: 1, score: [state.score[0], state.score[1]] });
    awardBadgeProgress(shooter.cfg.badges, shooter.cfg.attrs, 'anyMake', 0.5);

    const target = state.config.targetScore;
    const opp = state.score[other(ft.side)];
    if ((state.score[ft.side] >= target && state.score[ft.side] - opp >= state.config.winBy) || state.score[ft.side] >= state.config.maxScore) {
      state.freeThrow = null;
      finishGame(state, ft.side);
      return;
    }
  }

  if (ft.remaining > 0) {
    state.phaseTimer = 0.9;
    setupFreeThrowPositions(state);
    return;
  }

  // Last attempt resolved: a make keeps the ball (make it take it), a miss is
  // a live rebound off the rim.
  state.freeThrow = null;
  if (result.made) {
    state.phase = 'deadball';
    state.phaseTimer = 0.9;
    state.possession = state.config.makeItTakeIt ? ft.side : other(ft.side);
    state.events.push({ type: 'phase', phase: 'deadball' });
  } else if (state.config.turnoverOnMiss) {
    changePossession(state, other(ft.side), 'miss');
  } else {
    state.phase = 'live';
    state.shotClock = state.config.shotClock;
    const ball = state.ball;
    ball.state = 'loose';
    ball.owner = null;
    ball.shotBy = ft.side;
    ball.x = COURT.rimX + rng.range(-1, 1);
    ball.z = COURT.rimZ + rng.range(0.5, 2.5);
    ball.y = COURT.rimY - 0.5;
    ball.vx = rng.range(-6, 6);
    ball.vz = rng.range(3, 9);
    ball.vy = rng.range(2, 5);
    state.events.push({ type: 'phase', phase: 'live' });
  }
}

// ------------------------------------------------------------------- scoring

function scoreBasket(state: MatchState, side: Side, value: 1 | 2): void {
  const p = state.players[side];
  state.score[side] += value;
  const stats = state.stats[side];
  stats.points += value;
  stats.fgm++;
  if (value === 2) stats.tpm++;
  p.makeStreak++;
  stats.bestStreak = Math.max(stats.bestStreak, p.makeStreak);
  stats.gradePoints += value === 2 ? 0.9 : 0.6;
  state.players[other(side)].makeStreak = 0;

  state.events.push({ type: 'score', side, value, score: [state.score[0], state.score[1]] });

  // A three earns the celebration. It runs through the dead-ball beat before
  // the ball is checked back in, so it costs nothing and never delays play.
  if (value === 2) {
    p.celebration = 'three';
    p.celebrationTimer = THREE_CELEBRATION_TIME;
  }

  const ball = state.ball;
  ball.state = 'dead';
  ball.owner = null;
  ball.shotBy = null;

  const target = state.config.targetScore;
  const opp = state.score[other(side)];
  const won =
    (state.score[side] >= target && state.score[side] - opp >= state.config.winBy) ||
    state.score[side] >= state.config.maxScore;

  if (won) {
    finishGame(state, side);
    return;
  }

  if (state.config.instantInbound) {
    returnBallTo(state, state.config.makeItTakeIt ? side : other(side));
    return;
  }

  state.phase = 'deadball';
  state.phaseTimer = 1.0;
  state.possession = state.config.makeItTakeIt ? side : other(side);
  state.events.push({ type: 'phase', phase: 'deadball' });
}

/**
 * Puts the ball straight back in a player's hands where they stand and keeps
 * play live. Practice modes only — a game always restarts from a check.
 */
function returnBallTo(state: MatchState, side: Side): void {
  const p = state.players[side];
  const ball = state.ball;
  ball.state = 'held';
  ball.owner = side;
  ball.shotBy = null;
  ball.shotGrade = null;
  ball.shotWillGoIn = false;
  ball.settled = false;
  ball.vx = ball.vy = ball.vz = 0;
  if (p.state !== 'staggered') p.state = 'dribble';
  state.possession = side;
  state.needsClear = false;
  state.shotClock = state.config.shotClock;
  state.phase = 'live';
}

function turnover(state: MatchState, side: Side, reason: 'shotClock' | 'outOfBounds' | 'strip'): void {
  state.stats[side].turnovers++;
  state.stats[side].gradePoints -= 0.5;
  state.events.push({ type: 'turnover', side, reason });
  state.phase = 'deadball';
  state.phaseTimer = 0.8;
  state.possession = other(side);
  state.ball.state = 'dead';
  state.ball.owner = null;
}

function finishGame(state: MatchState, winner: Side): void {
  state.phase = 'over';
  state.winner = winner;
  state.players[winner].state = 'celebrating';
  state.players[winner].celebration = 'win';
  state.players[winner].celebrationTimer = WIN_CELEBRATION_TIME;
  // The loser is not celebrating anything.
  state.players[other(winner)].celebration = null;
  state.players[other(winner)].celebrationTimer = 0;
  state.events.push({ type: 'gameOver', winner, score: [state.score[0], state.score[1]] });
}

// ------------------------------------------------------------------- helpers

/** Live shot meter data for the HUD. Returns null when no shot is running. */
export function activeShotMeter(state: MatchState, side: Side): {
  progress: number;
  profile: ShotProfile;
} | null {
  const p = state.players[side];
  if (p.state !== 'shooting' || !p.shotProfile) return null;
  return {
    progress: clamp(p.shotElapsed / p.shotProfile.meterDuration, 0, 1.4),
    profile: p.shotProfile,
  };
}

/** Current contest pressure on the ball handler, for HUD feedback. */
export function currentContest(state: MatchState, side: Side): number {
  const p = state.players[side];
  const d = state.players[other(side)];
  const dist = Math.hypot(d.x - p.x, d.z - p.z);
  const toShooter = normalize(p.x - d.x, p.z - d.z);
  const defFacing = Math.sin(d.facing) * toShooter.x + -Math.cos(d.facing) * toShooter.z;
  return computeContest({
    defenderDistance: dist,
    defenderHandUp: d.handUp,
    defenderAirborne: d.y > 0.3,
    defenderFacing: defFacing,
    defenderStagger: d.stagger,
    shooterHeightAdv: p.cfg.heightIn - d.cfg.heightIn,
    interiorShot: distanceToRim(p.x, p.z) < 9,
    defenderAttrs: d.cfg.attrs,
    defenderBadges: d.cfg.badges,
  });
}

/**
 * Hands the ball to one side and restarts from a check. Training drills use
 * this to keep the ball where the drill needs it; the match rules never do.
 */
export function forcePossession(state: MatchState, side: Side): void {
  if (state.phase === 'over') return;
  setupCheckball(state, side);
}

export function drainEvents(state: MatchState): SimEvent[] {
  const events = state.events;
  state.events = [];
  return events;
}

export { other as otherSide };
