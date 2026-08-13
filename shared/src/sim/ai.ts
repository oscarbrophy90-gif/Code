import { Rng } from '../rng.ts';
import { COURT, distanceToRim, isBeyondArc } from './court.ts';
import { DRIBBLE_MOVES, type DribbleMoveId } from './moves.ts';
import { emptyInput, type MatchState, type PlayerInput, type SimPlayer, type Side } from './state.ts';

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
  /**
   * 0..1 how hard it converts your mistakes.
   *
   * Separate from reaction time on purpose. Reaction time is how fast it sees
   * *everything*; this is how much faster it moves when you have specifically
   * given it something — you are staggered, you have lost your feet, you have
   * repeated a move it has already seen. A Rookie sees an opening and does not
   * take it. Hall of Fame and above take it every time, which is what "punishes
   * mistakes" has to mean if it is going to mean anything.
   */
  punish: number;
  /**
   * 0..1 how dangerous its handle is.
   *
   * Zero below Hall of Fame: nothing under that tier goes looking to put you on
   * the floor. Above it, the bot saves its highest-misdirection move for the
   * moment your momentum is already going the wrong way, and its chance of
   * landing it is scaled by this. It is never a coin flip and it is never
   * unstoppable — stay square and it collapses to nearly nothing.
   */
  ankleThreat: number;
}

/**
 * Six difficulties, each a genuinely different opponent rather than the same
 * bot with a rating multiplier. The levers that matter most to how a game
 * feels are reaction time (can you beat it with a move?), release error (does
 * it punish you from outside?) and tendency reading (does it learn?).
 */
