import { isAcceptableMatch, type MatchConfig, type Playlist } from '@hoops/shared';
import { MatchRoom } from './room.ts';
import type { Session } from './session.ts';

interface Ticket {
  session: Session;
  playlist: 'ranked' | 'casual';
  parkId: string;
  queuedAt: number;
}

const PRIVATE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Skill-based matchmaking. Tickets pair when both players' rating bands
 * overlap; the bands widen with wait time so the tails of the ladder still
 * find games without ever forcing a wildly unfair one early.
 */
export class Matchmaker {
  private tickets: Ticket[] = [];
  private privateLobbies = new Map<string, { host: Session; config: Partial<MatchConfig> }>();
  private rooms = new Map<string, MatchRoom>();
  private matchCounter = 1;

  constructor() {
    setInterval(() => this.pump(), 500);
  }

  enqueue(session: Session, playlist: 'ranked' | 'casual', parkId: string): void {
    this.dequeue(session);
    const ticket: Ticket = { session, playlist, parkId, queuedAt: Date.now() };
    this.tickets.push(ticket);
    session.queuedAt = ticket.queuedAt;
    session.queuePlaylist = playlist;
    session.send({
      t: 'queued',
      playlist,
      estimateSeconds: this.estimate(playlist),
      searching: { min: Math.max(0, session.rankPoints - 140), max: session.rankPoints + 140 },
    });
    this.pump();
  }

  dequeue(session: Session): void {
    this.tickets = this.tickets.filter((t) => t.session !== session);
    session.queuePlaylist = null;
    for (const [code, lobby] of this.privateLobbies) {
      if (lobby.host === session) this.privateLobbies.delete(code);
    }
  }

  private estimate(playlist: 'ranked' | 'casual'): number {
    const waiting = this.tickets.filter((t) => t.playlist === playlist).length;
    return waiting > 0 ? 5 : 30;
  }

  private pump(): void {
    const now = Date.now();

    // Keep everyone informed while they wait.
    for (const t of this.tickets) {
      const waited = (now - t.queuedAt) / 1000;
      t.session.send({
        t: 'queueUpdate',
        waited: Math.round(waited),
        searching: {
          min: Math.max(0, t.session.rankPoints - (140 + waited * 55)),
          max: Math.min(5000, t.session.rankPoints + (140 + waited * 55)),
        },
        playersInQueue: this.tickets.filter((x) => x.playlist === t.playlist).length,
      });
    }

    // Pair oldest tickets first so nobody starves.
    const ordered = [...this.tickets].sort((a, b) => a.queuedAt - b.queuedAt);
    const paired = new Set<Ticket>();

    for (const a of ordered) {
      if (paired.has(a)) continue;
      const waitA = (now - a.queuedAt) / 1000;

      for (const b of ordered) {
        if (b === a || paired.has(b)) continue;
        if (b.playlist !== a.playlist) continue;
        if (b.session.socket.readyState !== b.session.socket.OPEN) continue;

        const waitB = (now - b.queuedAt) / 1000;
        // Casual play only needs a loose pairing; ranked must be in band.
        const acceptable =
          a.playlist === 'casual' ||
          isAcceptableMatch(a.session.rankPoints, b.session.rankPoints, waitA, waitB);
        if (!acceptable) continue;

        paired.add(a);
        paired.add(b);
        this.createMatch(a, b);
        break;
      }
    }

    this.tickets = this.tickets.filter((t) => !paired.has(t) && t.session.socket.readyState === t.session.socket.OPEN);
  }

  private createMatch(a: Ticket, b: Ticket): void {
    if (!a.session.player || !b.session.player) return;
    const id = `m${this.matchCounter++}`;
    const room = new MatchRoom(
      id,
      { session: a.session, player: a.session.player, rank: a.session.rankPoints },
      { session: b.session, player: b.session.player, rank: b.session.rankPoints },
      { playlist: a.playlist, parkId: a.parkId },
    );
    room.onFinished = (finished) => this.rooms.delete(finished.id);
    this.rooms.set(id, room);
    a.session.queuePlaylist = null;
    b.session.queuePlaylist = null;
    console.log(`[match] ${id}: ${a.session.displayName} (${a.session.rankPoints}) vs ${b.session.displayName} (${b.session.rankPoints}) [${a.playlist}]`);
  }

  // ------------------------------------------------------------------ private

  createPrivate(host: Session, config: Partial<MatchConfig>): string {
    for (const [code, lobby] of this.privateLobbies) {
      if (lobby.host === host) this.privateLobbies.delete(code);
    }
    let code = '';
    do {
      code = Array.from({ length: 5 }, () => PRIVATE_CODE_CHARS[Math.floor(Math.random() * PRIVATE_CODE_CHARS.length)]).join('');
    } while (this.privateLobbies.has(code));

    this.privateLobbies.set(code, { host, config });
    host.privateCode = code;
    host.send({ t: 'privateCreated', code });
    return code;
  }

  joinPrivate(guest: Session, code: string): boolean {
    const lobby = this.privateLobbies.get(code.toUpperCase());
    if (!lobby) {
      guest.error('no_lobby', `No lobby found with code ${code.toUpperCase()}`);
      return false;
    }
    if (lobby.host === guest) {
      guest.error('own_lobby', 'You cannot join your own lobby');
      return false;
    }
    if (!lobby.host.player || !guest.player) {
      guest.error('no_player', 'Both players need a MyPlayer loaded');
      return false;
    }
    this.privateLobbies.delete(code.toUpperCase());

    const id = `p${this.matchCounter++}`;
    const room = new MatchRoom(
      id,
      { session: lobby.host, player: lobby.host.player, rank: lobby.host.rankPoints },
      { session: guest, player: guest.player, rank: guest.rankPoints },
      { playlist: 'private', ...lobby.config },
    );
    room.onFinished = (finished) => this.rooms.delete(finished.id);
    this.rooms.set(id, room);
    console.log(`[match] ${id}: private lobby ${code} started`);
    return true;
  }

  stats(): { queued: number; rooms: number; lobbies: number } {
    return { queued: this.tickets.length, rooms: this.rooms.size, lobbies: this.privateLobbies.size };
  }
}
