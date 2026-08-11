import { MIN_RATING, rankTierFor, RANK_TIERS, type RankTier } from '../core/index.ts';
import { el, svg } from './dom.ts';

/**
 * The Overall badge.
 *
 * A crested shield per rank tier, drawn as inline SVG rather than shipped as
 * images: it stays sharp at any size, it themes off the tier colour, and it
 * costs nothing to add a tenth tier later. The laurels are generated from a
 * single blade shape rotated down each side and mirrored, so every badge in the
 * ladder is the same object wearing a different colour.
 *
 * Locked tiers are drawn in the same shape, drained of colour, with the padlock
 * showing — the ladder should read as *a thing you are climbing*, not a list.
 */

const VIEW_W = 140;
const VIEW_H = 152;

/** Unique gradient ids: two badges on one page must not share defs. */
let uid = 0;

/**
 * The shield sits inset from the viewBox edges so the laurels have somewhere to
 * live *outside* it — the whole silhouette of the reference art is shield plus
 * blades, and blades tucked behind the shield read as nothing at all.
 */
const SHIELD = 'M70 10 L114 26 V66 C114 96 94 117 70 140 C46 117 26 96 26 66 V26 Z';
const INNER = 'M70 22 L104 35 V66 C104 90 88 107 70 125 C52 107 36 90 36 66 V35 Z';
const SHINE = 'M70 22 L104 35 V42 L70 29 L36 42 V35 Z';

/** One laurel blade, drawn pointing right from its own origin. */
const BLADE = 'M0 0 L27 -6 L31 2 L4 9 Z';

interface BladePlacement {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/**
 * Blades run down the outside of the shield, shrinking and turning as they go so
 * they hug the silhouette instead of sticking out of it.
 */
const BLADES: BladePlacement[] = Array.from({ length: 5 }, (_, i) => {
  const t = i / 4;
  return {
    x: 31 - t * 2,
    y: 44 + t * 38,
    rotate: 197 + t * 30,
    scale: 1 - t * 0.26,
  };
});

export interface BadgeOptions {
  size?: number;
  /** Draws the padlock and drains the colour. */
  locked?: boolean;
  /** Defaults to the tier for `overall`. */
  tier?: RankTier;
  /** Defaults to the Overall itself. */
  text?: string;
  caption?: string;
  className?: string;
}

export function overallBadge(overall: number, opts: BadgeOptions = {}): HTMLElement {
  const tier = opts.tier ?? rankTierFor(overall);
  const locked = !!opts.locked;
  const size = opts.size ?? 132;
  const id = `bm-badge-${uid++}`;
  // A locked badge keeps its tier colour. The padlock already says "not yet";
  // draining the colour as well just makes the ladder a grey wall to scroll past.
  const face = tier.color;
  const edge = tier.shade;

  const defs = svg(
    'defs',
    {},
    svg(
      'linearGradient',
      { id: `${id}-metal`, x1: '0', y1: '0', x2: '0.4', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': face }),
      svg('stop', { offset: '0.45', 'stop-color': edge }),
      svg('stop', { offset: '1', 'stop-color': face }),
    ),
    svg(
      'linearGradient',
      { id: `${id}-plate`, x1: '0', y1: '0', x2: '0', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': '#1a2030' }),
      svg('stop', { offset: '1', 'stop-color': '#080b12' }),
    ),
    svg(
      'linearGradient',
      { id: `${id}-text`, x1: '0', y1: '0', x2: '0', y2: '1' },
      svg('stop', { offset: '0', 'stop-color': locked ? '#c8d2e4' : '#ffffff' }),
      svg('stop', { offset: '1', 'stop-color': face }),
    ),
  );

  const laurel = (mirrored: boolean) =>
    svg(
      'g',
      {
        transform: mirrored ? `translate(${VIEW_W} 0) scale(-1 1)` : undefined,
        fill: `url(#${id}-metal)`,
        opacity: locked ? 0.7 : 0.95,
      },
      BLADES.map((blade) =>
        svg('path', {
          d: BLADE,
          transform: `translate(${blade.x} ${blade.y}) rotate(${blade.rotate}) scale(${blade.scale.toFixed(3)})`,
        }),
      ),
    );

  const crest =
    tier.id === 'legend' && !locked
      ? svg('path', { d: 'M70 2 L83 13 L70 22 L57 13 Z', fill: face, opacity: 0.9 })
      : null;

  // Below about 70px the "OVR" caption renders at four or five pixels — noise,
  // not information. Small badges drop it and centre the number instead.
  const compact = size < 70;

  const graphic = svg(
    'svg',
    {
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      width: size,
      height: Math.round((size * VIEW_H) / VIEW_W),
      class: `badge-svg ${locked ? 'locked' : ''}`,
      role: 'img',
      'aria-label': locked ? `${tier.label} badge, locked` : `${tier.label} badge`,
    },
    defs,
    laurel(false),
    laurel(true),
    crest,
    svg('path', { d: SHIELD, fill: `url(#${id}-metal)` }),
    svg('path', { d: INNER, fill: `url(#${id}-plate)` }),
    // A thin highlight down the top-left edge is what makes it read as metal
    // rather than as a flat sticker.
    svg('path', { d: SHINE, fill: '#ffffff', opacity: locked ? 0.07 : 0.14 }),
    svg(
      'text',
      {
        x: 70,
        y: compact ? 80 : 72,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'badge-number',
        fill: `url(#${id}-text)`,
      },
      opts.text ?? String(overall),
    ),
    compact
      ? null
      : svg(
          'text',
          { x: 70, y: 95, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'badge-ovr', fill: face },
          opts.caption ?? 'OVR',
        ),
    locked ? lock(face) : null,
  );

  return el(
    'div',
    {
      class: `badge ${locked ? 'locked' : ''} ${opts.className ?? ''}`,
      style: `--tier:${tier.color};width:${size}px`,
    },
    graphic,
  );
}

function lock(color: string): SVGElement {
  return svg(
    'g',
    { transform: 'translate(70 117)', fill: color },
    svg('rect', { x: -11, y: -3, width: 22, height: 18, rx: 4 }),
    svg('path', { d: 'M-7 -3 V-9 A7 7 0 0 1 7 -9 V-3', fill: 'none', stroke: color, 'stroke-width': 3.4 }),
    svg('circle', { cx: 0, cy: 5, r: 2.6, fill: '#0a0d14' }),
  );
}

/**
 * The full ladder, locked and unlocked.
 *
 * Showing the badges you have not earned is the point: a number on its own is
 * abstract, but "three more Overall to Bronze" is a target.
 */
export function badgeLadder(overall: number, onSelect?: (tier: RankTier) => void): HTMLElement {
  return el(
    'div',
    { class: 'badge-ladder' },
    RANK_TIERS.map((tier) => {
      const unlocked = overall >= tier.min;
      const node = overallBadge(tier.min, {
        size: 72,
        tier,
        locked: !unlocked,
        text: String(Math.max(MIN_RATING, tier.min)),
        caption: 'OVR',
      });
      return el(
        onSelect ? 'button' : 'div',
        {
          class: `ladder-item ${unlocked ? 'on' : ''}`,
          onclick: onSelect ? () => onSelect(tier) : undefined,
          'aria-label': `${tier.label}, ${unlocked ? 'earned' : `needs ${tier.min} Overall`}`,
        },
        node,
        el('span', { class: 'ladder-label', style: `color:${unlocked ? tier.color : 'var(--text-faint)'}` }, tier.label),
      );
    }),
  );
}
