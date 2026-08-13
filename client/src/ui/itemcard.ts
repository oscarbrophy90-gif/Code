import { RARITY_COLOR, type StoreItem } from '@hoops/shared';

import { hexA, mix } from '../render/court.ts';
import { accessoryKind, clothingKind } from '../render/players.ts';
import { emotePose } from '../render/emotes.ts';

/**
 * One item, drawn as a card.
 *
 * The crate reel scrolls seventy-eight of these past you in five seconds, so
 * they have to be legible at a glance and cheap to draw — which rules out
 * running the full player renderer seventy-eight times. Instead each category
 * gets a flat, poster-like drawing of the thing itself in its own two colours:
 * a jersey is a jersey, a chain hangs, a hoodie has a hood, and an emote is a
 * figure already in that emote's pose.
 *
 * The poses come from `emotePose`, the same function the court and the store
 * preview animate off, so the card and the performance cannot disagree about
 * what a Galaxy Dance looks like. The clothing and accessory shapes are chosen
 * by the same `clothingKind`/`accessoryKind` the player renderer uses, for the
 * same reason.
 */
export function drawItemCard(canvas: HTMLCanvasElement, item: StoreItem): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const rarity = RARITY_COLOR[item.rarity];
  const [c1, c2] = item.colors;

  ctx.clearRect(0, 0, w, h);

  // A wash of the rarity colour behind, so at speed the strip reads as a run of
  // greys with the occasional flash of gold — which is what the odds feel like.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, mix('#10141d', rarity, 0.1));
  bg.addColorStop(1, mix('#10141d', rarity, 0.32));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A soft pool of light under the item so it is standing on the card rather
  // than floating over it.
  const glow = ctx.createRadialGradient(w / 2, h * 0.58, 4, w / 2, h * 0.58, w * 0.5);
  glow.addColorStop(0, hexA(rarity, 0.3));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h * 0.54);
  const scale = Math.min(w / 300, h / 200);
  ctx.scale(scale, scale);

  switch (item.category) {
    case 'jersey':
      drawJersey(ctx, c1, c2);
      break;
    case 'clothing':
      drawClothing(ctx, clothingKind(item.id), c1, c2);
      break;
    case 'accessory':
      drawAccessory(ctx, accessoryKind(item.id), c1, c2);
      break;
    case 'emote':
      drawEmoteFigure(ctx, item.id, c1, c2);
      break;
    default:
      drawMotif(ctx, c1, c2);
      break;
  }
  ctx.restore();

  // Rarity band along the bottom edge.
  ctx.fillStyle = rarity;
  ctx.fillRect(0, h - 5, w, 5);
}

// -------------------------------------------------------------------- jersey

function drawJersey(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  const body = new Path2D();
  // Shoulders out, armholes cut in, straight down to the hem.
  body.moveTo(-52, -62);
  body.lineTo(-16, -70);
  body.lineTo(16, -70);
  body.lineTo(52, -62);
  body.lineTo(62, -30);
  body.lineTo(38, -22);
  body.lineTo(38, 62);
  body.lineTo(-38, 62);
  body.lineTo(-38, -22);
  body.lineTo(-62, -30);
  body.closePath();

  ctx.fillStyle = c1;
  ctx.fill(body);

  // A panel of the second colour down one side, so two-tone kits read as
  // two-tone rather than as a flat block with a trim.
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = hexA(c2, 0.85);
  ctx.beginPath();
  ctx.moveTo(6, -80);
  ctx.lineTo(70, -80);
  ctx.lineTo(70, 70);
  ctx.lineTo(-6, 70);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Neck, hem and armhole trim.
  ctx.strokeStyle = c2;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-16, -70);
  ctx.quadraticCurveTo(0, -54, 16, -70);
  ctx.stroke();

  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke(body);

  // The number, which is what makes a rectangle read as a basketball jersey.
  ctx.fillStyle = mix(c1, '#ffffff', 0.82);
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('23', 0, 4);
}

// ------------------------------------------------------------------ clothing

