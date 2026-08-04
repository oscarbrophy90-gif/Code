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
  type Playlist,
  type ServerMessage,
  type SimPlayerConfig,
  type Side,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import type { NetAdapter } from '../ui/match.ts';

export interface MatchHandshake {
  matchId: string;
  side: Side;
  opponent: SimPlayerConfig;
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

  private url(): string {
    return store.settings.serverUrl || 'ws://localhost:8787';
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
          displayName: store.profile.displayName,
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

  async queue(
    playlist: Playlist,
    player: SimPlayerConfig,
    rankPoints: number,
    parkId: string,
    onStatus: (message: string) => void,
  ): Promise<MatchHandshake> {
    await this.connect();
    onStatus('Searching for an opponent…');
    this.send({ t: 'queue', playlist, player, rankPoints, parkId });
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

  private awaitMatch(onStatus: (message: string) => void): Promise<MatchHandshake> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off();
        this.cancelQueue();
        reject(new Error('No opponent found in time'));
      }, QUEUE_TIMEOUT_MS);

      const off = this.on((msg) => {
        if (msg.t === 'queueUpdate') {
          onStatus(`Searching… ${msg.playersInQueue} player${msg.playersInQueue === 1 ? '' : 's'} in queue`);
        } else if (msg.t === 'matchFound') {
          clearTimeout(timer);
          off();
          onStatus('Opponent found');
          this.send({ t: 'ready' });
          resolve({
            matchId: msg.matchId,
            side: msg.side,
            opponent: msg.opponent,
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
      } else if (msg.t === 'kicked' || msg.t === 'matchEnd') {
        this.closed = true;
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
