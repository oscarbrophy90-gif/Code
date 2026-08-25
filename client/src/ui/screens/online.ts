import { pvpRank, pvpNextRankAt, pvpNextRankLabel } from '@hoops/shared';
import { store } from '../../state/store.ts';
import {
  announceSelf,
  connectMultiplayer,
  isConnected,
  joinMatchmaking,
  leaveMatchmaking,
  onMatchEnded,
  onMatchFound,
  onMatchResult,
  onSearching,
  onSelfProfile,
  selfLadder,
  takeMatchResult,
  type MatchFound,
  type MatchResult,
  type OnlineMode,
  type OnlineProfile,
} from '../../net/multiplayer.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, panel } from '../dom.ts';
import { startMatch } from '../session.ts';
import { drawFigure } from '../walkout.ts';

/**
 * Online: play another person, Casual or Ranked.
 *
 * Two queues, and they never mix — a Casual game is a game, and a Ranked game
 * is a game that costs something, and being dropped into the second while
 * looking for the first would make the ladder meaningless.
 *
 * Everything on this screen that is a number about you — RP, rank, wins, losses
 * — comes from the server. The client renders them and derives the rank label
 * from the RP, which is safe because a label derived from the server's own
 * number cannot disagree with the server. Nothing here adds a point to anything.
 */

/** True while a match we started is on screen, so we never start a second. */
let launching = false;
/** The mode the player picked, remembered across a return from a match. */
let chosen: OnlineMode | null = null;
/** The last result the server reported, shown once on the way back. */
let pendingResult: MatchResult | null = null;

