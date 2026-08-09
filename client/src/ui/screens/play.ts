import {
  DIFFICULTIES,
  type SelectableDifficulty,
  DIFFICULTY_LABEL,
  DIFFICULTY_PRESETS,
  LIVE_EVENTS,
  PARKS,
  activeXpMultiplier,
  formatHeight,
  generateOpponent,
  hashString,
  isEventLive,
  type Difficulty,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, fmt, panel } from '../dom.ts';
import { startMatch } from '../session.ts';

/** How each level actually plays, in the player's language rather than stats. */
interface DifficultyBlurb {
  tag: string;
  traits: string[];
  color: string;
}

/**
 * Only the six you can pick. Grand Champ is deliberately absent: it is not
 * selectable, so there is nothing to describe on a screen you choose from.
 */
export const DIFFICULTY_BLURB: Record<SelectableDifficulty, DifficultyBlurb> = {
  rookie: {
    tag: 'Learning the game',
    traits: ['Misses open shots often', 'Poor defensive decisions', 'Slow reactions', 'Easy to beat'],
    color: '#4aa3ff',
  },
  semiPro: {
    tag: 'Getting the hang of it',
    traits: ['Slightly smarter defense', 'Better shot selection', 'Occasional dribble moves', 'Still forgiving'],
    color: '#3ef07a',
  },
  pro: {
    tag: 'A fair fight',
    traits: ['Balanced experience', 'Good defense', 'Uses simple combos', 'Punishes bad mistakes'],
    color: '#ffc53d',
  },
  allStar: {
    tag: 'You need a plan',
    traits: ['Strong defensive pressure', 'Better shot timing', 'Advanced dribble moves', 'Reads your tendencies'],
    color: '#ff7a3d',
  },
  superstar: {
    tag: 'Every possession counts',
    traits: ['High basketball IQ', 'Excellent shot selection', 'Aggressive defense', 'Uses signature moves'],
    color: '#a06bff',
  },
  hallOfFame: {
    tag: 'Bring everything',
    traits: ['Elite reaction speed', 'Excellent defense', 'Advanced dribble combos', 'Rarely makes a bad decision'],
    color: '#ff5c8a',
  },
};

let difficulty: SelectableDifficulty = 'pro';
let parkId = 'downtown';

