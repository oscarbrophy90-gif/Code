import {
  BADGE_BY_ID,
  ALL_DIFFICULTIES,
  rankChange,
  DIFFICULTY_LABEL,
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
  newlyEarnedTitles,
  drillReward,
  MEDAL_COLOR,
  PARK_BY_ID,
  hashString,
  type CourtSurface,
  type DrillDef,
  type BadgeState,
  type ChallengeMetric,
  type Difficulty,
  type MatchConfig,
  type Playlist,
  type SimPlayerConfig,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import { audio } from '../engine/audio.ts';
import { dismissFullscreen, navigate, refresh, showFullscreen } from '../main.ts';
import { createMatchScreen, type MatchResult } from './match.ts';
import { playRankChange } from './rankchange.ts';
import { playCourtRoll } from './courtroll.ts';
import { settleRanked } from './rankedmatch.ts';
import { bar, el, fmt, overlay, ratio, toast } from './dom.ts';
import { playWalkout } from './walkout.ts';
import { AvatarRenderer, livePreview } from './avatar.ts';

export interface StartMatchOptions {
  opponent: SimPlayerConfig;
  opponentRankPoints?: number;
  difficulty: Difficulty;
  parkId: string;
  playlist: Playlist | 'event';
  config?: Partial<MatchConfig>;
  localSide?: 0 | 1;
  seed?: number;
  eventName?: string;
  /** practice gym runs pay nothing and do not touch the career ladder */
  practice?: boolean;
  /** a ranked match: the only thing that moves your rank */
  ranked?: boolean;
  /** timed training drill instead of a game */
  drill?: DrillDef | null;
  /** online match: which end of the wire this client is */
  net?: 'host' | 'guest' | null;
  /** the court drawn for this game, filled in by the draw */
  surface?: CourtSurface | null;
  /**
   * Extra sharpening on top of the difficulty preset, 0 to 1.
   *
   * Ranked uses it to make Gold 1 harder than Gold 3 without jumping the CPU a
   * whole difficulty level.
   */
  aiEdge?: number;
}

/** True while a walkout is on screen, so a second one can never stack on it. */
let walkoutUp = false;

export function startMatch(opts: StartMatchOptions): void {
  audio.unlock();
  // Every game opens with the walkout. Practice and drills are not games, so
  // they go straight to the floor.
  if (opts.practice || opts.drill) {
    launchMatch(opts);
    return;
  }
  // Belt and braces on top of the cutscene swallowing its own keys: whatever
  // manages to fire a second start while the walkout is playing gets ignored,
  // so skipping a scene can never leave you looking at another one.
  if (walkoutUp) return;
  walkoutUp = true;
  void playWalkout({
    player: store.simConfig(),
    opponent: opts.opponent,
    difficulty: opts.difficulty,
    venue: PARK_BY_ID[opts.parkId]?.name ?? 'Hoops Elite',
    subtitle: opts.eventName ?? labelFor(opts.playlist),
    hideDifficulty: Boolean(opts.ranked),
    identity: {
      username: store.profile.username,
      wins: store.profile.online.wins,
      losses: store.profile.online.losses,
      placement: store.position(),
    },
    nameEffectId: store.player.loadout.nameEffectId,
    bannerId: store.player.loadout.bannerId,
  }).then(async () => {
    walkoutUp = false;
    // The court draw. Seeded from the match, so an online pair sees the same
    // reel land on the same floor.
    const surface = await playCourtRoll(document.body, opts.seed ?? hashString(`court-${Date.now()}`));
    launchMatch({ ...opts, surface });
  });
}

function launchMatch(opts: StartMatchOptions): void {
  const node = createMatchScreen({
    opponent: opts.opponent,
    difficulty: opts.difficulty,
    parkId: opts.parkId,
    config: { ...opts.config, playlist: opts.playlist === 'event' ? 'casual' : opts.playlist },
    localSide: opts.localSide,
    seed: opts.seed,
    drill: opts.drill,
    aiEdge: opts.aiEdge,
    surface: opts.surface ?? null,
    onFinish: (result) => {
      dismissFullscreen();
      const rankBefore = opts.ranked ? store.profile.online.wins : null;
      if (opts.drill) {
        showDrillResults(result, opts.drill);
        refresh();
        return;
      }
      const summary = applyResult(result, opts);
      // The screen behind the match was drawn before it was played, and
      // everything the game just changed lives on it — coins, XP, your ranked
      // record. Redrawing it here is what makes a win actually show up; without
      // it you come back to the same rank and the same numbers you left.
      refresh();

      // Ranked settles here: the points move, the rank change plays if the rank
      // actually changed, and then the box score. A forfeit counts as a loss —
      // quitting a game you are losing should not be free.
      if (opts.ranked) {
        void settleRanked(result.won, result.score[0] - result.score[1]).then(() => {
          showResults(result, summary, opts);
        });
        return;
      }
      // The rank change plays first and only when the rank actually moved. A
      // screen you see after every game is a screen you skip after the second
      // one, so it is kept for the moment that earned it.
      if (summary.rankMove && summary.rankMove !== 'none' && rankBefore !== null) {
        void playRankChange(document.body, rankBefore, store.profile.online.wins, store.accountId).then(() => {
          showResults(result, summary, opts);
        });
        return;
      }
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
  passTierBefore: number;
  passTierAfter: number;
  challengesCompleted: string[];
  titlesEarned: { id: string; name: string; color: string }[];
  /** whether a ranked result moved you between divisions */
  rankMove?: 'promoted' | 'demoted' | 'none';
}

/**
 * Applies everything a finished game changes: currency, XP, badge tiers,
 * career stats, ranked points, battle pass progress and challenge counters.
 */
function applyResult(result: MatchResult, opts: StartMatchOptions): RewardSummary {
  const player = store.player;
  const levelBefore = levelForXp(player.xp);
  const passBefore = Math.floor(store.profile.battlePass.tierXp / XP_PER_TIER) + 1;

  const reward = computeMatchReward({
    won: result.won,
    playlist: opts.practice ? 'private' : opts.playlist,
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

  // The rank moves here and nowhere else. A forfeit still counts as a loss —
  // quitting a ranked game you are losing should not be free.
  let rankMove: 'promoted' | 'demoted' | 'none' | undefined;
  // The ranked ladder moves in `settleRanked`, which owns the points maths and
  // the animation. Recording it here as well would double every result.

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

    // Difficulty ladder. Practice runs are excluded so the record means
    // something, and so are ranked games: the career ladder is the six levels
    // you choose from Play, and a ranked opponent is chosen for you.
    if (!opts.practice && !opts.ranked) {
      const d = opts.difficulty;
      s.gamesByDifficulty[d] = (s.gamesByDifficulty[d] ?? 0) + 1;
      if (result.won) {
        s.winsByDifficulty[d] = (s.winsByDifficulty[d] ?? 0) + 1;
        const current = s.highestDifficultyBeaten;
        const rankOf = (x: Difficulty) => ALL_DIFFICULTIES.indexOf(x);
        if (!current || rankOf(d) > rankOf(current)) {
          s.highestDifficultyBeaten = d;
        }
      }
    }

    s.freeThrowsMade += result.stats.ftm;
    s.freeThrowsAttempted += result.stats.fta;
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

  // Titles are checked against the stats we just wrote, so a game that pushes
  // you over the line hands you the title in the same results screen.
  const earned = newlyEarnedTitles(store.player.stats, store.player.unlocked);
  if (earned.length > 0) {
    store.update((profile) => {
      const p = profile.players[profile.activeSlot];
      for (const t of earned) if (!p.unlocked.includes(t.id)) p.unlocked.push(t.id);
    });
  }

  const levelAfter = levelForXp(store.player.xp);
  if (levelAfter > levelBefore) audio.play('levelUp');

  return {
    currency: reward.currency,
    xp: reward.xp,
    breakdown: reward.breakdown,
    levelBefore,
    levelAfter,
    badgeUps,
    passTierBefore: passBefore,
    passTierAfter: store.profile.battlePass.tier,
    challengesCompleted,
    titlesEarned: earned.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    rankMove,
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

/** The winner performing whatever celebration they had equipped, on a loop. */
function winCelebration(): HTMLElement {
  const canvas = el('canvas', { class: 'preview-figure wide', style: 'max-width:300px;margin:14px auto 0' }) as HTMLCanvasElement;
  const cfg = store.simConfig();
  const avatar = new AvatarRenderer();
  const cycle = 2.4;
  livePreview(canvas, (elapsed) => {
    avatar.draw(canvas, cfg, {
      emoteId: store.player.loadout.celebrationId,
      t: Math.min(1, ((elapsed % cycle) / cycle) * 1.5),
      zoom: 0.92,
    });
  });
  return canvas;
}

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
        // Win and your equipped celebration plays here too, not just on the
        // floor — the floor version is over before the results come up.
        won && !result.quit ? winCelebration() : null,
      ),

      el(
        'div',
        { class: 'grid cols-4', style: 'margin-bottom:18px' },
        statTile('PTS', m.points),
        statTile('FG', `${m.fgm}/${m.fga}`),
        statTile('GREEN', `${m.greens}`),
        statTile('GREEN%', ratio(m.greens, m.fga)),
        statTile('FT', `${m.ftm}/${m.fta}`),
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

      !opts.practice &&
        el(
          'div',
          { class: 'panel', style: 'margin-bottom:16px' },
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'dim' }, 'Difficulty'),
            el('span', { class: 'spacer' }),
            el('b', {}, DIFFICULTY_LABEL[opts.difficulty]),
          ),
          won && store.player.stats.highestDifficultyBeaten === opts.difficulty
            ? el(
                'div',
                { style: 'color:var(--green);font-weight:800;font-size:12px;margin-top:6px' },
                `New career best — ${DIFFICULTY_LABEL[opts.difficulty]} cleared`,
              )
            : el(
                'div',
                { class: 'faint', style: 'font-size:11px;margin-top:4px' },
                `Record on this level: ${store.player.stats.winsByDifficulty[opts.difficulty] ?? 0}W of ${store.player.stats.gamesByDifficulty[opts.difficulty] ?? 0}`,
              ),
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

      summary.titlesEarned.length > 0 &&
        el(
          'div',
          { style: 'margin-bottom:16px' },
          el('h3', { class: 'panel-title' }, summary.titlesEarned.length > 1 ? 'Titles unlocked' : 'Title unlocked'),
          el(
            'div',
            { class: 'row' },
            summary.titlesEarned.map((t) => el('span', { class: 'title-tag', style: `--tint:${t.color}` }, t.name)),
          ),
          el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, 'Equip it in the Locker to wear it on your walkout.'),
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

// -------------------------------------------------------------- drill results

/** Drills pay per rep, log a personal best, and never touch your win/loss. */
function showDrillResults(result: MatchResult, drill: DrillDef): void {
  // A shoot-around has no scoreboard and no payout — it just ends.
  if (drill.freeplay) {
    navigate('practice');
    toast('Gym session over', 'info');
    return;
  }

  const reps = result.drillReps;
  const reward = drillReward(drill, reps);
  const previousBest = store.player.drillBests[drill.id] ?? 0;
  const newBest = reps > previousBest;

  store.update((profile) => {
    const p = profile.players[profile.activeSlot];
    p.currency += reward.currency;
    p.xp += reward.xp;
    if (reps > (p.drillBests[drill.id] ?? 0)) p.drillBests[drill.id] = reps;
  });
  if (reward.medal !== 'none') audio.play('levelUp');

  const medalLabel = reward.medal === 'none' ? 'No medal yet' : `${reward.medal[0].toUpperCase()}${reward.medal.slice(1)} medal`;

  overlay((close) =>
    el(
      'div',
      {},
      el(
        'div',
        { style: 'text-align:center;margin-bottom:20px' },
        el(
          'div',
          { style: `font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:${drill.color}` },
          'Drill complete',
        ),
        el('div', { style: 'font-size:52px;font-weight:900;line-height:1.05' }, String(reps)),
        el('div', { class: 'faint', style: 'font-size:12px' }, `${drill.name} · ${drill.goal.toLowerCase()}`),
        el(
          'div',
          { style: `margin-top:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:${MEDAL_COLOR[reward.medal]}` },
          medalLabel,
        ),
        newBest && reps > 0
          ? el('div', { style: 'color:var(--green);font-weight:800;font-size:12px;margin-top:4px' }, `New personal best — previous ${previousBest}`)
          : el('div', { class: 'faint', style: 'font-size:11px;margin-top:4px' }, `Personal best ${Math.max(previousBest, reps)}`),
      ),

      el(
        'div',
        { class: 'grid cols-3', style: 'margin-bottom:18px' },
        statTile('BRONZE', drill.tiers[0]),
        statTile('SILVER', drill.tiers[1]),
        statTile('GOLD', drill.tiers[2]),
      ),

      el(
        'div',
        { class: 'kv', style: 'border-top:1px solid var(--line);padding-top:9px' },
        el('span', { class: 'k', style: 'font-weight:800' }, 'Earned'),
        el(
          'span',
          { class: 'v' },
          el('span', { style: 'color:var(--amber)' }, `+${fmt(reward.currency)} ${CURRENCY_SHORT}  `),
          el('span', { style: 'color:var(--green)' }, `+${fmt(reward.xp)} XP`),
        ),
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
              navigate('practice');
            },
          },
          'Back to the gym',
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
      ),
    ),
  );
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
