import {
  CURRENCY_SHORT,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  LIVE_EVENTS,
  formatHeight,
  generateChallenges,
  isEventLive,
  levelProgress,
  seasonForTime,
  seasonTimeRemaining,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate } from '../../main.ts';
import { bar, el, fmt, panel, ratio } from '../dom.ts';
import { portraitEl } from '../portrait.ts';

export function renderHome(): HTMLElement {
  const player = store.player;
  const overall = store.overall();
  const lp = levelProgress(player.xp);
  const now = Date.now();
  const season = seasonForTime(now);
  const remaining = seasonTimeRemaining(now);
  const cleared = DIFFICULTIES.filter((d) => (player.stats.winsByDifficulty[d] ?? 0) > 0).length;
  const best = player.stats.highestDifficultyBeaten;
  const ladderColor = best
    ? { rookie: '#4aa3ff', semiPro: '#3ef07a', pro: '#ffc53d', allStar: '#ff7a3d', superstar: '#a06bff', hallOfFame: '#ff5c8a', grandChamp: '#ff5c8a' }[best]
    : '#3b4252';
  const challenges = generateChallenges(now).filter((c) => c.scope === 'daily');

  return el(
    'div',
    { class: 'wrap' },
    el(
      'div',
      { class: 'split', style: 'margin-bottom:16px' },

      // ------------------------------------------------------------- left
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          '',
          el(
            'div',
            { class: 'pcard' },
            portraitEl(player, 96),
            el(
              'div',
              { class: 'meta' },
              el('div', { class: 'pname' }, player.name),
              el(
                'div',
                { class: 'pline' },
                el('span', {}, player.build.position),
                el('span', {}, formatHeight(player.build.heightIn)),
                el('span', {}, `${player.build.weightLb} lb`),
                el('span', {}, `${formatHeight(player.build.wingspanIn)} wingspan`),
              ),
              el(
                'div',
                { class: 'barrow', style: 'margin-top:10px' },
                el('span', { class: 'lbl' }, `Level ${lp.level}`),
                el('span', { class: 'val' }, lp.needed ? `${fmt(lp.into)}/${fmt(lp.needed)} XP` : 'MAX'),
                bar(lp.percent, 'green'),
              ),
            ),
            el('div', { class: 'ovr' }, el('b', {}, String(overall)), el('span', {}, 'OVR')),
          ),
          el(
            'div',
            { class: 'row', style: 'margin-top:14px' },
            el('button', { class: 'btn sm', onclick: () => navigate('myplayer') }, 'Upgrade'),
            el('button', { class: 'btn sm', onclick: () => navigate('builder') }, 'Builds'),
            el('button', { class: 'btn sm', onclick: () => navigate('store') }, 'Customize'),
          ),
        ),

        el(
          'div',
          { class: 'mode-grid' },
          modeTile('Play now', '1v1 vs CPU', 'Six difficulties from Rookie to Hall of Fame. Adaptive AI that learns how you play.', '#ff7a3d', true, () =>
            navigate('play'),
          ),
          modeTile('Practice', 'Practice Gym', 'Shoot around with nobody guarding you, or run a timed drill for Coins.', '#3ef07a', false, () =>
            navigate('practice'),
          ),
          modeTile('Locker', 'Your Look', 'Equip your title, kit and animations. It all shows on the walkout.', '#ffc53d', false, () =>
            navigate('locker'),
          ),
          modeTile('Records', 'Career Ladder', 'Track every difficulty you have cleared and your personal bests.', '#4aa3ff', false, () =>
            navigate('records'),
          ),
          modeTile('Ranked', 'Climb the ladder', 'Five wins a division. Every opponent is built to your rank.', '#a06bff', false, () => navigate('rank')),
        ),
      ),

      // ------------------------------------------------------------ right
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Season',
          el(
            'div',
            { style: `border-left:3px solid ${season.accent};padding-left:12px` },
            el('div', { style: 'font-size:18px;font-weight:900;line-height:1.15' }, season.name),
            el('div', { class: 'faint', style: 'font-size:12px;margin-top:2px' }, season.theme),
          ),
          el(
            'div',
            { class: 'barrow', style: 'margin-top:14px' },
            el('span', { class: 'lbl' }, `Battle pass tier ${store.profile.battlePass.tier}`),
            el('span', { class: 'val' }, `${remaining.days}d ${remaining.hours}h left`),
            bar(remaining.percent),
          ),
          el(
            'button',
            { class: 'btn sm block', style: 'margin-top:12px', onclick: () => navigate('season') },
            'View battle pass',
          ),
        ),

        panel(
          'Career ladder',
          el(
            'div',
            { class: 'row' },
            el('div', {
              style: `width:42px;height:48px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg, ${ladderColor}, ${ladderColor}88)`,
            }),
            el(
              'div',
              {},
              el(
                'div',
                { style: 'font-size:17px;font-weight:900' },
                player.stats.highestDifficultyBeaten ? DIFFICULTY_LABEL[player.stats.highestDifficultyBeaten] : 'Unranked',
              ),
              el('div', { class: 'faint', style: 'font-size:11px' }, `${cleared} of ${DIFFICULTIES.length} difficulties cleared`),
            ),
          ),
          el(
            'div',
            { class: 'barrow', style: 'margin-top:12px' },
            el('span', { class: 'lbl' }, 'Ladder progress'),
            el('span', { class: 'val' }, `${Math.round((cleared / DIFFICULTIES.length) * 100)}%`),
            bar(cleared / DIFFICULTIES.length),
          ),
        ),

        panel(
          'Live now',
          ...LIVE_EVENTS.filter((e) => isEventLive(e, now)).map((e) =>
            el(
              'button',
              {
                class: 'kv',
                style: 'width:100%;text-align:left',
                onclick: () => navigate('play', { mode: 'events' }),
              },
              el('span', { class: 'k', style: `color:${e.accent};font-weight:800` }, e.name),
              el('span', { class: 'pill live' }, 'Live'),
            ),
          ),
        ),

        panel(
          'Daily challenges',
          ...challenges.map((c) => {
            const state = store.profile.challenges.find((s) => s.id === c.id);
            const progress = Math.min(1, (state?.progress ?? 0) / c.target);
            return el(
              'div',
              { style: 'margin-bottom:10px' },
              el(
                'div',
                { class: 'barrow' },
                el('span', { class: 'lbl' }, c.description),
                el('span', { class: 'val' }, `${state?.progress ?? 0}/${c.target}`),
                bar(progress, progress >= 1 ? 'green' : ''),
              ),
              el('div', { class: 'faint', style: 'font-size:10px;margin-top:2px' }, `${fmt(c.currency)} ${CURRENCY_SHORT} · ${fmt(c.xp)} XP`),
            );
          }),
          el('button', { class: 'btn sm block', style: 'margin-top:6px', onclick: () => navigate('season') }, 'All challenges'),
        ),
      ),
    ),

    panel(
      'Career at a glance',
      el(
        'div',
        { class: 'grid cols-4' },
        quickStat('Win %', ratio(player.stats.wins, Math.max(1, player.stats.gamesPlayed))),
        quickStat('Games', fmt(player.stats.gamesPlayed)),
        quickStat('FG %', ratio(player.stats.fgm, player.stats.fga)),
        quickStat('Green %', ratio(player.stats.greens, player.stats.fga)),
        quickStat('Longest streak', fmt(player.stats.longestWinStreak)),
        quickStat('Ankle breakers', fmt(player.stats.ankleBreakers)),
        quickStat('Posters', fmt(player.stats.contactDunks)),
        quickStat('Chase-downs', fmt(player.stats.chaseDownBlocks)),
      ),
      el('button', { class: 'btn sm', style: 'margin-top:14px', onclick: () => navigate('stats') }, 'Full statistics'),
    ),
  );
}

function modeTile(
  kicker: string,
  name: string,
  desc: string,
  tint: string,
  wide: boolean,
  onclick: () => void,
): HTMLElement {
  return el(
    'button',
    { class: `mode ${wide ? 'wide' : ''}`, style: `--tint:${tint}`, onclick },
    el('span', { class: 'kicker' }, kicker),
    el('span', { class: 'name' }, name),
    el('span', { class: 'desc' }, desc),
  );
}

function quickStat(label: string, value: string): HTMLElement {
  return el(
    'div',
    { style: 'padding:10px 0' },
    el('div', { style: 'font-size:22px;font-weight:900;line-height:1' }, value),
    el('div', { class: 'faint', style: 'font-size:10px;letter-spacing:.13em;font-weight:800;margin-top:3px;text-transform:uppercase' }, label),
  );
}
