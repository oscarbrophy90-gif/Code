# Data model

The production target is PostgreSQL 15+; the full DDL is in
[`server/db/schema.sql`](../server/db/schema.sql). The development server implements the
same surface over a JSON file (`server/src/store.ts`) so the project runs with no external
dependencies.

## What the schema is protecting

Three things can be exploited in a game like this: currency, ratings and rank. The schema
is shaped so each has a single authoritative path.

### Currency is a ledger, not a counter

`wallet.balance` exists for read speed, but the truth is `currency_ledger` — an
append-only table where every movement is a row with a reason and an **idempotency key**:

```sql
UNIQUE (myplayer_id, idempotency_key)
```

A retried match-reward write collides instead of paying twice. A mispriced patch can be
refunded precisely because every grant is individually identified. A suspicious balance can
be reconciled by summing the ledger, which a nightly job does.

Rows are never updated or deleted. Corrections are new rows.

### Ratings are bounded at rest

Every attribute column carries `CHECK (x BETWEEN 25 AND 99)`, and `wingspan_in` is checked
against `height_in` in the same row. This is deliberate belt-and-braces: the API validates,
the simulation validates, and the database refuses anyway. A bug in one layer cannot
persist an illegal build.

Attribute purchases are recorded in `attribute_purchase` with a foreign key to the ledger
row that paid for them, so a build's entire history is auditable.

### Rank is derived from immutable results

`match` and `match_participant` rows are the record. `rank_state` is a projection of them
maintained by the match room, and the leaderboard is a materialised view over
`rank_state` refreshed every 30 seconds. A rating cannot drift silently, because it can
always be recomputed from the match history.

Ties on the leaderboard break on **fewest games played**, so a high win rate outranks
grinding to the same points.

## Cloud save is deliberately opaque

```sql
CREATE TABLE cloud_save (
    account_id  uuid PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
    revision    bigint NOT NULL,
    blob        bytea NOT NULL,
    byte_size   integer NOT NULL CHECK (byte_size <= 524288)
);
```

The blob is the client's local profile. The server stores it, never parses it, and never
reads rank, currency or attributes out of it. It exists so a player's settings and
cosmetic choices follow them across devices — not to carry authority. Writes are
last-writer-wins on `revision`, which stops two devices from silently clobbering each
other.

If the blob were trusted for anything competitive, editing `localStorage` would be a
complete exploit. It is not, so it isn't.

## Table groups

| Group | Tables |
| --- | --- |
| Identity | `account`, `account_identity`, `device_session` |
| Builds | `myplayer`, `myplayer_badge`, `myplayer_unlock` |
| Economy | `wallet`, `currency_ledger`, `attribute_purchase` |
| Seasons | `season`, `season_pass`, `challenge_progress` |
| Ranked | `rank_state`, `leaderboard` (materialised view) |
| Matches | `match`, `match_participant`, `career_stats` |
| Cloud save | `cloud_save` |
| Integrity | `anticheat_event`, `report` |
| Social | `friendship`, `squad`, `squad_member` |
| Events | `live_event`, `tournament`, `tournament_entry` |

## Reproducible matches

`match` stores the seed alongside the participants and configuration. Combined with the
archived input streams, that is enough to replay any match exactly through the shared
simulation. This is what makes three things possible:

- **Dispute review** — a reported match can be re-run and watched.
- **Anti-cheat forensics** — a flagged session can be re-simulated to see what actually
  happened rather than inferring from statistics.
- **Regression testing** — real matches become test fixtures when the balance changes.

Input streams are written to object storage keyed by match ID rather than into Postgres;
they are large, append-only and never queried relationally.

## Indexing and retention

Hot paths are the leaderboard (covered by the materialised view's own indexes), a player's
recent matches (`match_participant_player_idx`), and the challenge expiry sweep
(`challenge_progress_expiry_idx`).

`career_stats` is maintained by trigger off `match_participant` so the statistics screen is
a single-row read rather than an aggregate over a player's entire history.

Retention: match rows are kept for the season plus one; input streams for 30 days;
anti-cheat events for 12 months; the ledger indefinitely.

## Migrations

Forward-only, one file per change, applied in a transaction. The two rules that matter for
a live game: never drop a column in the same release that stops writing it, and never
change the meaning of an existing enum value — add a new one.
