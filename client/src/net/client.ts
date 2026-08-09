import {
  ACT_STATE_IDS,
  BALL_STATE_IDS,
  PHASE_IDS,
  PROTOCOL_VERSION,
  emptyInput,
  packInput,
  unpackInput,
  type ClientMessage,
  type LeaderboardEntry,
  type MatchConfig,
  type MatchState,
  type PackedSnapshot,
  type PlayerInput,
  type CourtMode,
  type ServerMessage,
  type SimPlayerConfig,
  type Side,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import type { NetAdapter } from '../ui/match.ts';

/** What the park shows while it is waiting. */
export interface QueueStatus {
  /** seconds spent waiting so far */
  waited: number;
  /** how many are on this exact court, including you */
  playersOnCourt: number;
  /** how many are connected to this server at all, including you */
  playersOnServer: number;
}

export interface MatchHandshake {
  matchId: string;
  side: Side;
  opponent: SimPlayerConfig;
  opponentName: string;
  opponentRank: number;
  seed: number;
  config: MatchConfig;
  adapter: NetAdapter;
}

type Handler = (msg: ServerMessage) => void;

const CONNECT_TIMEOUT_MS = 6000;
const QUEUE_TIMEOUT_MS = 90000;

/**
 * WebSocket client. The server is authoritative: we predict locally with the
 * shared simulation and reconcile against snapshots, so a green release feels
 * instant while the outcome is still decided server-side.
 */
class NetClient {
  private socket: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private handlers = new Set<Handler>();
  private pingTimer: number | null = null;
  latency = 0;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** The address this client is talking to, for the waiting screen. */
  get address(): string {
    return this.url();
  }

  private url(): string {
    return store.settings.serverUrl || 'ws://localhost:8787';
  }

  /**
   * Ask the server's health endpoint whether it is there.
   *
   * A WebSocket that fails to open tells you almost nothing — a wrong port, a
   * server that is down and a typo all look identical. The HTTP probe separates
   * them, which is what makes the Settings button worth having.
   */
  async probe(): Promise<{ sessions: number; rooms: number; queued: number }> {
    const ws = this.url();
    const http = ws.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:').replace(/\/$/, '');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const res = await fetch(`${http}/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const info = (await res.json()) as { version: number; sessions: number; rooms: number; queued: number };
      if (info.version !== PROTOCOL_VERSION) {
        throw new Error(`Server speaks v${info.version}, this build speaks v${PROTOCOL_VERSION}`);
      }
      return info;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw new Error(`No answer from ${ws} — is it running?`);
      // A refused connection surfaces as a bare "Failed to fetch", which tells a
      // player nothing. Everything that is not an explicit answer from the
      // server means the same thing to them: nothing is listening there.
      if (err instanceof TypeError) throw new Error(`Nothing is listening on ${ws}`);
      throw err instanceof Error ? err : new Error(`Could not reach ${ws}`);
    } finally {
      window.clearTimeout(timer);
    }
  }

  connect(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<WebSocket>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url());
      } catch {
        this.connecting = null;
        reject(new Error(`Could not reach ${this.url()}`));
        return;
      }

      const timer = window.setTimeout(() => {
        socket.close();
        this.connecting = null;
        reject(new Error(`No response from ${this.url()} — is the server running?`));
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(timer);
        this.socket = socket;
        this.connecting = null;
        this.send({
          t: 'hello',
          version: PROTOCOL_VERSION,
          token: store.profile.userId,
          // The name that matters is the one on the jersey. The profile display
          // name defaults to 'Rookie' and almost nobody changes it, so using it
          // meant every opponent was announced as "Rookie".
          displayName: store.player?.name || store.profile.displayName,
          region: store.profile.region,
        });
        this.startPing();
        resolve(socket);
      };

      socket.onerror = () => {
        clearTimeout(timer);
        this.connecting = null;
        reject(new Error(`Could not reach ${this.url()} — is the server running?`));
      };

      socket.onclose = () => {
        this.stopPing();
        if (this.socket === socket) this.socket = null;
      };

      socket.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'pong') {
          this.latency = Date.now() - msg.sent;
          return;
        }
        if (msg.t === 'record') {
          // Unprompted: it arrives with the handshake and again after every
          // match, so it is applied here rather than by whichever screen happens
          // to be awaiting something at the time.
          store.update((p) => {
            p.online = {
              wins: msg.wins,
              losses: msg.losses,
              placement: msg.placement,
              worldSize: msg.worldSize,
              updatedAt: Date.now(),
            };
          });
        }
        for (const h of [...this.handlers]) h(msg);
      };
    });

    return this.connecting;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ t: 'ping', sent: Date.now() });
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  cancelQueue(): void {
    this.send({ t: 'cancelQueue' });
  }

  /**
   * Queue for one court in one park.
   *
   * The pair of ids is the whole of who you will play: everyone waiting on this
   * park and this court is waiting for each other, and nobody else is a
   * candidate. `onStatus` is called with progress so the park can show it.
   */
  async queue(
    parkId: string,
    mode: CourtMode,
    player: SimPlayerConfig,
    rankPoints: number,
    onStatus: (status: QueueStatus) => void,
  ): Promise<MatchHandshake> {
    await this.connect();
    onStatus({ waited: 0, playersOnCourt: 1, playersOnServer: 1 });
    this.send({ t: 'queue', player, rankPoints, parkId, mode });
    return this.awaitMatch(onStatus);
  }

  async createPrivate(player: SimPlayerConfig): Promise<string> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const off = this.on((msg) => {
        if (msg.t === 'privateCreated') {
          off();
          resolve(msg.code);
        } else if (msg.t === 'error') {
          off();
          reject(new Error(msg.message));
        }
      });
      this.send({ t: 'createPrivate', player, config: {} });
      window.setTimeout(() => {
        off();
        reject(new Error('Lobby creation timed out'));
      }, CONNECT_TIMEOUT_MS);
    });
  }

  async joinPrivate(code: string, player: SimPlayerConfig): Promise<MatchHandshake> {
    await this.connect();
    this.send({ t: 'joinPrivate', code, player });
    return this.awaitMatch(() => {});
  }

  private awaitMatch(onStatus: (status: QueueStatus) => void): Promise<MatchHandshake> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off();
        this.cancelQueue();
        reject(new Error('No opponent found in time'));
      }, QUEUE_TIMEOUT_MS);

      const off = this.on((msg) => {
        if (msg.t === 'queueUpdate') {
          onStatus({ waited: msg.waited, playersOnCourt: msg.playersInQueue, playersOnServer: msg.playersOnServer });
        } else if (msg.t === 'matchFound') {
          clearTimeout(timer);
          off();
          this.send({ t: 'ready' });
          resolve({
            matchId: msg.matchId,
            side: msg.side,
            opponent: msg.opponent,
            opponentName: msg.opponentName,
            opponentRank: msg.opponentRank,
            seed: msg.seed,
            config: msg.config,
            adapter: new SocketAdapter(this, msg.side),
          });
        } else if (msg.t === 'error') {
          clearTimeout(timer);
          off();
          reject(new Error(msg.message));
        }
      });
    });
  }

  async leaderboard(scope: 'world' | 'region'): Promise<LeaderboardEntry[]> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const off = this.on((msg) => {
        if (msg.t === 'leaderboard' && msg.scope === scope) {
          off();
          resolve(msg.entries);
        }
      });
      this.send({ t: 'leaderboard', scope, region: store.profile.region });
      window.setTimeout(() => {
        off();
        reject(new Error('Leaderboard request timed out'));
      }, CONNECT_TIMEOUT_MS);
    });
  }

  /** Cloud save: the profile travels as an opaque blob the server never parses. */
  async saveProfile(): Promise<void> {
    await this.connect();
    this.send({ t: 'saveProfile', blob: store.exportBlob(), revision: Date.now() });
  }

  async loadProfile(): Promise<string | null> {
    await this.connect();
    return new Promise((resolve, reject) => {
      const off = this.on((msg) => {
        if (msg.t === 'profile') {
          off();
          resolve(msg.blob);
        }
      });
      this.send({ t: 'loadProfile' });
      window.setTimeout(() => {
        off();
        reject(new Error('Cloud save request timed out'));
      }, CONNECT_TIMEOUT_MS);
    });
  }

  subscribe(handler: Handler): () => void {
    return this.on(handler);
  }
}

