import {
  ACT_STATE_IDS,
  BALL_STATE_IDS,
  PHASE_IDS,
  SIM_DT,
  SNAPSHOT_HZ,
  createMatch,
  defaultMatchConfig,
  drainEvents,
  emptyInput,
  stepMatch,
  unpackInput,
  updateRank,
  type MatchConfig,
  type MatchState,
  type PackedInput,
  type PackedSnapshot,
  type PlayerInput,
  type ServerMessage,
  type SimPlayerConfig,
  type Side,
} from '@hoops/shared';

import { AntiCheat } from './antiCheat.ts';
import { store } from './store.ts';
import type { Session } from './session.ts';

const MAX_MATCH_SECONDS = 15 * 60;
/** How far ahead of the server a client's inputs may buffer. */
const INPUT_BUFFER = 12;

/**
 * An authoritative match. The server runs the same deterministic simulation the
 * clients predict with, consuming their inputs and broadcasting snapshots. A
 * client that disagrees is corrected; a client that cheats is dropped.
 */
export class MatchRoom {
  readonly id: string;
  readonly config: MatchConfig;
  readonly seed: number;
  private state: MatchState;
  private sessions: [Session, Session];
  private ranks: [number, number];
  private inputs: [Map<number, PlayerInput>, Map<number, PlayerInput>];
  private held: [PlayerInput, PlayerInput] = [emptyInput(), emptyInput()];
  private cheat: [AntiCheat, AntiCheat];
  private timer: NodeJS.Timeout | null = null;
  private lastSnapshotFrame = 0;
  private ready = new Set<Side>();
  private startedAt = 0;
  private finished = false;
  onFinished: ((room: MatchRoom) => void) | null = null;

  constructor(
    id: string,
    a: { session: Session; player: SimPlayerConfig; rank: number },
    b: { session: Session; player: SimPlayerConfig; rank: number },
    config: Partial<MatchConfig> = {},
  ) {
    this.id = id;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.config = defaultMatchConfig(config);
    this.state = createMatch(a.player, b.player, this.config, this.seed);
    this.sessions = [a.session, b.session];
    this.ranks = [a.rank, b.rank];
    this.inputs = [new Map(), new Map()];
    this.cheat = [new AntiCheat(), new AntiCheat()];

    a.session.room = this;
    b.session.room = this;
    a.session.side = 0;
    b.session.side = 1;

    this.send(0, {
      t: 'matchFound',
      matchId: id,
      side: 0,
      opponent: b.player,
      opponentName: b.session.displayName,
      opponentRank: b.rank,
      config: this.config,
      seed: this.seed,
      startsInMs: 1200,
    });
    this.send(1, {
      t: 'matchFound',
      matchId: id,
      side: 1,
      opponent: a.player,
      opponentName: a.session.displayName,
      opponentRank: a.rank,
      config: this.config,
      seed: this.seed,
      startsInMs: 1200,
    });
  }

  markReady(side: Side): void {
    this.ready.add(side);
    if (this.ready.size === 2 && !this.timer) this.start();
  }

  private start(): void {
    this.startedAt = Date.now();
    const now = Date.now();
    for (const side of [0, 1] as Side[]) {
      this.send(side, { t: 'matchStart', serverFrame: 0, serverTime: now });
    }
    // The sim advances in fixed SIM_DT steps; the interval batches them so the
    // server does not need a 120 Hz timer.
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }

  receiveInput(side: Side, frame: number, packed: PackedInput): void {
    if (this.finished) return;
    if (!this.cheat[side].acceptInput(frame, packed)) {
      if (this.cheat[side].shouldKick()) this.kick(side, 'Anti-cheat: invalid input stream');
      return;
    }

    const input = unpackInput(packed);
    this.inputs[side].set(frame, input);

    // Relay to the opponent immediately so their prediction stays tight.
    const other: Side = side === 0 ? 1 : 0;
    this.send(other, { t: 'opponentInput', frame, input: packed });
  }

  /**
   * Drains the jitter buffer one input per simulation step, oldest first. The
   * client's frame counter advances at its own rate, so inputs are consumed as
   * an ordered stream rather than matched to a server frame number. When the
   * buffer runs dry we hold the last movement but never repeat a one-shot
   * action, so a stall cannot fire the same crossover twice.
   */
  private inputFor(side: Side): PlayerInput {
    const buffer = this.inputs[side];
    if (buffer.size === 0) {
      const held = this.held[side];
      return { ...held, move: null, steal: false, fake: false };
    }

    // A client running ahead of the server must not build an unbounded lead.
    while (buffer.size > INPUT_BUFFER * 4) {
      const oldest = this.oldestFrame(buffer);
      if (oldest === null) break;
      buffer.delete(oldest);
    }

    const frame = this.oldestFrame(buffer);
    if (frame === null) return this.held[side];
    const input = buffer.get(frame) as PlayerInput;
    buffer.delete(frame);
    this.held[side] = input;
    return input;
  }

  private oldestFrame(buffer: Map<number, PlayerInput>): number | null {
    let oldest: number | null = null;
    for (const key of buffer.keys()) {
      if (oldest === null || key < oldest) oldest = key;
    }
    return oldest;
  }

