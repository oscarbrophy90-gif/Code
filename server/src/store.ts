import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LeaderboardEntry, Region } from '@hoops/shared';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_PATH = join(DATA_DIR, 'db.json');

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

  constructor() {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      this.db = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Db;
    } catch {
      this.db = { accounts: {} };
    }
    setInterval(() => this.flush(), 5000);
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

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DB_PATH, JSON.stringify(this.db), 'utf8');
    } catch (err) {
      console.error('[store] failed to persist', err);
    }
  }
}

export const store = new DevStore();
export type { AccountRecord };
