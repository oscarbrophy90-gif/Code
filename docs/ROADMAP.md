# Roadmap

## Where the project actually is

This is a playable game with a complete meta layer and working online play, not a
scaffold. What follows separates what is genuinely finished from what is stubbed, because
that distinction matters more than a feature list.

### Built and verified

| Area | State |
| --- | --- |
| Deterministic 120 Hz simulation | Complete. 16 tests including full bot-vs-bot games, determinism from identical seeds, and event coverage. |
| Green-bar shooting | Complete. Live-recomputed windows, six animations, contest geometry, grade resolution. Balance suite: 45% FG, 44% 3PT, 16% green rate, ~3.7 min games. |
| Dribbling, finishing, defense | Complete. 12 moves, stepback/euro/hop cancels, contact dunks, ankle breakers, chase-down blocks, strips, rebounds, clear rules. |
| AI | Complete. Five difficulties with lagged perception, offensive and defensive logic, adaptive difficulty. |
| MyPlayer builder | Complete. Body-derived caps, four save slots, appearance, templates. |
| Progression | Complete. 60→99 overall, 40 badges with attribute gating, tuned upgrade curve (~205 games for a focused build). |
| Seasons, battle pass, challenges | Complete. Deterministic 8-week calendar, 40 tiers, daily/weekly/seasonal generation. |
| Economy and store | Complete. 12 cosmetic categories, gameplay-only currency. |
| Parks | Complete. Five parks, walk-around hub, queue from a court. |
| Stats and leaderboards | Complete, with a deterministic offline ladder when the server is down. |
| Networking | Complete and verified end-to-end with two real browser clients: matchmaking, authoritative rooms, input relay, snapshots, prediction, reconciliation, private lobbies, forfeit-on-disconnect. |
| Anti-cheat | Input-stream validation and shot-timing distribution analysis. |
| Rendering | Projected 3D court, articulated players, five HUD meter styles, procedural portraits and crests. Zero binary assets. |

### Stubbed on purpose

| Area | What exists | What is missing |
| --- | --- | --- |
| Authentication | Local ID as the account key | Signed tokens, OAuth providers, device sessions |
| Persistence | JSON dev store | Postgres (schema written), migrations, connection pooling |
| Face scan | Slot, flag and UI affordance | Capture pipeline, photogrammetry, mesh/texture delivery |
| Squads | Park UI and schema | Party service, shared queueing, voice |
| Tournaments | Event definitions and schema | Bracket service, seeding, scheduling |
| Passing / assists | Attributes, badges and stat fields | Team modes to use them in |
| Music | Volume control | Adaptive soundtrack |

---

## Phase 1 — Production backend (4–6 weeks)

The current server is correct in shape and wrong in durability. Everything here replaces
development shortcuts without touching the protocol, because no message ever carried
authority.

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

## Phase 2 — Competitive integrity and depth (6–8 weeks)

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

## Phase 3 — Content and social (8–10 weeks)

- **2v2 and 3v3.** The simulation is already written around a player array and a possession
  model; passing, assists and Floor General/Dimer/Needle Threader all exist and are unused
  because there is nobody to pass to. This is the single largest gameplay unlock available.
- Squads: party service, shared queueing, park presence, voice.
- Two more parks and a seasonal rotating court.
- Signature animation packs: per-player jump shot tuning, dribble style selection.
- Spectating, built on the replay pipeline from Phase 1.

## Phase 4 — Platform reach (6–8 weeks)

- Native shells: Capacitor for iOS/Android, Electron or Tauri for desktop, sharing the
  same client bundle.
- Cross-platform play with input-method-aware matchmaking (a gamepad player and a touch
  player should be matched knowingly, not accidentally).
- Cloud save promoted from opaque blob to a merge strategy that handles genuine conflicts.
- Controller remapping, colourblind palettes, full screen-reader passes on menus.

## Phase 5 — Live operations (ongoing)

- Season pipeline: content authoring, scheduling, staged rollout.
- Balance telemetry: green rate by rating band, badge pick rates, build distribution by
  rank. Balance changes should be argued from data, and the schema already records what is
  needed.
- A/B infrastructure for economy tuning.
- Player-facing patch notes generated from the balance constants themselves.

---

## Technical debt worth naming

1. **`store.ts` is a JSON file.** Fine for development, wrong for anything real. It is
   isolated behind a small interface so the swap is contained.
2. **Auth is a placeholder.** The client's local ID is the account key. This is the single
   biggest gap between this and a shippable service.
3. **Passing exists but has no consumer.** Attributes, badges and stat fields for passing
   and assists are all present and always zero until team modes land.
4. **The renderer is 2D canvas.** It is fast, asset-free and readable, and it will not scale
   to five-a-side with crowds. WebGL is the eventual answer, and the camera already
   projects properly so the port is contained to the draw calls.
5. **No music.** There is a volume slider and nothing behind it.

## What would be cut under pressure

If the schedule collapsed, the honest minimum viable competitive product is: Phase 1 in
full, ranked seasons from Phase 2, and nothing else. The 1v1 game, the builder, badges and
the ladder are complete enough to stand on their own; parks, tournaments and team modes are
depth on top of a game that already works.
