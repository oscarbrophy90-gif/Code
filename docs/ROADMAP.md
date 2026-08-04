# Roadmap

## Where the project actually is

Hoops Elite is a playable single-player game with a complete meta layer. What follows
separates what is genuinely finished from what is stubbed, because that distinction
matters more than a feature list.

### Built and verified

| Area | State |
| --- | --- |
| Deterministic 120 Hz simulation | Complete. 21 tests including full CPU-vs-CPU games, determinism from identical seeds, event coverage and the difficulty curve. |
| Green-bar shooting | Complete. Live-recomputed windows, six animations, contest geometry, grade resolution, free throws. |
| Six CPU difficulties | Complete. Rookie → Hall of Fame, each with distinct reaction time, release error, move pool, combo length, fake discipline and tendency reading. Verified 93% → 3% win-rate curve against a constant reference opponent, asserted in CI. |
| Adaptive AI | Complete. Lagged perception, scouting report on your three-point and drive tendencies, adaptive difficulty bounded to ±22%. |
| Dribbling, finishing, defense | Complete. 12 moves, stepback/euro/hop cancels, floaters, contact dunks, ankle breakers, chase-down blocks, strips, shooting fouls, free throws, split offensive/defensive rebounding, clear rules. |
| MyPlayer | Complete. 19 attributes with body-derived caps, exactly-60 start solved per build, jersey number, appearance, accessories, four save slots. |
| Progression | Complete. 60→99 overall, 40 badges with attribute gating, tuned upgrade curve (~205 games for a focused build). |
| Career ladder & statistics | Complete. Per-difficulty records, highest difficulty beaten, PPG/RPG/APG/SPG/BPG, FG/3PT/FT/green percentages, streaks. |
| Seasons, battle pass, challenges | Complete. Deterministic 8-week calendar, 40 tiers, daily/weekly/seasonal generation. |
| Economy and store | Complete. 12 cosmetic categories, Coins earned only through play. |
| Parks | Complete. Five parks, walk-around hub, start a run from a court. |
| Visuals | Projected 3D court, articulated players, five HUD meter styles, radar attribute graphs, procedural portraits and crests. Zero binary assets. |

### The online foundation (built, not wired in)

Online multiplayer is not part of the current game, but the architecture and most of the
code for it already exist and were verified end to end before the scope was set to
single player:

| Piece | State |
| --- | --- |
| `shared/src/protocol.ts` | Wire format, input packing, snapshot packing |
| `shared/src/mmr.ts` | Rating tiers, Elo updates, matchmaking bands |
| `server/` | Working authoritative server: matchmaking, match rooms running the same `stepMatch`, 20 Hz snapshots, anti-cheat |
| `client/src/net/client.ts` | Prediction and reconciliation client |

Turning it on is a matter of swapping the AI controller for the network adapter at one
call site in `client/src/ui/match.ts`, plus real authentication and hosting. It was
tested with two browsers playing a live server-run match.

### Stubbed on purpose

| Area | What exists | What is missing |
| --- | --- | --- |
| Authentication | Local ID as the account key | Signed tokens, OAuth providers, device sessions |
| Persistence | localStorage; JSON dev store on the server | Postgres (schema written), migrations, pooling |
| Face scan | Slot, flag and UI affordance | Capture pipeline, photogrammetry, mesh delivery |
| Passing / assists | Pass Accuracy attribute, badges and stat fields | Team modes to use them in |
| Tournaments | Event definitions and schema | Bracket service, seeding, scheduling |
| Music | Volume control | Adaptive soundtrack |

---

## Phase 1 — Depth in single player (4–6 weeks)

The fastest wins are all in the mode that exists today.

- **More opponents with personality.** The CPU currently varies by difficulty; give it
  archetypes too — a shooter that lives behind the arc, a slasher that never settles — so
  the ladder has variety as well as a slope.
- **Season mode**: a scripted run through the difficulty ladder with named original
  opponents, rather than one-off games.
- **Drills**: timing, dribbling and defensive mini-games that pay Coins and feed badges.
- **Replay and highlight capture**, built on the fact that a match is already fully
  reproducible from `(seed, inputA, inputB)`.
