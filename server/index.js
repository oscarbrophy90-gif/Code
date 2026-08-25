/**
 * Hoops Elite — online 1v1 server.
 *
 * It owns the match lifecycle and the ranked ladder:
 *
 *   • matchmaking      — two separate queues, Casual and Ranked. A Casual
 *                        player is never paired with a Ranked one. Ranked pairs
 *                        on RP, with the acceptable gap widening the longer
 *                        somebody waits, so a Diamond does not sit in an empty
 *                        queue forever waiting for another Diamond.
 *   • the check phase  — it counts the readies (0/2, 1/2, 2/2) and decides when
 *                        the ball may be checked in
 *   • the score        — kept per room, broadcast to both
 *   • the result       — who won, what it was worth, and the ladder it moved.
 *                        The browser is told the answer; it never supplies one.
 *   • profiles         — each player's rank, record and build reach the other
 *                        THROUGH here, never client to client
 *   • disconnects      — a Ranked leaver forfeits; the survivor is told and
 *                        returned to searching
 *
 * The basketball itself is simulated by one of the two clients (the "host"),
 * which is what lets the game keep the physics, shooting and animation it
 * already has instead of reimplementing them here. The host publishes a
 * snapshot; the guest sends its input and draws what comes back.
 *
 * Where that leaves anti-cheat, honestly: the server decides who won from the
 * score stream it has been keeping, applies its own RP maths and stores the
 * result, so no client can award itself a rank, a win, or a point of RP. What a
 * modified host client could still do is report a false score, because the
 * simulation runs there. Closing that needs the simulation to move server-side;
 * everything else — the ladder, the result, the maths, the record — is already
 * out of the browser's reach.
 *
 *   node server/index.js      →  http://localhost:3000/HoopsElite.html
 */
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { rankedResult, rpWindow, winnerFromScore } from './rp.js';
import { FilePlayerStore, publicProfile } from './store.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
// Serve the game itself. Put HoopsElite.html in ./public (or point this at
// wherever you keep it).
app.use(express.static(join(here, 'public')));
app.use(express.static(join(here, '..', 'dist-standalone')));

const http = createServer(app);
const io = new Server(http);

const PORT = process.env.PORT ?? 3000;

const players = new FilePlayerStore();
await players.load();

/** The two queues. A player is in at most one, and they never mix. */
const queues = { casual: [], ranked: [] };
/** matchId -> match */
const matches = new Map();
/** socket.id -> matchId */
const whereIs = new Map();

let nextMatchId = 1;

function log(...a) {
  console.log('[hoops]', ...a);
}

// ------------------------------------------------------------- matchmaking

/** Casual is first come, first served — there is nothing to protect. */
function pairCasual() {
  const q = queues.casual;
  while (q.length >= 2) {
    const a = q.shift();
    const b = q.shift();
    if (!io.sockets.sockets.get(a.id) || !io.sockets.sockets.get(b.id)) continue;
    makeMatch(a, b, 'casual');
  }
}

/**
 * Ranked pairs on RP, oldest waiter first.
 *
 * The pair is accepted if the gap fits inside EITHER player's window, so the
 * person who has been waiting is the one who opens the door. Requiring both
 * windows would mean a fresh arrival's tight window kept resetting the clock on
 * somebody who had been waiting for two minutes.
 */
function pairRanked() {
  const q = queues.ranked;
  const now = Date.now();
  q.sort((x, y) => x.joinedAt - y.joinedAt);
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    if (!io.sockets.sockets.get(a.id)) continue;
    let bestIndex = -1;
    let bestGap = Infinity;
    for (let j = i + 1; j < q.length; j++) {
      const b = q[j];
      if (!io.sockets.sockets.get(b.id)) continue;
      const gap = Math.abs(a.rp - b.rp);
      const allowed = Math.max(rpWindow(now - a.joinedAt), rpWindow(now - b.joinedAt));
      if (gap <= allowed && gap < bestGap) {
        bestGap = gap;
        bestIndex = j;
      }
    }
    if (bestIndex < 0) continue;
    const b = q[bestIndex];
    q.splice(bestIndex, 1);
    q.splice(i, 1);
    log(`ranked pair: ${a.rp} RP vs ${b.rp} RP (gap ${bestGap})`);
    makeMatch(a, b, 'ranked');
    return pairRanked();
  }
}

