import { buildReel, pickCourtSurface, type CourtSurface } from '@hoops/shared';

import { audio } from '../engine/audio.ts';
import { captureSceneKeys, el } from './dom.ts';

/**
 * The court draw, played before every game.
 *
 * A horizontal reel of court cards scrolls past a fixed marker and slows to a
 * stop on the one you are about to play. The card art is drawn rather than
 * loaded: each is a small angled view of that court's own palette, painted by
 * the same six colours the floor uses, so the card is never out of date with
 * the court it promises.
 *
 * The result is decided before the animation starts — `pickCourtSurface(seed)`
 * is the truth and the reel is a way of showing it. Doing it the other way
 * round, letting where it stopped decide, would mean two clients in an online
 * match could land on different floors.
 */

/**
 * How the reel moves: cruise, then brake.
 *
 * The first half runs at a constant fast speed — about twenty cards a second,
 * fast enough that they are a blur you cannot read — and covers three quarters
 * of the distance. The second half is a cubic ease-out through the remaining
 * quarter, decelerating from that speed to nothing, so the last stretch is
 * card-by-card and the winner creeps under the marker.
 *
 * The two halves are chosen so the speeds match where they join: linear at
 * `D/T` and a cubic ease-out leaving at `3(1-D)/(1-T)`, which are equal at
 * T = 0.5, D = 0.75. Without that the reel visibly stalls at the changeover.
 *
 * Two curves were tried and thrown away first. A quintic ease-out slows down
 * evenly, so there is never a moment of "it is going to land on that one". An
 * exponential is the opposite problem — measured, it spent 97% of the distance
 * in the first second and then crawled almost imperceptibly for four more.
 */
const CRUISE_T = 0.5;
const CRUISE_D = 0.75;

export function reelEase(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  if (k <= CRUISE_T) return (CRUISE_D * k) / CRUISE_T;
  const b = (k - CRUISE_T) / (1 - CRUISE_T);
  return CRUISE_D + (1 - CRUISE_D) * (1 - Math.pow(1 - b, 3));
}

/** Card geometry, in CSS pixels. */
const CARD_W = 150;
const CARD_GAP = 10;
const PITCH = CARD_W + CARD_GAP;
/** How long the reel spins before it settles. */
const SPIN_MS = 5200;
/** How long the winner is held on screen once it lands. */
const HOLD_MS = 1400;

/**
 * The court draw.
 *
 * `unskippable` is for online: the draw is part of a shared intro, and one
 * player clicking through it only puts them on a court the other person has not
 * been shown yet. Seeded, so both clients land on the same floor either way.
 */
export function playCourtRoll(host: HTMLElement, seed: number, unskippable = false): Promise<CourtSurface> {
  const winner = pickCourtSurface(seed);
  const { strip, winnerAt } = buildReel(seed, winner);

  return new Promise((resolve) => {
    const track = el('div', { class: 'roll-track' });
    const cards: HTMLCanvasElement[] = [];
    for (const court of strip) {
      const canvas = el('canvas', { class: 'roll-card', width: '300', height: '200' }) as HTMLCanvasElement;
      drawCourtCard(canvas, court);
      const wrap = el('div', { class: 'roll-cell', style: `--tint:${court.tint}` }, canvas, el('div', { class: 'roll-name' }, court.name));
      track.appendChild(wrap);
      cards.push(canvas);
    }

    const title = el('div', { class: 'roll-title' }, 'Court Draw');
    const sub = el('div', { class: 'roll-sub' }, 'Where this one gets played');
    const result = el('div', { class: 'roll-result' }, '');

    const window_ = el('div', { class: 'roll-window' }, track, el('div', { class: 'roll-marker' }));
    const card = el('div', { class: 'roll-card-shell' }, title, sub, window_, result, el('div', { class: 'roll-skip' }, unskippable ? 'Drawing the court' : 'Click to skip'));
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
        resolve(winner);
      }, 260);
    };
    // Unskippable still captures keys — that stops them reaching the game
    // underneath — it just does not end the scene with them.
    const releaseKeys = captureSceneKeys(() => {
      if (!unskippable) finish();
    });
    if (!unskippable) stage.addEventListener('click', finish);
    host.appendChild(stage);

    // Where the winning card's centre has to end up: under the marker, which
    // sits at the centre of the window.
    const settle = () => {
      const viewport = window_.clientWidth || 640;
      return viewport / 2 - (winnerAt * PITCH + CARD_W / 2);
    };

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

      // A tick each time a card crosses the marker, which is what makes the
      // deceleration audible rather than only visible. Rate-limited, because at
      // the speed this now leaves at the first second would otherwise be forty
      // clicks on top of each other rather than a sound.
      const crossed = Math.floor((-x + (window_.clientWidth || 640) / 2) / PITCH);
      if (crossed !== lastTick && t < 1) {
        lastTick = crossed;
        if (now - lastTickAt > 45) {
          lastTickAt = now;
          // Quieter while it is flying, louder as it settles, so the slowdown
          // is something you hear before you see it.
          audio.play('ui', 0.22 + eased * 0.4);
        }
      }

      if (t >= 1) {
        if (!result.textContent) {
          result.textContent = winner.name;
          result.style.color = winner.tint;
          card.classList.add('landed');
          card.style.setProperty('--win', winner.tint);
          audio.play('levelUp', 0.9);
          window.setTimeout(finish, HOLD_MS);
        }
        raf = requestAnimationFrame(draw);
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    /** The reel starts a few cards in, so it is already moving when it appears. */
    const viewportStart = () => (window_.clientWidth || 640) / 2 - (4 * PITCH + CARD_W / 2);

    raf = requestAnimationFrame(draw);
    audio.play('ui', 0.8);
  });
}

