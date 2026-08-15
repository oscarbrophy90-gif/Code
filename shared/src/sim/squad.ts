import { Rng } from '../rng.ts';
import { COURT, distanceToRim, isBeyondArc } from './court.ts';
import { DRIBBLE_MOVES, type DribbleMoveId } from './moves.ts';
import { DIFFICULTY_PRESETS, type AiProfile, type Difficulty } from './ai.ts';
import { matchupOf } from './match.ts';
import {
  emptyInput,
  type MatchState,
  type PlayerInput,
  type SimPlayer,
  type SimPlayerConfig,
  type Side,
} from './state.ts';

/**
 * Team AI: every CPU player on a 3v3 floor, teammates and opponents alike.
 *
 * The 1v1 `AiController` is one man playing one duel and it is deliberately
 * untouched — ranked runs on it and ranked must not move. This controller
 * plays *positions*: each player carries an archetype derived from their own
 * ratings, and the archetype decides where they stand, what they shoot, and
 * how hard they crash the glass. A paint beast lives at the dunker spot,
 * posts, boards and almost never wanders behind the arc; a sniper sprints to
 * the corners and lets it fly; nobody runs somebody else's game.
 */

// ------------------------------------------------------------------ archetypes

export interface Archetype {
  /** 0..1 appetite for threes, mid-range looks, and rim pressure */
  three: number;
  mid: number;
  inside: number;
  /** 0..1 how hard they chase rebounds */
  boards: number;
  /** 0..1 comfort creating off the dribble */
  handle: number;
  /** where they want to be off the ball, in court feet */
  spots: { x: number; z: number }[];
}

const norm = (v: number) => Math.max(0, Math.min(1, (v - 25) / 74));

/** What kind of player these ratings actually describe. */
export function archetypeOf(cfg: SimPlayerConfig): Archetype {
  const a = cfg.attrs;
  const three = norm(a.threePoint);
  const mid = norm(a.midRange);
  const inside = Math.max(norm(a.dunk), norm(a.layup)) * 0.62 + norm(a.closeShot) * 0.2 + norm(a.strength) * 0.18;
  const boards = Math.max(norm(a.offensiveRebound), norm(a.defensiveRebound)) * 0.75 + norm(a.strength) * 0.25;
  const handle = norm(a.ballHandle) * 0.7 + norm(a.speedWithBall) * 0.3;

  // Spots follow the game, not the position label: you space to where your
  // shot lives. Mirrored left/right pairs so two same-archetype players can
  // split the floor.
  const spots: { x: number; z: number }[] = [];
  if (three > inside + 0.08) {
    // Shooter: corners, wings and the top — every one genuinely behind the
    // line (rim is at z 5.25, arc radius 23.75, corner line at |x| 22), so the
    // catch is already a three rather than a long two.
    spots.push({ x: -23.2, z: 6 }, { x: 23.2, z: 6 }, { x: -16.5, z: 24.5 }, { x: 16.5, z: 24.5 }, { x: 0, z: 30 });
  } else if (inside > three + 0.08) {
    // Interior: dunker spots, short corners, the elbows. Never the arc.
    spots.push({ x: -7, z: 5 }, { x: 7, z: 5 }, { x: -10, z: 12 }, { x: 10, z: 12 }, { x: -6, z: 16 });
  } else {
    // Balanced: wings and elbows, a foot inside or outside as the play asks.
    spots.push({ x: -16, z: 14 }, { x: 16, z: 14 }, { x: -11, z: 21 }, { x: 11, z: 21 }, { x: 0, z: 25 });
  }

  return { three, mid, inside, boards, handle, spots };
}

// ------------------------------------------------------------------ controller

interface Persona {
  pid: number;
  arch: Archetype;
  /** which of my spots I am working toward */
  spotIdx: number;
  /** seconds left on a committed rim cut */
  cutTimer: number;
  /** seconds left on a committed drive with the ball */
  driveTimer: number;
  plannedRelease: number | null;
  nextMoveAt: number;
  nextThinkAt: number;
  checkDelay: number;
}

/**
 * Drives every CPU player on one team. Call `update` once per frame; it
 * returns one input per pid handed to the constructor, in that order.
 */
