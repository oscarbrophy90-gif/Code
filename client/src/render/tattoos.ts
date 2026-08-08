import { TATTOO_DESIGNS, type TattooGlyph, type TattooSpot } from '@hoops/shared';

/**
 * Tattoo linework.
 *
 * Every tattoo used to be the same thing: the arm filled in a bit darker. Buying
 * a Dragon and buying a Rose changed one number in a colour mix, so the shop had
 * eight tattoos that were visually one tattoo. These are twenty actual glyphs,
 * drawn as ink on skin.
 *
 * They are deliberately simple. On court a player's whole arm is a stroke a few
 * pixels wide, so a glyph that needs detail to read is a glyph that reads as
 * noise. Each one is built from the fewest strokes that still say what it is:
 * a dragon is a coil with a jaw, a crown is five points on a band, a skull is
 * two sockets and a jaw. At preview size they hold up; on court they read as the
 * right *kind* of ink, which is the most any of this can do at that scale.
 */

/** A place ink can sit, and how big and which way round it goes there. */
export interface InkSpot {
  x: number;
  y: number;
  /** roughly the long axis of the art, in pixels */
  size: number;
  /** rotation, so a limb piece runs along the limb */
  angle: number;
}

export interface TattooLook {
  glyph: TattooGlyph;
  spots: Set<TattooSpot>;
  aura: boolean;
  ink: string;
  glow: string;
}

const NO_INK: TattooLook = {
  glyph: 'tribal',
  spots: new Set(),
  aura: false,
  ink: '#000000',
  glow: '#000000',
};

/** Ink tone per glyph, so a rose is not the same black as a lightning bolt. */
const INK_TONE: Record<TattooGlyph, [string, string]> = {
  waves: ['#1b2734', '#7fb0d8'],
  dragon: ['#191922', '#c08a3a'],
  dojo: ['#1c1c18', '#c9b46a'],
  phoenix: ['#241410', '#ff7a3d'],
  snake: ['#161d16', '#6fae6f'],
  tiger: ['#241a10', '#ffb347'],
  rose: ['#241014', '#e04f6a'],
  lightning: ['#141a28', '#8fc4ff'],
  samurai: ['#1a1b22', '#b9c6d8'],
  skull: ['#1d1d20', '#e8eef5'],
  angel: ['#1e242a', '#ffffff'],
  demon: ['#241014', '#ff5c4d'],
  flames: ['#241408', '#ff9a3d'],
  crown: ['#241f10', '#ffd23d'],
  tribal: ['#161616', '#4a4a4a'],
  basketball: ['#241408', '#ff9a4f'],
  wings: ['#1e2228', '#e8eef5'],
  oni: ['#241014', '#ff4d3d'],
  spider: ['#19191e', '#8a8a94'],
  rift: ['#0d0014', '#ff4d8d'],
};

/** What a tattoo id draws, or an empty look when there is no ink on. */
export function tattooLook(id: string | null | undefined): TattooLook {
  if (!id) return NO_INK;
  const design = TATTOO_DESIGNS[id];
  if (!design) return NO_INK;
  const [ink, glow] = INK_TONE[design.glyph];
  return { glyph: design.glyph, spots: new Set(design.spots), aura: design.aura, ink, glow };
}

/** Whether this look puts anything on a given spot. */
export function inkedAt(look: TattooLook, spot: TattooSpot): boolean {
  return look.spots.has(spot);
}

/**
 * Draws one piece of ink.
 *
 * `alpha` fades the whole thing so a small on-court figure gets a hint rather
 * than a hard black mark that swamps the limb it is on.
 */
export function drawInk(
  ctx: CanvasRenderingContext2D,
  look: TattooLook,
  spot: InkSpot,
  alpha = 1,
): void {
  if (spot.size < 2.2) return;
  ctx.save();
  ctx.translate(spot.x, spot.y);
  ctx.rotate(spot.angle);
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The exotic tiers get a glow behind the line, which is the whole difference
  // between a Dragon and a Cosmic Dragon.
  if (look.aura) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;
    ctx.shadowColor = look.glow;
    ctx.shadowBlur = spot.size * 0.3;
    ctx.strokeStyle = look.glow;
    ctx.lineWidth = Math.max(1, spot.size * 0.11);
    GLYPHS[look.glyph](ctx, spot.size);
    ctx.restore();
  }

  ctx.strokeStyle = look.ink;
  ctx.fillStyle = look.ink;
  ctx.lineWidth = Math.max(0.9, spot.size * 0.1);
  GLYPHS[look.glyph](ctx, spot.size);
  ctx.restore();
}

