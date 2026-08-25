/**
 * Hoops Elite — online 1v1 server.
 *
 * Your previous server relayed five events and knew nothing about matches,
 * which is why the ready count, the score and the ball could not be
 * authoritative anywhere. This one owns the match lifecycle:
 *
 *   • matchmaking      — two waiting players are paired into a room
 *   • the check phase  — it counts the readies (0/2, 1/2, 2/2) and decides
 *                        when the ball may be checked in
 *   • the score        — kept per room, broadcast to both
 *   • disconnects      — the survivor is told and returned to searching
 *
 * The basketball itself is simulated by one of the two clients (the "host"),
 * which is what lets the game keep the physics, shooting and animation it
 * already has instead of reimplementing them here. The host publishes a
 * snapshot; the guest sends its input and draws what comes back. The server
 * relays those two streams and stays the authority on everything above.
 *
 *   node server/index.js      →  http://localhost:3000/HoopsElite.html
 */
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
// Serve the game itself. Put HoopsElite.html in ./public (or point this at
// wherever you keep it).
app.use(express.static(join(here, 'public')));
app.use(express.static(join(here, '..', 'dist-standalone')));

const http = createServer(app);
const io = new Server(http);

const PORT = process.env.PORT ?? 3000;

/** Everyone waiting for an opponent, oldest first. */
let queue = [];
/** matchId -> match */
const matches = new Map();
/** socket.id -> matchId */
const whereIs = new Map();

let nextMatchId = 1;

function log(...a) {
  console.log('[hoops]', ...a);
}

io.on('connection', (socket) => {
  log('connected', socket.id);

  // ---------------------------------------------------------- matchmaking
  socket.on('mm:join', (payload) => {
    leaveQueue(socket.id);
    socket.data.build = payload?.build ?? null;
    queue.push(socket.id);
    socket.emit('mm:searching');
    log('searching', socket.id, `(queue ${queue.length})`);
    tryPair();
  });

  socket.on('mm:leave', () => {
    leaveQueue(socket.id);
    endMatchOf(socket.id, 'left');
  });

  // ------------------------------------------------------- the check phase
  // Server-authoritative: it counts, and only it decides when 2/2 is reached.
  socket.on('match:ready', () => {
    const match = matchOf(socket.id);
    if (!match || match.phase !== 'check') return;
    if (match.ready.has(socket.id)) return;
    match.ready.add(socket.id);
    broadcastReady(match);
    if (match.ready.size >= match.players.length) {
      match.phase = 'live';
      log(`match ${match.id}: 2/2 — checking the ball in`);
      io.to(match.room).emit('match:go');
    }
  });

  /** The host says a new check has begun (tip-off, or after a basket). */
  socket.on('match:newCheck', () => {
    const match = matchOf(socket.id);
    if (!match || match.host !== socket.id) return;
    match.phase = 'check';
    match.ready.clear();
    broadcastReady(match);
  });

  /** The host's authoritative score, kept on the server and echoed to both. */
  socket.on('match:score', (payload) => {
    const match = matchOf(socket.id);
    if (!match || match.host !== socket.id) return;
    match.score = [Number(payload?.score?.[0]) || 0, Number(payload?.score?.[1]) || 0];
    io.to(match.room).emit('match:score', { score: match.score });
  });

  // ----------------------------------------------------------- game streams
  /** Guest → host: one frame of input. */
  socket.on('match:input', (payload) => {
    const match = matchOf(socket.id);
    if (!match || match.host === socket.id) return;
    io.to(match.host).emit('match:input', payload);
  });

  /** Host → guest: one snapshot of the world. */
  socket.on('match:state', (payload) => {
    const match = matchOf(socket.id);
    if (!match || match.host !== socket.id) return;
    socket.to(match.room).emit('match:state', payload);
  });

  socket.on('disconnect', () => {
    log('disconnected', socket.id);
    leaveQueue(socket.id);
    endMatchOf(socket.id, 'disconnected');
  });
});

// --------------------------------------------------------------- helpers

function leaveQueue(id) {
  queue = queue.filter((q) => q !== id);
}

function matchOf(id) {
  const mid = whereIs.get(id);
  return mid ? matches.get(mid) : null;
}

function broadcastReady(match) {
  io.to(match.room).emit('match:ready', {
    count: match.ready.size,
    total: match.players.length,
    ready: [...match.ready],
  });
}

function tryPair() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    const sa = io.sockets.sockets.get(a);
    const sb = io.sockets.sockets.get(b);
    if (!sa || !sb) continue;

    const id = `m${nextMatchId++}`;
    const room = `room-${id}`;
    const match = {
      id,
      room,
      players: [a, b],
      host: a, // the first of the pair simulates
      ready: new Set(),
      phase: 'check',
      score: [0, 0],
      seed: (Math.random() * 0xffffffff) >>> 0,
    };
    matches.set(id, match);
    whereIs.set(a, id);
    whereIs.set(b, id);
    sa.join(room);
    sb.join(room);

    // Side 0 is the host, side 1 the guest — fixed, so both agree.
    sa.emit('match:found', {
      matchId: id, role: 'host', side: 0, seed: match.seed,
      you: { id: a }, opponent: { id: b, build: sb.data.build ?? null },
    });
    sb.emit('match:found', {
      matchId: id, role: 'guest', side: 1, seed: match.seed,
      you: { id: b }, opponent: { id: a, build: sa.data.build ?? null },
    });
    broadcastReady(match);
    log(`match ${id}: ${a} (host) vs ${b} (guest)`);
  }
}

function endMatchOf(id, reason) {
  const match = matchOf(id);
  if (!match) return;
  matches.delete(match.id);
  for (const p of match.players) {
    whereIs.delete(p);
    const s = io.sockets.sockets.get(p);
    if (!s) continue;
    s.leave(match.room);
    if (p !== id) {
      // The survivor is told, and goes back to searching.
      s.emit('match:ended', { reason });
    }
  }
  log(`match ${match.id} ended (${reason})`);
}

http.listen(PORT, () => {
  log(`listening on http://localhost:${PORT}/HoopsElite.html`);
});
