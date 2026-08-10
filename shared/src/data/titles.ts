import type { StoreItem } from '../economy.ts';
import type { CareerStats, Difficulty } from '../types.ts';
import { PACK_TITLES } from './titlepack.ts';
import { RANK_TITLES } from './rankpack.ts';

/**
 * Titles are the line under your name on the walkout screen. Some are bought,
 * some are earned by doing something specific — the earned ones are the point,
 * because a title nobody can buy says something true about the player.
 */
export interface TitleDef {
  id: string;
  name: string;
  description: string;
  /** 0 = not purchasable; earned only */
  price: number;
  rarity: StoreItem['rarity'];
  color: string;
  /** how it is unlocked, when it is not for sale */
  earn?: string;
  /** evaluated against career stats to auto-award */
  unlockedBy?: (stats: CareerStats) => boolean;
}

export const TITLES: TitleDef[] = [
  // ------------------------------------------------------------ starters
  { id: 'title-none', name: 'No Title', description: 'Just your name.', price: 0, rarity: 'common', color: '#8a93a6' },
  { id: 'title-rookie', name: 'Rookie', description: 'Everyone starts here.', price: 0, rarity: 'common', color: '#8a93a6' },

  // -------------------------------------------------------------- earned
  {
    id: 'title-first-blood', name: 'First Win', description: 'Won your first game.', price: 0, rarity: 'common', color: '#4aa3ff',
    earn: 'Win a game', unlockedBy: (s) => s.wins >= 1,
  },
  {
    id: 'title-sharpshooter', name: 'Sharpshooter', description: 'Landed 100 green releases.', price: 0, rarity: 'rare', color: '#3ef07a',
    earn: 'Land 100 greens', unlockedBy: (s) => s.greens >= 100,
  },
  {
    id: 'title-ankle-collector', name: 'Ankle Collector', description: 'Broke down 25 defenders.', price: 0, rarity: 'rare', color: '#ff5c8a',
    earn: 'Get 25 ankle breakers', unlockedBy: (s) => s.ankleBreakers >= 25,
  },
  {
    id: 'title-rim-wrecker', name: 'Rim Wrecker', description: 'Finished 15 contact dunks.', price: 0, rarity: 'rare', color: '#ff7a3d',
    earn: 'Finish 15 contact dunks', unlockedBy: (s) => s.contactDunks >= 15,
  },
  {
    id: 'title-not-today', name: 'Not Today', description: 'Landed 25 blocks.', price: 0, rarity: 'rare', color: '#4aa3ff',
    earn: 'Record 25 blocks', unlockedBy: (s) => s.blocks >= 25,
  },
  {
    id: 'title-streaker', name: 'On a Run', description: 'Won five in a row.', price: 0, rarity: 'rare', color: '#ffc53d',
    earn: 'Win 5 games in a row', unlockedBy: (s) => s.longestWinStreak >= 5,
  },
  {
    id: 'title-unbeaten', name: 'Untouchable', description: 'Won ten in a row.', price: 0, rarity: 'epic', color: '#a06bff',
    earn: 'Win 10 games in a row', unlockedBy: (s) => s.longestWinStreak >= 10,
  },
  {
    id: 'title-century', name: 'Centurion', description: 'Played 100 games.', price: 0, rarity: 'epic', color: '#a06bff',
    earn: 'Play 100 games', unlockedBy: (s) => s.gamesPlayed >= 100,
  },
  {
    id: 'title-pro-slayer', name: 'Pro Slayer', description: 'Beat the Pro CPU.', price: 0, rarity: 'rare', color: '#ffc53d',
    earn: 'Beat Pro', unlockedBy: (s) => beat(s, 'pro'),
  },
  {
    id: 'title-all-star', name: 'All-Star Killer', description: 'Beat the All-Star CPU.', price: 0, rarity: 'epic', color: '#ff7a3d',
    earn: 'Beat All-Star', unlockedBy: (s) => beat(s, 'allStar'),
  },
  {
    id: 'title-superstar', name: 'Superstar Slayer', description: 'Beat the Superstar CPU.', price: 0, rarity: 'epic', color: '#a06bff',
    earn: 'Beat Superstar', unlockedBy: (s) => beat(s, 'superstar'),
  },
  {
    id: 'title-hof', name: 'Hall of Famer', description: 'Beat the Hall of Fame CPU.', price: 0, rarity: 'legendary', color: '#ff5c8a',
    earn: 'Beat Hall of Fame', unlockedBy: (s) => beat(s, 'hallOfFame'),
  },
  {
    id: 'title-ladder', name: 'Ladder Complete', description: 'Beat every difficulty in the game.', price: 0, rarity: 'legendary', color: '#ffd23d',
    earn: 'Beat all six difficulties',
    unlockedBy: (s) => (['rookie', 'semiPro', 'pro', 'allStar', 'superstar', 'hallOfFame'] as Difficulty[]).every((d) => beat(s, d)),
  },

  // -------------------------------------- challenge-only, never for sale
  {
    id: 'title-grinder', name: 'The Grinder', description: 'Earned on the challenge board, not at the till.', price: 0, rarity: 'epic', color: '#3dd6ff',
    earn: 'Claim a seasonal challenge',
  },
  {
    id: 'title-collector', name: 'Collector', description: 'Chases every reward on the board.', price: 0, rarity: 'epic', color: '#9de84f',
    earn: 'Claim a seasonal challenge',
  },

  // ------------------------------------------------------------ purchased
  { id: 'title-bucket', name: 'Bucket', description: 'For people who get buckets.', price: 4000, rarity: 'common', color: '#4aa3ff' },
  { id: 'title-cold', name: 'Cold Blooded', description: 'Never rushed, never rattled.', price: 6500, rarity: 'rare', color: '#3dd6ff' },
  { id: 'title-problem', name: 'The Problem', description: 'Somebody else can guard him.', price: 8000, rarity: 'rare', color: '#ff7a3d' },
  { id: 'title-him', name: 'Him', description: 'No explanation offered.', price: 12000, rarity: 'epic', color: '#a06bff' },
  { id: 'title-nightmare', name: 'Matchup Nightmare', description: 'Too big, too fast, or both.', price: 14000, rarity: 'epic', color: '#ff5c8a' },
  { id: 'title-franchise', name: 'The Franchise', description: 'The whole thing runs through you.', price: 20000, rarity: 'legendary', color: '#ffd23d' },
];

