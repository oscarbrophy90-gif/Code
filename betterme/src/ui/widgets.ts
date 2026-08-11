import { ATTRIBUTE_KEYS, ATTRIBUTE_META, rankTierFor, type AttributeKey, type Attributes, type Tier } from '../core/index.ts';
import { el, svg } from './dom.ts';

/** Shared chart and card pieces. All hand-rolled SVG — no chart library, no bundle cost. */

/** The Overall ring: the number the whole app is about. */
export function overallRing(overall: number, opts: { size?: number; label?: string; delta?: number } = {}): HTMLElement {
  const size = opts.size ?? 132;
  const stroke = Math.max(6, Math.round(size * 0.075));
  const radius = size / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const tier = rankTierFor(overall);
  // The ring is filled against 99, not against the tier — you can always see how
  // much of the whole game is left.
  const fraction = Math.max(0, Math.min(1, overall / 99));

  const ring = svg(
    'svg',
    { class: 'ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' },
    svg('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': stroke }),
    svg('circle', {
      cx: size / 2,
      cy: size / 2,
      r: radius,
      fill: 'none',
      stroke: tier.color,
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': `${circumference * fraction} ${circumference}`,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
      class: 'ring-fill',
    }),
  );

  const value = el('b', { class: 'ring-value', style: `font-size:${Math.round(size * 0.34)}px` }, String(overall));
  return el(
    'div',
    { class: 'ring-wrap', style: `width:${size}px;height:${size}px` },
    ring,
    el(
      'div',
      { class: 'ring-inner' },
      value,
      el('span', { class: 'ring-label' }, opts.label ?? 'OVERALL'),
      opts.delta ? el('span', { class: `ring-delta ${opts.delta > 0 ? 'up' : 'down'}` }, `${opts.delta > 0 ? '▲' : '▼'} ${Math.abs(opts.delta)}`) : null,
    ),
  );
}

/** Nine-axis radar — the shape of a person, at a glance. */
export function attributeRadar(attributes: Attributes, opts: { size?: number; compare?: Attributes } = {}): HTMLElement {
  const size = opts.size ?? 240;
  const center = size / 2;
  const radius = center - 30;
  // The axis labels sit outside the polygon, and the left/right ones are the
  // widest words on the chart. The viewBox is stretched sideways so "Education"
  // and "Discipline" have somewhere to go instead of being sliced off.
  const gutter = 58;
  const keys = ATTRIBUTE_KEYS;
  const step = (Math.PI * 2) / keys.length;

  const point = (index: number, value: number) => {
    // Ratings live in 25..99; scaling from 20 keeps low ratings visible instead
    // of collapsing the polygon into a dot.
    const t = Math.max(0, Math.min(1, (value - 20) / 79));
    const angle = -Math.PI / 2 + index * step;
    return [center + Math.cos(angle) * radius * t, center + Math.sin(angle) * radius * t];
  };

  const polygon = (values: Attributes) => keys.map((key, i) => point(i, values[key]).join(',')).join(' ');

  const grid = [0.25, 0.5, 0.75, 1].map((level) =>
    svg('polygon', {
      points: keys
        .map((_, i) => {
          const angle = -Math.PI / 2 + i * step;
          return `${center + Math.cos(angle) * radius * level},${center + Math.sin(angle) * radius * level}`;
        })
        .join(' '),
      fill: 'none',
      stroke: 'rgba(255,255,255,.07)',
      'stroke-width': 1,
    }),
  );

  const labels = keys.map((key, i) => {
    const angle = -Math.PI / 2 + i * step;
    const x = center + Math.cos(angle) * (radius + 14);
    const y = center + Math.sin(angle) * (radius + 14);
    return svg(
      'text',
      {
        x,
        y,
        'text-anchor': Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end',
        'dominant-baseline': 'middle',
        class: 'radar-label',
        fill: ATTRIBUTE_META[key].accent,
      },
      ATTRIBUTE_META[key].short,
    );
  });

  return el(
    'div',
    { class: 'radar' },
    svg(
      'svg',
      {
        viewBox: `${-gutter} 0 ${size + gutter * 2} ${size}`,
        width: '100%',
        role: 'img',
        'aria-label': 'Attribute radar',
      },
      ...grid,
      opts.compare
        ? svg('polygon', { points: polygon(opts.compare), fill: 'rgba(255,255,255,.05)', stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1, 'stroke-dasharray': '4 4' })
        : null,
      svg('polygon', { points: polygon(attributes), fill: 'rgba(62,240,122,.16)', stroke: '#3ef07a', 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'radar-shape' }),
      ...labels,
    ),
  );
}

