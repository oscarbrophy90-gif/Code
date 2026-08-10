/**
 * Hoops Elite — the online server.
 *
 * Plain Node, Express and Socket.io, in one file, with no build step, so it can
 * be deployed to anything that runs `npm start` and reached from a copy of the
 * game running anywhere — including the standalone HTML opened off a desktop.
 *
 * What it is responsible for:
 *
 *   1. Matchmaking. One queue, ranked only. Two players waiting means a match.
 *   2. Rooms. Each pair gets its own Socket.io room and nothing crosses between.
 *   3. Relaying. The two clients exchange inputs and state through this server;
 *      it does not simulate the game itself.
 *   4. The leaderboard. Real players only — a name gets on it by finishing a
 *      ranked match here, and there is nothing generated to pad it out.
 *
 * Deliberately *not* responsible for: the simulation. One of the two clients is
 * the host and owns the match; the server is a post office. That keeps this file
 * small and means the game logic has exactly one implementation, the shared one
 * both clients already run.
 */

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DB_PATH = process.env.HOOPS_DB || join(HERE, 'server', 'data', 'db.json');

/** How long a player may sit in the queue before we give up and say so. */
const QUEUE_TIMEOUT_MS = 120_000;
/** How long a room waits for a dropped player before awarding the win. */
const DISCONNECT_GRACE_MS = 8_000;
/** Protocol version. Bumped when the message shapes change incompatibly. */
const PROTOCOL_VERSION = 3;

// --------------------------------------------------------------------- store

/**
 * The database: one JSON file.
 *
 * Written atomically through a temp file and a rename, because a half-written
 * leaderboard is worse than a stale one, and a crash mid-write is exactly when
 * you find that out.
 */
function loadDb() {
  try {
    if (existsSync(DB_PATH)) {
      const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.players) return parsed;
      // A file that parsed but is the wrong shape is kept rather than clobbered:
      // if it holds anybody's season, somebody will want it back.
      renameSync(DB_PATH, `${DB_PATH}.corrupt-${Date.now()}`);
    }
  } catch (err) {
    console.error('[db] could not read, starting fresh:', err.message);
    try {
      renameSync(DB_PATH, `${DB_PATH}.corrupt-${Date.now()}`);
    } catch {
      /* nothing to preserve */
    }
  }
  return { players: {}, matches: 0 };
}

const db = loadDb();
let dbDirty = false;

function saveDb() {
  if (!dbDirty) return;
  dbDirty = false;
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    const tmp = `${DB_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(db), 'utf8');
    renameSync(tmp, DB_PATH);
  } catch (err) {
    console.error('[db] write failed:', err.message);
  }
}

setInterval(saveDb, 4000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    dbDirty = true;
    saveDb();
    process.exit(0);
  });
}

/** A player's record, created the first time they finish a ranked match. */
function recordFor(username) {
  const key = username.toLowerCase();
  if (!db.players[key]) {
    db.players[key] = { username, wins: 0, losses: 0, streak: 0, bestStreak: 0, lifetimeWins: 0, peakWins: 0, updatedAt: 0 };
  }
  // Keep whatever capitalisation they last played under.
  db.players[key].username = username;
  return db.players[key];
}

/**
 * The leaderboard: everyone who has finished a ranked match here, best first.
 *
 * Ordered by wins, which is the rank — so a higher rank is always a higher
 * position. Nothing generated appears on it.
 */
function leaderboard(limit = 200) {
  return Object.values(db.players)
    .filter((p) => p.wins + p.losses > 0)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.username.localeCompare(b.username))
    .slice(0, limit)
    .map((p, i) => ({ ...p, position: i + 1 }));
}

function positionOf(username) {
  const board = leaderboard(100_000);
  const at = board.findIndex((p) => p.username.toLowerCase() === username.toLowerCase());
  return at < 0 ? null : at + 1;
}

// ---------------------------------------------------------------------- http

const app = express();
app.use(express.json());

/**
 * CORS on the plain routes as well as the socket.
 *
 * The socket already allows any origin, so a standalone copy could connect and
 * play — but `/health` and `/leaderboard` are ordinary fetches, and without
 * these headers they fail from a `file://` page whose origin is the string
 * "null". That looked like "connection test says it is broken while the game
 * plays perfectly", and it made the leaderboard empty for exactly the players
 * who most needed to be told where the server was.
 */
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// The built client, when it has been built. Serving it here means one origin
// for the page and the socket, which is the configuration with no CORS and no
// server address to type in.
const CLIENT_DIST = join(HERE, 'client', 'dist');
if (existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));