export const DIFFICULTY_PRESETS: Record<Difficulty, AiProfile> = {
  // Misses open shots often, slow to react, poor decisions. Easy to beat.
  rookie: { reactionTime: 0.42, standoff: 5.2, stealAggression: 0.05, contestIq: 0.18, shotSelection: 0.3, releaseError: 0.34, moveRate: 0.25, helpIq: 0.2, moveTier: 0, comboLength: 1, tendencyRead: 0, bitesOnFakes: 0.75, punish: 0, ankleThreat: 0 },
  // Slightly smarter defense and shot selection, the occasional dribble move.
  semiPro: { reactionTime: 0.32, standoff: 4.4, stealAggression: 0.1, contestIq: 0.36, shotSelection: 0.45, releaseError: 0.24, moveRate: 0.45, helpIq: 0.36, moveTier: 0, comboLength: 2, tendencyRead: 0, bitesOnFakes: 0.6, punish: 0.08, ankleThreat: 0 },
  // Balanced. Good defense, simple combos, punishes bad mistakes.
  pro: { reactionTime: 0.25, standoff: 3.8, stealAggression: 0.16, contestIq: 0.52, shotSelection: 0.6, releaseError: 0.17, moveRate: 0.65, helpIq: 0.52, moveTier: 1, comboLength: 2, tendencyRead: 0.2, bitesOnFakes: 0.45, punish: 0.2, ankleThreat: 0 },
  // Strong pressure, better timing, advanced moves, reads your tendencies.
  allStar: { reactionTime: 0.19, standoff: 3.2, stealAggression: 0.22, contestIq: 0.68, shotSelection: 0.72, releaseError: 0.115, moveRate: 0.85, helpIq: 0.68, moveTier: 1, comboLength: 3, tendencyRead: 0.55, bitesOnFakes: 0.32, punish: 0.34, ankleThreat: 0 },
  // High IQ, excellent selection, aggressive, uses signature moves.
  superstar: { reactionTime: 0.14, standoff: 2.7, stealAggression: 0.28, contestIq: 0.82, shotSelection: 0.84, releaseError: 0.075, moveRate: 1.05, helpIq: 0.82, moveTier: 2, comboLength: 3, tendencyRead: 0.8, bitesOnFakes: 0.2, punish: 0.5, ankleThreat: 0 },

  // ---------------------------------------------- Emerald and above
  //
  // Hall of Fame is where the ranked ladder stops being a difficulty setting
  // and starts being a wall. From here up, three things climb together and one
  // deliberately does not: reactions, punishment and handle all sharpen, and
  // `bitesOnFakes` never reaches zero. A bot that cannot be faked is a bot you
  // beat by memorising it rather than by playing well, so every tier — the top
  // one included — can still be moved by a good fake.

  // Elite reactions, rarely a bad decision. Plays like a real competitor, and
  // the first tier that will put you on the floor if you lunge at it.
  hallOfFame: { reactionTime: 0.095, standoff: 2.3, stealAggression: 0.34, contestIq: 0.93, shotSelection: 0.93, releaseError: 0.045, moveRate: 1.3, helpIq: 0.94, moveTier: 2, comboLength: 4, tendencyRead: 1, bitesOnFakes: 0.09, punish: 0.68, ankleThreat: 0.35 },
  // Sapphire. Reads the tendency behind the tendency: closes out on a shooter
  // before the feet are set and walls the lane against a driver on the same
  // possession.
  legend: { reactionTime: 0.086, standoff: 2.22, stealAggression: 0.355, contestIq: 0.95, shotSelection: 0.945, releaseError: 0.038, moveRate: 1.36, helpIq: 0.955, moveTier: 2, comboLength: 4, tendencyRead: 1, bitesOnFakes: 0.078, punish: 0.76, ankleThreat: 0.48 },
  // Diamond. Every mistake is a bucket. Space has to be earned twice.
  immortal: { reactionTime: 0.078, standoff: 2.14, stealAggression: 0.372, contestIq: 0.965, shotSelection: 0.955, releaseError: 0.032, moveRate: 1.43, helpIq: 0.97, moveTier: 2, comboLength: 5, tendencyRead: 1, bitesOnFakes: 0.066, punish: 0.84, ankleThreat: 0.6 },
  // Champion. Nothing is open for longer than a beat, and it is never the same
  // beat twice.
  untouchable: { reactionTime: 0.069, standoff: 2.07, stealAggression: 0.386, contestIq: 0.98, shotSelection: 0.963, releaseError: 0.027, moveRate: 1.49, helpIq: 0.98, moveTier: 2, comboLength: 5, tendencyRead: 1, bitesOnFakes: 0.052, punish: 0.92, ankleThreat: 0.72 },
  // Grand Champ. The hardest thing in the game, and the end of the ladder.
  // Reacts inside a human's own reaction time, almost never misses an open
  // look, and barely ever bites on a fake — barely, not never.
  grandChamp: { reactionTime: 0.06, standoff: 2.0, stealAggression: 0.4, contestIq: 0.99, shotSelection: 0.97, releaseError: 0.022, moveRate: 1.55, helpIq: 0.99, moveTier: 2, comboLength: 5, tendencyRead: 1, bitesOnFakes: 0.04, punish: 1, ankleThreat: 0.85 },
};

/**
 * The floor under every difficulty, asserted in the tests.
 *
 * "Extremely challenging but still beatable" is a promise, and a promise with
 * no number behind it is a wish. These are the numbers: nothing reacts faster
 * than 55ms, nothing gambles for a strip more than two opportunities in five,
 * and nothing is immune to a fake.
 */
/**
 * The handle threat a difficulty carries onto the floor.
 *
 * Read off the preset so there is one source of truth, and sharpened the same
 * way everything else is — a Hall of Fame bot at the top of Emerald is a little
 * more dangerous than one at the bottom of it, without being a Legend.
 */
export function ankleThreatFor(difficulty: Difficulty, edge = 0): number {
  return sharpen(DIFFICULTY_PRESETS[difficulty], edge, difficulty).ankleThreat;
}

export const AI_FAIRNESS_FLOOR = {
  minReactionTime: 0.055,
  maxStealAggression: 0.45,
  minBitesOnFakes: 0.03,
} as const;

interface Sample {
  t: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

const MOVE_POOL: DribbleMoveId[] = DRIBBLE_MOVES.filter((m) => m.id !== 'euro').map((m) => m.id);

/** How likely a move is to actually put somebody on the floor. */
function weightOf(id: DribbleMoveId): number {
  const def = DRIBBLE_MOVES.find((m) => m.id === id)!;
  return def.ankleBase * def.misdirection;
}

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
  /** counts down before the CPU checks the ball in */
  private checkDelay = 0;
  private autoCheck = true;
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
  /** the last two dribble moves the human committed to, newest first */
  private oppRecentMoves: DribbleMoveId[] = [];
  private lastSeenMove: DribbleMoveId | null = null;