  private tick(): void {
    if (this.finished) return;

    const steps = Math.round(1 / 60 / SIM_DT);
    for (let i = 0; i < steps; i++) {
      const inputs: [PlayerInput, PlayerInput] = [this.inputFor(0), this.inputFor(1)];
      stepMatch(this.state, inputs, SIM_DT);

      for (const event of drainEvents(this.state)) {
        if (event.type === 'shotRelease') {
          this.cheat[event.side].recordRelease(event.timingError);
          if (this.cheat[event.side].shouldKick()) {
            this.kick(event.side, 'Anti-cheat: shot timing outside human bounds');
            return;
          }
        }
      }

      if (this.state.phase === 'over') {
        this.finish('played');
        return;
      }
    }

    if (this.state.frame - this.lastSnapshotFrame >= 120 / SNAPSHOT_HZ) {
      this.lastSnapshotFrame = this.state.frame;
      this.broadcastSnapshot();
    }

    if ((Date.now() - this.startedAt) / 1000 > MAX_MATCH_SECONDS) {
      this.finish('played');
    }
  }

  private broadcastSnapshot(): void {
    const snapshot = this.packSnapshot();
    for (const side of [0, 1] as Side[]) {
      this.send(side, { t: 'snapshot', frame: this.state.frame, ack: this.state.frame, state: snapshot });
    }
  }

  private packSnapshot(): PackedSnapshot {
    const round = (v: number) => Math.round(v * 100) / 100;
    const s = this.state;
    return {
      f: s.frame,
      p: s.players.map((p) => [
        round(p.x),
        round(p.z),
        round(p.y),
        round(p.vx),
        round(p.vz),
        round(p.vy),
        round(p.facing),
        round(p.stamina),
        round(p.stagger),
        ACT_STATE_IDS.indexOf(p.state),
      ]),
      b: [
        round(s.ball.x),
        round(s.ball.y),
        round(s.ball.z),
        round(s.ball.vx),
        round(s.ball.vy),
        round(s.ball.vz),
        BALL_STATE_IDS.indexOf(s.ball.state),
        s.ball.owner ?? -1,
      ],
      sc: [s.score[0], s.score[1]],
      pos: s.possession,
      clear: s.needsClear ? 1 : 0,
      shot: round(s.shotClock),
      phase: PHASE_IDS.indexOf(s.phase),
      rng: s.rngState,
    };
  }

  /** A disconnect forfeits, so ragequitting is never cheaper than losing. */
  handleDisconnect(side: Side): void {
    if (this.finished) return;
    this.state.winner = side === 0 ? 1 : 0;
    this.finish('disconnect');
  }

  leave(side: Side): void {
    if (this.finished) return;
    this.state.winner = side === 0 ? 1 : 0;
    this.finish('forfeit');
  }

  private kick(side: Side, reason: string): void {
    this.send(side, { t: 'kicked', reason });
    this.state.winner = side === 0 ? 1 : 0;
    this.finish('forfeit');
  }

  private finish(reason: 'played' | 'forfeit' | 'disconnect'): void {
    if (this.finished) return;
    this.finished = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const winner: Side = this.state.winner ?? (this.state.score[0] >= this.state.score[1] ? 0 : 1);

    for (const side of [0, 1] as Side[]) {
      const session = this.sessions[side];
      let delta = 0;
      let after = this.ranks[side];

      const won = winner === side;

      if (this.config.playlist === 'ranked') {
        const other: Side = side === 0 ? 1 : 0;
        const rankState = {
          points: this.ranks[side],
          tier: 'bronze' as const,
          division: 1,
          placementGamesLeft: 0,
          seasonHigh: this.ranks[side],
        };
        const update = updateRank(
          rankState,
          this.ranks[other],
          won,
          this.state.score[side],
          this.state.score[other],
        );
        delta = update.delta;
        after = update.after;
        session.rankPoints = after;
      }

      // Every finished game counts on the record, ranked or not. Only the ranked
      // court moves rank points, but a casual win is still a win and used to
      // leave no trace at all.
      session.record(won);

      // Write it down. Rank and record lived only on the in-memory session and
      // died with the socket, so every result was forgotten the moment the
      // player disconnected — which read as ranks resetting on restart, when in
      // fact they were never saved in the first place.
      store.update(session.userId, {
        rankPoints: session.rankPoints,
        wins: session.wins,
        losses: session.losses,
        winStreak: session.winStreak,
      });

      this.send(side, {
        t: 'matchEnd',
        winner,
        score: [this.state.score[0], this.state.score[1]],
        rankDelta: delta,
        rankAfter: after,
        reason,
      });

      const findings = this.cheat[side].report();
      if (findings.length) {
        console.warn(`[anticheat] ${session.displayName}:`, findings.map((f) => `${f.code}(${f.detail})`).join(', '));
      }

      session.room = null;
      session.side = null;
    }

    this.onFinished?.(this);
  }

  private send(side: Side, message: ServerMessage): void {
    this.sessions[side].send(message);
  }
}
