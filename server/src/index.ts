import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { COURT_MODE_BY_ID, PROTOCOL_VERSION, computeOverall, type ClientMessage } from '@hoops/shared';

import { Matchmaker } from './matchmaking.ts';
import { Session } from './session.ts';
import { store } from './store.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

const matchmaker = new Matchmaker();
const sessions = new Set<Session>();
matchmaker.totalSessions = () => sessions.size;

const http = createServer((req, res) => {
  // A tiny health endpoint so the client (and any orchestrator) can probe the
  // server without opening a socket.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(
      JSON.stringify({
        ok: true,
        version: PROTOCOL_VERSION,
        sessions: sessions.size,
        ...matchmaker.stats(),
        courts: matchmaker.counts(),
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('Hoops Elite game server');
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (socket: WebSocket) => {
  const session = new Session(socket);
  sessions.add(session);

  socket.on('message', (raw) => {
    if (!session.allowMessage()) {
      session.error('rate_limit', 'Too many messages');
      socket.close();
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      session.error('bad_json', 'Malformed message');
      return;
    }

    handle(session, msg);
  });

  socket.on('close', () => {
    matchmaker.dequeue(session);
    if (session.room && session.side !== null) session.room.handleDisconnect(session.side);
    sessions.delete(session);
  });

  socket.on('error', () => {
    /* close handler does the cleanup */
  });
});

function handle(session: Session, msg: ClientMessage): void {
  // Everything except the handshake requires an authenticated session.
  if (msg.t !== 'hello' && !session.authenticated) {
    session.error('not_authenticated', 'Send hello first');
    return;
  }

  switch (msg.t) {
    case 'hello': {
      if (msg.version !== PROTOCOL_VERSION) {
        session.error('version', `Server speaks protocol v${PROTOCOL_VERSION}, client sent v${msg.version}`);
        session.socket.close();
        return;
      }
      // Development auth: the client's local id is the account key. Production
      // swaps this for a signed token (see docs/NETWORKING.md).
      session.userId = String(msg.token || '').slice(0, 64) || `anon-${session.id}`;
      session.displayName = String(msg.displayName || 'Player').slice(0, 18);
      session.region = msg.region;
      session.authenticated = true;

      const account = store.account(session.userId, session.displayName, session.region);
      session.rankPoints = account.rankPoints;
      session.wins = account.wins;
      session.losses = account.losses;
      session.winStreak = account.winStreak;

      session.send({ t: 'welcome', userId: session.userId, serverTime: Date.now(), version: PROTOCOL_VERSION });
      // Your record travels with the handshake, so the Locker shows the right
      // rank the moment you connect rather than only after your next game.
      {
        const { placement, worldSize } = store.placement(session.userId);
        session.send({ t: 'record', wins: account.wins, losses: account.losses, placement, worldSize });
      }
      break;
    }

    case 'queue': {
      const court = COURT_MODE_BY_ID[msg.mode];
      if (!court || !court.online) {
        session.error('bad_court', `${msg.mode} is not a court you can queue for`);
        return;
      }
      session.player = msg.player;
      // Rank comes from the server record, never from the client.
      store.update(session.userId, {
        overall: computeOverall(msg.player.attrs, 'SG'),
      });
      matchmaker.enqueue(session, msg.parkId, msg.mode);
      break;
    }

    case 'cancelQueue':
      matchmaker.dequeue(session);
      break;

    case 'createPrivate':
      session.player = msg.player;
      matchmaker.createPrivate(session, msg.config);
      break;

    case 'joinPrivate':
      session.player = msg.player;
      matchmaker.joinPrivate(session, msg.code);
      break;

    case 'ready':
      if (session.room && session.side !== null) session.room.markReady(session.side);
      break;

    case 'input':
      if (session.room && session.side !== null) session.room.receiveInput(session.side, msg.frame, msg.input);
      break;

    case 'leaveMatch':
      if (session.room && session.side !== null) session.room.leave(session.side);
      break;

    case 'ping':
      session.send({ t: 'pong', sent: msg.sent, serverTime: Date.now() });
      break;

    case 'leaderboard':
      session.send({
        t: 'leaderboard',
        scope: msg.scope,
        entries: store.leaderboard(msg.scope, msg.region ?? session.region),
      });
      break;

    case 'saveProfile': {
      // The blob is opaque and size-capped; the server stores it, never trusts
      // it, and never derives rank or currency from it.
      if (msg.blob.length > 512 * 1024) {
        session.error('too_large', 'Save file is too large');
        return;
      }
      const ok = store.saveProfile(session.userId, msg.blob, msg.revision);
      if (!ok) session.error('stale_save', 'A newer save already exists on the server');
      break;
    }

    case 'loadProfile': {
      const saved = store.loadProfile(session.userId);
      session.send({ t: 'profile', blob: saved.blob, revision: saved.revision });
      break;
    }

    default:
      session.error('unknown', 'Unknown message type');
  }
}

// Persist ranked results as sessions finish matches.
setInterval(() => {
  for (const session of sessions) {
    if (!session.authenticated) continue;
    store.update(session.userId, {
      rankPoints: session.rankPoints,
      wins: session.wins,
      losses: session.losses,
      winStreak: session.winStreak,
    });
  }
}, 10000);

// Drop sockets that stop talking entirely.
setInterval(() => {
  const now = Date.now();
  for (const session of sessions) {
    if (now - session.lastMessageAt > 45000) {
      session.send({ t: 'kicked', reason: 'Idle timeout' });
      session.socket.close();
    }
  }
}, 15000);

http.listen(PORT, HOST, () => {
  console.log(`Hoops Elite server listening on ws://${HOST}:${PORT} (protocol v${PROTOCOL_VERSION})`);
  console.log(`Health: http://${HOST}:${PORT}/health`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nShutting down…');
    for (const session of sessions) session.socket.close();
    wss.close();
    http.close(() => process.exit(0));
  });
}
