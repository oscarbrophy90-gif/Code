import {
  clampToCourt,
  generateOpponent,
  hashString,
  makePlayer,
  type SimPlayer,
} from '@hoops/shared';

/**
 * Socket.IO multiplayer: other people, drawn inside the running game.
 *
 * Deliberately a *layer over* the existing match rather than a change to it.
 * The simulation, the ball, the AI, the shooting and the scoring are all
 * untouched and keep running exactly as they always have; this adds remote
 * players as extra bodies the renderer draws, positioned by the server.
 *
 * That is the honest shape for this step. Making remote players part of
 * `MatchState.players` would put them into collisions, rebounds, contests and
 * the AI's reads — which would rewrite the very systems that are meant to stay
 * as they are. Ball, shooting, scoring and game state come later; the hooks
 * for them are at the bottom of this file.
 *
 * Coordinates: the court's ground plane is x (left/right) and z (toward the
 * basket); `y` is height off the floor. The server protocol speaks x/y, so the
 * wire's `y` carries this game's `z`. Mapped in one place, here.
 */

/** What the server sends about a player. Tolerant: servers differ. */
interface WirePlayer {
  id?: string;
  playerId?: string;
  x?: number;
  y?: number;
}

export interface RemotePlayer {
  id: string;
  /** the body the renderer draws — a real SimPlayer, so it looks like a player */
  body: SimPlayer;
  /** where the server last said they are, in court feet */
  targetX: number;
  targetZ: number;
  lastSeen: number;
}

type Listener = () => void;

const remotes = new Map<string, RemotePlayer>();
const listeners = new Set<Listener>();

let socket: { emit: (ev: string, ...a: unknown[]) => void; on: (ev: string, fn: (...a: unknown[]) => void) => void; id?: string } | null = null;
let selfId = '';
let connected = false;

/** Remote bodies get pids well clear of the sim's, so nothing ever collides. */
let nextPid = 1000;

// How often position updates go out, and how far you must move to bother.
const SEND_HZ = 20;
const SEND_INTERVAL = 1000 / SEND_HZ;
const MOVE_EPSILON = 0.05; // feet
let lastSentAt = 0;
let lastSentX = Number.NaN;
let lastSentZ = Number.NaN;

// ------------------------------------------------------------------ connection

/**
 * Connects to the Socket.IO server, if one is there.
 *
 * Safe to call when Socket.IO is absent — opened from `file://`, or served by
 * anything that is not the game server. In that case the game simply carries
 * on single-player, which is what keeps the standalone build working.
 */
export function connectMultiplayer(): void {
  if (socket) return;

  // A read-only window into the multiplayer state, for debugging from the
  // browser console: window.__mpDebug.remotes() / .connected()
  (globalThis as { __mpDebug?: unknown }).__mpDebug = {
    connected: () => connected,
    selfId: () => selfId,
    remotes: () => [...remotes.values()].map((r) => ({ id: r.id, x: r.body.x, z: r.body.z, targetX: r.targetX, targetZ: r.targetZ })),
    lastSent: () => ({ x: lastSentX, z: lastSentZ, at: lastSentAt }),
  };

  const io = (globalThis as { io?: (...a: unknown[]) => typeof socket }).io;
  if (typeof io !== 'function') {
    console.info('[Hoops Elite] Socket.IO not available — running single-player.');
    return;
  }

  socket = io();
  if (!socket) return;

  socket.on('connect', () => {
    connected = true;
    selfId = socket?.id ?? '';
    console.log('Connected to Hoops Elite multiplayer server', selfId ? `(you are ${selfId})` : '');
  });

  socket.on('disconnect', (...args: unknown[]) => {
    connected = false;
    console.log('Disconnected from Hoops Elite multiplayer server', args[0] ?? '');
    // Everyone else goes with the connection; nobody is standing there any more.
    remotes.clear();
    notify();
  });

  socket.on('connect_error', (...args: unknown[]) => {
    console.warn('[Hoops Elite] multiplayer connection error:', args[0]);
  });

  // ---- the five server events -------------------------------------------

  // Everyone already on the court when you arrive.
  socket.on('currentPlayers', (...args: unknown[]) => {
    const payload = args[0];
    const list = toList(payload);
    let added = 0;
    for (const wire of list) {
      const id = idOf(wire);
      if (!id || id === selfId) continue;
      upsert(id, wire);
      added++;
    }
    console.log(`Received currentPlayers — ${added} other player${added === 1 ? '' : 's'} already in the game`);
    notify();
  });

  // Somebody new arrived.
  socket.on('playerJoined', (...args: unknown[]) => {
    const wire = args[0] as WirePlayer;
    const id = idOf(wire);
    if (!id || id === selfId) return;
    upsert(id, wire);
    console.log(`Player joined the game: ${id}`);
    notify();
  });

  // Somebody moved.
  socket.on('playerMoved', (...args: unknown[]) => {
    const wire = args[0] as WirePlayer;
    const id = idOf(wire);
    if (!id || id === selfId) return; // never let the wire move your own player
    upsert(id, wire);
  });

  // Somebody left.
  socket.on('playerLeft', (...args: unknown[]) => {
    const id = idOf(args[0] as WirePlayer) || String(args[0] ?? '');
    if (!id) return;
    if (remotes.delete(id)) {
      console.log(`Player left the game: ${id}`);
      notify();
    }
  });
}

