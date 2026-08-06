import {
  ATTRIBUTE_KEYS,
  clampHeightToPosition,
  computeCaps,
  computeOverall,
  DEFAULT_TITLES,
  DEFAULT_UNLOCKS,
  freshBadges,
  freshRank,
  generateChallenges,
  levelForXp,
  seasonForTime,
  startingAttributes,
  STORE_BY_ID,
  syncChallengeStates,
  wingspanFor,
  type BuildSpec,
  type CareerStats,
  type GameSettings,
  type MyPlayer,
  type Profile,
  type SimPlayerConfig,
  EMOTE_SLOTS,
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
    highestDifficultyBeaten: null,
    winsByDifficulty: {},
    gamesByDifficulty: {},
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
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
      emoteSlots: ['emote-wave', 'emote-clap', 'emote-shrug', 'emote-point', null, null],
      courtId: 'court-standard',
      titleId: 'title-rookie',
      shotMeterStyle: 'arcBar',
    },
    attributes: startingAttributes(build),
    badges: freshBadges(),
    level: 1,
    xp: 0,
    currency: 2500,
    stats: emptyCareerStats(),
    rank: freshRank(),
    unlocked: [...new Set([...DEFAULT_UNLOCKS, ...DEFAULT_TITLES])],
    drillBests: {},
  };
}

function createProfile(): Profile {
  const now = Date.now();
  const season = seasonForTime(now);
  // No default player: you cannot play anything until you build one.
  return {
    version: PROFILE_VERSION,
    userId: `local-${now.toString(36)}`,
    displayName: 'Rookie',
    region: 'na-east',
    players: [],
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
      if (!parsed || parsed.version !== PROFILE_VERSION || !Array.isArray(parsed.players)) return createProfile();
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
      // Only the battle pass resets. Career statistics and the difficulty
      // ladder carry over — a cleared difficulty stays cleared.
      this.profile.battlePass = { seasonId: season.id, tier: 1, tierXp: 0, premium: false, claimed: [] };
    }
    // Older saves can hold heights that the position no longer allows, so
    // every build is pulled back inside its legal band on load.
    for (const p of this.profile.players) {
      const legalHeight = clampHeightToPosition(p.build.position, p.build.heightIn);
      if (legalHeight !== p.build.heightIn) p.build.heightIn = legalHeight;
      p.build.wingspanIn = wingspanFor(p.build.position, p.build.heightIn);
      if (typeof p.build.jerseyNumber !== 'number') p.build.jerseyNumber = 23;
      if (!p.loadout.titleId) p.loadout.titleId = 'title-rookie';
      for (const t of DEFAULT_TITLES) if (!p.unlocked.includes(t)) p.unlocked.push(t);
      if (!p.drillBests) p.drillBests = {};
      // Six emote slots replaced the single equipped emote. An older save keeps
      // whatever it had in slot one and fills the rest from the free emotes it
      // already owns, so the 1-6 keys do something the first time you press them.
      if (!Array.isArray(p.loadout.emoteSlots)) {
        const owned = p.unlocked.filter((id) => id.startsWith('emote-'));
        const seeded = [p.loadout.emoteId, ...owned.filter((id) => id !== p.loadout.emoteId)];
        p.loadout.emoteSlots = Array.from({ length: EMOTE_SLOTS }, (_, i) => seeded[i] ?? null);
      }
      // Length is fixed at six even if a save predates one of them.
      p.loadout.emoteSlots = Array.from({ length: EMOTE_SLOTS }, (_, i) => p.loadout.emoteSlots[i] ?? null);
      // Saves made before Speed With Ball existed have no value for it. Seed it
      // from Ball Handle so an old build plays like it always did rather than
      // suddenly moving like it is stuck in mud.
      for (const key of ATTRIBUTE_KEYS) {
        if (typeof p.attributes[key] !== 'number') {
          p.attributes[key] = key === 'speedWithBall' ? p.attributes.ballHandle ?? 25 : 25;
        }
      }
    }

    this.profile.challenges = syncChallengeStates(generateChallenges(now), this.profile.challenges);
    this.profile.settings = { ...defaultSettings(), ...this.profile.settings };
  }

  /** True once a build exists and one of them is equipped. Play is locked
   *  until then — every mode runs the equipped build, so there has to be one. */
  get hasPlayer(): boolean {
    return !!this.profile.players[this.profile.activeSlot];
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
    if (this.hasPlayer) {
      this.player.updatedAt = Date.now();
      this.player.level = levelForXp(this.player.xp);
    }
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
    if (this.profile.players.length === 0) return;
    this.update((p) => {
      p.players.splice(slot, 1);
      p.players.forEach((pl, i) => (pl.slot = i));
      p.activeSlot = Math.max(0, Math.min(p.activeSlot, p.players.length - 1));
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
      position: player.build.position,
      titleId: player.loadout.titleId,
      winStreak: player.stats.currentWinStreak,
      gear: equippedGear(player),
    };
  }
}

/** The visible gear on the walkout card, in the order it reads best. */
function equippedGear(player: MyPlayer): string[] {
  const l = player.loadout;
  const ids = [l.jerseyId, l.shoesId, l.clothingId, l.accessoryId, player.body.hairstyleId, l.celebrationId];
  const names: string[] = [];
  for (const id of ids) {
    const item = id ? STORE_BY_ID[id] : undefined;
    if (item && item.name !== 'None') names.push(item.name);
  }
  return names;
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
