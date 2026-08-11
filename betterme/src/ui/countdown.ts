import { formatTimeLeft, msUntilMidnight } from '../core/index.ts';
import { el } from './dom.ts';

/**
 * A live countdown to local midnight.
 *
 * The deadline is the whole reason a daily game has any urgency, and "8h 12m
 * left" does that job in a way "today" never will. Two rules it follows so it
 * stays motivating rather than stressful: it never turns red, and the copy under
 * an hour is still an invitation ("time for one more"), not a warning.
 *
 * The interval cancels itself once the node leaves the document, so the screen
 * re-rendering after every completed task cannot leak timers.
 */
export function midnightCountdown(className = ''): HTMLElement {
  const value = el('b', {});
  const node = el('span', { class: `countdown ${className}` }, el('span', { class: 'countdown-dot' }), value);
  let timer: ReturnType<typeof setInterval> | null = null;

  const paint = () => {
    const left = msUntilMidnight();
    value.textContent = formatTimeLeft(left);
    node.classList.toggle('soon', left < 60 * 60 * 1000);
  };

  paint();
  timer = setInterval(() => {
    // Callers mount synchronously, so by the first tick a detached node means
    // the screen was re-rendered and this element is garbage. Cancel with it.
    if (!node.isConnected) {
      if (timer) clearInterval(timer);
      return;
    }
    paint();
  }, 1000);

  return node;
}
