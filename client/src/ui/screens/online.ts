import { store } from '../../state/store.ts';
import {
  connectMultiplayer,
  currentMatchup,
  isConnected,
  joinOnlineQueue,
  leaveOnlineQueue,
  onlineCount,
  onMatchup,
  type OnlineMatchup,
} from '../../net/multiplayer.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, panel } from '../dom.ts';
import { startMatch } from '../session.ts';
import { drawFigure } from '../walkout.ts';

/**
 * Online: find another real person, play them 1v1.
 *
 * Nothing simulated here. Every other mode in the game plays against the CPU
 * and is untouched; this is the one place the opponent is a human being, and
 * when there is no human free the screen says so rather than quietly handing
 * you a bot.
 *
 * Pairing is worked out from the roster the server already broadcasts — see
 * the matchmaking note in net/multiplayer.ts — so it needs no events beyond
 * the five the server already speaks.
 */

/** True while a match we started is on screen, so we do not start a second. */
let launching = false;

export function renderOnline(_params: RouteParams): HTMLElement {
  const root = el('div', { class: 'wrap' });

  // Joining Online is what puts you in the queue; leaving takes you out.
  connectMultiplayer();
  joinOnlineQueue();

  root.append(
    el('h1', { class: 'page' }, 'Online'),
    el('p', { class: 'page-sub' }, 'One on one against another real player. No CPU.'),
  );

  const body = el('div', { style: 'display:grid;gap:14px;max-width:560px' });
  root.append(body);
  paint(currentMatchup());

  // Re-paint whenever the pairing changes, and tick so the connection state
  // and the player count stay honest while you wait.
  const release = onMatchup((m) => {
    if (root.isConnected) paint(m);
  });
  const timer = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(timer);
      release();
      // Navigating away from Online takes you out of the queue.
      if (!launching) leaveOnlineQueue();
      return;
    }
    paint(currentMatchup());
  }, 1000);

  return root;

  function paint(match: OnlineMatchup | null): void {
    const me = store.simConfig();
    const figure = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
    drawFigure(figure, me, 130);

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
      );
      return;
    }

    if (!match) {
      // Requirement: one player waiting sees exactly this.
      body.replaceChildren(
        panel(
          'Finding a match',
          el(
            'div',
            { class: 'online-wait' },
            el('div', { class: 'spinner' }),
            el('b', { class: 'waiting-text' }, 'Waiting for opponent...'),
          ),
          el(
            'p',
            { class: 'hint', style: 'margin:12px 0 0' },
            `${onlineCount()} player${onlineCount() === 1 ? '' : 's'} connected. The match starts the moment somebody else joins.`,
          ),
        ),
        panel('Your player', el('div', { class: 'online-me' }, figure, el('div', {}, el('b', {}, me.name)))),
      );
      return;
    }

    // Paired: say so, then start. Both clients reach this at the same moment
    // because both computed the same pairing from the same roster.
    body.replaceChildren(
      panel(
        'Opponent found',
        el(
          'div',
          { class: 'online-wait' },
          el('b', {}, `Match found — you are Player ${match.localSide + 1}`),
        ),
        el('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Starting the 1v1…'),
      ),
    );
    start(match);
  }

  function start(match: OnlineMatchup): void {
    if (launching) return;
    launching = true;
    console.log(`Online match starting against ${match.opponentId} — you are Player ${match.localSide + 1}`);
    // The opponent is a person, so there is no CPU build to scout and no
    // difficulty to name: the match screen is handed `online` and builds no
    // AI at all.
    startMatch({
      opponent: {
        ...store.simConfig(),
        id: `online-${match.opponentId}`,
        name: 'Opponent',
        isBot: false,
      },
      difficulty: 'pro',
      parkId: 'downtown',
      playlist: 'casual',
      online: { opponentId: match.opponentId, localSide: match.localSide },
      localSide: match.localSide,
      skipIntro: true,
      onDone: () => {
        launching = false;
        leaveOnlineQueue();
        navigate('home');
      },
    });
  }
}