/**
 * Per-match transport. Local inputs go up every frame; the opponent's inputs
 * arrive continuously and are held until superseded, which keeps prediction
 * stable through a dropped packet. Snapshots correct any drift.
 */
class SocketAdapter implements NetAdapter {
  /** Set by the match screen so a server-side end can close the game. */
  onEnded?: (result: { winner: Side; score: [number, number]; reason: string }) => void;
  private lastRemote: PlayerInput = emptyInput();
  private remoteFrame = -1;
  private pendingSnapshot: PackedSnapshot | null = null;
  private off: () => void;
  private closed = false;

  constructor(
    private client: NetClient,
    private side: Side,
  ) {
    this.off = client.subscribe((msg) => {
      if (msg.t === 'opponentInput') {
        if (msg.frame > this.remoteFrame) {
          this.remoteFrame = msg.frame;
          this.lastRemote = unpackInput(msg.input);
        }
      } else if (msg.t === 'snapshot') {
        this.pendingSnapshot = msg.state;
      } else if (msg.t === 'matchEnd') {
        this.closed = true;
        this.onEnded?.({ winner: msg.winner, score: msg.score, reason: msg.reason });
      } else if (msg.t === 'kicked') {
        this.closed = true;
        this.onEnded?.({ winner: this.side === 0 ? 1 : 0, score: [0, 0], reason: 'kicked' });
      }
    });
  }

