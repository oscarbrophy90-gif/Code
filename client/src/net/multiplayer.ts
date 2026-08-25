import type { PlayerInput, SimPlayerConfig } from '@hoops/shared';

/**
 * Online 1v1 netcode.
 *
 * The server owns the match: it pairs people, counts the readies for the
 * check (0/2 → 2/2), decides when the ball may be checked in, keeps the score
 * and handles disconnects. The basketball itself is simulated by one of the
 * two clients — the host — so the game keeps the exact physics, shooting,
 * animation and rules it already has instead of a second implementation
 * living on the server. The host publishes snapshots; the guest sends input
 * and draws what comes back.
 *
 * Nothing here is reachable from single-player: the CPU modes never call into
 * this file.
 *
 * Court coordinates are x (left/right) and z (toward the basket); y is height.
 */

export type Role = 'host' | 'guest';

/** Casual moves nothing. Ranked moves RP, the rank, and the win/loss record. */
export type OnlineMode = 'casual' | 'ranked';

/**
 * A player's ladder, as the SERVER holds it.
 *
 * The client never computes any of these — it is told them, and it draws them.
 * The rank itself is derived from `rp` locally, which is safe because deriving
 * a label from a server-supplied number cannot disagree with the server.
 */
export interface OnlineProfile {
  accountId: string;
  username: string;
  rp: number;
  wins: number;
  losses: number;
}

export interface MatchFound {
  matchId: string;
  mode: OnlineMode;
  role: Role;
  side: 0 | 1;
  seed: number;
  you: { profile: OnlineProfile; build: SimPlayerConfig | null };
  opponent: { profile: OnlineProfile; build: SimPlayerConfig | null };
}

/** What one finished match did to the ladder. Ranked only; casual reports none. */
export interface MatchResult {
  mode: OnlineMode;
  /** 'scoreline', 'forfeit' or 'disconnect' */
  reason: string;
  won: boolean;
  ranked: boolean;
  you?: OnlineProfile & { delta: number; rpBefore: number };
  opponent?: OnlineProfile & { delta: number; rpBefore: number };
}

/**
 * One frame of the world, as the host sees it.
 *
 * This is the WHOLE match, not a summary of it: everything the guest needs to
 * draw the same game the host is drawing, and nothing the guest is left to work
 * out for itself. The guest runs no simulation — an independent ball is an
 * independent game, and two of those diverge the first time somebody grabs a
 * rebound — so anything missing here is something the two screens can disagree
 * about. The static half (who the players are, their build, their kit, the
 * rules of the game) is set up identically on both clients at tip-off and never
 * travels.
 */
export interface NetSnapshot {
  frame: number;
  t: number;
  /** the simulation's RNG cursor, so the guest is never a different roll */
  rng: number;
  phase: string;
  phaseTimer: number;
  shotClock: number;
  clock: number;
  score: [number, number];
  /** which team is on offence */
  possession: number;
  needsClear: boolean;
  /** the team that won, once the game is over */
  winner: number | null;
  /** the check ceremony, so the guest sees the ball passed out and back */
  check: { stage: string; timer: number; from: number; to: number } | null;
  /** the stripe, so a free throw looks the same on both screens */
  freeThrow: { side: number; remaining: number } | null;
  /** shoot held through a check-in, per player */
  checkGuard: boolean[];
  /** somebody calling for the ball */
  passRequest: { pid: number; timer: number } | null;
  players: NetPlayer[];
  ball: NetBall;
  /**
   * The box score — sent only on the frames it actually changes.
   *
   * Nineteen long-named counters per player is a fifth of the payload, thirty
   * times a second, to re-state numbers that move once a possession. Omitted
   * means unchanged, and the guest keeps what it has.
   */
  stats?: NetStats[];
  /**
   * The host's own input on the frame this went out.
   *
   * Not for simulating — the guest simulates nothing. It is what lets the guest
   * carry the host's player on the course they are actually running for the
   * 33 ms until the next snapshot, instead of standing still and then jumping.
   */
  hostInput: PlayerInput | null;
}

