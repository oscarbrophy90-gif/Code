import {
  DIFFICULTY_PRESETS,
  LIVE_EVENTS,
  PARKS,
  activeXpMultiplier,
  generateOpponent,
  hashString,
  isEventLive,
  opponentForRank,
  rankLabel,
  searchBand,
  type Difficulty,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { net } from '../../net/client.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, fmt, overlay, panel, segmented, toast } from '../dom.ts';
import { startMatch } from '../session.ts';
import { CONTROL_SHEET } from '../../engine/input.ts';

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'rookie', label: 'Rookie' },
  { value: 'pro', label: 'Pro' },
  { value: 'allStar', label: 'All-Star' },
  { value: 'superstar', label: 'Superstar' },
  { value: 'legend', label: 'Legend' },
];

let difficulty: Difficulty = 'pro';
let parkId = 'downtown';

export function renderPlay(params: RouteParams): HTMLElement {
  const mode = String(params.mode ?? 'ranked');
  const player = store.player;
  const now = Date.now();
  const band = searchBand(player.rank.points, 0);

  const root = el('div', { class: 'wrap' });

  root.append(
    el('h1', { class: 'page' }, 'Play'),
    el('p', { class: 'page-sub' }, 'Every mode is the same game: half court, make-it-take-it, first to eleven, win by two. Twos from behind the arc, ones inside.'),
  );

  const rerender = () => {
    navigate('play', { mode });
  };

  root.append(
    el(
      'div',
      { class: 'split' },
      el(
        'div',
        { style: 'display:grid;gap:14px' },

        panel(
          'Online',
          el(
            'div',
            { class: 'mode-grid' },
            tile('Ranked 1v1', `Matchmaking ${fmt(Math.round(band.min))}–${fmt(Math.round(band.max))} RP · you are ${rankLabel(player.rank.points)}`, '#ff7a3d', () =>
              queueOnline('ranked'),
            ),
            tile('Casual 1v1', 'Play loose. Results do not touch your rank.', '#4aa3ff', () => queueOnline('casual')),
            tile('Private match', 'Create a code or join a friend.', '#a06bff', () => privateMatchDialog()),
          ),
          el(
            'p',
            { class: 'hint', style: 'margin-top:12px' },
            'Online play needs the Hoops Elite server running. Start it with ',
            el('span', { class: 'keycap' }, 'npm run dev:server'),
            ' or point at your own host in Settings. If it is unreachable you will be offered an offline game against a matched AI instead.',
          ),
        ),

        panel(
          'Solo',
          el('div', { class: 'mb' }, segmented(DIFFICULTIES, difficulty, (v) => {
            difficulty = v;
            rerender();
          })),
          el(
            'div',
            { class: 'hint mb' },
            describeDifficulty(difficulty),
          ),
          el(
            'div',
            { class: 'row' },
            el('button', { class: 'btn primary', onclick: () => playAi(false) }, 'Play AI'),
            el('button', { class: 'btn', onclick: () => playAi(true) }, 'Free run (no defender)'),
            el('button', { class: 'btn', onclick: () => showControls() }, 'Controls'),
          ),
        ),

        panel(
          'Events',
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

      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Court',
          el(
            'div',
            { style: 'display:grid;gap:7px' },
            ...PARKS.map((p) => {
              const locked = store.player.level < p.unlockLevel;
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
          'Rules',
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Format'), el('span', { class: 'v' }, '1v1 half court')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Scoring'), el('span', { class: 'v' }, '1s and 2s')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Target'), el('span', { class: 'v' }, 'First to 11, win by 2')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Shot clock'), el('span', { class: 'v' }, '14 seconds')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Possession'), el('span', { class: 'v' }, 'Make it, take it')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Clear'), el('span', { class: 'v' }, 'Back past the arc')),
        ),
      ),
    ),
  );

  // ---------------------------------------------------------------- actions
  function playAi(freeRun: boolean): void {
    const overall = store.overall();
    const opponent = generateOpponent(freeRun ? 60 : Math.max(60, overall - 2), hashString(`ai-${Date.now()}`));
    if (freeRun) {
      // A passive opponent turns the court into a shooting gym.
      opponent.attrs.perimeterDefense = 25;
      opponent.attrs.interiorDefense = 25;
      opponent.attrs.steal = 25;
      opponent.attrs.block = 25;
      opponent.attrs.speed = 25;
      opponent.name = 'Practice Dummy';
    }
    startMatch({
      opponent,
      difficulty: freeRun ? 'rookie' : difficulty,
      parkId,
      playlist: 'casual',
      config: freeRun ? { targetScore: 21, maxScore: 21, shotClock: 60, winBy: 1 } : undefined,
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
    startMatch({
      opponent: opponentForRank(store.player.rank.points, eventId),
      opponentRankPoints: store.player.rank.points,
      difficulty,
      parkId,
      playlist: 'event',
      config: configs[eventId],
      eventName,
    });
  }

  function queueOnline(playlist: 'ranked' | 'casual'): void {
    let cancelled = false;
    let waited = 0;

    overlay((close) => {
      const status = el('div', { style: 'font-size:13px;color:var(--text-dim)' }, 'Connecting to matchmaking…');
      const bandLine = el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, '');

      const tick = window.setInterval(() => {
        waited += 1;
        const b = searchBand(store.player.rank.points, waited);
        bandLine.textContent = `Searching ${fmt(Math.round(b.min))} – ${fmt(Math.round(b.max))} RP · ${waited}s`;
      }, 1000);

      const stop = () => {
        cancelled = true;
        clearInterval(tick);
        net.cancelQueue();
        close();
      };

      void net
        .queue(playlist, store.simConfig(), store.player.rank.points, parkId, (msg) => {
          status.textContent = msg;
        })
        .then((found) => {
          if (cancelled) return;
          clearInterval(tick);
          close();
          startMatch({
            opponent: found.opponent,
            opponentRankPoints: found.opponentRank,
            difficulty: 'allStar',
            parkId,
            playlist,
            localSide: found.side,
            seed: found.seed,
            net: found.adapter,
            config: found.config,
          });
        })
        .catch((err: Error) => {
          if (cancelled) return;
          clearInterval(tick);
          close();
          offerOffline(playlist, err.message);
        });

      return el(
        'div',
        { class: 'center' },
        el('div', { class: 'spinner' }),
        el('h2', { style: 'margin:0 0 6px;font-size:20px;font-weight:900' }, playlist === 'ranked' ? 'Ranked 1v1' : 'Casual 1v1'),
        status,
        bandLine,
        el('button', { class: 'btn', style: 'margin-top:20px', onclick: stop }, 'Cancel'),
      );
    });
  }

  function offerOffline(playlist: 'ranked' | 'casual', reason: string): void {
    overlay((close) =>
      el(
        'div',
        {},
        el('h2', { style: 'margin:0 0 8px;font-size:20px;font-weight:900' }, 'Matchmaking unavailable'),
        el('p', { class: 'dim', style: 'margin:0 0 6px' }, reason),
        el('p', { class: 'hint', style: 'margin:0 0 20px' }, 'You can still play a rank-matched AI opponent offline. Casual rewards apply; ranked points are not adjusted.'),
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                close();
                startMatch({
                  opponent: opponentForRank(store.player.rank.points, playlist),
                  difficulty: difficultyForRank(),
                  parkId,
                  playlist: 'casual',
                });
              },
            },
            'Play offline',
          ),
          el('button', { class: 'btn', onclick: close }, 'Back'),
        ),
      ),
    );
  }

  function privateMatchDialog(): void {
    overlay((close) => {
      const codeInput = el('input', { type: 'text', placeholder: 'Enter a 5-character code', maxlength: 5 }) as HTMLInputElement;
      return el(
        'div',
        {},
        el('h2', { style: 'margin:0 0 6px;font-size:20px;font-weight:900' }, 'Private match'),
        el('p', { class: 'dim', style: 'margin:0 0 18px' }, 'Create a lobby and share the code, or join one. Private games pay reduced currency so they cannot be farmed.'),
        el(
          'div',
          { class: 'row mb' },
          el(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                void net
                  .createPrivate(store.simConfig())
                  .then((code) => toast(`Lobby created — share code ${code}`, 'good'))
                  .catch((e: Error) => toast(e.message, 'bad'));
              },
            },
            'Create lobby',
          ),
        ),
        codeInput,
        el(
          'button',
          {
            class: 'btn block',
            style: 'margin-top:10px',
            onclick: () => {
              const code = codeInput.value.trim().toUpperCase();
              if (code.length < 4) {
                toast('Enter the full code', 'bad');
                return;
              }
              close();
              void net
                .joinPrivate(code, store.simConfig())
                .then((found) =>
                  startMatch({
                    opponent: found.opponent,
                    difficulty: 'allStar',
                    parkId,
                    playlist: 'private',
                    localSide: found.side,
                    seed: found.seed,
                    net: found.adapter,
                    config: found.config,
                  }),
                )
                .catch((e: Error) => toast(e.message, 'bad'));
            },
          },
          'Join lobby',
        ),
      );
    });
  }

  return root;
}