export function renderPlay(_params: RouteParams): HTMLElement {
  const player = store.player;
  const now = Date.now();
  const stats = player.stats;

  const root = el('div', { class: 'wrap' });

  root.append(
    el('h1', { class: 'page' }, 'Play'),
    el(
      'p',
      { class: 'page-sub' },
      'Half court, one on one, make it take it. Twos from behind the arc and ones inside, first to eleven, win by two. Pick your opponent and go.',
    ),
  );

  const rerender = () => navigate('play');

  // Which build is walking out. Every mode runs the equipped one, so it belongs
  // in front of you before you pick an opponent, not buried two screens away.
  root.append(
    el(
      'div',
      { class: 'equipped-bar mb' },
      el('span', { class: 'eq-label' }, 'Playing as'),
      el('b', { class: 'eq-name' }, player.name),
      el(
        'span',
        { class: 'eq-line' },
        `${player.build.position} · ${formatHeight(player.build.heightIn)} · ${store.overall()} OVR`,
      ),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm', onclick: () => navigate('myplayer', { tab: 'builds' }) }, 'Change build'),
    ),
  );

  root.append(
    el(
      'div',
      { class: 'split' },

      // --------------------------------------------------------- left column
      el(
        'div',
        { style: 'display:grid;gap:14px' },

        panel(
          'Choose your opponent',
          el(
            'div',
            { class: 'diff-grid' },
            ...DIFFICULTIES.map((d: SelectableDifficulty) => {
              const info = DIFFICULTY_BLURB[d];
              const beaten = (stats.winsByDifficulty[d] ?? 0) > 0;
              const played = stats.gamesByDifficulty[d] ?? 0;
              return el(
                'button',
                {
                  class: `diff ${difficulty === d ? 'on' : ''}`,
                  style: `--tint:${info.color}`,
                  onclick: () => {
                    difficulty = d;
                    rerender();
                  },
                },
                el(
                  'div',
                  { class: 'diff-head' },
                  el('span', { class: 'diff-name' }, DIFFICULTY_LABEL[d]),
                  beaten ? el('span', { class: 'diff-check', title: 'Beaten' }, '✓') : null,
                ),
                el('div', { class: 'diff-tag' }, info.tag),
                el(
                  'div',
                  { class: 'diff-pips' },
                  ...Array.from({ length: 6 }, (_, i) =>
                    el('i', { class: i <= DIFFICULTIES.indexOf(d) ? 'on' : '' }),
                  ),
                ),
                played > 0
                  ? el('div', { class: 'diff-record' }, `${stats.winsByDifficulty[d] ?? 0}W of ${played}`)
                  : el('div', { class: 'diff-record faint' }, 'Not played'),
              );
            }),
          ),

          el(
            'div',
            { class: 'panel', style: 'margin-top:14px;padding:14px' },
            el(
              'div',
              { style: `font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:${DIFFICULTY_BLURB[difficulty].color}` },
              DIFFICULTY_LABEL[difficulty],
            ),
            el(
              'ul',
              { style: 'margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--text-dim);line-height:1.7' },
              ...DIFFICULTY_BLURB[difficulty].traits.map((t) => el('li', {}, t)),
            ),
            el('div', { class: 'hint', style: 'margin-top:10px' }, describeDifficulty(difficulty)),
          ),

          el(
            'div',
            { class: 'row', style: 'margin-top:14px' },
            el('button', { class: 'btn primary xl', onclick: () => playAi() }, `Play ${DIFFICULTY_LABEL[difficulty]}`),
            el('button', { class: 'btn', onclick: () => navigate('practice') }, 'Practice gym'),
            el('button', { class: 'btn', onclick: () => navigate('controls') }, 'Controls'),
          ),
        ),

        panel(
          'Events',
          el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Rotating rulesets against the same CPU difficulty you have selected. Shorter games, different pressure.'),
          ...LIVE_EVENTS.map((e) => {
            const live = isEventLive(e, now);
            return el(
              'div',
              { class: 'kv' },
              el(
                'span',
                { class: 'k' },
                el('b', { style: `color:${e.accent}` }, e.name),
                el('div', { class: 'faint', style: 'font-size:11px' }, e.blurb),
              ),
              live
                ? el('button', { class: 'btn sm', onclick: () => playEvent(e.id, e.name) }, 'Enter')
                : el('span', { class: 'pill' }, 'Scheduled'),
            );
          }),
          activeXpMultiplier(now) > 1
            ? el('div', { class: 'pill live', style: 'margin-top:10px' }, `Double XP active — ${activeXpMultiplier(now)}x`)
            : null,
        ),
      ),

      // -------------------------------------------------------- right column
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Court',
          el(
            'div',
            { style: 'display:grid;gap:7px' },
            ...PARKS.map((p) => {
              const locked = player.level < p.unlockLevel;
              return el(
                'button',
                {
                  class: 'kv',
                  style: `width:100%;text-align:left;opacity:${locked ? 0.45 : 1}`,
                  disabled: locked,
                  onclick: () => {
                    parkId = p.id;
                    rerender();
                  },
                },
                el(
                  'span',
                  { class: 'k' },
                  el('b', { style: parkId === p.id ? 'color:var(--accent)' : '' }, p.name),
                  el('div', { class: 'faint', style: 'font-size:11px' }, locked ? `Unlocks at level ${p.unlockLevel}` : p.tagline),
                ),
                parkId === p.id ? el('span', { class: 'pill hot' }, 'Selected') : null,
              );
            }),
          ),
        ),

        panel(
          'Career ladder',
          el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Beat every difficulty to complete the ladder. Your highest cleared level is your career mark.'),
          ...DIFFICULTIES.map((d: SelectableDifficulty) => {
            const wins = stats.winsByDifficulty[d] ?? 0;
            const games = stats.gamesByDifficulty[d] ?? 0;
            return el(
              'div',
              { class: 'kv' },
              el(
                'span',
                { class: 'k', style: wins > 0 ? `color:${DIFFICULTY_BLURB[d].color};font-weight:800` : '' },
                DIFFICULTY_LABEL[d],
              ),
              el('span', { class: 'v' }, games === 0 ? '—' : `${wins}/${games}`),
            );
          }),
          el(
            'div',
            { style: 'margin-top:12px;font-size:12px' },
            el('span', { class: 'faint' }, 'Highest beaten: '),
            el(
              'b',
              { style: `color:${blurbColor(stats.highestDifficultyBeaten)}` },
              stats.highestDifficultyBeaten ? DIFFICULTY_LABEL[stats.highestDifficultyBeaten] : 'None yet',
            ),
          ),
        ),

        panel(
          'Rules',
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Format'), el('span', { class: 'v' }, '1v1 half court')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Scoring'), el('span', { class: 'v' }, '1s and 2s')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Target'), el('span', { class: 'v' }, 'First to 11, win by 2')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Shot clock'), el('span', { class: 'v' }, '14 seconds')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Possession'), el('span', { class: 'v' }, 'Make it, take it')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Fouls'), el('span', { class: 'v' }, 'Shooting fouls only')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Clear'), el('span', { class: 'v' }, 'Back past the arc')),
        ),
      ),
    ),
  );

  // ------------------------------------------------------------------ actions
  function playAi(): void {
    const overall = store.overall();
    // The CPU is built near your own level so the difficulty setting, not a
    // ratings gap, is what decides how hard the game feels.
    const target = Math.max(60, Math.min(99, overall + difficultyOverallBump(difficulty)));
    startMatch({
      opponent: generateOpponent(target, hashString(`ai-${difficulty}-${Date.now()}`)),
      difficulty,
      parkId,
      playlist: 'casual',
    });
  }

  function playEvent(eventId: string, eventName: string): void {
    const configs: Record<string, Parameters<typeof startMatch>[0]['config']> = {
      rush: { targetScore: 5, maxScore: 7, shotClock: 12, winBy: 1 },
      kotc: { targetScore: 7, maxScore: 9, shotClock: 14, winBy: 2 },
      'weekend-cup': { targetScore: 11, maxScore: 15, shotClock: 14, winBy: 2 },
      'double-xp': { targetScore: 11, maxScore: 15, shotClock: 14, winBy: 2 },
      'season-champs': { targetScore: 15, maxScore: 21, shotClock: 14, winBy: 2 },
    };
    const overall = store.overall();
    startMatch({
      opponent: generateOpponent(Math.max(60, overall + difficultyOverallBump(difficulty)), hashString(`${eventId}-${Date.now()}`)),
      difficulty,
      parkId,
      playlist: 'event',
      config: configs[eventId],
      eventName,
    });
  }

  return root;
}

