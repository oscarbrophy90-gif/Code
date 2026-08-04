# Architecture

## The central decision

The match simulation is a pure, deterministic function that lives in `shared/` and is
imported unchanged by both the client and the server.

```
                    shared/src/sim/match.ts
                    stepMatch(state, [inputA, inputB], dt)
                              │
              ┌───────────────┴───────────────┐
              │                               │
        client (predicts)              server (authoritative)
        renders at 60–144 fps          simulates at 120 Hz
        sends inputs at 60 Hz          broadcasts snapshots at 20 Hz
```

Everything else follows from this. Because the same code produces the same result from
the same inputs and seed:

- The client can start a shot the instant you press the button and be right about the
  outcome, so a green release feels immediate rather than round-trip-delayed.
- The server can recompute any shot from authoritative positions and never has to trust a
  client-reported result. There is no "I made it, trust me" message in the protocol.
- Anti-cheat can compare a player's real input stream against what the simulation would
  need, instead of pattern-matching on symptoms.
- A match is fully reproducible from `(seed, inputStreamA, inputStreamB)`, which is what
  makes replays, dispute review and regression testing possible.

Determinism is enforced by construction: the simulation never reads `Math.random`,
`Date.now` or any ambient state. All randomness comes from a seeded `Rng` (mulberry32)
whose 32-bit state is carried inside `MatchState` and serialised in every snapshot.

## Packages

### `shared/`

No dependencies, no DOM, no Node APIs. This is the game.

```
shared/src/
  types.ts        Domain types: attributes, builds, badges, profile, ranks
  ratings.ts      Attribute caps from body, overall calculation, upgrade costs
  badges.ts       40 badge definitions, tier thresholds, progression events
  shooting.ts     Shot profiles, green windows, contest, make percentages
  mmr.ts          Tiers, Elo-style updates, matchmaking bands
  economy.ts      Match rewards, level curve, store item types
  seasons.ts      Season calendar, battle pass, deterministic challenge generation
  protocol.ts     Wire format, input packing, snapshot packing
  rng.ts          Seeded PRNG
  sim/
    court.ts      Geometry in feet, arc/paint tests, shot value
    moves.ts      12 dribble moves, 5 dunk packages
    state.ts      Simulation state and input shapes
    match.ts      createMatch / stepMatch — the whole game
    ai.ts         Bot controller with lagged perception and adaptive difficulty
  data/
    teams.ts      12 original clubs with procedural crest descriptors
    parks.ts      5 parks with palettes
    cosmetics.ts  Store catalogue
    opponents.ts  Bot generation scaled to a target overall
```

### `client/`

Vite + TypeScript, no UI framework. Menus are plain DOM (fast on mobile, trivially
themeable); gameplay is a single canvas.

```
client/src/
  main.ts             Router, top bar, screen host
  state/store.ts      Profile persistence, save slots, mutations
  engine/
    loop.ts           Fixed-timestep accumulator with an FPS cap
    camera.ts         Pinhole camera and broadcast-style follow
    input.ts          Keyboard, gamepad and touch folded into one PlayerInput
    audio.ts          Procedurally synthesised SFX
  render/
    court.ts          Park backdrop, projected court, hoop and net
    players.ts        Articulated player billboards, ball, shot trails
    hud.ts            Score bug, five shot-meter styles, callouts
  ui/
    match.ts          Wires sim + render + input together
    session.ts        Applies rewards, badges, rank and challenges after a game
    touch.ts          Mobile controls
    portrait.ts       Procedural player portraits and team crests
    screens/          home, play, builder, myplayer, parks, season, store,
                      stats, leaderboard, settings
  net/client.ts       WebSocket client, prediction adapter, reconciliation
```

### `server/`

Node with `ws`. Runs on `--experimental-strip-types`, so there is no build step.

```
server/src/
  index.ts        HTTP health endpoint, socket handling, message routing
  session.ts      One connected client
  matchmaking.ts  Ticket queue, skill bands, private lobbies
  room.ts         Authoritative match: input jitter buffer, sim, snapshots
  antiCheat.ts    Input-stream validation and shot-timing analysis
  store.ts        Dev persistence (JSON); production target is server/db/schema.sql
```

## Frame timing

The simulation is fixed at 120 Hz (`SIM_DT = 1/120`). Rendering is decoupled and runs as
fast as the display allows, with an optional 60/120 cap. This matters more than usual
here: shot timing is the core skill, so the meter must advance at exactly the same rate
on a 60 Hz laptop and a 144 Hz monitor. A player on better hardware gets smoother
motion, never a wider green window.

The loop clamps a long stall (tab switch, GC pause) to 0.25 s and caps catch-up at 12
steps, so returning to a backgrounded tab never fast-forwards the match.

## Rendering

The court is drawn with a real pinhole camera rather than a fixed isometric transform.
World space is the simulation's own: `+x` across the court, `+y` up, `+z` away from the
backboard, all in feet.

For a point `P` the camera builds an orthonormal basis from its forward vector and
projects with `screen = centre + focal · (dot(v, right), −dot(v, up)) / dot(v, forward)`,
returning the depth and a pixels-per-foot scale. Everything — court lines, the arc, the
rim, players, the ball, the shot meter — is positioned in world units and projected, so
the geometry is always consistent and the camera can move freely.

Players are articulated billboards: limb angles are driven directly off simulation state
(`shooting` raises the arms in proportion to meter progress, `staggered` widens the
stance and drops the hips), so the animation can never disagree with what the simulation
actually did. Draw order is depth-sorted by `z` each frame.

## Data flow for one shot

1. `InputManager.sample()` folds keyboard/gamepad/touch into a `PlayerInput`.
2. `stepMatch` sees `shoot` rising with the ball, calls `startShot`, and the player
   enters the `shooting` state.
3. Every frame while the meter runs, `buildShotProfile` recomputes the green window from
   ratings, badges, stamina, drift and the live contest — the HUD renders this profile,
   so the band visibly shrinks as a defender closes.
4. On release, `resolveShot` draws one number from the seeded RNG and produces a grade,
   a make chance and an outcome.
5. The ball is launched along an arc whose endpoint encodes the result: a make targets
   the rim, an early release flies long, a late one comes up short.
6. A `shotRelease` event drives the HUD flash, audio, badge progress and statistics.
7. Online, the server has done exactly the same thing from the same inputs and seed, and
   its snapshot confirms it.

## Persistence

Locally the profile is one JSON blob in `localStorage`, written on a 220 ms debounce and
flushed on `visibilitychange` and `beforeunload`. Online it is mirrored to the server as
an opaque blob for cross-device continuity — the server stores it, never parses it, and
never derives rank or currency from it. Competitive state lives in server tables.
