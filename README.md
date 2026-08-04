# Hoops Elite

A competitive 1v1 basketball game: green-bar shooting, a MyPlayer builder with real
attribute ceilings, badges that level up by playing, five parks, ranked ladders and
8-week seasons.

Everything in it is original. There are no third-party league, club or player names,
logos, likenesses or animations anywhere in the project — every team, court, crest,
jump shot and dribble move was created for Hoops Elite and is drawn or synthesised at
runtime.

```
npm install
npm run dev          # client at http://localhost:5173
npm run dev:server   # game server at ws://localhost:8787
npm run dev:all      # both
```

`npm test` runs the simulation and balance tests. `npm run typecheck` covers all three
packages. `npm run build` produces the production client bundle.

## What actually works

This is a playable game, not a prototype stub.

- **Real gameplay.** A deterministic 120 Hz half-court simulation with movement,
  stamina, bumping, twelve dribble moves, stepbacks, eurosteps, hop jumpers, contact
  dunks, ankle breakers, chase-down blocks, strips, rebounds and streetball clear rules.
- **Green-bar shooting.** A perfect release is a guaranteed make unless you are heavily
  contested. Slightly early or late shots fall off to realistic percentages. Six jump
  shots trade window size against release speed, and the window itself is computed from
  your ratings, badges, stamina, drift and the defender's contest — you can watch it
  shrink as a closeout arrives.
- **MyPlayer.** Height, weight, wingspan and position derive a hard cap for all sixteen
  attributes, so a 6'0" guard and a 7'1" centre genuinely cannot do each other's job.
  Four save slots, full appearance customization, face-scan placeholder.
- **Progression.** 60 to 99 overall, forty badges across four categories that level from
  Bronze to Legend purely by using the related skill, and a currency earned only through
  play. Nothing competitive is purchasable.
- **Online.** WebSocket matchmaking with skill-based bands that widen as you wait,
  casual and ranked playlists, private lobbies by code, an authoritative server running
  the same simulation the client predicts with, and anti-cheat that validates the input
  stream and the statistical shape of your shot timing.
- **Meta.** Seven rank tiers, 8-week seasons, a 40-tier battle pass, daily/weekly/seasonal
  challenges generated deterministically from the calendar, five parks you can walk
  around, a cosmetics store, leaderboards, and a full statistics screen.

## Repository layout

| Path | What lives there |
| --- | --- |
| `shared/` | The domain and the simulation. Ratings, caps, badges, shooting maths, MMR, economy, seasons, the wire protocol, and the deterministic match sim. Imported by both the client and the server. |
| `client/` | Vite + TypeScript. Canvas renderer with a projected 3D court, fixed-timestep loop, input (keyboard/gamepad/touch), and every menu screen. |
| `server/` | Node + `ws`. Matchmaking, authoritative match rooms, anti-cheat, leaderboards, cloud save. `server/db/schema.sql` is the production Postgres schema. |
| `docs/` | Architecture, netcode, database, progression tuning, UI specs and the roadmap. |

The single most important structural decision is that **the simulation lives in
`shared/` and is byte-identical on both sides**. The client predicts with it, the server
is authoritative with it, and shot outcomes can therefore be re-derived and verified
rather than trusted.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| `Shift` | Sprint (drains stamina) |
| `Space` | Hold to raise the shot meter, release in the green. On defense, jump to contest or block. |
| `E` | Drive and finish — layup, dunk or contact dunk |
| `F` | Steal (a miss leaves you out of position) |
| `R` | Pump fake |
| `J` / `L` | Crossover left / right |
| `G` | Between the legs |
| `U` | Behind the back |
| `O` | Spin |
| `I` | Hesitation |
| `K` | Stepback (cancels into a jumper) |
| `M` | Snatch back |
| `Y` | Hop jumper |
| `N` | Eurostep |
| `H` | Size-up |
| `B` / `V` | Double crossover / fake pull-through (signature moves, gated on Ball Handle) |
| `Esc` | Pause |

A gamepad maps movement to the left stick, dribble moves to right-stick flicks, shoot to
the bottom face button and sprint to the right trigger. On touch devices a thumbstick,
an action cluster and a swipe pad for dribble moves appear automatically.

## Rules

Half court, 1v1, make-it-take-it. Twos from behind the arc and ones inside, first to 11,
win by 2, capped at 15. Fourteen-second shot clock. After any change of possession or an
offensive rebound the ball must be cleared back behind the arc before it can be scored.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the three packages fit together and why the sim is shared
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) — the shooting model, dribble system, defense and AI in detail
- [`docs/NETWORKING.md`](docs/NETWORKING.md) — matchmaking, the authoritative loop, prediction, reconciliation and anti-cheat
- [`docs/DATABASE.md`](docs/DATABASE.md) — the data model and the rules it enforces
- [`docs/PROGRESSION.md`](docs/PROGRESSION.md) — attribute caps, badge tuning, the economy and why it is not pay-to-win
- [`docs/UI.md`](docs/UI.md) — screen-by-screen specification and the visual language
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what is built, what is next, and the path to ship

## Original content only

No NBA, 2K, club, player or brand assets are used. Teams like the Harbor Point Tide and
Foundry Forge are invented; their crests are drawn procedurally from a shape/motif
descriptor at runtime. Player portraits are generated from build data. Every sound is
synthesised with the Web Audio API. There are no image, font or audio files in the
repository at all.
