import type { ShotProfile, ShotType, ShotGrade } from '../shooting.ts';
import type { Attributes, BadgeState, Position } from '../types.ts';
import type { DribbleMoveId } from './moves.ts';

export type Side = 0 | 1;

/** Per-frame input. Edge-triggered fields are set for exactly one frame. */
export interface PlayerInput {
  /** movement axis, -1..1 each */
  mx: number;
  mz: number;
  sprint: boolean;
  /** held while the shot meter is running */
  shoot: boolean;
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
}

export function emptyInput(): PlayerInput {
  return {
    mx: 0,
    mz: 0,
    sprint: false,
    shoot: false,
    drive: false,
    move: null,
    moveDirX: 0,
    moveDirZ: 0,
    steal: false,
    contest: false,
    fake: false,
  };
}

export type PlayerActState =
  | 'idle'
  | 'dribble'
  | 'moveLock'
  | 'shooting'
  | 'finishing'
  | 'airborne'
  | 'landing'
  | 'staggered'
  | 'contesting'
  | 'stealing'
  | 'celebrating';

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
}

export interface SimPlayer {
  side: Side;
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
  /** shot in flight from this player */
  shotElapsed: number;
  shotProfile: ShotProfile | null;
  shotType: ShotType;
  shotFromX: number;
  shotFromZ: number;
  shotIsThree: boolean;
  shotDrift: number;
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
  /** chained-move counter for Tight Handles */
  comboCount: number;
  comboTimer: number;
}

export type BallState = 'held' | 'shot' | 'loose' | 'dunking' | 'dead';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: BallState;
  owner: Side | null;
  /** pre-resolved outcome of the shot currently in flight */
  shotWillGoIn: boolean;
  shotBy: Side | null;
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
  /** true once the ball has passed the rim plane and can be rebounded */
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

export type SimEvent =
  | { type: 'shotRelease'; side: Side; grade: ShotGrade; made: boolean; value: 1 | 2; timingError: number; shotType: ShotType }
  | { type: 'score'; side: Side; value: 1 | 2; score: [number, number] }
  | { type: 'miss'; side: Side }
  | { type: 'rebound'; side: Side; offensive: boolean }
  | { type: 'steal'; side: Side }
  | { type: 'block'; side: Side; chaseDown: boolean }
  | { type: 'ankleBreaker'; side: Side }
  | { type: 'move'; side: Side; move: DribbleMoveId }
  | { type: 'contactDunk'; side: Side }
  | { type: 'dunk'; side: Side }
  | { type: 'turnover'; side: Side; reason: 'shotClock' | 'outOfBounds' | 'strip' }
  | { type: 'clear'; side: Side }
  | { type: 'foul'; on: Side; by: Side; shots: number }
  | { type: 'freeThrow'; side: Side; made: boolean; remaining: number }
  | { type: 'phase'; phase: MatchPhase }
  | { type: 'gameOver'; winner: Side; score: [number, number] };

export interface MatchState {
  frame: number;
  time: number;
  rngState: number;
  phase: MatchPhase;
  phaseTimer: number;
  players: [SimPlayer, SimPlayer];
  ball: Ball;
  score: [number, number];
  possession: Side;
  /** offence must take the ball back past the arc before scoring */
  needsClear: boolean;
  shotClock: number;
  clock: number;
  stats: [PlayerMatchStats, PlayerMatchStats];
  /** set while the game is stopped at the stripe */
  freeThrow: { side: Side; remaining: number } | null;
  /** a side that was holding shoot when it checked in; its shoot is ignored
   *  until released, so checking in never launches a shot */
  checkGuard: [boolean, boolean];
  /** the check-in ceremony: the ball is passed out and passed back */
  check: { stage: 'wait' | 'out' | 'back'; timer: number; from: Side; to: Side } | null;
  events: SimEvent[];
  config: MatchConfig;
  winner: Side | null;
}