function drawClothing(ctx: CanvasRenderingContext2D, kind: string, c1: string, c2: string): void {
  switch (kind) {
    case 'hoodie':
      drawHoodie(ctx, c1, c2);
      return;
    case 'tracksuit':
      drawTracksuit(ctx, c1, c2);
      return;
    case 'compression':
      drawCompression(ctx, c1, c2);
      return;
    case 'cutoff':
      drawCutoff(ctx, c1, c2);
      return;
    case 'longshorts':
      drawShorts(ctx, c1, c2, 78);
      return;
    default:
      drawShorts(ctx, c1, c2, 52);
  }
}

function drawShorts(ctx: CanvasRenderingContext2D, c1: string, c2: string, length: number): void {
  const top = -length / 2 - 12;
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(-46, top);
  ctx.lineTo(46, top);
  ctx.lineTo(48, top + length);
  ctx.lineTo(8, top + length);
  ctx.lineTo(0, top + length * 0.46);
  ctx.lineTo(-8, top + length);
  ctx.lineTo(-48, top + length);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Waistband and a side stripe.
  ctx.fillStyle = c2;
  ctx.fillRect(-46, top, 92, 11);
  ctx.fillRect(-44, top + 13, 5, length - 14);
  ctx.fillRect(39, top + 13, 5, length - 14);
}

function drawHoodie(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  // Hood, sat on top of the shoulders.
  ctx.beginPath();
  ctx.ellipse(0, -62, 30, 22, 0, Math.PI, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-58, -56);
  ctx.lineTo(-30, -66);
  ctx.lineTo(30, -66);
  ctx.lineTo(58, -56);
  ctx.lineTo(72, -6);
  ctx.lineTo(46, 2);
  ctx.lineTo(46, 60);
  ctx.lineTo(-46, 60);
  ctx.lineTo(-46, 2);
  ctx.lineTo(-72, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Hood lining, pocket and drawstrings — the three things that say "hoodie".
  ctx.fillStyle = hexA(c2, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, -60, 24, 15, 0, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = hexA(c2, 0.55);
  ctx.fillRect(-26, 16, 52, 26);

  ctx.strokeStyle = c2;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-9, -52);
  ctx.lineTo(-11, -26);
  ctx.moveTo(9, -52);
  ctx.lineTo(11, -26);
  ctx.stroke();

  // Cuffs and hem.
  ctx.fillStyle = c2;
  ctx.fillRect(-46, 52, 92, 8);
}

function drawTracksuit(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  // Jacket.
  ctx.beginPath();
  ctx.moveTo(-52, -66);
  ctx.lineTo(52, -66);
  ctx.lineTo(68, -20);
  ctx.lineTo(44, -14);
  ctx.lineTo(44, 8);
  ctx.lineTo(-44, 8);
  ctx.lineTo(-44, -14);
  ctx.lineTo(-68, -20);
  ctx.closePath();
  ctx.fill();
  // Trousers.
  ctx.beginPath();
  ctx.moveTo(-42, 12);
  ctx.lineTo(42, 12);
  ctx.lineTo(38, 74);
  ctx.lineTo(8, 74);
  ctx.lineTo(0, 34);
  ctx.lineTo(-8, 74);
  ctx.lineTo(-38, 74);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // The stripe down the arm and the leg, which is the whole look.
  ctx.fillStyle = c2;
  ctx.fillRect(-3, -66, 6, 74);
  ctx.fillRect(-40, 12, 5, 62);
  ctx.fillRect(35, 12, 5, 62);
  ctx.fillRect(-56, -60, 5, 42);
  ctx.fillRect(51, -60, 5, 42);
}

function drawCompression(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  // Long-sleeve top.
  ctx.beginPath();
  ctx.moveTo(-40, -70);
  ctx.lineTo(40, -70);
  ctx.lineTo(58, -56);
  ctx.lineTo(70, 4);
  ctx.lineTo(52, 8);
  ctx.lineTo(40, -34);
  ctx.lineTo(40, 4);
  ctx.lineTo(-40, 4);
  ctx.lineTo(-40, -34);
  ctx.lineTo(-52, 8);
  ctx.lineTo(-70, 4);
  ctx.lineTo(-58, -56);
  ctx.closePath();
  ctx.fill();
  // Tights.
  ctx.beginPath();
  ctx.moveTo(-38, 8);
  ctx.lineTo(38, 8);
  ctx.lineTo(30, 76);
  ctx.lineTo(6, 76);
  ctx.lineTo(0, 32);
  ctx.lineTo(-6, 76);
  ctx.lineTo(-30, 76);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Panel seams — a compression set is all seams.
  ctx.strokeStyle = hexA(c2, 0.95);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-24, -66);
  ctx.lineTo(-30, 2);
  ctx.moveTo(24, -66);
  ctx.lineTo(30, 2);
  ctx.moveTo(-22, 14);
  ctx.lineTo(-26, 72);
  ctx.moveTo(22, 14);
  ctx.lineTo(26, 72);
  ctx.stroke();
}

