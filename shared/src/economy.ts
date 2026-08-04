import type { PlayerMatchStats } from './sim/state.ts';
import type { Playlist } from './types.ts';

/**
 * Currency ("Court Credits", CC) and XP are earned only through play. There is
 * no purchase path for attributes — the premium battle pass track sells
 * cosmetics and XP boosts, never ratings.
 */
export const CURRENCY_NAME = 'Court Credits';
export const CURRENCY_SHORT = 'CC';

export interface MatchReward {
  currency: number;
  xp: number;
  breakdown: { label: string; currency: number; xp: number }[];
}

export interface RewardContext {
  won: boolean;
  playlist: Playlist | 'event';
  stats: PlayerMatchStats;
  scoreFor: number;
  scoreAgainst: number;
  durationSeconds: number;
  /** 0..1 fraction of shots that landed in the green window */
  greenRate: number;
  /** 1.0 normally, 2.0 during a Double XP event */
  xpMultiplier: number;
  /** premium battle pass owners earn a modest currency bonus */
  premiumPass: boolean;
  /** consecutive wins going into this game */
  winStreak: number;
}

export function computeMatchReward(ctx: RewardContext): MatchReward {
  const breakdown: { label: string; currency: number; xp: number }[] = [];
  const add = (label: string, currency: number, xp: number) => {
    if (currency === 0 && xp === 0) return;
    breakdown.push({ label, currency: Math.round(currency), xp: Math.round(xp) });
  };

  const playlistMult = ctx.playlist === 'ranked' ? 1.3 : ctx.playlist === 'event' ? 1.15 : 1;
  const isPrivate = ctx.playlist === 'private';
  // Private matches award a token amount so friends can play without farming.
  const privateMult = isPrivate ? 0.25 : 1;

  add('Match played', 220 * playlistMult * privateMult, 240 * playlistMult * privateMult);
  if (ctx.won) add('Victory', 380 * playlistMult * privateMult, 420 * playlistMult * privateMult);

  const s = ctx.stats;
  add('Buckets', s.points * 26 * privateMult, s.points * 24 * privateMult);
  add('Greens', s.greens * 34 * privateMult, s.greens * 30 * privateMult);
  add('Defense', (s.steals * 40 + s.blocks * 45 + s.rebounds * 18) * privateMult, (s.steals * 34 + s.blocks * 38 + s.rebounds * 16) * privateMult);
  add('Highlights', (s.ankleBreakers * 55 + s.contactDunks * 70 + s.chaseDownBlocks * 80) * privateMult, (s.ankleBreakers * 45 + s.contactDunks * 60 + s.chaseDownBlocks * 70) * privateMult);
  if (s.turnovers > 0) add('Turnovers', -s.turnovers * 22 * privateMult, 0);

  if (ctx.greenRate >= 0.5 && s.fga >= 6) add('Sharpshooter bonus', 260 * privateMult, 220 * privateMult);
  if (ctx.won && ctx.scoreAgainst <= 2) add('Shutout', 300 * privateMult, 280 * privateMult);

  const streakTier = Math.min(5, ctx.winStreak);
  if (ctx.won && streakTier >= 2) add(`Win streak x${ctx.winStreak}`, streakTier * 90 * privateMult, streakTier * 80 * privateMult);

  if (ctx.premiumPass) add('Season pass bonus', 120 * privateMult, 0);

  let currency = breakdown.reduce((sum, b) => sum + b.currency, 0);
  let xp = breakdown.reduce((sum, b) => sum + b.xp, 0);

  if (ctx.xpMultiplier !== 1) {
    const bonusXp = xp * (ctx.xpMultiplier - 1);
    add(`Double XP event`, 0, bonusXp);
    xp += bonusXp;
  }

  // A sandbagged 30-second quit should not pay like a full game.
  const lengthFactor = Math.min(1, Math.max(0.25, ctx.durationSeconds / 150));
  currency = Math.max(0, Math.round(currency * lengthFactor));
  xp = Math.max(0, Math.round(xp * lengthFactor));

  return { currency, xp, breakdown };
}

// ------------------------------------------------------------------- leveling

export const MAX_LEVEL = 50;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(1400 * Math.pow(level - 1, 1.42));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; needed: number; percent: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, percent: 1 };
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { level, into: xp - floor, needed: ceil - floor, percent: (xp - floor) / (ceil - floor) };
}

// ----------------------------------------------------------------- store data

export type StoreCategory =
  | 'jersey'
  | 'shoes'
  | 'clothing'
  | 'accessory'
  | 'hairstyle'
  | 'tattoo'
  | 'animation'
  | 'celebration'
  | 'emote'
  | 'jumpshot'
  | 'dunkPackage'
  | 'court';

export interface StoreItem {
  id: string;
  name: string;
  category: StoreCategory;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** hex colours used to draw the item procedurally — no external art */
  colors: [string, string];
  /** requirement text, e.g. "Reach Gold III" */
  requirement?: string;
  seasonExclusive?: string;
  description: string;
}

export const RARITY_COLOR: Record<StoreItem['rarity'], string> = {
  common: '#8a93a6',
  rare: '#4aa3ff',
  epic: '#a86bff',
  legendary: '#ffb347',
};
