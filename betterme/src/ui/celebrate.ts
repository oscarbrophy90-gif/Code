import {
  ATTRIBUTE_META,
  levelTitle,
  rankTierFor,
  TIER_COLORS,
  type Achievement,
  type CompletionResult,
  type Milestone,
} from '../core/index.ts';
import { countUp, el, overlay, prefersReducedMotion, toast, toastHost } from './dom.ts';
import { overallRing } from './widgets.ts';

/**
 * The reward layer.
 *
 * Rule of thumb used throughout: the size of the celebration matches the size
 * of the thing. Ticking a task is a toast; a rating point is a small flash; a
 * level, a milestone or an Overall increase takes the whole screen. If
 * everything is a party, nothing is.
 *
 * Scenes queue rather than stack, so finishing one activity that triggers a
 * level *and* a milestone *and* two badges plays them one at a time.
 */

type Scene = () => Promise<void>;

const queue: Scene[] = [];
let playing = false;

function enqueue(scene: Scene): void {
  queue.push(scene);
  void drain();
}

async function drain(): Promise<void> {
  if (playing) return;
  playing = true;
  while (queue.length > 0) {
    const scene = queue.shift();
    if (scene) await scene();
  }
  playing = false;
}

function confetti(host: HTMLElement, color: string): void {
  if (prefersReducedMotion()) return;
  const layer = el('div', { class: 'confetti' });
  for (let i = 0; i < 26; i++) {
    layer.appendChild(
      el('i', {
        style: `left:${Math.random() * 100}%;background:${i % 3 === 0 ? color : i % 3 === 1 ? '#ffffff' : '#ffc53d'};animation-delay:${Math.random() * 0.5}s;transform:rotate(${Math.random() * 360}deg)`,
      }),
    );
  }
  host.appendChild(layer);
}

/* ------------------------------------------------------------------ *
 * Scenes
 * ------------------------------------------------------------------ */

export function levelUpScene(level: number, xpTotal: number): void {
  enqueue(
    () =>
      new Promise((resolve) => {
        const close = overlay(
          (dismiss) => {
            const body = el(
              'div',
              { class: 'scene level-up' },
              el('span', { class: 'scene-kicker' }, 'LEVEL UP'),
              el('div', { class: 'level-badge' }, el('b', {}, String(level))),
              el('h2', {}, levelTitle(level)),
              el('p', { class: 'dim' }, `Level ${level}. ${xpTotal.toLocaleString('en-US')} XP of real work banked.`),
              el('button', { class: 'btn primary wide', onclick: dismiss }, 'Keep going'),
            );
            confetti(body, '#ffc53d');
            return body;
          },
          { className: 'scene-overlay' },
        );
        setTimeout(() => {
          close();
          resolve();
        }, 6000);
      }),
  );
}

export function overallUpScene(from: number, to: number): void {
  enqueue(
    () =>
      new Promise((resolve) => {
        const tier = rankTierFor(to);
        const crossedTier = rankTierFor(from).id !== tier.id;
        const close = overlay(
          (dismiss) => {
            const ring = overallRing(to, { size: 148 });
            const value = ring.querySelector('.ring-value');
            if (value instanceof HTMLElement) countUp(value, from, to, 900);
            const body = el(
              'div',
              { class: 'scene overall-up' },
              el('span', { class: 'scene-kicker' }, crossedTier ? 'NEW TIER' : 'OVERALL UP'),
              ring,
              el('h2', {}, crossedTier ? tier.label : `Overall ${to}`),
              el('p', { class: 'dim' }, crossedTier ? tier.blurb : `Up from ${from}. That is your real life moving.`),
              el('button', { class: 'btn primary wide', onclick: dismiss }, 'Nice'),
            );
            if (crossedTier) confetti(body, tier.color);
            return body;
          },
          { className: 'scene-overlay' },
        );
        setTimeout(() => {
          close();
          resolve();
        }, 6000);
      }),
  );
}

export function milestoneScene(milestone: Milestone): void {
  enqueue(
    () =>
      new Promise((resolve) => {
        const close = overlay(
          (dismiss) => {
            const body = el(
              'div',
              { class: 'scene milestone' },
              el('span', { class: 'scene-kicker' }, 'MILESTONE'),
              el('div', { class: 'milestone-icon' }, milestone.icon),
              el('h2', {}, milestone.title),
              el('p', { class: 'dim' }, milestone.blurb),
              el('div', { class: 'reward-pill' }, `+${milestone.xp} XP`),
              el('button', { class: 'btn primary wide', onclick: dismiss }, 'Claim'),
            );
            confetti(body, '#3ef07a');
            return body;
          },
          { className: 'scene-overlay' },
        );
        setTimeout(() => {
          close();
          resolve();
        }, 6500);
      }),
  );
}

export function achievementToast(achievement: Achievement): void {
  const host = toastHost();
  const node = el(
    'div',
    { class: 'badge-toast', style: `--tier:${TIER_COLORS[achievement.tier]}` },
    el('span', { class: 'badge-icon' }, achievement.icon),
    el('span', {}, el('b', {}, achievement.name), el('em', {}, 'Achievement unlocked')),
  );
  host.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 400);
  }, 3600);
}

/** The small flash next to an attribute when its rating actually ticks up. */
export function ratingPop(anchor: HTMLElement | null, key: keyof typeof ATTRIBUTE_META, to: number): void {
  const meta = ATTRIBUTE_META[key];
  if (!anchor || prefersReducedMotion()) {
    toast(`${meta.icon} ${meta.label} ${to}`, 'good');
    return;
  }
  const pop = el('div', { class: 'rating-pop', style: `--accent:${meta.accent}` }, `${meta.icon} ${meta.label} ${to}`);
  anchor.appendChild(pop);
  setTimeout(() => pop.remove(), 1800);
}

export function xpPop(anchor: HTMLElement | null, amount: number): void {
  if (!anchor || prefersReducedMotion()) return;
  const pop = el('div', { class: 'xp-pop' }, `+${amount} XP`);
  anchor.appendChild(pop);
  setTimeout(() => pop.remove(), 1400);
}

/**
 * One entry point for everything a completed activity should trigger, in the
 * order it should trigger: the small stuff immediately, the big stuff queued.
 */
export function celebrate(result: CompletionResult, anchor: HTMLElement | null): void {
  xpPop(anchor, result.xp.total);

  for (const gain of result.gains) {
    if (gain.to > gain.from) ratingPop(anchor, gain.key, gain.to);
  }

  // On the tick that locks the day in, that is the only line worth showing.
  if (result.lockedInNow) toast(`🔒 Day locked in — streak ${result.streak}`, 'good');
  else if (result.message) toast(result.message, 'good');
  if (result.weeklyCompleted) toast(`📅 Weekly challenge cleared — +${result.weeklyXp} XP`, 'good');

  if (result.overallAfter > result.overallBefore) overallUpScene(result.overallBefore, result.overallAfter);
  if (result.levelAfter > result.levelBefore) levelUpScene(result.levelAfter, result.totalXp);
  for (const milestone of result.milestones) milestoneScene(milestone);
  for (const achievement of result.achievements) achievementToast(achievement);
}