/** Everything about a player that the simulation changes as the game is played. */
export interface NetPlayer {
  x: number; z: number; y: number;
  vx: number; vz: number; vy: number;
  facing: number;
  state: string;
  stateTimer: number;
  stamina: number;
  stagger: number;
  staggerTimer: number;
  reboundLock: number;
  moveId: string | null;
  moveTimer: number;
  moveDuration: number;
  moveDirX: number;
  moveDirZ: number;
  moveCooldown: number;
  dribbleHand: number;
  shotElapsed: number;
  shotType: string;
  shotFromX: number;
  shotFromZ: number;
  shotIsThree: boolean;
  shotDrift: number;
  shotOnMoveKey: boolean;
  /** the raised arm on a contest — the pose, not a statistic */
  handUp: boolean;
  contestTimer: number;
  stealCooldown: number;
  fakeTimer: number;
  greenStreak: number;
  makeStreak: number;
  distanceRun: number;
  fumbleChecked: boolean;
  ankledStreak: number;
  ankledResetIn: number;
  outOfBoundsTimer: number;
  /** just enough of the shot profile for the meter to draw on the guest */
  meter: {
    duration: number;
    ideal: number;
    green: number;
    excellent: number;
    slight: number;
    early: number;
    contested: boolean;
  } | null;
  emoteTimer: number;
  emoteSlot: number;
  emoteCooldown: number;
  celebration: string | null;
  celebrationTimer: number;
  comboCount: number;
  comboTimer: number;
  dunk: unknown | null;
}

export interface NetBall {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  state: string;
  /** who is holding or carrying it — the single answer to "who has the ball" */
  owner: number | null;
  shotBy: number | null;
  passTo: number | null;
  passFrom: number | null;
  shotWillGoIn: boolean;
  shotValue: number;
  shotGrade: string | null;
  flightTime: number;
  flightDuration: number;
  fromX: number; fromY: number; fromZ: number;
  toX: number; toY: number; toZ: number;
  apex: number;
  settled: boolean;
}

/** The box score, so the guest's own end screen is not a different game's. */
export type NetStats = Record<string, number>;

type Sock = {
  id?: string;
  emit: (ev: string, ...a: unknown[]) => void;
  on: (ev: string, fn: (...a: unknown[]) => void) => void;
};

let socket: Sock | null = null;
let connected = false;
let selfId = '';
/** The server's copy of your ladder. Never written locally. */
let selfProfile: OnlineProfile | null = null;

/**
 * Console tracing for online play, throttled per topic.
 *
 * Online is the one mode where something can go wrong on the other end of a
 * wire, so it says what it is doing. Once a second per topic keeps it readable
 * — a 120 Hz simulation logging every frame is not debugging, it is noise.
 * `__mpDebug.verbose(true)` turns the throttle off.
 */
let verbose = false;
let stateSeen = 0;
let inputSeen = 0;
const lastLog: Record<string, number> = {};

export function netTrace(topic: string, message: () => string, force = false): void {
  const now = Date.now();
  if (!force && !verbose && now - (lastLog[topic] ?? -1e9) < 1000) return;
  lastLog[topic] = now;
  console.log(`[online:${topic}]`, message());
}

const debug = netTrace;

// ------------------------------------------------------------------- events

type Handler<T> = (payload: T) => void;
const bus = {
  searching: new Set<Handler<{ mode: OnlineMode }>>(),
  found: new Set<Handler<MatchFound>>(),
  ready: new Set<Handler<{ count: number; total: number }>>(),
  go: new Set<Handler<void>>(),
  ended: new Set<Handler<{ reason: string }>>(),
  state: new Set<Handler<NetSnapshot>>(),
  input: new Set<Handler<PlayerInput>>(),
  score: new Set<Handler<{ score: [number, number] }>>(),
  self: new Set<Handler<OnlineProfile>>(),
  result: new Set<Handler<MatchResult>>(),
};

