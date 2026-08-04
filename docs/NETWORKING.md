# Networking

## Model

Server-authoritative simulation with client-side prediction and input relay.

```
client A                        server                         client B
────────                        ──────                         ────────
sample input (60 Hz)
predict locally  ──── input ──▶  jitter buffer
                                 stepMatch @120 Hz  ── input ──▶  apply to prediction
                                       │
                  ◀── snapshot 20 Hz ──┼── snapshot 20 Hz ──▶
reconcile                              │                        reconcile
```

Three properties fall out of sharing the simulation:

1. **Local actions are instant.** Pressing shoot starts the meter on the same frame. The
   client is running the authoritative code, so its prediction is usually exactly right.
2. **The server is the truth.** It runs its own copy from the same seed and the real input
   streams. A client that reports something different is corrected, not believed.
3. **Both clients stay in sync between snapshots** because each receives the other's raw
   inputs at send rate and feeds them into the same simulation.

## Rates

| Channel | Rate | Notes |
| --- | --- | --- |
| Simulation | 120 Hz | Both sides. Fixed `SIM_DT = 1/120`. |
| Client input | 60 Hz | ~6 bytes of payload before framing |
| Input relay | on receipt | Forwarded to the opponent immediately |
| Snapshot | 20 Hz | Full authoritative state, ~200 bytes |
| Ping | 0.5 Hz | Drives the latency readout |

Inputs pack into a flag byte, four quantised axes and a move index:

```ts
{ f: number, mx: number, mz: number, dx: number, dz: number, m: number }
```

Axes quantise to −127…127. The move index is 0 for none, otherwise an index into a fixed
move table — a client cannot name a move that does not exist.

## The input jitter buffer

This is the part that is easy to get wrong, and the first implementation here did.

The obvious approach is to tag each input with a frame number and have the server apply
input `n` on simulation frame `n`. That breaks immediately, because the client's frame
counter and the server's advance independently: different start times, different tick
rates, drift. Within a second the numbers no longer line up and **no input is ever
applied** — the players simply stand still while everything else looks healthy.

Instead the server treats each client's inputs as an **ordered stream** and drains one per
simulation step, oldest first:

```ts
private inputFor(side: Side): PlayerInput {
  const buffer = this.inputs[side];
  if (buffer.size === 0) {
    // Hold movement, but never repeat a one-shot action.
    const held = this.held[side];
    return { ...held, move: null, steal: false, fake: false };
  }
  while (buffer.size > INPUT_BUFFER * 4) buffer.delete(this.oldestFrame(buffer)!);
  const frame = this.oldestFrame(buffer)!;
  const input = buffer.get(frame)!;
  buffer.delete(frame);
  this.held[side] = input;
  return input;
}
```

Two details matter:

- **Edge-triggered actions are never repeated.** When the buffer drains, movement is held
  but `move`, `steal` and `fake` are cleared. A dropped packet must not fire two
  crossovers.
- **A client running ahead cannot bank an advantage.** The buffer is capped; excess is
  discarded oldest-first rather than replayed in a burst.

The frame number is still carried, still used for ordering and duplicate rejection, and
still checked by anti-cheat — it just is not used as an index into the server's timeline.

## Reconciliation

A snapshot carries both players, the ball, score, possession, clear flag, shot clock,
phase and the RNG state. The client applies it asymmetrically:

- **The remote player snaps hard.** We have no authority over them, so the authoritative
  position is simply correct.
- **The local player is only nudged.** Under 0.35 ft of divergence, nothing happens. Between
  0.35 and 2.4 ft, the position eases 22% toward the server per snapshot. Beyond 2.4 ft
  prediction has genuinely failed and we snap.

The result is that ordinary play never rubber-bands — divergence is usually zero because
both sides ran identical code — while a real desync is corrected within a couple of frames.

Restoring `rngState` from the snapshot re-syncs the random stream, so subsequent shot rolls
match the server again.

## Matchmaking

Tickets carry a rating and a queue timestamp. Two tickets pair when **both** rating bands
overlap:

```ts
width  = min(1400, 140 + waitSeconds × 55)
band   = [points − width, points + width]
pair   ⟺ b ∈ bandA  ∧  a ∈ bandB
```

Requiring mutual acceptance stops a long-waiting player from being force-matched against
someone who just queued. Bands start at ±140 RP and widen to the full ladder over about
23 seconds, so the extremes of the ladder still get games. Casual pairs on availability
alone. Tickets are processed oldest-first so nobody starves.

Private lobbies mint a five-character code from an ambiguity-free alphabet
(no `I`, `O`, `0`, `1`).

## Ranked

Elo-style with a margin-of-victory term and a K that falls as you climb, so top-tier
ladders stay stable:

```
expected = 1 / (1 + 10^((opponent − you) / 700))
K        = 90 → 62 (Platinum) → 48 (Diamond) → 34 (Legend);  ×2.2 during placements
delta    = K × (result − expected) × marginMultiplier
```

Seven tiers across 0–5000 RP with four divisions each (Legend has none), five placement
games, and a soft reset to 62% at the season roll so a returning player is not stranded.

The client never sends its rank. It is read from the server's account record and written
back only by the match room.

## Anti-cheat

The authoritative simulation already makes the classic exploits impossible — you cannot
teleport, shoot from outside your range, or claim a make. What remains is the input
stream, so that is what is inspected:

| Check | Trigger | Action |
| --- | --- | --- |
| Input flood | >180 inputs/second | Drop, then kick |
| Range validation | axis outside ±127, flags >63, move index >12 | Drop, kick on repeat |
| Replay / reorder | frame ≤ last seen | Drop; flag after 120 stale frames |
| Move spam | >14 dribble moves in 2 s (animations cannot physically chain that fast) | Flag |
| **Timing macro** | over 25+ shots, mean absolute timing error <0.006 **and** standard deviation <0.004 | Kick |

The timing check is the important one, because an auto-green macro is otherwise
indistinguishable from a very good player on any single shot. It is not: human release
error forms a broad distribution, and a macro collapses it to a spike. Requiring both a
near-zero mean and near-zero variance across a sample means no human can trip it, and no
macro can avoid it without deliberately playing worse.

Findings are logged per session and surface as `anticheat_event` rows in production.
Disconnecting forfeits, so quitting is never cheaper than losing.

## Failure handling

- **Server unreachable.** The client offers a rank-matched AI game with casual rewards
  rather than a dead end. Ranked points are untouched.
- **Opponent disconnects.** The remaining player is awarded the win immediately.
- **Idle socket.** Dropped after 45 seconds of silence.
- **Message flood.** 400 messages/second per socket, then disconnect.
- **Match hangs.** Rooms are hard-capped at 15 minutes.

## Production notes

The development server authenticates on the client's local ID, which is fine for local
play and not fine for the internet. Production replaces `hello` with a signed JWT from the
account service; nothing else in the protocol changes, because no message ever carried
authority in the first place.

Scaling is straightforward given the shape: match rooms are independent and hold no shared
state, so they shard by match ID across a fleet. Matchmaking is the only stateful piece and
runs as a single service per region with a Redis-backed ticket queue. Regional servers keep
latency inside the ~50 ms band that a timing game needs; cross-region play is offered
explicitly rather than matched into silently.