function difficultyForRank(): Difficulty {
  const rp = store.player.rank.points;
  if (rp > 4400) return 'legend';
  if (rp > 3650) return 'superstar';
  if (rp > 2150) return 'allStar';
  if (rp > 700) return 'pro';
  return 'rookie';
}

function describeDifficulty(d: Difficulty): string {
  const p = DIFFICULTY_PRESETS[d];
  return `Reaction ${Math.round(p.reactionTime * 1000)}ms · on-ball distance ${p.standoff.toFixed(1)} ft · contest IQ ${Math.round(p.contestIq * 100)}% · release error ±${(p.releaseError * 100).toFixed(1)}%. Adaptive difficulty nudges these while you play based on the score and how well you are timing your shots.`;
}

function tile(name: string, desc: string, tint: string, onclick: () => void): HTMLElement {
  return el(
    'button',
    { class: 'mode', style: `--tint:${tint}`, onclick },
    el('span', { class: 'kicker' }, 'Online'),
    el('span', { class: 'name' }, name),
    el('span', { class: 'desc' }, desc),
  );
}

function showControls(): void {
  overlay(() =>
    el(
      'div',
      {},
      el('h2', { style: 'margin:0 0 6px;font-size:20px;font-weight:900' }, 'Controls'),
      el('p', { class: 'dim', style: 'margin:0 0 16px' }, 'Keyboard shown. A gamepad maps movement to the left stick, dribble moves to right-stick flicks, and shoot to the bottom face button.'),
      el(
        'div',
        { style: 'display:grid;gap:7px' },
        ...CONTROL_SHEET.map((c) =>
          el(
            'div',
            { style: 'display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:baseline' },
            el('div', {}, ...c.keys.map((k) => el('span', { class: 'keycap', style: 'margin-right:3px' }, k))),
            el('div', {}, el('b', { style: 'font-size:13px' }, c.label), el('div', { class: 'faint', style: 'font-size:11px' }, c.action)),
          ),
        ),
      ),
    ),
  );
}