- **Music and crowd audio**, currently a volume slider with nothing behind it.

**Exit criteria:** a player has a reason to keep playing after clearing Hall of Fame.

## Phase 2 — Production backend (4–6 weeks)

Only needed once online or cross-device saves matter. The server is correct in shape and
wrong in durability; everything here replaces development shortcuts without touching the
protocol, because no message ever carried authority.

- Postgres behind the existing store interface; apply `server/db/schema.sql`; migration
  runner.
- Real auth: signed JWTs on `hello`, refresh tokens in `device_session`, OAuth providers.
- Redis-backed matchmaking tickets so the matchmaker can run as more than one process.
- Match archival: write `match` / `match_participant` rows and push input streams to object
  storage, which turns on replay and forensics.
- Observability: structured logs, per-room tick-time histograms, queue-depth and
  match-length dashboards.

**Exit criteria:** 500 concurrent matches on one region, p99 tick time under 4 ms, zero
authority derived from client messages.

## Phase 3 — Turning online on (6–8 weeks)

- Regional server fleet with explicit cross-region opt-in rather than silent matching.
- Server-side replay verification sampling a percentage of ranked matches.
- Reporting and review tooling on top of archived replays.
- Rollback netcode for the final 2–3 frames of input, which is what closes the gap for
  high-level play at 60–80 ms.
- Ranked seasons wired to `season` rows; automated end-of-season reward grants.
- Tournament service: brackets, seeding, scheduling, the Weekend Cup and Seasonal
  Championship.

**Exit criteria:** a full 8-week ranked season runs unattended, with rewards granted and no
manual intervention.

## Phase 4 — Team modes and social (8–10 weeks)

- **2v2 and 3v3.** The simulation is already written around a player array and a possession
  model; passing, assists and Floor General/Dimer/Needle Threader all exist and are unused
  because there is nobody to pass to. This is the single largest gameplay unlock available.
- Squads: party service, shared queueing, park presence, voice.
- Two more parks and a seasonal rotating court.
- Signature animation packs: per-player jump shot tuning, dribble style selection.
- Spectating, built on the replay pipeline from Phase 1.

## Phase 5 — Platform reach (6–8 weeks)

- Native shells: Capacitor for iOS/Android, Electron or Tauri for desktop, sharing the
  same client bundle.
- Cross-platform play with input-method-aware matchmaking (a gamepad player and a touch
  player should be matched knowingly, not accidentally).
- Cloud save promoted from opaque blob to a merge strategy that handles genuine conflicts.
- Controller remapping, colourblind palettes, full screen-reader passes on menus.

## Phase 6 — Live operations (ongoing)

- Season pipeline: content authoring, scheduling, staged rollout.
- Balance telemetry: green rate by rating band, badge pick rates, build distribution by
  rank. Balance changes should be argued from data, and the schema already records what is
  needed.
- A/B infrastructure for economy tuning.
- Player-facing patch notes generated from the balance constants themselves.

---

## Technical debt worth naming

1. **`client/src/net/client.ts` and `server/` are currently unreferenced by the game.**
   They are the online foundation and are documented as such, but nothing in the
   single-player build imports them, so they are not covered by the app's own usage. They
   remain typechecked and were verified working before the scope change.
2. **Auth is a placeholder.** The client's local ID is the account key. This only matters
   when online or cloud saves are turned on.
3. **Pass Accuracy exists but has no consumer.** The attribute, its badges and the assist
   stat fields are all present and always zero until team modes land — there is nobody to
   pass to in 1v1.
4. **The renderer is 2D canvas.** It is fast, asset-free and readable, and it will not scale
   to five-a-side with crowds. WebGL is the eventual answer, and the camera already
   projects properly so the port is contained to the draw calls.
5. **No music.** There is a volume slider and nothing behind it.

## What would be cut under pressure

If the schedule collapsed, the honest answer is that the game as it stands is already the
minimum viable product. The 1v1 game, the six-difficulty ladder, the builder, badges and
progression are complete and stand on their own. Everything after Phase 1 is depth on top
of something that already works, and online in particular is a business decision rather
than a technical one — the architecture is done either way.