function drawCutoff(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(-48, -60);
  ctx.lineTo(-16, -68);
  ctx.lineTo(16, -68);
  ctx.lineTo(48, -60);
  ctx.lineTo(56, -30);
  ctx.lineTo(36, -24);
  ctx.lineTo(36, 54);
  ctx.lineTo(-36, 54);
  ctx.lineTo(-36, -24);
  ctx.lineTo(-56, -30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // The raw edges, drawn ragged, because that is the only thing separating a
  // cut-off from a tee.
  ctx.strokeStyle = c2;
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const x = side * (56 - i * 3.4);
      const y = -30 + i * 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y + (i % 2 === 0 ? 2 : -2));
    }
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const x = -36 + i * 7.2;
    ctx.lineTo(x, 54 + (i % 2 === 0 ? 3 : -3));
  }
  ctx.stroke();
}

// ----------------------------------------------------------------- accessory

function drawAccessory(ctx: CanvasRenderingContext2D, kind: string, c1: string, c2: string): void {
  ctx.lineCap = 'round';
  switch (kind) {
    case 'chain':
      drawChain(ctx, c1, c2);
      return;
    case 'armsleeve':
      drawSleeve(ctx, c1, c2);
      return;
    case 'headband':
      drawHeadband(ctx, c1, c2);
      return;
    case 'goggles':
      drawGoggles(ctx, c1, c2);
      return;
    case 'earrings':
      drawEarrings(ctx, c1, c2);
      return;
    case 'kneepad':
      drawKneepad(ctx, c1, c2);
      return;
    case 'mouthguard':
      drawMouthguard(ctx, c1, c2);
      return;
    default:
      drawWristbands(ctx, c1, c2);
  }
}

