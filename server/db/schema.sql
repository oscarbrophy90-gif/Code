-- Hoops Elite — production database schema (PostgreSQL 15+).
--
-- The development server ships with a JSON store so it runs with no
-- dependencies (server/src/store.ts). This file is the production target and
-- documents the authoritative shape of every persisted record.
--
-- Design rules enforced here:
--   * Currency and attributes are server-owned. A client save blob is stored
--     opaquely and is NEVER the source of truth for anything competitive.
--   * Every currency movement is written to an append-only ledger, so an
--     economy exploit is auditable and reversible.
--   * Ranked results are immutable rows; a player's rating is a projection of
--     them, not a mutable counter that can drift.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------- identity

CREATE TYPE region AS ENUM ('na-east', 'na-west', 'eu', 'apac', 'sa', 'oce');
CREATE TYPE platform AS ENUM ('web', 'ios', 'android', 'windows', 'mac', 'console');

CREATE TABLE account (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle          citext UNIQUE NOT NULL CHECK (char_length(handle) BETWEEN 3 AND 18),
    email           citext UNIQUE,
    home_region     region NOT NULL DEFAULT 'na-east',
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    -- Moderation state. `banned_until` NULL with `banned` true is permanent.
    banned          boolean NOT NULL DEFAULT false,
    banned_until    timestamptz,
    ban_reason      text
);

CREATE TABLE account_identity (
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    provider        text NOT NULL,
    provider_uid    text NOT NULL,
    linked_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_uid)
);
CREATE INDEX account_identity_account_idx ON account_identity (account_id);

CREATE TABLE device_session (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    platform        platform NOT NULL,
    refresh_hash    bytea NOT NULL,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz
);
CREATE INDEX device_session_account_idx ON device_session (account_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- myplayer

CREATE TYPE court_position AS ENUM ('PG', 'SG', 'SF', 'PF', 'C');

CREATE TABLE myplayer (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    slot            smallint NOT NULL CHECK (slot BETWEEN 0 AND 3),
    name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 18),

    -- Build. Caps are derived from these three numbers plus position, so the
    -- server can always recompute a legal ceiling without trusting the client.
    position        court_position NOT NULL,
    height_in       smallint NOT NULL CHECK (height_in BETWEEN 68 AND 90),
    weight_lb       smallint NOT NULL CHECK (weight_lb BETWEEN 160 AND 290),
    wingspan_in     smallint NOT NULL CHECK (wingspan_in BETWEEN height_in - 4 AND height_in + 9),

    -- Ratings, 25..99. A CHECK per column keeps a compromised client from
    -- writing an out-of-range value even if a validation layer is missed.
    three_point         smallint NOT NULL DEFAULT 25 CHECK (three_point BETWEEN 25 AND 99),
    mid_range           smallint NOT NULL DEFAULT 25 CHECK (mid_range BETWEEN 25 AND 99),
    layup               smallint NOT NULL DEFAULT 25 CHECK (layup BETWEEN 25 AND 99),
    dunk                smallint NOT NULL DEFAULT 25 CHECK (dunk BETWEEN 25 AND 99),
    ball_handle         smallint NOT NULL DEFAULT 25 CHECK (ball_handle BETWEEN 25 AND 99),
    passing             smallint NOT NULL DEFAULT 25 CHECK (passing BETWEEN 25 AND 99),
    speed               smallint NOT NULL DEFAULT 25 CHECK (speed BETWEEN 25 AND 99),
    acceleration        smallint NOT NULL DEFAULT 25 CHECK (acceleration BETWEEN 25 AND 99),
    strength            smallint NOT NULL DEFAULT 25 CHECK (strength BETWEEN 25 AND 99),
    vertical            smallint NOT NULL DEFAULT 25 CHECK (vertical BETWEEN 25 AND 99),
    stamina             smallint NOT NULL DEFAULT 25 CHECK (stamina BETWEEN 25 AND 99),
    perimeter_defense   smallint NOT NULL DEFAULT 25 CHECK (perimeter_defense BETWEEN 25 AND 99),
    interior_defense    smallint NOT NULL DEFAULT 25 CHECK (interior_defense BETWEEN 25 AND 99),
    rebounding          smallint NOT NULL DEFAULT 25 CHECK (rebounding BETWEEN 25 AND 99),
    steal               smallint NOT NULL DEFAULT 25 CHECK (steal BETWEEN 25 AND 99),
    block               smallint NOT NULL DEFAULT 25 CHECK (block BETWEEN 25 AND 99),

    overall         smallint NOT NULL DEFAULT 60 CHECK (overall BETWEEN 60 AND 99),
    level           smallint NOT NULL DEFAULT 1,
    xp              bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),

    -- Appearance and equipped items are cosmetic; JSONB keeps them flexible
    -- without a migration every time a customization slot is added.
    body            jsonb NOT NULL DEFAULT '{}'::jsonb,
    loadout         jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,

    UNIQUE (account_id, slot)
);
CREATE INDEX myplayer_account_idx ON myplayer (account_id) WHERE deleted_at IS NULL;

