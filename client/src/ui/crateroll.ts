import { RARITY_COLOR, buildCrateReel, type CratePull } from '@hoops/shared';

import { audio } from '../engine/audio.ts';
import { captureSceneKeys, el, fmt } from './dom.ts';
import { reelEase } from './courtroll.ts';
import { drawItemCard } from './itemcard.ts';

/**
 * Opening a crate.
 *
 * The same reel as the court draw, showing items instead of floors — deliberately
 * the same, because the court draw already taught the motion and a second
 * spinner that behaved differently would just be a second thing to learn. Cruise
 * fast, brake hard, land under the marker.
 *
 * The pull has already happened by the time this is called: `store.openCrate`
 * spent the crate and banked the item, and this is handed the result. So a
 * closed tab, a skipped animation and a watched one all end in the same place,
 * and there is no version of "it landed on the Legendary but I did not get it".
 */

const CARD_W = 150;
const CARD_GAP = 10;
const PITCH = CARD_W + CARD_GAP;
const SPIN_MS = 5200;
/** Longer than the court draw's hold: there is a name and a rarity to read. */
const HOLD_MS = 2600;

export function playCrateRoll(host: HTMLElement, pull: CratePull): Promise<void> {
  const seed = (Date.now() ^ 0x5a17) >>> 0;
  const { strip, winnerAt } = buildCrateReel(pull.crate, pull.item, seed);
  const win = RARITY_COLOR[pull.item.rarity];

  return new Promise((resolve) => {
    const track = el('div', { class: 'roll-track' });
    for (const item of strip) {
      const canvas = el('canvas', { class: 'roll-card', width: '300', height: '200' }) as HTMLCanvasElement;
      drawItemCard(canvas, item);
      track.appendChild(
        el(
          'div',
          { class: 'roll-cell', style: `--tint:${RARITY_COLOR[item.rarity]}` },
          canvas,
          el('div', { class: 'roll-name' }, item.name),
        ),
      );
    }

    const result = el('div', { class: 'roll-result' }, '');
    const detail = el('div', { class: 'roll-detail' }, '');

    const window_ = el('div', { class: 'roll-window' }, track, el('div', { class: 'roll-marker' }));
    const card = el(
      'div',
      { class: 'roll-card-shell' },
      el('div', { class: 'roll-title' }, pull.crate.name),
      el('div', { class: 'roll-sub' }, 'Opening'),
      window_,
      result,
      detail,
      el('div', { class: 'roll-skip' }, 'Click to skip'),
    );
    const stage = el('div', { class: 'roll-stage' }, card);

    let done = false;
    let raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      releaseKeys();
      stage.classList.add('out');
      window.setTimeout(() => {
        stage.remove();
        resolve();
      }, 260);
    };
    const releaseKeys = captureSceneKeys(() => finish());
    stage.addEventListener('click', finish);
    host.appendChild(stage);

    const settle = () => {
      const viewport = window_.clientWidth || 640;
      return viewport / 2 - (winnerAt * PITCH + CARD_W / 2);
    };
    const viewportStart = () => (window_.clientWidth || 640) / 2 - (4 * PITCH + CARD_W / 2);

    const started = performance.now();
    let lastTick = -1;
    let lastTickAt = 0;
    const draw = (now: number) => {
      if (done) return;
      const t = Math.min(1, (now - started) / SPIN_MS);
      const eased = reelEase(t);
      const target = settle();
      const from = viewportStart();
      const x = from + (target - from) * eased;
      track.style.transform = `translateX(${x}px)`;

      const crossed = Math.floor((-x + (window_.clientWidth || 640) / 2) / PITCH);
      if (crossed !== lastTick && t < 1) {
        lastTick = crossed;
        if (now - lastTickAt > 45) {
          lastTickAt = now;
          audio.play('ui', 0.22 + eased * 0.4);
        }
      }

      if (t >= 1 && !result.textContent) {
        result.textContent = pull.item.name;
        result.style.color = win;
        card.classList.add('landed');
        card.style.setProperty('--win', win);
        detail.append(
          el('span', { class: 'roll-rarity', style: `--tint:${win}` }, pull.item.rarity),
          pull.duplicate
            ? el('span', { class: 'roll-dupe' }, `Already owned — traded for ${fmt(pull.refund)} Coins`)
            : el('span', { class: 'roll-new' }, 'Added to your Locker'),
        );
        // A pull above rare deserves to sound different from a fourth Street
        // White, or the odds are only ever a number on a card.
        audio.play(pull.item.rarity === 'common' || pull.item.rarity === 'rare' ? 'ui' : 'levelUp', 0.95);
        window.setTimeout(finish, HOLD_MS);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    audio.play('ui', 0.8);
  });
}
