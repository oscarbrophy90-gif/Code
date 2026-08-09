import { computeOverall, type Profile } from '@hoops/shared';

/**
 * Everyone who plays on this copy of the game.
 *
 * The leaderboard is real people or it is nothing. There is no server, so the
 * only players this game can ever know about are the ones who sat down at it:
 * each creates a username, plays ranked matches, and takes a place on the board
 * against the others. Nobody is invented to fill it out.
 *
 * Each account is a whole profile under its own key, and the registry is the
 * index of them plus which one is playing. Keeping the profiles separate rather
 * than nesting them means switching accounts is a load rather than a merge, and
 * one account's save can never corrupt another's.
 */

const REGISTRY_KEY = 'hoops-elite.accounts.v1';
const PROFILE_PREFIX = 'hoops-elite.profile.';
/** Where the game kept its single profile before there were accounts. */
const LEGACY_KEY = 'hoops-elite.profile.v1';

export interface Registry {
  activeId: string;
  ids: string[];
}

/** What the leaderboard needs about one account, without loading all of it. */
export interface AccountSummary {
  id: string;
  username: string;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  lifetimeWins: number;
  /** true once they have finished a ranked match */
  ranked: boolean;
  builds: AccountBuild[];
}

export interface AccountBuild {
  name: string;
  position: string;
  heightIn: number;
  weightLb: number;
  overall: number;
  games: number;
  wins: number;
  losses: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  greens: number;
  attempts: number;
  bestStreak: number;
}

export function profileKey(id: string): string {
  return `${PROFILE_PREFIX}${id}`;
}

export function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Registry;
      if (parsed && typeof parsed.activeId === 'string' && Array.isArray(parsed.ids) && parsed.ids.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* fall through to a fresh registry */
  }

  // First run under accounts. A save from before this existed becomes account
  // one rather than being thrown away — nobody should lose a player to a
  // feature that adds players.
  const legacy = localStorage.getItem(LEGACY_KEY);
  const id = newId();
  if (legacy) {
    localStorage.setItem(profileKey(id), legacy);
    localStorage.removeItem(LEGACY_KEY);
  }
  const registry: Registry = { activeId: id, ids: [id] };
  saveRegistry(registry);
  return registry;
}

export function saveRegistry(registry: Registry): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* quota errors are non-fatal */
  }
}

export function newId(): string {
  return `acc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function readProfile(id: string): Profile | null {
  try {
    const raw = localStorage.getItem(profileKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

/**
 * Every account on this device, best first.
 *
 * `rankedOnly` is what the leaderboard passes: an account that has been created
 * but never finished a ranked match has no standing to show, so it is not on the
 * board. Making a username does not put you on it; playing does.
 */
export function allAccounts(rankedOnly = false): AccountSummary[] {
  const registry = loadRegistry();
  const out: AccountSummary[] = [];

  for (const id of registry.ids) {
    const profile = readProfile(id);
    if (!profile || !profile.username) continue;
    const online = profile.online ?? { wins: 0, losses: 0, lifetimeWins: 0, streak: 0, bestStreak: 0, updatedAt: 0 };
    const ranked = online.wins + online.losses > 0;
    if (rankedOnly && !ranked) continue;

    out.push({
      id,
      username: profile.username,
      wins: online.wins,
      losses: online.losses,
      streak: online.streak ?? 0,
      bestStreak: online.bestStreak ?? 0,
      lifetimeWins: online.lifetimeWins ?? online.wins,
      ranked,
      builds: (profile.players ?? []).map(summariseBuild),
    });
  }

  // Wins first, then fewer losses, then the older account — so a tie is broken
  // by something stable rather than by whichever happened to load first.
  out.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.id.localeCompare(b.id));
  return out;
}

function summariseBuild(player: Profile['players'][number]): AccountBuild {
  const s = player.stats;
  return {
    name: player.name,
    position: player.build.position,
    heightIn: player.build.heightIn,
    weightLb: player.build.weightLb,
    overall: computeOverall(player.attributes, player.build.position),
    games: s.gamesPlayed,
    wins: s.wins,
    losses: s.losses,
    points: s.points,
    rebounds: s.rebounds,
    assists: s.assists,
    steals: s.steals,
    blocks: s.blocks,
    greens: s.greens,
    attempts: s.shotAttemptsTimed,
    bestStreak: s.longestWinStreak,
  };
}

/**
 * Where an account sits on the board, 1-based, or null when it has not played.
 *
 * Derived from the same ordering the board uses rather than stored, so the
 * number on the rank badge and the number on the row can never disagree.
 */
export function positionOf(id: string): number | null {
  const board = allAccounts(true);
  const at = board.findIndex((a) => a.id === id);
  return at < 0 ? null : at + 1;
}

/** How many accounts have played a ranked match — the size of the board. */
export function boardSize(): number {
  return allAccounts(true).length;
}

/** Whether a username is already taken by another account on this device. */
export function usernameTaken(name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLowerCase();
  return allAccounts().some((a) => a.id !== exceptId && a.username.toLowerCase() === wanted);
}
