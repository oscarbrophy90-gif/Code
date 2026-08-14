import {
  DUNK_PACKAGE_BY_ID,
  JUMPSHOTS,
  RARITY_COLOR,
  type MyPlayer,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../state/store.ts';
import { el, overlay } from './dom.ts';
import { AvatarRenderer, livePreview } from './avatar.ts';
import { mountDunkPreview } from './dunkpreview.ts';

/**
 * "Try before you buy". Every category gets a preview that shows the thing
 * itself rather than a coloured square: worn items go on your actual player,
 * dunk packages play their animation, jump shots show the meter they give you,
 * and courts render their floor.
 */
export function previewItem(item: StoreItem): void {
  overlay((close) =>
    el(
      'div',
      { class: 'dialog preview-dialog' },
      el(
        'div',
        { class: 'preview-head', style: `--rarity:${RARITY_COLOR[item.rarity]}` },
        el('div', { class: 'rarity-tag' }, item.rarity),
        el('h3', { style: 'margin:4px 0 2px' }, item.name),
        el('div', { class: 'faint', style: 'font-size:12px' }, item.description),
      ),
      previewBody(item),
      el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:14px' },
        el('button', { class: 'btn', onclick: close }, 'Close')),
    ),
  );
}

/** Picks the right preview for the category. */
function previewBody(item: StoreItem): HTMLElement {
  switch (item.category) {
    case 'jersey':
    case 'shoes':
    case 'clothing':
    case 'accessory':
    case 'hairstyle':
    case 'tattoo':
      return wornPreview(item);
    case 'dunkPackage':
      return dunkAnimationPreview(item);
    case 'jumpshot':
      return jumpshotPreview(item);
    case 'court':
      return courtPreview(item);
    case 'title':
      return titlePreview(item);
    case 'emote':
    case 'celebration':
    case 'threeCelebration':
      return performancePreview(item);
    default:
      return motifPreview(item);
  }
}

/**
 * Anything worn is shown on your own build head to toe, exactly as it renders
 * on court, next to what you have on right now.
 */
function wornPreview(item: StoreItem): HTMLElement {
  const now = store.player;
  const withItem = applyToCopy(now, item);

  const figure = (player: MyPlayer, label: string, highlight: boolean) => {
    const canvas = el('canvas', { class: `preview-figure ${highlight ? 'on' : ''}` }) as HTMLCanvasElement;
    const cfg = store.simConfig(player);
    const avatar = new AvatarRenderer();
    livePreview(canvas, () => avatar.draw(canvas, cfg));
    return el(
      'div',
      { style: 'text-align:center;flex:1;min-width:0' },
      canvas,
      el('div', { class: highlight ? '' : 'faint', style: 'font-size:11px;margin-top:6px;font-weight:700' }, label),
    );
  };

  return el(
    'div',
    { class: 'preview-body' },
    el('div', { class: 'row', style: 'gap:10px;align-items:flex-start' }, figure(now, 'Now', false), figure(withItem, 'With this on', true)),
    el('div', { class: 'hint', style: 'margin-top:8px' }, 'Drawn by the same renderer the court uses, so this is exactly how it turns up in a game.'),
  );
}

/**
 * Emotes and celebrations are movement, so the preview is your own player
 * performing it on a loop rather than a card with a name on it.
 */
function performancePreview(item: StoreItem): HTMLElement {
  const canvas = el('canvas', { class: 'preview-figure wide' }) as HTMLCanvasElement;
  const cfg = store.simConfig();
  const avatar = new AvatarRenderer();
  // A beat of stillness between runs so a short emote does not look frantic.
  const cycle = 2.6;
  livePreview(canvas, (elapsed) => {
    const t = Math.min(1, ((elapsed % cycle) / cycle) * 1.5);
    avatar.draw(canvas, cfg, { emoteId: item.id, t, zoom: 0.92 });
  });

  return el(
    'div',
    { class: 'preview-body' },
    canvas,
    el(
      'div',
      { class: 'hint', style: 'margin-top:8px' },
      item.category === 'emote'
        ? 'Put it on one of the six keys in the Locker. In a game you hold the ball out on a bounce while it plays — nobody can take it off you, but the shot clock keeps running.'
        : item.category === 'threeCelebration'
          ? 'Fires the moment a three drops, in the beat before the ball is checked back in.'
          : 'Fires on the floor the moment you win the game.',
    ),
  );
}

/** A shallow copy of the player wearing one candidate item. */
function applyToCopy(player: MyPlayer, item: StoreItem): MyPlayer {
  const copy: MyPlayer = {
    ...player,
    loadout: { ...player.loadout },
    body: { ...player.body },
  };
  switch (item.category) {
    case 'jersey':
      copy.loadout.jerseyId = item.id;
      break;
    case 'shoes':
      copy.loadout.shoesId = item.id;
      break;
    case 'clothing':
      copy.loadout.clothingId = item.id;
      break;
    case 'accessory':
      copy.loadout.accessoryId = item.id;
      break;
    case 'hairstyle':
      copy.body.hairstyleId = item.id;
      break;
    case 'tattoo':
      copy.loadout.tattooId = item.id;
      break;
    default:
      break;
  }
  return copy;
}

