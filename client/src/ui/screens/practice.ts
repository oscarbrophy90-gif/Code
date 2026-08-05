import {
  DRILLS,
  MEDAL_COLOR,
  ATTRIBUTE_META,
  drillMedal,
  drillReward,
  generateOpponent,
  hashString,
  SHOOT_AROUND,
  type DrillDef,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate, type RouteParams } from '../../main.ts';
import { el, fmt, panel } from '../dom.ts';
import { startMatch } from '../session.ts';

export function renderPractice(_params: RouteParams): HTMLElement {
  const player = store.player;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Practice Gym'),
    el(
      'p',
      { class: 'page-sub' },
      'An empty gym. Nothing here counts against your record and nothing here can be lost — come and get your shot right, or run a drill for Coins and XP.',
    ),

    el(
      'div',
      { class: 'split' },

      // ------------------------------------------------------- shoot-around
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Shoot around',
          el(
            'p',
            { class: 'hint', style: 'margin:0 0 12px' },
            'Just you, a ball and a rim. No defender, no shot clock, no score. Rebound your own misses and shoot from wherever you want until you leave.',
          ),
          el(
            'div',
            { class: 'kv' },
            el('span', { class: 'k' }, 'Defender'),
            el('span', { class: 'v' }, 'None'),
          ),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Shot clock'), el('span', { class: 'v' }, 'Off')),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Rewards'), el('span', { class: 'v' }, 'None — it is a shoot-around')),
          el(
            'button',
            { class: 'btn primary block xl', style: 'margin-top:14px', onclick: startShootAround },
            'Enter the gym',
          ),
          el(
            'div',
            { class: 'hint', style: 'margin-top:8px' },
            'Leave whenever you like — Escape on a keyboard, the pause button top right on a touchscreen, then End drill.',
          ),
        ),

        panel(
          'Why drill',
          el(
            'p',
            { class: 'hint', style: 'margin:0' },
            'Drills are the fastest Coins in the game per minute if you are good at them, and the medal tiers are set high enough that gold means something. Your best run on each drill is saved.',
          ),
        ),
      ),

      // ------------------------------------------------------ training skills
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          'Training Skills',
          el(
            'p',
            { class: 'hint', style: 'margin:0 0 12px' },
            'Timed drills. Land as many reps as you can before the clock runs out — every rep pays, and each medal pays a bonus on top.',
          ),
          el('div', { class: 'drill-grid' }, ...DRILLS.map((d) => renderDrill(d, player.drillBests[d.id] ?? 0))),
        ),
      ),
    ),
  );
}

function renderDrill(drill: DrillDef, best: number): HTMLElement {
  const medal = drillMedal(drill, best);
  const goldPay = drillReward(drill, drill.tiers[2]);

  return el(
    'div',
    { class: 'drill-card', style: `--tint:${drill.color}` },
    el(
      'div',
      { class: 'drill-card-head' },
      el('span', { class: 'drill-card-name' }, drill.name),
      best > 0
        ? el('span', { class: 'drill-medal', style: `color:${MEDAL_COLOR[medal]}` }, medal === 'none' ? `Best ${best}` : `${medal} · ${best}`)
        : el('span', { class: 'faint', style: 'font-size:11px' }, 'Not run'),
    ),
    el('div', { class: 'drill-card-blurb' }, drill.blurb),
    el('div', { class: 'drill-card-goal' }, drill.goal),
    el(
      'div',
      { class: 'drill-card-meta' },
      el('span', {}, `${drill.durationSeconds}s`),
      el('span', {}, `Trains ${drill.trains.map((k) => ATTRIBUTE_META[k].label).join(', ')}`),
    ),
    el(
      'div',
      { class: 'drill-tiers' },
      ...(['bronze', 'silver', 'gold'] as const).map((m, i) =>
        el(
          'span',
          { class: `drill-tier ${best >= drill.tiers[i] ? 'hit' : ''}`, style: `--m:${MEDAL_COLOR[m]}` },
          `${m} ${drill.tiers[i]}`,
        ),
      ),
    ),
    el(
      'div',
      { class: 'row', style: 'margin-top:10px' },
      el('button', { class: 'btn primary sm', onclick: () => startDrill(drill) }, 'Start drill'),
      el('span', { class: 'faint', style: 'font-size:11px' }, `Gold pays ${fmt(goldPay.currency)} Coins`),
    ),
  );
}

// ------------------------------------------------------------------- launchers

/** A gym with nobody in it: no defender, no clock, no score to chase. */
function startShootAround(): void {
  const dummy = generateOpponent(60, hashString(`gym-${Date.now()}`));
  dummy.name = 'Ball Rack';
  startMatch({
    opponent: dummy,
    difficulty: 'rookie',
    parkId: store.player.loadout.courtId === 'court-sand' ? 'beach' : 'downtown',
    playlist: 'private',
    config: {
      targetScore: 999, maxScore: 999, shotClock: 999, winBy: 1,
      turnoverOnMiss: false, makeItTakeIt: true,
      // No checking in and no chasing caroms — you shoot, you get it back.
      manualCheck: false, instantInbound: true,
    },
    eventName: 'Shoot Around',
    practice: true,
    drill: SHOOT_AROUND,
  });
}

function startDrill(drill: DrillDef): void {
  const defensive = drill.mode === 'takeaway' || drill.mode === 'stops';
  // Defensive drills need a CPU worth guarding, so it is built to your level.
  const opponent = generateOpponent(
    defensive ? Math.max(60, Math.min(99, store.overall())) : 60,
    hashString(`${drill.id}-${Date.now()}`),
  );
  startMatch({
    opponent,
    difficulty: defensive ? 'pro' : 'rookie',
    parkId: 'downtown',
    playlist: 'private',
    config: {
      targetScore: 999,
      maxScore: 999,
      shotClock: defensive ? 14 : 999,
      winBy: 1,
      turnoverOnMiss: defensive,
      makeItTakeIt: !defensive,
      // Drills never stop for a check, and the shooting drills hand the ball
      // straight back so every second of the clock is a rep.
      manualCheck: false,
      instantInbound: !defensive,
    },
    eventName: drill.name,
    practice: true,
    drill,
  });
}

export { navigate };
