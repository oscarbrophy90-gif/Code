import {
  grandChampLabel,
  onlineRank,
  DIFFICULTY_LABEL,
  SKIN_TONES,
  TITLE_BY_ID,
  computeOverall,
  formatHeight,
  ratingColor,
  scoutReport,
  type Difficulty,
  type SimPlayerConfig,
} from '@hoops/shared';

import { audio } from '../engine/audio.ts';
import { drawRankBadge } from './rankbadge.ts';
import { captureSceneKeys, el } from './dom.ts';

export interface WalkoutOptions {
  player: SimPlayerConfig;
  opponent: SimPlayerConfig;
  /**
   * Team modes: everyone walking out, you/your lead first. When present the
   * cutscene shows one banner per squad — all three players standing together
   * — instead of two solo cards.
   */
  playerTeam?: SimPlayerConfig[];
  opponentTeam?: SimPlayerConfig[];
  difficulty: Difficulty;
  /** park / court name shown on the title card */
  venue: string;
  /** "Ranked 1v1", "Training", event name — whatever the game is */
  subtitle: string;
  /**
   * The account behind your build: the username on the ladder and the record its
   * rank comes from. Only yours — the opponent is a build, not an account.
   */
  identity?: { username: string; wins: number; losses: number; placement: number | null };
  /** ranked spoils worn on the walkout: an effect on your name, a banner behind you */
  nameEffectId?: string | null;
  bannerId?: string | null;
  /**
   * Hide the difficulty on the title card.
   *
   * Ranked picks your opponent for you, and naming the setting would tell you
   * how hard the game is before you have played a possession of it.
   */
  hideDifficulty?: boolean;
}

/** How long each beat of the cutscene runs, in milliseconds. */
const BEAT = { intro: 1100, card: 3400, versus: 1500 };

/**
 * The pre-game walkout. The opponent is announced first — name, title, overall,
 * position, height and what they are good and bad at — then you, wearing
 * whatever you have equipped. Resolves when the scene is done or skipped.
 */
export function playWalkout(opts: WalkoutOptions): Promise<void> {
  return new Promise((resolve) => {
    const timers: number[] = [];
    let done = false;

    const stage = el('div', { class: 'walkout' });
    const finish = () => {
      if (done) return;
      done = true;
      for (const t of timers) window.clearTimeout(t);
      releaseKeys();
      stage.classList.add('out');
      window.setTimeout(() => {
        stage.remove();
        resolve();
      }, 260);
    };
    const releaseKeys = captureSceneKeys(
      () => finish(),
      (e) => e.key === 'Escape' || e.key === ' ' || e.key === 'Enter',
    );
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    // ------------------------------------------------------------ furniture
    const body = el('div', { class: 'walkout-body' });
    stage.append(
      el('div', { class: 'walkout-floor' }),
      el(
        'div',
        { class: 'walkout-head' },
        el('div', { class: 'walkout-venue' }, opts.venue),
        el(
          'div',
          { class: 'walkout-sub' },
          // An online game has no CPU, so naming a difficulty there would be a
          // lie about who you are playing.
          opts.hideDifficulty ? opts.subtitle : `${opts.subtitle} · ${DIFFICULTY_LABEL[opts.difficulty]}`,
        ),
      ),
      body,
      el('button', { class: 'walkout-skip', onclick: finish }, 'Skip'),
    );
    stage.addEventListener('click', (e) => {
      if (e.target === stage || e.target === body) finish();
    });
    document.body.appendChild(stage);

    // -------------------------------------------------------------- the beats
    const teams = !!(opts.playerTeam?.length && opts.opponentTeam?.length);
    at(BEAT.intro * 0.1, () => {
      body.appendChild(
        teams
          ? teamCard(opts.opponentTeam!, 'right', 'Now entering')
          : entrantCard(opts.opponent, 'right', 'Now entering'),
      );
      audio.play('ui', 0.8);
    });

    const second = BEAT.intro + BEAT.card;
    at(second, () => {
      body.appendChild(
        teams
          ? teamCard(opts.playerTeam!, 'left', 'And their opponents', opts.identity)
          : entrantCard(opts.player, 'left', 'And their opponent', opts.identity, opts.nameEffectId, opts.bannerId),
      );
      audio.play('ui', 1.15);
    });

    const clash = second + BEAT.card;
    at(clash, () => {
      stage.appendChild(el('div', { class: 'walkout-vs' }, 'VS'));
      audio.play('buzzer', 1.1);
    });

    at(clash + BEAT.versus, finish);
  });
}

