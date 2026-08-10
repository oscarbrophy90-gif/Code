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
  type Appearance,
  applyRankedResult,
  seasonPayout,
  SEASON_EPOCH,
  SEASON_LENGTH_MS,
  type OnlineRecord,
} from '@hoops/shared';

import {
  allAccounts,
  loadRegistry,
  newId,
  profileKey,
  saveRegistry,
  type AccountSummary,
} from './accounts.ts';

import { boardPositionOf, invalidateBoard } from './board.ts';

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
  };
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
      tattooId: 'tat-none',
      jumpshotId: 'base-rise',
      dunkPackageId: 'basic-slam',
      celebrationId: 'celeb-nod',
      threeCelebrationId: 'three-hold',
      emoteId: 'emote-wave',
      emoteSlots: ['emote-wave', 'emote-clap', 'emote-shrug', 'emote-point', null, null],
      courtId: 'court-standard',
      titleId: 'title-rookie',
      auraId: null,
      nameEffectId: null,
      bannerId: null,
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
    seasonReport: null,
    challenges: syncChallengeStates(generateChallenges(now), []),
    settings: defaultSettings(),
    lastSyncedAt: 0,
    username: '',
    usernameChangedAt: 0,
    online: freshOnlineRecord(),
  };
}

/**
 * The display name of a season from its id alone.
 *
 * The report names the season that just ended, which by then is no longer the
 * current one — so it is rebuilt from the id rather than read off the clock.
 */
function seasonNameFor(id: string): string {
  const index = Number.parseInt(id.replace('S', ''), 10);
  if (!Number.isFinite(index) || index < 1) return 'Last season';
  return seasonForTime(SEASON_EPOCH + (index - 1) * SEASON_LENGTH_MS).name;
}

/** A standing with nothing on it — a new account, or a new season. */
function freshOnlineRecord(): OnlineRecord {
  return { wins: 0, losses: 0, lifetimeWins: 0, streak: 0, bestStreak: 0, updatedAt: 0, peakWins: 0 };
}

/**
 * Single source of truth for the meta game. Everything is persisted locally and
 * mirrored to the server as an opaque blob when a session is authenticated, so
 * the same save follows a player across devices.
 */
class Store {
  profile: Profile;
  /** which account is playing; the profile above is that account's save */
  accountId = '';
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  constructor() {
    this.profile = this.load();
    this.migrate();
  }

  private load(): Profile {
    const registry = loadRegistry();
    this.accountId = registry.activeId;
    try {
      const raw = localStorage.getItem(profileKey(this.accountId));
      if (!raw) return createProfile();
      const parsed = JSON.parse(raw) as Profile;
      if (!parsed || parsed.version !== PROFILE_VERSION || !Array.isArray(parsed.players)) return createProfile();
      return parsed;
    } catch {
      return createProfile();
    }
  }

  /**
   * Puts a different account in the chair.
   *
   * The current one is flushed first, because a switch that loses the last few
   * seconds of the previous player's game is a switch nobody trusts twice.
   */
  switchAccount(id: string): void {
    if (id === this.accountId) return;
    this.saveNow();
    const registry = loadRegistry();
    if (!registry.ids.includes(id)) return;
    registry.activeId = id;
    saveRegistry(registry);
    this.profile = this.load();
    this.migrate();
    for (const l of this.listeners) l();
  }

  /**
   * Starts a new account and switches to it.
   *
   * It lands with no username and no build, so the first-run flow catches it and
   * walks the new player through both — the same path the first person took.
   */
  addAccount(): string {
    this.saveNow();
    const registry = loadRegistry();
    const id = newId();
    registry.ids.push(id);
    registry.activeId = id;
    saveRegistry(registry);
    this.accountId = id;
    this.profile = createProfile();
    this.migrate();
    this.saveNow();
    for (const l of this.listeners) l();
    return id;
  }

  /** Every account on this device, for the switcher and the board. */
  accounts(rankedOnly = false): AccountSummary[] {
    return allAccounts(rankedOnly);
  }

