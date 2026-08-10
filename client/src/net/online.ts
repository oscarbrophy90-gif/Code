import { io, type Socket } from 'socket.io-client';
import type { MatchState, PlayerInput, SimPlayerConfig, Side } from '@hoops/shared';

import { store } from '../state/store.ts';

/**
 * The connection to the online server.
 *
 * Online is ranked and ranked only. Nothing else in the game talks to a network,
 * which is why this is one small module with one socket in it rather than a
 * layer everything has to be aware of.
 *
 * The server is a post office, not a referee. It matches two people, puts them
 * in a room and carries their messages; the match itself is run by one of the
 * two clients — see `netlink.ts` for why that is the host and what the other
 * side does about it.
 */

/** Must match PROTOCOL_VERSION in server.js. */
export const PROTOCOL_VERSION = 3;

export interface OnlineRecordFromServer {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  lifetimeWins: number;
  position: number | null;
  boardSize: number;
}

export interface BoardRow {
  username: string;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  lifetimeWins: number;
  position: number;
}

export interface MatchFound {
  matchId: string;
  seed: number;
  side: Side;
  role: 'host' | 'guest';
  you: { username: string; wins: number; losses: number };
  opponent: {
    username: string;
    wins: number;
    losses: number;
    player: SimPlayerConfig | null;
    buildName: string;
  };
}

export interface QueueState {
  inQueue: number;
  online: number;
  waited: number;
}

export interface Settled {
  won: boolean;
  reason: 'played' | 'forfeit' | 'disconnect';
  record: Omit<OnlineRecordFromServer, 'position' | 'boardSize'>;
  position: number | null;
  boardSize: number;
}

type Off = () => void;

/**
 * Where the server is.
 *
 * Served from the server itself — the ordinary case, and the one with nothing to
 * configure — it is this same origin. Opened as a file off the desktop there is
 * no origin to use, so it falls back to the address in Settings and then to a
 * local server, which is what a second copy on the same machine will be.
 */
export function defaultServerUrl(): string {
  const configured = store.settings.serverUrl?.trim();
  if (configured) return configured;
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) return location.origin;
  return 'http://localhost:8787';
}

class OnlineClient {
  private socket: Socket | null = null;
  private url = '';
  /** smoothed one-way latency in seconds, measured by ping */
  oneWay = 0;
  private pingTimer: number | null = null;

  record: OnlineRecordFromServer | null = null;
  lastError = '';

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get address(): string {
    return this.url || defaultServerUrl();
  }

  /**
   * Is anybody there?
   *
   * An HTTP probe rather than a socket attempt, because a socket that fails to
   * open cannot tell a wrong port from a server that is down from a typo. This
   * can, which is what makes it worth doing before the queue screen appears.
   */
  async probe(url = defaultServerUrl()): Promise<{ ok: boolean; detail: string; online?: number }> {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/health`, { method: 'GET' });
      if (!res.ok) return { ok: false, detail: `Server answered ${res.status}` };
      const body = (await res.json()) as { game?: string; version?: number; online?: number };
      if (body.game !== 'hoops-elite') return { ok: false, detail: 'That address is not a Hoops Elite server' };
      if (body.version !== PROTOCOL_VERSION) {
        return { ok: false, detail: `Server is protocol ${body.version}, this build speaks ${PROTOCOL_VERSION}` };
      }
      return { ok: true, detail: `Connected — ${body.online ?? 0} online`, online: body.online };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'No answer' };
    }
  }

  /** Opens the socket and says hello. Safe to call when already connected. */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    const url = defaultServerUrl();
    this.url = url;

    await new Promise<void>((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 4,
        timeout: 8000,
        forceNew: true,
      });
      this.socket = socket;

      const fail = (message: string) => {
        this.lastError = message;
        socket.off('connect', onConnect);
        reject(new Error(message));
      };
      const onConnect = () => {
        socket.off('connect_error', onError);
        this.hello();
        this.startPing();
        resolve();
      };
      const onError = (err: Error) => fail(err.message || 'Could not reach the server');

      socket.once('connect', onConnect);
      socket.once('connect_error', onError);

      socket.on('record', (msg: OnlineRecordFromServer) => {
        this.record = msg;
      });
      socket.on('rejected', (msg: { reason: string }) => {
        this.lastError = msg.reason;
      });
    });
  }

  private hello(): void {
    this.socket?.emit('hello', {
      version: PROTOCOL_VERSION,
      username: store.profile.username,
    });
    // The season the client believes it is in. The server compares it against
    // the one it last saw for this player and wipes the ladder if they differ,
    // so a season that ended while the game was shut still resets.
    this.socket?.emit('seasonReset', { seasonId: store.profile.seasonId });
  }

  /**
   * Latency, measured continuously.
   *
   * The host uses it to hold its own input back by the same amount the guest's
   * takes to arrive, so both players' presses land the same distance from when
   * they were made. Without it the host would be playing a different game.
   */
  private startPing(): void {
    if (this.pingTimer !== null) return;
    const send = () => {
      const sent = performance.now();
      this.socket?.emit('netPing', { sent });
    };
    this.socket?.on('netPong', (msg: { sent: number }) => {
      const rtt = (performance.now() - msg.sent) / 1000;
      // Smoothed: one late packet should not swing the delay the host applies.
      this.oneWay = this.oneWay === 0 ? rtt / 2 : this.oneWay * 0.8 + (rtt / 2) * 0.2;
    });
    send();
    this.pingTimer = window.setInterval(send, 2000);
  }

  disconnect(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  // ------------------------------------------------------------ matchmaking

  findMatch(player: SimPlayerConfig, buildName: string): void {
    this.socket?.emit('findMatch', { player, buildName });
  }

  cancelMatch(): void {
    this.socket?.emit('cancelMatch');
  }

  requestLeaderboard(): void {
    this.socket?.emit('leaderboard');
  }

  /**
   * Tells the server the season rolled over.
   *
   * Sent on connect rather than at the moment of the reset, because a season
   * can end while the game is closed and there is no socket to tell.
   */
  seasonReset(seasonId: string): void {
    this.socket?.emit('seasonReset', { seasonId });
  }

  // ----------------------------------------------------------------- events

  on<T>(event: string, handler: (msg: T) => void): Off {
    this.socket?.on(event, handler as (...args: unknown[]) => void);
    return () => this.socket?.off(event, handler as (...args: unknown[]) => void);
  }

  // -------------------------------------------------------------- in-match

  sendInput(input: PlayerInput, at: number): void {
    this.socket?.emit('input', { i: input, t: at });
  }

  sendSnapshot(state: MatchState, events: unknown[]): void {
    this.socket?.emit('snapshot', { s: state, e: events });
  }

  reportResult(winner: Side): void {
    this.socket?.emit('matchOver', { winner });
  }

  forfeit(): void {
    this.socket?.emit('forfeit');
  }
}

export const online = new OnlineClient();