export class SquadController {
  private personas: Persona[] = [];
  private rng: Rng;
  private profile: AiProfile;
  private team: Side;

  constructor(team: Side, pids: number[], difficulty: Difficulty, seed: number) {
    this.team = team;
    this.rng = new Rng(seed >>> 0 || 11);
    this.profile = DIFFICULTY_PRESETS[difficulty];
    this.personas = pids.map((pid) => ({
      pid,
      arch: { three: 0, mid: 0, inside: 0, boards: 0, handle: 0, spots: [] },
      spotIdx: 0,
      cutTimer: 0,
      driveTimer: 0,
      plannedRelease: null,
      nextMoveAt: 0,
      nextThinkAt: 0,
      checkDelay: 0,
    }));
  }

  update(state: MatchState, dt: number): Map<number, PlayerInput> {
    const out = new Map<number, PlayerInput>();
    for (const persona of this.personas) {
      // Archetypes come from the live cfg so a roster swap never goes stale.
      if (persona.arch.spots.length === 0) persona.arch = archetypeOf(state.players[persona.pid].cfg);
      out.set(persona.pid, this.updateOne(state, persona, dt));
    }
    return out;
  }

  private updateOne(state: MatchState, persona: Persona, dt: number): PlayerInput {
    const input = emptyInput();
    const me = state.players[persona.pid];

    if (state.phase === 'freeThrow') {
      if (state.freeThrow?.side === persona.pid) this.shootFreeThrow(me, persona, input);
      return input;
    }

    if (state.phase !== 'live') {
      // Check the ball in when this player is holding it at the check.
      if (state.phase === 'checkball' && state.config.manualCheck && state.check?.from === persona.pid) {
        persona.checkDelay = persona.checkDelay > 0 ? persona.checkDelay - dt : this.rng.range(0.5, 1.1);
        if (persona.checkDelay <= 0) input.shoot = true;
      } else {
        persona.checkDelay = 0;
      }
      return input;
    }

    const ball = state.ball;
    const hasBall = ball.owner === persona.pid && ball.state === 'held';
    if (hasBall) {
      this.onBall(state, persona, me, input, dt);
    } else if (ball.state === 'loose') {
      this.chaseOrRecover(state, persona, me, input);
    } else if (ball.state === 'shot') {
      this.crashBoards(state, persona, me, input);
    } else if (ball.owner !== null && state.players[ball.owner].side === this.team) {
      this.offBall(state, persona, me, input, dt);
    } else {
      this.defense(state, persona, me, input, dt);
    }
    input.moveShoot = input.shoot;
    return input;
  }

  // ----------------------------------------------------------------- offense