// --------------------------------------------------------------------- card

/** The class that carries a name effect, or nothing at all. */
function nameEffectClass(id: string | null | undefined): string {
  return id === 'name-gold-rank' ? 'name-gold' : '';
}

/**
 * The banner behind a Grand Champion.
 *
 * Drawn as markup rather than canvas because it sits behind a canvas figure and
 * wants to scale with the card — a second canvas layer would have to track the
 * first one's size for no gain.
 */
function bannerBack(id: string): HTMLElement {
  return el('div', { class: `walkout-banner ${id === 'banner-grandchamp-rank' ? 'gc' : ''}` }, el('span', {}, 'GRAND CHAMPION'));
}

/**
 * One entrant.
 *
 * `identity` is the account behind the build: the username on the ladder and the
 * rank they hold. It only applies to you — the CPU opponent is a build, not an
 * account, so it gets a name and nothing under it.
 */
function entrantCard(
  cfg: SimPlayerConfig,
  side: 'left' | 'right',
  kicker: string,
  identity?: { username: string; wins: number; losses: number; placement: number | null },
  nameEffectId?: string | null,
  bannerId?: string | null,
): HTMLElement {
  const overall = computeOverall(cfg.attrs, cfg.position ?? 'SF');
  const report = scoutReport(cfg.attrs);
  const title = cfg.titleId ? TITLE_BY_ID[cfg.titleId] : undefined;
  const streak = cfg.winStreak && cfg.winStreak >= 2 ? `${cfg.winStreak}-game win streak` : null;

  const figure = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
  drawFigure(figure, cfg, window.innerWidth < 720 ? 132 : 210);

  return el(
    'div',
    { class: `walkout-card ${side}`, style: `--c1:${cfg.jerseyPrimary};--c2:${cfg.jerseySecondary}` },
    el('div', { class: 'walkout-spot' }),
    // The badge stands beside the figure at the same height, because a rank is
    // part of the walkout rather than a statistic filed elsewhere.
    identity ? rankPillar(identity) : null,
    // A banner hangs behind the figure, so it wraps the figure rather than
    // being pinned to the card — the card is a row, and "behind" in a row means
    // behind one item in it, not across all of them.
    bannerId ? el('div', { class: 'walkout-stage' }, bannerBack(bannerId), figure) : figure,
    el(
      'div',
      { class: 'walkout-info' },
      el('div', { class: 'walkout-kicker' }, kicker),
      el('div', { class: 'walkout-name' }, cfg.name),
      // The username sits under the build name: one person, several builds, and
      // the ladder ranks the person.
      identity
        ? el(
            'div',
            // A name effect is a ranked spoil, so it only ever renders for
            // somebody who has one — everybody else gets the plain class.
            { class: `walkout-username ${nameEffectClass(nameEffectId)}` },
            identity.username,
          )
        : null,
      el(
        'div',
        { class: 'walkout-tags' },
        title && title.id !== 'title-none' ? el('span', { class: 'title-tag', style: `--tint:${title.color}` }, title.name) : null,
        streak ? el('span', { class: 'streak-tag' }, streak) : null,
      ),
      el(
        'div',
        { class: 'walkout-vitals' },
        el('span', { class: 'walkout-ovr' }, String(overall), el('em', {}, 'OVR')),
        el('span', {}, cfg.position ?? '—'),
        el('span', {}, formatHeight(cfg.heightIn)),
        el('span', {}, `${cfg.weightLb} lb`),
        cfg.archetype ? el('span', {}, cfg.archetype) : null,
      ),
      el(
        'div',
        { class: 'walkout-scout' },
        scoutColumn('Strengths', report.strengths, 'var(--green)'),
        scoutColumn('Weaknesses', report.weaknesses, 'var(--red)'),
      ),
      cfg.gear && cfg.gear.length > 0
        ? el('div', { class: 'walkout-gear' }, ...cfg.gear.map((g) => el('span', { class: 'gear-chip' }, g)))
        : null,
    ),
  );
}

