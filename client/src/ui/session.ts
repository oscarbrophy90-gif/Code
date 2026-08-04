import {
  BADGE_BY_ID,
  CURRENCY_SHORT,
  TIER_COLOR,
  TIER_INDEX,
  TIER_LABEL,
  XP_PER_TIER,
  activeXpMultiplier,
  computeMatchReward,
  generateChallenges,
  levelForXp,
  levelProgress,
  rankLabel,
  updateRank,
  type BadgeState,
  type ChallengeMetric,
  type Difficulty,
  type MatchConfig,
  type Playlist,
  type SimPlayerConfig,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import { audio } from '../engine/audio.ts';
import { dismissFullscreen, navigate, showFullscreen } from '../main.ts';
import { createMatchScreen, type MatchResult, type NetAdapter } from './match.ts';
import { bar, el, fmt, overlay, ratio, toast } from './dom.ts';

export interface StartMatchOptions {
  opponent: SimPlayerConfig;
  opponentRankPoints?: number;
  difficulty: Difficulty;
  parkId: string;
  playlist: Playlist | 'event';
  config?: Partial<MatchConfig>;
  net?: NetAdapter | null;
  localSide?: 0 | 1;
  seed?: number;
  eventName?: string;
}

export function startMatch(opts: StartMatchOptions): void {
  audio.unlock();
  const node = createMatchScreen({
    opponent: opts.opponent,
    difficulty: opts.difficulty,
    parkId: opts.parkId,
    config: { ...opts.config, playlist: opts.playlist === 'event' ? 'casual' : opts.playlist },
    net: opts.net,
    localSide: opts.localSide,
    seed: opts.seed,
    onFinish: (result) => {
      dismissFullscreen();
      const summary = applyResult(result, opts);
      showResults(result, summary, opts);
    },
  });
  showFullscreen(node);
}

export interface RewardSummary {
  currency: number;
  xp: number;
  breakdown: { label: string; currency: number; xp: number }[];
  levelBefore: number;
  levelAfter: number;
  badgeUps: { id: string; to: string }[];
  rankDelta: number;
  rankBefore: number;
  rankAfter: number;
  passTierBefore: number;
  passTierAfter: number;
  challengesCompleted: string[];
}

/**
 * Applies everything a finished game changes: currency, XP, badge tiers,
 * career stats, ranked points, battle pass progress and challenge counters.
 */
function applyResult(result: MatchResult, opts: StartMatchOptions): RewardSummary {
  const player = store.player;
  const levelBefore = levelForXp(player.xp);
  const rankBefore = player.rank.points;
  const passBefore = Math.floor(store.profile.battlePass.tierXp / XP_PER_TIER) + 1;

  const reward = computeMatchReward({
    won: result.won,
    playlist: opts.playlist,
    stats: result.stats,
    scoreFor: result.score[0],
    scoreAgainst: result.score[1],
    durationSeconds: result.durationSeconds,
    greenRate: result.greenRate,
    xpMultiplier: activeXpMultiplier(Date.now()),
    premiumPass: store.profile.battlePass.premium,
    winStreak: player.stats.currentWinStreak,
  });

  const badgeUps = mergeBadges(player.badges, result.simBadges);
  const challengesCompleted: string[] = [];

  store.update((profile) => {
    const p = profile.players[profile.activeSlot];
    p.currency += reward.currency;
    p.xp += reward.xp;

    const s = p.stats;
    const m = result.stats;
    s.gamesPlayed++;
    if (result.won) {
      s.wins++;
      s.currentWinStreak++;
      s.longestWinStreak = Math.max(s.longestWinStreak, s.currentWinStreak);
    } else {
      s.losses++;
      s.currentWinStreak = 0;
    }
    s.points += m.points;
    s.fgm += m.fgm;
    s.fga += m.fga;
    s.tpm += m.tpm;
    s.tpa += m.tpa;
    s.rebounds += m.rebounds;
    s.steals += m.steals;
    s.blocks += m.blocks;
    s.turnovers += m.turnovers;
    s.greens += m.greens;
    s.shotAttemptsTimed += m.fga;
    s.ankleBreakers += m.ankleBreakers;
    s.contactDunks += m.contactDunks;
    s.chaseDownBlocks += m.chaseDownBlocks;

    // Teammate grade: a 1v1 grade derived from efficiency and impact.
    const grade = Math.max(-3, Math.min(3, m.gradePoints * 0.5 + (result.won ? 0.8 : -0.4)));
    s.teammateGradeSum += grade;
    s.teammateGradeCount++;

    // Ranked ladder.
    if (opts.playlist === 'ranked') {
      updateRank(p.rank, opts.opponentRankPoints ?? p.rank.points, result.won, result.score[0], result.score[1]);
      s.highestRankPoints = Math.max(s.highestRankPoints, p.rank.points);
    }

    // Battle pass.
    profile.battlePass.tierXp += reward.xp;
    profile.battlePass.tier = Math.min(40, Math.floor(profile.battlePass.tierXp / XP_PER_TIER) + 1);

    // Challenges.
    const defs = generateChallenges(Date.now());
    const metrics: Record<ChallengeMetric, number> = {
      wins: result.won ? 1 : 0,
      games: 1,
      points: m.points,
      greens: m.greens,
      threes: m.tpm,
      steals: m.steals,
      blocks: m.blocks,
      rebounds: m.rebounds,
      ankleBreakers: m.ankleBreakers,
      contactDunks: m.contactDunks,
      chaseDownBlocks: m.chaseDownBlocks,
      assists: 0,
    };
    for (const def of defs) {
      const state = profile.challenges.find((c) => c.id === def.id);
      if (!state || state.claimed) continue;
      const before = state.progress;
      state.progress = Math.min(def.target, state.progress + (metrics[def.metric] ?? 0));
      if (before < def.target && state.progress >= def.target) challengesCompleted.push(def.name);
    }
  });

  const levelAfter = levelForXp(store.player.xp);
  if (levelAfter > levelBefore) audio.play('levelUp');

  return {
    currency: reward.currency,
    xp: reward.xp,
    breakdown: reward.breakdown,
    levelBefore,
    levelAfter,
    badgeUps,
    rankDelta: store.player.rank.points - rankBefore,
    rankBefore,
    rankAfter: store.player.rank.points,
    passTierBefore: passBefore,
    passTierAfter: store.profile.battlePass.tier,
    challengesCompleted,
  };
}

/** Folds badge progress earned inside the sim back into the saved profile. */
function mergeBadges(saved: BadgeState[], simBadges: BadgeState[]): { id: string; to: string }[] {
  const ups: { id: string; to: string }[] = [];
  for (const sim of simBadges) {
    const target = saved.find((b) => b.id === sim.id);
    if (!target) continue;
    if (TIER_INDEX[sim.tier] > TIER_INDEX[target.tier]) {
      ups.push({ id: sim.id, to: sim.tier });
    }
    target.tier = sim.tier;
    target.progress = sim.progress;
  }
  return ups;
}

// ------------------------------------------------------------------- results

function showResults(result: MatchResult, summary: RewardSummary, opts: StartMatchOptions): void {
  const m = result.stats;
  const won = result.won;
  const lp = levelProgress(store.player.xp);

  overlay((close) =>
    el(
      'div',
      {},
      el(
        'div',
        { style: 'text-align:center;margin-bottom:20px' },
        el(
          'div',
          {
            style: `font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:${won ? 'var(--green)' : 'var(--red)'}`,
          },
          result.quit ? 'Forfeited' : won ? 'Victory' : 'Defeat',
        ),
        el('div', { style: 'font-size:52px;font-weight:900;letter-spacing:-.02em;line-height:1.05' }, `${result.score[0]} – ${result.score[1]}`),
        el('div', { class: 'faint', style: 'font-size:12px' }, `${opts.eventName ?? labelFor(opts.playlist)} · ${Math.round(result.durationSeconds)}s`),
      ),

      el(
        'div',
        { class: 'grid cols-4', style: 'margin-bottom:18px' },
        statTile('PTS', m.points),
        statTile('FG', `${m.fgm}/${m.fga}`),
        statTile('GREEN', `${m.greens}`),
        statTile('GREEN%', ratio(m.greens, m.fga)),
        statTile('REB', m.rebounds),
        statTile('STL', m.steals),
        statTile('BLK', m.blocks),
        statTile('TO', m.turnovers),
      ),

      (m.ankleBreakers > 0 || m.contactDunks > 0 || m.chaseDownBlocks > 0) &&
        el(
          'div',
          { class: 'row', style: 'margin-bottom:16px' },
          m.ankleBreakers > 0 && el('span', { class: 'pill hot' }, `${m.ankleBreakers} ankle breaker${m.ankleBreakers > 1 ? 's' : ''}`),
          m.contactDunks > 0 && el('span', { class: 'pill hot' }, `${m.contactDunks} poster${m.contactDunks > 1 ? 's' : ''}`),
          m.chaseDownBlocks > 0 && el('span', { class: 'pill hot' }, `${m.chaseDownBlocks} chase-down`),
        ),

      el('h3', { class: 'panel-title' }, 'Rewards'),
      el(
        'div',
        { style: 'display:grid;gap:5px;margin-bottom:16px' },
        summary.breakdown.map((b) =>
          el(
            'div',
            { class: 'kv', style: 'padding:3px 0;font-size:12px' },
            el('span', { class: 'k' }, b.label),
            el(
              'span',
              { class: 'v' },
              b.currency !== 0 ? el('span', { style: 'color:var(--amber)' }, `${b.currency > 0 ? '+' : ''}${fmt(b.currency)} ${CURRENCY_SHORT}  `) : null,
              b.xp !== 0 ? el('span', { style: 'color:var(--green)' }, `+${fmt(b.xp)} XP`) : null,
            ),
          ),
        ),
        el(
          'div',
          { class: 'kv', style: 'border-top:1px solid var(--line);margin-top:6px;padding-top:9px' },
          el('span', { class: 'k', style: 'font-weight:800' }, 'Total'),
          el(
            'span',
            { class: 'v' },
            el('span', { style: 'color:var(--amber)' }, `+${fmt(summary.currency)} ${CURRENCY_SHORT}  `),
            el('span', { style: 'color:var(--green)' }, `+${fmt(summary.xp)} XP`),
          ),
        ),
      ),

      el(
        'div',
        { style: 'margin-bottom:16px' },
        el(
          'div',
          { class: 'barrow' },
          el('span', { class: 'lbl' }, `Level ${lp.level}`),
          el('span', { class: 'val' }, lp.needed ? `${fmt(lp.into)} / ${fmt(lp.needed)}` : 'MAX'),
          bar(lp.percent, 'green'),
        ),
        summary.levelAfter > summary.levelBefore &&
          el('div', { style: 'color:var(--green);font-weight:800;font-size:12px;margin-top:6px' }, `Level up! ${summary.levelBefore} → ${summary.levelAfter}`),
      ),

      opts.playlist === 'ranked' &&
        el(
          'div',
          { class: 'panel', style: 'margin-bottom:16px' },
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'dim' }, 'Ranked'),
            el('span', { class: 'spacer' }),
            el(
              'b',
              { style: `color:${summary.rankDelta >= 0 ? 'var(--green)' : 'var(--red)'}` },
              `${summary.rankDelta >= 0 ? '+' : ''}${summary.rankDelta} RP`,
            ),
          ),
          el('div', { style: 'font-size:19px;font-weight:900;margin-top:4px' }, rankLabel(summary.rankAfter)),
          store.player.rank.placementGamesLeft > 0 &&
            el('div', { class: 'faint', style: 'font-size:11px' }, `${store.player.rank.placementGamesLeft} placement games left`),
        ),

      summary.badgeUps.length > 0 &&
        el(
          'div',
          { style: 'margin-bottom:16px' },
          el('h3', { class: 'panel-title' }, 'Badges leveled up'),
          el(
            'div',
            { class: 'row' },
            summary.badgeUps.map((b) =>
              el(
                'span',
                {
                  class: 'pill',
                  style: `background:${TIER_COLOR[b.to as keyof typeof TIER_COLOR]}22;color:${TIER_COLOR[b.to as keyof typeof TIER_COLOR]}`,
                },
                `${BADGE_BY_ID[b.id]?.name ?? b.id} · ${TIER_LABEL[b.to as keyof typeof TIER_LABEL]}`,
              ),
            ),
          ),
        ),

      summary.challengesCompleted.length > 0 &&
        el(
          'div',
          { style: 'margin-bottom:16px' },
          el('h3', { class: 'panel-title' }, 'Challenges complete'),
          el('div', { class: 'row' }, summary.challengesCompleted.map((c) => el('span', { class: 'pill live' }, c))),
        ),

      el(
        'div',
        { class: 'row', style: 'margin-top:20px' },
        el(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              close();
              navigate('play');
            },
          },
          'Run it back',
        ),
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              close();
              navigate('myplayer');
            },
          },
          'Upgrade player',
        ),
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              close();
              navigate('home');
            },
          },
          'Home',
        ),
      ),
    ),
  );

  if (summary.challengesCompleted.length > 0) {
    toast(`${summary.challengesCompleted.length} challenge${summary.challengesCompleted.length > 1 ? 's' : ''} ready to claim`, 'good');
  }
}

function statTile(label: string, value: string | number): HTMLElement {
  return el(
    'div',
    { class: 'panel', style: 'padding:11px;text-align:center' },
    el('div', { style: 'font-size:21px;font-weight:900;line-height:1' }, String(value)),
    el('div', { class: 'faint', style: 'font-size:9px;letter-spacing:.14em;font-weight:800;margin-top:3px' }, label),
  );
}

function labelFor(playlist: Playlist | 'event'): string {
  return playlist === 'ranked' ? 'Ranked 1v1' : playlist === 'private' ? 'Private Match' : playlist === 'event' ? 'Event' : 'Casual 1v1';
}
