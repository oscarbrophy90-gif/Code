/**
 * The player-versus-player ladder.
 *
 * This is a different ladder from the one in `onlinerank.ts`, and deliberately
 * so. That one measures how you do against the CPU on the Ranked playlist; this
 * one measures how you do against other people, and the two have nothing to say
 * about each other. Beating a Hall of Fame bot is not evidence about how you go
 * against somebody who is trying to beat you back, so it does not move this
 * number, and this number does not move that one.
 *
 * Five tiers of three divisions, then Grand Champion. A division is 100 RP, the
 * same shape the CPU ladder uses, so the two feel like the same game even
 * though they count different things.
 *
 * Every function here is pure and total: RP in, rank out, no stored state to
 * drift. That matters because the SERVER owns the RP — the client only ever
 * displays it, and a rank that is computed from a number the server sent can
 * never disagree with the server about what that number means.
 */

/** RP to clear one division. */
export const PVP_POINTS_PER_DIVISION = 100;

/** Divisions per tier, counting down: 3 is the entry division, 1 is the best. */
export const PVP_DIVISIONS_PER_TIER = 3;

export interface PvpTierDef {
  id: string;
  name: string;
  color: string;
  /** the second colour of the badge, for the plate behind the numeral */
  shade: string;
}

/** In order. Grand Champion is last and has no divisions — it is the top. */
export const PVP_TIERS: PvpTierDef[] = [
  { id: 'bronze', name: 'Bronze', color: '#c87d43', shade: '#7a4a26' },
  { id: 'silver', name: 'Silver', color: '#c6d0dc', shade: '#78828f' },
  { id: 'gold', name: 'Gold', color: '#ffd23d', shade: '#a37c00' },
  { id: 'platinum', name: 'Platinum', color: '#9fe8ff', shade: '#3d8ba3' },
  { id: 'diamond', name: 'Diamond', color: '#8ff2ff', shade: '#1f7f96' },
  { id: 'grandchamp', name: 'Grand Champion', color: '#ff5c8a', shade: '#8f1f42' },
];

/** The last tier with divisions; above it is Grand Champion. */
const DIVIDED_TIERS = PVP_TIERS.length - 1;

/** RP needed to reach Grand Champion at all. */
export const PVP_POINTS_TO_GRAND_CHAMP =
  DIVIDED_TIERS * PVP_DIVISIONS_PER_TIER * PVP_POINTS_PER_DIVISION;

export interface PvpRank {
  tier: PvpTierDef;
  /** 3, 2 or 1 within the tier; 0 in Grand Champion, which has no divisions */
  division: number;
  /** true once the divisions are behind you */
  grandChamp: boolean;
  /** RP into the current division */
  progress: number;
  /** RP needed to clear it — 0 in Grand Champion, which never fills */
  needed: number;
  /** total RP left to climb before the next rank */
  toNext: number;
  /** the RP this was derived from */
  rp: number;
  /** "Gold 2", or "Grand Champion" */
  label: string;
}

/**
 * Your rank, from your RP alone.
 *
 * Promotion and demotion are not events this has to be told about: cross 300 RP
 * and you are Silver 3, drop back under it and you are Bronze 1 again. A ladder
 * derived from the number can never disagree with the number, which is what
 * stops a rank and an RP total drifting apart across a disconnect.
 */
export function pvpRank(rp: number): PvpRank {
  const points = Math.max(0, Math.floor(rp));
  if (points >= PVP_POINTS_TO_GRAND_CHAMP) {
    const gc = PVP_TIERS[PVP_TIERS.length - 1];
    return {
      tier: gc,
      division: 0,
      grandChamp: true,
      progress: points - PVP_POINTS_TO_GRAND_CHAMP,
      needed: 0,
      toNext: 0,
      rp: points,
      label: gc.name,
    };
  }
  const step = Math.floor(points / PVP_POINTS_PER_DIVISION);
  const tierIndex = Math.floor(step / PVP_DIVISIONS_PER_TIER);
  const withinTier = step % PVP_DIVISIONS_PER_TIER;
  const tier = PVP_TIERS[tierIndex];
  // Divisions count DOWN inside a tier: you enter at 3 and climb to 1.
  const division = PVP_DIVISIONS_PER_TIER - withinTier;
  const progress = points % PVP_POINTS_PER_DIVISION;
  return {
    tier,
    division,
    grandChamp: false,
    progress,
    needed: PVP_POINTS_PER_DIVISION,
    toNext: PVP_POINTS_PER_DIVISION - progress,
    rp: points,
    label: `${tier.name} ${division}`,
  };
}

/** The RP at which the next rank up begins; null once you are Grand Champion. */
export function pvpNextRankAt(rp: number): number | null {
  const rank = pvpRank(rp);
  if (rank.grandChamp) return null;
  return Math.max(0, Math.floor(rp)) + rank.toNext;
}

/** The name of the rank one rung up; null once you are Grand Champion. */
export function pvpNextRankLabel(rp: number): string | null {
  const at = pvpNextRankAt(rp);
  return at === null ? null : pvpRank(at).label;
}
