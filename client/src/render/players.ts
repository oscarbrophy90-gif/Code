import { COURT, EMOTE_DURATION, STEAL_TIME, THREE_CELEBRATION_TIME, WIN_CELEBRATION_TIME, SKIN_TONES, type Appearance, type Ball, type MatchState, type SimPlayer } from '@hoops/shared';
import { emotePose, type EmotePose } from './emotes.ts';
import { dunkFlightPose, dunkHangPose } from './dunkstyle.ts';
import type { Camera } from '../engine/camera.ts';
import { hexA, mix } from './court.ts';
import { drawInk, inkedAt, tattooLook, type InkSpot } from './tattoos.ts';

/**
 * Players are drawn as articulated billboards: a stick-and-slab figure whose
 * limb angles are driven by the sim state, so animation always matches what
 * the simulation actually did.
 */
interface Gait {
  phase: number;
  amplitude: number;
}

export class PlayerRenderer {
  /** Per-player stride state, so the walk cycle is continuous across frames. */
  private gaits = new Map<number, Gait & { at: number; x: number; z: number }>();

  /**
   * Advances the walk cycle. Frequency rises with speed but the *phase* only
   * ever moves forward by frequency × dt, so changing speed bends the cycle
   * instead of teleporting it.
   */
  private gait(p: SimPlayer, time: number, speed: number): Gait {
    const prev = this.gaits.get(p.side);
    const dt = prev ? Math.max(0, Math.min(0.1, time - prev.at)) : 0;

    // Stride off the ground actually covered, not off the velocity. A stepback
    // is a displacement rather than a shove on the velocity, so a player who is
    // genuinely moving four feet backwards has vx/vz near zero — read the
    // velocity and he slides back with his legs still. Capped so a teleport
    // (inbound, possession reset) does not spin the legs.
    const moved = prev && dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : speed;
    const groundSpeed = Math.min(26, Math.max(speed, moved));

    // A real stride is roughly 5.5 ft, so steps per second is speed / 5.5, and
    // a full cycle is two steps. Plus a slow idle shuffle so a standing player
    // is not frozen solid.
    const stepsPerSecond = groundSpeed / 5.5;
    const frequency = (1.1 + stepsPerSecond) * Math.PI;
    const target = Math.min(1, groundSpeed / 7);

    const phase = (prev ? prev.phase : p.side * 2) + frequency * dt;
    // Ease the amplitude so starting and stopping does not snap the legs.
    const amplitude = prev ? prev.amplitude + (target - prev.amplitude) * Math.min(1, dt * 9) : target;

    const next = { phase: phase % (Math.PI * 2), amplitude, at: time, x: p.x, z: p.z };
    this.gaits.set(p.side, next);
    return next;
  }

