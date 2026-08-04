import {
  REGIONS,
  TIERS,
  computeOverall,
  hashString,
  rankLabel,
  Rng,
  tierForPoints,
  type LeaderboardEntry,
  type Region,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { net } from '../../net/client.ts';
import { refresh } from '../../main.ts';
import { bar, el, fmt, panel, ratio, segmented, tabs } from '../dom.ts';

type Scope = 'world' | 'region';
let scope: Scope = 'world';
let cached: { scope: Scope; entries: LeaderboardEntry[]; live: boolean } | null = null;

export function renderLeaderboard(): HTMLElement {
  const player = store.player;
  const tier = tierForPoints(player.rank.points);

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Ranks'),
    el('p', { class: 'page-sub' }, 'Seven tiers, four divisions each up to Legend. Matchmaking searches a tight rating band first and widens it the longer you wait, so a fair game beats a fast one.'),
  );

  root.append(
    el(
      'div',
      { class: 'split mb' },
      panel(
        'Your standing',
        el(
          'div',
          { class: 'row' },
          el('div', {
            style: `width:56px;height:64px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:linear-gradient(160deg, ${tier.glow}, ${tier.color})`,
          }),
          el(
            'div',
            { style: 'flex:1' },
            el('div', { style: 'font-size:22px;font-weight:900' }, rankLabel(player.rank.points)),
            el('div', { class: 'faint', style: 'font-size:12px' }, `${fmt(player.rank.points)} RP · season high ${fmt(player.rank.seasonHigh)}`),
            el(
              'div',
              { class: 'barrow', style: 'margin-top:8px' },
              el('span', { class: 'lbl' }, tier.tier === 'legend' ? 'Top tier' : `To ${TIERS[TIERS.indexOf(tier) + 1]?.label ?? 'next'}`),
              el('span', { class: 'val' }, `${fmt(Math.max(0, tier.max - player.rank.points))} RP`),
              bar((player.rank.points - tier.min) / (tier.max - tier.min)),
            ),
          ),
        ),
        el('div', { class: 'faint', style: 'font-size:11px;margin-top:12px' }, 'Region'),
        segmented(
          REGIONS.map((r) => ({ value: r as Region, label: r.toUpperCase() })),
          store.profile.region,
          (v) => {
            store.update((p) => {
              p.region = v;
            });
            cached = null;
            refresh();
          },
        ),
      ),
      panel(
        'Tiers',
        ...TIERS.map((t) =>
          el(
            'div',
            { class: 'kv' },
            el(
              'span',
              { class: 'k' },
              el('span', { style: `display:inline-block;width:9px;height:9px;border-radius:2px;background:${t.color};margin-right:8px` }),
              el('b', { style: t.tier === tier.tier ? 'color:var(--accent)' : '' }, t.label),
            ),
            el('span', { class: 'v' }, `${fmt(t.min)} – ${fmt(t.max)} RP`),
          ),
        ),
      ),
    ),
  );

  root.append(
    tabs(
      [
        { id: 'world', label: 'Worldwide' },
        { id: 'region', label: `Region · ${store.profile.region.toUpperCase()}` },
      ],
      scope,
      (id) => {
        scope = id as Scope;
        cached = null;
        refresh();
      },
    ),
  );

  const tableHost = el('div', {});
  root.appendChild(tableHost);

  const paint = (entries: LeaderboardEntry[], live: boolean) => {
    tableHost.replaceChildren(
      panel(
        live ? 'Live standings' : 'Standings (offline sample)',
        !live
          ? el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'The Hoops Elite server is not reachable, so this shows a locally generated ladder with your real position slotted in. Start the server to see live worldwide standings.')
          : null,
        el(
          'table',
          { class: 'stats' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', {}, '#'),
              el('th', {}, 'Player'),
              el('th', {}, 'Region'),
              el('th', {}, 'Rank'),
              el('th', { class: 'num' }, 'RP'),
              el('th', { class: 'num' }, 'W–L'),
              el('th', { class: 'num' }, 'Win %'),
              el('th', { class: 'num' }, 'OVR'),
              el('th', { class: 'num' }, 'Streak'),
            ),
          ),
          el(
            'tbody',
            {},
            ...entries.map((entry) =>
              el(
                'tr',
                { class: entry.userId === store.profile.userId ? 'me' : '' },
                el('td', {}, String(entry.rank)),
                el('td', {}, el('b', {}, entry.displayName)),
                el('td', { class: 'faint' }, entry.region.toUpperCase()),
                el('td', { style: `color:${tierForPoints(entry.rankPoints).color};font-weight:800` }, rankLabel(entry.rankPoints)),
                el('td', { class: 'num' }, fmt(entry.rankPoints)),
                el('td', { class: 'num' }, `${entry.wins}–${entry.losses}`),
                el('td', { class: 'num' }, ratio(entry.wins, Math.max(1, entry.wins + entry.losses))),
                el('td', { class: 'num' }, String(entry.overall)),
                el('td', { class: 'num' }, String(entry.winStreak)),
              ),
            ),
          ),
        ),
      ),
    );
  };

  if (cached && cached.scope === scope) {
    paint(cached.entries, cached.live);
  } else {
    tableHost.appendChild(panel('Standings', el('div', { class: 'empty' }, el('div', { class: 'spinner' }), 'Loading standings…')));
    void net
      .leaderboard(scope)
      .then((entries) => {
        cached = { scope, entries, live: true };
        paint(entries, true);
      })
      .catch(() => {
        const entries = syntheticLadder(scope);
        cached = { scope, entries, live: false };
        paint(entries, false);
      });
  }

  return root;
}

/**
 * Offline fallback ladder. Deterministic from the season so the board is
 * stable between visits, with the local player slotted in at their true rank.
 */
function syntheticLadder(currentScope: Scope): LeaderboardEntry[] {
  const rng = new Rng(hashString(`ladder-${currentScope}-${store.profile.seasonId}`));
  const first = ['Dez', 'Kobi', 'Ari', 'Trell', 'Jules', 'Nico', 'Sav', 'Rook', 'Quan', 'Maro', 'Ren', 'Dax', 'Omari', 'Kai', 'Zeke', 'Rio', 'Levi', 'Sol'];
  const last = ['Vance', 'Okafor', 'Brix', 'Salter', 'Moreau', 'Ibe', 'Kessler', 'Duval', 'Aoki', 'Reyes', 'Bello', 'Traore', 'Osei', 'Carrasco', 'Farrow', 'Nunes'];

  const rows: LeaderboardEntry[] = [];
  for (let i = 0; i < 40; i++) {
    const points = Math.round(4990 - Math.pow(i, 1.32) * 42 - rng.range(0, 60));
    const wins = rng.int(60, 340);
    const losses = Math.round(wins * rng.range(0.45, 0.95));
    rows.push({
      rank: 0,
      userId: `sim-${i}`,
      displayName: `${rng.pick(first)}${rng.pick(last)}`,
      region: currentScope === 'region' ? store.profile.region : REGIONS[rng.int(0, REGIONS.length)],
      rankPoints: Math.max(0, points),
      wins,
      losses,
      overall: rng.int(88, 100),
      winStreak: rng.int(0, 14),
    });
  }

  rows.push({
    rank: 0,
    userId: store.profile.userId,
    displayName: store.player.name,
    region: store.profile.region,
    rankPoints: store.player.rank.points,
    wins: store.player.stats.wins,
    losses: store.player.stats.losses,
    overall: computeOverall(store.player.attributes, store.player.build.position),
    winStreak: store.player.stats.currentWinStreak,
  });

  rows.sort((a, b) => b.rankPoints - a.rankPoints);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