function drawChain(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  // A hanging V of links with a pendant at the bottom.
  const links = 26;
  for (let i = 0; i <= links; i++) {
    const u = (i / links) * 2 - 1;
    const x = u * 62;
    const y = -58 + Math.pow(Math.abs(u), 0.6) * 0 + (1 - u * u) * 76;
    ctx.fillStyle = i % 2 === 0 ? c1 : c2;
    ctx.beginPath();
    ctx.arc(x, y - 40, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA('#0b0e15', 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  const py = 40;
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(0, py + 30);
  ctx.lineTo(-20, py + 2);
  ctx.lineTo(-12, py - 22);
  ctx.lineTo(12, py - 22);
  ctx.lineTo(20, py + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c1;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawSleeve(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.save();
  ctx.rotate(-0.18);
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(-26, -76);
  ctx.lineTo(26, -76);
  ctx.lineTo(19, 76);
  ctx.lineTo(-19, 76);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = c2;
  ctx.fillRect(-26, -76, 52, 12);
  ctx.fillRect(-19, 62, 38, 12);
  for (let i = 0; i < 4; i++) {
    const y = -40 + i * 26;
    ctx.fillRect(-24 + i * 0.6, y, 48 - i * 1.2, 6);
  }
  ctx.restore();
}

function drawHeadband(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.strokeStyle = c1;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 42, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = c2;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 42, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = hexA('#0b0e15', 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 74, 54, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWristbands(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  for (const side of [-1, 1]) {
    const x = side * 38;
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(side * 0.12);
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.roundRect(-26, -30, 52, 60, 10);
    ctx.fill();
    ctx.strokeStyle = hexA('#0b0e15', 0.5);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = c2;
    ctx.fillRect(-26, -12, 52, 9);
    ctx.fillRect(-26, 4, 52, 9);
    ctx.restore();
  }
}

function drawGoggles(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.strokeStyle = c1;
  ctx.lineWidth = 10;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 30, 0, 24, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = hexA(c2, 0.55);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 30, 0, 21, 17, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bridge and strap.
  ctx.strokeStyle = c1;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  ctx.moveTo(-54, -2);
  ctx.lineTo(-74, -8);
  ctx.moveTo(54, -2);
  ctx.lineTo(74, -8);
  ctx.stroke();
}

function drawEarrings(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  for (const side of [-1, 1]) {
    const x = side * 34;
    ctx.strokeStyle = c1;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, -18, 18, 0.2, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x - 12, 22);
    ctx.lineTo(x, 46);
    ctx.lineTo(x + 12, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hexA('#ffffff', 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawKneepad(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.roundRect(-40, -48, 80, 96, 18);
  ctx.fill();
  ctx.strokeStyle = hexA('#0b0e15', 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = hexA(c2, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-38, -28 + i * 28);
    ctx.lineTo(38, -28 + i * 28);
    ctx.stroke();
  }
}

function drawMouthguard(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(-52, -18);
  ctx.quadraticCurveTo(0, 46, 52, -18);
  ctx.quadraticCurveTo(0, 14, -52, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = hexA('#0b0e15', 0.35);
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const u = -1 + (i / 6) * 2;
    ctx.beginPath();
    ctx.moveTo(u * 52, -18 + Math.abs(u) * 6);
    ctx.lineTo(u * 46, 10 + (1 - u * u) * 18);
    ctx.stroke();
  }
}

// --------------------------------------------------------------------- emote

/**
 * The emote's own pose, drawn as a figure.
 *
 * Halfway through the performance, which is where an emote is at its most
 * itself — a Finger Wag is wagging, a Night Night is asleep, a Bow is folded.
 * Taking the pose from `emotePose` rather than inventing one means a card can
 * never promise a move the emote does not have.
 */
function drawEmoteFigure(ctx: CanvasRenderingContext2D, id: string, c1: string, c2: string): void {
  const pose = emotePose(id, 0.5);
  const skin = '#e5be9e';

  ctx.save();
  ctx.translate(0, -pose.bob * 22);
  ctx.rotate(pose.spin * 0.35);
  ctx.translate(0, pose.crouch * 26);

  const hipY = 16;
  const shoulderY = -34 + pose.lean * 6;
  const lean = pose.lean * 14;

  // Legs.
  ctx.strokeStyle = c1;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 8, hipY);
    ctx.lineTo(side * 12 * pose.stride, hipY + 30 - pose.crouch * 14);
    ctx.lineTo(side * 15 * pose.stride, hipY + 58 - pose.crouch * 24);
    ctx.stroke();
  }

  // Torso.
  ctx.strokeStyle = c2;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(lean, shoulderY);
  ctx.stroke();

  // Arms, one per side, posed off the emote's own numbers. `fwd` reaches
  // toward the viewer, which on a flat card reads as a shorter, thicker arm.
  ctx.strokeStyle = skin;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const arm = pose.arm[i];
    const out = pose.out[i];
    const fwd = pose.fwd[i];
    const sx = lean + side * 15;
    const reach = 44 * (1 - Math.min(0.55, fwd * 0.3));
    const ex = sx + side * out * reach * 0.72;
    const ey = shoulderY + 20 - arm * 34;
    const hx = ex + side * out * reach * 0.5;
    const hy = ey + 18 - arm * 30;
    ctx.lineWidth = 11 + Math.min(5, fwd * 4);
    ctx.beginPath();
    ctx.moveTo(sx, shoulderY + 2);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  }

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(lean * 1.25, shoulderY - 22, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#241a17';
  ctx.beginPath();
  ctx.arc(lean * 1.25, shoulderY - 27, 15, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// -------------------------------------------------------------------- others

/** Anything the crates do not stock, so the function is total. */
function drawMotif(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c2;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.stroke();
}
