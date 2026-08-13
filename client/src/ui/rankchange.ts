import { grandChampLabel, onlineRank } from '@hoops/shared';

import { boardPositionOf } from '../state/board.ts';

import { audio } from '../engine/audio.ts';
import { captureSceneKeys, el } from './dom.ts';
import { drawRankBadge } from './rankbadge.ts';

/** How long the whole thing runs, in milliseconds. */
const DURATION = 3200;

/**
 * The rank change, played after the match.
 *
 * It only appears when the rank actually moved, which is the whole reason it
 * lands: five wins earn it, and a screen you see after every game is a screen
 * you skip after the second one. The old badge is shown, breaks apart, and the
 * new one is struck in its place — one continuous shot rather than a before and
 * after, because a promotion should feel like the thing transforming.
 *
 * Demotions play the same beat in reverse and are quieter. Losing a division is
 * information the player needs; it does not need a fanfare.
 */
export function playRankChange(
  host: HTMLElement,
  before: number,
  after: number,
  accountId: string,
): Promise<void> {
  return new Promise((resolve) => {
    const promoted = after > before;
    const fromRank = onlineRank(before);
    const toRank = onlineRank(after);
    const placement = boardPositionOf(accountId) ?? 1;
    const toLabel = toRank.grandChamp ? grandChampLabel(placement) : toRank.label;
    const fromLabel = fromRank.grandChamp ? grandChampLabel(placement) : fromRank.label;
    // A new tier is a bigger moment than a new division inside one.
    const newTier = fromRank.tier.id !== toRank.tier.id;

    const canvas = el('canvas', { class: 'rankchange-canvas' }) as HTMLCanvasElement;
    const kicker = el(
      'div',
      { class: `rankchange-kicker ${promoted ? 'up' : 'down'}` },
      promoted ? (newTier ? 'NEW TIER' : 'RANK UP') : 'RANK DOWN',
    );
    const label = el('div', { class: 'rankchange-label', style: `color:${toRank.tier.color}` }, fromLabel);
    const sub = el('div', { class: 'rankchange-sub' }, '');

    let done = false;
    const stage = el(
      'div',
      { class: `rankchange ${promoted ? 'up' : 'down'}` },
      el('div', { class: 'rankchange-card' }, kicker, canvas, label, sub, el('div', { class: 'rankchange-skip' }, 'Click to continue')),
    );

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      releaseKeys();
      stage.classList.add('out');
      window.setTimeout(() => {
        stage.remove();
        resolve();
      }, 240);
    };
    const releaseKeys = captureSceneKeys(() => finish());
    stage.addEventListener('click', finish);
    host.appendChild(stage);

    // Sized after it is in the document, so the canvas has a layout to read.
    const started = performance.now();
    let raf = 0;
    let struck = false;

    const draw = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - started) / DURATION);
      const ctx = canvas.getContext('2d');
      if (ctx) drawFrame(ctx, canvas, before, after, placement, t, promoted);

      // The label flips at the moment the new badge lands, not before it.
      if (t >= 0.52 && label.textContent !== toLabel) {
        label.textContent = toLabel;
        label.classList.add('struck');
        sub.textContent = promoted
          ? newTier
            ? `Welcome to ${toRank.tier.name}`
            : `${toRank.needed - toRank.progress} RP to ${nextLabelFor(after)}`
          : `${toRank.needed - toRank.progress} RP to climb back`;
      }
      if (!struck && t >= 0.5) {
        struck = true;
        audio.play(promoted ? 'levelUp' : 'rim');
      }

      if (t >= 1) {
        // Held on screen until dismissed: the number is the point of the mode.
        raf = requestAnimationFrame(draw);
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    audio.play('ui', 0.9);
  });
}

function nextLabelFor(points: number): string {
  const next = onlineRank(Math.floor(points / 100) * 100 + 100);
  return next.grandChamp ? 'Grand Champ' : next.label;
}

/**
 * One frame of the transformation.
 *
 * The old badge shrinks and spins away while the new one comes up through it,
 * with a burst of shards at the swap. Both are drawn by the same routine the
 * Locker uses, so the badge you are shown is the badge you keep.
 */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  before: number,
  after: number,
  placement: number,
  t: number,
  promoted: boolean,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 260;
  const h = canvas.clientHeight || 300;
  if (canvas.width !== Math.floor(w * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const badgeW = w * 0.56;
  const badgeH = h * 0.72;
  const swap = 0.5;

  // A scratch canvas per badge, because drawRankBadge sizes itself off a
  // canvas's layout box and this one is being transformed under it.
  const plate = (wins: number, scale: number, alpha: number, spin: number) => {
    if (alpha <= 0.01 || scale <= 0.01) return;
    const off = document.createElement('canvas');
    off.width = Math.max(2, Math.floor(badgeW));
    off.height = Math.max(2, Math.floor(badgeH));
    Object.assign(off.style, { width: `${badgeW}px`, height: `${badgeH}px` });
    // The helper reads clientWidth, which is 0 for a detached node, so the
    // fallback path in drawRankBadge is what sizes it — give it the numbers.
    Object.defineProperty(off, 'clientWidth', { value: badgeW });
    Object.defineProperty(off, 'clientHeight', { value: badgeH });
    drawRankBadge(off, wins, placement);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.scale(scale, scale);
    ctx.drawImage(off, -badgeW / 2, -badgeH / 2, badgeW, badgeH);
    ctx.restore();
  };

  if (t < swap) {
    // The old rank, falling away.
    const k = t / swap;
    const eased = k * k;
    plate(before, 1 - eased * 0.55, 1 - eased, (promoted ? -1 : 1) * eased * 0.9);
  } else {
    // The new one, struck into place with an overshoot.
    const k = (t - swap) / (1 - swap);
    const settle = 1 - Math.pow(1 - Math.min(1, k * 1.9), 3);
    const overshoot = 1 + Math.sin(Math.min(1, k * 2.4) * Math.PI) * (promoted ? 0.22 : 0.06);
    plate(after, Math.max(0.01, settle * overshoot), Math.min(1, k * 3), 0);
  }

  // Shards at the swap, thrown outward. Only on a promotion — a demotion that
  // showers you in light is a demotion that reads as a reward.
  if (promoted) {
    const burst = Math.max(0, 1 - Math.abs(t - swap) * 6);
    if (burst > 0) {
      const rank = onlineRank(after);
      ctx.save();
      ctx.globalAlpha = burst * 0.9;
      ctx.strokeStyle = rank.tier.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const spread = (1 - burst) * w * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * spread, cy + Math.sin(a) * spread * 0.85);
        ctx.lineTo(cx + Math.cos(a) * (spread + 16), cy + Math.sin(a) * (spread + 16) * 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
