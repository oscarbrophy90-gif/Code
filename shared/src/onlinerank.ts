/**
 * The online ladder.
 *
 * One number decides everything: your ranked points. Ranked matches move it and
 * nothing else does — practice, drills and the difficulty ladder have their own
 * rewards. A rank you can farm off the Play menu is not a rank.
 *
 * Eight tiers of three divisions, five wins each, and then Grand Champ. Grand
 * Champ is deliberately not another division: once you are there the ladder
 * stops measuring how many wins you have and starts measuring how many you have
 * *compared to everyone else*, so being Grand Champ #1 means one person in the
 * world is above nobody, and #500 means five hundred people are ahead of you.
 * That only works as a live comparison against the whole population, which is
 * why placement is read off the leaderboard rather than stored on your save.
 *
 * The whole ladder is wiped at the end of every season. A rank you keep forever
 * is a record of how long you have owned the game; a rank you have to win back
 * is a record of how you are playing now.
 */

/**
 * Ranked points to clear one division.
 *
 * The ladder is points, not wins. A win used to be worth exactly one rung, so
 * five wins was a division however good the opposition was — which made
 * climbing a matter of how many games you played rather than how well. Points
 * let a win at Bronze be worth more than a win at Champion, and let a loss cost
 * more the higher you are.
 */
export const POINTS_PER_DIVISION = 100;

/** Divisions per tier, counting down: 3 is the entry division, 1 is the best. */
export const DIVISIONS_PER_TIER = 3;

export interface OnlineTierDef {
  id: string;
  name: string;
  color: string;
  /** the second colour of the badge, for the plate behind the numeral */
  shade: string;
}

/**
 * The tiers in order. Grand Champ is last and has no divisions — it is the top,
 * and inside it you are placed against the world.
 */
export const ONLINE_TIERS: OnlineTierDef[] = [
  { id: 'bronze', name: 'Bronze', color: '#c87d43', shade: '#7a4a26' },
  { id: 'silver', name: 'Silver', color: '#c6d0dc', shade: '#78828f' },
  { id: 'gold', name: 'Gold', color: '#ffd23d', shade: '#a37c00' },
  { id: 'platinum', name: 'Platinum', color: '#9fe8ff', shade: '#3d8ba3' },
  { id: 'emerald', name: 'Emerald', color: '#3ef07a', shade: '#146b38' },
  { id: 'sapphire', name: 'Sapphire', color: '#5b8cff', shade: '#1f3f9e' },
  { id: 'diamond', name: 'Diamond', color: '#8ff2ff', shade: '#1f7f96' },
  { id: 'champion', name: 'Champion', color: '#c77dff', shade: '#5f2c8f' },
  { id: 'grandchamp', name: 'Grand Champ', color: '#ff5c8a', shade: '#8f1f42' },
];

/** The last tier with divisions; everything above it is Grand Champ. */
const RANKED_TIERS = ONLINE_TIERS.length - 1;

/** Points needed to reach Grand Champ at all. */
export const POINTS_TO_GRAND_CHAMP = RANKED_TIERS * DIVISIONS_PER_TIER * POINTS_PER_DIVISION;

export interface OnlineRank {
  tier: OnlineTierDef;
  /** 3, 2 or 1 within the tier; 0 in Grand Champ, which has no divisions */
  division: number;
  /** true once the divisions are behind you */
  grandChamp: boolean;
  /** points into the current division */
  progress: number;
  /** points needed to clear it — 0 in Grand Champ, which never fills */
  needed: number;
  /** the ranked points this was derived from */
  points: number;
  /** "Gold 2", or "Grand Champ" */
  label: string;
}

/**
 * Your rank, from your online wins alone.
 *
 * Pure and total: the same win count always gives the same rank, on the client
 * and on the server, with no stored state to drift. A rank that is computed
 * cannot disagree with the record it is supposed to describe.
 */
export function onlineRank(points: number): OnlineRank {
  const safe = Math.max(0, Math.floor(points));

  if (safe >= POINTS_TO_GRAND_CHAMP) {
    const tier = ONLINE_TIERS[ONLINE_TIERS.length - 1];
    return {
      tier,
      division: 0,
      grandChamp: true,
      progress: safe - POINTS_TO_GRAND_CHAMP,
      needed: 0,
      points: safe,
      label: tier.name,
    };
  }

  const cleared = Math.floor(safe / POINTS_PER_DIVISION);
  const tierIndex = Math.floor(cleared / DIVISIONS_PER_TIER);
  const withinTier = cleared % DIVISIONS_PER_TIER;
  const tier = ONLINE_TIERS[tierIndex];
  // Divisions count down: your first five wins put you in Bronze 3, and Bronze 1
  // is the last one before Silver.
  const division = DIVISIONS_PER_TIER - withinTier;

  return {
    tier,
    division,
    grandChamp: false,
    progress: safe % POINTS_PER_DIVISION,
    needed: POINTS_PER_DIVISION,
    points: safe,
    label: `${tier.name} ${division}`,
  };
}

/** Total points needed to reach a given tier and division, for "next rank" copy. */
export function pointsForRank(tierIndex: number, division: number): number {
  if (tierIndex >= RANKED_TIERS) return POINTS_TO_GRAND_CHAMP;
  const withinTier = DIVISIONS_PER_TIER - division;
  return (tierIndex * DIVISIONS_PER_TIER + withinTier) * POINTS_PER_DIVISION;
}

/** The rank one division above this one, or null at the top. */
export function nextRank(points: number): OnlineRank | null {
  const here = onlineRank(points);
  if (here.grandChamp) return null;
  return onlineRank((Math.floor(points / POINTS_PER_DIVISION) + 1) * POINTS_PER_DIVISION);
}

/**
 * How a Grand Champ is described: by where they sit in the world.
 *
 * `placement` is 1-based and comes from the server, which is the only place that
 * can see everyone. Below Grand Champ it is meaningless and stays null.
 */
export function grandChampLabel(placement: number | null): string {
  if (placement === null || placement < 1) return 'Grand Champ';
  return `Grand Champ #${placement}`;
}

/** The full display name, including world placement when it applies. */
export function onlineRankLabel(points: number, placement: number | null = null): string {
  const rank = onlineRank(points);
  return rank.grandChamp ? grandChampLabel(placement) : rank.label;
}