/**
 * One whole squad on one banner: three figures shoulder to shoulder, drawn at
 * their true relative heights — the 7'4" centre towers over the 6'3" guard
 * because the canvas is sized off the same inches the game plays with — with
 * name, position and height under each.
 */
function teamCard(
  team: SimPlayerConfig[],
  side: 'left' | 'right',
  kicker: string,
  identity?: { username: string; wins: number; losses: number; placement: number | null },
): HTMLElement {
  const lead = team[0];
  const base = window.innerWidth < 720 ? 118 : 190;

  const figures = el(
    'div',
    { class: 'walkout-squad' },
    ...team.map((cfg) => {
      const canvas = el('canvas', { class: 'walkout-figure' }) as HTMLCanvasElement;
      // One shared frame; drawFigure scales the body inside it by true height,
      // so the squad reads like a real team photo.
      drawFigure(canvas, cfg, base);
      const overall = computeOverall(cfg.attrs, cfg.position ?? 'SF');
      return el(
        'div',
        { class: 'walkout-squad-slot' },
        canvas,
        el('div', { class: 'walkout-squad-name' }, cfg.name),
        el(
          'div',
          { class: 'walkout-squad-line' },
          `${cfg.position ?? '—'} · ${formatHeight(cfg.heightIn)} · ${overall} OVR`,
        ),
      );
    }),
  );

  return el(
    'div',
    { class: `walkout-card team ${side}`, style: `--c1:${lead.jerseyPrimary};--c2:${lead.jerseySecondary}` },
    el('div', { class: 'walkout-spot' }),
    figures,
    el(
      'div',
      { class: 'walkout-info' },
      el('div', { class: 'walkout-kicker' }, kicker),
      el('div', { class: 'walkout-name' }, `${lead.name} ×3`),
      identity ? el('div', { class: 'walkout-username' }, identity.username) : null,
      el(
        'div',
        { class: 'walkout-vitals' },
        el('span', {}, '3v3 Squad'),
        lead.archetype ? el('span', {}, `Led by the ${lead.archetype}`) : null,
      ),
    ),
  );
}

/**
 * The rank shield, standing next to the player at figure height.
 *
 * Sized off the same number the figure uses so the two always match, whatever
 * the viewport does.
 */
function rankPillar(identity: { username: string; wins: number; losses: number; placement: number | null }): HTMLElement {
  const size = window.innerWidth < 720 ? 132 : 210;
  const played = identity.wins + identity.losses > 0;
  const placement = identity.placement;
  const rank = onlineRank(identity.wins);
  const label = rank.grandChamp ? grandChampLabel(placement) : rank.label;

  const badge = el('canvas', {
    class: 'walkout-badge',
    style: `width:${Math.round(size * 0.62)}px;height:${size}px`,
  }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawRankBadge(badge, identity.wins, placement));

  return el(
    'div',
    { class: 'walkout-rank' },
    badge,
    el('div', { class: 'walkout-rank-label', style: `color:${rank.tier.color}` }, played ? label : 'Unranked'),
  );
}

function scoutColumn(heading: string, lines: { label: string; rating: number }[], accent: string): HTMLElement {
  return el(
    'div',
    {},
    el('div', { class: 'walkout-scout-head', style: `color:${accent}` }, heading),
    ...lines.map((l) =>
      el(
        'div',
        { class: 'walkout-scout-line' },
        el('span', {}, l.label),
        el('b', { style: `color:${ratingColor(l.rating)}` }, String(l.rating)),
      ),
    ),
  );
}

// ------------------------------------------------------------------- figure