function fire<T>(set: Set<Handler<T>>, payload: T): void {
  for (const fn of [...set]) fn(payload);
}

export const onSearching = (fn: Handler<{ mode: OnlineMode }>) => sub(bus.searching, fn);
/** Your ladder, straight from the server — the only source of it there is. */
export const onSelfProfile = (fn: Handler<OnlineProfile>) => sub(bus.self, fn);
export const onMatchResult = (fn: Handler<MatchResult>) => sub(bus.result, fn);
export const onMatchFound = (fn: Handler<MatchFound>) => sub(bus.found, fn);
export const onReadyCount = (fn: Handler<{ count: number; total: number }>) => sub(bus.ready, fn);
export const onCheckGo = (fn: Handler<void>) => sub(bus.go, fn);
export const onMatchEnded = (fn: Handler<{ reason: string }>) => sub(bus.ended, fn);
export const onSnapshot = (fn: Handler<NetSnapshot>) => sub(bus.state, fn);
export const onGuestInput = (fn: Handler<PlayerInput>) => sub(bus.input, fn);
export const onScore = (fn: Handler<{ score: [number, number] }>) => sub(bus.score, fn);

function sub<T>(set: Set<Handler<T>>, fn: Handler<T>): () => void {
  set.add(fn);
  return () => set.delete(fn);
}

// --------------------------------------------------------------- connection

export function connectMultiplayer(): void {
  if (socket) return;
  const io = (globalThis as { io?: (...a: unknown[]) => Sock }).io;
  if (typeof io !== 'function') {
    console.info('[Hoops Elite] Socket.IO not available — Online is offline, every other mode is unaffected.');
    return;
  }
  socket = io();
  if (!socket) return;

  socket.on('connect', () => {
    connected = true;
    selfId = socket?.id ?? '';
    console.log('Connected to Hoops Elite multiplayer server', selfId ? `(you are ${selfId})` : '');
  });
  socket.on('disconnect', () => {
    connected = false;
    console.log('Disconnected from Hoops Elite multiplayer server');
    fire(bus.ended, { reason: 'disconnected' });
  });
  socket.on('connect_error', (...a: unknown[]) => console.warn('[Hoops Elite] connection error:', a[0]));

  socket.on('mm:searching', (...a: unknown[]) => {
    const mode = ((a[0] as { mode?: OnlineMode })?.mode ?? 'casual') as OnlineMode;
    console.log(`Searching for a ${mode} opponent...`);
    fire(bus.searching, { mode });
  });

  socket.on('mm:error', (...a: unknown[]) => console.warn('[Hoops Elite] matchmaking refused:', a[0]));

  socket.on('profile:self', (...a: unknown[]) => {
    const profile = a[0] as OnlineProfile;
    selfProfile = profile;
    netTrace('profile', () => `your ladder: ${profile.rp} RP, ${profile.wins}W / ${profile.losses}L`, true);
    fire(bus.self, profile);
  });

  socket.on('match:found', (...a: unknown[]) => {
    const p = a[0] as MatchFound;
    console.log(
      `Opponent found — ${p.mode} match ${p.matchId}, you are the ${p.role} (Player ${p.side + 1}) ` +
        `vs ${p.opponent?.profile?.username ?? 'unknown'} [${p.opponent?.profile?.rp ?? 0} RP]`,
    );
    fire(bus.found, p);
  });

  socket.on('match:result', (...a: unknown[]) => {
    const r = a[0] as MatchResult;
    netTrace(
      'result',
      () =>
        r.ranked
          ? `ranked result (${r.reason}): you ${r.won ? 'won' : 'lost'}, ${r.you?.delta ?? 0} RP -> ${r.you?.rp ?? 0}`
          : `casual result (${r.reason}): you ${r.won ? 'won' : 'lost'} — nothing moved`,
      true,
    );
    fire(bus.result, r);
  });

  socket.on('match:ready', (...a: unknown[]) => {
    const p = a[0] as { count: number; total: number };
    console.log(`Check: ${p.count}/${p.total} ready`);
    fire(bus.ready, p);
  });

  socket.on('match:go', () => {
    console.log('Both players checked in — checking the ball');
    fire(bus.go, undefined);
  });

  socket.on('match:ended', (...a: unknown[]) => {
    const p = (a[0] as { reason?: string }) ?? {};
    console.log(`Online match ended (${p.reason ?? 'unknown'})`);
    fire(bus.ended, { reason: p.reason ?? 'ended' });
  });

  socket.on('match:state', (...a: unknown[]) => {
    const snap = a[0] as NetSnapshot;
    stateSeen++;
    debug('state', () =>
      `match state received — ${stateSeen} so far, phase ${snap.phase}, ball ${snap.ball?.state} ` +
      `owner ${snap.ball?.owner}, score ${snap.score?.join('-')}`);
    fire(bus.state, snap);
  });
  socket.on('match:input', (...a: unknown[]) => {
    const input = a[0] as PlayerInput;
    inputSeen++;
    debug('input', () =>
      `guest input received — ${inputSeen} so far, move (${input.mx?.toFixed?.(2)}, ${input.mz?.toFixed?.(2)}) ` +
      `shoot ${input.shoot} drive ${input.drive} sprint ${input.sprint}`);
    fire(bus.input, input);
  });
  socket.on('match:score', (...a: unknown[]) => fire(bus.score, a[0] as { score: [number, number] }));
}

