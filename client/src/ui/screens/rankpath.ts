import {
  DIVISIONS_PER_TIER,
  ONLINE_TIERS,
  RANK_REWARDS,
  STORE_BY_ID,
  TITLE_BY_ID,
  POINTS_PER_DIVISION,
  onlineRank,
  seasonForTime,
  seasonTimeRemaining,
  type RankRewardTier,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate } from '../../main.ts';
import { el, fmt, panel } from '../dom.ts';
import { drawRankBadge } from '../rankbadge.ts';

/**
 * The rank path: every rung of the ladder and what it pays.
 *
 * Laid out as one column so it reads as a path rather than a price list — you
 * scroll down it and see where you are, what you have banked, and what the next
 * rank is worth. The rewards settle at the end of the season against the highest
 * rank you held, so this screen is a promise rather than a shop, and it says so.
 */
export function renderRankPath(): HTMLElement {
  const record = store.profile.online;
  const peak = Math.max(record.peakRp ?? 0, record.rp);
  const peakRank = onlineRank(peak);
  const peakIndex = ONLINE_TIERS.findIndex((t) => t.id === peakRank.tier.id);
  const season = seasonForTime(Date.now());
  const left = seasonTimeRemaining(Date.now());
  const owned = new Set(store.hasPlayer ? store.player.unlocked : []);

  const banked = RANK_REWARDS.filter((_, i) => i <= peakIndex);
  const bankedCoins = banked.reduce((sum, tier) => sum + tier.coins, 0);

  const root = el('div', { class: 'wrap' });
  root.append(
    el(
      'div',
      { class: 'row', style: 'align-items:center;gap:10px;margin-bottom:2px' },
      el('button', { class: 'btn sm', onclick: () => navigate('rank') }, '← Ranked'),
    ),
    el('h1', { class: 'page' }, 'Rank path'),
    el(
      'p',
      { class: 'page-sub' },
      `Every rank pays out when the season ends, and it pays against the highest rank you held — not where you finish. Reaching a rank banks everything below it too.`,
    ),

    panel(
      'What you have banked',
      el(
        'div',
        { class: 'path-banked' },
        el(
          'div',
          {},
          el('div', { class: 'path-banked-rank', style: `color:${peakRank.tier.color}` }, peakRank.label),
          el(
            'div',
            { class: 'hint', style: 'margin:4px 0 0' },
            peak > record.wins
              ? `Season high: ${peak} RP. You are on ${record.rp} now — the payout still settles at ${peakRank.tier.name}.`
              : `${record.rp} RP this season.`,
          ),
        ),
        el(
          'div',
          { class: 'path-banked-coins' },
          el('b', {}, `${fmt(bankedCoins)}`),
          el('span', {}, 'Coins waiting'),
        ),
      ),
      el(
        'p',
        { class: 'hint', style: 'margin:12px 0 0' },
        `${season.name} ends in ${left.days}d ${left.hours}h. Everything above resets then — the ladder starts again at Bronze 3 and the rewards land in your Locker.`,
      ),
    ),
    el('div', { style: 'height:14px' }),
  );

  RANK_REWARDS.forEach((tier, i) => {
    root.append(tierCard(tier, i, peakIndex, owned), el('div', { style: 'height:10px' }));
  });

  return root;
}

/** Total wins needed to first set foot in a tier. */
function winsToReach(index: number): number {
  return index * DIVISIONS_PER_TIER * POINTS_PER_DIVISION;
}

function tierCard(tier: RankRewardTier, index: number, peakIndex: number, owned: Set<string>): HTMLElement {
  const reached = index <= peakIndex;
  const badge = el('canvas', { class: 'rank-badge', style: 'width:56px;height:62px' }) as HTMLCanvasElement;
  // Drawn at the bottom of the tier, which is the rank that unlocks it.
  requestAnimationFrame(() => drawRankBadge(badge, winsToReach(index), index === ONLINE_TIERS.length - 1 ? 1 : null));

  return el(
    'section',
    { class: `panel clipped path-card ${reached ? 'reached' : ''}`, style: `--tint:${tier.color}` },
    el(
      'div',
      { class: 'path-head' },
      badge,
      el(
        'div',
        { class: 'path-head-text' },
        el('div', { class: 'path-tier', style: `color:${tier.color}` }, tier.tierName),
        el('div', { class: 'path-alias' }, tier.alias),
        el(
          'div',
          { class: 'hint', style: 'margin:2px 0 0' },
          index === 0 ? 'Where every season starts' : `${winsToReach(index)} RP`,
        ),
      ),
      el(
        'div',
        { class: 'path-state' },
        reached
          ? el('span', { class: 'pill hot' }, 'Banked')
          : el('span', { class: 'pill' }, 'Locked'),
        el('span', { class: 'path-coins' }, `${fmt(tier.coins)} Coins`),
      ),
    ),
    el(
      'div',
      { class: 'path-rewards' },
      rewardChip(titleName(tier.titleId), 'Title', tier.color, owned.has(tier.titleId)),
      ...tier.items.map((id) => {
        const item = STORE_BY_ID[id];
        return rewardChip(item?.name ?? id, categoryLabel(id, item?.category), tier.color, owned.has(id));
      }),
    ),
  );
}

function titleName(id: string): string {
  return TITLE_BY_ID[id]?.name ?? id;
}

/** The word above a reward's name, so a Ball Tap reads as an emote. */
function categoryLabel(id: string, category: string | undefined): string {
  switch (category) {
    case 'threeCelebration':
      return '3PT celebration';
    case 'celebration':
      return 'Win celebration';
    case 'dunkPackage':
      return 'Dunk package';
    case 'jumpshot':
      return 'Jump shot';
    case 'nameEffect':
      return 'Name effect';
    case 'hairstyle':
      return 'Hairstyle';
    case 'accessory':
      return 'Accessory';
    case 'clothing':
      return 'Clothing';
    case 'jersey':
      return 'Jersey';
    case 'shoes':
      return 'Shoes';
    case 'court':
      return 'Court';
    case 'emote':
      return 'Emote';
    case 'aura':
      return 'Aura';
    case 'banner':
      return 'Banner';
    case 'title':
      return 'Title';
    default:
      return id.split('-')[0];
  }
}

function rewardChip(name: string, kind: string, color: string, owned: boolean): HTMLElement {
  return el(
    'div',
    { class: `path-reward ${owned ? 'owned' : ''}`, style: `--tint:${color}` },
    el('span', { class: 'path-reward-kind' }, kind),
    el('span', { class: 'path-reward-name' }, name),
    owned ? el('span', { class: 'path-reward-tick' }, '✓') : null,
  );
}
