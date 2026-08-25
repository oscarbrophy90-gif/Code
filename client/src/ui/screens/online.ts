import { store } from '../../state/store.ts';
import {
  connectMultiplayer,
  isConnected,
  joinMatchmaking,
  leaveMatchmaking,
  onMatchEnded,
  onMatchFound,
  onSearching,
  type MatchFound,
} from '../../net/multiplayer.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, panel } from '../dom.ts';
import { startMatch } from '../session.ts';
import { drawFigure } from '../walkout.ts';

/**
 * Online: find another real person, play them 1v1.
 *
 * Nothing is simulated here and there is no CPU anywhere on this path. Opening
 * the screen puts you in the server's queue; the server pairs two waiting
 * people, tells each of them which end of the wire they are, and both clients
 * drop into the same match at the same moment. When the other person leaves,
 * the survivor comes straight back here and starts searching again.
 *
 * Every other mode in the game plays the CPU and is untouched by any of this.
 */

/** True while a match we started is on screen, so we never start a second. */
let launching = false;

export function renderOnline(_params: RouteParams): HTMLElement {
  const root = el('div', { class: 'wrap' });

  // Being on this screen is what puts you in the queue; leaving takes you out.
  connectMultiplayer();
  joinMatchmaking(store.simConfig());

  root.append(
    el('h1', { class: 'page' }, 'Online'),
    el('p', { class: 'page-sub' }, 'One on one against another real player. No CPU.'),
  );

  const body = el('div', { style: 'display:grid;gap:14px;max-width:560px' });
  root.append(body);
  paint();

  const releases = [
    onSearching(() => {
      if (root.isConnected) paint();
    }),
    onMatchFound((found) => {
      if (root.isConnected) start(found);
    }),
    onMatchEnded(() => {
      // The opponent went; the match screen closes itself and lands back here,
      // where we queue up again rather than leaving you on a dead screen.
      if (!root.isConnected || launching) return;
      joinMatchmaking(store.simConfig());
      paint();
    }),
  ];

  // A slow tick so "Connecting…" turns into "Searching…" on its own.
  const timer = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(timer);
      for (const release of releases) release();
      // Navigating away from Online takes you out of the queue.
      if (!launching) leaveMatchmaking();
      return;
    }
    paint();
  }, 1000);

  return root;

  function paint(): void {
    const me = store.simConfig();
    const figure = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
    drawFigure(figure, me, 130);

    if (!isConnected()) {
      body.replaceChildren(
        panel(
          'Connecting…',
          el(
            'div',
            { class: 'online-wait' },
            el('div', { class: 'spinner' }),
            el('b', {}, 'Connecting to the server…'),
          ),
          el(
            'p',
            { class: 'hint', style: 'margin:10px 0 0' },
            'Online needs the game to be served by the Hoops Elite server — open it at http://localhost:3000/HoopsElite.html.',
          ),
        ),
      );
      return;
    }

    body.replaceChildren(
      panel(
        'Finding a match',
        el(
          'div',
          { class: 'online-wait' },
          el('div', { class: 'spinner' }),
          el('b', { class: 'waiting-text' }, 'Searching for opponent...'),
        ),
        el(
          'p',
          { class: 'hint', style: 'margin:12px 0 0' },
          'The match starts the moment another player is searching too. Both of you check the ball in before anybody moves.',
        ),
      ),
      panel('Your player', el('div', { class: 'online-me' }, figure, el('div', {}, el('b', {}, me.name)))),
    );
  }

  function start(found: MatchFound): void {
    if (launching) return;
    launching = true;
    console.log(`Online match ${found.matchId} — you are Player ${found.side + 1} (${found.role})`);

    body.replaceChildren(
      panel(
        'Opponent found',
        el('div', { class: 'online-wait' }, el('b', {}, `Match found — you are Player ${found.side + 1}`)),
        el('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Starting the 1v1…'),
      ),
    );

    // The opponent is a person, so there is no CPU build to scout and no
    // difficulty to name: the match screen is handed `online` and builds no AI
    // at all. Their build comes off the wire so both screens draw the same two
    // players in the same two places.
    const opponent = found.opponentBuild
      ? { ...found.opponentBuild, isBot: false }
      : { ...store.simConfig(), id: `online-${found.matchId}`, name: 'Opponent', isBot: false };

    startMatch({
      opponent,
      difficulty: 'pro',
      parkId: 'downtown',
      playlist: 'casual',
      online: { role: found.role },
      localSide: found.side,
      seed: found.seed,
      skipIntro: true,
      onDone: () => {
        launching = false;
        navigate('online');
      },
    });
  }
}
