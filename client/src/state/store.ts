import {
  computeCaps,
  computeOverall,
  DEFAULT_UNLOCKS,
  freshBadges,
  freshRank,
  generateChallenges,
  levelForXp,
  seasonForTime,
  startingAttributes,
  syncChallengeStates,
  type BuildSpec,
  type CareerStats,
  type GameSettings,
  type MyPlayer,
  type Profile,
  type SimPlayerConfig,
} from '@hoops/shared';

const STORAGE_KEY = 'hoops-elite.profile.v1';
export const PROFILE_VERSION = 1;
export const MAX_SLOTS = 4;

type Listener = () => void;

function emptyCareerStats(): CareerStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    points: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    greens: 0,
    shotAttemptsTimed: 0,
    ankleBreakers: 0,
    contactDunks: 0,
    chaseDownBlocks: 0,
    teammateGradeSum: 0,
    teammateGradeCount: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    highestRankPoints: 0,
  };
}

export function defaultSettings(): GameSettings {
  return {
    shotMeterStyle: 'arcBar',
    shotMeterOnFreeThrowOnly: false,
    cameraShake: true,
    fpsCap: 0,
    quality: 'high',
    masterVolume: 0.8,
    sfxVolume: 0.9,
    musicVolume: 0.4,
    touchControls: matchMedia('(pointer: coarse)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    serverUrl: defaultServerUrl(),
  };
}

function defaultServerUrl(): string {
  if (typeof location === 'undefined') return 'ws://localhost:8787';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.hostname}:8787`;
}

export function createPlayer(slot: number, name: string, build: BuildSpec): MyPlayer {
  const now = Date.now();
  return {
    id: `mp-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    slot,
    name,
    createdAt: now,
    updatedAt: now,
    build,
    body: {
      skinTone: 3,
      hairstyleId: 'hair-fade',
      facialHairId: 'face-none',
      bodyType: 'athletic',
      faceScanId: null,
      muscleDefinition: 0.5,
    },
    loadout: {
      jerseyId: 'jersey-starter',
      shoesId: 'shoes-starter',
      clothingId: 'cloth-shorts-basic',
      accessoryId: 'acc-none',
      jumpshotId: 'base-rise',
      dunkPackageId: 'basic-slam',
      celebrationId: 'celeb-nod',
      emoteId: 'emote-wave',
      courtId: 'court-standard',
      shotMeterStyle: 'arcBar',
    },
    attributes: startingAttributes(build),
    badges: freshBadges(),
    level: 1,
    xp: 0,
    currency: 2500,
    stats: emptyCareerStats(),
    rank: freshRank(),
    unlocked: [...DEFAULT_UNLOCKS],
  };
}

function createProfile(): Profile {
  const now = Date.now();
  const season = seasonForTime(now);
  const player = createPlayer(0, 'Rookie', {
    position: 'SG',
    heightIn: 77,
    weightLb: 200,
    wingspanIn: 80,
  });
  return {
    version: PROFILE_VERSION,
    userId: `local-${now.toString(36)}`,
    displayName: 'Rookie',
    region: 'na-east',
    players: [player],
    activeSlot: 0,
    seasonId: season.id,
    battlePass: { seasonId: season.id, tier: 1, tierXp: 0, premium: false, claimed: [] },
    challenges: syncChallengeStates(generateChallenges(now), []),
    settings: defaultSettings(),
    lastSyncedAt: 0,
  };
}

/**
 * Single source of truth for the meta game. Everything is persisted locally and
 * mirrored to the server as an opaque blob when a session is authenticated, so
 * the same save follows a player across devices.
 */
class Store {
  profile: Profile;
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor() {
    this.profile = this.load();
    this.migrate();
  }

