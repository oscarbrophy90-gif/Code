import type { WebSocket } from 'ws';
import type { Region, ServerMessage, Side, SimPlayerConfig } from '@hoops/shared';
import type { MatchRoom } from './room.ts';

let nextId = 1;

/** One connected client. */
export class Session {
  readonly id: string;
  readonly socket: WebSocket;
  userId = '';
  displayName = 'Player';
  region: Region = 'na-east';
  authenticated = false;

  player: SimPlayerConfig | null = null;
  rankPoints = 0;
  wins = 0;
  losses = 0;
  winStreak = 0;

  room: MatchRoom | null = null;
  side: Side | null = null;
  queuedAt = 0;
  queuePlaylist: 'ranked' | 'casual' | null = null;
  privateCode: string | null = null;

  lastMessageAt = Date.now();
  private messagesThisSecond = 0;
  private windowStart = Date.now();

  constructor(socket: WebSocket) {
    this.id = `s${nextId++}`;
    this.socket = socket;
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  error(code: string, message: string): void {
    this.send({ t: 'error', code, message });
  }

  record(won: boolean): void {
    if (won) {
      this.wins++;
      this.winStreak++;
    } else {
      this.losses++;
      this.winStreak = 0;
    }
  }

  /**
   * Coarse message-rate limit. Input messages are the hot path and are also
   * checked by the room's anti-cheat; this only stops raw socket flooding.
   */
  allowMessage(): boolean {
    const now = Date.now();
    this.lastMessageAt = now;
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.messagesThisSecond = 0;
    }
    this.messagesThisSecond++;
    return this.messagesThisSecond <= 400;
  }
}
