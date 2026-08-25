import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where ranked careers live.
 *
 * TEMPORARY IMPLEMENTATION — read this before shipping it anywhere real.
 *
 * The ladder has to be server-side: a rank the browser stores is a rank the
 * browser can edit, and localStorage is a text file the player owns. So RP,
 * wins, losses and the build a player presented are kept here, on the server,
 * and the client is only ever shown them.
 *
 * What this is NOT is a database, and it does not pretend to be one. It is a
 * JSON file with an in-memory cache in front of it, which is the right amount
 * of machinery for two people testing on a laptop and the wrong amount for
 * anything with real players in it. Two things are missing and both matter:
 *
 *   1. AUTHENTICATION. A client says who it is and this believes it. There are
 *      no accounts in the project yet, so identity is a claim, not a fact.
 *      Anyone who knows another player's account id can load their record.
 *      Until there are real accounts, this ladder is only as honest as the
 *      people playing on it.
 *   2. CONCURRENCY. One process, one file, last write wins. Fine for one
 *      server; wrong the moment there are two.
 *
 * The seam is deliberate. Everything above this file talks to the four methods
 * on `PlayerStore` and nothing else, so a real database is a new class with the
 * same four methods and a different constructor call in index.js — no changes to
 * matchmaking, to the RP maths, or to the client. The record shape below is
 * already the table:
 *
 *   accountId TEXT PRIMARY KEY, username TEXT, rp INT, wins INT, losses INT,
 *   build JSONB, updatedAt TIMESTAMPTZ
 */

const here = dirname(fileURLToPath(import.meta.url));

/** A fresh ranked career. */
export function freshRecord(accountId, username) {
  return {
    accountId,
    username: username || 'Player',
    rp: 0,
    wins: 0,
    losses: 0,
    /** the build this player last presented, so the opponent reads it from us */
    build: null,
    updatedAt: Date.now(),
  };
}

/**
 * The interface. A database implementation needs exactly these four methods.
 *
 * `get` may return null for somebody who has never played; `upsert` creates or
 * updates; `apply` is the one that must be atomic in a real store, because it
 * is the read-modify-write that moves the ladder.
 */
export class FilePlayerStore {
  #path;
  #cache = new Map();
  #dirty = false;
  #writing = null;

  constructor(path = join(here, 'data', 'players.json')) {
    this.#path = path;
  }

  async load() {
    try {
      const raw = await readFile(this.#path, 'utf8');
      const rows = JSON.parse(raw);
      for (const row of rows) this.#cache.set(row.accountId, row);
      console.log(`[hoops] ranked store: loaded ${this.#cache.size} player(s) from ${this.#path}`);
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[hoops] ranked store: could not read', this.#path, err.message);
      console.log('[hoops] ranked store: starting empty');
    }
  }

  get(accountId) {
    return this.#cache.get(accountId) ?? null;
  }

  /** Create the record if it is new, and refresh the parts the client owns. */
  upsert(accountId, { username, build }) {
    let row = this.#cache.get(accountId);
    if (!row) {
      row = freshRecord(accountId, username);
      this.#cache.set(accountId, row);
    }
    if (username) row.username = String(username).slice(0, 24);
    if (build) row.build = build;
    row.updatedAt = Date.now();
    this.#dirty = true;
    void this.#flush();
    return row;
  }

  /**
   * Move one player's ladder. The only place RP, wins and losses ever change.
   *
   * In a database this is one UPDATE in one transaction; here it is a mutation
   * of the cached row followed by a debounced write.
   */
  apply(accountId, { rp, won }) {
    const row = this.#cache.get(accountId) ?? freshRecord(accountId, 'Player');
    this.#cache.set(accountId, row);
    row.rp = Math.max(0, Math.round(rp));
    if (won) row.wins += 1;
    else row.losses += 1;
    row.updatedAt = Date.now();
    this.#dirty = true;
    void this.#flush();
    return row;
  }

  async #flush() {
    if (this.#writing || !this.#dirty) return;
    this.#dirty = false;
    this.#writing = (async () => {
      try {
        await mkdir(dirname(this.#path), { recursive: true });
        const tmp = `${this.#path}.tmp`;
        await writeFile(tmp, JSON.stringify([...this.#cache.values()], null, 2), 'utf8');
        // Rename is atomic on the same filesystem, so a crash mid-write cannot
        // leave a half-written ladder behind.
        await rename(tmp, this.#path);
      } catch (err) {
        console.warn('[hoops] ranked store: write failed', err.message);
      } finally {
        this.#writing = null;
        if (this.#dirty) void this.#flush();
      }
    })();
  }
}

/** The public view of a record: what a client is allowed to be told. */
export function publicProfile(row) {
  return {
    accountId: row.accountId,
    username: row.username,
    rp: row.rp,
    wins: row.wins,
    losses: row.losses,
  };
}