  drawShadow(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number, y: number, radius: number): void {
    const p = cam.project(x, 0.01, z);
    if (p.depth <= 0) return;
    const lift = 1 / (1 + y * 0.24);
    ctx.save();
    ctx.globalAlpha = 0.36 * lift;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.scale * radius * (1 / lift) * 0.9, p.scale * radius * 0.42 * (1 / lift), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    p: SimPlayer,
    time: number,
    isLocal: boolean,
    hasBall: boolean,
  ): void {
    const feet = cam.project(p.x, p.y, p.z);
    if (feet.depth <= 0.05) return;

    const heightFt = (p.cfg.heightIn / 12) * 1.06;
    const s = feet.scale;
    const px = feet.x;
    const py = feet.y;

    // Everything you have on. A player without an appearance (an old save, a
    // preview stub) falls back to the two jersey colours the sim always carries.
    const look: Appearance = p.cfg.appearance ?? fallbackAppearance(p);
    const skin = SKIN_TONES[look.skinTone] ?? SKIN_TONES[3];
    const wearing = clothingKind(look.clothingId);
    const worn = accessoryKind(look.accessoryId);
    const ink = tattooLook(look.tattooId);
    const jersey = look.jerseyPrimary;
    const trim = look.jerseySecondary;

    // The ranked aura goes down first, so the figure stands in its light rather
    // than behind a wash of colour.
    if (look.auraId) drawAura(ctx, px, py, s, heightFt, look.auraId, time);

    const speed = Math.hypot(p.vx, p.vz);
    // Stride phase is accumulated, never derived from time * frequency: with a
    // frequency that changes as you accelerate, phase = t * f jumps by tens of
    // radians in a frame and the legs snap to a new position. That was the
    // twitching. Amplitude is eased too so a stop settles instead of popping.
    const gait = this.gait(p, time, speed);
    const stride = Math.sin(gait.phase) * gait.amplitude;

    // Pose selection straight off the sim state.
    let armLift = 0;
    let crouch = 0;
    let spread = 1;
    // Emotes need the arms to do different things, so they get their own
    // per-side overrides on top of the symmetric pose everything else uses.
    let armPose: EmotePose | null = null;
    let bob = 0;
    let poseLean = 0;
    switch (p.state) {
      case 'shooting': {
        const t = p.shotProfile ? Math.min(1, p.shotElapsed / p.shotProfile.meterDuration) : 0;
        armLift = 0.35 + t * 0.85;
        crouch = 0.22 * (1 - t);
        break;
      }
      case 'finishing': {
        // A live dunk plays its package's own choreography — the same style
        // the replay uses, so what you perform is what you rewatch. A layup
        // finish (no flight object) keeps the plain reach.
        if (p.dunk) {
          const t = p.dunk.duration > 0 ? 1 - p.stateTimer / p.dunk.duration : 1;
          armPose = dunkFlightPose(p.dunk.packageId, t);
          crouch = armPose.crouch;
          poseLean = armPose.lean;
          bob = armPose.bob;
        } else {
          armLift = 1.25;
        }
        break;
      }
      case 'rimHang': {
        // Hanging off the iron. The pose swings with the leftover violence of
        // the slam and settles as the timer runs down.
        if (p.dunk) {
          const remaining = p.dunk.hang > 0 ? p.stateTimer / p.dunk.hang : 0;
          armPose = dunkHangPose(p.dunk.packageId, remaining, time);
          crouch = armPose.crouch;
          poseLean = armPose.lean;
          bob = armPose.bob;
        } else {
          armLift = 1.5;
        }
        break;
      }
      case 'airborne':
        armLift = 1.25;
        break;
      case 'contesting':
        armLift = 1.4;
        spread = 1.25;
        break;
      case 'staggered':
        crouch = 0.5;
        spread = 1.5;
        break;
      case 'fallen':
        // Flat on the floor. Everything collapses toward the deck.
        crouch = 2.6;
        spread = 2.6;
        armLift = -0.5;
        break;
      case 'stealing': {
        // A reach, not a shrug. The lead hand shoots out low and forward at the
        // ball while the body drops and leans in after it, then it all comes
        // back. The old pose was a static half-raise held for a fifth of a
        // second, which read as nothing at all.
        const t = 1 - Math.max(0, Math.min(1, p.stateTimer / STEAL_TIME));
        const jab = Math.sin(Math.min(1, t * 1.15) * Math.PI);
        // The swipe goes low and wide rather than straight ahead. Reaching
        // forward is what a defender actually does, but the figure is a
        // billboard in front of a camera looking down the floor, so a forward
        // reach foreshortens into nothing — measured on screen it read as the
        // arms simply being apart. Across the body at ball height reads.
        const lead = p.dribbleHand > 0 ? 1 : 0;
        armPose = {
          arm: lead === 1 ? [0.3 * jab, -0.5 * jab] : [-0.5 * jab, 0.3 * jab],
          out: lead === 1 ? [1 - 0.25 * jab, 1 + 1.5 * jab] : [1 + 1.5 * jab, 1 - 0.25 * jab],
          fwd: lead === 1 ? [0, 0.55 * jab] : [0.55 * jab, 0],
          crouch: 0.3 + jab * 0.38,
          lean: 0.5 * jab,
          alpha: 1,
          bob: -0.14 * jab,
          spin: 0,
          stride: 1 + 0.6 * jab,
        };
        crouch = armPose.crouch;
        poseLean = armPose.lean;
        bob = armPose.bob;
        spread = 1.35;
        break;
      }
      case 'moveLock': {
        crouch = 0.34;
        spread = 1.2;
        const t = p.moveDuration > 0 ? Math.min(1, p.moveTimer / p.moveDuration) : 0;
        const swell = Math.sin(t * Math.PI);
        if (p.moveId === 'betweenLegs') {
          // Feet split wide so the ball has somewhere to go through.
          spread = 1.2 + swell * 1.5;
          crouch = 0.34 + swell * 0.24;
        } else if (p.moveId === 'hesitation') {
          // Sells the jumper: up on the toes with the arms rising.
          armLift = swell * 1.15;
          crouch = 0.34 * (1 - swell);
        } else if (p.moveId === 'crossover' || p.moveId === 'doubleCross') {
          spread = 1.2 + swell * 0.7;
        } else if (p.moveId === 'spin') {
          spread = 1.1;
        } else if (p.moveId === 'stepback' || p.moveId === 'snatchBack') {
          // Load into the plant foot, push off, then land wide and low ready to
          // rise. The dip is deepest at the push and opens out as he lands.
          crouch = 0.34 + swell * 0.42;
          spread = 1.2 + swell * 1.1;
          armLift = swell * 0.25;
        }
        break;
      }
      case 'emoting': {
        // Runs off the sim's own timer, so what you see is exactly as long as
        // the ball is unstealable — the animation is the tell for the rule.
        const t = 1 - Math.max(0, Math.min(1, p.emoteTimer / EMOTE_DURATION));
        const id = look.emoteSlots?.[p.emoteSlot] ?? null;
        armPose = emotePose(id, t);
        crouch = armPose.crouch;
        poseLean = armPose.lean;
        bob = armPose.bob;
        break;
      }
      case 'celebrating':
        armLift = 1.3 + Math.sin(time * 6) * 0.2;
        break;
      default:
        crouch = hasBall ? 0.2 : 0.12;
    }

    // A celebration wins over whatever the state machine had the body doing.
    // It is checked here rather than as an act state so it can never interfere
    // with the rules — nothing in the simulation reads it.
    let poseSpin = armPose ? armPose.spin : 0;
    let poseStride = armPose ? armPose.stride : 1;

    if (p.celebrationTimer > 0 && p.celebration) {
      const total = p.celebration === 'win' ? WIN_CELEBRATION_TIME : THREE_CELEBRATION_TIME;
      const id = p.celebration === 'win' ? look.celebrationId : look.threeCelebrationId;
      // The win celebration loops, because it plays until the results come up.
      const raw = 1 - Math.max(0, Math.min(1, p.celebrationTimer / total));
      armPose = emotePose(id, p.celebration === 'win' ? (raw * 3) % 1 : raw);
      crouch = armPose.crouch;
      poseLean = armPose.lean;
      bob = armPose.bob;
      poseSpin = armPose.spin;
      poseStride = armPose.stride;
    }

    // An emote poses the body outright; otherwise the lean comes from momentum.
    const lean =
      poseLean !== 0
        ? poseLean
        : Math.max(-0.5, Math.min(0.5, (p.vx * Math.cos(p.facing) - p.vz * Math.sin(p.facing)) / 22));

    // A fallen player keeps his full length — he is laid out flat rather than
    // squashed into a very short standing figure.
    const down = p.state === 'fallen';
    const bodyH = heightFt * (down ? 1 : 1 - crouch * 0.22);
    const hipY = bodyH * 0.48;
    const shoulderY = bodyH * 0.83;
    const headY = bodyH * 0.94;

    // Lying down is the standing pose tipped ninety degrees: what was height
    // becomes length along the floor, and everything sits just off the deck.
    // A small body turn, applied to every offset so the whole figure pivots
    // rather than only the arms swinging.
    const turnC = Math.cos(poseSpin);
    const turnS = Math.sin(poseSpin);
    const at = (yFt: number, dx = 0, dz = 0) =>
      down
        ? cam.project(p.x + yFt * 0.82 + dz * 0.4, 0.28 + Math.abs(dx) * 0.35, p.z + dx * 0.7)
        : cam.project(p.x + dx * turnC - dz * turnS, p.y + yFt + bob, p.z + dx * turnS + dz * turnC);

    const hip = at(hipY, lean * 0.3);
    const shoulder = at(shoulderY, lean * 0.55);
    const head = at(headY, lean * 0.7);
    const lineW = Math.max(1.6, s * 0.34);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (armPose && armPose.alpha < 1) ctx.globalAlpha = armPose.alpha;

    // Legs.
    ctx.strokeStyle = mix(skin, '#000000', 0.18);
    ctx.lineWidth = lineW * 0.92;
    const footSpread = 0.42 * spread * poseStride;
    // The forward-swinging foot leaves the floor. Without the lift the legs
    // scissor without ever stepping, which reads as sliding rather than running.
    const footAt = (sign: number) => {
      const swing = sign * stride * 0.78;
      const lift = Math.max(0, swing) * 0.55;
      return { swing, lift, node: at(0.06 + lift, sign * footSpread + swing, swing * 0.6) };
    };

    for (const sign of [-1, 1]) {
      const { swing, lift, node } = footAt(sign);
      const knee = at(hipY * 0.5 + lift * 0.4, sign * footSpread * 0.6 + swing * 0.45, swing * 0.3);
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
    }

    // Legwear, over the bare leg and under the shoe. Everything you can wear has
    // a bottom half — a hoodie or a cut-off tee is a top, and you are still in
    // shorts underneath — so this runs for every kind and only the hem moves.
    // It used to run for tights and long shorts alone, which meant plain shorts,
    // by far the most common thing in the store, drew nothing at all.
    const hem = LEG_HEM[wearing] ?? 0.62;
    {
      // A hem above the knee is a loose garment and hangs wider than the leg it
      // covers; tights are a second skin and barely wider.
      const loose = hem > 0.5;
      const toY = hem >= 1 ? 0.06 : hipY * hem;
      ctx.strokeStyle = look.clothingPrimary;
      ctx.lineWidth = lineW * (loose ? 1.34 : 1.0);
      for (const sign of [-1, 1]) {
        const { swing, lift } = footAt(sign);
        const knee = at(hipY * 0.5 + lift * 0.4, sign * footSpread * 0.6 + swing * 0.45, swing * 0.3);
        const end = at(Math.max(toY, 0.06 + lift), sign * footSpread + swing * (toY > 0.1 ? 0.7 : 1), swing * 0.6);
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        // Loose shorts stop above the knee, so they never bend with it.
        if (!loose) ctx.lineTo(knee.x, knee.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      // The waist, so the two legs read as one garment rather than two tubes.
      const waistL = at(hipY, -footSpread * 0.95 + lean * 0.3);
      const waistR = at(hipY, footSpread * 0.95 + lean * 0.3);
      ctx.lineWidth = lineW * (loose ? 1.1 : 0.9);
      ctx.beginPath();
      ctx.moveTo(waistL.x, waistL.y);
      ctx.lineTo(waistR.x, waistR.y);
      ctx.stroke();
      // Trim stripe down the outside seam, so a two-tone pair reads as two-tone.
      // Inset from the edge and stopping short of the hem, so it sits on the
      // fabric rather than hanging off it.
      if (s > 11) {
        ctx.strokeStyle = hexA(look.clothingSecondary, 0.85);
        ctx.lineWidth = Math.max(1, s * 0.06);
        for (const sign of [-1, 1]) {
          const { swing, lift } = footAt(sign);
          const hemY = Math.max(toY, 0.06 + lift);
          const stopY = hemY + (hipY * 0.9 - hemY) * 0.12;
          const top = at(hipY * 0.88, sign * (footSpread + 0.09) + lean * 0.3);
          const end = at(stopY, sign * (footSpread + 0.08) + swing * (toY > 0.1 ? 0.7 : 1), swing * 0.6);
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      }
    }

    // Shoes, in the colours of the pair you actually bought.
    for (const sign of [-1, 1]) {
      const { node } = footAt(sign);
      ctx.fillStyle = look.shoePrimary;
      ctx.beginPath();
      ctx.ellipse(node.x, node.y, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      // Midsole stripe, so a two-tone shoe reads as two-tone at this size.
      ctx.strokeStyle = look.shoeSecondary;
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath();
      ctx.ellipse(node.x, node.y + s * 0.07, s * 0.29, s * 0.09, 0, 0, Math.PI);
      ctx.stroke();
    }

    // Torso as a jersey slab.
    const shoulderHalf = 0.52 + (p.cfg.weightLb - 200) / 900;
    const tl = at(shoulderY, -shoulderHalf + lean * 0.55);
    const tr = at(shoulderY, shoulderHalf + lean * 0.55);
    const bl = at(hipY, -shoulderHalf * 0.74 + lean * 0.3);
    const br = at(hipY, shoulderHalf * 0.74 + lean * 0.3);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
    grad.addColorStop(0, mix(jersey, '#ffffff', 0.16));
    grad.addColorStop(1, mix(jersey, '#000000', 0.28));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = hexA(trim, 0.9);
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.stroke();

    // Your number, on the chest, big enough to read from the camera.
    if (!down && s > 9) {
      const cx = (tl.x + tr.x + bl.x + br.x) / 4;
      const cy = (tl.y + tr.y + bl.y + br.y) / 4;
      ctx.save();
      ctx.font = `900 ${s * 0.5}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hexA(trim, 0.92);
      ctx.fillText(String(look.jerseyNumber), cx, cy);
      ctx.restore();
    }

    // Arms. A sleeve, a tattoo or bare skin — whichever you have on, per side.
    const sleeved = wearing === 'compression' || wearing === 'hoodie' || wearing === 'tracksuit';
    const armColor = (sign: number) => {
      if (sleeved) return look.clothingPrimary;
      const inked = inkedAt(ink, sign < 0 ? 'armL' : 'armR');
      // Heavy ink darkens the arm it is on, and the glyph goes on top of that.
      // The darkening on its own was the whole of the old tattoo system.
      return inked ? mix(skin, '#181818', 0.34) : skin;
    };

    ctx.lineWidth = lineW * 0.92;
    const hands: { x: number; y: number }[] = [];
    // Hanging on the rim, the hands are not posed — they are pinned to the
    // iron itself. The grip points are projected with the same camera the
    // court renderer draws the rim with, so the fingers land on the drawn
    // hoop to the pixel whatever the body underneath is doing. Posing the
    // arms and hoping the heights lined up is exactly what had the hands
    // floating a few feet under the rim.
    let gripPoints: { x: number; y: number }[] | null = null;
    if (p.state === 'rimHang' && p.dunk) {
      const gx = p.x - COURT.rimX;
      const gz = p.z - COURT.rimZ;
      const glen = Math.hypot(gx, gz) || 1;
      // Perpendicular along the rim edge, so the two hands grip shoulder-width
      // apart on the iron rather than stacking on one point.
      const px = -gz / glen;
      const pz = gx / glen;
      const edgeX = COURT.rimX + (gx / glen) * 0.72;
      const edgeZ = COURT.rimZ + (gz / glen) * 0.72;
      gripPoints = [
        cam.project(edgeX - px * 0.42, COURT.rimY + 0.08, edgeZ - pz * 0.42),
        cam.project(edgeX + px * 0.42, COURT.rimY + 0.08, edgeZ + pz * 0.42),
      ];
    }
    // Where each glyph goes, collected as the limbs are drawn and inked at the
    // end so the linework always sits on top of the body, never under it.
    const inkSpots: InkSpot[] = [];
    for (const sign of [-1, 1]) {
      const i = sign < 0 ? 0 : 1;
      const raise = armPose ? armPose.arm[i] : armLift * (p.state === 'shooting' && sign < 0 ? 0.72 : 1);
      const out = (armPose ? armPose.out[i] : 1) * spread;
      // Forward reach is toward the rim, which is where the camera is looking
      // from, so a point or a mic drop reads as coming out of the screen.
      const reach = armPose ? armPose.fwd[i] : 0;
      // Arms are a little longer and a little wider than they were — at preview
      // size the old ones read as wires coming off the shoulders.
      let elbow = at(shoulderY - 0.38 + raise * 0.46, sign * (shoulderHalf + 0.3) * out, -raise * 0.12 + reach * 0.5);
      let hand = at(shoulderY - 0.76 + raise * 1.16, sign * (shoulderHalf + 0.2 + raise * 0.12) * out, -raise * 0.3 + reach);
      // A gripping hand goes where the iron is. The elbow follows: two thirds
      // of the way up the line from shoulder to grip, bowed slightly out, so
      // the arm reads as loaded rather than as a straight wire.
      if (gripPoints && raise > 1.2) {
        const shoulderPt = sign < 0 ? tl : tr;
        hand = { ...hand, x: gripPoints[i].x, y: gripPoints[i].y };
        elbow = {
          ...elbow,
          x: shoulderPt.x + (hand.x - shoulderPt.x) * 0.62 + sign * s * 0.16,
          y: shoulderPt.y + (hand.y - shoulderPt.y) * 0.62,
        };
      }
      hands.push(hand);
      ctx.strokeStyle = armColor(sign);
      ctx.beginPath();
      ctx.moveTo(sign < 0 ? tl.x : tr.x, sign < 0 ? tl.y : tr.y);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(hand.x, hand.y);
      ctx.stroke();
      // Fingers curled over the iron: a short hook past the grip point, drawn
      // in skin so it reads as a hand holding the rim rather than touching it.
      if (gripPoints && raise > 1.2) {
        ctx.strokeStyle = armColor(sign);
        ctx.lineWidth = lineW * 0.6;
        ctx.beginPath();
        ctx.moveTo(hand.x, hand.y);
        ctx.lineTo(hand.x + sign * s * 0.1, hand.y - s * 0.14);
        ctx.stroke();
        ctx.lineWidth = lineW * 0.92;
      }

      // A shooting sleeve is one arm only, over whatever is underneath.
      if (worn === 'armsleeve' && sign > 0) {
        ctx.strokeStyle = look.accessoryPrimary;
        ctx.lineWidth = lineW * 0.98;
        ctx.beginPath();
        ctx.moveTo(sign < 0 ? tl.x : tr.x, sign < 0 ? tl.y : tr.y);
        ctx.lineTo(elbow.x, elbow.y);
        ctx.stroke();
        ctx.lineWidth = lineW * 0.92;
      }
      // Arm ink runs along the upper arm, angled to the limb it is on, so it
      // turns with a raised arm instead of staying stubbornly upright.
      if (!sleeved && inkedAt(ink, sign < 0 ? 'armL' : 'armR')) {
        const shoulderPt = sign < 0 ? tl : tr;
        inkSpots.push({
          x: (shoulderPt.x + elbow.x) / 2,
          y: (shoulderPt.y + elbow.y) / 2,
          size: Math.hypot(elbow.x - shoulderPt.x, elbow.y - shoulderPt.y) * 1.05,
          angle: Math.atan2(elbow.y - shoulderPt.y, elbow.x - shoulderPt.x) - Math.PI / 2,
        });
      }
    }

    // Wristbands go on last so they sit on top of the arm.
    if (worn === 'wristbands') {
      ctx.fillStyle = look.accessoryPrimary;
      for (const hand of hands) {
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // A chain hangs off the collar and swings with the lean.
    if (worn === 'chain' && !down) {
      const drop = at(shoulderY - 0.45, lean * 1.5);
      ctx.strokeStyle = look.accessoryPrimary;
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(tl.x + (tr.x - tl.x) * 0.3, tl.y + (tr.y - tl.y) * 0.3);
      ctx.quadraticCurveTo(drop.x, drop.y, tl.x + (tr.x - tl.x) * 0.7, tl.y + (tr.y - tl.y) * 0.7);
      ctx.stroke();
    }

    const headR = s * 0.34;

    // A hoodie is sleeves and a hood, and nothing else — the jersey still shows
    // on the chest and you are still in shorts under it. The sleeves go on with
    // the arms above; the hood goes on here.
    //
    // It has to be drawn *under* the head, not over it. Drawn over, the fill is
    // a crescent poking out from behind the face and it reads as a halo.
    const hooded = wearing === 'hoodie' || wearing === 'tracksuit';
    if (hooded) {
      // Generously bigger than the head. At 1.3x the margin came out about three
      // pixels at match scale and the whole thing read as a halo rather than a
      // hood, so it now rises well clear of the crown and drapes to the collar.
      const hoodR = headR * 1.62;
      ctx.fillStyle = mix(look.clothingPrimary, '#000000', 0.08);
      ctx.beginPath();
      // Up over the crown, then down and out past the jaw to the shoulders, so
      // it hangs off the body instead of balancing on the head.
      ctx.moveTo(head.x - hoodR * 0.92, head.y + hoodR * 0.86);
      ctx.quadraticCurveTo(head.x - hoodR * 1.04, head.y - hoodR * 0.72, head.x, head.y - hoodR * 0.98);
      ctx.quadraticCurveTo(head.x + hoodR * 1.04, head.y - hoodR * 0.72, head.x + hoodR * 0.92, head.y + hoodR * 0.86);
      ctx.quadraticCurveTo(head.x, head.y + hoodR * 1.24, head.x - hoodR * 0.92, head.y + hoodR * 0.86);
      ctx.closePath();
      ctx.fill();
      // The inside of the hood, darker, so the face sits in a recess.
      ctx.fillStyle = mix(look.clothingPrimary, '#000000', 0.52);
      ctx.beginPath();
      ctx.ellipse(head.x, head.y + headR * 0.04, headR * 1.2, headR * 1.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head.
    ctx.beginPath();
    ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();

    if (hooded) {
      // The opening, drawn on top of the face's edge so the fabric reads as
      // wrapping around it. Only the top arc — the chin stays clear.
      ctx.strokeStyle = hexA(look.clothingSecondary, 0.95);
      ctx.lineWidth = Math.max(1.2, headR * 0.2);
      ctx.beginPath();
      ctx.arc(head.x, head.y - headR * 0.06, headR * 1.02, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();
    } else {
      // Hair, shaped by the style you have on rather than one arc for everyone.
      drawHair(ctx, head.x, head.y, headR, look.hairstyleId, look.hairPrimary, skin);
    }

    // Head-worn accessories go over the hair.
    if (worn === 'headband') {
      ctx.strokeStyle = look.accessorySecondary;
      ctx.lineWidth = headR * 0.42;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headR * 0.94, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    if (worn === 'goggles') {
      ctx.strokeStyle = look.accessoryPrimary;
      ctx.lineWidth = Math.max(1, headR * 0.16);
      ctx.beginPath();
      ctx.arc(head.x - headR * 0.34, head.y - headR * 0.05, headR * 0.3, 0, Math.PI * 2);
      ctx.moveTo(head.x + headR * 0.64, head.y - headR * 0.05);
      ctx.arc(head.x + headR * 0.34, head.y - headR * 0.05, headR * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (worn === 'snapback') {
      // Worn backwards: crown over the hair, brim out the back of the head.
      ctx.fillStyle = look.accessoryPrimary;
      ctx.beginPath();
      ctx.arc(head.x, head.y - headR * 0.08, headR * 1.0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      ctx.fillRect(head.x - headR, head.y - headR * 0.22, headR * 2, headR * 0.26);
      ctx.fillStyle = look.accessorySecondary;
      ctx.fillRect(head.x - headR * 1.62, head.y - headR * 0.2, headR * 0.66, headR * 0.2);
      // The button on top, which is the whole reason a cap reads as a cap.
      ctx.beginPath();
      ctx.arc(head.x, head.y - headR * 1.04, headR * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    if (worn === 'crown') {
      // Five points and a band. Small enough to play in, which is the joke.
      const cy = head.y - headR * 0.9;
      ctx.fillStyle = look.accessoryPrimary;
      ctx.beginPath();
      ctx.moveTo(head.x - headR * 0.9, cy);
      for (let i = 0; i < 5; i++) {
        const x = head.x - headR * 0.9 + (i / 4) * headR * 1.8;
        ctx.lineTo(x, cy - headR * (i % 2 === 0 ? 0.52 : 0.28));
        if (i < 4) ctx.lineTo(x + headR * 0.225, cy - headR * 0.06);
      }
      ctx.lineTo(head.x + headR * 0.9, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = look.accessorySecondary;
      ctx.fillRect(head.x - headR * 0.92, cy, headR * 1.84, headR * 0.2);
    }
    if (worn === 'earrings') {
      ctx.fillStyle = look.accessoryPrimary;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(head.x + sign * headR * 0.92, head.y + headR * 0.2, headR * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The rest of the ink. Collected here, drawn below, so every glyph lands on
    // top of the body part it belongs to rather than under the next thing drawn.
    if (ink.spots.size > 0 && !down) {
      const midX = (tl.x + tr.x) / 2;
      const chestW = Math.hypot(tr.x - tl.x, tr.y - tl.y);

      // A jersey is a tank top: a chest piece shows in the neckline and across
      // the collarbones, not over the middle of the shirt.
      if (inkedAt(ink, 'chest')) {
        inkSpots.push({
          x: midX,
          y: tl.y + (bl.y - tl.y) * 0.16,
          size: chestW * 0.46,
          angle: 0,
        });
      }

      // A back piece is only there to be seen from behind, and on offence you
      // are facing the rim, which is away from the camera — so when your back is
      // turned it goes on full size, and from the front you get the bit that
      // comes over the traps, which is all you would really see.
      if (inkedAt(ink, 'back')) {
        const backTurned = Math.cos(p.facing) < 0;
        inkSpots.push({
          x: midX,
          y: backTurned ? (tl.y + bl.y) / 2 : tl.y + (bl.y - tl.y) * 0.08,
          size: backTurned ? chestW * 0.82 : chestW * 0.34,
          angle: 0,
        });
      }

      if (inkedAt(ink, 'neck')) {
        // Tucked under the jaw. Any lower and the jersey collar swallows it.
        inkSpots.push({
          x: head.x + headR * 0.34,
          y: head.y + headR * 0.76,
          size: headR * 0.82,
          angle: 0.2,
        });
      }

      if (inkedAt(ink, 'head')) {
        inkSpots.push({
          x: head.x + headR * 0.42,
          y: head.y + headR * 0.06,
          size: headR * 1.05,
          angle: 0,
        });
      }

      // Leg ink goes on the shin. The thigh is mostly under the shorts and the
      // gap between hem and knee is a few pixels at match scale.
      for (const sign of [-1, 1]) {
        if (!inkedAt(ink, sign < 0 ? 'legL' : 'legR')) continue;
        const { swing, lift, node } = footAt(sign);
        const knee = at(hipY * 0.5 + lift * 0.4, sign * footSpread * 0.6 + swing * 0.45, swing * 0.3);
        // Biased up the shin, and short of its full length, so the art stays on
        // the leg instead of spilling over the shoe and onto the floor.
        inkSpots.push({
          x: knee.x + (node.x - knee.x) * 0.42,
          y: knee.y + (node.y - knee.y) * 0.42,
          size: Math.hypot(node.x - knee.x, node.y - knee.y) * 0.76,
          angle: Math.atan2(node.y - knee.y, node.x - knee.x) - Math.PI / 2,
        });
      }
    }

    // Ink, all of it, last. Fainter on a small figure so a whole-body piece does
    // not turn a distant player into a black smudge.
    if (inkSpots.length > 0) {
      const alpha = Math.min(0.92, 0.42 + s * 0.03);
      for (const spot of inkSpots) drawInk(ctx, ink, spot, alpha);
    }

    // Local-player ring so you always know which one you are.
    if (isLocal) {
      const ring = cam.project(p.x, 0.02, p.z);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.scale * 1.5, ring.scale * 0.62, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hexA('#3ef07a', 0.85);
      ctx.lineWidth = Math.max(1.5, ring.scale * 0.11);
      ctx.stroke();
    }

    // Stagger / ankle-break wobble marker.
    if (p.stagger > 0.05) {
      const ring = cam.project(p.x, 0.03, p.z);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.scale * 1.9 * p.stagger, ring.scale * 0.8 * p.stagger, 0, 0, Math.PI * 2);
      ctx.strokeStyle = hexA('#ff4d5e', 0.6 * p.stagger);
      ctx.lineWidth = Math.max(1.5, ring.scale * 0.1);
      ctx.stroke();
    }

    // Stamina ring above the head, only when it starts to matter.
    if (p.stamina < 0.62) {
      const top = cam.project(p.x, p.y + heightFt + 0.7, p.z);
      const w = s * 1.5;
      ctx.fillStyle = 'rgba(8,10,14,0.7)';
      ctx.fillRect(top.x - w / 2, top.y, w, s * 0.16);
      ctx.fillStyle = p.stamina < 0.3 ? '#ff4d5e' : '#ffc53d';
      ctx.fillRect(top.x - w / 2, top.y, w * p.stamina, s * 0.16);
    }

    ctx.restore();
  }

  drawBall(ctx: CanvasRenderingContext2D, cam: Camera, ball: Ball, time: number): void {
    const p = cam.project(ball.x, ball.y, ball.z);
    if (p.depth <= 0.05) return;
    const r = Math.max(2, p.scale * 0.4);

    // Ground shadow.
    const sh = cam.project(ball.x, 0.01, ball.z);
    if (sh.depth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3 / (1 + ball.y * 0.2);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, sh.scale * 0.42, sh.scale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(p.x - r * 0.34, p.y - r * 0.34, r * 0.15, p.x, p.y, r);
    g.addColorStop(0, '#ffa463');
    g.addColorStop(0.6, '#ef7a2f');
    g.addColorStop(1, '#a8441a');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Seams, spinning with flight time.
    ctx.strokeStyle = 'rgba(40,18,8,0.75)';
    ctx.lineWidth = Math.max(0.7, r * 0.11);
    const spin = time * 5 + ball.flightTime * 9;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * Math.abs(Math.cos(spin)), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * Math.abs(Math.sin(spin + 1)), r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Shows where an in-flight shot will land, which teaches shot feedback. */
  drawShotTrail(ctx: CanvasRenderingContext2D, cam: Camera, state: MatchState): void {
    const ball = state.ball;
    if (ball.state !== 'shot') return;
    ctx.save();
    ctx.strokeStyle = ball.shotWillGoIn ? 'rgba(62,240,122,0.35)' : 'rgba(255,122,61,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const x = ball.fromX + (ball.toX - ball.fromX) * t;
      const z = ball.fromZ + (ball.toZ - ball.fromZ) * t;
      const arcY = 4 * (ball.apex - (ball.fromY + ball.toY) / 2) * t * (1 - t);
      const y = ball.fromY + (ball.toY - ball.fromY) * t + arcY;
      const pr = cam.project(x, y, z);
      if (pr.depth <= 0) continue;
      if (!started) {
        ctx.moveTo(pr.x, pr.y);
        started = true;
      } else ctx.lineTo(pr.x, pr.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Distance-to-rim readout on the floor, so shot value is never a guess. */
  drawRangeMarker(ctx: CanvasRenderingContext2D, cam: Camera, p: SimPlayer, isThree: boolean): void {
    const marker = cam.project(p.x, 0.04, p.z);
    if (marker.depth <= 0) return;
    ctx.save();
    ctx.font = `800 ${Math.max(9, marker.scale * 0.42)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isThree ? 'rgba(62,240,122,0.9)' : 'rgba(238,242,248,0.6)';
    ctx.fillText(isThree ? '2PT' : '1PT', marker.x, marker.y + marker.scale * 0.95);
    ctx.restore();
  }
}

export const RIM_WORLD = { x: COURT.rimX, y: COURT.rimY, z: COURT.rimZ };

/**
 * A player the renderer was handed without an appearance still has to be drawn,
 * so build one out of the two colours the sim always carries.
 */
function fallbackAppearance(p: SimPlayer): Appearance {
  return {
    skinTone: p.cfg.skinTone,
    jerseyPrimary: p.cfg.jerseyPrimary,
    jerseySecondary: p.cfg.jerseySecondary,
    shoePrimary: '#f2f2f2',
    shoeSecondary: p.cfg.jerseySecondary,
    clothingId: 'cloth-shorts-basic',
    clothingPrimary: '#3a4050',
    clothingSecondary: '#8a93a6',
    accessoryId: null,
    accessoryPrimary: '#3a4050',
    accessorySecondary: '#3a4050',
    hairstyleId: 'hair-fade',
    hairPrimary: '#241a17',
    tattooId: 'tat-none',
    jerseyNumber: 0,
    emoteSlots: [],
    celebrationId: 'celeb-nod',
    threeCelebrationId: 'three-none',
    auraId: null,
  };
}

/**
 * The aura, drawn on the floor under a player who has earned one.
 *
 * Light pooled at the feet and rising, rather than an outline around the body:
 * an outline reads as a selection highlight and a UI element is the last thing
 * a trophy should look like. It breathes slowly so it is alive without pulling
 * the eye off the ball.
 */
function drawAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  heightFt: number,
  auraId: string,
  time: number,
): void {
  const colors = AURA_COLORS[auraId] ?? AURA_COLORS.default;
  const breath = 0.86 + Math.sin(time * 1.6) * 0.14;
  const rx = scale * 0.95 * breath;
  const ry = scale * 0.34 * breath;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // The pool on the floor.
  const pool = ctx.createRadialGradient(x, y, 0, x, y, rx);
  pool.addColorStop(0, `${colors[0]}8c`);
  pool.addColorStop(0.55, `${colors[1]}4d`);
  pool.addColorStop(1, `${colors[1]}00`);
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Embers climbing the figure. Seeded off the position so two players in the
  // same aura are not in lockstep.
  const bodyH = scale * heightFt * 0.42;
  for (let i = 0; i < 7; i++) {
    const phase = (time * 0.55 + i * 0.37 + x * 0.004) % 1;
    const ex = x + Math.sin(phase * Math.PI * 2 + i) * scale * 0.42;
    const ey = y - phase * bodyH;
    const r = Math.max(0.8, scale * 0.055 * (1 - phase));
    ctx.globalAlpha = 0.7 * (1 - phase);
    ctx.fillStyle = i % 2 === 0 ? colors[0] : colors[1];
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Every aura's two colours, keyed by item id. */
const AURA_COLORS: Record<string, [string, string]> = {
  'aura-royal-rank': ['#ffd23d', '#ff5c8a'],
  default: ['#ffd23d', '#ff7a3d'],
};

/**
 * Each hairstyle is a different silhouette on top of the head. At this size the
 * outline is all you get, so the styles are separated by shape and height
 * rather than by detail.
 */
function drawHair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  styleId: string,
  hair: string,
  skin: string,
): void {
  const style = hairKind(styleId);
  if (style === 'bald') return;
  ctx.save();
  ctx.fillStyle = hair;
  ctx.strokeStyle = hair;
  ctx.lineCap = 'round';

  switch (style) {
    case 'afro':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.2, r * 0.98, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 'curls':
      // A cap of overlapping curls rather than one smooth dome.
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(x + i * r * 0.32, y - r * 0.42 + Math.abs(i) * r * 0.14, r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'highfade':
      // Squared off and tall.
      ctx.fillRect(x - r * 0.74, y - r * 1.28, r * 1.48, r * 0.86);
      ctx.beginPath();
      ctx.arc(x, y - r * 0.42, r * 0.8, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 'braids':
    case 'cornrows': {
      ctx.beginPath();
      ctx.arc(x, y - r * 0.06, r * 0.79, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineWidth = r * 0.44;
      ctx.stroke();
      // Rows running back over the skull, and tails past the neck for braids.
      ctx.lineWidth = Math.max(1, r * 0.11);
      ctx.strokeStyle = mix(hair, '#000000', 0.45);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * r * 0.26, y - r * 0.78);
        ctx.lineTo(x + i * r * 0.3, y - r * 0.05);
        if (styleId === 'hair-braids') ctx.lineTo(x + i * r * 0.34, y + r * 0.6);
        ctx.stroke();
      }
      break;
    }
    case 'locs':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.06, r * 0.8, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineWidth = r * 0.46;
      ctx.stroke();
      ctx.lineWidth = r * 0.22;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * r * 0.34, y - r * 0.34);
        ctx.lineTo(x + i * r * 0.44, y + r * 0.9);
        ctx.stroke();
      }
      break;
    case 'twists':
      // Short two-strand twists: a cap of paired coils with gaps between them,
      // which is what separates them from curls at this size.
      ctx.lineWidth = r * 0.17;
      for (let i = -3; i <= 3; i++) {
        const bx = x + i * r * 0.27;
        const by = y - r * 0.34 - Math.max(0, 3 - Math.abs(i)) * r * 0.09;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + r * 0.1, by - r * 0.22, bx - r * 0.04, by - r * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx - r * 0.1, by - r * 0.22, bx + r * 0.06, by - r * 0.4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y - r * 0.08, r * 0.82, Math.PI * 1.06, Math.PI * 1.94);
      ctx.lineWidth = r * 0.2;
      ctx.stroke();
      break;
    case 'topknot':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.04, r * 0.82, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = r * 0.36;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - r * 1.05, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'buzz':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.02, r * 0.88, Math.PI * 1.06, Math.PI * 1.94);
      ctx.lineWidth = r * 0.2;
      ctx.stroke();
      break;
    case 'waves':
      ctx.beginPath();
      ctx.arc(x, y - r * 0.02, r * 0.85, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = r * 0.3;
      ctx.stroke();
      ctx.strokeStyle = mix(hair, skin, 0.35);
      ctx.lineWidth = Math.max(0.8, r * 0.07);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x, y - r * (0.1 + i * 0.14), r * (0.82 - i * 0.1), Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      break;
    default:
      // Low fade: close on the sides, a little height on top.
      ctx.beginPath();
      ctx.arc(x, y - r * 0.03, r * 0.86, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineWidth = r * 0.28;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * What a clothing or accessory id actually is, so the renderer can draw it.
 *
 * Generated ids carry their kind in the second segment (`cloth-compression-g12`,
 * `acc-chain-m-relic`) precisely so this stays a string split rather than a
 * lookup table that has to grow with the catalogue. The originals predate the
 * convention and are matched by their whole id.
 */
function kindOf(id: string | null | undefined, legacy: Record<string, string>, fallback: string): string {
  if (!id) return fallback;
  if (legacy[id]) return legacy[id];
  const parts = id.split('-');
  return parts.length > 1 ? parts[1] : fallback;
}

/**
 * Where each kind of legwear stops, as a fraction of hip height — so a bigger
 * number is a shorter garment. 1 or more means it runs all the way to the shoe.
 *
 * Anything not listed is a top (a hoodie, a cut-off tee) and you are still in
 * shorts under it, which is what the default covers.
 */
const LEG_HEM: Record<string, number> = {
  compression: 1,
  tracksuit: 1,
  longshorts: 0.4,
  shorts: 0.62,
  cutoff: 0.62,
  hoodie: 0.62,
};

const LEGACY_CLOTHING: Record<string, string> = {
  'cloth-shorts-basic': 'shorts',
  'cloth-compression': 'compression',
  'cloth-hoodie': 'hoodie',
  'cloth-vintage': 'hoodie',
  'cloth-cutoff': 'cutoff',
  'cloth-longshorts': 'longshorts',
  'cloth-tracksuit': 'tracksuit',
};

const LEGACY_ACCESSORY: Record<string, string> = {
  'acc-none': 'none',
  'acc-headband': 'headband',
  'acc-armsleeve': 'armsleeve',
  'acc-chain': 'chain',
  'acc-goggles': 'goggles',
  'acc-wristbands': 'wristbands',
  'acc-kneepad': 'kneepad',
  'acc-mouthguard': 'mouthguard',
  'acc-earrings': 'earrings',
};

/**
 * Which hairstyle to draw.
 *
 * Same second-segment convention as everything else, so `hair-braids-rank-elite`
 * is braids and `hair-locs-rank-royal` is locs without either needing its own
 * case. A ranked reward that renders as the default fade would be a reward
 * nobody can see they won.
 */
export function hairKind(id: string | null | undefined): string {
  if (!id) return 'fade';
  const parts = id.split('-');
  return parts.length > 1 ? parts[1] : 'fade';
}

export function clothingKind(id: string | null | undefined): string {
  return kindOf(id, LEGACY_CLOTHING, 'shorts');
}

export function accessoryKind(id: string | null | undefined): string {
  return kindOf(id, LEGACY_ACCESSORY, 'none');
}
