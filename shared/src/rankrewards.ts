import { ONLINE_TIERS, onlineRank } from './onlinerank.ts';
import { RANK_TITLES } from './data/rankpack.ts';

/**
 * The ranked path: what each rank pays out when the season ends.
 *
 * Rewards are settled at the end of a season, not the moment you hit the rank,
 * and they are settled against the *highest* rank you held during it. That is
 * deliberate on both counts. Paying on arrival would mean a player who touched
 * Gold and slid back to Silver keeps the Gold reward and the Gold title, which
 * makes the title a lie; paying against your final rank instead would mean one
 * bad night on the last evening of a season costs you a month of work. Peak
 * rank, paid at the end, is the only version of this that is honest and not
 * cruel.
 *
 * Everything below a rank pays out too — reaching Diamond gives you Bronze
 * through Diamond. The path is a path, not a lottery.
 */

export interface RankRewardTier {
  /** the tier id from ONLINE_TIERS */
  tierId: string;
  tierName: string;
  color: string;
  /** the name this rank gives its holders */
  alias: string;
  coins: number;
  titleId: string;
  /** store item ids, in the order the path shows them */
  items: string[];
}

export const RANK_REWARDS: RankRewardTier[] = [
  {
    tierId: 'bronze',
    tierName: 'Bronze',
    color: '#c87d43',
    alias: 'Rising Hooper',
    coins: 10_000,
    titleId: 'title-rank-bronze',
    items: ['emote-balltap-rank', 'three-quickpoint-rank'],
  },
  {
    tierId: 'silver',
    tierName: 'Silver',
    color: '#c6d0dc',
    alias: 'Street Baller',
    coins: 20_000,
    titleId: 'title-rank-silver',
    items: ['emote-aroundtheworld-rank', 'hair-twists-rank', 'cloth-hoodie-g95'],
  },
  {
    tierId: 'gold',
    tierName: 'Gold',
    color: '#ffd23d',
    alias: 'Certified Bucket',
    coins: 30_000,
    titleId: 'title-rank-gold',
    items: ['jumpshot-quick-trigger', 'celeb-walkoff-rank', 'acc-snapback-rank'],
  },
  {
    tierId: 'platinum',
    tierName: 'Platinum',
    color: '#9fe8ff',
    alias: 'Hoop Specialist',
    coins: 40_000,
    titleId: 'title-rank-platinum',
    items: ['shoes-phantom1s-rank', 'cloth-compression-rank-elite', 'emote-spintherock-rank', 'court-blacktop-rank'],
  },
  {
    tierId: 'emerald',
    tierName: 'Emerald',
    color: '#3ef07a',
    alias: 'Elite Hooper',
    coins: 50_000,
    titleId: 'title-rank-emerald',
    items: [
      'dunk-above-the-rim',
      'jumpshot-smooth-release',
      'hair-braids-rank-elite',
      'acc-goggles-rank-shooter',
      'three-toosmall',
    ],
  },
  {
    tierId: 'sapphire',
    tierName: 'Sapphire',
    color: '#5b8cff',
    alias: 'Court Dominator',
    coins: 60_000,
    titleId: 'title-rank-sapphire',
    items: [
      'dunk-poster-machine',
      'jumpshot-lightning-release',
      'shoes-phantomx-rank',
      'emote-breakhisankles-rank',
      'celeb-bowdown-rank',
      'court-neonblacktop-rank',
    ],
  },
  {
    tierId: 'diamond',
    tierName: 'Diamond',
    color: '#8ff2ff',
    alias: 'Superstar',
    coins: 70_000,
    titleId: 'title-rank-diamond',
    items: [
      'dunk-takeover',
      'jumpshot-unblockable',
      'shoes-diamondx1-rank',
      'hair-locs-rank-superstar',
      'acc-goggles-rank-diamond',
      'three-iceinmyveins-rank',
      'celeb-mvpwalk-rank',
      'emote-thesilencer-rank',
    ],
  },
  {
    tierId: 'champion',
    tierName: 'Champion',
    color: '#c77dff',
    alias: 'Champion',
    coins: 80_000,
    titleId: 'title-rank-champion',
    items: [
      'dunk-rim-reaper',
      'jumpshot-deadeye',
      'shoes-champ1s-rank',
      'jersey-champion-rank',
      'hair-braids-rank-crown',
      'acc-armsleeve-rank-champion',
      'three-cold',
      'celeb-raisethetrophy-rank',
      'emote-cantguardme-rank',
      'court-championship-rank',
    ],
  },
  {
    tierId: 'grandchamp',
    tierName: 'Grand Champ',
    color: '#ff5c8a',
    alias: 'King of the Court',
    coins: 90_000,
    titleId: 'title-rank-grandchamp',
    items: [
      'dunk-gravity-breaker',
      'jumpshot-perfect-release',
      'shoes-godstep1s-rank',
      'jersey-grandchampion-rank',
      'hair-locs-rank-royal',
      'acc-crown-rank',
      'three-crownthethree-rank',
      'celeb-kingsthrone-rank',
      'emote-p-059-too-easy',
      'court-kingdom-rank',
      'aura-royal-rank',
      'name-gold-rank',
      'banner-grandchamp-rank',
    ],
  },
];

export const RANK_REWARD_BY_TIER: Record<string, RankRewardTier> = Object.fromEntries(
  RANK_REWARDS.map((r) => [r.tierId, r]),
);

/** Sanity: every tier on the ladder pays something, and nothing pays twice. */
export const RANK_REWARD_TIER_IDS = ONLINE_TIERS.map((t) => t.id);

/** What a win count is worth: every tier at or below the rank it reaches. */
export function rewardsUpTo(wins: number): RankRewardTier[] {
  const reached = ONLINE_TIERS.findIndex((t) => t.id === onlineRank(wins).tier.id);
  if (reached < 0) return [];
  return RANK_REWARDS.filter((r) => ONLINE_TIERS.findIndex((t) => t.id === r.tierId) <= reached);
}

export interface SeasonPayout {
  /** the peak rank the payout was settled against */
  tierId: string;
  tierName: string;
  coins: number;
  /** everything unlocked, including the titles */
  items: string[];
  titles: string[];
}

/**
 * What a season ending pays a player who peaked at `peakWins`.
 *
 * `owned` is passed in so a second season at the same rank pays the coins again
 * but does not re-list cosmetics you already have — the coins are the recurring
 * part, the gear is the once.
 */
export function seasonPayout(peakWins: number, owned: readonly string[] = []): SeasonPayout | null {
  const tiers = rewardsUpTo(peakWins);
  if (tiers.length === 0) return null;
  const have = new Set(owned);
  const top = tiers[tiers.length - 1];

  const items: string[] = [];
  const titles: string[] = [];
  let coins = 0;
  for (const tier of tiers) {
    coins += tier.coins;
    for (const id of tier.items) if (!have.has(id)) items.push(id);
    if (!have.has(tier.titleId)) titles.push(tier.titleId);
  }

  return { tierId: top.tierId, tierName: top.tierName, coins, items, titles };
}

/** Every id the ranked path can ever hand out, for the Locker's "earned" tab. */
export const ALL_RANK_REWARD_IDS: string[] = [
  ...RANK_REWARDS.flatMap((r) => r.items),
  ...RANK_TITLES.map((t) => t.id),
];
