# Hoops Elite

A single-player 1v1 basketball game against CPU opponents: green-bar shooting, six
genuinely different difficulty levels, a MyPlayer builder with real attribute ceilings,
badges that level up by playing, five parks and 8-week seasons.

Everything in it is original. There are no third-party league, club or player names,
logos, likenesses or animations anywhere in the project — every team, court, crest,
jump shot and dribble move was created for Hoops Elite and is drawn or synthesised at
runtime.

### Just play it

Open **`dist-standalone/HoopsElite.html`** in any browser. It is a single self-contained
file — no install, no terminal, no server. Progress saves to your browser.

### Run from source

```
npm install
npm run dev                # play at http://localhost:5173
npm run build:standalone   # regenerate dist-standalone/HoopsElite.html
```

Every game is against the CPU. The project is structured so online multiplayer can be
added later without a rewrite — see [Online later](#online-later).

`npm test` runs the simulation and balance tests. `npm run typecheck` covers all three
packages. `npm run build` produces the production client bundle.

## What actually works

This is a playable game, not a prototype stub.

- **Real gameplay.** A deterministic 120 Hz half-court simulation with movement,
  stamina, bumping, twelve dribble moves, stepbacks, eurosteps, hop jumpers, floaters,
  contact dunks, ankle breakers, chase-down blocks, strips, shooting fouls, free throws,
  rebounds and streetball clear rules.
- **Six CPU difficulties.** Rookie, Semi-Pro, Pro, All-Star, Superstar and Hall of Fame.
  These are not the same bot with a multiplier: reaction time runs 420 ms down to 95 ms,
  release error ±34% down to ±4.5%, and the move pool widens from basic handles to
  signature combos. Measured against a constant reference opponent they produce a 93% →
  3% win-rate curve.
- **Green-bar shooting.** A perfect release always goes in — no exceptions, no hidden
  roll, however heavy the contest. Slightly early or late shots fall off to realistic
  percentages. Contest attacks the *window* instead: a defender in your face shrinks the
  green band by up to 68%, scaled by your shooting rating, so a great shooter keeps a
  usable sliver under pressure and a poor one has almost nothing. Six jump shots trade
  window size against release speed, and the window is recomputed every frame from your
  ratings, badges, stamina, drift and the closeout — you can watch it shrink.
- **Adaptive AI.** The CPU builds a scouting report as you play — how often you shoot
  threes, how often you attack the rim — and from All-Star upward it acts on it, closing
  out harder on a shooter and sagging off a driver. Adaptive difficulty also tracks the
  score and your green rate, bounded so it never becomes a level you did not pick.
- **MyPlayer.** Height, weight, wingspan and position derive a hard cap for all nineteen
  attributes, so a 6'0" guard and a 7'1" centre genuinely cannot do each other's job.
  Name, position, jersey number, appearance and accessories, four save slots, face-scan
  placeholder. **Every build starts at exactly 60 overall** and can reach the high 90s.
- **Progression.** 60 to 99 overall across nineteen attributes, forty badges in four
  categories levelling Bronze → Silver → Gold → Hall of Fame → Legend purely by using the
  related skill, and Coins earned only through play. Nothing competitive is purchasable.
- **Walkout cutscene.** Every game opens with the announcement: the opponent walks out
  first with their name, title, overall, position, height and a scouting report of what
  they do well and badly, then you, wearing your equipped gear and title with your win
  streak under your name.
- **Practice gym.** A shoot-around with nobody guarding you and no clock, plus four timed
  training drills — three-point, layup, blocking & stealing, defending — with bronze,
  silver and gold rep tiers, a saved personal best on each, and a Coin payout per rep.
- **Titles and a locker.** Twenty-three titles worn under your name on the walkout: two
  starters, thirteen earned from what you actually did on court, two that only drop from
  seasonal challenges, and six you can buy. The Locker groups everything you own into
  Identity, Kit, Accessories, Animations and Flair with a live walkout preview.
- **Meta.** A six-rung career ladder, 8-week seasons, a 40-tier battle pass,
  daily/weekly/seasonal challenges that pay Coins, XP, cosmetics and titles, five
  parks you can walk around, a cosmetics store, and full career statistics.

## Repository layout

| Path | What lives there |
| --- | --- |
| `shared/` | The domain and the simulation. Ratings, caps, badges, shooting maths, MMR, economy, seasons, the wire protocol, and the deterministic match sim. Imported by both the client and the server. |
| `client/` | Vite + TypeScript. Canvas renderer with a projected 3D court, fixed-timestep loop, input (keyboard/gamepad/touch), and every menu screen. |
| `server/` | The online foundation, not used by the current single-player build. Matchmaking, authoritative match rooms, anti-cheat and cloud save, all running the same shared simulation. `server/db/schema.sql` is the production Postgres schema. |
| `docs/` | Architecture, netcode, database, progression tuning, UI specs and the roadmap. |

The single most important structural decision is that **the whole game is a pure
deterministic function in `shared/`** — `stepMatch(state, [inputA, inputB], dt)`. The
client drives side A with your input and side B with the AI. Nothing about that shape
assumes a local opponent, which is what makes online an addition rather than a rewrite.

## Online later

The game is single-player today. The work needed to add online is already done in
structure and mostly done in code:

- The simulation takes **two input streams** and does not care where they come from.
  Swapping the AI controller for a network adapter is a one-line change at the call site
  in `client/src/ui/match.ts`.
- `shared/src/protocol.ts` defines the wire format, and `shared/src/mmr.ts` the rating
  and matchmaking maths.
- `server/` contains a working authoritative server — matchmaking, match rooms running
  the same `stepMatch`, snapshot broadcast and anti-cheat.
- `client/src/net/client.ts` contains the prediction and reconciliation client.

That path was built and verified end to end (two browsers playing a live server-run
match) before the game was scoped to single player, so what remains is real
authentication and hosting, not architecture. See
[`docs/NETWORKING.md`](docs/NETWORKING.md).

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

Free throws use the same meter: hold shoot, release in the green. Nobody can contest
one, so the window is wide — it is the one shot that is purely about your timing.

A gamepad maps movement to the left stick, dribble moves to right-stick flicks, shoot to
the bottom face button and sprint to the right trigger. On touch devices a thumbstick,
an action cluster and a swipe pad for dribble moves appear automatically.

## Rules

Half court, 1v1, make-it-take-it. Twos from behind the arc and ones inside, first to 11,
win by 2, capped at 15. Fourteen-second shot clock. After any change of possession or an
offensive rebound the ball must be cleared back behind the arc before it can be scored.

Shooting fouls are called when a defender leaves his feet into a finisher: one free
throw from inside the arc, two from behind it, each worth a point.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the three packages fit together and why the sim is shared
- [`docs/GAMEPLAY.md`](docs/GAMEPLAY.md) — the shooting model, dribble system, defense and AI in detail
- [`docs/NETWORKING.md`](docs/NETWORKING.md) — the online foundation: matchmaking, the authoritative loop, prediction, reconciliation and anti-cheat
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
