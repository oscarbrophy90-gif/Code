import {
  DIVISIONS_PER_TIER,
  ONLINE_TIERS,
  POINTS_PER_DIVISION,
  computeOverall,
  onlineRank,
  rankedOpponent,
  DIFFICULTY_LABEL,
  STREAK_THRESHOLD,
  STREAK_DIFFICULTY_TOP_TIER,
  STREAK_BONUS_MIN_TIER,
  hashString,
  seasonForTime,
  seasonTimeRemaining,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { playRankedMatch } from '../rankedmatch.ts';
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
  const rank = onlineRank(record.rp);
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
      'Every ranked match is against a CPU built to your rank, your build and how you have been playing. Points, not wins: a win is worth more at the bottom of the ladder than at the top, and a loss costs more the higher you get.',
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
          el('div', { class: 'nextmatch-line' }, 'Somebody at your rank'),
          nextMatchNotes(),
          el(
            'div',
            { class: 'hint', style: 'margin:6px 0 0' },
            rank.grandChamp
              ? 'The top of the ladder. There is nothing above this, and it plays like it.'
              : `${rank.needed - rank.progress} points to ${nextLabel(record.rp)}. A loss costs you ground.`,
          ),
        ),
        el(
          'button',
          {
            class: 'btn primary lg',
            id: 'play-ranked',
            onclick: () => playRankedMatch(),
          },
          'Play Ranked Match',
        ),
      ),
    ),
    el('div', { style: 'height:14px' }),

    panel(
      'The ladder',
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 12px' },
        `${POINTS_PER_DIVISION} points per division, three divisions per tier. Wins are worth less and losses cost more the higher you climb, so holding a high rank takes a winning record and climbing takes a good one.`,
      ),
      ladderStrip(record.rp),
      el(
        'div',
        { class: 'ladder-table', style: 'margin-top:14px' },
        el('div', { class: 'ladder-row head' }, el('span', {}, 'Tier'), el('span', {}, 'Points to reach'), el('span', {}, '')),
        ...ONLINE_TIERS.map((tier, i) => {
          const at = i * DIVISIONS_PER_TIER * POINTS_PER_DIVISION;
          const reached = record.rp >= at;
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

function nextLabel(points: number): string {
  const next = onlineRank((Math.floor(points / POINTS_PER_DIVISION) + 1) * POINTS_PER_DIVISION);
  return next.grandChamp ? 'Grand Champ' : next.label;
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, value));
}

/** Overall of the current build, for the "you" side of the matchup line. */
export function myOverall(): number {
  return computeOverall(store.player.attributes, store.player.build.position);
}

/**
 * What the next game is actually going to be.
 *
 * The opponent's rating stays hidden — you find that out by playing them — but
 * the *difficulty* is not a secret worth keeping. A player on a five-game run at
 * Gold who suddenly cannot buy a win deserves to know the ladder did that on
 * purpose, and an Emerald player needs to see the doubled coins before the game
 * rather than after it, or the bonus is a surprise instead of a reason.
 */
function nextMatchNotes(): HTMLElement | null {
  const record = store.profile.online;
  const rank = onlineRank(record.rp);
  const tier = ONLINE_TIERS.findIndex((t) => t.id === rank.tier.id);
  const overall = store.hasPlayer ? computeOverall(store.player.attributes, store.player.build.position) : 75;
  const seed = hashString(`ranked-${store.profile.userId}-${record.rp}-${record.wins}-${record.losses}`);
  const spec = rankedOpponent({
    points: record.rp,
    playerOverall: overall,
    level: store.hasPlayer ? store.player.level : 1,
    streak: record.streak,
    seed,
  });

  const tags: HTMLElement[] = [
    el('span', { class: 'nextmatch-tag diff', style: `--tint:${rank.tier.color}` }, DIFFICULTY_LABEL[spec.difficulty]),
  ];
  if (spec.streakActive) {
    tags.push(el('span', { class: 'nextmatch-tag hot' }, `Streak ${record.streak} · harder`));
  }
  if (spec.coinBonus > 1) {
    tags.push(el('span', { class: 'nextmatch-tag coin' }, `${spec.coinBonus}× Coins on a win`));
  }

  // What the streak system is going to do next, so it is a rule rather than a
  // thing that happens to you.
  let note = '';
  if (tier >= STREAK_BONUS_MIN_TIER) {
    note = spec.coinBonus > 1
      ? 'Every win while this run lasts pays double Coins. One loss and it is gone.'
      : 'Hall of Fame or harder, every game, whatever your record. Win one, and every win after it pays double Coins until you lose.';
  } else if (spec.streakActive) {
    note = 'The ladder has noticed. Lose once and it drops straight back to normal.';
  } else if (tier <= STREAK_DIFFICULTY_TOP_TIER) {
    const left = Math.max(1, STREAK_THRESHOLD - record.streak);
    note = `${left} more win${left === 1 ? '' : 's'} in a row and the opponents get harder until you lose.`;
  }

  return el(
    'div',
    { style: 'margin-top:8px' },
    el('div', { class: 'nextmatch-tags' }, ...tags),
    note ? el('div', { class: 'hint', style: 'margin:6px 0 0' }, note) : null,
  );
}
