import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  DRILLS,
  MEDAL_COLOR,
  TITLES,
  TITLE_BY_ID,
  computeOverall,
  drillMedal,
  formatHeight,
  type Difficulty,
  type MyPlayer,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate } from '../../main.ts';
import { bar, el, fmt, panel, ratio } from '../dom.ts';
import { portraitEl } from '../portrait.ts';
import { blurbColor, DIFFICULTY_BLURB } from './play.ts';

/**
 * Single-player career board. The difficulty ladder is the progression spine:
 * clearing a level is the mark that carries, not a rating that drifts.
 */
export function renderRecords(): HTMLElement {
  const player = store.player;
  const s = player.stats;
  const games = Math.max(1, s.gamesPlayed);
  const cleared = DIFFICULTIES.filter((d) => (s.winsByDifficulty[d] ?? 0) > 0).length;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Records'),
    el(
      'p',
      { class: 'page-sub' },
      'Your career against the CPU. Beat every difficulty to complete the ladder — the highest level you have cleared is your career mark.',
    ),

    el(
      'div',
      { class: 'grid cols-4 mb' },
      bigStat(
        'Highest beaten',
        s.highestDifficultyBeaten ? DIFFICULTY_LABEL[s.highestDifficultyBeaten] : '—',
        `${cleared} of ${DIFFICULTIES.length} cleared`,
        s.highestDifficultyBeaten ? blurbColor(s.highestDifficultyBeaten) : undefined,
      ),
      bigStat('Win %', ratio(s.wins, games), `${s.wins}W – ${s.losses}L`),
      bigStat('Longest streak', String(s.longestWinStreak), `current ${s.currentWinStreak}`),
      bigStat('Overall', String(computeOverall(player.attributes, player.build.position)), `level ${player.level}`),
    ),

    el(
      'div',
      { class: 'split' },
      panel(
        'Difficulty ladder',
        el(
          'div',
          { style: 'display:grid;gap:10px' },
          ...DIFFICULTIES.map((d) => {
            const wins = s.winsByDifficulty[d] ?? 0;
            const played = s.gamesByDifficulty[d] ?? 0;
            const info = DIFFICULTY_BLURB[d];
            const beaten = wins > 0;
            return el(
              'div',
              { style: `border-left:3px solid ${beaten ? info.color : 'var(--panel-3)'};padding-left:12px` },
              el(
                'div',
                { class: 'row' },
                el(
                  'b',
                  { style: `font-size:14px;color:${beaten ? info.color : 'var(--text-faint)'}` },
                  DIFFICULTY_LABEL[d],
                ),
                beaten ? el('span', { style: 'color:var(--green);font-weight:900' }, '✓') : null,
                el('span', { class: 'spacer' }),
                el('span', { class: 'faint', style: 'font-size:11.5px' }, played === 0 ? 'Not played' : `${wins}W of ${played}`),
              ),
              el('div', { class: 'faint', style: 'font-size:11px;margin:2px 0 5px' }, info.tag),
              bar(played === 0 ? 0 : wins / played, beaten ? 'green' : ''),
            );
          }),
        ),
        el(
          'button',
          { class: 'btn sm block', style: 'margin-top:14px', onclick: () => navigate('play') },
          cleared >= DIFFICULTIES.length ? 'Ladder complete — play again' : 'Take on the next level',
        ),
      ),

      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Personal bests',
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Games played'), el('span', { class: 'v' }, fmt(s.gamesPlayed))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Longest win streak'), el('span', { class: 'v' }, fmt(s.longestWinStreak))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Best FG%'), el('span', { class: 'v' }, ratio(s.fgm, s.fga))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Best 3PT%'), el('span', { class: 'v' }, ratio(s.tpm, s.tpa))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Green release rate'), el('span', { class: 'v' }, ratio(s.greens, s.fga))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Ankle breakers'), el('span', { class: 'v' }, fmt(s.ankleBreakers))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Contact dunks'), el('span', { class: 'v' }, fmt(s.contactDunks))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Chase-down blocks'), el('span', { class: 'v' }, fmt(s.chaseDownBlocks))),
        ),
        renderDrillBoard(),
        renderTitleCase(),
        panel('All builds', ...store.profile.players.map(buildRow)),
      ),
    ),
  );
}

// ------------------------------------------------------------- drill records

