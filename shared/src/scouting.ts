import type { Attributes, AttributeKey } from './types.ts';

/**
 * Skill groups used on the walkout screen. These are what a scout would say
 * about a player out loud — "he shoots, he can't defend" — rather than a wall
 * of nineteen numbers.
 */
export interface SkillGroup {
  id: string;
  label: string;
  keys: AttributeKey[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  { id: 'threes', label: 'Three-point shooting', keys: ['threePoint'] },
  { id: 'midrange', label: 'Mid-range game', keys: ['midRange', 'freeThrow'] },
  { id: 'finishing', label: 'Finishing at the rim', keys: ['layup', 'closeShot'] },
  { id: 'power', label: 'Dunking', keys: ['dunk', 'vertical'] },
  { id: 'handle', label: 'Ball handling', keys: ['ballHandle'] },
  { id: 'speed', label: 'Speed and burst', keys: ['speed', 'acceleration'] },
  { id: 'strength', label: 'Strength', keys: ['strength'] },
  { id: 'perimeter', label: 'Perimeter defense', keys: ['perimeterDefense', 'steal'] },
  { id: 'interior', label: 'Interior defense', keys: ['interiorDefense', 'block'] },
  { id: 'boards', label: 'Rebounding', keys: ['offensiveRebound', 'defensiveRebound'] },
  { id: 'motor', label: 'Conditioning', keys: ['stamina'] },
];

export interface ScoutLine {
  id: string;
  label: string;
  rating: number;
}

/** Every skill group scored for one player, highest first. */
export function scoutGroups(attrs: Attributes): ScoutLine[] {
  return SKILL_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    rating: Math.round(g.keys.reduce((sum, k) => sum + attrs[k], 0) / g.keys.length),
  })).sort((a, b) => b.rating - a.rating);
}

export interface ScoutReport {
  strengths: ScoutLine[];
  weaknesses: ScoutLine[];
}

/**
 * The three things this player does best and the three worst, measured
 * against their own average so the report says something even for a player
 * whose ratings are all high or all low.
 */
export function scoutReport(attrs: Attributes, count = 3): ScoutReport {
  const lines = scoutGroups(attrs);
  return {
    strengths: lines.slice(0, count),
    weaknesses: lines.slice(-count).reverse(),
  };
}

/** Colour band for a group rating, matched to the rest of the UI. */
export function ratingColor(rating: number): string {
  if (rating >= 90) return '#3ef07a';
  if (rating >= 80) return '#9de84f';
  if (rating >= 70) return '#ffc53d';
  if (rating >= 60) return '#ff7a3d';
  return '#ff5c6a';
}