/**
 * A full-body silhouette built from the player's own numbers — taller builds
 * are drawn taller and heavier builds wider, so the walkout actually looks
 * like the build you made.
 */
export function drawFigure(canvas: HTMLCanvasElement, cfg: SimPlayerConfig, height = 200): void {
  const width = Math.round(height * 0.5);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const skin = SKIN_TONES[cfg.skinTone] ?? SKIN_TONES[3];
  // True proportion: the drawn height IS the listed height. A 7'4" frame next
  // to a 6'6" one is 13% taller on screen because it is 13% taller in inches —
  // the old mapping squeezed that to a third of the real difference, which is
  // why every walkout looked like a height chart with the numbers filed off.
  const fill = 0.97 * Math.min(1, cfg.heightIn / 89);
  const bulk = 0.85 + Math.max(0, Math.min(1, (cfg.weightLb - 155) / 175)) * 0.42;

  const cx = width / 2;
  const top = height * (1 - fill);
  const span = height - top;
  const headR = span * 0.075;
  const shoulderY = top + headR * 2.35;
  const hipY = top + span * 0.5;
  const kneeY = top + span * 0.74;
  const footY = height - span * 0.02;
  const shoulderW = span * 0.115 * bulk;

  // Shadow on the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx, footY + 3, shoulderW * 1.5, span * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs.
  ctx.strokeStyle = skin;
  ctx.lineWidth = span * 0.045 * bulk;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * shoulderW * 0.42, hipY);
    ctx.lineTo(cx + dir * shoulderW * 0.55, kneeY);
    ctx.lineTo(cx + dir * shoulderW * (dir < 0 ? 0.75 : 0.45), footY);
    ctx.stroke();
  }

  // Shoes.
  ctx.strokeStyle = cfg.jerseySecondary;
  ctx.lineWidth = span * 0.03;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * shoulderW * (dir < 0 ? 0.75 : 0.45), footY);
    ctx.lineTo(cx + dir * shoulderW * (dir < 0 ? 1.15 : 0.85), footY);
    ctx.stroke();
  }

  // Shorts.
  ctx.fillStyle = shadeHex(cfg.jerseyPrimary, -0.35);
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW * 0.72, hipY - span * 0.1);
  ctx.lineTo(cx + shoulderW * 0.72, hipY - span * 0.1);
  ctx.lineTo(cx + shoulderW * 0.66, hipY + span * 0.06);
  ctx.lineTo(cx - shoulderW * 0.66, hipY + span * 0.06);
  ctx.closePath();
  ctx.fill();

  // Jersey.
  const grad = ctx.createLinearGradient(cx - shoulderW, shoulderY, cx + shoulderW, hipY);
  grad.addColorStop(0, cfg.jerseyPrimary);
  grad.addColorStop(1, shadeHex(cfg.jerseyPrimary, -0.28));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY - span * 0.02, cx + shoulderW, shoulderY);
  ctx.lineTo(cx + shoulderW * 0.78, hipY - span * 0.08);
  ctx.lineTo(cx - shoulderW * 0.78, hipY - span * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = cfg.jerseySecondary;
  ctx.lineWidth = span * 0.008;
  ctx.stroke();

  // Arms hanging at the sides.
  ctx.strokeStyle = skin;
  ctx.lineWidth = span * 0.034 * bulk;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * shoulderW * 0.94, shoulderY + span * 0.01);
    ctx.quadraticCurveTo(cx + dir * shoulderW * 1.3, hipY - span * 0.1, cx + dir * shoulderW * 1.05, hipY + span * 0.04);
    ctx.stroke();
  }

  // Neck and head.
  ctx.fillStyle = shadeHex(skin, -0.2);
  ctx.fillRect(cx - headR * 0.34, shoulderY - headR * 0.9, headR * 0.68, headR * 1.1);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, top + headR * 1.1, headR * 0.88, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1310';
  ctx.beginPath();
  ctx.ellipse(cx, top + headR * 0.82, headR * 0.9, headR * 0.62, 0, Math.PI, Math.PI * 2);
  ctx.fill();
}

function shadeHex(hex: string, amount: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return hex;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