/** Best rep count on each training drill, with the medal it earned. */
function renderDrillBoard(): HTMLElement {
  const bests = store.player.drillBests;
  const golds = DRILLS.filter((d) => drillMedal(d, bests[d.id] ?? 0) === 'gold').length;

  return panel(
    `Training drills (${golds}/${DRILLS.length} gold)`,
    ...DRILLS.map((d) => {
      const best = bests[d.id] ?? 0;
      const medal = drillMedal(d, best);
      return el(
        'div',
        { class: 'kv' },
        el(
          'span',
          { class: 'k' },
          el('b', { style: `color:${d.color}` }, d.name),
          el('div', { class: 'faint', style: 'font-size:11px' }, `Gold at ${d.tiers[2]} reps`),
        ),
        el(
          'span',
          { class: 'v', style: `color:${best > 0 ? MEDAL_COLOR[medal] : 'var(--text-faint)'}` },
          best > 0 ? `${best}${medal === 'none' ? '' : ` · ${medal}`}` : '—',
        ),
      );
    }),
    el(
      'button',
      { class: 'btn sm block', style: 'margin-top:12px', onclick: () => navigate('practice') },
      'Go to the practice gym',
    ),
  );
}

// -------------------------------------------------------------- title case

/** Which titles you have collected, and what the rest take. */
function renderTitleCase(): HTMLElement {
  const owned = store.player.unlocked;
  const equipped = TITLE_BY_ID[store.player.loadout.titleId];
  const have = TITLES.filter((t) => owned.includes(t.id));
  const earnable = TITLES.filter((t) => !owned.includes(t.id) && t.earn);

  return panel(
    `Titles (${have.length}/${TITLES.length})`,
    equipped && equipped.id !== 'title-none'
      ? el(
          'div',
          { style: 'margin-bottom:10px' },
          el('span', { class: 'title-tag', style: `--tint:${equipped.color}` }, equipped.name),
          el('span', { class: 'faint', style: 'font-size:11px;margin-left:8px' }, 'equipped'),
        )
      : el('div', { class: 'faint', style: 'font-size:11.5px;margin-bottom:10px' }, 'No title equipped.'),
    el(
      'div',
      { class: 'row', style: 'gap:5px;margin-bottom:12px' },
      ...have.map((t) => el('span', { class: 'title-tag', style: `--tint:${t.color};opacity:.85` }, t.name)),
    ),
    earnable.length > 0
      ? el(
          'div',
          {},
          el(
            'div',
            { style: 'font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--text-faint);margin-bottom:6px' },
            'Still out there',
          ),
          ...earnable.slice(0, 6).map((t) =>
            el(
              'div',
              { class: 'kv', style: 'padding:4px 0' },
              el('span', { class: 'k', style: `color:${t.color}` }, t.name),
              el('span', { class: 'v faint', style: 'font-size:11px' }, t.earn ?? ''),
            ),
          ),
          earnable.length > 6
            ? el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, `and ${earnable.length - 6} more`)
            : null,
        )
      : el('div', { style: 'font-size:12px;color:var(--green);font-weight:800' }, 'Every earnable title collected.'),
    el(
      'button',
      { class: 'btn sm block', style: 'margin-top:12px', onclick: () => navigate('locker') },
      'Change your title',
    ),
  );
}

function buildRow(p: MyPlayer): HTMLElement {
  const games = Math.max(1, p.stats.gamesPlayed);
  const best = p.stats.highestDifficultyBeaten;
  return el(
    'div',
    { class: 'row', style: 'padding:9px 0;border-bottom:1px solid rgba(42,51,70,.5)' },
    portraitEl(p, 40),
    el(
      'div',
      { style: 'min-width:0;flex:1' },
      el('div', { style: 'font-weight:800;font-size:13px' }, p.name),
      el(
        'div',
        { class: 'faint', style: 'font-size:11px' },
        `${p.build.position} · ${formatHeight(p.build.heightIn)} · #${p.build.jerseyNumber} · ${computeOverall(p.attributes, p.build.position)} OVR`,
      ),
    ),
    el(
      'div',
      { style: 'text-align:right' },
      el('div', { style: 'font-weight:900;font-size:13px' }, ratio(p.stats.wins, games)),
      el(
        'div',
        { class: 'faint', style: 'font-size:10px' },
        best ? DIFFICULTY_LABEL[best] : 'Unranked',
      ),
    ),
  );
}

function bigStat(label: string, value: string, sub: string, color?: string): HTMLElement {
  return el(
    'div',
    { class: 'panel clipped', style: 'text-align:center;padding:20px 12px' },
    el('div', { class: 'big', style: color ? `color:${color}` : '' }, value),
    el(
      'div',
      { style: 'font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--text-faint);margin-top:6px' },
      label,
    ),
    el('div', { class: 'faint', style: 'font-size:11px;margin-top:3px' }, sub),
  );
}

export type { Difficulty };
