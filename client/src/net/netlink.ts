import { emptyInput, type MatchState, type PlayerInput, type SimEvent, type Side } from '@hoops/shared';

import { online } from './online.ts';

/**
 * The two ends of an online match.
 *
 * One client runs the game and the other watches it. That is a deliberate
 * choice over the alternatives:
 *
 *  - *Both simulate in lockstep.* Elegant with a deterministic simulation, and
 *    it is deterministic — but only for arithmetic. `Math.sin` and friends are
 *    not required to give bit-identical results across engines or CPUs, so two
 *    browsers can drift apart on a jump shot and never agree again. A desync you
 *    cannot detect is the worst possible failure here.
 *  - *The server simulates.* Correct, and it means shipping the whole game to
 *    the server and keeping two implementations honest. The server is a relay
 *    instead, which is why it fits in one file.
 *
 * So: the host owns the state, the guest sends inputs and draws what it is told.
 * The unfairness that would otherwise create — the host's own presses landing
 * instantly while the guest's arrive a round trip late — is paid off by holding
 * the host's input back by the measured one-way latency. Both players' presses
 * then land the same distance from the moment they were made.
 */

/** How often the host publishes the world. */
const SNAPSHOT_HZ = 20;
const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;
/** How often the guest publishes its input. */
const INPUT_HZ = 60;
const INPUT_MS = 1000 / INPUT_HZ;
/** Never hold the host's own input longer than this, however bad the link is. */
const MAX_HOST_DELAY = 0.2;

export interface HostLink {
  role: 'host';
  /** the input to actually simulate this frame, held back to match the guest's */
  localInput(sampled: PlayerInput, nowMs: number): PlayerInput;
  /** the guest's most recent input */
  remoteInput(): PlayerInput;
  /** publishes the world, at the snapshot rate */
  publish(state: MatchState, events: SimEvent[], nowMs: number): void;
  dispose(): void;
}

export interface GuestLink {
  role: 'guest';
  /** sends the local input up to the host, at the input rate */
  send(input: PlayerInput, nowMs: number): void;
  /**
   * Writes the newest authoritative world into `state`, interpolated toward it.
   *
   * Returns the events that arrived with it, which the guest plays through the
   * same handler the host uses — so both players hear the same whistle.
   */
  apply(state: MatchState, nowMs: number): SimEvent[];
  /** true once at least one snapshot has landed */
  get ready(): boolean;
  dispose(): void;
}

export type NetLink = HostLink | GuestLink;

// ---------------------------------------------------------------------- host

export function createHostLink(guestSide: Side): HostLink {
  /** the guest's latest input, applied the moment it arrives */
  let remote: PlayerInput = emptyInput();
  /** the host's own inputs, waiting out the latency before they count */
  const pending: { input: PlayerInput; at: number }[] = [];
  let held: PlayerInput = emptyInput();
  let lastSnapshot = 0;

  const off = online.on<{ i: PlayerInput }>('input', (msg) => {
    if (msg?.i) remote = msg.i;
  });

  return {
    role: 'host',

    localInput(sampled, nowMs) {
      // Held back by the same one-way latency the guest's input spends in
      // flight. Symmetric delay is the whole point: it is better for both
      // players to be 40ms late than for one of them to be 80ms later than the
      // other, because only the second one is unfair.
      const delay = Math.min(MAX_HOST_DELAY, online.oneWay) * 1000;
      pending.push({ input: sampled, at: nowMs });
      const due = nowMs - delay;
      while (pending.length > 0 && pending[0].at <= due) {
        held = pending.shift()!.input;
      }
      // Nothing has matured yet (the first frames of a match): stand still
      // rather than firing an input early.
      return held;
    },

    remoteInput() {
      const input = remote;
      // One-shot fields would otherwise repeat every frame until the next
      // packet: an emote or a dribble move would fire on a loop.
      if (input.emote !== null || input.move !== null) {
        remote = { ...input, emote: null, move: null };
      }
      return input;
    },

    publish(state, events, nowMs) {
      if (nowMs - lastSnapshot < SNAPSHOT_MS) {
        // Events still have to reach the guest even between snapshots, or a
        // whistle that happened at the wrong moment is a whistle nobody hears.
        if (events.length > 0) online.sendSnapshot(strip(state), events);
        return;
      }
      lastSnapshot = nowMs;
      online.sendSnapshot(strip(state), events);
    },

    dispose() {
      off();
    },
  };

  /** The config is static and both sides built the same one — do not ship it. */
  function strip(state: MatchState): MatchState {
    const { config: _config, events: _events, ...rest } = state;
    return rest as MatchState;
  }
}

// --------------------------------------------------------------------- guest

interface Snapshot {
  state: MatchState;
  events: SimEvent[];
  at: number;
}

export function createGuestLink(): GuestLink {
  let previous: Snapshot | null = null;
  let latest: Snapshot | null = null;
  let pendingEvents: SimEvent[] = [];
  let lastSend = 0;

  const off = online.on<{ s: MatchState; e: SimEvent[] }>('snapshot', (msg) => {
    if (!msg?.s) return;
    previous = latest;
    latest = { state: msg.s, events: [], at: performance.now() };
    if (msg.e?.length) pendingEvents.push(...msg.e);
  });

  return {
    role: 'guest',

    get ready() {
      return latest !== null;
    },

    send(input, nowMs) {
      if (nowMs - lastSend < INPUT_MS) return;
      lastSend = nowMs;
      online.sendInput(input, nowMs);
    },

    apply(state, nowMs) {
      if (!latest) return [];

      // Everything except the moving parts is taken straight from the host —
      // score, possession, clocks, phases. These are decisions, not positions,
      // and a guest that smoothed a decision would show the wrong score.
      const config = state.config;
      Object.assign(state, latest.state);
      state.config = config;

      // The moving parts are eased from where they were toward where the host
      // says they are. Snapping twenty times a second is legible but it stutters;
      // this is the same information, drawn smoothly.
      if (previous) {
        const span = Math.max(1, latest.at - previous.at);
        const t = Math.min(1, (nowMs - latest.at) / span + 1);
        blend(state, previous.state, latest.state, t);
      }

      const events = pendingEvents;
      pendingEvents = [];
      return events;
    },

    dispose() {
      off();
    },
  };
}

/**
 * Eases positions from the previous snapshot toward the latest one.
 *
 * Only positions and facing — never state. A player who is `shooting` in the
 * newest snapshot is shooting, and interpolating that would mean drawing an
 * animation the host never played.
 */
function blend(into: MatchState, from: MatchState, to: MatchState, t: number): void {
  const k = Math.max(0, Math.min(1, t));
  for (let i = 0; i < 2; i++) {
    const a = from.players[i];
    const b = to.players[i];
    const p = into.players[i];
    if (!a || !b || !p) continue;
    p.x = a.x + (b.x - a.x) * k;
    p.z = a.z + (b.z - a.z) * k;
    p.y = a.y + (b.y - a.y) * k;
    p.facing = angleLerp(a.facing, b.facing, k);
  }
  into.ball.x = from.ball.x + (to.ball.x - from.ball.x) * k;
  into.ball.y = from.ball.y + (to.ball.y - from.ball.y) * k;
  into.ball.z = from.ball.z + (to.ball.z - from.ball.z) * k;
}

/** Shortest way round, so a player facing across the -π/π seam does not spin. */
function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