export function renderOnline(_params: RouteParams): HTMLElement {
  const root = el('div', { class: 'wrap' });

  connectMultiplayer();
  // Say who we are the moment the screen opens: the answer is our ladder, and
  // it is also what puts our build on the server for an opponent to be shown.
  announceSelf({ accountId: store.accountId, username: store.profile.username }, store.simConfig());

  root.append(
    el('h1', { class: 'page' }, 'Online'),
    el('p', { class: 'page-sub' }, 'One on one against another real player. No CPU.'),
  );

  const body = el('div', { style: 'display:grid;gap:14px;max-width:720px' });
  root.append(body);
  // A result that landed while the match screen was up is waiting here — the
  // Online screen was not mounted to hear it, so it was parked instead.
  pendingResult = pendingResult ?? takeMatchResult();
  paint();

  const releases = [
    onSelfProfile((p) => {
      // The server's copy is the real one; the local mirror is refreshed from
      // it so an offline Locker is not blank, and never the other way round.
      store.syncPvp(p);
      if (root.isConnected) paint();
    }),
    onSearching(() => {
      if (root.isConnected) paint();
    }),
    onMatchFound((found) => {
      if (root.isConnected) start(found);
    }),
    onMatchResult((result) => {
      pendingResult = result;
      if (result.ranked && result.you) store.syncPvp(result.you);
    }),
    onMatchEnded(() => {
      // The opponent went while we were still on this screen — nothing to do
      // but stop showing a queue we are no longer in.
      if (!root.isConnected || launching) return;
      chosen = null;
      paint();
    }),
  ];

  const timer = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(timer);
      for (const release of releases) release();
      if (!launching) leaveMatchmaking();
      return;
    }
    paint();
  }, 1000);

  return root;

  // ------------------------------------------------------------------ queue

  function queue(mode: OnlineMode): void {
    chosen = mode;
    joinMatchmaking(
      mode,
      { accountId: store.accountId, username: store.profile.username },
      store.simConfig(),
      // The rules the server judges the winner by — the same ones the
      // simulation plays to, cap included. Both players send the same set,
      // because both are running the same game.
      { targetScore: 11, winBy: 2, maxScore: 15 },
    );
  }

  // ------------------------------------------------------------------ paint

  function paint(): void {

    if (!isConnected()) {
      body.replaceChildren(
        panel(
          'Connecting…',
          el('div', { class: 'online-wait' }, el('div', { class: 'spinner' }), el('b', {}, 'Connecting to the server…')),
          el(
            'p',
            { class: 'hint', style: 'margin:10px 0 0' },
            'Online needs the game to be served by the Hoops Elite server — open it at http://localhost:3000/HoopsElite.html.',
          ),
        ),
        ladderPanel(),
      );
      return;
    }

    if (!chosen) {
      const result = pendingResult ? resultPanel(pendingResult) : null;
      body.replaceChildren(...(result ? [result] : []), modeChooser(), ladderPanel());
      return;
    }

    body.replaceChildren(
      panel(
        chosen === 'ranked' ? 'Ranked — finding a match' : 'Casual — finding a match',
        el(
          'div',
          { class: 'online-wait' },
          el('div', { class: 'spinner' }),
          el('b', { class: 'waiting-text' }, 'Searching for opponent...'),
        ),
        el('div', { class: `mode-flag ${chosen}` }, chosen === 'ranked' ? 'RANKED · RP AT STAKE' : 'CASUAL · NOTHING AT STAKE'),
        el(
          'p',
          { class: 'hint', style: 'margin:12px 0 0' },
          chosen === 'ranked'
            ? 'Matching you with somebody near your rank. The longer you wait, the wider that gets.'
            : 'Matching you with anybody else playing Casual.',
        ),
        el(
          'button',
          {
            class: 'btn',
            style: 'margin-top:12px',
            onclick: () => {
              leaveMatchmaking();
              chosen = null;
              paint();
            },
          },
          'Back',
        ),
      ),
      ladderPanel(),
    );
  }

  function modeChooser(): HTMLElement {
    return panel(
      'Choose a mode',
      el(
        'div',
        { class: 'online-modes' },
        modeCard(
          'casual',
          'Play Online — Casual',
          'A full game against another person. Your rank, RP and record do not move, win or lose.',
        ),
        modeCard(
          'ranked',
          'Play Online — Ranked',
          'The ladder. A win takes RP off them and gives it to you; a loss does the reverse. Quitting counts as a loss.',
        ),
      ),
    );
  }

  function modeCard(mode: OnlineMode, title: string, blurb: string): HTMLElement {
    return el(
      'button',
      {
        class: `mode-card online-mode ${mode}`,
        onclick: () => {
          queue(mode);
          paint();
        },
      },
      el('div', { class: 'mode-card-title' }, title),
      el('div', { class: 'mode-card-blurb' }, blurb),
      el('div', { class: `mode-flag ${mode}` }, mode === 'ranked' ? 'RP AT STAKE' : 'NOTHING AT STAKE'),
    );
  }

  /** Your ladder — the server's numbers, drawn. */
  function ladderPanel(): HTMLElement {
    const me = store.simConfig();
    const server = selfLadder();
    const record = server ?? { rp: store.profile.pvp.rp, wins: store.profile.pvp.wins, losses: store.profile.pvp.losses };
    const rank = pvpRank(record.rp);
    const nextAt = pvpNextRankAt(record.rp);
    const nextLabel = pvpNextRankLabel(record.rp);

    const figure = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
    drawFigure(figure, me, 118);

    return panel(
      'Your online profile',
      el(
        'div',
        { class: 'online-me' },
        figure,
        el(
          'div',
          {},
          el('div', { class: 'ladder-user' }, store.profile.username || 'Unnamed'),
          el('div', { class: 'ladder-rank', style: `color:${rank.tier.color}` }, rank.label.toUpperCase()),
          el('div', { class: 'ladder-rp' }, `${record.rp} RP`),
          el('div', { class: 'ladder-record' }, `${record.wins} Wins · ${record.losses} Losses`),
          nextAt !== null
            ? el('div', { class: 'ladder-next' }, `${nextAt - record.rp} RP to ${nextLabel}`)
            : el('div', { class: 'ladder-next' }, 'Top of the ladder'),
          el('div', { class: 'ladder-build' }, `${me.name} · ${me.archetype ?? me.position ?? 'Build'}`),
        ),
      ),
      el(
        'p',
        { class: 'hint', style: 'margin:10px 0 0' },
        server
          ? 'Held on the server. Nothing on this machine can change it.'
          : 'Last known — the server has not answered yet.',
      ),
    );
  }

  /**
   * What the last match did to your ladder.
   *
   * Shown as a panel rather than a toast: the RP change, the rank it moved you
   * to and your record are the whole point of having played a ranked game, and
   * a message that fades after four seconds is not where you put that.
   */
  function resultPanel(result: MatchResult): HTMLElement {
    const dismiss = el(
      'button',
      {
        class: 'btn',
        style: 'margin-top:12px',
        onclick: () => {
          pendingResult = null;
          paint();
        },
      },
      'Dismiss',
    );

    const why =
      result.reason === 'forfeit'
        ? ' · forfeit'
        : result.reason === 'disconnect'
          ? ' · opponent disconnected'
          : '';

    if (!result.ranked) {
      return panel(
        'Casual result',
        el('div', { class: `result-verdict ${result.won ? 'won' : 'lost'}` }, result.won ? 'WINNER' : 'DEFEATED'),
        el('p', { class: 'hint', style: 'margin:8px 0 0' }, `Casual${why} — no RP, no rank change, no win or loss recorded.`),
        dismiss,
      );
    }

    const you = result.you;
    if (!you) return panel('Ranked result', el('div', {}, 'The server did not report a ladder change.'), dismiss);

    const rank = pvpRank(you.rp);
    const before = pvpRank(you.rpBefore);
    const moved = rank.label !== before.label;
    // A loss at 0 RP costs nothing, because the ladder has a floor. "+0 RP" on
    // a defeat reads like a reward; it is simply nothing happening.
    const sign = you.delta > 0 ? '+' : '';

    return panel(
      `Ranked result${why}`,
      el('div', { class: `result-verdict ${result.won ? 'won' : 'lost'}` }, result.won ? 'WINNER' : 'DEFEATED'),
      el(
        'div',
        { class: `result-delta ${you.delta > 0 ? 'up' : you.delta < 0 ? 'down' : ''}` },
        `${sign}${you.delta} RP`,
      ),
      el(
        'div',
        { class: 'result-row' },
        el('span', {}, 'New RP'),
        el('b', {}, `${you.rpBefore} RP → ${you.rp} RP`),
      ),
      el(
        'div',
        { class: 'result-row' },
        el('span', {}, moved ? 'New rank' : 'Rank'),
        el('b', { style: `color:${rank.tier.color}` }, moved ? `${before.label} → ${rank.label}` : rank.label),
      ),
      el('div', { class: 'result-row' }, el('span', {}, 'Wins'), el('b', {}, String(you.wins))),
      el('div', { class: 'result-row' }, el('span', {}, 'Losses'), el('b', {}, String(you.losses))),
      result.opponent
        ? el(
            'p',
            { class: 'hint', style: 'margin:10px 0 0' },
            `${result.opponent.username}: ${result.opponent.delta > 0 ? '+' : ''}${result.opponent.delta} RP → ${result.opponent.rp} RP · ` +
              `${pvpRank(result.opponent.rp).label}`,
          )
        : null,
      dismiss,
    );
  }

  // ------------------------------------------------------------------ start

  function start(found: MatchFound): void {
    if (launching) return;
    launching = true;
    chosen = found.mode;

    const mine: OnlineProfile = found.you.profile;
    const theirs: OnlineProfile = found.opponent.profile;
    store.syncPvp(mine);

    body.replaceChildren(
      panel(
        'Opponent found',
        el('div', { class: 'online-wait' }, el('b', {}, `${theirs.username} — ${pvpRank(theirs.rp).label}`)),
        el('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Starting the walkout…'),
      ),
    );

    // Their build comes off the SERVER's copy, not out of their browser. If the
    // server has none — a client that never announced one — we play them as an
    // unnamed build rather than inventing statistics for a real person.
    const opponent = found.opponent.build
      ? { ...found.opponent.build, isBot: false }
      : { ...store.simConfig(), id: `online-${found.matchId}`, name: theirs.username, isBot: false };

    startMatch({
      opponent,
      difficulty: 'pro',
      parkId: 'downtown',
      playlist: found.mode === 'ranked' ? 'ranked' : 'casual',
      online: { role: found.role, mode: found.mode },
      onlineIdentities: {
        you: { username: mine.username, points: mine.rp, wins: mine.wins, losses: mine.losses, placement: null, pvp: true },
        opponent: {
          username: theirs.username,
          points: theirs.rp,
          wins: theirs.wins,
          losses: theirs.losses,
          placement: null,
          pvp: true,
        },
      },
      localSide: found.side,
      seed: found.seed,
      onDone: () => {
        launching = false;
        // Back to the menu, not back into the queue. However the game ended,
        // the next one is a choice: dropping somebody straight into another
        // ranked match they did not ask for is how you lose RP to a game you
        // were not ready to play.
        chosen = null;
        navigate('online');
      },
    });
  }
}