/**
 * Each glyph draws into a box `s` tall centred on the origin, with the long axis
 * vertical — callers rotate to lay it along a limb.
 */
type Glyph = (ctx: CanvasRenderingContext2D, s: number) => void;

const GLYPHS: Record<TattooGlyph, Glyph> = {
  // Three stacked rolling lines.
  waves: (c, s) => {
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(-s * 0.32, i * s * 0.22);
      c.bezierCurveTo(-s * 0.1, i * s * 0.22 - s * 0.16, s * 0.1, i * s * 0.22 + s * 0.16, s * 0.32, i * s * 0.22);
      c.stroke();
    }
  },

  // A body coiled twice, a jaw at the top, spines down the back.
  dragon: (c, s) => {
    c.beginPath();
    c.moveTo(s * 0.04, s * 0.46);
    c.bezierCurveTo(-s * 0.3, s * 0.28, s * 0.3, s * 0.04, -s * 0.06, -s * 0.14);
    c.bezierCurveTo(-s * 0.26, -s * 0.26, -s * 0.02, -s * 0.36, s * 0.12, -s * 0.3);
    c.stroke();
    // Jaw.
    c.beginPath();
    c.moveTo(s * 0.12, -s * 0.3);
    c.lineTo(s * 0.3, -s * 0.4);
    c.moveTo(s * 0.12, -s * 0.3);
    c.lineTo(s * 0.28, -s * 0.24);
    c.stroke();
    // Spines.
    c.lineWidth *= 0.7;
    for (let i = 0; i < 3; i++) {
      const t = 0.1 + i * 0.16;
      c.beginPath();
      c.moveTo(-s * 0.1 + i * s * 0.06, s * (0.3 - t));
      c.lineTo(-s * 0.24 + i * s * 0.06, s * (0.24 - t));
      c.stroke();
    }
  },

  // Two brushed strokes crossing, the way a hall sign is painted.
  dojo: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.28, -s * 0.3);
    c.lineTo(s * 0.28, -s * 0.3);
    c.moveTo(0, -s * 0.34);
    c.lineTo(0, s * 0.18);
    c.moveTo(-s * 0.24, s * 0.06);
    c.lineTo(s * 0.24, s * 0.06);
    c.moveTo(-s * 0.16, s * 0.4);
    c.lineTo(s * 0.16, s * 0.34);
    c.stroke();
  },

  // A bird: head up, wings swept wide, one long tail trailing off. The forked
  // version read as a scarecrow, because two things hanging below a body with
  // two things out to the side is a person, not a bird.
  phoenix: (c, s) => {
    // Head and beak.
    c.beginPath();
    c.arc(s * 0.02, -s * 0.3, s * 0.065, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(s * 0.08, -s * 0.31);
    c.lineTo(s * 0.19, -s * 0.27);
    c.stroke();
    // Body curving into the tail, all one line, sweeping to one side.
    c.beginPath();
    c.moveTo(s * 0.02, -s * 0.24);
    c.bezierCurveTo(-s * 0.04, -s * 0.02, -s * 0.16, s * 0.24, -s * 0.34, s * 0.44);
    c.stroke();
    // Tail feathers off that sweep.
    c.lineWidth *= 0.6;
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      c.beginPath();
      c.moveTo(-s * (0.04 + t * 0.14), s * (0.04 + t * 0.2));
      c.quadraticCurveTo(-s * (0.02 + t * 0.1), s * (0.3 + t * 0.1), s * (0.1 - t * 0.16), s * (0.44 + t * 0.04));
      c.stroke();
    }
    c.lineWidth /= 0.6;
    // Wings: wide, swept back, well above the body line.
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -s * 0.16);
      c.bezierCurveTo(sign * s * 0.26, -s * 0.42, sign * s * 0.48, -s * 0.34, sign * s * 0.46, -s * 0.08);
      c.stroke();
      c.lineWidth *= 0.58;
      for (let i = 0; i < 3; i++) {
        const t = 0.16 + i * 0.1;
        c.beginPath();
        c.moveTo(sign * s * t, -s * (0.28 + i * 0.015));
        c.lineTo(sign * s * (t + 0.06), -s * (0.06 - i * 0.05));
        c.stroke();
      }
      c.lineWidth /= 0.58;
    }
  },

  // Wound tight, mouth open at the end.
  snake: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.02, s * 0.46);
    for (let i = 0; i < 4; i++) {
      const y0 = s * (0.46 - i * 0.2);
      c.quadraticCurveTo((i % 2 ? -1 : 1) * s * 0.3, y0 - s * 0.1, 0, y0 - s * 0.2);
    }
    c.stroke();
    c.lineWidth *= 0.7;
    c.beginPath();
    c.moveTo(0, -s * 0.34);
    c.lineTo(s * 0.18, -s * 0.44);
    c.moveTo(0, -s * 0.34);
    c.lineTo(s * 0.16, -s * 0.28);
    c.stroke();
  },

  // Head on, angular and snarling. The round-eyed version read as a cartoon cat.
  tiger: (c, s) => {
    // Jaw line, wider at the cheeks than the chin.
    c.beginPath();
    c.moveTo(-s * 0.3, -s * 0.2);
    c.lineTo(-s * 0.28, s * 0.08);
    c.lineTo(0, s * 0.34);
    c.lineTo(s * 0.28, s * 0.08);
    c.lineTo(s * 0.3, -s * 0.2);
    c.stroke();
    for (const sign of [-1, 1]) {
      // Pointed ear.
      c.beginPath();
      c.moveTo(sign * s * 0.3, -s * 0.2);
      c.lineTo(sign * s * 0.26, -s * 0.44);
      c.lineTo(sign * s * 0.06, -s * 0.26);
      c.stroke();
      // Eye: an angled slash, brow down toward the nose.
      c.beginPath();
      c.moveTo(sign * s * 0.24, -s * 0.14);
      c.lineTo(sign * s * 0.08, -s * 0.04);
      c.stroke();
      // Cheek stripes.
      c.lineWidth *= 0.6;
      for (let i = 0; i < 2; i++) {
        c.beginPath();
        c.moveTo(sign * s * 0.2, s * (0.02 + i * 0.1));
        c.lineTo(sign * s * 0.33, s * (0.0 + i * 0.1));
        c.stroke();
      }
      // Fang.
      c.beginPath();
      c.moveTo(sign * s * 0.09, s * 0.16);
      c.lineTo(sign * s * 0.12, s * 0.27);
      c.stroke();
      c.lineWidth /= 0.6;
    }
    // Nose.
    c.beginPath();
    c.moveTo(-s * 0.07, s * 0.05);
    c.lineTo(s * 0.07, s * 0.05);
    c.lineTo(0, s * 0.15);
    c.closePath();
    c.fill();
  },

  // One bloom on a short stem. Petals, not a circle — the plain ring with a dot
  // in it read as a lollipop.
  rose: (c, s) => {
    const cy = -s * 0.14;
    // Five outer petals around the bloom.
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      c.beginPath();
      c.moveTo(Math.cos(a) * s * 0.06, cy + Math.sin(a) * s * 0.06);
      c.quadraticCurveTo(
        Math.cos(a - 0.6) * s * 0.24,
        cy + Math.sin(a - 0.6) * s * 0.24,
        Math.cos(a + 0.5) * s * 0.2,
        cy + Math.sin(a + 0.5) * s * 0.2,
      );
      c.stroke();
    }
    // The spiral centre.
    c.lineWidth *= 0.72;
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2.6 - Math.PI / 2;
      const r = s * 0.02 + (i / 24) * s * 0.075;
      const x = Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.lineWidth /= 0.72;
    // Stem and one leaf.
    c.beginPath();
    c.moveTo(0, s * 0.1);
    c.lineTo(0, s * 0.48);
    c.moveTo(0, s * 0.3);
    c.quadraticCurveTo(s * 0.22, s * 0.24, s * 0.17, s * 0.4);
    c.stroke();
  },

  // A single fork.
  lightning: (c, s) => {
    c.beginPath();
    c.moveTo(s * 0.1, -s * 0.46);
    c.lineTo(-s * 0.14, -s * 0.04);
    c.lineTo(s * 0.06, -s * 0.04);
    c.lineTo(-s * 0.12, s * 0.46);
    c.stroke();
  },

  // Helmet, crescent crest, face mask. The old stack of lines read as a
  // shuttlecock.
  samurai: (c, s) => {
    // Helmet bowl.
    c.beginPath();
    c.moveTo(-s * 0.28, -s * 0.04);
    c.quadraticCurveTo(-s * 0.3, -s * 0.36, 0, -s * 0.36);
    c.quadraticCurveTo(s * 0.3, -s * 0.36, s * 0.28, -s * 0.04);
    c.stroke();
    // The crescent crest above it.
    c.beginPath();
    c.moveTo(-s * 0.22, -s * 0.36);
    c.quadraticCurveTo(0, -s * 0.58, s * 0.22, -s * 0.36);
    c.stroke();
    c.lineWidth *= 0.7;
    c.beginPath();
    c.moveTo(-s * 0.13, -s * 0.36);
    c.quadraticCurveTo(0, -s * 0.47, s * 0.13, -s * 0.36);
    c.stroke();
    c.lineWidth /= 0.7;
    // Brow flare, then the mask below it.
    c.beginPath();
    c.moveTo(-s * 0.32, -s * 0.02);
    c.lineTo(s * 0.32, -s * 0.02);
    c.stroke();
    c.beginPath();
    c.moveTo(-s * 0.2, s * 0.02);
    c.lineTo(-s * 0.14, s * 0.3);
    c.lineTo(s * 0.14, s * 0.3);
    c.lineTo(s * 0.2, s * 0.02);
    c.stroke();
    // Eye slits and the grille.
    c.lineWidth *= 0.66;
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.moveTo(sign * s * 0.16, s * 0.06);
      c.lineTo(sign * s * 0.05, s * 0.1);
      c.stroke();
    }
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.moveTo(-s * (0.16 - i * 0.02), s * (0.18 + i * 0.07));
      c.lineTo(s * (0.16 - i * 0.02), s * (0.18 + i * 0.07));
      c.stroke();
    }
    c.lineWidth /= 0.66;
  },

  // Two sockets and a jaw.
  skull: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.24, s * 0.06);
    c.quadraticCurveTo(-s * 0.28, -s * 0.4, 0, -s * 0.4);
    c.quadraticCurveTo(s * 0.28, -s * 0.4, s * 0.24, s * 0.06);
    c.stroke();
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.ellipse(sign * s * 0.11, -s * 0.14, s * 0.075, s * 0.09, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.lineWidth *= 0.75;
    c.beginPath();
    c.moveTo(-s * 0.16, s * 0.08);
    c.lineTo(s * 0.16, s * 0.08);
    for (let i = -1; i <= 1; i++) {
      c.moveTo(i * s * 0.1, s * 0.08);
      c.lineTo(i * s * 0.1, s * 0.24);
    }
    c.moveTo(-s * 0.16, s * 0.24);
    c.lineTo(s * 0.16, s * 0.24);
    c.stroke();
  },

  // A halo above a figure with two wings held out to the sides.
  angel: (c, s) => {
    c.beginPath();
    c.ellipse(0, -s * 0.42, s * 0.14, s * 0.05, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(0, -s * 0.28, s * 0.07, 0, Math.PI * 2);
    c.fill();
    // Body, short, so the wings dominate.
    c.beginPath();
    c.moveTo(0, -s * 0.21);
    c.lineTo(0, s * 0.18);
    c.stroke();
    for (const sign of [-1, 1]) {
      // Held out and slightly up, tip turning down at the very end.
      c.beginPath();
      c.moveTo(0, -s * 0.16);
      c.bezierCurveTo(sign * s * 0.24, -s * 0.3, sign * s * 0.44, -s * 0.22, sign * s * 0.46, s * 0.02);
      c.stroke();
      c.lineWidth *= 0.58;
      for (let i = 0; i < 4; i++) {
        const t = 0.1 + i * 0.1;
        c.beginPath();
        c.moveTo(sign * s * t, -s * (0.2 + i * 0.02));
        c.lineTo(sign * s * (t + 0.05), s * (0.02 + i * 0.03));
        c.stroke();
      }
      c.lineWidth /= 0.58;
    }
  },

  // Horns and a narrow stare.
  demon: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.22, s * 0.14);
    c.quadraticCurveTo(-s * 0.24, -s * 0.22, 0, -s * 0.24);
    c.quadraticCurveTo(s * 0.24, -s * 0.22, s * 0.22, s * 0.14);
    c.quadraticCurveTo(0, s * 0.42, -s * 0.22, s * 0.14);
    c.stroke();
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.moveTo(sign * s * 0.16, -s * 0.2);
      c.quadraticCurveTo(sign * s * 0.36, -s * 0.38, sign * s * 0.2, -s * 0.46);
      c.stroke();
      // Eye, angled down toward the middle.
      c.lineWidth *= 1.1;
      c.beginPath();
      c.moveTo(sign * s * 0.16, -s * 0.06);
      c.lineTo(sign * s * 0.04, s * 0.02);
      c.stroke();
      c.lineWidth /= 1.1;
    }
  },

  // Fire climbing, three tongues.
  flames: (c, s) => {
    for (const [dx, h] of [
      [-0.16, 0.62],
      [0.02, 0.9],
      [0.18, 0.54],
    ]) {
      c.beginPath();
      c.moveTo(s * dx - s * 0.1, s * 0.44);
      c.bezierCurveTo(s * dx + s * 0.12, s * 0.2, s * dx - s * 0.12, s * (0.44 - h * 0.5), s * dx, s * (0.44 - h));
      c.bezierCurveTo(s * dx + s * 0.14, s * (0.44 - h * 0.5), s * dx + s * 0.02, s * 0.2, s * dx + s * 0.1, s * 0.44);
      c.stroke();
    }
  },

  // Five points on a band.
  crown: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.32, s * 0.16);
    c.lineTo(-s * 0.32, -s * 0.1);
    for (let i = 0; i < 4; i++) {
      const x0 = -s * 0.32 + (i * s * 0.64) / 4;
      const x1 = x0 + s * 0.08;
      c.lineTo(x1, -s * 0.34 - (i === 1 || i === 2 ? s * 0.08 : 0));
      c.lineTo(x0 + s * 0.16, -s * 0.1);
    }
    c.lineTo(s * 0.32, -s * 0.1);
    c.lineTo(s * 0.32, s * 0.16);
    c.closePath();
    c.stroke();
    c.lineWidth *= 0.7;
    c.beginPath();
    c.moveTo(-s * 0.32, s * 0.02);
    c.lineTo(s * 0.32, s * 0.02);
    c.stroke();
  },

  // Blackwork bands, filled solid.
  tribal: (c, s) => {
    for (const [y, w] of [
      [-0.3, 0.3],
      [-0.06, 0.36],
      [0.2, 0.28],
    ]) {
      c.beginPath();
      c.moveTo(-s * w, s * y);
      c.quadraticCurveTo(0, s * y - s * 0.1, s * w, s * y);
      c.quadraticCurveTo(0, s * y + s * 0.05, -s * w, s * y);
      c.closePath();
      c.fill();
    }
  },

  // The ball and its seams.
  basketball: (c, s) => {
    c.beginPath();
    c.arc(0, 0, s * 0.32, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth *= 0.8;
    c.beginPath();
    c.moveTo(-s * 0.32, 0);
    c.lineTo(s * 0.32, 0);
    c.moveTo(0, -s * 0.32);
    c.lineTo(0, s * 0.32);
    c.stroke();
    c.beginPath();
    c.ellipse(0, 0, s * 0.13, s * 0.32, 0, 0, Math.PI * 2);
    c.stroke();
  },

  // Full span across a back: two wings off a short centre, held wide and flat
  // rather than hanging down. Uniform vertical feathers read as a comb.
  wings: (c, s) => {
    c.lineWidth *= 0.8;
    c.beginPath();
    c.moveTo(0, -s * 0.16);
    c.lineTo(0, s * 0.14);
    c.stroke();
    c.lineWidth /= 0.8;
    for (const sign of [-1, 1]) {
      // Leading edge, almost horizontal.
      c.beginPath();
      c.moveTo(sign * s * 0.02, -s * 0.14);
      c.bezierCurveTo(sign * s * 0.2, -s * 0.3, sign * s * 0.42, -s * 0.28, sign * s * 0.5, -s * 0.12);
      c.stroke();
      // Trailing edge, closing the wing into a shape.
      c.beginPath();
      c.moveTo(sign * s * 0.02, s * 0.02);
      c.quadraticCurveTo(sign * s * 0.26, -s * 0.04, sign * s * 0.5, -s * 0.12);
      c.stroke();
      // Four long primaries, swept back along the wing.
      c.lineWidth *= 0.6;
      for (let i = 0; i < 4; i++) {
        const t = 0.12 + i * 0.1;
        c.beginPath();
        c.moveTo(sign * s * t, -s * (0.2 + i * 0.02));
        c.quadraticCurveTo(sign * s * (t + 0.1), s * 0.04, sign * s * (t + 0.06), s * (0.14 + i * 0.05));
        c.stroke();
      }
      c.lineWidth /= 0.6;
    }
  },

  // The mask: tusks out, staring ahead.
  oni: (c, s) => {
    c.beginPath();
    c.moveTo(-s * 0.26, -s * 0.16);
    c.quadraticCurveTo(0, -s * 0.34, s * 0.26, -s * 0.16);
    c.quadraticCurveTo(s * 0.2, s * 0.34, 0, s * 0.42);
    c.quadraticCurveTo(-s * 0.2, s * 0.34, -s * 0.26, -s * 0.16);
    c.stroke();
    for (const sign of [-1, 1]) {
      // Horn.
      c.beginPath();
      c.moveTo(sign * s * 0.18, -s * 0.22);
      c.lineTo(sign * s * 0.28, -s * 0.46);
      c.stroke();
      // Brow and eye.
      c.beginPath();
      c.moveTo(sign * s * 0.06, -s * 0.1);
      c.lineTo(sign * s * 0.2, -s * 0.02);
      c.stroke();
      // Tusk.
      c.lineWidth *= 0.7;
      c.beginPath();
      c.moveTo(sign * s * 0.1, s * 0.14);
      c.lineTo(sign * s * 0.13, s * 0.28);
      c.stroke();
      c.lineWidth /= 0.7;
    }
    c.beginPath();
    c.moveTo(-s * 0.14, s * 0.14);
    c.lineTo(s * 0.14, s * 0.14);
    c.stroke();
  },

  // Small, high, eight legs.
  spider: (c, s) => {
    c.beginPath();
    c.ellipse(0, s * 0.04, s * 0.1, s * 0.15, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(0, -s * 0.16, s * 0.07, 0, Math.PI * 2);
    c.fill();
    c.lineWidth *= 0.6;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const y = -s * 0.1 + i * s * 0.1;
        c.beginPath();
        c.moveTo(sign * s * 0.06, y);
        c.quadraticCurveTo(sign * s * 0.28, y - s * 0.08, sign * s * 0.34, y + s * 0.1);
        c.stroke();
      }
    }
    c.lineWidth /= 0.6;
  },

  // A tear in it, with light coming through.
  rift: (c, s) => {
    c.beginPath();
    c.moveTo(0, -s * 0.48);
    c.lineTo(s * 0.1, -s * 0.18);
    c.lineTo(-s * 0.06, s * 0.06);
    c.lineTo(s * 0.08, s * 0.24);
    c.lineTo(-s * 0.02, s * 0.48);
    c.stroke();
    c.lineWidth *= 0.55;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -s * 0.28 + i * s * 0.26;
        c.beginPath();
        c.moveTo(sign * s * 0.04, y);
        c.lineTo(sign * s * (0.18 + i * 0.05), y + sign * s * 0.06);
        c.stroke();
      }
    }
    c.lineWidth /= 0.55;
  },
};