  private side: Side;
  adaptive: boolean;

  /**
   * `autoCheck` is off when a human is on the other side: checking the ball in
   * is the human's job, and a CPU that does it first takes that away.
   */
  constructor(side: Side, difficulty: Difficulty, seed = 1337, adaptive = true, autoCheck = true, edge = 0) {
    this.side = side;
    this.adaptive = adaptive;
    this.autoCheck = autoCheck;
    this.baseProfile = sharpen(DIFFICULTY_PRESETS[difficulty], edge, difficulty);
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
      // Check the ball in when it is on the CPU to do so. It waits a beat first
      // so a human on the other side always gets the chance to check first.
      if (state.phase === 'checkball' && state.config.manualCheck && this.autoCheck) {
        this.checkDelay = this.checkDelay > 0 ? this.checkDelay - dt : this.rng.range(0.5, 1.1);
        if (this.checkDelay <= 0) input.shoot = true;
      } else {
        this.checkDelay = 0;
      }
      // Walk back to a sensible spot between possessions.
      return input;
    }
    this.checkDelay = 0;

    this.commitTimer = Math.max(0, this.commitTimer - dt);

    const hasBall = state.ball.owner === this.side && state.ball.state === 'held';
    if (hasBall) this.offense(state, input, dt);
    else if (state.ball.state === 'loose' || state.ball.state === 'shot') this.chaseBall(state, input);
    else this.defense(state, input, dt);
    // A bot has one shoot decision, not a hand on two keys, so the stepback
    // rides the same intent it already computed.
    input.moveShoot = input.shoot;
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