  remoteInput(): PlayerInput {
    // Edge-triggered actions must not repeat while we wait for the next packet.
    const input = { ...this.lastRemote };
    this.lastRemote = { ...this.lastRemote, move: null, steal: false, fake: false };
    return input;
  }

  sendInput(frame: number, input: PlayerInput): void {
    if (this.closed) return;
    this.client.send({ t: 'input', frame, input: packInput(input) });
  }

  reconcile(state: MatchState): void {
    const snap = this.pendingSnapshot;
    if (!snap) return;
    this.pendingSnapshot = null;
    applySnapshot(state, snap, this.side);
  }

  latencyMs(): number {
    return this.client.latency;
  }

  close(): void {
    this.closed = true;
    this.off();
    this.client.send({ t: 'leaveMatch' });
  }
}

/**
 * Blends an authoritative snapshot into the predicted state. The remote player
 * snaps hard (we have no authority over them); the local player is only nudged
 * so input never feels rubber-banded unless prediction really diverged.
 */
export function applySnapshot(state: MatchState, snap: PackedSnapshot, localSide: Side): void {
  for (let i = 0; i < 2; i++) {
    const row = snap.p[i];
    if (!row) continue;
    const p = state.players[i];
    const [x, z, y, vx, vz, vy, facing, stamina, stagger, stateId] = row;
    const isLocal = i === localSide;
    const drift = Math.hypot(p.x - x, p.z - z);

    if (!isLocal || drift > 2.4) {
      p.x = x;
      p.z = z;
      p.y = y;
      p.vx = vx;
      p.vz = vz;
      p.vy = vy;
      p.state = ACT_STATE_IDS[stateId] ?? p.state;
    } else if (drift > 0.35) {
      // Gentle pull-in keeps the local player smooth.
      p.x += (x - p.x) * 0.22;
      p.z += (z - p.z) * 0.22;
    }
    p.facing = facing;
    p.stamina = stamina;
    p.stagger = stagger;
  }

  const [bx, by, bz, bvx, bvy, bvz, ballStateId, owner] = snap.b;
  state.ball.x = bx;
  state.ball.y = by;
  state.ball.z = bz;
  state.ball.vx = bvx;
  state.ball.vy = bvy;
  state.ball.vz = bvz;
  state.ball.state = BALL_STATE_IDS[ballStateId] ?? state.ball.state;
  state.ball.owner = owner < 0 ? null : ((owner | 0) as Side);

  state.score = [snap.sc[0], snap.sc[1]];
  state.possession = snap.pos;
  state.needsClear = snap.clear === 1;
  state.shotClock = snap.shot;
  state.phase = PHASE_IDS[snap.phase] ?? state.phase;
  state.rngState = snap.rng;
}

export const net = new NetClient();
