import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LeaderboardEntry, Region } from '@hoops/shared';

/**
 * Where the records live.
 *
 * Configurable because a container's own filesystem is thrown away on every
 * restart and deploy. Pointing this at a mounted volume is the difference
 * between a ladder that persists and one that quietly starts over each time you
 * push — see docs/ONLINE-SETUP.md.
 */
const DATA_DIR = process.env.HOOPS_DATA_DIR
  ? process.env.HOOPS_DATA_DIR
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_PATH = join(DATA_DIR, 'db.json');
const TMP_PATH = `${DB_PATH}.tmp`;
const BAK_PATH = `${DB_PATH}.bak`;

interface AccountRecord {
  userId: string;
  displayName: string;
  region: Region;
  rankPoints: number;
  wins: number;
  losses: number;
  winStreak: number;
  overall: number;
  /** opaque client save blob — the server never parses its contents */
  saveBlob: string | null;
  saveRevision: number;
  updatedAt: number;
}

interface Db {
  accounts: Record<string, AccountRecord>;
}

/**
 * Development persistence. The production design is Postgres (see
 * docs/DATABASE.md and server/db/schema.sql) — this JSON store implements the
 * same surface so the server runs with no external dependencies.
 */
class DevStore {
  private db: Db = { accounts: {} };
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = this.load();
    const count = Object.keys(this.db.accounts).length;
    console.log(`[store] ${count} account${count === 1 ? '' : 's'} from ${DB_PATH}`);

    this.timer = setInterval(() => this.flush(), 5000);
    // A deploy or a Ctrl-C used to throw away up to five seconds of results,
    // which on a short game is a whole match.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        this.close();
        process.exit(0);
      });
    }
  }

  /**
   * Reads the database, falling back to the last good copy.
   *
   * A parse failure used to be swallowed and replaced with an empty database —
   * one truncated write and every account was gone with nothing in the log to
   * say so. Now a bad file is kept, the backup is tried, and it is loud.
   */
  private load(): Db {
    for (const [path, label] of [
      [DB_PATH, 'database'],
      [BAK_PATH, 'backup'],
    ] as const) {
      if (!existsSync(path)) continue;
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Db;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.accounts !== 'object') {
          throw new Error('not a database');
        }
        if (label === 'backup') console.warn('[store] recovered from backup');
        return { accounts: parsed.accounts ?? {} };
      } catch (err) {
        console.error(`[store] ${label} at ${path} is unreadable:`, err instanceof Error ? err.message : err);
        if (label === 'database') {
          // Keep it. It is the only copy of whatever was in there.
          try {
            copyFileSync(path, `${path}.corrupt-${Date.now()}`);
            console.error('[store] kept a copy alongside it for inspection');
          } catch {
            /* nothing more to do */
          }
        }
      }
    }
    return { accounts: {} };
  }

  /** Flush and stop. Called on shutdown so the last results are not lost. */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
  }

  account(userId: string, displayName: string, region: Region): AccountRecord {
    let record = this.db.accounts[userId];
    if (!record) {
      record = {
        userId,
        displayName,
        region,
        rankPoints: 0,
        wins: 0,
        losses: 0,
        winStreak: 0,
        overall: 60,
        saveBlob: null,
        saveRevision: 0,
        updatedAt: Date.now(),
      };
      this.db.accounts[userId] = record;
    }
    record.displayName = displayName;
    record.region = region;
    this.dirty = true;
    return record;
  }

  update(userId: string, patch: Partial<AccountRecord>): void {
    const record = this.db.accounts[userId];
    if (!record) return;
    Object.assign(record, patch, { updatedAt: Date.now() });
    this.dirty = true;
  }

  saveProfile(userId: string, blob: string, revision: number): boolean {
    const record = this.db.accounts[userId];
    if (!record) return false;
    // Last-writer-wins on revision keeps two devices from clobbering silently.
    if (revision < record.saveRevision) return false;
    record.saveBlob = blob;
    record.saveRevision = revision;
    record.updatedAt = Date.now();
    this.dirty = true;
    return true;
  }

  loadProfile(userId: string): { blob: string | null; revision: number } {
    const record = this.db.accounts[userId];
    return { blob: record?.saveBlob ?? null, revision: record?.saveRevision ?? 0 };
  }

  leaderboard(scope: 'world' | 'region', region?: Region, limit = 100): LeaderboardEntry[] {
    const rows = Object.values(this.db.accounts)
      .filter((a) => (scope === 'region' ? a.region === region : true))
      .filter((a) => a.wins + a.losses > 0)
      .sort((a, b) => b.rankPoints - a.rankPoints)
      .slice(0, limit);

    return rows.map((a, i) => ({
      rank: i + 1,
      userId: a.userId,
      displayName: a.displayName,
      region: a.region,
      rankPoints: a.rankPoints,
      wins: a.wins,
      losses: a.losses,
      overall: a.overall,
      winStreak: a.winStreak,
    }));
  }

  /**
   * Writes the database so that a crash cannot leave a half-written one.
   *
   * Write to a temporary file, force it to disk, then rename over the real one —
   * a rename within a directory is atomic, so at every instant the file on disk
   * is either entirely the old database or entirely the new one. Writing
   * straight over the target, as this used to, means a process killed mid-write
   * leaves a truncated file, and the loader treated that as "no accounts".
   */
  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const json = JSON.stringify(this.db);
      writeFileSync(TMP_PATH, json, 'utf8');
      // Rename is only atomic with respect to what is already on the platter.
      const fd = openSync(TMP_PATH, 'r');
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      // Keep the version we are replacing, so a bad write is recoverable.
      if (existsSync(DB_PATH)) copyFileSync(DB_PATH, BAK_PATH);
      renameSync(TMP_PATH, DB_PATH);
    } catch (err) {
      console.error('[store] failed to persist', err);
      // Try again on the next tick rather than dropping the change.
      this.dirty = true;
    }
  }
}

export const store = new DevStore();
export type { AccountRecord };
