import { generateOpponent, hashString, rankChange, type SimPlayerConfig } from '@hoops/shared';

import { store } from '../state/store.ts';
import { online, type MatchFound, type Settled } from '../net/online.ts';
import { audio } from '../engine/audio.ts';
import { el, toast } from './dom.ts';
import { startMatch } from './session.ts';
import { refresh } from '../main.ts';
import { playRankChange } from './rankchange.ts';

/**
 * Find Player.
 *
 * The whole online flow lives here: connect, queue, and hand the match to the
 * ordinary match screen once the server has found somebody. Everything about the
 * game itself — the walkout, the court, the controls — is the same code the
 * offline modes use, because the only thing online changes is who is on the
 * other side.
 *
 * The screen is honest about what it is doing. "Searching" with no numbers on it
 * is indistinguishable from broken, so it says how long it has been looking and
 * how many people are actually connected.
 */

/** Set while a search or an online match is in flight, so it cannot stack. */
let searching = false;

export function isSearching(): boolean {
  return searching;
}

export async function findPlayer(): Promise<void> {
  if (searching) return;
  if (!store.profile.username) {
    toast('You need a username before you can play online', 'bad');
    return;
  }
  searching = true;

  const ui = queueOverlay();
  document.body.appendChild(ui.root);

  const cleanup: (() => void)[] = [];
  const close = () => {
    for (const off of cleanup) off();
    ui.root.remove();
    searching = false;
  };

  ui.onCancel(() => {
    online.cancelMatch();
    close();
  });

  try {
    ui.status('Connecting to the server…');
    await online.connect();
  } catch (err) {
    ui.failed(
      'Could not reach the server',
      `${online.address} did not answer. ${err instanceof Error ? err.message : ''} You can set the address in Settings.`,
    );
    ui.onCancel(close);
    return;
  }

  cleanup.push(
    online.on<{ reason: string }>('rejected', (msg) => {
      ui.failed('The server said no', msg.reason);
    }),
  );

  cleanup.push(
    online.on<{ inQueue: number; online: number }>('queued', (msg) => {
      ui.status('Searching for players…');
      ui.counts(msg.inQueue, msg.online);
    }),
  );

  cleanup.push(
    online.on<{ waited: number; inQueue: number; online: number }>('queueUpdate', (msg) => {
      ui.waited(msg.waited);
      ui.counts(msg.inQueue, msg.online);
    }),
  );

  cleanup.push(
    online.on<{ waited: number }>('queueTimeout', () => {
      ui.failed(
        'Nobody else is here',
        'Two minutes and no one else queued up. Online is ranked only, so somebody else has to be looking at the same time — get a friend to press Find Player.',
      );
    }),
  );

  cleanup.push(
    online.on<MatchFound>('matchFound', (msg) => {
      close();
      audio.play('levelUp', 0.8);
      begin(msg);
    }),
  );

  ui.status('Searching for players…');
  online.findMatch(store.simConfig(), store.player.name);
}

/**
 * Drops into the match the server just made.
 *
 * The opponent's build comes over the wire so both screens draw the same player.
 * If it did not arrive — an old client, a truncated payload — one is generated
 * from the match id, which is identical on both sides for the same reason the
 * seed is: it makes a mismatched-looking opponent impossible.
 */
function begin(match: MatchFound): void {
  const opponent: SimPlayerConfig =
    match.opponent.player ?? generateOpponent(75, hashString(match.matchId));
  const named: SimPlayerConfig = { ...opponent, name: match.opponent.buildName || opponent.name };

  searching = true;
  const settlement = awaitSettlement();

  startMatch({
    opponent: named,
    // Nobody is driving the other player, so the difficulty is only a label —
    // the walkout hides it for ranked anyway.
    difficulty: 'pro',
    parkId: 'downtown',
    playlist: 'ranked',
    ranked: true,
    net: match.role,
    localSide: match.side,
    seed: match.seed,
    opponentName: match.opponent.username,
    eventName: `Ranked · ${match.opponent.username}`,
    onSettled: settlement,
  });
}

/**
 * The server's verdict on the match, as a promise.
 *
 * Awaited by the results flow so the rank you are shown is the server's, not a
 * local guess that might disagree with the leaderboard thirty seconds later. It
 * resolves to null if the server never answers, and the results screen carries
 * on without a rank change rather than hanging.
 */
export function awaitSettlement(): Promise<Settled | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: Settled | null) => {
      if (done) return;
      done = true;
      off();
      offDrop();
      clearTimeout(timer);
      searching = false;
      resolve(value);
    };
    const off = online.on<Settled>('matchSettled', (msg) => finish(msg));
    const offDrop = online.on<{ graceMs: number }>('opponentDropped', () => {
      toast('Your opponent dropped — hold on', 'info');
    });
    const timer = window.setTimeout(() => finish(null), 20_000);
  });
}

/** Applies a settlement and plays the rank change it caused. */
export async function applySettlement(settled: Settled | null): Promise<void> {
  if (!settled) {
    toast('The server did not confirm that result — your rank is unchanged', 'bad');
    return;
  }
  const moved = store.applyServerRecord(settled.record);
  refresh();
  if (settled.reason === 'disconnect') toast('Opponent left — the win is yours', 'good');
  if (moved.after !== moved.before && rankChange(moved.before, moved.after) !== 'none') {
    await playRankChange(document.body, moved.before, moved.after, store.accountId);
  }
}

// ------------------------------------------------------------------ the card

function queueOverlay() {
  const statusLine = el('div', { class: 'queue-status' }, 'Connecting…');
  const detail = el('div', { class: 'queue-detail' }, '');
  const timer = el('div', { class: 'queue-timer' }, '0s');
  const spinner = el('div', { class: 'queue-spinner' }, el('span', {}), el('span', {}), el('span', {}));
  const button = el('button', { class: 'btn' }, 'Cancel') as HTMLButtonElement;

  const card = el(
    'div',
    { class: 'queue-card' },
    el('div', { class: 'queue-kicker' }, 'RANKED · ONLINE'),
    spinner,
    statusLine,
    timer,
    detail,
    button,
  );
  const root = el('div', { class: 'queue-overlay' }, card);

  let seconds = 0;
  const tick = window.setInterval(() => {
    seconds++;
    timer.textContent = `${seconds}s`;
  }, 1000);
  root.addEventListener('remove', () => clearInterval(tick));

  return {
    root,
    status(text: string) {
      statusLine.textContent = text;
    },
    waited(value: number) {
      seconds = value;
      timer.textContent = `${value}s`;
    },
    counts(inQueue: number, connected: number) {
      detail.textContent =
        inQueue > 1
          ? `${inQueue} searching · ${connected} online`
          : connected > 1
            ? `${connected} online, ${inQueue} searching — waiting for one of them to queue`
            : 'You are the only one connected right now';
    },
    failed(title: string, why: string) {
      clearInterval(tick);
      spinner.remove();
      timer.remove();
      card.classList.add('failed');
      statusLine.textContent = title;
      detail.textContent = why;
      button.textContent = 'Close';
    },
    onCancel(handler: () => void) {
      button.onclick = () => {
        clearInterval(tick);
        handler();
      };
    },
  };
}
