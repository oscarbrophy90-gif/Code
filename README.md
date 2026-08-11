# Hoops Elite

A 1v1 basketball game: green-bar shooting, six genuinely different CPU difficulty
levels, a MyPlayer builder with real attribute ceilings, badges that level up by
playing, five parks, 20-day seasons, and **online ranked matches against real people**
on a nine-tier ladder that resets every season and pays out when it does.

Everything in it is original. There are no third-party league, club or player names,
logos, likenesses or animations anywhere in the project — every team, court, crest,
jump shot and dribble move was created for Hoops Elite and is drawn or synthesised at
runtime.

### Just play it

Open **`dist-standalone/HoopsElite.html`** in any browser. It is a single self-contained
file — no install, no terminal, no server. Progress saves to your browser.

Everything except Ranked works that way. Ranked is played against other people, so it
needs a server to match you up: see [Online play](#online-play).

### Run from source

```
npm install
npm run dev                # play at http://localhost:5173
npm run build:standalone   # regenerate dist-standalone/HoopsElite.html
```

Every game is against the CPU. The project is structured so online multiplayer can be
added later without a rewrite — see [Online later](#online-later).

`npm test` runs both apps' test suites. `npm run typecheck` covers every package.
`npm run build` produces the production client bundle.

## Also in this repo: BetterMe

**[BetterMe](docs/BETTERME.md)** is a second, separate app living in `betterme/` — a
real-life progression game built on the same idea as MyPlayer, except the card is you.
You fill in a survey about your actual life, it gives you nine attributes and an
Overall, and then it hands you a short list of real things to do each day: train,
study, sleep, practise, call someone. Doing them raises the numbers.

Open **`dist-standalone/BetterMe.html`** to try it — same deal as Hoops Elite,
one self-contained file, no server.

```
npm run dev:betterme                 # http://localhost:5174
npm run build:standalone:betterme    # regenerate dist-standalone/BetterMe.html
npm run test:betterme
```

It shares nothing with Hoops Elite but the toolchain — separate workspace, separate
build, separate save data.

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

## Online play

**Ranked is online. Online is ranked.** Nothing else in the game touches a network:
Play, the Practice Gym and the drills are all local against the CPU, and none of them
move your rank. The only way to move it is to beat another person.

### Running the server

```bash
npm install
npm run build      # builds the client, which the server then serves
npm start          # http://localhost:8787
```

`server.js` is the whole thing: Express for the page and two JSON endpoints, Socket.io
for everything live. It needs no build step and no database — records live in
`server/data/db.json`, written atomically so a crash mid-write cannot corrupt the
board.

| Endpoint | What it is for |
| --- | --- |
| `GET /health` | Is it up, what version, how many are online and queued |
| `GET /leaderboard` | The board as JSON — the same list the game shows |
| `/` | The built game, when `client/dist` exists |

### Playing against somebody

Both players open the game, press **Find Player** on the Ranked screen, and the server
pairs whoever is waiting. The queue screen says how long it has been looking and how
many people are actually connected, because "Searching…" on its own is
indistinguishable from broken.

Two machines need to agree on where the server is:

- **Served by the server** (`http://your-host:8787`) — nothing to configure. The game
  talks to whatever served it.
- **The standalone HTML**, opened off a desktop, has no origin to infer from. Put the
  server's address into **Settings → Online server** on both machines. The *Test
  connection* button tells you which of "wrong address", "server is down" and "wrong
  version" you are looking at, because from the outside those three look identical.

On one network, that address is the host machine's LAN IP — `http://192.168.1.42:8787`,
not `localhost`, which means *this* machine on both of them and is why two laptops
never find each other. To play over the internet, deploy `server.js` anywhere that runs
Node (Render, Railway, Fly, a VPS) and use that URL.

### How a match actually runs

The server is a post office, not a referee. It matches two people, puts them in a
Socket.io room and carries their messages; it never simulates the game.

One of the two clients is the **host** and runs the simulation. The **guest** sends its
input and draws what the host sends back, twenty snapshots a second, eased between
frames so it looks continuous. That is a deliberate choice over the alternatives:

- *Both simulate in lockstep.* Elegant with a deterministic simulation — and it is
  deterministic, but only for arithmetic. `Math.sin` and friends are not required to be
  bit-identical across engines or CPUs, so two browsers can drift apart on one jump shot
  and never agree again. A desync you cannot detect is the worst failure available.
- *The server simulates.* Correct, and it means shipping the whole game to the server
  and keeping two implementations honest for ever.

The unfairness host-authority would otherwise create — the host's presses landing
instantly while the guest's arrive a round trip late — is paid off by holding the host's
own input back by the measured one-way latency. Both players' presses then land the same
distance from the moment they were made.

Results are the server's. It writes both records, and the client takes its rank from
that rather than counting its own wins, because a client that counts its own wins drifts
the first time a result does not arrive — and drift in your favour is indistinguishable
from cheating.

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
