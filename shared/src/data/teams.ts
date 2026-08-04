import type { Team } from '../types.ts';

/**
 * Entirely original clubs. Names, cities, colourways and crests are invented
 * for Hoops Elite and drawn procedurally at runtime.
 */
export const TEAMS: Team[] = [
  { id: 'harbor-tide', city: 'Harbor Point', name: 'Tide', abbr: 'HPT', primary: '#1a6f8f', secondary: '#0c2a3a', accent: '#5fe3d0', crest: { shape: 'shield', glyph: 'HT', motif: 'wave' }, homePark: 'beach' },
  { id: 'foundry-forge', city: 'Foundry', name: 'Forge', abbr: 'FDY', primary: '#c2452d', secondary: '#241a17', accent: '#ffb347', crest: { shape: 'hex', glyph: 'FF', motif: 'flame' }, homePark: 'training' },
  { id: 'meridian-voltage', city: 'Meridian', name: 'Voltage', abbr: 'MRV', primary: '#f0c419', secondary: '#161a24', accent: '#4ad9ff', crest: { shape: 'blade', glyph: 'MV', motif: 'bolt' }, homePark: 'night' },
  { id: 'crown-heights-royals', city: 'Crown Heights', name: 'Royals', abbr: 'CHR', primary: '#6b3fc4', secondary: '#f2e6c9', accent: '#c9a227', crest: { shape: 'shield', glyph: 'CR', motif: 'star' }, homePark: 'downtown' },
  { id: 'summit-ascend', city: 'Summit', name: 'Ascend', abbr: 'SMT', primary: '#2f8f5b', secondary: '#0f2418', accent: '#c8f7a0', crest: { shape: 'diamond', glyph: 'SA', motif: 'peak' }, homePark: 'rooftop' },
  { id: 'lantern-district-owls', city: 'Lantern District', name: 'Owls', abbr: 'LDO', primary: '#3b4a8f', secondary: '#e8e2d0', accent: '#ffb03b', crest: { shape: 'circle', glyph: 'LO', motif: 'ring' }, homePark: 'night' },
  { id: 'saltflat-mirage', city: 'Saltflat', name: 'Mirage', abbr: 'SFM', primary: '#d9744f', secondary: '#f5e7d3', accent: '#5ec8c0', crest: { shape: 'diamond', glyph: 'SM', motif: 'orbit' }, homePark: 'beach' },
  { id: 'ironvale-wolves', city: 'Ironvale', name: 'Wolves', abbr: 'IVW', primary: '#5b6570', secondary: '#12161b', accent: '#e04f5f', crest: { shape: 'blade', glyph: 'IW', motif: 'claw' }, homePark: 'downtown' },
  { id: 'palm-row-heat', city: 'Palm Row', name: 'Heat Index', abbr: 'PRH', primary: '#ff6b6b', secondary: '#2b1b2f', accent: '#ffd166', crest: { shape: 'circle', glyph: 'PR', motif: 'flame' }, homePark: 'beach' },
  { id: 'north-quay-anchors', city: 'North Quay', name: 'Anchors', abbr: 'NQA', primary: '#0f4c81', secondary: '#dfe8ef', accent: '#f2a65a', crest: { shape: 'shield', glyph: 'NQ', motif: 'wave' }, homePark: 'rooftop' },
  { id: 'terrace-static', city: 'Terrace', name: 'Static', abbr: 'TRS', primary: '#7d3cff', secondary: '#101018', accent: '#00e5b0', crest: { shape: 'hex', glyph: 'TS', motif: 'bolt' }, homePark: 'night' },
  { id: 'granite-park-bears', city: 'Granite Park', name: 'Bears', abbr: 'GPB', primary: '#3f4a3a', secondary: '#d8d2c2', accent: '#e08a3c', crest: { shape: 'shield', glyph: 'GB', motif: 'claw' }, homePark: 'training' },
];

export const TEAM_BY_ID: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
