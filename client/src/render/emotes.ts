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
  /** body turn in radians — small, the figure pivots about its feet */
  spin: number;
  /** how far apart the feet are, for anything that steps or struts */
  stride: number;
}

const REST: EmotePose = { arm: [0, 0], out: [1, 1], fwd: [0, 0], crouch: 0.14, lean: 0, alpha: 1, bob: 0, spin: 0, stride: 1 };

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
      // Everything else is choreographed from its own id. There are two hundred
      // performances in the catalogue and hand-posing them all would produce
      // worse animation than this does, not better.
      return derivedPose(id, t, h, e);
  }
  return p;
}

/** Stable hash of an id, so an item animates the same way forever. */
function hashId(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

/**
 * The shapes an emote can take.
 *
 * The first version of this had eight families that all amounted to "arms
 * somewhere", so two hundred emotes read as one emote at different heights.
 * These are separated by what the *body* does as much as the arms — some walk,
 * some turn their back, some drop into a stance, some hold dead still — and by
 * timing, because a single held pose and a thing that happens four times look
 * nothing alike even with identical limbs.
 */
type Shape =
  | 'point' | 'pointUp' | 'pointDown' | 'doublePoint' | 'wave' | 'clap' | 'flex'
  | 'bow' | 'crown' | 'shrug' | 'nod' | 'shake' | 'wag' | 'walk' | 'strut'
  | 'turn' | 'freeze' | 'heart' | 'camera' | 'shush' | 'sleep' | 'ice'
  | 'measure' | 'stance' | 'sit' | 'toss' | 'spinBall' | 'beckon' | 'dismiss'
  | 'chest' | 'tug' | 'kneel' | 'conduct' | 'guitar' | 'fistPump' | 'shoulder'
  | 'bounce' | 'roll' | 'vanish' | 'cold' | 'guard' | 'throne' | 'rain'
  | 'stomp' | 'groove' | 'salute' | 'dust' | 'lasso' | 'reload' | 'breathe'
  | 'crossover';

/**
 * Names carry the movement. "Finger Wag" wags, "Night Night" goes to sleep,
 * "Take a Seat" sits down — read straight off the item name so a hundred
 * hand-named emotes do the hundred things they are named after, rather than
 * getting whatever a hash felt like.
 */
const SHAPE_KEYWORDS: [string, Shape][] = [
  ['three-fingers', 'pointUp'], ['three-to-the-sky', 'pointUp'], ['point-to-the-sky', 'pointUp'],
  ['point-down', 'pointDown'], ['floor-tap', 'kneel'], ['shoe-point', 'pointDown'], ['knee-tap', 'kneel'],
  ['double-point', 'doublePoint'], ['clap-and-point', 'doublePoint'], ['no-look-point', 'point'],
  ['crowd-point', 'point'], ['bench-point', 'point'], ['camera-point', 'camera'], ['invisible-camera', 'camera'],
  ['lightning-point', 'point'], ['shoulder-point', 'shoulder'], ['one-finger-point', 'point'], ['point', 'point'],
  ['wave-to-the-crowd', 'wave'], ['wave-goodbye', 'wave'], ['one-hand-wave', 'wave'], ['wave', 'wave'],
  ['huddle-clap', 'clap'], ['slow-clap', 'clap'], ['clap-back', 'clap'], ['clap', 'clap'],
  ['quick-flex', 'flex'], ['mini-flex', 'flex'], ['big-flex', 'flex'], ['slow-motion-flex', 'flex'],
  ['backpedal-flex', 'flex'], ['flex', 'flex'],
  ['royal-bow', 'bow'], ['quick-bow', 'bow'], ['bow-to-the-crowd', 'bow'], ['bow', 'bow'],
  ['crown-the-court', 'crown'], ['invisible-crown', 'crown'], ['crown-gesture', 'crown'],
  ['court-king', 'crown'], ['championship', 'crown'], ['crown', 'crown'],
  ['shrug', 'shrug'], ['no-pressure', 'shrug'], ['palm-up', 'shrug'],
  ['victory-nod', 'nod'], ['backpedal-nod', 'nod'], ['head-nod', 'nod'], ['nod', 'nod'],
  ['head-shake', 'shake'], ['shake-the-head', 'shake'], ['side-eye', 'shake'],
  ['finger-wag', 'wag'], ['calm-down', 'wag'], ['too-easy', 'wag'],
  ['main-character-walk', 'walk'], ['walk-off', 'walk'], ['turn-and-walk', 'walk'],
  ['hall-of-fame-walk', 'walk'], ['victory-slide', 'walk'], ['short-shuffle', 'walk'],
  ['superstar-strut', 'strut'], ['side-step-swagger', 'strut'], ['infinite-swagger', 'strut'], ['swagger', 'strut'],
  ['back-turn', 'turn'], ['circle-the-court', 'turn'], ['360', 'turn'],
  ['freeze', 'freeze'], ['statue', 'freeze'], ['game-face', 'freeze'], ['lock-in', 'freeze'], ['spotlight', 'freeze'],
  ['heart-hands', 'heart'], ['double-tap-heart', 'heart'], ['heart', 'heart'],
  ['silencer', 'shush'], ['talk-to-the-hand', 'shush'], ['lock-the-door', 'shush'], ['turn-the-key', 'shush'],
  ['night-night', 'sleep'], ['sleep', 'sleep'],
  ['ice-in-the-veins', 'ice'], ['wrist-tap', 'ice'], ['wrist-flick', 'ice'], ['ice', 'ice'],
  ['too-small', 'measure'], ['defensive-stance', 'stance'], ['eyes-up', 'stance'],
  ['take-a-seat', 'sit'], ['sit', 'sit'],
  ['basketball-toss', 'toss'], ['ball-under-arm', 'toss'], ['mic-drop', 'toss'],
  ['spin-the-ball', 'spinBall'], ['finger-spin', 'spinBall'],
  ['come-here', 'beckon'], ['get-loud', 'conduct'], ['crowd-conductor', 'conduct'], ['arena-takeover', 'conduct'],
  ['air-guitar', 'guitar'],
  ['double-fist-pump', 'fistPump'], ['fist', 'fistPump'],
  ['chest-tap', 'chest'], ['chest', 'chest'],
  ['jersey-tug', 'tug'], ['rock-the-baby', 'sleep'],
  ['shoulder-shake', 'shoulder'], ['both-hands-up', 'conduct'], ['hands-up', 'conduct'],
  ['god-mode', 'crown'], ['mythic-court-king', 'crown'], ['cosmic-ice', 'ice'],

  // The seasonal path and the crate pool brought several hundred more names in.
  // A name that says what it does gets what it says; the hash only decides for
  // the ones that do not.
  ['ball-bounce', 'bounce'], ['quick-bounce', 'bounce'], ['low-dribble', 'bounce'], ['bounce', 'bounce'],
  ['ball-roll', 'roll'], ['shoulder-roll', 'roll'], ['rewind', 'roll'], ['roll', 'roll'],
  ['ankle-breaker', 'crossover'], ['crossover', 'crossover'], ['handle-check', 'crossover'],
  ['step-back', 'crossover'], ['snake', 'crossover'],
  ['disappear', 'vanish'], ['vanishing', 'vanish'], ['blackout', 'vanish'], ['lights-out', 'vanish'],
  ['fade-away', 'vanish'], ['phantom', 'vanish'], ['gone', 'vanish'],
  ['too-cold', 'cold'], ['cold-blooded', 'cold'], ['frozen', 'cold'], ['freeze-pose', 'cold'],
  ['cold-shoulder', 'dust'], ['dust-off', 'dust'], ['no-sweat', 'dust'], ['brush', 'dust'],
  ['guard-me', 'guard'], ['nobody-home', 'guard'], ['not-today', 'guard'], ['lock-down', 'guard'],
  ['unstoppable', 'strut'], ['untouchable', 'strut'], ['different-breed', 'strut'],
  ['built-different', 'flex'], ['level-up', 'flex'], ['head-held-high', 'strut'],
  ['throne', 'throne'], ['take-a-seat', 'sit'],
  ['rain-from-the-sky', 'rain'], ['splash', 'rain'], ['rain', 'rain'],
  ['walk-of-fame', 'walk'], ['walk-away', 'walk'], ['slow-exit', 'walk'], ['take-a-lap', 'walk'],
  ['backpedal-three', 'walk'], ['slow-walk', 'walk'],
  ['no-look-back', 'turn'], ['turn-the-page', 'dismiss'], ['book-closed', 'dismiss'],
  ['entrance', 'strut'], ['sign-off', 'dismiss'], ['hands-down', 'dismiss'],
  ['earthquake', 'stomp'], ['stomp', 'stomp'], ['quake', 'stomp'], ['warrior', 'stomp'],
  ['dance', 'groove'], ['groove', 'groove'], ['shuffle', 'groove'], ['step', 'groove'],
  ['hop', 'groove'], ['slide', 'groove'],
  ['salute', 'salute'], ['lasso', 'lasso'], ['spin-the-rock', 'lasso'],
  ['reload', 'reload'], ['deep-breath', 'breathe'], ['heartbeat', 'breathe'],
  ['chalk-toss', 'toss'], ['shoe-check', 'pointDown'], ['two-hands-down', 'dismiss'],
  ['take-notes', 'measure'], ['count-it', 'measure'], ['range-check', 'measure'],
  ['long-distance', 'measure'], ['deep-range', 'measure'],
  ['slow-motion', 'freeze'], ['hands-in-pockets', 'freeze'],
  ['curtain-call', 'bow'], ['bow-out', 'bow'], ['kiss-the-floor', 'kneel'],
  ['standing-ovation', 'clap'], ['silence-the-room', 'shush'], ['say-less', 'shush'],
  ['last-word', 'shush'], ['nothing-to-say', 'shush'], ['locked-out', 'shush'],
  ['one-finger-up', 'pointUp'], ['sky-point', 'pointUp'], ['from-the-logo', 'point'],
  ['called-it', 'point'], ['three-to-the-bench', 'point'], ['left-it-short', 'shake'],
  ['ice-wrist', 'ice'], ['ice-hands', 'ice'], ['water-sign', 'wave'],
];

const ALL_SHAPES: Shape[] = [
  'point', 'pointUp', 'pointDown', 'doublePoint', 'wave', 'clap', 'flex', 'bow', 'crown', 'shrug',
  'nod', 'shake', 'wag', 'walk', 'strut', 'turn', 'freeze', 'heart', 'camera', 'shush', 'sleep',
  'ice', 'measure', 'stance', 'sit', 'toss', 'spinBall', 'beckon', 'dismiss', 'chest', 'tug',
  'kneel', 'conduct', 'guitar', 'fistPump', 'shoulder',
  'bounce', 'roll', 'vanish', 'cold', 'guard', 'throne', 'rain', 'stomp', 'groove', 'salute',
  'dust', 'lasso', 'reload', 'breathe', 'crossover',
];

/**
 * The part of an emote that is not its shape.
 *
 * Fifty-one shapes across five hundred performances means a shape is worn by
 * ten items, and for a long time that is exactly what it looked like: measured,
 * only 147 of 414 performances animated differently from each other, and the
 * worst group had twenty-one items doing the identical thing. Two emotes that
 * are both "a point" should still be two emotes.
 *
 * So every id also carries a signature — how big the movement is, how fast, how
 * far through the beat it starts, how the body sits under it, what the idle arm
 * is doing, and one extra flourish on top. Read out of the same hash the shape
 * is, so an item performs the same way forever, and applied after the shape so
 * a Finger Wag still wags.
 */
interface Signature {
  lead: 0 | 1;
  amp: number;
  beats: number;
  phase: number;
  tilt: number;
  sink: number;
  sway: number;
  step: number;
  lift: number;
  offArm: number;
  flourish: number;
}

function signatureOf(n: number): Signature {
  const bits = (shift: number, width: number) => (n >>> shift) & ((1 << width) - 1);
  return {
    lead: (bits(8, 1) as 0 | 1),
    // 0.78 to 1.28: the same gesture, thrown or placed.
    amp: 0.78 + (bits(2, 3) / 7) * 0.5,
    beats: 2 + bits(12, 3),
    phase: bits(15, 3) / 8,
    tilt: (bits(18, 3) / 7 - 0.5) * 0.5,
    sink: (bits(21, 2) / 3) * 0.34,
    sway: (bits(23, 3) / 7 - 0.5) * 0.4,
    step: (bits(26, 2) / 3) * 0.8,
    lift: (bits(28, 2) / 3) * 0.3,
    offArm: (bits(30, 2) / 3) * 0.6,
    flourish: bits(5, 3) % 6,
  };
}

/** The pose for an id the switch above did not name explicitly. */
function derivedPose(id: string | null, t: number, h: number, e: number): EmotePose {
  const p: EmotePose = { ...REST, arm: [0, 0], out: [1, 1], fwd: [0, 0] };
  if (!id) return p;

  const key = id.toLowerCase();
  const named = SHAPE_KEYWORDS.find(([k]) => key.includes(k));
  const n = hashId(id);
  const shape = named ? named[1] : ALL_SHAPES[n % ALL_SHAPES.length];
  const sig = signatureOf(n);
  const lead = sig.lead;
  const off = lead === 1 ? 0 : 1;
  const beats = sig.beats;
  const puls = Math.sin((t + sig.phase) * Math.PI * beats);
  const set = (i: number, arm: number, out: number, fwd = 0) => {
    p.arm[i] = arm;
    p.out[i] = out;
    p.fwd[i] = fwd;
  };

  switch (shape) {
    case 'point': set(lead, 0.45 * h, 1 + 0.2 * h, 1.5 * h); break;
    case 'pointUp': set(lead, 1.45 * h, 1 - 0.2 * h); break;
    case 'pointDown': set(lead, -0.6 * h, 1 + 0.5 * h, 0.5 * h); p.lean = 0.35 * h; break;
    case 'doublePoint': set(0, 0.4 * h, 1 + 0.35 * h, 1.3 * h); set(1, 0.4 * h, 1 + 0.35 * h, 1.3 * h); break;
    case 'wave': set(lead, 1.25 * h, 1 + puls * 0.5 * h); break;
    case 'clap':
      set(0, 0.55 * h, 1 - 0.5 * h * (0.5 + 0.5 * puls), 0.5 * h);
      set(1, 0.55 * h, 1 - 0.5 * h * (0.5 + 0.5 * puls), 0.5 * h);
      break;
    case 'flex': set(0, 1.05 * h, 1 + 0.8 * h); set(1, 1.05 * h, 1 + 0.8 * h); p.crouch = 0.14 + 0.26 * h; break;
    case 'bow': p.lean = 1 * h; p.crouch = 0.14 + 0.3 * h; set(lead, 0.2 * h, 1 + 0.4 * h, 0.4 * h); break;
    case 'crown': set(0, 1.4 * h, 1 - 0.45 * h); set(1, 1.4 * h, 1 - 0.45 * h); p.bob = -0.2 * h; break;
    case 'shrug': set(0, 0.45 * h, 1 + 0.9 * h); set(1, 0.45 * h, 1 + 0.9 * h); p.bob = 0.14 * h; break;
    case 'nod': p.lean = 0.3 * puls; break;
    case 'shake': p.spin = 0.28 * puls; p.lean = 0.08 * h; break;
    case 'wag': set(lead, 1.35 * h, 1 + puls * 0.65 * h, 0.4 * h); break;
    case 'walk': p.stride = 1 + 0.9 * h; p.bob = 0.1 * Math.abs(puls) * h; p.lean = 0.2 * h; break;
    case 'strut': p.stride = 1 + 1.1 * h; p.spin = 0.18 * puls; set(0, 0.3 * h, 1 + 0.5 * h); set(1, 0.3 * h, 1 + 0.5 * h); break;
    case 'turn': p.spin = 0.5 * h; set(lead, 0.5 * h, 1 + 0.3 * h); break;
    case 'freeze': p.crouch = 0.14 + 0.1 * h; set(0, 0.9 * h, 1 + 0.15 * h); set(1, 0.9 * h, 1 + 0.15 * h); break;
    case 'heart': set(0, 0.85 * h, 1 - 0.6 * h, 0.7 * h); set(1, 0.85 * h, 1 - 0.6 * h, 0.7 * h); break;
    case 'camera': set(0, 1.05 * h, 1 - 0.5 * h, 0.6 * h); set(1, 1.05 * h, 1 - 0.5 * h, 0.6 * h); p.lean = -0.15 * h; break;
    case 'shush': set(lead, 1.15 * h, 1 - 0.75 * h, 0.35 * h); break;
    case 'sleep': set(0, 1.05 * h, 1 - 0.65 * h, 0.4 * h); set(1, 1.05 * h, 1 - 0.65 * h, 0.4 * h); p.lean = 0.35 * h; break;
    case 'ice': set(lead, 0.65 * h, 1 - 0.55 * h, 0.55 * h); set(off, 0.3 * h, 1 - 0.15 * h); p.lean = -0.2 * h; break;
    case 'measure': set(lead, 1.45 * h, 1 - 0.35 * h, 0.5 * h); break;
    case 'stance': p.crouch = 0.14 + 0.6 * h; p.stride = 1 + 1.3 * h; set(0, -0.3 * h, 1 + 1.1 * h); set(1, -0.3 * h, 1 + 1.1 * h); break;
    case 'sit': p.crouch = 0.14 + 0.9 * h; set(0, -0.5 * h, 1 + 0.5 * h); set(1, -0.5 * h, 1 + 0.5 * h); break;
    case 'toss': set(lead, (0.4 + 0.8 * Math.max(0, puls)) * h, 1 + 0.4 * h); break;
    case 'spinBall': set(lead, 1.2 * h, 1 - 0.1 * h, 0.3 * h); p.spin = 0.12 * puls; break;
    case 'beckon': set(lead, 0.35 * h, 1 - 0.2 * h, (0.8 + puls * 0.5) * h); p.lean = -0.12 * h; break;
    case 'dismiss': set(lead, 0.5 * h, 1 + 0.9 * h); p.spin = -0.25 * h; break;
    case 'chest': set(lead, 0.7 * h, 1 - 0.7 * h, (0.35 + Math.abs(puls) * 0.3) * h); break;
    case 'tug': set(0, 0.35 * h, 1 - 0.55 * h, 0.5 * h); set(1, 0.35 * h, 1 - 0.55 * h, 0.5 * h); p.lean = -0.2 * h; break;
    case 'kneel': p.crouch = 0.14 + 0.75 * h; set(lead, -0.55 * h, 1 + 0.3 * h, 0.4 * h); p.lean = 0.4 * h; break;
    case 'conduct': set(0, (1 + puls * 0.3) * h, 1 + 0.6 * h); set(1, (1 + puls * 0.3) * h, 1 + 0.6 * h); p.bob = 0.12 * Math.abs(puls) * h; break;
    case 'guitar': set(0, 0.45 * h, 1 - 0.3 * h, 0.6 * h); set(1, (0.3 + puls * 0.5) * h, 1 + 0.7 * h, 0.4 * h); p.lean = -0.3 * h; break;
    case 'fistPump': set(0, (0.7 + Math.max(0, puls) * 0.7) * h, 1 + 0.25 * h); set(1, (0.7 + Math.max(0, puls) * 0.7) * h, 1 + 0.25 * h); break;

    // Pounding the ball at the hip, knees riding the bounce.
    case 'bounce':
      set(lead, (-0.35 + puls * 0.35) * h, 1 + 0.3 * h, 0.35 * h);
      p.crouch = 0.14 + (0.2 + Math.abs(puls) * 0.18) * h;
      p.bob = -0.08 * Math.abs(puls) * h;
      break;
    // One arm turning a full circle, the other loose.
    case 'roll':
      set(lead, (0.55 + Math.sin(t * Math.PI * 2 * beats) * 0.8) * h, 1 + Math.cos(t * Math.PI * 2 * beats) * 0.7 * h);
      set(off, 0.15 * h, 1 + 0.15 * h);
      break;
    // Gone, and then not. The only shape that uses opacity as the whole point.
    case 'vanish':
      p.alpha = 1 - 0.9 * e;
      set(0, 0.4 * h, 1 - 0.6 * h, 0.3 * h);
      set(1, 0.4 * h, 1 - 0.6 * h, 0.3 * h);
      p.crouch = 0.14 + 0.12 * h;
      break;
    // Arms folded, shoulder turned, and nothing moves at all.
    case 'cold':
      set(0, 0.5 * h, 1 - 0.72 * h, 0.42 * h);
      set(1, 0.5 * h, 1 - 0.72 * h, 0.42 * h);
      p.spin = -0.3 * h;
      p.lean = -0.12 * h;
      break;
    // Low and wide, sliding across the front of somebody.
    case 'guard':
      p.crouch = 0.14 + 0.55 * h;
      p.stride = 1 + 1.5 * h;
      set(0, -0.15 * h, 1 + 1.25 * h);
      set(1, -0.15 * h, 1 + 1.25 * h);
      p.spin = 0.16 * puls * h;
      break;
    // Sat back with both arms along the rests of a chair that is not there.
    case 'throne':
      p.crouch = 0.14 + 0.8 * h;
      p.lean = -0.4 * h;
      set(0, -0.15 * h, 1 + 0.95 * h, 0.35 * h);
      set(1, -0.15 * h, 1 + 0.95 * h, 0.35 * h);
      break;
    // Both hands high, fingers coming down.
    case 'rain':
      set(0, (1.4 - Math.abs(puls) * 0.18) * h, 1 + 0.45 * h);
      set(1, (1.4 - Math.abs(puls) * 0.18) * h, 1 + 0.45 * h);
      p.bob = 0.1 * Math.abs(puls) * h;
      break;
    // A foot brought down hard enough that the whole figure drops with it.
    case 'stomp': {
      const hit = Math.max(0, Math.sin(t * Math.PI * beats));
      p.crouch = 0.14 + 0.5 * hit * h;
      p.bob = -0.3 * hit * h;
      p.stride = 1 + 0.7 * h;
      set(0, (0.2 - hit * 0.5) * h, 1 + 0.8 * h);
      set(1, (0.2 - hit * 0.5) * h, 1 + 0.8 * h);
      break;
    }
    // Shoulders and hips out of phase, which is what reads as dancing.
    case 'groove':
      p.spin = 0.26 * puls * h;
      p.bob = 0.16 * Math.abs(Math.cos(t * Math.PI * beats)) * h;
      set(lead, (0.6 + puls * 0.45) * h, 1 + 0.4 * h);
      set(off, (0.6 - puls * 0.45) * h, 1 + 0.4 * h);
      p.stride = 1 + 0.35 * h;
      break;
    // Two fingers off the brow and held.
    case 'salute':
      set(lead, 1.1 * h, 1 - 0.55 * h, 0.3 * h);
      set(off, 0, 1);
      p.lean = -0.1 * h;
      break;
    // Brushing the shoulder off, which is a whole sentence on its own.
    case 'dust':
      set(lead, (0.75 + puls * 0.2) * h, 1 - 0.7 * h, (0.4 + puls * 0.35) * h);
      p.spin = -0.14 * h;
      break;
    // One arm turning overhead like a rope.
    case 'lasso':
      set(lead, 1.35 * h, 1 + (0.35 + Math.sin(t * Math.PI * 2 * beats) * 0.5) * h);
      p.spin = 0.1 * Math.cos(t * Math.PI * 2 * beats) * h;
      break;
    // Hands to the hip and back out, twice.
    case 'reload': {
      const draw = Math.abs(Math.sin(t * Math.PI * 2));
      set(0, (-0.1 + draw * 0.75) * h, 1 - (0.5 - draw * 0.9) * h, draw * 0.5 * h);
      set(1, (-0.1 + draw * 0.75) * h, 1 - (0.5 - draw * 0.9) * h, draw * 0.5 * h);
      break;
    }
    // The chest goes, and almost nothing else does.
    case 'breathe':
      p.bob = 0.22 * Math.sin(t * Math.PI * 2) * h;
      p.lean = -0.18 * Math.sin(t * Math.PI * 2) * h;
      set(0, 0.18 * h, 1 + 0.3 * h);
      set(1, 0.18 * h, 1 + 0.3 * h);
      break;
    // Ball swung hard across the body, hips following it.
    case 'crossover':
      p.crouch = 0.14 + 0.42 * h;
      p.spin = 0.34 * puls * h;
      p.stride = 1 + 0.9 * h;
      set(lead, (0.05 + puls * 0.4) * h, 1 + (0.5 + puls * 0.6) * h, 0.45 * h);
      set(off, -0.1 * h, 1 + 0.3 * h);
      break;

    default: set(lead, 0.9 * h, 1 + 0.35 * h); set(off, 0.3 * h, 1 + 0.2 * h); break;
  }

  // ---------------------------------------------------------- the signature

  // Scale of the whole gesture. `out` sits around 1 rather than 0, so it is
  // scaled about that rather than toward zero, or a big amplitude would pull
  // every arm into the ribs.
  for (let i = 0; i < 2; i++) {
    p.arm[i] *= sig.amp;
    p.fwd[i] *= sig.amp;
    p.out[i] = 1 + (p.out[i] - 1) * sig.amp;
  }
  // The idle arm does something rather than hanging dead at the side, which is
  // most of what made one-armed shapes look like each other.
  if (p.arm[off] === 0 && p.fwd[off] === 0 && p.out[off] === 1) {
    p.arm[off] = sig.offArm * 0.55 * h;
    p.out[off] = 1 + sig.offArm * 0.4 * h;
  }
  p.lean += sig.tilt * h;
  p.crouch += sig.sink * h;
  p.spin += sig.sway * h;
  p.stride += sig.step * h;
  p.bob += sig.lift * h;

  // One extra thing the body does, on top of whatever the arms are up to.
  switch (sig.flourish) {
    case 1: p.bob += 0.4 * Math.max(0, Math.sin(t * Math.PI * 2)) * h; break;           // hops
    case 2: p.spin += 0.7 * h * t; break;                                                // turns through it
    case 3: p.stride += 1 * Math.abs(puls) * h; p.bob += 0.08 * h; break;                // steps it out
    case 4: p.lean -= 0.5 * h; p.crouch += 0.12 * h; break;                              // leans away
    case 5: p.crouch += 0.45 * e; p.bob += 0.25 * e; break;                              // dips and rises
    default: break;                                                                      // nothing extra
  }

  // Nothing may fold through the floor or spin the figure round backwards.
  p.crouch = Math.max(0, Math.min(1, p.crouch));
  p.lean = Math.max(-1.2, Math.min(1.2, p.lean));
  p.spin = Math.max(-1.1, Math.min(1.1, p.spin));
  p.stride = Math.max(0.55, p.stride);
  p.alpha = Math.max(0.05, Math.min(1, p.alpha));

  // Mythics get to be strange on top of whatever they do.
  if (key.includes('-m-') || key.includes('mythic') || key.includes('cosmic') || key.includes('god-mode')) {
    p.alpha = 1 - 0.55 * e;
    p.bob += 0.45 * e;
  }
  return p;
}