  /** Where this account sits on the leaderboard, or null before its first game. */
  position(): number | null {
    return boardPositionOf(this.accountId);
  }

  /**
   * Ends a season and starts the next one.
   *
   * Three things happen together and they have to happen together: the ladder
   * is paid out, the ladder is wiped, and the battle pass starts again. Paying
   * without wiping would make every season's rewards cumulative for standing
   * still; wiping without paying would make a season of climbing worth nothing.
   *
   * The payout settles against the *peak* rank held during the season, and it
   * is written to a report rather than announced, because a season can end
   * while the game is closed — the next launch reads the note.
   */
  private rollSeason(season: ReturnType<typeof seasonForTime>): void {
    const previous = this.profile.seasonId;
    const online = this.profile.online;
    const peak = Math.max(online.peakWins ?? 0, online.wins);
    const player = this.profile.players[this.profile.activeSlot];

    const payout = player ? seasonPayout(peak, player.unlocked) : null;
    if (payout && player) {
      player.currency += payout.coins;
      const granted = [...payout.items, ...payout.titles];
      for (const id of granted) if (!player.unlocked.includes(id)) player.unlocked.push(id);
      this.profile.seasonReport = {
        seasonId: previous,
        seasonName: seasonNameFor(previous),
        peakWins: peak,
        tierName: payout.tierName,
        coins: payout.coins,
        items: granted,
        resetFrom: online.wins,
      };
    }

    // The ladder is wiped whether or not there was anything to pay out. Lifetime
    // wins and the best streak survive: those are a record of what you have
    // done, and a season reset is not supposed to erase your history, only your
    // standing.
    this.profile.online = {
      ...freshOnlineRecord(),
      lifetimeWins: online.lifetimeWins,
      bestStreak: online.bestStreak,
    };
    invalidateBoard();

    this.profile.seasonId = season.id;
    // Career statistics and the difficulty ladder carry over — a cleared
    // difficulty stays cleared.
    this.profile.battlePass = { seasonId: season.id, tier: 1, tierXp: 0, premium: false, claimed: [] };
  }

  /** Clears the season report once the player has been shown it. */
  clearSeasonReport(): void {
    if (!this.profile.seasonReport) return;
    this.update((p) => {
      p.seasonReport = null;
    });
  }

