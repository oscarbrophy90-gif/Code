import { COURT_MODE_BY_ID, type CourtMode, type ParkDef } from '@hoops/shared';

import { net, type MatchHandshake, type QueueStatus } from '../net/client.ts';
import { store } from '../state/store.ts';
import { el } from './dom.ts';

export interface SearchOutcome {
  /** the match to play, when one was found */
  handshake: MatchHandshake | null;
  /** why there is no match: the player cancelled, or something went wrong */
  reason: 'cancelled' | 'error' | null;
  message?: string;
}

/**
 * The wait for a real opponent.
 *
 * Everything about this screen is honest about what is happening: it names the
 * park and the court you are standing on, says how many other people are on that
 * exact court, and counts the seconds. It never quietly hands you a bot — if no
 * one turns up, or the server cannot be reached, it says so and lets you decide
 * whether to play the CPU instead. A game that pretends a bot is a person is
 * worse than one that admits nobody is online.
 */
export function searchForOpponent(host: HTMLElement, park: ParkDef, mode: CourtMode): Promise<SearchOutcome> {
  const court = COURT_MODE_BY_ID[mode];
  const started = performance.now();

  const dots = el('span', { class: 'search-dots' }, '');
  const waitedEl = el('div', { class: 'search-timer' }, '0s');
  const onCourtEl = el('div', { class: 'search-count' }, 'You are the only one here so far');
  const noteEl = el('div', { class: 'search-note' }, '');
  // The address is on screen the whole time. Two people who each run a server on
  // their own machine both have the address "localhost" and both believe they
  // are on the same one — this is the only thing that makes that visible.
  const serverEl = el('div', { class: 'search-server' }, `Server ${net.address}`);

  const cancelBtn = el('button', { class: 'btn' }, 'Leave the court');
  const overlay = el(
    'div',
    { class: 'search-overlay' },
    el(
      'div',
      { class: 'search-card' },
      el('div', { class: 'search-kicker' }, park.name.toUpperCase()),
      el('div', { class: 'search-title' }, court?.name ?? mode),
      el('div', { class: 'search-status' }, 'Searching for players', dots),
      waitedEl,
      onCourtEl,
      serverEl,
      el('div', { class: 'search-blurb' }, court?.blurb ?? ''),
      noteEl,
      cancelBtn,
    ),
  );
  host.appendChild(overlay);

  let closed = false;
  /** Last count from the server, so the warning can use it as it comes in. */
  let onServer = 1;
  const tick = window.setInterval(() => {
    const secs = Math.floor((performance.now() - started) / 1000);
    waitedEl.textContent = `${secs}s`;
    dots.textContent = '.'.repeat(1 + (secs % 3));
    if (secs === 12) {
      // Being alone on the server is a different problem from being alone on the
      // court, and it is the one that actually happens: your opponent is
      // connected to a different server, usually their own machine's localhost.
      // Saying "nobody is on this court" there sends people looking in the wrong
      // place, so name the real thing.
      noteEl.textContent =
        onServer <= 1
          ? 'You are the only one connected to this server. If your friend is searching too, you are not both on the same one — check the address matches on both machines.'
          : 'Nobody else is on this court yet. You can keep waiting.';
    }
  }, 250);

  const close = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(tick);
    overlay.remove();
  };

  return new Promise<SearchOutcome>((resolve) => {
    const finish = (outcome: SearchOutcome) => {
      close();
      resolve(outcome);
    };

    cancelBtn.onclick = () => {
      net.cancelQueue();
      finish({ handshake: null, reason: 'cancelled' });
    };

    const onStatus = (status: QueueStatus) => {
      if (closed) return;
      onServer = status.playersOnServer;
      const others = Math.max(0, status.playersOnCourt - 1);
      onCourtEl.textContent =
        others === 0
          ? 'You are the only one here so far'
          : `${others} other player${others === 1 ? '' : 's'} on this court`;
      // The population of the whole server, which is what tells you whether your
      // opponent is even reaching the same machine as you.
      const online = Math.max(1, status.playersOnServer);
      serverEl.textContent = `Server ${net.address} · ${online} connected`;
    };

    net
      .queue(park.id, mode, store.simConfig(), store.player.rank.points, onStatus)
      .then((handshake) => {
        if (closed) return;
        // Say who it is before the walkout, so the name on screen is a person.
        onCourtEl.textContent = `Matched with ${handshake.opponentName}`;
        noteEl.textContent = '';
        window.setTimeout(() => finish({ handshake, reason: null }), 700);
      })
      .catch((err: unknown) => {
        if (closed) return;
        finish({
          handshake: null,
          reason: 'error',
          message: err instanceof Error ? err.message : 'Could not reach the server',
        });
      });
  });
}
