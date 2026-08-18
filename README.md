# Hoops Elite

> **Also in this repo: [Acendri OS](ascendri/README.md)** — a Life Operating
> System prototype (goals, automatic timetables, finance, habits, achievements,
> social hub and a personal AI). Open **`ascendri/AcendriOS.html`** in any
> browser — one self-contained file, no install.

A 1v1 basketball game: green-bar shooting, six genuinely different CPU difficulty
levels, a MyPlayer builder with real attribute ceilings, badges that level up by
playing, five parks, 20-day seasons, and a **nine-tier ranked ladder against scaling CPU
opponents** that resets every season and pays out when it does.

Everything in it is original. There are no third-party league, club or player names,
logos, likenesses or animations anywhere in the project — every team, court, crest,
jump shot and dribble move was created for Hoops Elite and is drawn or synthesised at
runtime.

### Just play it

Open **`dist-standalone/HoopsElite.html`** in any browser. It is a single self-contained
file — no install, no terminal, no server. Progress saves to your browser.

Everything runs from that one file, Ranked included — there is no server and no
online play. See [Ranked](#ranked).

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
- **Green-bar shooting.** Timing decides the shot, not a dice roll. Green and Excellent
  always go in, however heavy the contest. Slightly early or late is the one band with a
  roll, and being open is what decides it — wide open a good shooter converts most of
  them, contested it drops to nothing. Early, late, very early and very late are misses.
  On release the whole bar floods with the answer: **green** in, **white** live,
  **orange** and **red** out. Contest attacks the *window*, shrinking the green band by
  up to 68% scaled by your shooting rating, so a great shooter keeps a usable sliver
  under pressure. Six jump shots trade window size against release speed.
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

## Ranked

Ranked is offline and played against the CPU. There is no matchmaking, no
server and no other people — the whole game runs from the one HTML file.

### The ladder is points, not wins

A win used to be worth exactly one rung, so five wins was a division however
good the opposition was — which measured how many games you played rather than
how well. The ladder is **ranked points** now: 100 RP a division, and how much
a result is worth depends on where you are.

| | Bronze | Gold | Champion | Grand Champ |
| --- | --- | --- | --- | --- |
| Win | +34 | +26 | +16 | +14 |
| Loss | −16 | −19 | −25 | −26 |

At Bronze a coin-flip record still climbs, so a beginner is never stuck. At
Champion a coin flip goes *down* — holding the rank needs a winning record and
climbing needs about 61%, rising to 65% at Grand Champ. A streak adds a little
(capped at +9) and a comfortable win adds a little (capped at +6), so neither
becomes the fastest way up.

### The CPU scales

Four inputs, in the order they matter: your **rank**, your build's **overall**,
your **win streak**, and your **level**. Rank decides what kind of fight it
should be; the rest decide what it can be, so a starter build at Gold and a
maxed build at Gold do not get handed the same player.

Between the six difficulty presets sits an **edge** value. A whole tier of the
ladder fits inside one preset, so without it Gold 3 and Gold 1 would field an
identical opponent. Edge interpolates toward the *next difficulty up* — edge 1
is exactly the next level, 0.5 is halfway. That bound is what keeps the bottom
of the ladder fair: however hard the ladder pushes, a sharpened Rookie can never
be worse than a Semi-Pro.

Streaks are capped per tier — 0.12 at Bronze against 0.55 at Grand Champ. Two
wins as a new player nudges the opponent; eight wins at Champion brings a wall.
A loss drops the streak to zero and the pressure with it.

### The leaderboard

Ninety generated rivals with you spliced in by points. The screen says outright
that they are generated — a board implying these were other people would be
lying, and the ladder does not need the lie. What it needs is names above and
below you, so a rank is a position rather than a number.

The rivals never move. You do, and the names you pass stay passed. Each row
shows rank, RP, overall, level, wins, losses and streak.

Your own name is generated too (`GreenAssassin23`, `MoneyDemonx`), pre-filled on
the first screen with a Randomise button, and saved — the one thing a generated
identity must not do is change every launch.

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
