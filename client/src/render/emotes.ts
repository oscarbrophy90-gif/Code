/**
 * What the body does during each emote.
 *
 * The player renderer poses off a small set of numbers, so an emote is just a
 * function from "how far through am I" to those numbers. Keeping them here
 * rather than in the renderer means the store preview and the court run the
 * exact same animation — a preview that animates differently from the game is
 * worse than no preview.
 */
export interface EmotePose {
  /** how high each arm is raised, left then right. 0 = down, 1.4 = straight up */
  arm: [number, number];
  /** how far each arm is held out from the body */
  out: [number, number];
  /** how far each arm reaches forward, toward the camera */
  fwd: [number, number];
  /** knees bent, 0..1 */
  crouch: number;
  /** body tilt, positive leans forward */
  lean: number;
  /** whole figure opacity, for the ones that are meant to vanish */
  alpha: number;
  /** vertical bob in feet */
  bob: number;
}

const REST: EmotePose = { arm: [0, 0], out: [1, 1], fwd: [0, 0], crouch: 0.14, lean: 0, alpha: 1, bob: 0 };

/** Smooth 0→1→0 over the emote, so nothing snaps in or out. */
function envelope(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

/** Eases in and holds, for poses that should arrive and stay put. */
function hold(t: number): number {
  return Math.min(1, t * 4) * Math.min(1, (1 - t) * 6);
}

/**
 * The pose for one emote at a point in its run. Anything unrecognised gets a
 * generic one-arm raise rather than standing still, so a new emote in the
 * catalogue is never invisible.
 */
export function emotePose(id: string | null, t: number): EmotePose {
  const e = envelope(t);
  const h = hold(t);
  const p: EmotePose = { ...REST, arm: [0, 0], out: [1, 1], fwd: [0, 0] };

  switch (id) {
    case 'emote-wave':
      // One arm up, waving from the elbow.
      p.arm = [0, 1.25 * h];
      p.out = [1, 1 + Math.sin(t * Math.PI * 6) * 0.45 * h];
      break;

    case 'emote-clap':
      // Both hands meet in front of the chest, slowly, three times.
      p.arm = [0.55 * h, 0.55 * h];
      p.fwd = [0.5 * h, 0.5 * h];
      p.out = [1 - 0.55 * h * (0.5 + 0.5 * Math.sin(t * Math.PI * 6)), 1 - 0.55 * h * (0.5 + 0.5 * Math.sin(t * Math.PI * 6))];
      break;

    case 'emote-bow':
      // Folded at the waist, arm across the middle.
      p.lean = 0.9 * h;
      p.crouch = 0.14 + 0.3 * h;
      p.arm = [0.2 * h, -0.25 * h];
      p.fwd = [0.3 * h, 0.2 * h];
      break;

    case 'emote-sit':
      // All the way down, hands on the floor behind.
      p.crouch = 0.14 + 0.85 * h;
      p.arm = [-0.5 * h, -0.5 * h];
      p.out = [1 + 0.5 * h, 1 + 0.5 * h];
      break;

    case 'emote-shrug':
      // Palms up, arms out wide, held.
      p.arm = [0.45 * h, 0.45 * h];
      p.out = [1 + 0.85 * h, 1 + 0.85 * h];
      p.bob = 0.12 * h;
      break;

    case 'emote-point':
      // One arm straight out down the floor at them.
      p.arm = [0, 0.5 * h];
      p.fwd = [0, 1.5 * h];
      p.out = [1, 1 + 0.2 * h];
      break;

    case 'emote-flex':
      // Both arms up and bent, elbows wide, held tight.
      p.arm = [1.05 * h, 1.05 * h];
      p.out = [1 + 0.75 * h, 1 + 0.75 * h];
      p.crouch = 0.14 + 0.24 * h;
      break;

    case 'emote-facepalm':
      // One hand to the face, head down.
      p.arm = [0, 1.15 * h];
      p.out = [1, 1 - 0.7 * h];
      p.lean = 0.35 * h;
      break;

    case 'emote-heartbreak':
      // Hand flat on the chest, leaning back.
      p.arm = [0.75 * h, 0];
      p.out = [1 - 0.75 * h, 1];
      p.fwd = [0.35 * h, 0];
      p.lean = -0.5 * h;
      break;

    case 'emote-callit':
      // Arm out, pointing down at the spot.
      p.arm = [0, 0.1 * h];
      p.fwd = [0, 1.2 * h];
      p.out = [1, 1 + 0.5 * h];
      p.lean = 0.2 * h;
      break;

    case 'emote-nonono':
      // One finger up, swinging side to side.
      p.arm = [0, 1.35 * h];
      p.out = [1, 1 + Math.sin(t * Math.PI * 8) * 0.6 * h];
      p.fwd = [0, 0.4 * h];
      break;

    case 'emote-timeout':
      // A T: one arm flat across, one straight up underneath it.
      p.arm = [0.95 * h, 0.35 * h];
      p.out = [1 + 0.3 * h, 1 - 0.55 * h];
      p.fwd = [0.5 * h, 0.7 * h];
      break;

    case 'emote-crown':
      // Both hands come up over the head and set it down.
      p.arm = [1.4 * h, 1.4 * h];
      p.out = [1 - 0.45 * h, 1 - 0.45 * h];
      p.bob = -0.18 * h;
      break;

    case 'emote-mic':
      // Arm out to the side, then it drops away.
      p.arm = [0, t < 0.55 ? 0.9 * Math.min(1, t * 4) : 0.9 * Math.max(0, 1 - (t - 0.55) * 5)];
      p.out = [1, 1 + 0.7 * h];
      break;

    case 'emote-ghost':
      // Fades out entirely, arms loose, then comes back.
      p.alpha = 1 - 0.92 * e;
      p.arm = [0.3 * e, 0.3 * e];
      p.bob = 0.5 * e;
      break;

    // Celebrations are previewed through the same code.
    case 'celeb-nod':
      p.lean = 0.3 * Math.sin(t * Math.PI * 4);
      break;
    case 'celeb-shrug':
      p.arm = [0.45 * h, 0.45 * h];
      p.out = [1 + 0.85 * h, 1 + 0.85 * h];
      break;
    case 'celeb-cold':
      p.arm = [0.6 * h, 0.35 * h];
      p.out = [1 - 0.5 * h, 1 - 0.2 * h];
      p.fwd = [0.5 * h, 0.2 * h];
      break;
    case 'celeb-flex':
      p.arm = [1.05 * h, 1.05 * h];
      p.out = [1 + 0.75 * h, 1 + 0.75 * h];
      p.crouch = 0.14 + 0.24 * h;
      break;
    case 'celeb-crown':
      p.arm = [1.4 * h, 1.4 * h];
      p.out = [1 - 0.45 * h, 1 - 0.45 * h];
      break;
    case 'celeb-toobig':
      p.arm = [0, 1.45 * h];
      p.out = [1, 1 - 0.3 * h];
      break;
    case 'celeb-nightnight':
      p.arm = [1.1 * h, 1.1 * h];
      p.out = [1 - 0.6 * h, 1 - 0.6 * h];
      p.lean = 0.3 * h;
      break;
    case 'celeb-walkoff':
      p.lean = 0.25 * h;
      p.arm = [-0.2 * h, -0.2 * h];
      break;
    case 'celeb-lights':
    case 'celeb-blackout':
      p.alpha = 1 - 0.75 * e;
      p.arm = [1.2 * h, 1.2 * h];
      p.out = [1 + 0.4 * h, 1 + 0.4 * h];
      break;

    // ---- three-point celebrations, fired the moment one drops ----
    case 'three-none':
      // Straight back on defence. A brief look and nothing more.
      p.lean = 0.12 * h;
      break;
    case 'three-hold':
      // Wrist frozen in the follow-through.
      p.arm = [0.2 * h, 1.3 * Math.min(1, t * 5)];
      p.out = [1, 1 - 0.25 * h];
      break;
    case 'three-threetothehead':
      // Three fingers to the temple.
      p.arm = [0, 1.2 * h];
      p.out = [1, 1 - 0.72 * h];
      p.fwd = [0, 0.15 * h];
      break;
    case 'three-cold':
      p.arm = [0.65 * h, 0.35 * h];
      p.out = [1 - 0.55 * h, 1 - 0.2 * h];
      p.fwd = [0.55 * h, 0.2 * h];
      p.lean = -0.2 * h;
      break;
    case 'three-goggles':
      // Both hands framing the eyes.
      p.arm = [1.15 * h, 1.15 * h];
      p.out = [1 - 0.68 * h, 1 - 0.68 * h];
      p.fwd = [0.35 * h, 0.35 * h];
      break;
    case 'three-bang':
      // Two shots fired down the floor, on the beat.
      p.arm = [0.3 * h, 0.5 * h + 0.25 * Math.max(0, Math.sin(t * Math.PI * 4))];
      p.fwd = [0.2 * h, 1.35 * h];
      p.out = [1, 1 + 0.25 * h];
      break;
    case 'three-shimmy':
      // Shoulders going, backpedalling.
      p.arm = [0.5 * h, 0.5 * h];
      p.out = [1 + 0.5 * h + Math.sin(t * Math.PI * 9) * 0.3 * h, 1 + 0.5 * h - Math.sin(t * Math.PI * 9) * 0.3 * h];
      p.lean = Math.sin(t * Math.PI * 9) * 0.22 * h;
      break;
    case 'three-fromdeep':
      // Arms wide to the whole park.
      p.arm = [0.7 * h, 0.7 * h];
      p.out = [1 + 1.15 * h, 1 + 1.15 * h];
      p.lean = -0.25 * h;
      p.bob = 0.14 * h;
      break;
    case 'three-toosmall':
      p.arm = [0, 1.45 * h];
      p.out = [1, 1 - 0.35 * h];
      p.fwd = [0, 0.55 * h];
      break;
    case 'three-lightsout':
      p.alpha = 1 - 0.8 * e;
      p.arm = [1.15 * h, 1.15 * h];
      p.out = [1 + 0.35 * h, 1 + 0.35 * h];
      break;

    default:
      // Something new in the catalogue with no choreography yet still moves.
      p.arm = [0.4 * h, 1.1 * h];
      p.out = [1, 1 + 0.3 * h];
      break;
  }
  return p;
}