CREATE TYPE badge_tier AS ENUM ('none', 'bronze', 'silver', 'gold', 'hall_of_fame', 'legend');

CREATE TABLE myplayer_badge (
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id) ON DELETE CASCADE,
    badge_id        text NOT NULL,
    tier            badge_tier NOT NULL DEFAULT 'none',
    progress        integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (myplayer_id, badge_id)
);

CREATE TABLE myplayer_unlock (
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id) ON DELETE CASCADE,
    item_id         text NOT NULL,
    source          text NOT NULL,          -- 'purchase' | 'battle_pass' | 'rank_reward' | 'default'
    acquired_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (myplayer_id, item_id)
);

-- ---------------------------------------------------------------- economy

-- Balance is a materialised sum of the ledger, kept as a column for read speed
-- and reconciled by a nightly job against currency_ledger.
CREATE TABLE wallet (
    myplayer_id     uuid PRIMARY KEY REFERENCES myplayer(id) ON DELETE CASCADE,
    balance         bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_earned bigint NOT NULL DEFAULT 0,
    lifetime_spent  bigint NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE ledger_reason AS ENUM (
    'match_reward', 'daily_challenge', 'weekly_challenge', 'seasonal_challenge',
    'battle_pass', 'rank_reward', 'tournament', 'purchase', 'attribute_upgrade',
    'refund', 'admin_adjustment'
);

-- Append-only. Never UPDATE or DELETE a row here; corrections are new rows.
CREATE TABLE currency_ledger (
    id              bigserial PRIMARY KEY,
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id) ON DELETE CASCADE,
    delta           bigint NOT NULL CHECK (delta <> 0),
    reason          ledger_reason NOT NULL,
    -- Idempotency: a retried match-reward write collides instead of paying twice.
    idempotency_key text NOT NULL,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (myplayer_id, idempotency_key)
);
CREATE INDEX currency_ledger_player_time_idx ON currency_ledger (myplayer_id, created_at DESC);

-- Attribute purchases are recorded so a build's history can be audited and a
-- mispriced patch can be refunded precisely.
CREATE TABLE attribute_purchase (
    id              bigserial PRIMARY KEY,
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id) ON DELETE CASCADE,
    attribute       text NOT NULL,
    from_value      smallint NOT NULL,
    to_value        smallint NOT NULL CHECK (to_value > from_value),
    cost            bigint NOT NULL CHECK (cost > 0),
    ledger_id       bigint NOT NULL REFERENCES currency_ledger(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- seasons

CREATE TABLE season (
    id              text PRIMARY KEY,           -- 'S1', 'S2', …
    name            text NOT NULL,
    theme           text NOT NULL,
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL,
    CHECK (ends_at > starts_at)
);

CREATE TABLE season_pass (
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    season_id       text NOT NULL REFERENCES season(id),
    tier            smallint NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 40),
    tier_xp         bigint NOT NULL DEFAULT 0,
    premium         boolean NOT NULL DEFAULT false,
    premium_at      timestamptz,
    claimed_tiers   smallint[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (account_id, season_id)
);

CREATE TYPE challenge_scope AS ENUM ('daily', 'weekly', 'seasonal');

CREATE TABLE challenge_progress (
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    challenge_id    text NOT NULL,
    scope           challenge_scope NOT NULL,
    progress        integer NOT NULL DEFAULT 0,
    target          integer NOT NULL,
    claimed_at      timestamptz,
    expires_at      timestamptz NOT NULL,
    PRIMARY KEY (account_id, challenge_id)
);
CREATE INDEX challenge_progress_expiry_idx ON challenge_progress (expires_at);

-- ---------------------------------------------------------------- ranked

CREATE TYPE rank_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite', 'legend');
CREATE TYPE playlist AS ENUM ('casual', 'ranked', 'private', 'event');

CREATE TABLE rank_state (
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id) ON DELETE CASCADE,
    season_id       text NOT NULL REFERENCES season(id),
    points          integer NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 5000),
    tier            rank_tier NOT NULL DEFAULT 'bronze',
    division        smallint NOT NULL DEFAULT 4,
    placement_left  smallint NOT NULL DEFAULT 5,
    season_high     integer NOT NULL DEFAULT 0,
    -- Denormalised for the leaderboard read path.
    wins            integer NOT NULL DEFAULT 0,
    losses          integer NOT NULL DEFAULT 0,
    win_streak      integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (myplayer_id, season_id)
);

