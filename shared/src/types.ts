/**
 * Core domain types for Hoops Elite.
 * All content (teams, players, brands) is original — no third-party IP.
 */

export const ATTRIBUTE_KEYS = [
  'closeShot',
  'midRange',
  'threePoint',
  'freeThrow',
  'layup',
  'dunk',
  'ballHandle',
  'speedWithBall',
  'passAccuracy',
  'speed',
  'acceleration',
  'strength',
  'vertical',
  'stamina',
  'perimeterDefense',
  'interiorDefense',
  'steal',
  'block',
  'offensiveRebound',
  'defensiveRebound',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

export const BADGE_CATEGORIES = ['shooting', 'finishing', 'playmaking', 'defense'] as const;
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];

export const BADGE_TIERS = ['none', 'bronze', 'silver', 'gold', 'hallOfFame', 'legend'] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

export const RANK_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'elite',
  'legend',
] as const;
export type RankTier = (typeof RANK_TIERS)[number];

export type Playlist = 'casual' | 'ranked' | 'private';

/** Physical build inputs chosen in the MyPlayer creator. */
export interface BuildSpec {
  position: Position;
  /** 0–99, shown on the jersey */
  jerseyNumber: number;
  /** inches, 68–90 */
  heightIn: number;
  /** pounds, 160–290 */
  weightLb: number;
  /** inches, height-4 .. height+9 */
  wingspanIn: number;
}

export interface BodyCustomization {
  skinTone: number; // 0..7
  hairstyleId: string;
  facialHairId: string;
  bodyType: 'lean' | 'athletic' | 'built' | 'heavy';
  faceScanId: string | null; // placeholder for face-scan pipeline
  muscleDefinition: number; // 0..1
}

/** In-game emote slots, fired with the 1-6 keys. */
export const EMOTE_SLOTS = 6;

export interface Loadout {
  jerseyId: string;
  shoesId: string;
  clothingId: string;
  accessoryId: string | null;
  tattooId: string;
  jumpshotId: string;
  dunkPackageId: string;
  /** plays when you win the game */
  celebrationId: string;
  /** plays the moment a three goes down */
  threeCelebrationId: string;
  /** the emote the store equips on purchase — slot 1's default */
  emoteId: string;
  /**
   * The six in-game emote slots, fired with the 1-6 keys. A null slot is empty
   * and its key does nothing.
   */
  emoteSlots: (string | null)[];
  courtId: string;
  /** shown under your name on the walkout */
  titleId: string;
  /** ranked spoils: light around you, an effect on your name, a banner */
  auraId: string | null;
  nameEffectId: string | null;
  bannerId: string | null;
  shotMeterStyle: ShotMeterStyle;
}

export type ShotMeterStyle =
  | 'arcBar'
  | 'sideBar'
  | 'circleRing'
  | 'dualPips'
  | 'hidden';

export interface BadgeState {
  id: string;
  tier: BadgeTier;
  /** progress points toward the next tier */
  progress: number;
}

export interface CareerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  greens: number;
  shotAttemptsTimed: number;
  ankleBreakers: number;
  contactDunks: number;
  chaseDownBlocks: number;
  teammateGradeSum: number;
  teammateGradeCount: number;
  currentWinStreak: number;
  longestWinStreak: number;
  highestRankPoints: number;
  /** hardest difficulty this build has actually won on */
  highestDifficultyBeaten: Difficulty | null;
  /** games won per difficulty, for the ladder display */
  winsByDifficulty: Partial<Record<Difficulty, number>>;
  gamesByDifficulty: Partial<Record<Difficulty, number>>;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

/** The six you can pick in Play. The career ladder is exactly these. */
export const DIFFICULTIES = ['rookie', 'semiPro', 'pro', 'allStar', 'superstar', 'hallOfFame'] as const;

/**
 * The four difficulties above Hall of Fame, which exist only on the ranked
 * ladder.
 *
 * They are deliberately not in `DIFFICULTIES`, so none of them ever appears in
 * the Play menu — the only way to meet a Legend is to climb to Sapphire, and
 * the only way to meet a Grand Champ is to get to the top. Emerald is where
 * Hall of Fame becomes the *floor* rather than the ceiling; everything above it
 * is a rung nobody can pick off a dropdown.
 */
export const RANKED_ONLY_DIFFICULTIES = ['legend', 'immortal', 'untouchable', 'grandChamp'] as const;

/** Every difficulty the simulation can run, including the ones you cannot choose. */
export const ALL_DIFFICULTIES = [...DIFFICULTIES, ...RANKED_ONLY_DIFFICULTIES] as const;
export type Difficulty = (typeof ALL_DIFFICULTIES)[number];
export type SelectableDifficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  rookie: 'Rookie',
  semiPro: 'Semi-Pro',
  pro: 'Pro',
  allStar: 'All-Star',
  superstar: 'Superstar',
  hallOfFame: 'Hall of Fame',
  legend: 'Legend',
  immortal: 'Immortal',
  untouchable: 'Untouchable',
  grandChamp: 'Grand Champ',
};

export interface RankState {
  points: number;
  tier: RankTier;
  division: number; // 1..4 inside a tier (Legend has none)
  placementGamesLeft: number;
  seasonHigh: number;
}

