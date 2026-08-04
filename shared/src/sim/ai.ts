import { Rng } from '../rng.ts';
import { COURT, distanceToRim, isBeyondArc } from './court.ts';
import { DRIBBLE_MOVES, type DribbleMoveId } from './moves.ts';
import { emptyInput, type MatchState, type PlayerInput, type Side } from './state.ts';

import { DIFFICULTIES, type Difficulty } from '../types.ts';

export type { Difficulty };
export { DIFFICULTIES };

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
  /** 0 = basic handles, 1 = intermediate, 2 = signature combos */
  moveTier: 0 | 1 | 2;
  /** how many moves it will chain back to back */
  comboLength: number;
  /** 0..1 how strongly it adapts to the human's shot tendencies */
  tendencyRead: number;
  /** 0..1 chance it jumps at a pump fake or bites on a size-up */
  bitesOnFakes: number;
}

/**
 * Six difficulties, each a genuinely different opponent rather than the same
 * bot with a rating multiplier. The levers that matter most to how a game
 * feels are reaction time (can you beat it with a move?), release error (does
 * it punish you from outside?) and tendency reading (does it learn?).
 */
export const DIFFICULTY_PRESETS: Record<Difficulty, AiProfile> = {
  // Misses open shots often, slow to react, poor decisions. Easy to beat.
  rookie: { reactionTime: 0.42, standoff: 5.2, stealAggression: 0.05, contestIq: 0.18, shotSelection: 0.3, releaseError: 0.34, moveRate: 0.25, helpIq: 0.2, moveTier: 0, comboLength: 1, tendencyRead: 0, bitesOnFakes: 0.75 },
  // Slightly smarter defense and shot selection, the occasional dribble move.
  semiPro: { reactionTime: 0.32, standoff: 4.4, stealAggression: 0.1, contestIq: 0.36, shotSelection: 0.45, releaseError: 0.24, moveRate: 0.45, helpIq: 0.36, moveTier: 0, comboLength: 2, tendencyRead: 0, bitesOnFakes: 0.6 },
  // Balanced. Good defense, simple combos, punishes bad mistakes.
  pro: { reactionTime: 0.25, standoff: 3.8, stealAggression: 0.16, contestIq: 0.52, shotSelection: 0.6, releaseError: 0.17, moveRate: 0.65, helpIq: 0.52, moveTier: 1, comboLength: 2, tendencyRead: 0.2, bitesOnFakes: 0.45 },
  // Strong pressure, better timing, advanced moves, reads your tendencies.
  allStar: { reactionTime: 0.19, standoff: 3.2, stealAggression: 0.22, contestIq: 0.68, shotSelection: 0.72, releaseError: 0.115, moveRate: 0.85, helpIq: 0.68, moveTier: 1, comboLength: 3, tendencyRead: 0.55, bitesOnFakes: 0.32 },
  // High IQ, excellent selection, aggressive, uses signature moves.
  superstar: { reactionTime: 0.14, standoff: 2.7, stealAggression: 0.28, contestIq: 0.82, shotSelection: 0.84, releaseError: 0.075, moveRate: 1.05, helpIq: 0.82, moveTier: 2, comboLength: 3, tendencyRead: 0.8, bitesOnFakes: 0.2 },
  // Elite reactions, rarely a bad decision. Plays like a real competitor.
  hallOfFame: { reactionTime: 0.095, standoff: 2.3, stealAggression: 0.34, contestIq: 0.93, shotSelection: 0.93, releaseError: 0.045, moveRate: 1.3, helpIq: 0.94, moveTier: 2, comboLength: 4, tendencyRead: 1, bitesOnFakes: 0.09 },
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
  /** rolling share of the human's shots taken from behind the arc */
  private opponentThreeRate = 0.4;
  /** rolling share of the human's possessions that attacked the rim */
  private opponentDriveRate = 0.3;
  private ftPlannedRelease: number | null = null;

  private side: Side;
  adaptive: boolean;

  constructor(side: Side, difficulty: Difficulty, seed = 1337, adaptive = true) {
    this.side = side;
    this.adaptive = adaptive;
    this.baseProfile = { ...DIFFICULTY_PRESETS[difficulty] };
    this.profile = { ...this.baseProfile };
    this.rng = new Rng(seed);
  }

  /**
   * Feed the human's shot results. Beyond adaptive difficulty this builds the
   * scouting report: how often they shoot from deep and how often they attack
   * the rim, which is what `tendencyRead` acts on.
   */
  notifyOpponentShot(wasGreen: boolean, wasThree = false, wasDrive = false): void {
    this.opponentShots++;
    const alpha = 0.25;
    this.opponentGreenRate = this.opponentGreenRate * (1 - alpha) + (wasGreen ? 1 : 0) * alpha;
    const beta = 0.2;
    this.opponentThreeRate = this.opponentThreeRate * (1 - beta) + (wasThree ? 1 : 0) * beta;
    this.opponentDriveRate = this.opponentDriveRate * (1 - beta) + (wasDrive ? 1 : 0) * beta;
  }

  /** What the bot currently believes about the human. Surfaced in the HUD. */
  scoutingReport(): { threeRate: number; driveRate: number; greenRate: number; shots: number } {
    return {
      threeRate: this.opponentThreeRate,
      driveRate: this.opponentDriveRate,
      greenRate: this.opponentGreenRate,
      shots: this.opponentShots,
    };
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
    if (state.phase === 'freeThrow') {
      if (state.freeThrow?.side === this.side) this.shootFreeThrow(state, input);
      return input;
    }
    this.ftPlannedRelease = null;
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

  /** Free throws are pure timing, so difficulty shows up directly here. */
  private shootFreeThrow(state: MatchState, input: PlayerInput): void {
    const me = state.players[this.side];
    if (me.state !== 'shooting') {
      this.ftPlannedRelease = null;
      input.shoot = true;
      return;
    }
    if (!me.shotProfile) return;
    if (this.ftPlannedRelease === null) {
      // A stationary, uncontested shot is the bot's best look of the game.
      const error = this.gaussian() * this.profile.releaseError * 0.65;
      this.ftPlannedRelease = Math.max(0.3, me.shotProfile.idealPoint + error);
    }
    const progress = me.shotElapsed / me.shotProfile.meterDuration;
    input.shoot = progress < this.ftPlannedRelease;
    if (!input.shoot) this.ftPlannedRelease = null;
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
      // comboLength shortens the gap between moves, so higher difficulties
      // string together real combinations rather than isolated moves.
      const chain = 1 + (this.profile.comboLength - 1) * 0.28;
      this.nextMoveAt = state.time + this.rng.range(0.4, 1.5) / Math.max(0.2, this.profile.moveRate * chain);
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

  /**
   * Move selection is gated by difficulty as well as ratings: a Rookie only
   * has basic handles, Pro adds intermediate moves, and Superstar and above
   * unlock the signature combos.
   */
  private pickMove(state: MatchState): DribbleMoveId {
    const me = state.players[this.side];
    const legal = MOVE_POOL.filter((id) => {
      const def = DRIBBLE_MOVES.find((m) => m.id === id)!;
      if (me.cfg.attrs[def.gate] < def.requires) return false;
      if (def.signature) return this.profile.moveTier >= 2;
      if (def.requires > 0) return this.profile.moveTier >= 1;
      return true;
    });
    if (!legal.length) return 'crossover';

    // Higher tiers prefer moves that actually break a defender down.
    if (this.profile.moveTier >= 1 && this.rng.chance(0.35 + this.profile.moveTier * 0.2)) {
      const strong = legal.filter((id) => DRIBBLE_MOVES.find((m) => m.id === id)!.ankleBase >= 0.04);
      if (strong.length) return this.rng.pick(strong);
    }
    return this.rng.pick(legal);
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

    // Scouting report: a bot that reads tendencies crowds a shooter out past
    // the arc and sags off a driver, instead of playing everyone the same way.
    const read3 = (this.opponentThreeRate - 0.4) * this.profile.tendencyRead;
    const readDrive = (this.opponentDriveRate - 0.3) * this.profile.tendencyRead;
    const oppBeyondArc = isBeyondArc(predX, predZ);
    let standoff = this.profile.standoff;
    if (oppBeyondArc) standoff -= read3 * 2.2; // close out harder on a shooter
    else standoff += readDrive * 1.6; // give ground to a slasher and wall up

    // Stand between the handler and the rim.
    const toRim = this.toward(COURT.rimX, COURT.rimZ, predX, predZ);
    const targetX = predX + toRim.x * Math.max(1.4, standoff);
    const targetZ = predZ + toRim.z * Math.max(1.4, standoff);

    const dx = targetX - me.x;
    const dz = targetZ - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.25) {
      input.mx = dx / dist;
      input.mz = dz / dist;
      input.sprint = dist > 2.2 && me.stamina > 0.2;
    }

    const realDist = Math.hypot(opp.x - me.x, opp.z - me.z);

    // Pump fakes only work on bots that bite, which is a difficulty trait.
    if (opp.fakeTimer > 0.2 && realDist < 6 && me.y === 0) {
      if (this.rng.chance(this.profile.bitesOnFakes * dt * 9)) input.contest = true;
    }

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
