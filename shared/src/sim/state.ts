import type { ShotProfile, ShotType, ShotGrade } from '../shooting.ts';
import type { Attributes, BadgeState, Position } from '../types.ts';
import type { DribbleMoveId } from './moves.ts';

/**
 * A team. The sim was born 1v1, where "side" and "player" were the same thing;
 * teams made them different. A `Side` is still 0 or 1 and still means "which
 * basket you score on" — but a player is now identified by `pid`, their index
 * in `MatchState.players`, and one side can field several of them. In 1v1 the
 * pids are 0 and 1 and equal the sides, which is what keeps every 1v1 game
 * (and every ranked game) exactly the sim it always was.
 */
export type Side = 0 | 1;

/** Per-frame input. Edge-triggered fields are set for exactly one frame. */
export interface PlayerInput {
  /** movement axis, -1..1 each */
  mx: number;
  mz: number;
  sprint: boolean;
  /** held while the shot meter is running */
  shoot: boolean;
  /**
   * Held on the dribble move's own key. A stepback is thrown and timed on one
   * button: press to step back, keep holding to raise the meter, let go to
   * shoot. Shoot alone never fires a stepback, so the two are never fighting
   * over the same press.
   */
  moveShoot: boolean;
  /** held to drive to the rim / finish */
  drive: boolean;
  /** edge-triggered dribble move request */
  move: DribbleMoveId | null;
  /** direction the move is aimed, normalised */
  moveDirX: number;
  moveDirZ: number;
  /** edge-triggered strip attempt */
  steal: boolean;
  /** held to contest / jump / block */
  contest: boolean;
  /** edge-triggered pump fake */
  fake: boolean;
  /**
   * Edge-triggered, context-sensitive: with the ball it throws a pass to the
   * best-placed teammate, without it it calls for one. In 1v1 there is nobody
   * to throw to, so it does nothing at all.
   */
  pass: boolean;
  /**
   * Edge-triggered emote slot, 0-5, or null. Emotes are cosmetic but they are
   * not free: you hold the ball out on a bounce while you do it, which is why
   * the simulation has to own them rather than the renderer.
   */
  emote: number | null;
}

export function emptyInput(): PlayerInput {
  return {
    mx: 0,
    mz: 0,
    sprint: false,
    shoot: false,
    moveShoot: false,
    drive: false,
    move: null,
    moveDirX: 0,
    moveDirZ: 0,
    steal: false,
    contest: false,
    fake: false,
    pass: false,
    emote: null,
  };
}

export type PlayerActState =
  | 'idle'
  | 'dribble'
  | 'moveLock'
  | 'shooting'
  | 'finishing'
  | 'rimHang'
  | 'airborne'
  | 'landing'
  | 'staggered'
  | 'fallen'
  | 'contesting'
  | 'stealing'
  | 'emoting'
  | 'celebrating';

/**
 * A dunk in flight, written at takeoff and read every frame until the landing.
 *
 * The result is decided before the flight starts — the meter graded the release,
 * or the AI's takeoff roll came up — and the flight is the sim *showing* that
 * result: the player carried from where they left the ground to the front of
 * the rim, the ball in hand the whole way, the slam at the end. Deciding at the
 * rim instead would put the outcome half a second after the input that earned
 * it, which is how a dunk stops feeling like something you did.
 */
export interface DunkFlight {
  fromX: number;
  fromZ: number;
  /** where the feet end up: just in front of the rim */
  toX: number;
  toZ: number;
  /** feet height at the slam, hands over the iron */
  slamY: number;
  duration: number;
  made: boolean;
  /** made *and* green/contact — the ones that earn the hang and the replay */
  emphatic: boolean;
  poster: boolean;
  value: 1 | 2;
  /** seconds hanging on the iron after an emphatic make */
  hang: number;
  /**
   * Where the body hangs: feet directly under the grip point on the near edge
   * of the iron, at a height that puts the drawn hands exactly on the rim.
   * Filled in at the slam — the flight ends at the slam spot and the catch
   * blends from there to here over the first beat of the hang.
   */
  hangX: number;
  hangZ: number;
  hangY: number;
  packageId: string;
  /** pid of the defender a poster drops; -1 when nobody was in the way */
  victim: number;
}

/**
 * Everything the renderer needs to draw a player wearing what they own. It is
 * presentation only — the simulation never reads it — but it lives on the sim
 * config because the renderer only ever gets handed a SimPlayer.
 */
export interface Appearance {
  skinTone: number;
  jerseyPrimary: string;
  jerseySecondary: string;
  shoePrimary: string;
  shoeSecondary: string;
  /** sleeves, tights, hoodie — drawn over the limbs */
  clothingId: string;
  clothingPrimary: string;
  clothingSecondary: string;
  accessoryId: string | null;
  accessoryPrimary: string;
  accessorySecondary: string;
  hairstyleId: string;
  hairPrimary: string;
  tattooId: string;
  jerseyNumber: number;
  /** what sits on each of the 1-6 keys, so the renderer can perform the right one */
  emoteSlots: (string | null)[];
  /** performed on winning the game */
  celebrationId: string;
  /** performed the moment a three drops */
  threeCelebrationId: string;
  /** ranked aura, drawn as light around the figure; null for almost everybody */
  auraId: string | null;
}