  private perceived(lag = this.profile.reactionTime): Sample {
    const target = this.history[this.history.length - 1].t - Math.max(0, lag);
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= target) return this.history[i];
    }
    return this.history[0];
  }

  /**
   * How much of a mistake the human is currently making, 0 to 1.
   *
   * Only things the player *did*: lost their feet, been broken down, thrown a
   * move the bot has already seen this possession, or committed hard in one
   * direction while the bot is beside them. It is deliberately not "the bot is
   * winning" — punishment has to be attached to a cause the player can point at
   * and avoid next time, or it is just the difficulty being unfair with extra
   * steps.
   */
  private exposure(opp: SimPlayer): number {
    let e = 0;
    if (opp.state === 'fallen') e = 1;
    else if (opp.state === 'staggered') e = Math.max(e, 0.85);
    else if (opp.stagger > 0.2) e = Math.max(e, opp.stagger * 0.7);
    // A repeated move is a read. Two of the same in a row and the bot knows.
    if (this.oppRecentMoves.length >= 2 && this.oppRecentMoves[0] === this.oppRecentMoves[1]) {
      e = Math.max(e, 0.55);
    }
    // Mid-animation with nothing left to cancel into.
    if (opp.state === 'moveLock' && opp.moveDuration > 0) {
      const through = opp.moveTimer / opp.moveDuration;
      if (through > 0.55) e = Math.max(e, 0.5);
    }
    return Math.min(1, e);
  }

  /** Notes what the human just threw, so a repeat can be recognised. */
  private noteOpponentMove(opp: SimPlayer): void {
    const id = opp.state === 'moveLock' ? opp.moveId : null;
    if (id && id !== this.lastSeenMove) {
      this.oppRecentMoves.unshift(id as DribbleMoveId);
      if (this.oppRecentMoves.length > 3) this.oppRecentMoves.pop();
    }
    this.lastSeenMove = id as DribbleMoveId | null;
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

    // Attack a beaten defender. A high-punish bot goes at a smaller opening and
    // from further out, which is what "it takes every mistake" looks like from
    // the other side of the ball.
    const exposedDef = this.exposure(opp);
    const openingNeeded = 0.35 - this.profile.punish * 0.2;
    if ((opp.stagger > openingNeeded || exposedDef > 0.7) && rimDist < 20 + this.profile.punish * 6) {
      this.driveTimer = 1.1;
      return;
    }

    // Is the defender leaning? A move thrown against a defender who is already
    // travelling one way is the one that actually breaks somebody down — the
    // sim's own ankle maths keys off exactly this. So a bot with a handle waits
    // for it instead of firing on a timer.
    const lean = this.defenderLean(me, opp);
    const hunting = this.profile.ankleThreat > 0 && lean > 0.45 && defDist < 5 && me.stamina > 0.45;

    if ((state.time >= this.nextMoveAt || hunting) && defDist < 6.5 && me.stamina > 0.3) {
      // comboLength shortens the gap between moves, so higher difficulties
      // string together real combinations rather than isolated moves.
      const chain = 1 + (this.profile.comboLength - 1) * 0.28;
      this.nextMoveAt = state.time + this.rng.range(0.4, 1.5) / Math.max(0.2, this.profile.moveRate * chain);
      // Hunting costs it something: after going for the kill it has to reset
      // before it can do it again, so this is a moment rather than a loop.
      if (hunting) this.nextMoveAt = Math.max(this.nextMoveAt, state.time + 1.1);
      const preferRight = opp.x > me.x ? -1 : 1;
      this.moveTarget = this.pickMove(state, hunting);
      // Against a leaning defender it goes the way the lean cannot follow.
      const away = hunting ? -Math.sign(opp.vx || preferRight) || preferRight : preferRight;
      this.commitDirX = away * this.rng.range(0.6, 1);
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
  private pickMove(state: MatchState, hunting = false): DribbleMoveId {
    const me = state.players[this.side];
    const legal = MOVE_POOL.filter((id) => {
      const def = DRIBBLE_MOVES.find((m) => m.id === id)!;
      if (me.cfg.attrs[def.gate] < def.requires) return false;
      if (def.signature) return this.profile.moveTier >= 2;
      if (def.requires > 0) return this.profile.moveTier >= 1;
      return true;
    });
    if (!legal.length) return 'crossover';

    // Going for the kill: the highest-misdirection move it owns, not a random
    // strong one. This is the only path to the biggest handles in the game, and
    // it is only ever reached when the defender is already leaning.
    if (hunting) {
      const best = [...legal].sort(
        (a, b) => weightOf(b) - weightOf(a),
      )[0];
      if (best) return best;
    }

    // Higher tiers prefer moves that actually break a defender down.
    if (this.profile.moveTier >= 1 && this.rng.chance(0.35 + this.profile.moveTier * 0.2)) {
      const strong = legal.filter((id) => DRIBBLE_MOVES.find((m) => m.id === id)!.ankleBase >= 0.04);
      if (strong.length) return this.rng.pick(strong);
    }
    return this.rng.pick(legal);
  }

  /**
   * How badly the defender is committed the wrong way, 0 to 1.
   *
   * The mirror of the sim's own `wrongWay` term: a defender standing square
   * scores nothing here, and a defender lunging scores high. It is the whole
   * reason good defence is a defence — stay in front and the bot never finds
   * the moment it is waiting for.
   */
  private defenderLean(me: SimPlayer, opp: SimPlayer): number {
    const speed = Math.hypot(opp.vx, opp.vz);
    if (speed < 1.2) return 0;
    const dx = me.x - opp.x;
    const dz = me.z - opp.z;
    const len = Math.hypot(dx, dz) || 1;
    // Positive when the defender's momentum carries them across the handler.
    const closing = (opp.vx * dx + opp.vz * dz) / (speed * len);
    return Math.max(0, Math.min(1, closing * (speed / 9)));
  }

  // ------------------------------------------------------------------ defense
  private defense(state: MatchState, input: PlayerInput, dt: number): void {
    const me = state.players[this.side];
    const opp = state.players[this.side === 0 ? 1 : 0];
    this.noteOpponentMove(opp);
    // Punishment. A mistake the human has actually made buys the bot up to half
    // its perception lag back — it does not see *more*, it sees *sooner*, and
    // only for as long as the mistake is on the floor. Below Hall of Fame
    // `punish` is small or zero and this is barely a thing.
    const exposed = this.exposure(opp);
    const lag = this.profile.reactionTime * (1 - this.profile.punish * exposed * 0.5);
    const read = this.perceived(lag);

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

    // A hesitation sells the same lie as a pump fake — ball over the head,
    // hands up — so a bot that bites on fakes bites on this too, and a Hall of
    // Fame bot almost never does. Only during the rise, and only sometimes.
    if (opp.state === 'moveLock' && opp.moveId === 'hesitation' && realDist < 7 && me.y === 0) {
      const t = opp.moveDuration > 0 ? opp.moveTimer / opp.moveDuration : 0;
      if (t > 0.25 && t < 0.7 && this.rng.chance(this.profile.bitesOnFakes * 0.8 * dt * 9)) {
        input.contest = true;
      }
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

    // Gamble for a strip, mostly while the handler is mid-animation. Reaches
    // land much more often than they used to, so the bot picks its moments
    // harder — otherwise close defence turns every possession into a turnover.
    const vulnerable = opp.state === 'moveLock';
    if (realDist < 3.4 && me.stealCooldown <= 0) {
      // The gamble is still a gamble — a reach that misses still costs the bot
      // its cooldown. Exposure only raises how often it takes the shot, and
      // never past the fairness ceiling on `stealAggression`.
      const openings = vulnerable ? 2.4 : 0.3;
      const punished = 1 + this.profile.punish * exposed * 1.1;
      const p = Math.min(AI_FAIRNESS_FLOOR.maxStealAggression, this.profile.stealAggression * punished) * openings * dt * 8;
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


/**
 * The difficulties in order, so sharpening knows what "harder" means.
 */
const DIFFICULTY_ORDER: Difficulty[] = [
  'rookie',
  'semiPro',
  'pro',
  'allStar',
  'superstar',
  'hallOfFame',
  'legend',
  'immortal',
  'untouchable',
  'grandChamp',
];

/**
 * Sharpens a difficulty preset by `edge`, from 0 to 1.
 *
 * `edge` 1 is exactly the next difficulty up; 0.5 is halfway between the two.
 * That is the whole trick, and it is why this is safe: however hard the ladder
 * pushes, a sharpened Rookie can never be worse than a Semi-Pro, so the bottom
 * of the ladder stays somewhere a beginner can stand.
 *
 * The first version moved every knob half the distance to an absolute ceiling
 * instead. Measured, that gave a fully sharpened Rookie a 0.235s reaction —
 * quicker than a plain Pro at 0.25 — which is exactly the unfair spike this is
 * supposed to prevent.
 *
 * The six difficulties are coarse: a whole tier of the ranked ladder sits inside
 * one of them, so without this Gold 3 and Gold 1 would field the same opponent.
 */
export function sharpen(preset: AiProfile, edge: number, difficulty?: Difficulty): AiProfile {
  const k = Math.max(0, Math.min(1, edge));
  if (k === 0) return { ...preset };

  const at = difficulty
    ? DIFFICULTY_ORDER.indexOf(difficulty)
    : DIFFICULTY_ORDER.findIndex((d) => DIFFICULTY_PRESETS[d] === preset);
  const next = at >= 0 && at < DIFFICULTY_ORDER.length - 1 ? DIFFICULTY_PRESETS[DIFFICULTY_ORDER[at + 1]] : null;
  // Already at the top: there is nothing above Grand Champ to move toward, so
  // it stays as it is rather than being extrapolated into something impossible.
  if (!next) return { ...preset };

  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    ...preset,
    reactionTime: lerp(preset.reactionTime, next.reactionTime),
    releaseError: lerp(preset.releaseError, next.releaseError),
    bitesOnFakes: lerp(preset.bitesOnFakes, next.bitesOnFakes),
    contestIq: lerp(preset.contestIq, next.contestIq),
    shotSelection: lerp(preset.shotSelection, next.shotSelection),
    helpIq: lerp(preset.helpIq, next.helpIq),
    tendencyRead: lerp(preset.tendencyRead, next.tendencyRead),
    stealAggression: lerp(preset.stealAggression, next.stealAggression),
    moveRate: lerp(preset.moveRate, next.moveRate),
    punish: lerp(preset.punish, next.punish),
    ankleThreat: lerp(preset.ankleThreat, next.ankleThreat),
  };
}