function beat(stats: CareerStats, d: Difficulty): boolean {
  return (stats.winsByDifficulty?.[d] ?? 0) > 0;
}

/**
 * Every title in the game, from all three sources.
 *
 * The lookup is built off this rather than off `TITLES` alone, because a title
 * that the walkout cannot resolve is a title that renders as nothing under your
 * name — and the pack and the ranked rewards are most of them.
 */
export const ALL_TITLES: TitleDef[] = [...TITLES, ...PACK_TITLES, ...RANK_TITLES];

export const TITLE_BY_ID: Record<string, TitleDef> = Object.fromEntries(ALL_TITLES.map((t) => [t.id, t]));

export const DEFAULT_TITLES = ['title-none', 'title-rookie'];

/** Titles whose conditions the player now meets but has not been granted yet. */
export function newlyEarnedTitles(stats: CareerStats, owned: string[]): TitleDef[] {
  return TITLES.filter((t) => t.unlockedBy && !owned.includes(t.id) && t.unlockedBy(stats));
}

/** The auto win-streak badge shown alongside the title. Null when not on one. */
export function streakBadge(stats: CareerStats): string | null {
  const n = stats.currentWinStreak;
  if (n < 2) return null;
  if (n >= 15) return `${n}-GAME TEAR`;
  if (n >= 10) return `${n}-GAME RUN`;
  if (n >= 5) return `${n} STRAIGHT`;
  return `W${n}`;
}