  /** Rolls the season over and refreshes the challenge board on load. */
  private migrate(): void {
    const now = Date.now();
    // Saves made before online play have no record on them. Defaulted rather
    // than version-bumped, because bumping the version throws the whole profile
    // away and nobody should lose their player to gain a rank of Bronze 3.
    if (!this.profile.online) {
      this.profile.online = freshOnlineRecord();
    }
    // Older shapes carried a server placement, which no longer exists — position
    // is worked out against the world at read time now.
    const rec = this.profile.online as unknown as Record<string, number>;
    if (typeof rec.streak !== 'number') rec.streak = 0;
    if (typeof rec.bestStreak !== 'number') rec.bestStreak = 0;
    if (typeof rec.lifetimeWins !== 'number') rec.lifetimeWins = rec.wins ?? 0;
    if (typeof this.profile.username !== 'string') this.profile.username = '';
    if (typeof this.profile.usernameChangedAt !== 'number') this.profile.usernameChangedAt = 0;
    if (typeof rec.peakWins !== 'number') rec.peakWins = rec.wins ?? 0;
    if (this.profile.seasonReport === undefined) this.profile.seasonReport = null;

    const season = seasonForTime(now);
    if (this.profile.seasonId !== season.id) {
      this.rollSeason(season);
    }
    // Older saves can hold heights that the position no longer allows, so
    // every build is pulled back inside its legal band on load.
    for (const p of this.profile.players) {
      const legalHeight = clampHeightToPosition(p.build.position, p.build.heightIn);
      if (legalHeight !== p.build.heightIn) p.build.heightIn = legalHeight;
      p.build.wingspanIn = wingspanFor(p.build.position, p.build.heightIn);
      if (typeof p.build.jerseyNumber !== 'number') p.build.jerseyNumber = 23;
      if (!p.loadout.titleId) p.loadout.titleId = 'title-rookie';
      if (!p.loadout.tattooId) p.loadout.tattooId = 'tat-none';
      if (!p.loadout.threeCelebrationId) p.loadout.threeCelebrationId = 'three-hold';
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
  /**
   * Writes a ranked result.
   *
   * Wins are the whole of the rank, so this is the only thing that moves it.
   * Practice, drills and the difficulty ladder all call their own reward paths
   * and none of them reach here — a rank you can get without playing a ranked
   * game would not mean anything.
   */
  recordRanked(won: boolean): { before: number; after: number } {
    const before = this.profile.online.wins;
    const after = applyRankedResult(before, won);
    this.update((p) => {
      const online = p.online;
      online.wins = after;
      if (won) {
        online.streak++;
        online.bestStreak = Math.max(online.bestStreak, online.streak);
        online.lifetimeWins++;
      } else {
        online.losses++;
        online.streak = 0;
      }
      online.updatedAt = Date.now();
      // The high-water mark for the season, which is what the payout reads.
      online.peakWins = Math.max(online.peakWins ?? 0, after);
    });
    // Written through rather than left to the debounce. The board reads saved
    // accounts, and the rank-change animation asks for the new placement in the
    // same tick the match ended — a 220ms wait would show the position from
    // before the win. It also means a ranked result survives closing the tab
    // the moment it lands.
    this.saveNow();
    invalidateBoard();
    return { before, after };
  }

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
      localStorage.setItem(profileKey(this.accountId), JSON.stringify(this.profile));
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
    const jersey = colorsOf(player.loadout.jerseyId, ['#e8eef5', '#8a93a6']);
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
      appearance: appearanceFor(player),
    };
  }
}

/** Colours off a store item, falling back to something sane if it is missing. */
function colorsOf(id: string | null | undefined, fallback: [string, string]): [string, string] {
  const item = id ? STORE_BY_ID[id] : undefined;
  return item ? item.colors : fallback;
}

/**
 * Everything you have equipped, resolved into the colours and ids the court
 * renderer draws from. This is the whole reason cosmetics show up in a game:
 * before it existed the renderer only ever saw two jersey colours, so shoes,
 * hair, sleeves and accessories were bought and then never seen.
 */
export function appearanceFor(player: MyPlayer): Appearance {
  const l = player.loadout;
  const jersey = colorsOf(l.jerseyId, ['#e8eef5', '#8a93a6']);
  const shoes = colorsOf(l.shoesId, ['#f2f2f2', '#c0c6d0']);
  const clothing = colorsOf(l.clothingId, ['#3a4050', '#8a93a6']);
  const accessory = colorsOf(l.accessoryId, ['#3a4050', '#3a4050']);
  const hair = colorsOf(player.body.hairstyleId, ['#241a17', '#3a2a24']);
  return {
    skinTone: player.body.skinTone,
    jerseyPrimary: jersey[0],
    jerseySecondary: jersey[1],
    shoePrimary: shoes[0],
    shoeSecondary: shoes[1],
    clothingId: l.clothingId,
    clothingPrimary: clothing[0],
    clothingSecondary: clothing[1],
    accessoryId: l.accessoryId,
    accessoryPrimary: accessory[0],
    accessorySecondary: accessory[1],
    hairstyleId: player.body.hairstyleId,
    hairPrimary: hair[0],
    tattooId: l.tattooId ?? 'tat-none',
    jerseyNumber: player.build.jerseyNumber,
    emoteSlots: [...(l.emoteSlots ?? [])],
    celebrationId: l.celebrationId,
    threeCelebrationId: l.threeCelebrationId ?? 'three-hold',
    auraId: l.auraId ?? null,
  };
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
  return colorsOf(id, ['#e8eef5', '#8a93a6']);
}

export const store = new Store();
export { jerseyColors };
