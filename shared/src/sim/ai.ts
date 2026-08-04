import { Rng } from '../rng.ts';
import { COURT, distanceToRim, isBeyondArc } from './court.ts';
import { DRIBBLE_MOVES, type DribbleMoveId } from './moves.ts';
import { emptyInput, type MatchState, type PlayerInput, type Side } from './state.ts';

export type Difficulty = 'rookie' | 'pro' | 'allStar' | 'superstar' | 'legend';

export interface AiProfile {
  /** seconds of perception lag on the opponent's position */
  reactionTime: number;
  /** preferred on-ball distance in feet */
  standoff: number;
  /** 0..1 chance per opportunity to gamble for a strip */
  stealAggression: number;
  /** 0..1 quality of contest timing */
  contestIq: number;
  /** 0..1 how disciplined its shot selection is */
  shotSelection: number;
  /** standard deviation of release timing error, in normalised meter units */
  releaseError: number;
  /** dribble moves per second while attacking */
  moveRate: number;
  /** 0..1 how well it recognises and cuts off a drive */
  helpIq: number;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, AiProfile> = {
  rookie: { reactionTime: 0.34, standoff: 4.6, stealAggression: 0.08, contestIq: 0.3, shotSelection: 0.35, releaseError: 0.3, moveRate: 0.35, helpIq: 0.3 },
  pro: { reactionTime: 0.26, standoff: 3.9, stealAggression: 0.14, contestIq: 0.48, shotSelection: 0.5, releaseError: 0.2, moveRate: 0.5, helpIq: 0.48 },
  allStar: { reactionTime: 0.19, standoff: 3.3, stealAggression: 0.2, contestIq: 0.64, shotSelection: 0.66, releaseError: 0.13, moveRate: 0.7, helpIq: 0.65 },
  superstar: { reactionTime: 0.14, standoff: 2.8, stealAggression: 0.26, contestIq: 0.78, shotSelection: 0.8, releaseError: 0.085, moveRate: 0.9, helpIq: 0.8 },
  legend: { reactionTime: 0.1, standoff: 2.4, stealAggression: 0.32, contestIq: 0.9, shotSelection: 0.9, releaseError: 0.055, moveRate: 1.1, helpIq: 0.92 },
};

interface Sample {
  t: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

const MOVE_POOL: DribbleMoveId[] = DRIBBLE_MOVES.filter((m) => m.id !== 'euro').map((m) => m.id);

/**
 * Defensive and offensive AI for a bot side. Perception is deliberately lagged
 * so the bot can be beaten by a well-timed combo instead of reading inputs on
 * the same frame they happen.
 */
export class AiController {
  private history: Sample[] = [];
  private rng: Rng;
  private profile: AiProfile;
  private baseProfile: AiProfile;
  private nextMoveAt = 0;
  private plannedRelease: number | null = null;
  private moveTarget: DribbleMoveId | null = null;
  private commitTimer = 0;
  private driveTimer = 0;
  private commitDirX = 0;
  private commitDirZ = 0;
  /** rolling read of how well the human is timing shots, drives adaptivity */
  private opponentGreenRate = 0.4;
  private opponentShots = 0;

  private side: Side;
  adaptive: boolean;

  constructor(side: Side, difficulty: Difficulty, seed = 1337, adaptive = true) {
    this.side = side;
    this.adaptive = adaptive;
    this.baseProfile = { ...DIFFICULTY_PRESETS[difficulty] };
    this.profile = { ...this.baseProfile };
    this.rng = new Rng(seed);
  }

  /** Feed shot results so adaptive difficulty can track the human's form. */
  notifyOpponentShot(wasGreen: boolean): void {
    this.opponentShots++;
    const alpha = 0.25;
    this.opponentGreenRate = this.opponentGreenRate * (1 - alpha) + (wasGreen ? 1 : 0) * alpha;
  }

  private adapt(state: MatchState): void {
    if (!this.adaptive) return;
    const mine = state.score[this.side];
    const theirs = state.score[this.side === 0 ? 1 : 0];
    const margin = theirs - mine; // positive = bot losing
    // Losing badly tightens the bot up; winning badly loosens it. Capped so it
    // never becomes a different difficulty than the player selected.
    const swing = Math.max(-1, Math.min(1, margin / 6));
    const skillRead = Math.max(-1, Math.min(1, (this.opponentGreenRate - 0.4) / 0.35));
    const k = (swing * 0.6 + skillRead * 0.4) * 0.22;
    const b = this.baseProfile;
    this.profile.reactionTime = b.reactionTime * (1 - k);
    this.profile.standoff = b.standoff * (1 - k * 0.4);
    this.profile.contestIq = Math.min(0.97, b.contestIq * (1 + k));
    this.profile.releaseError = Math.max(0.02, b.releaseError * (1 - k));
    this.profile.shotSelection = Math.min(0.97, b.shotSelection * (1 + k * 0.5));
    this.profile.helpIq = Math.min(0.97, b.helpIq * (1 + k));
  }