/**
 * The health probe.
 *
 * A socket that fails to open tells you almost nothing — a wrong port, a server
 * that is down and a typo all look the same. This separates them, which is what
 * makes the "Test connection" button in Settings worth having.
 */
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    game: 'hoops-elite',
    version: PROTOCOL_VERSION,
    online: io.engine.clientsCount,
    queued: queue.length,
    matches: rooms.size,
    played: db.matches,
    relayed,
  });
});

app.get('/leaderboard', (_req, res) => res.json({ players: leaderboard() }));

const http = createServer(app);
const io = new Server(http, {
  // The standalone build runs from file://, whose Origin is "null". Locking
  // this down to a domain would mean the desktop copy could never connect.
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10_000,
  pingTimeout: 20_000,
});

// --------------------------------------------------------------- matchmaking

/**
 * The queue. One array, because ranked is the only thing that goes online and
 * there is exactly one pool to be in.
 */
const queue = [];
/** Relay counters, so a "they cannot see each other" report has numbers on it. */
const relayed = { inputs: 0, snapshots: 0 };
/** matchId → room */
const rooms = new Map();

/** Everything we know about a connected socket. */
const players = new Map();

function playerOf(socket) {
  return players.get(socket.id);
}

function removeFromQueue(socketId) {
  const at = queue.findIndex((p) => p.socketId === socketId);
  if (at >= 0) queue.splice(at, 1);
}

function broadcastQueueSize() {
  for (const entry of queue) {
    const socket = io.sockets.sockets.get(entry.socketId);
    socket?.emit('queueUpdate', {
      waited: Math.round((Date.now() - entry.joinedAt) / 1000),
      inQueue: queue.length,
      online: io.engine.clientsCount,
    });
  }
}

setInterval(() => {
  // Time out anybody who has been waiting too long, so the UI can say "nobody
  // else is here" rather than spinning for ever.
  const now = Date.now();
  for (const entry of [...queue]) {
    if (now - entry.joinedAt > QUEUE_TIMEOUT_MS) {
      removeFromQueue(entry.socketId);
      io.sockets.sockets.get(entry.socketId)?.emit('queueTimeout', { waited: Math.round((now - entry.joinedAt) / 1000) });
    }
  }
  broadcastQueueSize();
  pumpQueue();
}, 1000).unref();

/**
 * Pair everybody who can be paired.
 *
 * Two waiting players is a match. Ranks are not used to gate it: on a board this
 * size, refusing to pair a Bronze with a Gold means neither of them plays, and a
 * game you cannot get into is worse than a mismatch.
 *
 * The pair is only consumed once the room actually exists — an earlier version
 * of this marked both players as taken before building the room, so a failure
 * anywhere in setup silently ate both tickets and left two people waiting for a
 * match that had already been "made".
 */
function pumpQueue() {
  while (queue.length >= 2) {
    const a = queue[0];
    const b = queue[1];
    const socketA = io.sockets.sockets.get(a.socketId);
    const socketB = io.sockets.sockets.get(b.socketId);
    // A stale ticket for a socket that has gone away is dropped, not matched.
    if (!socketA) {
      queue.shift();
      continue;
    }
    if (!socketB) {
      queue.splice(1, 1);
      continue;
    }
    if (!createRoom(a, b, socketA, socketB)) break;
    queue.splice(0, 2);
  }
}

