import {
  CRATE_ODDS,
  CURRENCY_SHORT,
  RARITY_COLOR,
  crateBand,
  oddsLabel,
  type CrateDef,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import { el, fmt, overlay } from './dom.ts';

/**
 * One loot box, as a card.
 *
 * The same card in the Store and in the Locker — same art, same copy, same
 * shape — because it is the same object and a player should recognise the box
 * they bought when they go to open it. The only thing that changes between the
 * two is the button on the bottom: Buy on the shelf, Open Loot Box once it is
 * yours.
 *
 * The odds are deliberately not on the front. A card that leads with "1 in
 * 5,000" is selling the long shot; the box should sell what is in it, and the
 * numbers should be one click away for anybody who wants them — published in
 * full, never in the way.
 */
export interface CrateCardAction {
  label: string;
  /** the accent style of the button */
  tone: 'primary' | 'plain';
  onClick: () => void;
}

export interface CrateCardOptions {
  /** how many of this crate are sitting unopened, shown as a badge on the art */
  count?: number;
  /** the line above the buttons: a price in the shop, a count in the Locker */
  footer: string;
  /** true when the footer should read as affordable */
  footerHot?: boolean;
  action: CrateCardAction;
}

export function crateCard(crate: CrateDef, opts: CrateCardOptions): HTMLElement {
  const player = store.hasPlayer ? store.player : null;
  const collected = player ? crate.pool.filter((i) => player.unlocked.includes(i.id)).length : 0;
  const count = opts.count ?? 0;

  const art = el('canvas', { class: 'crate-art', width: '300', height: '200' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawCrateArt(art, crate));

  return el(
    'div',
    { class: 'item crate', style: `--c1:${crate.colors[0]};--c2:${crate.colors[1]};--rarity:${crate.colors[1]}` },
    el(
      'div',
      { class: 'crate-art-wrap' },
      art,
      // How many you are holding, on the art rather than in the body, so a
      // stack of five reads at a glance without a second line of text.
      count > 0 ? el('div', { class: 'crate-held' }, `${count}`) : null,
    ),
    el(
      'div',
      { class: 'body' },
      el('div', { class: 'iname' }, crate.name),
      el('div', { class: 'idesc' }, crate.blurb),
      el('div', { class: 'hint', style: 'margin:8px 0 0' }, `${collected} of ${crate.pool.length} collected`),
      el('div', { class: 'foot' }, el('span', { class: opts.footerHot ? 'crate-foot-hot' : '' }, opts.footer)),
      el(
        'div',
        { class: 'crate-actions' },
        el('button', { class: 'btn sm', onclick: () => showOdds(crate) }, 'Preview Odds'),
        el(
          'button',
          {
            class: `btn sm ${opts.action.tone === 'primary' ? 'primary' : ''}`,
            onclick: opts.action.onClick,
          },
          opts.action.label,
        ),
      ),
    ),
  );
}

/**
 * The full odds table for one crate.
 *
 * Both numbers are shown: the chance of the tier, and the chance of any one
 * particular item in it. They are very different — a 75% Common band split
 * across thirty-eight items is a 1.97% chance of the one you actually want —
 * and showing only the first would be the more flattering half of the truth.
 */
export function showOdds(crate: CrateDef): void {
  overlay((close) =>
    el(
      'div',
      { class: 'dialog' },
      el('h3', { style: 'margin:0 0 2px' }, `${crate.name} — odds`),
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 14px' },
        'Every open rolls a tier first, then picks evenly inside it. Nothing is weighted by what you already own, and a duplicate pays coins instead.',
      ),
      el(
        'div',
        { class: 'odds-table' },
        el(
          'div',
          { class: 'odds-head' },
          el('span', {}, 'Tier'),
          el('span', {}, 'Chance'),
          el('span', {}, 'Items'),
          el('span', {}, 'Any one'),
        ),
        ...CRATE_ODDS.map((band) => {
          const count = crateBand(crate, band.rarity).length;
          return el(
            'div',
            { class: 'odds-row', style: `--tint:${RARITY_COLOR[band.rarity]}` },
            el('span', { class: 'odds-tier' }, band.rarity),
            el('span', {}, oddsLabel(band.chance)),
            el('span', {}, `${count}`),
            el('span', { class: 'faint' }, count > 0 ? oddsLabel(band.chance / count) : '—'),
          );
        }),
      ),
      el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' },
        el('button', { class: 'btn', onclick: close }, 'Close')),
    ),
  );
}

/** The price line under a shop crate. */
export function crateFooter(crate: CrateDef): { footer: string; hot: boolean } {
  const coins = store.hasPlayer ? store.player.currency : 0;
  return { footer: `${fmt(crate.price)} ${CURRENCY_SHORT}`, hot: coins >= crate.price };
}

/** A closed box in the crate's own colours, with a glimpse of what is inside. */
export function drawCrateArt(canvas: HTMLCanvasElement, crate: CrateDef): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const [c1, c2] = crate.colors;

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0d1017');
  bg.addColorStop(1, shadeHex(c1, -0.62));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A straightforward axonometric box: a rhombus for the lid, and the two
  // faces you can see hanging off its front corner. Drawn from the four lid
  // corners rather than from eight loose points, so the faces cannot end up
  // disagreeing about where an edge is.
  const cx = w / 2;
  const cy = h * 0.52;
  const half = Math.min(w, h) * 0.42;
  const depth = half * 0.42;
  const tall = half * 0.62;

  const front: [number, number] = [cx, cy + depth];
  const left: [number, number] = [cx - half, cy];
  const back: [number, number] = [cx, cy - depth];
  const right: [number, number] = [cx + half, cy];
  const down = ([x, y]: [number, number]): [number, number] => [x, y + tall];

  const face = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Left face, right face, then the lid on top of both.
  face([left, front, down(front), down(left)], shadeHex(c1, -0.18));
  face([front, right, down(right), down(front)], shadeHex(c1, -0.44));
  face([left, back, right, front], shadeHex(c2, -0.05));

  // The strap that runs over the lid and down both faces.
  const band = half * 0.16;
  ctx.fillStyle = c2;
  ctx.globalAlpha = 0.9;
  face(
    [
      [left[0] + half * 0.5, left[1] + depth * 0.5],
      [left[0] + half * 0.5 + band, left[1] + depth * 0.5 + band * 0.42],
      [right[0] - half * 0.5 + band, right[1] - depth * 0.5 + band * 0.42],
      [right[0] - half * 0.5, right[1] - depth * 0.5],
    ],
    c2,
  );
  ctx.globalAlpha = 0.55;
  face(
    [
      [cx - half * 0.5, cy + depth * 0.5],
      [cx - half * 0.5 + band, cy + depth * 0.5 + band * 0.42],
      [cx - half * 0.5 + band, cy + depth * 0.5 + band * 0.42 + tall],
      [cx - half * 0.5, cy + depth * 0.5 + tall],
    ],
    c2,
  );
  ctx.globalAlpha = 1;

  // Light leaking out of the lid seam, so the box reads as something that opens.
  const seam = ctx.createLinearGradient(left[0], left[1], right[0], right[1]);
  seam.addColorStop(0, 'rgba(255,255,255,0)');
  seam.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  seam.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = seam;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left[0], left[1]);
  ctx.lineTo(front[0], front[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.stroke();

  // A pool of the crate's colour under it, so it is sitting on something.
  const pool = ctx.createRadialGradient(cx, cy + tall + depth, 2, cx, cy + tall + depth, half * 1.3);
  pool.addColorStop(0, `${c2}55`);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, cy, w, h - cy);
}

function shadeHex(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const out = rgb.map((v) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)))),
  );
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