export function attributeRow(
  key: AttributeKey,
  rating: number,
  opts: { fraction?: number; delta?: number; focus?: boolean; onClick?: () => void } = {},
): HTMLElement {
  const meta = ATTRIBUTE_META[key];
  const fill = el('i', { style: `width:${Math.max(2, Math.min(100, ((rating - 20) / 79) * 100))}%;background:${meta.accent}` });
  const node = el(
    opts.onClick ? 'button' : 'div',
    { class: `attr-row ${opts.focus ? 'focus' : ''}`, onclick: opts.onClick },
    el('span', { class: 'attr-icon' }, meta.icon),
    el(
      'span',
      { class: 'attr-body' },
      el(
        'span',
        { class: 'attr-head' },
        el('span', { class: 'attr-name' }, meta.label, opts.focus ? el('em', { class: 'goal-pip', title: 'Focus area' }, 'GOAL') : null),
        el('span', { class: 'attr-value' }, String(rating), opts.delta ? el('em', { class: 'up' }, ` +${opts.delta}`) : null),
      ),
      el('span', { class: 'bar thin' }, fill),
      opts.fraction !== undefined ? el('span', { class: 'attr-next' }, `${Math.round(opts.fraction * 100)}% to ${rating + 1}`) : null,
    ),
  );
  return node;
}

/** Daily XP bars for the last N days. */
export function xpChart(data: { date: string; xp: number; lockedIn: boolean }[]): HTMLElement {
  const max = Math.max(100, ...data.map((d) => d.xp));
  return el(
    'div',
    { class: 'xp-chart' },
    data.map((d) =>
      el(
        'div',
        { class: 'xp-col', title: `${d.date}: ${d.xp} XP` },
        el('i', { class: d.lockedIn ? 'on' : '', style: `height:${Math.max(2, (d.xp / max) * 100)}%` }),
      ),
    ),
  );
}

/** Overall over time. Flat lines are honest — plateaus are part of it. */
export function overallChart(data: { date: string; overall: number }[], height = 120): HTMLElement {
  if (data.length < 2) return el('div', { class: 'chart-empty dim' }, 'A few more days and your Overall curve shows up here.');
  const width = 320;
  const values = data.map((d) => d.overall);
  const min = Math.max(0, Math.min(...values) - 2);
  const max = Math.max(...values) + 2;
  const span = Math.max(1, max - min);
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * height;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return el(
    'div',
    { class: 'line-chart' },
    svg(
      'svg',
      { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', width: '100%', height, role: 'img', 'aria-label': 'Overall over time' },
      svg('path', { d: area, fill: 'rgba(62,240,122,.12)' }),
      svg('path', { d: line, fill: 'none', stroke: '#3ef07a', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    ),
    el('div', { class: 'chart-axis dim' }, el('span', {}, String(Math.round(min))), el('span', {}, String(Math.round(max)))),
  );
}

const TIER_LABEL: Record<Tier, string> = { light: 'Light', steady: 'Steady', hard: 'Hard', elite: 'Elite' };

export function tierChip(tier: Tier): HTMLElement {
  return el('span', { class: `chip tier-${tier}` }, TIER_LABEL[tier]);
}

export function statTile(label: string, value: string | number, sub?: string): HTMLElement {
  return el(
    'div',
    { class: 'stat-tile' },
    el('b', {}, String(value)),
    el('span', {}, label),
    sub ? el('em', { class: 'dim' }, sub) : null,
  );
}

export function streakFlame(streak: number, shields: number): HTMLElement {
  return el(
    'div',
    { class: `streak ${streak > 0 ? 'on' : ''}`, title: shields > 0 ? `${shields} streak shield${shields === 1 ? '' : 's'} banked` : 'Lock in a day to start a streak' },
    el('span', { class: 'flame' }, '🔥'),
    el('b', {}, String(streak)),
    shields > 0 ? el('span', { class: 'shields' }, '🛡'.repeat(Math.min(3, shields))) : null,
  );
}