function createRoom(a, b, socketA, socketB) {
  try {
    const matchId = `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    // The first one in the queue hosts. Somebody has to own the simulation, and
    // "whoever was waiting longest" is as fair a rule as any.
    const room = {
      id: matchId,
      seed: (Math.random() * 0xffffffff) >>> 0,
      startedAt: Date.now(),
      host: { ...a, side: 0 },
      guest: { ...b, side: 1 },
      reported: null,
      dropTimer: null,
    };
    rooms.set(matchId, room);
    socketA.join(matchId);
    socketB.join(matchId);
    players.get(socketA.id).matchId = matchId;
    players.get(socketB.id).matchId = matchId;

    const payload = (me, them, side, role) => ({
      matchId,
      seed: room.seed,
      side,
      role,
      you: { username: me.username, wins: me.wins, losses: me.losses },
      opponent: {
        username: them.username,
        wins: them.wins,
        losses: them.losses,
        player: them.player,
        buildName: them.buildName,
      },
    });

    socketA.emit('matchFound', payload(a, b, 0, 'host'));
    socketB.emit('matchFound', payload(b, a, 1, 'guest'));
    console.log(`[match] ${a.username} vs ${b.username} (${matchId})`);
    return true;
  } catch (err) {
    console.error('[match] could not create room:', err.message);
    return false;
  }
}

/**
 * Settle a match and write both records.
 *
 * The host reports the result, because the host ran the game. A guest report is
 * accepted only when the host has gone — otherwise a losing guest could call
 * itself the winner by disconnecting the host first.
 */
function settle(room, winnerSide, reason) {
  if (room.reported) return;
  room.reported = { winnerSide, reason };
  if (room.dropTimer) clearTimeout(room.dropTimer);

  const sides = [room.host, room.guest];
  db.matches++;
  for (const entry of sides) {
    const won = entry.side === winnerSide;
    const rec = recordFor(entry.username);
    rec.wins = Math.max(0, rec.wins + (won ? 1 : -1));
    if (won) {
      rec.lifetimeWins++;
      rec.streak++;
      rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
    } else {
      rec.losses++;
      rec.streak = 0;
    }
    rec.peakWins = Math.max(rec.peakWins ?? 0, rec.wins);
    rec.updatedAt = Date.now();
  }
  dbDirty = true;
  saveDb();

  for (const entry of sides) {
    const socket = io.sockets.sockets.get(entry.socketId);
    const rec = recordFor(entry.username);
    socket?.emit('matchSettled', {
      matchId: room.id,
      won: entry.side === winnerSide,
      reason,
      record: { wins: rec.wins, losses: rec.losses, streak: rec.streak, bestStreak: rec.bestStreak, lifetimeWins: rec.lifetimeWins },
      position: positionOf(entry.username),
      boardSize: leaderboard(100_000).length,
    });
    socket?.leave(room.id);
    const p = players.get(entry.socketId);
    if (p) p.matchId = null;
  }
  rooms.delete(room.id);
  console.log(`[match] ${room.id} settled: side ${winnerSide} won (${reason})`);
}

function roomOf(socket) {
  const p = playerOf(socket);
  return p?.matchId ? rooms.get(p.matchId) : null;
}

// ------------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  players.set(socket.id, { socketId: socket.id, username: '', matchId: null });

  socket.emit('welcome', { version: PROTOCOL_VERSION, online: io.engine.clientsCount });

  /** Who you are. Sent once, before anything else. */
  socket.on('hello', (msg = {}) => {
    const p = playerOf(socket);
    if (!p) return;
    const username = String(msg.username ?? '').slice(0, 16).trim();
    if (!username) {
      socket.emit('rejected', { reason: 'A username is required to play online.' });
      return;
    }
    if (Number(msg.version) !== PROTOCOL_VERSION) {
      socket.emit('rejected', {
        reason: `This copy of the game is version ${msg.version ?? '?'} and the server is ${PROTOCOL_VERSION}. Get the current build.`,
      });
      return;
    }
    p.username = username;
    const rec = recordFor(username);
    socket.emit('record', {
      wins: rec.wins,
      losses: rec.losses,
      streak: rec.streak,
      bestStreak: rec.bestStreak,
      lifetimeWins: rec.lifetimeWins,
      position: positionOf(username),
      boardSize: leaderboard(100_000).length,
    });
  });

  /** The Find Player button. */
  socket.on('findMatch', (msg = {}) => {
    const p = playerOf(socket);
    if (!p || !p.username) {
      socket.emit('rejected', { reason: 'Say hello first — no username on this connection.' });
      return;
    }
    if (p.matchId) return;
    removeFromQueue(socket.id);

    const rec = recordFor(p.username);
    queue.push({
      socketId: socket.id,
      username: p.username,
      wins: rec.wins,
      losses: rec.losses,
      // The opponent's build, passed straight through: the server never reads
      // it, it just hands it to the other client so both draw the same player.
      player: msg.player ?? null,
      buildName: String(msg.buildName ?? '').slice(0, 32),
      joinedAt: Date.now(),
    });
    socket.emit('queued', { inQueue: queue.length, online: io.engine.clientsCount });
    pumpQueue();
  });

  socket.on('cancelMatch', () => {
    removeFromQueue(socket.id);
    socket.emit('queueCancelled', {});
  });

  // ---------------------------------------------------------------- in-match

  /** Guest → host, every frame. Relayed untouched. */
  socket.on('input', (msg) => {
    const room = roomOf(socket);
    if (!room) return;
    relayed.inputs++;
    socket.to(room.id).emit('input', msg);
  });

  /** Host → guest, at the snapshot rate. Relayed untouched. */
  socket.on('snapshot', (msg) => {
    const room = roomOf(socket);
    if (!room || room.host.socketId !== socket.id) return;
    relayed.snapshots++;
    socket.to(room.id).emit('snapshot', msg);
  });

  /** Round-trip time, measured by the client so it can offset its own input. */
  socket.on('netPing', (msg = {}) => {
    socket.emit('netPong', { sent: msg.sent ?? 0, server: Date.now() });
  });

  /** Either side can forfeit; the other one wins. */
  socket.on('forfeit', () => {
    const room = roomOf(socket);
    if (!room) return;
    const mine = room.host.socketId === socket.id ? room.host : room.guest;
    settle(room, mine.side === 0 ? 1 : 0, 'forfeit');
  });

  /** The host reports the score when the game ends. */
  socket.on('matchOver', (msg = {}) => {
    const room = roomOf(socket);
    if (!room) return;
    if (room.host.socketId !== socket.id) return;
    const winner = Number(msg.winner) === 1 ? 1 : 0;
    settle(room, winner, 'played');
  });

  /**
   * A season ended.
   *
   * The client owns the calendar — both ends work the season out from the same
   * clock — but the server owns the standing, so a reset has to happen here or
   * the next `record` would hand the old ladder straight back. Stamped with the
   * season id and applied once, because two clients on one account would
   * otherwise reset it twice.
   */
  socket.on('seasonReset', (msg = {}) => {
    const p = playerOf(socket);
    if (!p || !p.username) return;
    const seasonId = String(msg.seasonId ?? '').slice(0, 12);
    if (!seasonId) return;
    const rec = recordFor(p.username);
    if (rec.seasonId === seasonId) return;
    rec.seasonId = seasonId;
    // Lifetime wins and the best streak survive: a season reset takes your
    // standing, not your history.
    rec.wins = 0;
    rec.losses = 0;
    rec.streak = 0;
    rec.peakWins = 0;
    rec.updatedAt = Date.now();
    dbDirty = true;
    saveDb();
    socket.emit('record', {
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: rec.bestStreak,
      lifetimeWins: rec.lifetimeWins,
      position: positionOf(p.username),
      boardSize: leaderboard(100_000).length,
    });
  });

  socket.on('leaderboard', () => {
    socket.emit('leaderboard', { players: leaderboard() });
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    const room = roomOf(socket);
    if (room && !room.reported) {
      const mine = room.host.socketId === socket.id ? room.host : room.guest;
      const other = mine === room.host ? room.guest : room.host;
      io.sockets.sockets.get(other.socketId)?.emit('opponentDropped', { graceMs: DISCONNECT_GRACE_MS });
      // A grace period, because a reload is not a forfeit if they come straight
      // back — but a walk-out is, and it has to cost them the game or every
      // losing player would simply close the tab.
      room.dropTimer = setTimeout(() => settle(room, other.side, 'disconnect'), DISCONNECT_GRACE_MS);
    }
    players.delete(socket.id);
    broadcastQueueSize();
  });
});

http.listen(PORT, () => {
  console.log(`Hoops Elite server listening on :${PORT}`);
  console.log(`  health      http://localhost:${PORT}/health`);
  console.log(`  leaderboard http://localhost:${PORT}/leaderboard`);
  if (existsSync(CLIENT_DIST)) console.log(`  game        http://localhost:${PORT}/`);
  else console.log('  (client/dist not built — run `npm run build` to serve the game from here too)');
});