export function isConnected(): boolean {
  return connected;
}

// ------------------------------------------------------------------ sending

/**
 * Say who you are and what you are playing, and get your ladder back.
 *
 * The build travels here so the SERVER holds it: the opponent is shown the copy
 * the server has, never one handed straight over from another browser.
 */
export function announceSelf(identity: { accountId: string; username: string }, build: SimPlayerConfig): void {
  socket?.emit('profile:hello', { ...identity, build });
}

export function joinMatchmaking(
  mode: OnlineMode,
  identity: { accountId: string; username: string },
  build: SimPlayerConfig,
  rules: { targetScore: number; winBy: number; maxScore: number },
): void {
  socket?.emit('mm:join', { mode, ...identity, build, rules });
}

/** Quitting a live match. Ranked: the server records it as a loss. */
export function sendForfeit(): void {
  socket?.emit('match:forfeit');
}

/** The last ladder the server sent, for screens that open before a refresh. */
export function selfLadder(): OnlineProfile | null {
  return selfProfile;
}

export function leaveMatchmaking(): void {
  socket?.emit('mm:leave');
}

/** SPACE during the check. The server counts; it never counts twice. */
export function sendReady(): void {
  socket?.emit('match:ready');
}

/** Host only: a new check has begun — tip-off, or after a basket. */
export function sendNewCheck(): void {
  socket?.emit('match:newCheck');
}

/** Host only: the authoritative score, after it changed. */
export function sendScore(score: [number, number]): void {
  socket?.emit('match:score', { score });
}

/** Guest only: one frame of input for the host to simulate. */
export function sendInput(input: PlayerInput): void {
  socket?.emit('match:input', input);
}

/** Host only: one snapshot of the world. */
export function sendSnapshot(snap: NetSnapshot): void {
  socket?.emit('match:state', snap);
}

// A read-only window for debugging from the console.
(globalThis as { __mpDebug?: unknown }).__mpDebug = {
  connected: () => connected,
  selfId: () => selfId,
  /** every frame instead of once a second, when something needs a close look */
  verbose: (on = true) => {
    verbose = on;
    console.log(`[online] verbose logging ${on ? 'on' : 'off'}`);
  },
  counts: () => ({ snapshots: stateSeen, guestInputs: inputSeen }),
};