/**
 * The tint for a difficulty, including the one that has no blurb.
 *
 * Grand Champ is not selectable so it has no card to describe, but the career
 * mark can still land on it if a ranked game is ever credited to the ladder.
 */
export function blurbColor(d: Difficulty | null | undefined): string {
  if (!d) return 'var(--text-faint)';
  return (DIFFICULTY_BLURB as Partial<Record<Difficulty, DifficultyBlurb>>)[d]?.color ?? 'var(--pink)';
}

/** Higher difficulties also field a slightly better build, not just better AI. */
function difficultyOverallBump(d: Difficulty): number {
  return { rookie: -8, semiPro: -4, pro: 0, allStar: 3, superstar: 6, hallOfFame: 9, grandChamp: 12 }[d];
}

function describeDifficulty(d: Difficulty): string {
  const p = DIFFICULTY_PRESETS[d];
  const moves = p.moveTier === 0 ? 'basic handles only' : p.moveTier === 1 ? 'advanced handles' : 'signature combos';
  const reads = p.tendencyRead > 0 ? `, adapts to your shot selection` : '';
  return `Reaction ${Math.round(p.reactionTime * 1000)}ms · on-ball distance ${p.standoff.toFixed(1)} ft · release error ±${(p.releaseError * 100).toFixed(1)}% · ${moves}, chains up to ${p.comboLength}${reads}. Build ${difficultyOverallBump(d) >= 0 ? '+' : ''}${difficultyOverallBump(d)} OVR versus yours.`;
}

export { fmt };
