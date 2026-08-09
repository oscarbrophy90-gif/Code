import {
  DIVISIONS_PER_TIER,
  ONLINE_TIERS,
  WINS_PER_DIVISION,
  computeOverall,
  generateOpponent,
  hashString,
  onlineRank,
  rankedOpponent,
  tierPopulation,
  worldPositionFor,
  WORLD_SIZE,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate } from '../../main.ts';
import { el, panel } from '../dom.ts';
import { startMatch } from '../session.ts';
import { rankPanel, ladderStrip } from '../rankbadge.ts';

/**
 * Ranked play.
 *
 * One button and one number. The rank is the progression: every win is five per
 * cent of a division, and the opponent you get is built to whatever rank you are
 * standing on, so the ladder is felt in who turns up rather than read off a bar.
 */
export function renderRank(): HTMLElement {
  const record = store.profile.online;
  const rank = onlineRank(record.wins);
  const played = record.wins + record.losses > 0;
  const position = played ? worldPositionFor(record.wins, record.losses) : null;
  const games = record.wins + record.losses;

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Ranked'),
    el(
      'p',
      { class: 'page-sub' },
      'Five wins clears a division, three divisions clears a tier. Every opponent is built to the rank you are standing on, so the further you climb the better they get.',
    ),

    panel(
      'Your rank',
      el('div', { class: 'rank-hero' }, rankPanel(record)),
      el(
        'div',
        { class: 'grid cols-4', style: 'margin-top:14px' },
        stat('Wins', String(record.wins)),
        stat('Losses', String(record.losses)),
        stat('Win rate', games > 0 ? `${Math.round((record.wins / games) * 100)}%` : '—'),
        stat('Best streak', String(record.bestStreak)),
      ),
      position !== null
        ? el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            `You are #${position} of ${WORLD_SIZE + 1} on the ladder. ${tierPopulation(rank.tier.id)} others are in ${rank.tier.name}.`,
          )
        : el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            'Play your first ranked match to take a place on the ladder.',
          ),
    ),
    el('div', { style: 'height:14px' }),

    panel(
      'Next match',
      el(
        'div',
        { class: 'nextmatch' },
        el(
          'div',
          {},
          el('div', { class: 'faint', style: 'font-size:11px;font-weight:800;letter-spacing:.1em' }, 'YOUR NEXT OPPONENT'),
          // Deliberately not their rating or the difficulty. You find out who
          // they are by playing them, which is the point of a ranked queue —
          // knowing the number in advance turns every match into a decision
          // about whether to bother.
          el('div', { class: 'nextmatch-line' }, 'Somebody at your rank'),
          el(
            'div',
            { class: 'hint', style: 'margin:6px 0 0' },
            rank.grandChamp
              ? 'The top of the ladder. There is nothing above this, and it plays like it.'
              : `Win ${rank.needed - rank.progress} more and you are ${nextLabel(record.wins)}. Lose and you drop one.`,
          ),
        ),
        el(
          'button',
          {
            class: 'btn primary lg',
            onclick: () => playRanked(),
          },
          'Play ranked match',
        ),
      ),
    ),
    el('div', { style: 'height:14px' }),

    panel(
      'The ladder',
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 12px' },
        `${WINS_PER_DIVISION} wins per division, three divisions per tier. Past Champion 1 you are Grand Champ, which has no divisions — from there you are placed against everyone else.`,
      ),
      ladderStrip(record.wins),
      el(
        'div',
        { class: 'ladder-table', style: 'margin-top:14px' },
        el('div', { class: 'ladder-row head' }, el('span', {}, 'Tier'), el('span', {}, 'Wins to reach'), el('span', {}, '')),
        ...ONLINE_TIERS.map((tier, i) => {
          const at = i * DIVISIONS_PER_TIER * WINS_PER_DIVISION;
          const reached = record.wins >= at;
          return el(
            'div',
            { class: `ladder-row ${tier.id === rank.tier.id ? 'on' : ''}` },
            el('span', { style: `color:${tier.color};font-weight:800` }, tier.name),
            el('span', {}, at === 0 ? 'Where you start' : String(at)),
            el('span', { class: 'faint' }, reached ? 'reached' : ''),
          );
        }),
      ),
      el(
        'div',
        { class: 'row', style: 'gap:8px;margin-top:14px' },
        el('button', { class: 'btn sm', onclick: () => navigate('leaderboard') }, 'See the leaderboard'),
      ),
    ),
  );

  return root;
}

function nextLabel(wins: number): string {
  const next = onlineRank((Math.floor(wins / WINS_PER_DIVISION) + 1) * WINS_PER_DIVISION);
  return next.grandChamp ? 'Grand Champ' : next.label;
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, value));
}

/**
 * Start a ranked game.
 *
 * The opponent is generated from the rank rather than picked, and seeded from
 * the number of games played so a match cannot be re-rolled by backing out and
 * coming in again.
 */
function playRanked(): void {
  const record = store.profile.online;
  const spec = rankedOpponent(record.wins);
  const seed = hashString(`ranked-${store.profile.userId}-${record.wins}-${record.losses}`);
  const opponent = generateOpponent(spec.overall, seed);

  startMatch({
    opponent,
    difficulty: spec.difficulty,
    parkId: 'downtown',
    playlist: 'ranked',
    ranked: true,
    eventName: 'Ranked match',
  });
}

/** Overall of the current build, for the "you" side of the matchup line. */
export function myOverall(): number {
  return computeOverall(store.player.attributes, store.player.build.position);
}
