import {
  computeOverall,
  generateOpponent,
  hashString,
  onlineRank,
  rankChange,
  rankedOpponent,
  ankleThreatFor,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import { toast } from './dom.ts';
import { refresh } from '../main.ts';
import { startMatch } from './session.ts';
import { playRankChange } from './rankchange.ts';

/**
 * A ranked match.
 *
 * Against the CPU — there is no online. The opponent is built from four things,
 * in the order they matter: your rank, your build's overall, your win streak
 * and your level. See `rankedOpponent` for the shape of it; the short version is
 * that the rank decides what kind of fight it should be and the rest decides
 * what it can be, so a starter build at Gold and a maxed build at Gold do not
 * get handed the same player.
 */
export function playRankedMatch(): void {
  if (!store.hasPlayer) {
    toast('Build a player first', 'bad');
    return;
  }

  const record = store.profile.online;
  const overall = computeOverall(store.player.attributes, store.player.build.position);

  // Seeded from the standing rather than from the clock, so backing out of a
  // match and coming in again gives you the same opponent. Re-rolling until the
  // draw is favourable is not a skill the ladder should reward — which is also
  // why the same seed decides where inside the difficulty band you land.
  const seed = hashString(`ranked-${store.profile.userId}-${record.rp}-${record.wins}-${record.losses}`);
  const spec = rankedOpponent({
    points: record.rp,
    playerOverall: overall,
    level: store.player.level,
    streak: record.streak,
    seed,
  });

  const opponent = generateOpponent(spec.overall, seed);
  // The sim owns the ankle-breaker maths and knows nothing about difficulty, so
  // the difficulty's handle threat rides along on the opponent's config.
  opponent.ankleThreat = ankleThreatFor(spec.difficulty, spec.edge);

  startMatch({
    opponent,
    difficulty: spec.difficulty,
    aiEdge: spec.edge,
    parkId: 'downtown',
    playlist: 'ranked',
    ranked: true,
    seed,
    coinMultiplier: spec.coinBonus,
    eventName: spec.streakActive ? 'Ranked match · streak' : 'Ranked match',
  });
}

/**
 * Settles a finished ranked match.
 *
 * Called by the results flow with what actually happened. The points move, the
 * screen behind is redrawn, and a rank change plays only when the rank really
 * changed — a promotion screen after every game is a promotion screen you skip
 * after the second one.
 */
export async function settleRanked(won: boolean, margin: number): Promise<void> {
  const move = store.recordRanked(won, margin);
  refresh();

  const change = rankChange(move.before, move.after);
  if (change !== 'none') {
    await playRankChange(document.body, move.before, move.after, store.accountId);
    return;
  }

  // No rank change still deserves a number: without it a win and a loss look
  // identical on the way back to the menu.
  const rank = onlineRank(move.after);
  const left = rank.grandChamp ? 0 : rank.needed - rank.progress;
  toast(
    move.delta >= 0
      ? `+${move.delta} RP${left > 0 ? ` · ${left} to ${rank.label === 'Grand Champ' ? 'the top' : 'the next rank'}` : ''}`
      : `${move.delta} RP`,
    move.delta >= 0 ? 'good' : 'bad',
  );
}