-- The leaderboard read path. Refreshed every 30s; ties break on fewest games
-- so a high win rate outranks grinding to the same points.
CREATE MATERIALIZED VIEW leaderboard AS
SELECT
    rs.season_id,
    a.home_region,
    m.account_id,
    m.id AS myplayer_id,
    m.name AS display_name,
    m.overall,
    rs.points,
    rs.wins,
    rs.losses,
    rs.win_streak,
    ROW_NUMBER() OVER (PARTITION BY rs.season_id ORDER BY rs.points DESC, rs.wins + rs.losses ASC) AS world_rank,
    ROW_NUMBER() OVER (PARTITION BY rs.season_id, a.home_region ORDER BY rs.points DESC, rs.wins + rs.losses ASC) AS region_rank
FROM rank_state rs
JOIN myplayer m ON m.id = rs.myplayer_id
JOIN account a ON a.id = m.account_id
WHERE m.deleted_at IS NULL
  AND a.banned = false
  AND rs.wins + rs.losses > 0;

CREATE UNIQUE INDEX leaderboard_pk ON leaderboard (season_id, myplayer_id);
CREATE INDEX leaderboard_world_idx ON leaderboard (season_id, world_rank);
CREATE INDEX leaderboard_region_idx ON leaderboard (season_id, home_region, region_rank);

-- ---------------------------------------------------------------- matches

CREATE TYPE match_end_reason AS ENUM ('played', 'forfeit', 'disconnect', 'anticheat', 'server_error');

CREATE TABLE match (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id       text NOT NULL REFERENCES season(id),
    playlist        playlist NOT NULL,
    park_id         text NOT NULL,
    -- The seed plus both input streams fully reproduce the match, which is what
    -- makes server-side replay verification and dispute review possible.
    seed            bigint NOT NULL,
    target_score    smallint NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    end_reason      match_end_reason,
    duration_ms     integer,
    server_build    text NOT NULL
);
CREATE INDEX match_season_time_idx ON match (season_id, started_at DESC);

CREATE TABLE match_participant (
    match_id        uuid NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    side            smallint NOT NULL CHECK (side IN (0, 1)),
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id),
    account_id      uuid NOT NULL REFERENCES account(id),
    won             boolean NOT NULL,

    points          smallint NOT NULL DEFAULT 0,
    fgm             smallint NOT NULL DEFAULT 0,
    fga             smallint NOT NULL DEFAULT 0,
    tpm             smallint NOT NULL DEFAULT 0,
    tpa             smallint NOT NULL DEFAULT 0,
    greens          smallint NOT NULL DEFAULT 0,
    assists         smallint NOT NULL DEFAULT 0,
    rebounds        smallint NOT NULL DEFAULT 0,
    steals          smallint NOT NULL DEFAULT 0,
    blocks          smallint NOT NULL DEFAULT 0,
    turnovers       smallint NOT NULL DEFAULT 0,
    ankle_breakers  smallint NOT NULL DEFAULT 0,
    contact_dunks   smallint NOT NULL DEFAULT 0,
    chase_downs     smallint NOT NULL DEFAULT 0,
    teammate_grade  numeric(3,2) NOT NULL DEFAULT 0,

    rank_before     integer,
    rank_after      integer,
    rank_delta      integer,
    currency_earned bigint NOT NULL DEFAULT 0,
    xp_earned       bigint NOT NULL DEFAULT 0,

    PRIMARY KEY (match_id, side)
);
CREATE INDEX match_participant_player_idx ON match_participant (myplayer_id);
CREATE INDEX match_participant_account_idx ON match_participant (account_id);

