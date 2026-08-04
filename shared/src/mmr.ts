import { RANK_TIERS, type RankState, type RankTier } from './types.ts';

export interface TierDef {
  tier: RankTier;
  label: string;
  min: number;
  max: number;
  divisions: number;
  color: string;
  glow: string;
}

/**
 * Rank points run 0..5000. Tiers are wide at the bottom so new players climb
 * quickly, and narrow at the top where games are decided by execution.
 */
export const TIERS: TierDef[] = [
  { tier: 'bronze', label: 'Bronze', min: 0, max: 700, divisions: 4, color: '#b3763c', glow: '#e0a066' },
  { tier: 'silver', label: 'Silver', min: 700, max: 1400, divisions: 4, color: '#9fb0c0', glow: '#dbe6f0' },
  { tier: 'gold', label: 'Gold', min: 1400, max: 2150, divisions: 4, color: '#e0b141', glow: '#ffe08a' },
  { tier: 'platinum', label: 'Platinum', min: 2150, max: 2900, divisions: 4, color: '#4fd6c4', glow: '#a5fff2' },
  { tier: 'diamond', label: 'Diamond', min: 2900, max: 3650, divisions: 4, color: '#5aa9ff', glow: '#b9dcff' },
  { tier: 'elite', label: 'Elite', min: 3650, max: 4400, divisions: 4, color: '#a06bff', glow: '#d9bcff' },
  { tier: 'legend', label: 'Legend', min: 4400, max: 5000, divisions: 1, color: '#ff5c8a', glow: '#ffc0d4' },
];

export const TIER_BY_NAME: Record<RankTier, TierDef> = Object.fromEntries(
  TIERS.map((t) => [t.tier, t]),
) as Record<RankTier, TierDef>;

export const PLACEMENT_GAMES = 5;

export function tierForPoints(points: number): TierDef {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (points >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

export function divisionForPoints(points: number): number {
  const t = tierForPoints(points);
  if (t.divisions <= 1) return 1;
  const span = (t.max - t.min) / t.divisions;
  const idx = Math.floor((points - t.min) / span);
  // Division 1 is the top of a tier, matching how competitive ladders read.
  return Math.max(1, Math.min(t.divisions, t.divisions - idx));
}

export function rankLabel(points: number): string {
  const t = tierForPoints(points);
  if (t.divisions <= 1) return t.label;
  return `${t.label} ${romanize(divisionForPoints(points))}`;
}

function romanize(n: number): string {
  return ['I', 'II', 'III', 'IV', 'V'][n - 1] ?? String(n);
}

export function progressWithinTier(points: number): number {
  const t = tierForPoints(points);
  return Math.max(0, Math.min(1, (points - t.min) / (t.max - t.min)));
}

export function freshRank(): RankState {
  return { points: 0, tier: 'bronze', division: 4, placementGamesLeft: PLACEMENT_GAMES, seasonHigh: 0 };
}

export interface RankUpdate {
  before: number;
  after: number;
  delta: number;
  tierChanged: boolean;
  promoted: boolean;
}

/**
 * Elo-style update with a margin-of-victory bonus and placement acceleration.
 * K falls as players climb so top-tier ladders stay stable.
 */
export function updateRank(
  rank: RankState,
  opponentPoints: number,
  won: boolean,
  scoreFor: number,
  scoreAgainst: number,
): RankUpdate {
  const before = rank.points;
  const expected = 1 / (1 + Math.pow(10, (opponentPoints - before) / 700));

  let k = 90;
  if (before > 2900) k = 62;
  if (before > 3650) k = 48;
  if (before > 4400) k = 34;
  if (rank.placementGamesLeft > 0) k *= 2.2;

  const margin = Math.abs(scoreFor - scoreAgainst);
  const marginMult = 1 + Math.min(0.35, (margin - 2) * 0.05);

  const raw = k * ((won ? 1 : 0) - expected) * (won ? marginMult : 2 - marginMult);
  const delta = Math.round(raw);

  const after = Math.max(0, Math.min(5000, before + delta));
  const beforeTier = tierForPoints(before).tier;
  const afterTier = tierForPoints(after).tier;

  rank.points = after;
  rank.tier = afterTier;
  rank.division = divisionForPoints(after);
  rank.seasonHigh = Math.max(rank.seasonHigh, after);
  if (rank.placementGamesLeft > 0) rank.placementGamesLeft--;

  return {
    before,
    after,
    delta: after - before,
    tierChanged: beforeTier !== afterTier,
    promoted: RANK_TIERS.indexOf(afterTier) > RANK_TIERS.indexOf(beforeTier),
  };
}

/**
 * Matchmaking search band. Starts tight for a fair game and widens with wait
 * time so queues stay short at the extremes of the ladder.
 */
export function searchBand(points: number, waitSeconds: number): { min: number; max: number } {
  const base = 140;
  const growth = waitSeconds * 55;
  const width = Math.min(1400, base + growth);
  return { min: Math.max(0, points - width), max: Math.min(5000, points + width) };
}

export function isAcceptableMatch(a: number, b: number, waitA: number, waitB: number): boolean {
  const bandA = searchBand(a, waitA);
  const bandB = searchBand(b, waitB);
  return b >= bandA.min && b <= bandA.max && a >= bandB.min && a <= bandB.max;
}