/** Static per-player configuration handed to the sim. */
export interface SimPlayerConfig {
  id: string;
  name: string;
  attrs: Attributes;
  badges: BadgeState[];
  heightIn: number;
  weightLb: number;
  wingspanIn: number;
  jumpshotId: string;
  dunkPackageId: string;
  jerseyPrimary: string;
  jerseySecondary: string;
  skinTone: number;
  isBot: boolean;
  /**
   * 0..1 extra danger on this player's handle, set for high-difficulty bots.
   *
   * The sim owns the ankle-breaker maths and knows nothing about AI presets, so
   * the difficulty writes its threat here and the maths reads it. Absent or
   * zero for every human and every bot below Hall of Fame.
   */
  ankleThreat?: number;
  // ---- presentation only. The simulation never reads these. ----
  /** shown on the walkout card */
  position?: Position;
  /** equipped title id, shown under the name on the walkout */
  titleId?: string;
  /** current win streak, shown as a tag on the walkout */
  winStreak?: number;
  /** names of the gear this player is wearing, shown on the walkout */
  gear?: string[];
  /** archetype label for bots, e.g. "Paint Beast" */
  archetype?: string;
  /** what this player is wearing, head to toe */
  appearance?: Appearance;
}

export interface SimPlayer {
  /** which basket this player scores on — the team */
  side: Side;
  /** this player's index in MatchState.players. In 1v1, equal to side. */
  pid: number;
  cfg: SimPlayerConfig;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** feet above the floor */
  y: number;
  vy: number;
  facing: number;
  state: PlayerActState;
  stateTimer: number;
  stamina: number;
  /** current dribble move */
  moveId: DribbleMoveId | null;
  moveTimer: number;
  moveDuration: number;
  moveDirX: number;
  moveDirZ: number;
  /** 0..1, 1 = fully broken down */
  stagger: number;
  staggerTimer: number;
  /**
   * Seconds this player is out of the rebound. A missed dunk sets it: you are
   * ten feet up with your momentum going through the rim, and you do not turn
   * in mid-air and catch your own clang.
   */
  reboundLock: number;
  /** shot in flight from this player */
  shotElapsed: number;
  shotProfile: ShotProfile | null;
  shotType: ShotType;
  /** live dunk choreography; null except between takeoff and landing */
  dunk: DunkFlight | null;
  shotFromX: number;
  shotFromZ: number;
  shotIsThree: boolean;
  shotDrift: number;
  /** this shot's meter is held on the move key rather than on shoot */
  shotOnMoveKey: boolean;
  handUp: boolean;
  contestTimer: number;
  stealCooldown: number;
  moveCooldown: number;
  fakeTimer: number;
  greenStreak: number;
  makeStreak: number;
  /** feet of ground covered this game, feeds the stamina model */
  distanceRun: number;
  /** true once this move has had its fumble roll */
  fumbleChecked: boolean;
  /** which hand the ball is in: -1 left, +1 right. Moves swap it. */
  dribbleHand: -1 | 1;
  /** consecutive ankle breakers taken inside the streak window */
  ankledStreak: number;
  /** seconds left to take another one before the streak resets */
  ankledResetIn: number;
  /** how long the handler has been pinned against the line still pushing out */
  outOfBoundsTimer: number;
  /** seconds left of the emote being performed, 0 when not emoting */
  emoteTimer: number;
  /** which slot is playing, -1 when none */
  emoteSlot: number;
  /** seconds until another emote is allowed */
  emoteCooldown: number;
  /**
   * A celebration in progress. Presentation only — no other rule reads it, so
   * it can never interfere with the state machine the way a real act state
   * would.
   */
  celebration: 'win' | 'three' | null;
  celebrationTimer: number;
  /** chained-move counter for Tight Handles */
  comboCount: number;
  comboTimer: number;
}

export type BallState = 'held' | 'shot' | 'pass' | 'loose' | 'dunking' | 'dead';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  /** pid of the player holding or carrying it */
  owner: number | null;
  /** pre-resolved outcome of the shot currently in flight */
  shotWillGoIn: boolean;
  /** pid of the shooter of the shot in flight */
  shotBy: number | null;
  /** pid the pass in flight is going to */
  passTo: number | null;
  /** pid who threw the pass in flight — a tip is charged to them */
  passFrom: number | null;
  shotValue: 1 | 2;
  shotGrade: ShotGrade | null;
  /** seconds since release, used for the arc */
  flightTime: number;
  flightDuration: number;
  /** cached launch point for arc interpolation */
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  apex: number;
  /**
   * True once a loose ball can actually be gathered. A ball still climbing off
   * the iron is nobody's yet — it goes up before it comes down, and the
   * rebound is the race to where it lands. Balls that come loose off a hand
   * (a strip, a swat) are live immediately.
   */
  settled: boolean;
}

