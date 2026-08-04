import { DIFFICULTY_LABEL, computeOverall, formatHeight, type MyPlayer } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { el, fmt, panel, ratio } from '../dom.ts';
import { portraitEl } from '../portrait.ts';

export function renderStats(): HTMLElement {
  const player = store.player;
  const s = player.stats;
  const games = Math.max(1, s.gamesPlayed);

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Statistics'),
    el('p', { class: 'page-sub' }, 'Career totals for the active build. Per-game averages sit alongside the raw counts so you can see form, not just volume.'),

    el(
      'div',
      { class: 'grid cols-4 mb' },
      bigStat('Win %', ratio(s.wins, games), `${s.wins}W – ${s.losses}L`),
      bigStat('FG %', ratio(s.fgm, s.fga), `${fmt(s.fgm)} / ${fmt(s.fga)}`),
      bigStat('3PT %', ratio(s.tpm, s.tpa), `${fmt(s.tpm)} / ${fmt(s.tpa)}`),
      bigStat('Green %', ratio(s.greens, s.fga), `${fmt(s.greens)} perfect releases`),
      bigStat('FT %', ratio(s.freeThrowsMade, s.freeThrowsAttempted), `${fmt(s.freeThrowsMade)} / ${fmt(s.freeThrowsAttempted)}`),
    ),

    el(
      'div',
      { class: 'split' },
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Per game averages',
          table([
            ['PPG — points', (s.points / games).toFixed(1), fmt(s.points)],
            ['RPG — rebounds', (s.rebounds / games).toFixed(1), fmt(s.rebounds)],
            ['APG — assists', (s.assists / games).toFixed(1), fmt(s.assists)],
            ['SPG — steals', (s.steals / games).toFixed(1), fmt(s.steals)],
            ['BPG — blocks', (s.blocks / games).toFixed(1), fmt(s.blocks)],
            ['Turnovers', (s.turnovers / games).toFixed(1), fmt(s.turnovers)],
            ['Field goals', (s.fga / games).toFixed(1), fmt(s.fga)],
            ['Free throws', (s.freeThrowsAttempted / games).toFixed(1), fmt(s.freeThrowsAttempted)],
            ['Greens', (s.greens / games).toFixed(1), fmt(s.greens)],
          ]),
        ),
        panel(
          'Highlights',
          table([
            ['Ankle breakers', (s.ankleBreakers / games).toFixed(2), fmt(s.ankleBreakers)],
            ['Contact dunks', (s.contactDunks / games).toFixed(2), fmt(s.contactDunks)],
            ['Chase-down blocks', (s.chaseDownBlocks / games).toFixed(2), fmt(s.chaseDownBlocks)],
          ]),
        ),
      ),
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Career',
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Games played'), el('span', { class: 'v' }, fmt(s.gamesPlayed))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Current win streak'), el('span', { class: 'v' }, fmt(s.currentWinStreak))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Longest win streak'), el('span', { class: 'v' }, fmt(s.longestWinStreak))),
          el(
            'div',
            { class: 'kv' },
            el('span', { class: 'k' }, 'Average teammate grade'),
            el('span', { class: 'v' }, s.teammateGradeCount ? gradeLetter(s.teammateGradeSum / s.teammateGradeCount) : '—'),
          ),
          el(
            'div',
            { class: 'kv' },
            el('span', { class: 'k' }, 'Highest difficulty beaten'),
            el('span', { class: 'v' }, s.highestDifficultyBeaten ? DIFFICULTY_LABEL[s.highestDifficultyBeaten] : '—'),
          ),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Fouls drawn'), el('span', { class: 'v' }, fmt(s.freeThrowsAttempted))),
        ),
        panel('All builds', ...store.profile.players.map(buildRow)),
      ),
    ),
  );
}

function buildRow(p: MyPlayer): HTMLElement {
  const games = Math.max(1, p.stats.gamesPlayed);
  return el(
    'div',
    { class: 'row', style: 'padding:9px 0;border-bottom:1px solid rgba(42,51,70,.5)' },
    portraitEl(p, 40),
    el(
      'div',
      { style: 'min-width:0;flex:1' },
      el('div', { style: 'font-weight:800;font-size:13px' }, p.name),
      el('div', { class: 'faint', style: 'font-size:11px' }, `${p.build.position} · #${p.build.jerseyNumber} · ${formatHeight(p.build.heightIn)} · ${computeOverall(p.attributes, p.build.position)} OVR`),
    ),
    el(
      'div',
      { style: 'text-align:right' },
      el('div', { style: 'font-weight:900;font-size:13px' }, ratio(p.stats.wins, games)),
      el('div', { class: 'faint', style: 'font-size:10px' }, `${p.stats.wins}W ${p.stats.losses}L`),
    ),
  );
}

function bigStat(label: string, value: string, sub: string): HTMLElement {
  return el(
    'div',
    { class: 'panel clipped', style: 'text-align:center;padding:20px 12px' },
    el('div', { class: 'big' }, value),
    el('div', { style: 'font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:var(--text-faint);margin-top:6px' }, label),
    el('div', { class: 'faint', style: 'font-size:11px;margin-top:3px' }, sub),
  );
}

function table(rows: [string, string, string][]): HTMLElement {
  return el(
    'table',
    { class: 'stats' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Stat'), el('th', { class: 'num' }, 'Per game'), el('th', { class: 'num' }, 'Total'))),
    el(
      'tbody',
      {},
      ...rows.map(([name, per, total]) =>
        el('tr', {}, el('td', {}, name), el('td', { class: 'num' }, per), el('td', { class: 'num' }, total)),
      ),
    ),
  );
}

function gradeLetter(score: number): string {
  if (score >= 2.2) return 'A+';
  if (score >= 1.6) return 'A';
  if (score >= 1.1) return 'A-';
  if (score >= 0.7) return 'B+';
  if (score >= 0.3) return 'B';
  if (score >= 0) return 'B-';
  if (score >= -0.4) return 'C+';
  if (score >= -0.9) return 'C';
  if (score >= -1.5) return 'C-';
  return 'D';
}