function makeMatch(a, b, mode) {
  const sa = io.sockets.sockets.get(a.id);
  const sb = io.sockets.sockets.get(b.id);
  if (!sa || !sb) return;

  const id = `m${nextMatchId++}`;
  const room = `room-${id}`;
  const match = {
    id,
    room,
    mode,
    players: [a.id, b.id],
    accounts: { [a.id]: a.accountId, [b.id]: b.accountId },
    host: a.id, // the first of the pair simulates
    ready: new Set(),
    phase: 'check',
    score: [0, 0],
    rules: a.rules ?? b.rules ?? { targetScore: 11, winBy: 2, maxScore: 15 },
    settled: false,
    seed: (Math.random() * 0xffffffff) >>> 0,
  };
  matches.set(id, match);
  whereIs.set(a.id, id);
  whereIs.set(b.id, id);
  sa.join(room);
  sb.join(room);

  const rowA = players.get(a.accountId);
  const rowB = players.get(b.accountId);

  // Side 0 is the host, side 1 the guest — fixed, so both agree. Each player is
  // sent BOTH profiles and BOTH builds, from the store rather than from the
  // other browser, so the two intros show the same two people.
  const packet = (self, opp, role, side) => ({
    matchId: id,
    mode,
    role,
    side,
    seed: match.seed,
    you: { profile: publicProfile(self), build: self.build },
    opponent: { profile: publicProfile(opp), build: opp.build },
  });
  sa.emit('match:found', packet(rowA, rowB, 'host', 0));
  sb.emit('match:found', packet(rowB, rowA, 'guest', 1));
  broadcastReady(match);
  log(`match ${id} (${mode}): ${rowA.username} [${rowA.rp} RP] vs ${rowB.username} [${rowB.rp} RP]`);
}

// ------------------------------------------------------------------ results

/**
 * Settle a finished match. The ONLY place a ladder moves.
 *
 * `settled` is checked and set in the same breath, before anything is written,
 * because a forfeit and a disconnect can arrive a millisecond apart for the
 * same match — and a match that settles twice is how one player collects both
 * a win and a loss for the same game.
 */
function settle(match, winnerSocketId, reason) {
  if (match.settled) return;
  match.settled = true;

  const loserSocketId = match.players.find((p) => p !== winnerSocketId);
  const winnerAccount = match.accounts[winnerSocketId];
  const loserAccount = match.accounts[loserSocketId];

  if (match.mode !== 'ranked') {
    // Casual moves nothing: not RP, not the win count, not the loss count.
    for (const p of match.players) {
      io.sockets.sockets.get(p)?.emit('match:result', {
        mode: 'casual',
        reason,
        won: p === winnerSocketId,
        ranked: false,
      });
    }
    log(`match ${match.id} (casual) finished (${reason}) — no ladder change`);
    return;
  }

  const winnerRow = players.get(winnerAccount);
  const loserRow = players.get(loserAccount);
  if (!winnerRow || !loserRow) return;

  const result = rankedResult(winnerRow.rp, loserRow.rp);
  const afterWinner = players.apply(winnerAccount, { rp: result.winner.after, won: true });
  const afterLoser = players.apply(loserAccount, { rp: result.loser.after, won: false });

  const tell = (socketId, mine, theirs, mineDelta, theirsDelta, won) => {
    io.sockets.sockets.get(socketId)?.emit('match:result', {
      mode: 'ranked',
      reason,
      won,
      ranked: true,
      you: { ...publicProfile(mine), delta: mineDelta, rpBefore: mine.rp - mineDelta },
      opponent: { ...publicProfile(theirs), delta: theirsDelta, rpBefore: theirs.rp - theirsDelta },
    });
  };
  tell(winnerSocketId, afterWinner, afterLoser, result.winner.delta, result.loser.delta, true);
  tell(loserSocketId, afterLoser, afterWinner, result.loser.delta, result.winner.delta, false);

  log(
    `match ${match.id} (ranked) finished (${reason}): ` +
      `${afterWinner.username} ${result.winner.before}->${afterWinner.rp} (+${result.winner.delta}), ` +
      `${afterLoser.username} ${result.loser.before}->${afterLoser.rp} (${result.loser.delta})`,
  );
}

