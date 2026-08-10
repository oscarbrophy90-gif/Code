import {
  DIVISIONS_PER_TIER,
  ONLINE_TIERS,
  WINS_PER_DIVISION,
  computeOverall,
  onlineRank,
  seasonForTime,
  seasonTimeRemaining,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { findPlayer } from '../matchmaking.ts';
import { boardSize } from '../../state/board.ts';
import { navigate } from '../../main.ts';
import { el, panel } from '../dom.ts';
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
  const position = store.position();
  const games = record.wins + record.losses;
  const season = seasonForTime(Date.now());
  const left = seasonTimeRemaining(Date.now());

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Ranked'),
    el(
      'p',
      { class: 'page-sub' },
      'Ranked is online. Every match is against another person who pressed Find Player at the same time as you, and it is the only thing in the game that moves your rank.',
    ),

    panel(
      'Your rank',
      el(
        'div',
        { class: 'rank-hero' },
        rankPanel(record, position),
        // Next to the rank, because that is where the question "what do I get
        // for this?" gets asked.
        el(
          'button',
          { class: 'btn sm primary rank-path-btn', onclick: () => navigate('rankpath') },
          'View path',
        ),
      ),
      el(
        'div',
        { class: 'grid cols-4', style: 'margin-top:14px' },
        stat('Wins', String(record.wins)),
        stat('Losses', String(record.losses)),
        stat('Win rate', games > 0 ? `${Math.round((record.wins / games) * 100)}%` : '—'),
        stat('Best streak', String(record.bestStreak)),
      ),
      el(
        'p',
        { class: 'hint', style: 'margin:12px 0 0' },
        `${season.name} ends in ${left.days}d ${left.hours}h. The ladder resets then and every rank you reached pays out.`,
      ),
      position !== null
        ? el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            `You are #${position.toLocaleString()} of ${boardSize().toLocaleString()} on the board.`,
          )
        : el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            'Play your first ranked match to take a place on the board.',
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
          // Deliberately not their rating. You find out who they are by playing
          // them, which is the point of a queue — knowing in advance turns every
          // match into a decision about whether to bother.
          el('div', { class: 'nextmatch-line' }, 'A real player, somewhere'),
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
            id: 'find-player',
            onclick: () => void findPlayer(),
          },
          'Find Player',
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

/** Overall of the current build, for the "you" side of the matchup line. */
export function myOverall(): number {
  return computeOverall(store.player.attributes, store.player.build.position);
}