-- Career totals, maintained by trigger off match_participant so the stats
-- screen is a single-row read.
CREATE TABLE career_stats (
    myplayer_id     uuid PRIMARY KEY REFERENCES myplayer(id) ON DELETE CASCADE,
    games_played    integer NOT NULL DEFAULT 0,
    wins            integer NOT NULL DEFAULT 0,
    losses          integer NOT NULL DEFAULT 0,
    points          bigint NOT NULL DEFAULT 0,
    fgm             bigint NOT NULL DEFAULT 0,
    fga             bigint NOT NULL DEFAULT 0,
    tpm             bigint NOT NULL DEFAULT 0,
    tpa             bigint NOT NULL DEFAULT 0,
    greens          bigint NOT NULL DEFAULT 0,
    assists         bigint NOT NULL DEFAULT 0,
    rebounds        bigint NOT NULL DEFAULT 0,
    steals          bigint NOT NULL DEFAULT 0,
    blocks          bigint NOT NULL DEFAULT 0,
    turnovers       bigint NOT NULL DEFAULT 0,
    ankle_breakers  bigint NOT NULL DEFAULT 0,
    contact_dunks   bigint NOT NULL DEFAULT 0,
    chase_downs     bigint NOT NULL DEFAULT 0,
    grade_sum       numeric(10,2) NOT NULL DEFAULT 0,
    grade_count     integer NOT NULL DEFAULT 0,
    current_streak  integer NOT NULL DEFAULT 0,
    longest_streak  integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- cloud save

-- The client's local profile, stored opaquely for cross-device continuity.
-- Nothing competitive is ever read out of this blob — it exists so a player's
-- settings and cosmetic choices follow them, not to carry authority.
CREATE TABLE cloud_save (
    account_id      uuid PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
    revision        bigint NOT NULL,
    blob            bytea NOT NULL,
    byte_size       integer NOT NULL CHECK (byte_size <= 524288),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- integrity

CREATE TABLE anticheat_event (
    id              bigserial PRIMARY KEY,
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    match_id        uuid REFERENCES match(id) ON DELETE SET NULL,
    code            text NOT NULL,
    severity        numeric(3,2) NOT NULL CHECK (severity BETWEEN 0 AND 1),
    detail          text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anticheat_event_account_idx ON anticheat_event (account_id, created_at DESC);

CREATE TABLE report (
    id              bigserial PRIMARY KEY,
    reporter_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    reported_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    match_id        uuid REFERENCES match(id) ON DELETE SET NULL,
    category        text NOT NULL,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    CHECK (reporter_id <> reported_id)
);

-- ---------------------------------------------------------------- social

CREATE TABLE friendship (
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    friend_id       uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'pending',   -- pending | accepted | blocked
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, friend_id),
    CHECK (account_id <> friend_id)
);

CREATE TABLE squad (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    leader_id       uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    park_id         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    disbanded_at    timestamptz
);

CREATE TABLE squad_member (
    squad_id        uuid NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    joined_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (squad_id, account_id)
);

-- ---------------------------------------------------------------- events

CREATE TABLE live_event (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    kind            text NOT NULL,
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL,
    config          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE tournament (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        text NOT NULL REFERENCES live_event(id),
    season_id       text NOT NULL REFERENCES season(id),
    home_region     region NOT NULL,
    bracket_size    smallint NOT NULL,
    starts_at       timestamptz NOT NULL,
    completed_at    timestamptz,
    winner_id       uuid REFERENCES account(id)
);

CREATE TABLE tournament_entry (
    tournament_id   uuid NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    myplayer_id     uuid NOT NULL REFERENCES myplayer(id),
    seed            smallint NOT NULL,
    eliminated_round smallint,
    PRIMARY KEY (tournament_id, account_id)
);

COMMIT;
