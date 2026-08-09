import {
  DIVISIONS_PER_TIER,
  ONLINE_TIERS,
  WINS_PER_DIVISION,
  grandChampLabel,
  onlineRank,
  type OnlineRecord,
} from '@hoops/shared';

import { el } from './dom.ts';

/**
 * The online rank, drawn as a badge.
 *
 * The shield is a canvas rather than styled markup because the shape and the
 * division numeral want to sit together and scale as one thing — at the size it
 * appears next to MyPlayer, a bordered div with a number in it reads as a form
 * field rather than a rank.
 */
export function drawRankBadge(canvas: HTMLCanvasElement, wins: number, placement: number | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 96;
  const h = canvas.clientHeight || 108;
  if (canvas.width !== Math.floor(w * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rank = onlineRank(wins);
  const { color, shade } = rank.tier;
  const cx = w / 2;

  // Shield.
  const top = h * 0.08;
  const bottom = h * 0.94;
  const half = w * 0.36;
  ctx.beginPath();
  ctx.moveTo(cx - half, top);
  ctx.lineTo(cx + half, top);
  ctx.lineTo(cx + half, h * 0.58);
  ctx.quadraticCurveTo(cx + half, h * 0.82, cx, bottom);
  ctx.quadraticCurveTo(cx - half, h * 0.82, cx - half, h * 0.58);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, color);
  grad.addColorStop(1, shade);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.stroke();

  // Inner bevel, so the plate reads as metal rather than a flat swatch.
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.74, top + h * 0.06);
  ctx.lineTo(cx + half * 0.74, top + h * 0.06);
  ctx.lineTo(cx + half * 0.74, h * 0.56);
  ctx.quadraticCurveTo(cx + half * 0.74, h * 0.74, cx, h * 0.84);
  ctx.quadraticCurveTo(cx - half * 0.74, h * 0.74, cx - half * 0.74, h * 0.56);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = Math.max(1, w * 0.015);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (rank.grandChamp) {
    // No numeral at the top: Grand Champ has no divisions, it has a placement.
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = `900 ${w * 0.2}px Inter, system-ui, sans-serif`;
    ctx.fillText('GC', cx, h * 0.44);
    if (placement !== null && placement >= 1) {
      ctx.font = `800 ${w * 0.16}px Inter, system-ui, sans-serif`;
      ctx.fillText(`#${placement}`, cx, h * 0.66);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `900 ${w * 0.42}px Inter, system-ui, sans-serif`;
    ctx.fillText(String(rank.division), cx, h * 0.48);
  }
}

/**
 * The badge plus its label and progress.
 *
 * `compact` drops the progress bar for places that only have room for the rank
 * itself.
 */
export function rankPanel(record: OnlineRecord, compact = false): HTMLElement {
  const rank = onlineRank(record.wins);
  const label = rank.grandChamp ? grandChampLabel(record.placement) : rank.label;

  const canvas = el('canvas', {
    class: 'rank-badge',
    style: compact ? 'width:52px;height:58px' : 'width:88px;height:98px',
  }) as HTMLCanvasElement;
  // The canvas has to be in the document before it has a layout size to read.
  requestAnimationFrame(() => drawRankBadge(canvas, record.wins, record.placement));

  const bits: HTMLElement[] = [
    el('div', { class: 'rank-label', style: `color:${rank.tier.color}` }, label),
  ];

  if (rank.grandChamp) {
    bits.push(
      el(
        'div',
        { class: 'rank-sub' },
        record.placement !== null && record.worldSize > 0
          ? `${record.wins} online wins · ${record.placement} of ${record.worldSize} in the world`
          : `${record.wins} online wins`,
      ),
    );
    if (!compact) {
      bits.push(
        el(
          'div',
          { class: 'rank-hint' },
          'Grand Champ is placed against everyone else. Win more park games and you climb past people.',
        ),
      );
    }
  } else {
    bits.push(el('div', { class: 'rank-sub' }, `${record.wins} online win${record.wins === 1 ? '' : 's'}`));
    if (!compact) {
      const remaining = rank.needed - rank.progress;
      bits.push(
        el(
          'div',
          { class: 'rank-bar' },
          el('div', {
            class: 'rank-bar-fill',
            style: `width:${(rank.progress / rank.needed) * 100}%;background:${rank.tier.color}`,
          }),
        ),
        el(
          'div',
          { class: 'rank-hint' },
          `${remaining} more win${remaining === 1 ? '' : 's'} to rank up · ${rank.progress}/${rank.needed}`,
        ),
      );
    }
  }

  return el('div', { class: `rank-panel ${compact ? 'compact' : ''}` }, canvas, el('div', { class: 'rank-text' }, ...bits));
}

/** The whole ladder, for a "how this works" panel. */
export function ladderStrip(currentWins: number): HTMLElement {
  const here = onlineRank(currentWins);
  return el(
    'div',
    { class: 'ladder-strip' },
    ...ONLINE_TIERS.map((tier) =>
      el(
        'div',
        {
          class: `ladder-tier ${tier.id === here.tier.id ? 'on' : ''}`,
          title:
            tier.id === 'grandchamp'
              ? `Grand Champ — ${DIVISIONS_PER_TIER * WINS_PER_DIVISION * (ONLINE_TIERS.length - 1)} wins, then placed against the world`
              : `${tier.name} 3 · 2 · 1 — ${WINS_PER_DIVISION} wins per division`,
        },
        el('span', { class: 'ladder-dot', style: `background:${tier.color}` }),
        tier.name,
      ),
    ),
  );
}