/**
 * One court, drawn as an angled card.
 *
 * A cheap two-point projection rather than the match camera: the card wants the
 * whole floor in frame from above, which is a different shot from the one you
 * play in. Same palette either way, so what you see is what you get.
 */
export function drawCourtCard(canvas: HTMLCanvasElement, court: CourtSurface): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Backdrop: a wash of the court's own tint so the cards read apart at speed.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#141821');
  sky.addColorStop(1, mix('#141821', court.tint, 0.22));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // The court, as a trapezium seen from a corner.
  const cx = w / 2;
  const topY = h * 0.34;
  const botY = h * 0.86;
  const topHalf = w * 0.24;
  const botHalf = w * 0.42;

  const at = (u: number, v: number): [number, number] => {
    // u: -1..1 across the court, v: 0 at the far baseline, 1 at the near one.
    const y = topY + (botY - topY) * v;
    const half = topHalf + (botHalf - topHalf) * v;
    return [cx + u * half, y];
  };
  const quad = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const [x, y] = at(u, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Apron, then the playing surface inside it.
  quad([[-1.16, -0.06], [1.16, -0.06], [1.16, 1.06], [-1.16, 1.06]], court.apron);
  quad([[-1, 0], [1, 0], [1, 1], [-1, 1]], court.floor);

  // The key at the far end, and the centre circle.
  quad([[-0.34, 0], [0.34, 0], [0.34, 0.4], [-0.34, 0.4]], court.paint);

  ctx.strokeStyle = court.line;
  ctx.lineWidth = 2;
  // Key outline.
  ctx.beginPath();
  [[-0.34, 0], [-0.34, 0.4], [0.34, 0.4], [0.34, 0]].forEach(([u, v], i) => {
    const [x, y] = at(u, v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Three point arc, sampled across the floor.
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const a = Math.PI * (i / 30);
    const u = Math.cos(a) * 0.86;
    const v = 0.12 + Math.sin(a) * 0.62;
    const [x, y] = at(u, v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Sidelines.
  ctx.beginPath();
  [[-1, 0], [1, 0], [1, 1], [-1, 1], [-1, 0]].forEach(([u, v], i) => {
    const [x, y] = at(u, v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // The hoop, standing at the far baseline.
  const [hx, hy] = at(0, -0.02);
  ctx.fillStyle = 'rgba(240,244,250,0.9)';
  ctx.fillRect(hx - 15, hy - 30, 30, 18);
  ctx.strokeStyle = '#ff7a3d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(hx, hy - 10, 7, 2.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,236,244,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx, hy - 12);
  ctx.lineTo(hx, hy + 8);
  ctx.stroke();

  // A hint of the cage down both sides, so the cards look like places.
  ctx.strokeStyle = 'rgba(200,212,226,0.28)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 5; i++) {
      const v = i / 5;
      const [x, y] = at(side * 1.16, v);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 26 + v * 10);
      ctx.stroke();
    }
  }
}

function mix(a: string, b: string, amount: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}
