import {
  COURT_MODE_BY_ID,
  courtConfig,
  courtKey,
  isAcceptableMatch,
  type CourtMode,
  type MatchConfig,
} from '@hoops/shared';
import { MatchRoom } from './room.ts';
import type { Session } from './session.ts';

interface Ticket {
  session: Session;
  /** which park, and which court in it — together, who this player will meet */
  parkId: string;
  mode: CourtMode;
  key: string;
  queuedAt: number;
}

const PRIVATE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Matchmaking, by park and court.
 *
 * Two players meet because they walked onto the same court in the same park —
 * King of the Court at Downtown finds you the other person waiting at King of
 * the Court at Downtown, and nobody else. That pairing key comes first; skill
 * only decides whether two people already on the same court are an acceptable
 * game, and only on the ranked court.
 *
 * This used to pair on the playlist alone and ignore parkId entirely, so a
 * player waiting at Downtown could be dropped into a game someone started at
 * Beach — the park you chose had no effect on who you played.
 */
export class Matchmaker {
  /**
   * How many clients are connected to this server, whatever they are doing.
   *
   * The waiting screen needs it to answer the question that actually goes wrong:
   * two people who each run a server on their own machine both have the address
   * "localhost" and both believe they are on the same one. If you are the only
   * connection here, your opponent is somewhere else.
   */
  totalSessions: () => number = () => 0;
  private tickets: Ticket[] = [];
  private privateLobbies = new Map<string, { host: Session; config: Partial<MatchConfig> }>();
  private rooms = new Map<string, MatchRoom>();
  private matchCounter = 1;

  constructor() {
    setInterval(() => this.pump(), 500);
  }

  enqueue(session: Session, parkId: string, mode: CourtMode): void {
    this.dequeue(session);
    const key = courtKey(parkId, mode);
    const ticket: Ticket = { session, parkId, mode, key, queuedAt: Date.now() };
    this.tickets.push(ticket);
    session.queuedAt = ticket.queuedAt;
    // The session tracks only the two ladder playlists; a court can never be
    // 'private', which is created by code rather than queued for.
    const playlist = COURT_MODE_BY_ID[mode]?.playlist;
    session.queuePlaylist = playlist === 'ranked' ? 'ranked' : 'casual';
    session.send({
      t: 'queued',
      parkId,
      mode,
      estimateSeconds: this.estimate(key),
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

  /** Rough wait, based on whether anyone else is already on this exact court. */
  private estimate(key: string): number {
    const waiting = this.tickets.filter((t) => t.key === key).length;
    return waiting > 0 ? 5 : 30;
  }

  /** How many are waiting on each court, for the park screen's live counts. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of this.tickets) out[t.key] = (out[t.key] ?? 0) + 1;
    return out;
  }

  private pump(): void {
    const now = Date.now();

    // Keep everyone informed while they wait. The count is of this court only —
    // a number counting the whole server would say four players are waiting when
    // none of them can be your opponent.
    for (const t of this.tickets) {
      const waited = (now - t.queuedAt) / 1000;
      t.session.send({
        t: 'queueUpdate',
        waited: Math.round(waited),
        searching: {
          min: Math.max(0, t.session.rankPoints - (140 + waited * 55)),
          max: Math.min(5000, t.session.rankPoints + (140 + waited * 55)),
        },
        playersInQueue: this.tickets.filter((x) => x.key === t.key).length,
        playersOnServer: this.totalSessions(),
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
        // Same park, same court, or they are not each other's opponent at all.
        if (b.key !== a.key) continue;
        if (b.session.socket.readyState !== b.session.socket.OPEN) continue;

        const waitB = (now - b.queuedAt) / 1000;
        // An unranked court takes whoever is there; ranked has to be in band.
        const ranked = COURT_MODE_BY_ID[a.mode]?.playlist === 'ranked';
        const acceptable =
          !ranked || isAcceptableMatch(a.session.rankPoints, b.session.rankPoints, waitA, waitB);
        if (!acceptable) continue;

        // Only consume the tickets if a room was actually made. They used to be
        // marked paired before the attempt, so a match that could not be created
        // left both players with no ticket and no room — searching forever with
        // nothing on the server looking for them.
        if (!this.createMatch(a, b)) continue;
        paired.add(a);
        paired.add(b);
        break;
      }
    }

    this.tickets = this.tickets.filter((t) => !paired.has(t) && t.session.socket.readyState === t.session.socket.OPEN);
  }

  private createMatch(a: Ticket, b: Ticket): boolean {
    if (!a.session.player || !b.session.player) {
      console.warn(`[match] cannot pair ${a.session.displayName} and ${b.session.displayName}: a player is missing`);
      return false;
    }
    const id = `m${this.matchCounter++}`;
    const room = new MatchRoom(
      id,
      { session: a.session, player: a.session.player, rank: a.session.rankPoints },
      { session: b.session, player: b.session.player, rank: b.session.rankPoints },
      // The court decides the game. King of the Court is first to seven, and it
      // was previously handed only the park id, so every online match was the
      // default eleven whichever court you walked onto.
      courtConfig(a.parkId, a.mode),
    );
    room.onFinished = (finished) => this.rooms.delete(finished.id);
    this.rooms.set(id, room);
    a.session.queuePlaylist = null;
    b.session.queuePlaylist = null;
    console.log(
      `[match] ${id} @ ${a.key}: ${a.session.displayName} (${a.session.rankPoints}) vs ${b.session.displayName} (${b.session.rankPoints})`,
    );
    return true;
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