/** The dunk package, playing, exactly as the in-game cutaway renders it. */
function dunkAnimationPreview(item: StoreItem): HTMLElement {
  const canvas = el('canvas', { class: 'dunk-preview' }) as HTMLCanvasElement;
  const cfg = store.simConfig();
  const packageId = item.id.replace('dunk-', '');
  const pkg = DUNK_PACKAGE_BY_ID[packageId];
  // The preview is the replay: your own player performs this package through
  // the real simulation and it is drawn by the replay's own frame renderer,
  // so what you buy is exactly what plays.
  mountDunkPreview(canvas, cfg, packageId, false);

  return el(
    'div',
    { class: 'preview-body' },
    canvas,
    pkg
      ? el(
          'div',
          { class: 'hint', style: 'margin-top:8px' },
          pkg.requires === 0
            ? 'Any build can use this one.'
            : `Needs ${pkg.requires} Dunk and ${pkg.requiresVertical} Vertical — you have ${store.player.attributes.dunk} / ${store.player.attributes.vertical}.`,
        )
      : null,
  );
}

/**
 * A jump shot is timing, so the preview is the meter it gives you: how long it
 * runs and how wide the green is, drawn against the one you have on now.
 */
function jumpshotPreview(item: StoreItem): HTMLElement {
  const id = item.id.replace('jumpshot-', '');
  const shot = JUMPSHOTS.find((j) => j.id === id);
  const current = JUMPSHOTS.find((j) => j.id === store.player.loadout.jumpshotId);
  if (!shot) return motifPreview(item);

  const bar = (j: typeof shot, label: string, highlight: boolean) => {
    // Widest release in the set sets the scale, so the bars are comparable.
    const longest = Math.max(...JUMPSHOTS.map((x) => x.releaseTime));
    const width = (j.releaseTime / longest) * 100;
    const green = Math.max(4, j.greenWindow * 420);
    return el(
      'div',
      { style: 'margin-bottom:10px' },
      el(
        'div',
        { class: 'row', style: 'justify-content:space-between;font-size:11px' },
        el('span', { style: highlight ? 'font-weight:800' : 'color:var(--text-faint)' }, label),
        el('span', { class: 'faint' }, `${Math.round(j.releaseTime * 1000)} ms`),
      ),
      el(
        'div',
        { class: 'preview-meter', style: `width:${width}%` },
        el('span', { class: 'preview-green', style: `width:${green}%` }),
      ),
    );
  };

  return el(
    'div',
    { class: 'preview-body' },
    bar(shot, `${shot.name} — this one`, true),
    current && current.id !== shot.id ? bar(current, `${current.name} — what you have on`, false) : null,
    el(
      'div',
      { class: 'hint', style: 'margin-top:4px' },
      'Longer bar means a slower release with more time to read it. The bright section is the green window.',
    ),
  );
}

/** The floor itself, in its own colours. */
function courtPreview(item: StoreItem): HTMLElement {
  const canvas = el('canvas', { class: 'preview-court' }) as HTMLCanvasElement;
  requestAnimationFrame(() => drawCourtSwatch(canvas, item));
  return el('div', { class: 'preview-body' }, canvas, el('div', { class: 'hint', style: 'margin-top:8px' }, 'Your home floor in the parks you own.'));
}

function drawCourtSwatch(canvas: HTMLCanvasElement, item: StoreItem): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 420;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = item.colors[0];
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = item.colors[1];
  ctx.lineWidth = 2;

  // Half court seen from above: arc, key, rim.
  const rimX = w / 2;
  const rimY = h * 0.12;
  ctx.beginPath();
  ctx.arc(rimX, rimY, h * 0.66, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
  ctx.strokeRect(rimX - w * 0.11, rimY, w * 0.22, h * 0.46);
  ctx.beginPath();
  ctx.arc(rimX, rimY + h * 0.46, w * 0.11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rimX, rimY, h * 0.05, 0, Math.PI * 2);
  ctx.stroke();
}

/** A title is text under your name, so show it exactly like that. */
function titlePreview(item: StoreItem): HTMLElement {
  return el(
    'div',
    { class: 'preview-body', style: 'text-align:center;padding:22px 0' },
    el('div', { style: 'font-size:22px;font-weight:900' }, store.player.name),
    el('div', { style: `font-size:13px;font-weight:800;margin-top:4px;color:${item.colors[0]}` }, item.name),
    el('div', { class: 'hint', style: 'margin-top:12px' }, 'How it reads on your walkout card.'),
  );
}

/** Everything else: the item's own colours, moving, so it is not a dead square. */
function motifPreview(item: StoreItem): HTMLElement {
  const canvas = el('canvas', { class: 'preview-court' }) as HTMLCanvasElement;
  const start = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    if (!canvas.isConnected) {
      cancelAnimationFrame(raf);
      return;
    }
    drawMotif(canvas, item, (now - start) / 1000);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return el('div', { class: 'preview-body' }, canvas);
}

function drawMotif(canvas: HTMLCanvasElement, item: StoreItem, t: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 420;
  const h = canvas.clientHeight || 200;
  if (canvas.width !== Math.floor(w * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#131a27');
  bg.addColorStop(1, '#080b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Concentric pulses in the item's own colours, staggered so it reads as one
  // continuous motion rather than a blinking ring.
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.55 + i / 3) % 1;
    ctx.globalAlpha = (1 - phase) * 0.75;
    ctx.strokeStyle = i % 2 === 0 ? item.colors[0] : item.colors[1];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 12 + phase * Math.min(w, h) * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = item.colors[0];
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 11, 0, Math.PI * 2);
  ctx.fill();
}