export interface MyPlayer {
  id: string;
  slot: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  build: BuildSpec;
  body: BodyCustomization;
  loadout: Loadout;
  /** points spent per attribute above the build's floor */
  attributes: Attributes;
  badges: BadgeState[];
  level: number;
  xp: number;
  currency: number;
  stats: CareerStats;
  rank: RankState;
  unlocked: string[];
  /** best rep count per training drill, keyed by drill id */
  drillBests: Record<string, number>;
  /**
   * Unopened crates, keyed by crate id. Bought in the Store and opened in the
   * Locker, so a purchase is never the same moment as a pull — you can sit on
   * ten of them and open them when you feel like it.
   */
  crates: Record<string, number>;
}

export interface Profile {
  version: number;
  userId: string;
  /**
   * The name you are known by on the leaderboard, chosen before your first
   * build. Separate from a build's name because you can have several builds and
   * only one identity — the board ranks the person, not the body.
   */
  username: string;
  /** when the username was last changed, so the cooldown can be enforced */
  usernameChangedAt: number;
  displayName: string;
  region: Region;
  players: MyPlayer[];
  activeSlot: number;
  seasonId: string;
  battlePass: BattlePassState;
  /**
   * The last season's payout, held until the player has seen it.
   *
   * A season can end while the game is closed, so the reset cannot announce
   * itself as it happens — it has to leave a note that the next launch reads.
   */
  seasonReport: SeasonReport | null;
  challenges: ChallengeState[];
  settings: GameSettings;
  lastSyncedAt: number;
  /**
   * Your online record as the server last reported it.
   *
   * Kept on the profile so the Locker can show your rank without being
   * connected, but never counted up locally — the server owns it, and a local
   * tally would drift the first time a result did not arrive.
   */
  online: OnlineRecord;
}

/**
 * Your standing on the ranked ladder.
 *
 * Wins are the only input: five clears a division, three divisions clears a
 * tier. Ranked games are against CPU opponents matched to your rank, and nothing
 * else moves this — practice, drills and the difficulty ladder all have their
 * own rewards.
 */
export interface OnlineRecord {
  /**
   * Ranked points: the ladder itself.
   *
   * Goes up and down by an amount that depends on where you are and how you are
   * playing — see `applyRankedResult`. This is the number the rank is derived
   * from; `wins` and `losses` below are honest match counts and move nothing.
   */
  rp: number;
  /** ranked matches won */
  wins: number;
  /** ranked matches lost */
  losses: number;
  /** every ranked game ever won, which a season reset never takes away */
  lifetimeWins: number;
  /** current win streak — drives both the board and how hard the CPU gets */
  streak: number;
  /** best streak ever reached */
  bestStreak: number;
  /** when the last ranked game finished, 0 if never */
  updatedAt: number;
  /**
   * The highest `rp` reached this season.
   *
   * Season rewards settle against this rather than against where you finish, so
   * one bad night on the last evening cannot take a month of climbing off you.
   */
  peakRp: number;
}

export const REGIONS = ['na-east', 'na-west', 'eu', 'apac', 'sa', 'oce'] as const;
export type Region = (typeof REGIONS)[number];

/** What the last season paid out, shown once and then cleared. */
export interface SeasonReport {
  /** the season that ended */
  seasonId: string;
  seasonName: string;
  /** highest points held during it */
  peakPoints: number;
  tierName: string;
  coins: number;
  /** item and title ids granted */
  items: string[];
  /** how many ranked points the reset took off you */
  resetFrom: number;
}

export interface BattlePassState {
  seasonId: string;
  tier: number;
  tierXp: number;
  premium: boolean;
  claimed: number[];
}

export interface ChallengeState {
  id: string;
  progress: number;
  claimed: boolean;
  expiresAt: number;
}

export interface GameSettings {
  shotMeterStyle: ShotMeterStyle;
  shotMeterOnFreeThrowOnly: boolean;
  cameraShake: boolean;
  fpsCap: 60 | 120 | 0;
  quality: 'low' | 'medium' | 'high';
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  touchControls: boolean;
  reducedMotion: boolean;
  /**
   * Where the online server is.
   *
   * Empty means "wherever this page came from", which is right whenever the
   * game is served by the server itself. The standalone copy has no origin to
   * infer from, so that is the case this exists for.
   */
  serverUrl: string;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  accent: string;
  /** procedural crest descriptor, drawn at runtime — no external art */
  crest: {
    shape: 'shield' | 'circle' | 'diamond' | 'hex' | 'blade';
    glyph: string;
    motif: 'bolt' | 'flame' | 'wave' | 'ring' | 'star' | 'peak' | 'claw' | 'orbit';
  };
  homePark: string;
}

export interface ParkDef {
  id: string;
  name: string;
  tagline: string;
  palette: {
    sky: [string, string];
    floor: string;
    paint: string;
    line: string;
    accent: string;
    ambient: string;
    /** the surround outside the lines; defaults to a darkened floor */
    apron?: string;
    /** caged outdoor court: chain-link perimeter, benches, portable stanchion */
    fence?: boolean;
  };
  timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
  courts: number;
  unlockLevel: number;
}
