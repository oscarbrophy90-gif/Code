import type { MatchConfig, PlayerInput, SimPlayerConfig, Side } from './sim/state.ts';
import type { Playlist, Region } from './types.ts';

export const PROTOCOL_VERSION = 1;
/** Client input send rate. */
export const INPUT_HZ = 60;
/** Server authoritative snapshot rate. */
export const SNAPSHOT_HZ = 20;
/** Server sim rate. Must match SIM_DT. */
export const TICK_HZ = 120;

// -------------------------------------------------------------- client → server

export type ClientMessage =
  | { t: 'hello'; version: number; token: string; displayName: string; region: Region }
  | { t: 'queue'; playlist: Playlist; player: SimPlayerConfig; rankPoints: number; parkId: string }
  | { t: 'cancelQueue' }
  | { t: 'createPrivate'; player: SimPlayerConfig; config: Partial<MatchConfig> }
  | { t: 'joinPrivate'; code: string; player: SimPlayerConfig }
  | { t: 'ready' }
  | { t: 'input'; frame: number; input: PackedInput }
  | { t: 'ping'; sent: number }
  | { t: 'leaveMatch' }
  | { t: 'leaderboard'; scope: 'world' | 'region'; region?: Region }
  | { t: 'saveProfile'; blob: string; revision: number }
  | { t: 'loadProfile' };

// -------------------------------------------------------------- server → client

export type ServerMessage =
  | { t: 'welcome'; userId: string; serverTime: number; version: number }
  | { t: 'queued'; playlist: Playlist; estimateSeconds: number; searching: { min: number; max: number } }
  | { t: 'queueUpdate'; waited: number; searching: { min: number; max: number }; playersInQueue: number }
  | { t: 'privateCreated'; code: string }
  | { t: 'matchFound'; matchId: string; side: Side; opponent: SimPlayerConfig; opponentRank: number; config: MatchConfig; seed: number; startsInMs: number }
  | { t: 'matchStart'; serverFrame: number; serverTime: number }
  | { t: 'snapshot'; frame: number; ack: number; state: PackedSnapshot }
  | { t: 'opponentInput'; frame: number; input: PackedInput }
  | { t: 'matchEnd'; winner: Side; score: [number, number]; rankDelta: number; rankAfter: number; reason: 'played' | 'forfeit' | 'disconnect' }
  | { t: 'pong'; sent: number; serverTime: number }
  | { t: 'leaderboard'; scope: 'world' | 'region'; entries: LeaderboardEntry[] }
  | { t: 'profile'; blob: string | null; revision: number }
  | { t: 'error'; code: string; message: string }
  | { t: 'kicked'; reason: string };

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  region: Region;
  rankPoints: number;
  wins: number;
  losses: number;
  overall: number;
  winStreak: number;
}

// ------------------------------------------------------------------- packing

/**
 * Inputs pack into a single integer plus two quantised axes. At 60 Hz this is
 * roughly 4 bytes of payload per frame per player before framing.
 */
export interface PackedInput {
  /** bit flags */
  f: number;
  /** movement axes quantised to -127..127 */
  mx: number;
  mz: number;
  /** move direction axes, quantised */
  dx: number;
  dz: number;
  /** dribble move index + 1, 0 = none */
  m: number;
  /** emote slot + 1, 0 = none */
  e: number;
}

export const INPUT_FLAGS = {
  sprint: 1 << 0,
  shoot: 1 << 1,
  drive: 1 << 2,
  steal: 1 << 3,
  contest: 1 << 4,
  fake: 1 << 5,
  moveShoot: 1 << 6,
} as const;

const MOVE_ORDER = [
  'crossover',
  'behindBack',
  'betweenLegs',
  'hesitation',
  'sizeUp',
  'spin',
  'stepback',
  'euro',
  'hopJumper',
  'doubleCross',
  'shamgod',
  'snatchBack',
] as const;

const q = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const dq = (v: number) => v / 127;

export function packInput(input: PlayerInput): PackedInput {
  let f = 0;
  if (input.sprint) f |= INPUT_FLAGS.sprint;
  if (input.shoot) f |= INPUT_FLAGS.shoot;
  if (input.drive) f |= INPUT_FLAGS.drive;
  if (input.steal) f |= INPUT_FLAGS.steal;
  if (input.contest) f |= INPUT_FLAGS.contest;
  if (input.fake) f |= INPUT_FLAGS.fake;
  if (input.moveShoot) f |= INPUT_FLAGS.moveShoot;
  const m = input.move ? MOVE_ORDER.indexOf(input.move as (typeof MOVE_ORDER)[number]) + 1 : 0;
  return {
    f,
    mx: q(input.mx),
    mz: q(input.mz),
    dx: q(input.moveDirX),
    dz: q(input.moveDirZ),
    m,
    e: input.emote === null ? 0 : input.emote + 1,
  };
}

export function unpackInput(p: PackedInput): PlayerInput {
  return {
    mx: dq(p.mx),
    mz: dq(p.mz),
    moveDirX: dq(p.dx),
    moveDirZ: dq(p.dz),
    sprint: (p.f & INPUT_FLAGS.sprint) !== 0,
    shoot: (p.f & INPUT_FLAGS.shoot) !== 0,
    moveShoot: (p.f & INPUT_FLAGS.moveShoot) !== 0,
    drive: (p.f & INPUT_FLAGS.drive) !== 0,
    steal: (p.f & INPUT_FLAGS.steal) !== 0,
    contest: (p.f & INPUT_FLAGS.contest) !== 0,
    fake: (p.f & INPUT_FLAGS.fake) !== 0,
    move: p.m > 0 ? (MOVE_ORDER[p.m - 1] as PlayerInput['move']) : null,
    emote: p.e > 0 ? p.e - 1 : null,
  };
}

/** Minimal authoritative state a client needs to reconcile against. */
export interface PackedSnapshot {
  f: number;
  /** [x, z, y, vx, vz, vy, facing, stamina, stagger, stateId] per player */
  p: number[][];
  /** [x, y, z, vx, vy, vz, stateId, owner] */
  b: number[];
  sc: [number, number];
  pos: Side;
  clear: 0 | 1;
  shot: number;
  phase: number;
  rng: number;
}

export const PHASE_IDS = ['warmup', 'checkball', 'live', 'deadball', 'freeThrow', 'over'] as const;
export const BALL_STATE_IDS = ['held', 'shot', 'loose', 'dunking', 'dead'] as const;
export const ACT_STATE_IDS = [
  'idle',
  'dribble',
  'moveLock',
  'shooting',
  'finishing',
  'airborne',
  'landing',
  'staggered',
  'fallen',
  'contesting',
  'stealing',
  'emoting',
  'celebrating',
] as const;