  private load(): Profile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createProfile();
      const parsed = JSON.parse(raw) as Profile;
      if (!parsed || parsed.version !== PROFILE_VERSION || !parsed.players?.length) return createProfile();
      return parsed;
    } catch {
      return createProfile();
    }
  }

  /** Rolls the season over and refreshes the challenge board on load. */
  private migrate(): void {
    const now = Date.now();
    const season = seasonForTime(now);
    if (this.profile.seasonId !== season.id) {
      this.profile.seasonId = season.id;
      this.profile.battlePass = { seasonId: season.id, tier: 1, tierXp: 0, premium: false, claimed: [] };
      for (const p of this.profile.players) {
        p.stats.highestRankPoints = Math.max(p.stats.highestRankPoints, p.rank.points);
        // Soft reset: a new season starts everyone lower but keeps their floor.
        p.rank.points = Math.round(p.rank.points * 0.62);
        p.rank.placementGamesLeft = 3;
        p.rank.seasonHigh = p.rank.points;
      }
    }
    this.profile.challenges = syncChallengeStates(generateChallenges(now), this.profile.challenges);
    this.profile.settings = { ...defaultSettings(), ...this.profile.settings };
  }

  get player(): MyPlayer {
    return this.profile.players[this.profile.activeSlot] ?? this.profile.players[0];
  }

  get settings(): GameSettings {
    return this.profile.settings;
  }

  overall(player = this.player): number {
    return computeOverall(player.attributes, player.build.position);
  }

  caps(player = this.player) {
    return computeCaps(player.build);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Mutate the profile and persist. Batched so rapid edits stay cheap. */
  update(fn: (p: Profile) => void): void {
    fn(this.profile);
    this.player.updatedAt = Date.now();
    this.player.level = levelForXp(this.player.xp);
    for (const l of this.listeners) l();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 220);
  }

  saveNow(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // Quota errors are non-fatal — the session keeps playing in memory.
    }
  }

  exportBlob(): string {
    return JSON.stringify(this.profile);
  }

  importBlob(blob: string): boolean {
    try {
      const parsed = JSON.parse(blob) as Profile;
      if (!parsed?.players?.length) return false;
      this.profile = parsed;
      this.migrate();
      this.update(() => {});
      return true;
    } catch {
      return false;
    }
  }

  addSlot(name: string, build: BuildSpec): number {
    const slot = this.profile.players.length;
    if (slot >= MAX_SLOTS) return -1;
    this.update((p) => {
      p.players.push(createPlayer(slot, name, build));
      p.activeSlot = slot;
    });
    return slot;
  }

  deleteSlot(slot: number): void {
    if (this.profile.players.length <= 1) return;
    this.update((p) => {
      p.players.splice(slot, 1);
      p.players.forEach((pl, i) => (pl.slot = i));
      p.activeSlot = Math.min(p.activeSlot, p.players.length - 1);
    });
  }

  selectSlot(slot: number): void {
    this.update((p) => {
      p.activeSlot = Math.max(0, Math.min(p.players.length - 1, slot));
    });
  }

  owns(itemId: string): boolean {
    return this.player.unlocked.includes(itemId);
  }

  /** Builds the config the simulation needs from the active MyPlayer. */
  simConfig(player = this.player): SimPlayerConfig {
    const jersey = jerseyColors(player.loadout.jerseyId);
    return {
      id: player.id,
      name: player.name,
      attrs: { ...player.attributes },
      badges: player.badges.map((b) => ({ ...b })),
      heightIn: player.build.heightIn,
      weightLb: player.build.weightLb,
      wingspanIn: player.build.wingspanIn,
      jumpshotId: player.loadout.jumpshotId,
      dunkPackageId: player.loadout.dunkPackageId,
      jerseyPrimary: jersey[0],
      jerseySecondary: jersey[1],
      skinTone: player.body.skinTone,
      isBot: false,
    };
  }
}

function jerseyColors(id: string): [string, string] {
  const map: Record<string, [string, string]> = {
    'jersey-starter': ['#e8eef5', '#8a93a6'],
    'jersey-harbor': ['#1a6f8f', '#5fe3d0'],
    'jersey-forge': ['#c2452d', '#ffb347'],
    'jersey-voltage': ['#f0c419', '#4ad9ff'],
    'jersey-royals': ['#6b3fc4', '#c9a227'],
    'jersey-elite': ['#a06bff', '#d9bcff'],
    'jersey-legend': ['#ff5c8a', '#ffd23d'],
    'jersey-midnight': ['#101018', '#00e5b0'],
  };
  return map[id] ?? map['jersey-starter'];
}

export const store = new Store();
export { jerseyColors };