// --------------------------------------------------------------- connection

io.on('connection', (socket) => {
  log('connected', socket.id);

  /** The client identifies itself and its build; we answer with its ladder. */
  socket.on('profile:hello', (payload) => {
    const accountId = String(payload?.accountId ?? '').slice(0, 64);
    if (!accountId) return;
    socket.data.accountId = accountId;
    const row = players.upsert(accountId, { username: payload?.username, build: payload?.build });
    socket.emit('profile:self', publicProfile(row));
  });

  // ---------------------------------------------------------- matchmaking
  socket.on('mm:join', (payload) => {
    const mode = payload?.mode === 'ranked' ? 'ranked' : 'casual';
    const accountId = String(payload?.accountId ?? socket.data.accountId ?? '').slice(0, 64);
    if (!accountId) {
      socket.emit('mm:error', { reason: 'no-account' });
      return;
    }
    socket.data.accountId = accountId;
    const row = players.upsert(accountId, { username: payload?.username, build: payload?.build });
    socket.emit('profile:self', publicProfile(row));

    leaveQueues(socket.id);
    queues[mode].push({
      id: socket.id,
      accountId,
      rp: row.rp,
      joinedAt: Date.now(),
      rules: payload?.rules,
    });
    socket.emit('mm:searching', { mode });
    log(`searching ${mode}: ${row.username} [${row.rp} RP] (casual ${queues.casual.length}, ranked ${queues.ranked.length})`);
    if (mode === 'ranked') pairRanked();
    else pairCasual();
  });

  socket.on('mm:leave', () => {
    leaveQueues(socket.id);
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

  /** The running score. Kept here, echoed to both, and read for the winner. */
  socket.on('match:score', (payload) => {
    const match = matchOf(socket.id);
    if (!match || match.host !== socket.id) return;
    match.score = [Number(payload?.score?.[0]) || 0, Number(payload?.score?.[1]) || 0];
    io.to(match.room).emit('match:score', { score: match.score });
    const winner = winnerFromScore(match.score, match.rules);
    if (winner !== null) {
      settle(match, match.players[winner], 'scoreline');
      // Both clients already know the game is over — their own simulation
      // reached it — so the room is torn down without a "your opponent left".
      closeMatch(match, 'scoreline');
    }
  });

  /** Quitting a live match. Ranked: it is a loss, and the other player wins. */
  socket.on('match:forfeit', () => {
    const match = matchOf(socket.id);
    if (!match) return;
    const other = match.players.find((p) => p !== socket.id);
    settle(match, other, 'forfeit');
    endMatchOf(socket.id, 'forfeit');
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
    leaveQueues(socket.id);
    // Dropping out of a live match is a forfeit. There is no reconnect, so
    // there is nothing to wait for — and leaving the other player in a room
    // with nobody in it is worse than settling it.
    const match = matchOf(socket.id);
    if (match) {
      const other = match.players.find((p) => p !== socket.id);
      settle(match, other, 'disconnect');
    }
    endMatchOf(socket.id, 'disconnected');
  });
});

// --------------------------------------------------------------- helpers

function leaveQueues(id) {
  queues.casual = queues.casual.filter((q) => q.id !== id);
  queues.ranked = queues.ranked.filter((q) => q.id !== id);
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

/** Tear a finished match down without telling anybody they were abandoned. */
function closeMatch(match, reason) {
  if (!matches.has(match.id)) return;
  matches.delete(match.id);
  for (const p of match.players) {
    whereIs.delete(p);
    io.sockets.sockets.get(p)?.leave(match.room);
  }
  log(`match ${match.id} closed (${reason})`);
}

// Ranked players waiting alone need the window to keep opening even when
// nobody new joins, so the queue is retried on a timer as well as on arrival.
setInterval(() => {
  if (queues.ranked.length >= 2) pairRanked();
  if (queues.casual.length >= 2) pairCasual();
}, 1000);

http.listen(PORT, () => {
  log(`listening on http://localhost:${PORT}/HoopsElite.html`);
});
