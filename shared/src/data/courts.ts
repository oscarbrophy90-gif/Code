import type { MatchConfig } from '../sim/state.ts';
import type { Playlist } from '../types.ts';

/**
 * The courts you can walk onto in a park.
 *
 * This lives in shared because it is the thing the client and the server have to
 * agree on exactly. Matchmaking pairs people by park *and* court — two players
 * who both step onto King of the Court at Downtown play each other, and neither
 * of them is pulled into a game at Beach or onto the side court. If the two ends
 * held their own copy of that list they could disagree about what "kotc" means,
 * and the queue key would silently stop matching.
 */
export type CourtMode = 'ranked' | 'casual' | 'kotc' | 'training';

export interface CourtModeDef {
  id: CourtMode;
  name: string;
  blurb: string;
  /** whether this court looks for a real opponent at all */
  online: boolean;
  /** which ladder a result counts towards */
  playlist: Playlist;
  /** what the game is, on this court */
  config: Partial<MatchConfig>;
}

export const COURT_MODES: CourtModeDef[] = [
  {
    id: 'ranked',
    name: 'Main Court',
    blurb: 'The full game, and it counts. First to eleven, win by two.',
    online: true,
    playlist: 'ranked',
    config: { targetScore: 11, winBy: 2, maxScore: 15, shotClock: 14 },
  },
  {
    id: 'casual',
    name: 'Side Court',
    blurb: 'Same game, nothing on the line. Rank does not move.',
    online: true,
    playlist: 'casual',
    config: { targetScore: 11, winBy: 2, maxScore: 15, shotClock: 14 },
  },
  {
    id: 'kotc',
    name: 'King of the Court',
    blurb: 'Short and sharp. First to seven — hold the court or lose it.',
    online: true,
    playlist: 'casual',
    config: { targetScore: 7, winBy: 2, maxScore: 9, shotClock: 12 },
  },
  {
    id: 'training',
    name: 'Training Rim',
    blurb: 'Shoot around on your own. Nobody is coming.',
    online: false,
    playlist: 'casual',
    config: { instantInbound: true },
  },
];

export const COURT_MODE_BY_ID: Record<string, CourtModeDef> = Object.fromEntries(
  COURT_MODES.map((m) => [m.id, m]),
);

/**
 * The matchmaking key for one court in one park.
 *
 * This single string is the whole of "who do I play". Everyone waiting on the
 * same key is waiting for each other; nobody on a different key is a candidate.
 * Deriving it in one place, shared by both ends, is what stops a client queueing
 * for a court the server thinks is something else.
 */
export function courtKey(parkId: string, mode: CourtMode): string {
  return `${parkId}:${mode}`;
}

/** The full match settings for a court, ready to hand to the simulation. */
export function courtConfig(parkId: string, mode: CourtMode): Partial<MatchConfig> {
  const def = COURT_MODE_BY_ID[mode] ?? COURT_MODE_BY_ID.casual;
  return { ...def.config, parkId, playlist: def.playlist };
}