  update(state: MatchState, dt: number): PlayerInput {
    this.adapt(state);
    const me = state.players[this.side];
    const opp = state.players[this.side === 0 ? 1 : 0];

    this.history.push({ t: state.time, x: opp.x, z: opp.z, vx: opp.vx, vz: opp.vz });
    while (this.history.length > 2 && state.time - this.history[0].t > 0.6) this.history.shift();

    const input = emptyInput();
    if (state.phase !== 'live') {
      // Walk back to a sensible spot between possessions.
      return input;
    }

    this.commitTimer = Math.max(0, this.commitTimer - dt);

    const hasBall = state.ball.owner === this.side && state.ball.state === 'held';
    if (hasBall) this.offense(state, input, dt);
    else if (state.ball.state === 'loose' || state.ball.state === 'shot') this.chaseBall(state, input);
    else this.defense(state, input, dt);
    return input;
  }

  private perceived(): Sample {
    const target = this.history[this.history.length - 1].t - this.profile.reactionTime;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= target) return this.history[i];
    }
    return this.history[0];
  }

  // ------------------------------------------------------------------ offense
  private offense(state: MatchState, input: PlayerInput, dt: number): void {
    const me = state.players[this.side];
    const opp = state.players[this.side === 0 ? 1 : 0];
    const rimDist = distanceToRim(me.x, me.z);
    const defDist = Math.hypot(opp.x - me.x, opp.z - me.z);

    // Shot already running — decide when to let go.
    if (me.state === 'shooting' && me.shotProfile) {
      if (this.plannedRelease === null) {
        const error = this.gaussian() * this.profile.releaseError;
        this.plannedRelease = Math.max(0.25, me.shotProfile.idealPoint + error);
      }
      const progress = me.shotElapsed / me.shotProfile.meterDuration;
      input.shoot = progress < this.plannedRelease;
      if (!input.shoot) this.plannedRelease = null;
      return;
    }
    this.plannedRelease = null;

    // Clearing the ball after a change of possession: carry it back out past
    // the arc before anything else.
    if (state.needsClear) {
      const out = this.toward(me.x, me.z, COURT.rimX, COURT.rimZ);
      input.mx = out.x;
      input.mz = out.z;
      input.sprint = true;
      return;
    }

    // Willingness to shoot rises as the defender gives ground and as the shot
    // clock runs down, so possessions resolve instead of dribbling forever.
    const openness = Math.max(0, Math.min(1, (defDist - 1.8) / 4.2)) + opp.stagger * 0.6;
    const clockPressure = Math.max(0, 1 - state.shotClock / 9);
    const inRange = rimDist < 26;
    const urge = (openness * 0.9 + clockPressure * 1.4) * this.profile.shotSelection;
    const goodShot = inRange && me.stamina > 0.22 && openness > 0.2;
    const desperate = state.shotClock < 2.2 && rimDist < 30;

    // A committed drive lasts long enough to actually gather and finish,
    // rather than being re-decided every frame.
    if (this.driveTimer > 0) {
      this.driveTimer -= dt;
      const toRim = this.toward(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = toRim.x;
      input.mz = toRim.z;
      input.sprint = true;
      if (rimDist < 9) input.drive = true;
      if (rimDist < 3) this.driveTimer = 0;
      return;
    }

    if ((goodShot && this.rng.chance(urge * dt * 9)) || desperate) {
      if (rimDist < 14 && me.cfg.attrs.dunk > 62 && me.cfg.attrs.dunk > me.cfg.attrs.threePoint - 6) {
        this.driveTimer = 1.2;
      } else {
        input.shoot = true;
      }
      return;
    }

    // Attack a beaten defender.
    if (opp.stagger > 0.35 && rimDist < 20) {
      this.driveTimer = 1.1;
      return;
    }

    if (state.time >= this.nextMoveAt && defDist < 6.5 && me.stamina > 0.3) {
      this.nextMoveAt = state.time + this.rng.range(0.5, 1.6) / Math.max(0.2, this.profile.moveRate);
      const preferRight = opp.x > me.x ? -1 : 1;
      this.moveTarget = this.pickMove(state);
      this.commitDirX = preferRight * this.rng.range(0.6, 1);
      this.commitDirZ = -this.rng.range(0.2, 0.9);
      this.commitTimer = 0.35;
      input.move = this.moveTarget;
      input.moveDirX = this.commitDirX;
      input.moveDirZ = this.commitDirZ;
      return;
    }

    // Reposition: hunt space around the arc, or attack a soft closeout.
    const wantDist = defDist < 3.2 ? 1 : -1;
    const fromDef = this.away(opp.x, opp.z, me.x, me.z);
    const spacing = isBeyondArc(me.x, me.z) ? this.toward(COURT.rimX, COURT.rimZ, me.x, me.z) : this.away(COURT.rimX, COURT.rimZ, me.x, me.z);
    input.mx = fromDef.x * wantDist * 0.7 + spacing.x * 0.35;
    input.mz = fromDef.z * wantDist * 0.7 + spacing.z * 0.35;
    input.sprint = defDist < 3 && me.stamina > 0.4;
  }

  private pickMove(state: MatchState): DribbleMoveId {
    const me = state.players[this.side];
    const legal = MOVE_POOL.filter((id) => {
      const def = DRIBBLE_MOVES.find((m) => m.id === id)!;
      return me.cfg.attrs[def.gate] >= def.requires;
    });
    // Higher difficulty bots prefer moves that actually break defenders down.
    if (this.profile.moveRate > 0.8 && this.rng.chance(0.55)) {
      const strong = legal.filter((id) => DRIBBLE_MOVES.find((m) => m.id === id)!.ankleBase >= 0.14);
      if (strong.length) return this.rng.pick(strong);
    }
    return this.rng.pick(legal.length ? legal : (['crossover'] as DribbleMoveId[]));
  }

  // ------------------------------------------------------------------ defense
  private defense(state: MatchState, input: PlayerInput, dt: number): void {
    const me = state.players[this.side];
    const opp = state.players[this.side === 0 ? 1 : 0];
    const read = this.perceived();

    // Predict where the handler is going, scaled by how well this bot reads.
    const lead = this.profile.helpIq * 0.28;
    const predX = read.x + read.vx * lead;
    const predZ = read.z + read.vz * lead;

    // Stand between the handler and the rim.
    const toRim = this.toward(COURT.rimX, COURT.rimZ, predX, predZ);
    const targetX = predX + toRim.x * this.profile.standoff;
    const targetZ = predZ + toRim.z * this.profile.standoff;

    const dx = targetX - me.x;
    const dz = targetZ - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      input.mx = dx / dist;
      input.mz = dz / dist;
      input.sprint = dist > 2.2 && me.stamina > 0.2;
    }

    const realDist = Math.hypot(opp.x - me.x, opp.z - me.z);

    // Contest a live jumper. Bots with low IQ jump late or not at all.
    if (opp.state === 'shooting' && opp.shotProfile) {
      const progress = opp.shotElapsed / opp.shotProfile.meterDuration;
      const jumpAt = 0.42 + (1 - this.profile.contestIq) * 0.5;
      if (progress > jumpAt && realDist < 7 && this.rng.chance(this.profile.contestIq)) {
        input.contest = true;
      } else if (realDist < 8) {
        input.contest = progress > 0.2; // at least get a hand up
      }
    }

    // Rim protection / chase-down.
    if (opp.state === 'finishing' || (opp.y > 0.3 && distanceToRim(opp.x, opp.z) < 6)) {
      if (realDist < 4.5 && this.rng.chance(this.profile.contestIq * 1.1)) input.contest = true;
    }

    // Gamble for a strip, mostly while the handler is mid-animation.
    const vulnerable = opp.state === 'moveLock';
    if (realDist < 3.4 && me.stealCooldown <= 0) {
      const p = this.profile.stealAggression * (vulnerable ? 3.2 : 0.6) * dt * 8;
      if (this.rng.chance(p)) input.steal = true;
    }
  }