// ------------------------------------------------------------------- sending

/**
 * Sends the local player's real court position, when it has actually changed.
 *
 * Called from the match loop with the live position of the player you are
 * controlling — nothing invented, nothing simulated separately.
 */
export function sendPosition(x: number, z: number, now = Date.now()): void {
  if (!socket || !connected) return;
  const moved = !(Math.abs(x - lastSentX) < MOVE_EPSILON && Math.abs(z - lastSentZ) < MOVE_EPSILON);
  if (!moved) return;
  if (now - lastSentAt < SEND_INTERVAL) return;
  lastSentAt = now;
  lastSentX = x;
  lastSentZ = z;
  // The wire's y is this game's z — see the note at the top of the file.
  socket.emit('playerMovement', { x, y: z });
}

// ------------------------------------------------------------------ readback

export function remotePlayers(): RemotePlayer[] {
  return [...remotes.values()];
}

export function isConnected(): boolean {
  return connected;
}

export function onRosterChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Eases every remote body toward the position the server last reported, and
 * keeps their velocity honest so the renderer's stride and lean read right.
 * Called once per rendered frame from the match screen.
 */
export function updateRemotes(dt: number): void {
  if (dt <= 0) return;
  for (const r of remotes.values()) {
    const prevX = r.body.x;
    const prevZ = r.body.z;
    // Network positions arrive in steps; easing turns them into movement.
    const k = Math.min(1, dt * 12);
    r.body.x += (r.targetX - prevX) * k;
    r.body.z += (r.targetZ - prevZ) * k;
    r.body.vx = (r.body.x - prevX) / dt;
    r.body.vz = (r.body.z - prevZ) / dt;
    const speed = Math.hypot(r.body.vx, r.body.vz);
    if (speed > 0.6) r.body.facing = Math.atan2(r.body.vx, -r.body.vz);
    r.body.state = speed > 0.6 ? 'dribble' : 'idle';
  }
}

// -------------------------------------------------------------------- guests

/** Adds or moves a remote player, building their body the first time. */
function upsert(id: string, wire: WirePlayer): void {
  const spot = clampToCourt(num(wire.x, 0), num(wire.y, 20));
  let r = remotes.get(id);
  if (!r) {
    r = { id, body: makeRemoteBody(id, spot.x, spot.z), targetX: spot.x, targetZ: spot.z, lastSeen: Date.now() };
    remotes.set(id, r);
    return;
  }
  r.targetX = spot.x;
  r.targetZ = spot.z;
  r.lastSeen = Date.now();
}

/**
 * A body for a remote player, built with the game's own player generator so
 * they turn up wearing a real kit, a real build and real proportions — the
 * same appearance system every other player on the court uses.
 */
function makeRemoteBody(id: string, x: number, z: number): SimPlayer {
  const cfg = generateOpponent(78, hashString(`net-${id}`));
  const body = makePlayer(1, { ...cfg, id: `net-${id}`, name: shortName(id) }, nextPid++);
  body.x = x;
  body.z = z;
  body.state = 'idle';
  return body;
}

function shortName(id: string): string {
  return `Player ${id.slice(0, 4)}`;
}

// ------------------------------------------------------------------ plumbing

function idOf(wire: WirePlayer | string | undefined): string {
  if (typeof wire === 'string') return wire;
  if (!wire) return '';
  return String(wire.id ?? wire.playerId ?? '');
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** `currentPlayers` may be a map keyed by id, or an array. Both are handled. */
function toList(payload: unknown): WirePlayer[] {
  if (Array.isArray(payload)) return payload as WirePlayer[];
  if (payload && typeof payload === 'object') {
    return Object.entries(payload as Record<string, WirePlayer>).map(([id, p]) => ({ id, ...p }));
  }
  return [];
}

function notify(): void {
  for (const fn of [...listeners]) fn();
}

// ------------------------------------------------------- room for what's next
//
// Ball, shooting, scoring and game state are NOT synchronised yet, on purpose:
// they are the systems that were to be left alone for now. When they are ready,
// they attach here without touching anything above — one emit and one handler
// each, the same shape the position sync already uses.

/** Sends an arbitrary game event once ball/score sync is designed. */
export function sendGameEvent(event: string, payload: unknown): void {
  if (!socket || !connected) return;
  socket.emit(event, payload);
}

/** Listens for one, likewise. */
export function onGameEvent(event: string, fn: (payload: unknown) => void): void {
  if (!socket) return;
  socket.on(event, (...args: unknown[]) => fn(args[0]));
}