  private onBall(state: MatchState, persona: Persona, me: SimPlayer, input: PlayerInput, dt: number): void {
    const arch = persona.arch;
    const opp = this.nearestOpp(state, me);
    const rimDist = distanceToRim(me.x, me.z);
    const defDist = Math.hypot(opp.x - me.x, opp.z - me.z);

    // A running meter: release at the ideal point, give or take the hands
    // this difficulty has.
    if (me.state === 'shooting' && me.shotProfile) {
      if (persona.plannedRelease === null) {
        const error = this.gaussian() * this.profile.releaseError;
        persona.plannedRelease = Math.max(0.25, me.shotProfile.idealPoint + error);
      }
      const progress = me.shotElapsed / me.shotProfile.meterDuration;
      input.shoot = progress < persona.plannedRelease;
      if (!input.shoot) persona.plannedRelease = null;
      return;
    }
    persona.plannedRelease = null;

    if (state.needsClear) {
      const out = away(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = out.x;
      input.mz = out.z;
      input.sprint = true;
      return;
    }

    // A committed drive plays out before anything is re-decided.
    if (persona.driveTimer > 0) {
      persona.driveTimer -= dt;
      const toRim = toward(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = toRim.x;
      input.mz = toRim.z;
      input.sprint = true;
      if (rimDist < 9) input.drive = true;
      if (rimDist < 3) persona.driveTimer = 0;
      return;
    }

    // ---- the pass decision -------------------------------------------------
    // A teammate calling for it gets it unless this player has something
    // genuinely better: they are open in their own spot, or a lane is there.
    // That is the whole contract of TAB — a request, honoured by default,
    // refused by a player who is right to refuse it.
    const myOpen = defDist;
    const spotFit = this.spotFit(arch, me);
    const best = this.mostOpenMate(state, me);
    const called = state.passRequest && state.players[state.passRequest.pid].side === this.team;

    if (called && state.passRequest) {
      const caller = state.players[state.passRequest.pid];
      const callerOpen = this.openness(state, caller);
      const iAmCooking = (myOpen > 4.2 && spotFit > 0.55) || (rimDist < 12 && myOpen > 3 && arch.inside > 0.5);
      if (!iAmCooking && callerOpen > 1.8 && this.rng.chance(dt * 14)) {
        input.pass = true;
        return;
      }
    }

    // Covered with an open man: move it. Playmakers look for it sooner.
    if (best && myOpen < 2.3 && best.open > myOpen + 2 && this.rng.chance(dt * (2.5 + arch.handle * 3))) {
      input.pass = true;
      return;
    }

    // Feed the post: a big sealed deep gets his touch. This is how a paint
    // beast gets to be one — somebody has to actually throw him the ball.
    for (const pid of state.teams[this.team]) {
      if (pid === me.pid) continue;
      const mate = state.players[pid];
      const mateArch = archetypeOf(mate.cfg);
      if (mateArch.inside < 0.55) continue;
      if (distanceToRim(mate.x, mate.z) > 12) continue;
      if (this.openness(state, mate) < 1.7) continue;
      if (this.rng.chance(dt * (1.6 + this.profile.shotSelection * 2))) {
        input.pass = true;
        return;
      }
    }

    // A big who just cleared his own board is an outlet, not an initiator:
    // he hands it to the handle and goes back to work inside.
    if (arch.handle < 0.45 && rimDist > 18 && best && best.open > 3 && this.rng.chance(dt * 6)) {
      input.pass = true;
      return;
    }

    // With the clock dying and no shot of his own, a player moves it before
    // he heaves it — the bail-out pass is the difference between a big man
    // and a big man taking threes.
    if (state.shotClock < 5 && state.shotClock > 0.8 && spotFit < 0.35 && best && best.open > 2.2) {
      if (this.rng.chance(dt * 18)) {
        input.pass = true;
        return;
      }
    }

    // ---- the shot decision -------------------------------------------------
    const openness = Math.max(0, Math.min(1, (defDist - 1.8) / 4.2)) + opp.stagger * 0.6;
    const clockPressure = Math.max(0, 1 - state.shotClock / 9);
    const urge = (openness * 0.9 + clockPressure * 1.4) * this.profile.shotSelection * (0.35 + spotFit);
    const desperate = state.shotClock < 2.2 && rimDist < 30;
    const goodShot = rimDist < 26 && me.stamina > 0.22 && openness > 0.2 && (spotFit > 0.3 || desperate);

    if ((goodShot && this.rng.chance(urge * dt * 9)) || desperate) {
      if (rimDist < 14 && arch.inside > 0.45 && arch.inside >= arch.three) {
        persona.driveTimer = 1.2;
      } else {
        input.shoot = true;
      }
      return;
    }

    // An interior player who finds himself outside his life does not settle —
    // he backs it down toward the block, and hurries once the clock says so.
    if (arch.inside > arch.three + 0.15 && rimDist > 15) {
      const toRim = toward(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = toRim.x;
      input.mz = toRim.z;
      input.sprint = defDist > 3 || state.shotClock < 8;
      return;
    }

    // And a shooter caught a step inside the line steps back out to it: the
    // long two he refuses to take becomes the three he lives on.
    if (arch.three > arch.mid + 0.15 && !isBeyondArc(me.x, me.z) && rimDist > 11 && defDist > 2.2) {
      const out = away(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = out.x;
      input.mz = out.z;
      return;
    }

    // Throw a move now and then, gated by the handle this player actually has.
    if (state.time >= persona.nextMoveAt && defDist < 6.5 && me.stamina > 0.35 && arch.handle > 0.25) {
      persona.nextMoveAt = state.time + this.rng.range(0.9, 2.2) / Math.max(0.2, this.profile.moveRate * (0.4 + arch.handle));
      input.move = this.pickMove(me);
      input.moveDirX = this.rng.range(-1, 1);
      input.moveDirZ = -this.rng.range(0.2, 0.9);
      return;
    }

    // Otherwise probe: shooters hunt space on the arc, bigs work downhill.
    const fromDef = away(opp.x, opp.z, me.x, me.z);
    const anchor = arch.spots[persona.spotIdx % arch.spots.length];
    const toAnchor = toward(anchor.x, anchor.z, me.x, me.z);
    input.mx = fromDef.x * 0.45 + toAnchor.x * 0.55;
    input.mz = fromDef.z * 0.45 + toAnchor.z * 0.55;
    input.sprint = defDist < 3 && me.stamina > 0.4;
  }

  private offBall(state: MatchState, persona: Persona, me: SimPlayer, input: PlayerInput, dt: number): void {
    const arch = persona.arch;
    const handler = state.ball.owner !== null ? state.players[state.ball.owner] : me;

    // Committed cut: finish it.
    if (persona.cutTimer > 0) {
      persona.cutTimer -= dt;
      const toRim = toward(COURT.rimX, COURT.rimZ, me.x, me.z);
      input.mx = toRim.x;
      input.mz = toRim.z;
      input.sprint = true;
      return;
    }

    if (state.time >= persona.nextThinkAt) {
      persona.nextThinkAt = state.time + this.rng.range(0.7, 1.6);
      // Rotate spots so the floor keeps moving.
      if (this.rng.chance(0.45)) persona.spotIdx++;
      // A big whose man turned to watch the ball cuts to the front of the rim.
      const guard = this.nearestOpp(state, me);
      const guardDist = Math.hypot(guard.x - me.x, guard.z - me.z);
      if (arch.inside > 0.5 && guardDist > 4 && distanceToRim(me.x, me.z) < 20 && this.rng.chance(0.3 + arch.inside * 0.3)) {
        persona.cutTimer = 0.9;
        return;
      }
    }

    // Work to my spot, but never crowd the man with the ball.
    const anchor = this.pickSpot(persona, me, handler);
    const dx = anchor.x - me.x;
    const dz = anchor.z - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.2) {
      input.mx = dx / dist;
      input.mz = dz / dist;
      input.sprint = dist > 8 && me.stamina > 0.35;
    }
    const fromHandler = Math.hypot(handler.x - me.x, handler.z - me.z);
    if (fromHandler < 6) {
      const spread = away(handler.x, handler.z, me.x, me.z);
      input.mx = spread.x;
      input.mz = spread.z;
    }
  }

  /** The spot this trip: my archetype's, avoiding whichever side the ball is on. */
  private pickSpot(persona: Persona, me: SimPlayer, handler: SimPlayer): { x: number; z: number } {
    const spots = persona.arch.spots;
    const idx = persona.spotIdx % spots.length;
    const spot = spots[idx];
    // If the handler is driving my side of the floor, take the mirror spot.
    if (Math.sign(spot.x) === Math.sign(handler.x) && Math.abs(handler.x) > 4) {
      const mirror = spots.find((s) => Math.sign(s.x) === -Math.sign(spot.x));
      if (mirror) return mirror;
    }
    void me;
    return spot;
  }

  // ----------------------------------------------------------------- defense

  private defense(state: MatchState, persona: Persona, me: SimPlayer, input: PlayerInput, dt: number): void {
    const myMan = matchupOf(state, persona.pid);
    const handler = state.ball.owner !== null ? state.players[state.ball.owner] : null;
    const guardingHandler = handler !== null && myMan.pid === handler.pid;

    // Help: the handler has beaten his man to the rim and I am the deepest
    // helper — leave my man and protect the basket. helpIq decides how often
    // the rotation actually comes.
    if (handler && !guardingHandler) {
      const handlerRim = distanceToRim(handler.x, handler.z);
      const primary = matchupOf(state, handler.pid);
      const beaten = distanceToRim(primary.x, primary.z) > handlerRim + 2.5;
      const myRim = distanceToRim(me.x, me.z);
      if (beaten && handlerRim < 12 && myRim < 16 && this.rng.chance(this.profile.helpIq * dt * 6)) {
        const spot = toward(COURT.rimX, COURT.rimZ, handler.x, handler.z);
        const tx = COURT.rimX - spot.x * 4;
        const tz = COURT.rimZ - spot.z * 4;
        const dir = toward(tx, tz, me.x, me.z);
        input.mx = dir.x;
        input.mz = dir.z;
        input.sprint = true;
        if (handler.state === 'finishing' || handler.y > 0.3) {
          if (Math.hypot(handler.x - me.x, handler.z - me.z) < 4.5 && this.rng.chance(this.profile.contestIq)) {
            input.contest = true;
          }
        }
        return;
      }
    }

    const target = guardingHandler && handler ? handler : myMan;
    const dist = Math.hypot(target.x - me.x, target.z - me.z);

    // Stand goalside: between my man and the rim, tighter on a shooter.
    const theirArch = archetypeOf(target.cfg);
    let standoff = this.profile.standoff;
    if (isBeyondArc(target.x, target.z) && theirArch.three > 0.55) standoff = Math.max(1.6, standoff - 1.2);
    if (!guardingHandler) standoff += 1.6; // sag off the ball

    const toRim = toward(COURT.rimX, COURT.rimZ, target.x, target.z);
    const tx = target.x + toRim.x * standoff;
    const tz = target.z + toRim.z * standoff;
    const dx = tx - me.x;
    const dz = tz - me.z;
    const away2 = Math.hypot(dx, dz);
    if (away2 > 0.25) {
      input.mx = dx / away2;
      input.mz = dz / away2;
      input.sprint = away2 > 2.2 && me.stamina > 0.2;
    }

    if (!guardingHandler || !handler) return;

    // On-ball: contests, fake bites, and the occasional gamble — the same
    // difficulty levers the 1v1 bot plays with.
    if (handler.fakeTimer > 0.2 && dist < 6 && me.y === 0) {
      if (this.rng.chance(this.profile.bitesOnFakes * dt * 9)) input.contest = true;
    }
    if (handler.state === 'shooting' && handler.shotProfile) {
      const progress = handler.shotElapsed / handler.shotProfile.meterDuration;
      const jumpAt = 0.42 + (1 - this.profile.contestIq) * 0.5;
      if (progress > jumpAt && dist < 7 && this.rng.chance(this.profile.contestIq)) input.contest = true;
      else if (dist < 8) input.contest = progress > 0.2;
    }
    if (handler.state === 'finishing' || (handler.y > 0.3 && distanceToRim(handler.x, handler.z) < 6)) {
      if (dist < 4.5 && this.rng.chance(this.profile.contestIq * 1.1)) input.contest = true;
    }
    const vulnerable = handler.state === 'moveLock';
    if (dist < 3.4 && me.stealCooldown <= 0) {
      const p = this.profile.stealAggression * (vulnerable ? 2.4 : 0.3) * dt * 8;
      if (this.rng.chance(p)) input.steal = true;
    }
  }

  // ------------------------------------------------------------ scramble play

  private chaseOrRecover(state: MatchState, persona: Persona, me: SimPlayer, input: PlayerInput): void {
    const ball = state.ball;
    // The two hungriest boards on the team go get it; the third gets back.
    const rank = this.chaseRank(state, persona);
    if (rank < 2) {
      const leadT = 0.22;
      const dir = toward(ball.x + ball.vx * leadT, ball.z + ball.vz * leadT, me.x, me.z);
      input.mx = dir.x;
      input.mz = dir.z;
      input.sprint = true;
      if (ball.y > 5 && Math.hypot(ball.x - me.x, ball.z - me.z) < 3) input.contest = true;
    } else {
      const back = toward(0, 24, me.x, me.z);
      input.mx = back.x * 0.6;
      input.mz = back.z * 0.6;
    }
  }

  private crashBoards(state: MatchState, persona: Persona, me: SimPlayer, input: PlayerInput): void {
    const arch = persona.arch;
    // Rebounders crash the rim while the shot is up; everyone else holds
    // ground or leaks back.
    if (arch.boards > 0.45 || this.chaseRank(state, persona) === 0) {
      const dir = toward(COURT.rimX, COURT.rimZ + 2.5, me.x, me.z);
      const dist = distanceToRim(me.x, me.z);
      if (dist > 4) {
        input.mx = dir.x;
        input.mz = dir.z;
        input.sprint = dist > 9;
      }
    }
  }

  /** My rank among teammates by (boards appetite, then distance to the ball). */
  private chaseRank(state: MatchState, persona: Persona): number {
    const ball = state.ball;
    const scores = this.personas.map((per) => {
      const p = state.players[per.pid];
      const d = Math.hypot(ball.x - p.x, ball.z - p.z);
      return { pid: per.pid, score: d - per.arch.boards * 6 };
    });
    scores.sort((a, b) => a.score - b.score);
    return scores.findIndex((s) => s.pid === persona.pid);
  }

  // ---------------------------------------------------------------- helpers

  private shootFreeThrow(me: SimPlayer, persona: Persona, input: PlayerInput): void {
    if (me.state !== 'shooting') {
      persona.plannedRelease = null;
      input.shoot = true;
      return;
    }
    if (!me.shotProfile) return;
    if (persona.plannedRelease === null) {
      const error = this.gaussian() * this.profile.releaseError * 0.65;
      persona.plannedRelease = Math.max(0.3, me.shotProfile.idealPoint + error);
    }
    const progress = me.shotElapsed / me.shotProfile.meterDuration;
    input.shoot = progress < persona.plannedRelease;
    if (!input.shoot) persona.plannedRelease = null;
  }

  private nearestOpp(state: MatchState, me: SimPlayer): SimPlayer {
    let best: SimPlayer = me;
    let bestDist = Infinity;
    for (const p of state.players) {
      if (p.side === me.side) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private openness(state: MatchState, p: SimPlayer): number {
    const guard = this.nearestOpp(state, p);
    return Math.hypot(guard.x - p.x, guard.z - p.z);
  }

  private mostOpenMate(state: MatchState, me: SimPlayer): { pid: number; open: number } | null {
    let best: { pid: number; open: number } | null = null;
    for (const pid of state.teams[this.team]) {
      if (pid === me.pid) continue;
      const mate = state.players[pid];
      if (mate.state === 'fallen' || mate.state === 'staggered') continue;
      const open = this.openness(state, mate);
      if (!best || open > best.open) best = { pid, open };
    }
    return best;
  }

  /** How much this spot on the floor is this player's shot, 0..1. */
  private spotFit(arch: Archetype, me: SimPlayer): number {
    const rim = distanceToRim(me.x, me.z);
    if (isBeyondArc(me.x, me.z)) return arch.three;
    if (rim < 10) return Math.max(arch.inside, 0.25);
    // The long two. A shooter one step inside the line does not settle for it
    // — the whole point of being a sniper is that step back — and a paint
    // player out here has no shot at all. It is only really a shot for the
    // genuine mid-range player.
    const sniper = arch.three > arch.mid + 0.15 ? 0.35 : 1;
    return arch.mid * 0.7 * sniper;
  }

  private pickMove(me: SimPlayer): DribbleMoveId {
    const legal = DRIBBLE_MOVES.filter((m) => {
      if (m.id === 'euro') return false;
      if (me.cfg.attrs[m.gate] < m.requires) return false;
      if (m.signature) return this.profile.moveTier >= 2;
      if (m.requires > 0) return this.profile.moveTier >= 1;
      return true;
    });
    if (!legal.length) return 'crossover';
    return this.rng.pick(legal).id;
  }

  private gaussian(): number {
    const u = Math.max(1e-6, this.rng.next());
    const v = this.rng.next();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-2.5, Math.min(2.5, g));
  }
}

function toward(tx: number, tz: number, fx: number, fz: number): { x: number; z: number } {
  const dx = tx - fx;
  const dz = tz - fz;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return { x: 0, z: 0 };
  return { x: dx / len, z: dz / len };
}

function away(tx: number, tz: number, fx: number, fz: number): { x: number; z: number } {
  const dir = toward(tx, tz, fx, fz);
  return { x: -dir.x, z: -dir.z };
}