  private chaseBall(state: MatchState, input: PlayerInput): void {
    const me = state.players[this.side];
    const ball = state.ball;
    // Aim at where the ball will be, not where it is.
    const leadT = 0.22;
    const tx = ball.x + ball.vx * leadT;
    const tz = ball.z + ball.vz * leadT;
    const dir = this.toward(tx, tz, me.x, me.z);
    input.mx = dir.x;
    input.mz = dir.z;
    input.sprint = true;
    if (ball.state === 'loose' && ball.y > 5 && Math.hypot(tx - me.x, tz - me.z) < 3) {
      input.contest = true; // go up for the board
    }
  }

  // ------------------------------------------------------------------ helpers
  private toward(tx: number, tz: number, fx: number, fz: number): { x: number; z: number } {
    const dx = tx - fx;
    const dz = tz - fz;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return { x: 0, z: 0 };
    return { x: dx / len, z: dz / len };
  }

  private away(tx: number, tz: number, fx?: number, fz?: number): { x: number; z: number } {
    const dir = fx === undefined ? this.toward(tx, tz, 0, 0) : this.toward(tx, tz, fx, fz as number);
    return { x: -dir.x, z: -dir.z };
  }

  private gaussian(): number {
    // Box–Muller, clamped so the bot never produces an absurd release.
    const u = Math.max(1e-6, this.rng.next());
    const v = this.rng.next();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-2.5, Math.min(2.5, g));
  }
}
