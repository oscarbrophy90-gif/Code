/**
 * The online ladder.
 *
 * One number decides everything: how many games you have won against a real
 * person in a park. Not the CPU, not practice, not drills — those have their own
 * rewards and none of them move this. A rank you can farm off a bot is not a
 * rank.
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

/** Wins to clear one division. */
export const WINS_PER_DIVISION = 5;

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

/** Wins needed to reach Grand Champ at all. */
export const WINS_TO_GRAND_CHAMP = RANKED_TIERS * DIVISIONS_PER_TIER * WINS_PER_DIVISION;

export interface OnlineRank {
  tier: OnlineTierDef;
  /** 3, 2 or 1 within the tier; 0 in Grand Champ, which has no divisions */
  division: number;
  /** true once the divisions are behind you */
  grandChamp: boolean;
  /** wins into the current division */
  progress: number;
  /** wins needed to clear it — 0 in Grand Champ, which never fills */
  needed: number;
  /** total online wins this was derived from */
  wins: number;
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
export function onlineRank(wins: number): OnlineRank {
  const safe = Math.max(0, Math.floor(wins));

  if (safe >= WINS_TO_GRAND_CHAMP) {
    const tier = ONLINE_TIERS[ONLINE_TIERS.length - 1];
    return {
      tier,
      division: 0,
      grandChamp: true,
      progress: safe - WINS_TO_GRAND_CHAMP,
      needed: 0,
      wins: safe,
      label: tier.name,
    };
  }

  const cleared = Math.floor(safe / WINS_PER_DIVISION);
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
    progress: safe % WINS_PER_DIVISION,
    needed: WINS_PER_DIVISION,
    wins: safe,
    label: `${tier.name} ${division}`,
  };
}

/** Total wins needed to reach a given tier and division, for "next rank" copy. */
export function winsForRank(tierIndex: number, division: number): number {
  if (tierIndex >= RANKED_TIERS) return WINS_TO_GRAND_CHAMP;
  const withinTier = DIVISIONS_PER_TIER - division;
  return (tierIndex * DIVISIONS_PER_TIER + withinTier) * WINS_PER_DIVISION;
}

/** The rank one division above this one, or null at the top. */
export function nextRank(wins: number): OnlineRank | null {
  const here = onlineRank(wins);
  if (here.grandChamp) return null;
  return onlineRank((Math.floor(wins / WINS_PER_DIVISION) + 1) * WINS_PER_DIVISION);
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
export function onlineRankLabel(wins: number, placement: number | null = null): string {
  const rank = onlineRank(wins);
  return rank.grandChamp ? grandChampLabel(placement) : rank.label;
}