export type MatchPhase = 'warmup' | 'checkball' | 'live' | 'deadball' | 'freeThrow' | 'over';

export interface MatchConfig {
  targetScore: number;
  winBy: number;
  maxScore: number;
  shotClock: number;
  makeItTakeIt: boolean;
  /**
   * Streetball possession rules: a miss, block or steal hands the ball
   * straight to the other player instead of going to a live rebound battle.
   */
  turnoverOnMiss: boolean;
  /** the offence has to check the ball in before play starts */
  manualCheck: boolean;
  /** practice modes: the ball comes straight back after a make or a miss */
  instantInbound: boolean;
  /** seconds; 0 = untimed, first to target */
  timeLimit: number;
  parkId: string;
  playlist: 'casual' | 'ranked' | 'private' | 'event';
}

export interface PlayerMatchStats {
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  greens: number;
  ankleBreakers: number;
  contactDunks: number;
  chaseDownBlocks: number;
  bestStreak: number;
  ftm: number;
  fta: number;
  foulsDrawn: number;
  foulsCommitted: number;
  /** running teammate-grade style score, -3..+3 mapped later */
  gradePoints: number;
}

export function emptyStats(): PlayerMatchStats {
  return {
    points: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    greens: 0,
    ankleBreakers: 0,
    contactDunks: 0,
    chaseDownBlocks: 0,
    bestStreak: 0,
    ftm: 0,
    fta: 0,
    foulsDrawn: 0,
    foulsCommitted: 0,
    gradePoints: 0,
  };
}

/**
 * Events name the player they happened to by pid — `side` on an event is the
 * actor's pid, not their team. In 1v1 the two are the same number, which is why
 * this was never two fields; team events (`score`'s tally, `gameOver`'s winner)
 * carry teams explicitly.
 */
export type SimEvent =
  | { type: 'shotRelease'; side: number; grade: ShotGrade; made: boolean; value: 1 | 2; timingError: number; shotType: ShotType }
  | { type: 'score'; side: number; value: 1 | 2; score: [number, number] }
  | { type: 'miss'; side: number }
  | { type: 'rebound'; side: number; offensive: boolean }
  | { type: 'steal'; side: number }
  | { type: 'block'; side: number; chaseDown: boolean }
  | { type: 'ankleBreaker'; side: number; floored: boolean }
  | { type: 'move'; side: number; move: DribbleMoveId }
  | { type: 'contactDunk'; side: number }
  | { type: 'dunk'; side: number }
  /** a greened dunk worth cutting away to: the client plays the animation */
  | { type: 'dunkHighlight'; side: number; packageId: string; posterized: boolean; value: 1 | 2; victim: number }
  | { type: 'turnover'; side: number; reason: 'shotClock' | 'outOfBounds' | 'strip' }
  | { type: 'clear'; side: number }
  | { type: 'emote'; side: number; slot: number }
  | { type: 'pass'; from: number; to: number }
  /** a defender knocked a pass down by being in the lane */
  | { type: 'tip'; side: number }
  /** somebody without the ball calling for it */
  | { type: 'passCall'; side: number }
  | { type: 'foul'; on: number; by: number; shots: number }
  | { type: 'freeThrow'; side: number; made: boolean; remaining: number }
  | { type: 'phase'; phase: MatchPhase }
  | { type: 'gameOver'; winner: Side; score: [number, number] };

export interface MatchState {
  frame: number;
  time: number;
  rngState: number;
  phase: MatchPhase;
  phaseTimer: number;
  /** every player on the floor, indexed by pid: team 0's players first */
  players: SimPlayer[];
  /** pids per team, in order — teams[0][0] is team 0's primary handler */
  teams: [number[], number[]];
  ball: Ball;
  score: [number, number];
  possession: Side;
  /** offence must take the ball back past the arc before scoring */
  needsClear: boolean;
  shotClock: number;
  clock: number;
  /** per player, indexed by pid */
  stats: PlayerMatchStats[];
  /** set while the game is stopped at the stripe; side is the shooter's pid */
  freeThrow: { side: number; remaining: number } | null;
  /** a player that was holding shoot when it checked in; its shoot is ignored
   *  until released, so checking in never launches a shot. Indexed by pid. */
  checkGuard: boolean[];
  /** the check-in ceremony: the ball is passed out and passed back (pids) */
  check: { stage: 'wait' | 'out' | 'back'; timer: number; from: number; to: number } | null;
  /** a teammate calling for the ball; the handler's AI reads it */
  passRequest: { pid: number; timer: number } | null;
  events: SimEvent[];
  config: MatchConfig;
  winner: Side | null;
}
