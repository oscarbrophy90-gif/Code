import type { EmotePose } from './emotes.ts';

/**
 * What a dunk package does with the body — one source of truth.
 *
 * The replay had all of this and the live game had none of it, which is why
 * dunks looked right in the cutaway and identical in play. The style, the
 * flight pose and the hang pose all live here now, and the live renderer and
 * the replay both read them, so the dunk you perform is the dunk you rewatch.
 */

/**
 * The named motions. This is what makes a Windmill a windmill: the packages had
 * five knobs that changed how long a dunk hung and which side it came from, and
 * nothing that changed what the arms actually did, so fifty packages ran one
 * animation at different speeds.
 */
export type DunkMotion =
  | 'flush'
  | 'tomahawk'
  | 'windmill'
  | 'cradle'
  | 'doubleClutch'
  | 'reverse'
  | 'spin'
  | 'hammer'
  | 'betweenLegs'
  | 'behindBack'
  | 'doublePump'
  | 'spin360'
  | 'spin540';

/**
 * How the dunker gets to the rim, and where the ball is while he does.
 *
 * Separate from the motion because they are genuinely different things: a Self
 * Alley-Oop Windmill is a windmill whose ball is in the air rather than in a
 * hand for the first half, and the arms do the same thing either way. Folding
 * them together would have needed a motion per pairing.
 */
export type DunkEntry =
  | 'run'
  | 'hop'
  | 'euro'
  | 'putback'
  | 'oop'
  | 'glass';

export interface DunkStyle {
  /** run-up side: -1 comes in from the left, +1 from the right */
  from: -1 | 1;
  /** what the arms do on the way up */
  motion: DunkMotion;
  /** how he arrives, and where the ball comes from */
  entry: DunkEntry;
  /** true for a one-hand finish, false for a two-hand flush */
  oneHand: boolean;
  /** fraction of the scene spent hanging off the rim */
  hangFor: number;
  /** how hard the body swings under the rim */
  swing: number;
  /** how much the rim bends */
  flex: number;
}

const DUNK_STYLE: Record<string, DunkStyle> = {
  'basic-slam': { from: -1, motion: 'flush', entry: 'run', oneHand: false, hangFor: 0.14, swing: 0.25, flex: 0.7 },
  tomahawk: { from: -1, motion: 'tomahawk', entry: 'run', oneHand: true, hangFor: 0.2, swing: 0.5, flex: 1 },
  'rim-hang': { from: 1, motion: 'flush', entry: 'run', oneHand: true, hangFor: 0.44, swing: 1.15, flex: 1.25 },
  poster: { from: -1, motion: 'hammer', entry: 'run', oneHand: false, hangFor: 0.24, swing: 0.4, flex: 1.7 },
  'reverse-flush': { from: 1, motion: 'reverse', entry: 'run', oneHand: true, hangFor: 0.2, swing: 0.35, flex: 0.85 },
};

/**
 * Names carry the motion. A package called Windmill windmills, a package called
 * Cradle Slam rocks the ball into the chest — read straight off the id rather
 * than hand-assigned, so a new package named after a real dunk gets that dunk.
 */
const MOTION_KEYWORDS: [string, DunkMotion][] = [
  // Order matters: the first key found in the id wins, so the compound names go
  // above the plain ones. 'between-the-legs-windmill' is a between-the-legs.
  ['between-the-legs', 'betweenLegs'],
  ['behind-the-back', 'behindBack'],
  ['540', 'spin540'],
  ['360', 'spin360'],
  ['double-pump', 'doublePump'],
  ['windmill', 'windmill'],
  ['tomahawk', 'tomahawk'],
  ['cradle', 'cradle'],
  ['rock-the-baby', 'cradle'],
  ['double-clutch', 'doubleClutch'],
  ['clutch', 'doubleClutch'],
  ['reverse', 'reverse'],
  ['under-the-rim', 'reverse'],
  ['turn-back', 'reverse'],
  ['half-turn', 'spin'],
  ['full-turn', 'spin'],
  ['shoulder-roll', 'spin'],
  ['scissor', 'windmill'],
  ['split-step', 'windmill'],
  ['hammer', 'hammer'],
  ['anvil', 'hammer'],
  ['sledge', 'hammer'],
  ['guillotine', 'hammer'],
  ['battering', 'hammer'],
  ['freight', 'hammer'],
  ['cocked-back', 'tomahawk'],
  ['loaded', 'tomahawk'],
  ['slingshot', 'tomahawk'],
  ['catapult', 'tomahawk'],
  ['trigger', 'doubleClutch'],
  ['leg-kick', 'windmill'],
  ['statue', 'cradle'],
  ['curtain', 'hammer'],
  // The second hundred: names the first pack never used.
  ['back-scratch', 'tomahawk'],
  ['scoop', 'cradle'],
  ['switch-hand', 'doublePump'],
  ['switch', 'doublePump'],
  ['1080', 'spin360'],
  ['720', 'spin360'],
  ['rim-rocker', 'flush'],
  ['rim-hang', 'flush'],
  ['power', 'flush'],
  ['sprint', 'flush'],
  ['fast-break', 'flush'],
  ['back-board', 'hammer'],
];

export function styleFor(id: string): DunkStyle {
  return DUNK_STYLE[id] ?? derivedStyle(id);
}

/** Stable hash of a package id, so a dunk always animates the same way. */
function hashId(id: string): number {
  let n = 2166136261;
  for (let i = 0; i < id.length; i++) {
    n ^= id.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

function derivedStyle(id: string): DunkStyle {
  const n = hashId(id);
  const bit = (shift: number, mask: number) => (n >>> shift) & mask;
  const unit = (shift: number, mask: number) => bit(shift, mask) / mask;

  // The name wins if it describes a real dunk; otherwise the hash picks one.
  const named = MOTION_KEYWORDS.find(([key]) => id.includes(key));
  const pool: DunkMotion[] = ['flush', 'tomahawk', 'windmill', 'cradle', 'doubleClutch', 'reverse', 'spin', 'hammer'];
  const motion = named ? named[1] : pool[bit(0, 7) % pool.length];
  const entry = ENTRY_KEYWORDS.find(([key]) => id.includes(key))?.[1] ?? 'run';
  // A contact finish hangs on and bends the iron; that is what the word means.
  const contact = id.includes('contact') || id.includes('poster');

  return {
    from: bit(4, 1) ? 1 : -1,
    motion,
    entry,
    oneHand: motion !== 'flush' && motion !== 'hammer' ? true : bit(5, 1) === 1,
    hangFor: contact ? 0.3 + unit(6, 15) * 0.18 : 0.14 + unit(6, 15) * 0.34,
    swing: contact ? 0.7 + unit(10, 7) * 0.8 : 0.2 + unit(10, 7) * 1.1,
    flex: contact ? 1.5 + unit(16, 15) * 0.5 : 0.6 + unit(16, 15) * 1.1,
  };
}

/**
 * How he arrives. Same idea as the motion keywords: a package called Off-Backboard
 * throws it off the glass, a Putback takes it off the iron, a Self Alley-Oop
 * throws it to itself.
 */
const ENTRY_KEYWORDS: [string, DunkEntry][] = [
  ['off-backboard', 'glass'],
  ['off-the-glass', 'glass'],
  ['self-alley-oop', 'oop'],
  ['alley-oop', 'oop'],
  ['putback', 'putback'],
  ['hop-step', 'hop'],
  ['hop-dunk', 'hop'],
  ['euro', 'euro'],
  ['gather-step', 'hop'],
  ['long-stride', 'euro'],
];


/**
 * Spins named in full turns. Read off the digits in the id — a 720 is two full
 * rotations whatever else the name says, and the live figure actually turns
 * them: the renderer feeds the pose's spin through cos/sin, so a full rotation
 * reads as the body narrowing side-on and opening out again.
 */
export function turnsFor(id: string): number {
  if (id.includes('1080')) return 3;
  if (id.includes('720')) return 2;
  if (id.includes('540')) return 1.5;
  if (id.includes('360')) return 1;
  if (id.includes('180')) return 0.5;
  const style = styleFor(id);
  return style.motion === 'spin540' ? 1.5 : style.motion === 'spin360' ? 1 : style.motion === 'spin' ? 0.5 : 0;
}

/**
 * Which drawn hand carries the ball through a flight: 0 left, 1 right, 2 both
 * (drawn between them). Follows the style — a one-hand motion carries in its
 * lead hand, everything else keeps two hands on it — so the ball rides where
 * the choreography says the ball is.
 */
export function dunkCarryHand(id: string): 0 | 1 | 2 {
  const style = styleFor(id);
  if (!style.oneHand) return 2;
  return style.from === 1 ? 1 : 0;
}

const REST_POSE: EmotePose = { arm: [0, 0], out: [1, 1], fwd: [0, 0], crouch: 0, lean: 0, alpha: 1, bob: 0, spin: 0, stride: 1 };

/**
 * The body during the live flight, 0 = takeoff, 1 = the slam.
 *
 * Every motion is a different arm story on the same climb: a tomahawk cocks
 * the ball behind the head, a windmill turns full circles, a double pump digs
 * the ball down and brings it back, a cradle rocks it at the chest. The legs
 * tell the rest — tucked on the big spins, split on a between-the-legs,
 * trailing on a reverse.
 */
export function dunkFlightPose(id: string, t: number): EmotePose {
  const style = styleFor(id);
  const p: EmotePose = { ...REST_POSE, arm: [0, 0] as [number, number], out: [1, 1] as [number, number], fwd: [0, 0] as [number, number] };
  const k = Math.max(0, Math.min(1, t));
  const lead = style.from === 1 ? 1 : 0;
  const off = lead === 1 ? 0 : 1;
  // The climb: knees come up hard off the floor and stretch out at the rim.
  p.crouch = 0.3 * (1 - k);
  p.stride = 1 + 0.5 * Math.sin(k * Math.PI);
  p.lean = 0.15 * (1 - k);
  p.spin = turnsFor(id) * Math.PI * 2 * easeInOut(k);

  const set = (i: number, arm: number, out: number, fwd = 0) => {
    p.arm[i] = arm;
    p.out[i] = out;
    p.fwd[i] = fwd;
  };

  switch (style.motion) {
    case 'flush':
      // Both hands ride up together and punch over the top.
      set(0, 0.4 + k * 1.1, 1 + 0.1 * k, 0.3);
      set(1, 0.4 + k * 1.1, 1 + 0.1 * k, 0.3);
      break;
    case 'hammer': {
      // High over the head early, held, then brought down through the iron.
      const up = Math.min(1, k * 1.6);
      set(lead, 0.5 + up * 1.0, 1 + 0.2 * up, 0.15);
      set(off, style.oneHand ? 0.3 : 0.5 + up * 1.0, 1 + 0.3, 0.15);
      break;
    }
    case 'tomahawk': {
      // Cocked behind the head through the middle of the jump, whipped forward
      // at the very top.
      const cock = Math.sin(Math.min(1, k * 1.25) * Math.PI);
      set(lead, 0.6 + cock * 0.9, 1 - 0.5 * cock, -0.5 * cock + Math.max(0, k - 0.8) * 4);
      set(off, style.oneHand ? 0.35 : 0.6 + cock * 0.9, 1 + 0.4, 0);
      p.lean = -0.25 * cock;
      break;
    }
    case 'windmill': {
      // Full circles: the lead arm sweeps down, back, over the top. Two turns
      // of the crank on the doubles.
      const circles = id.includes('double-windmill') || id.includes('triple') ? 2 : 1;
      const a = k * Math.PI * 2 * circles - Math.PI / 2;
      set(lead, Math.sin(a) * 1.2, 1 + Math.abs(Math.cos(a)) * 0.8, Math.cos(a) * 0.5);
      set(off, 0.4, 1 + 0.3);
      p.lean = Math.cos(a) * 0.15;
      break;
    }
    case 'cradle': {
      // Rocked across the chest, then out and over.
      const rock = Math.sin(Math.min(1, k * 1.3) * Math.PI);
      set(lead, 0.5 + Math.max(0, k - 0.7) * 3.2, 1 - 0.6 * rock, 0.5 * rock);
      set(off, 0.5, 1 - 0.5 * rock, 0.5 * rock);
      p.lean = 0.2 * rock;
      break;
    }
    case 'doubleClutch':
    case 'doublePump': {
      // The ball dives and comes back — twice on a double pump.
      const pumps = style.motion === 'doublePump' ? 2 : 1.5;
      const pump = Math.abs(Math.sin(k * Math.PI * pumps));
      set(lead, 1.3 - pump * 1.1, 1 + 0.2, 0.4 * pump);
      set(off, 1.3 - pump * 1.1, 1 + 0.2, 0.4 * pump);
      p.crouch = 0.3 * (1 - k) + 0.2 * pump;
      break;
    }
    case 'reverse': {
      // Back turns to the rim on the way up; the finish goes over the head.
      p.spin += Math.PI * easeInOut(k);
      set(lead, 0.5 + k * 1.0, 1 + 0.2, -0.3 * k);
      set(off, style.oneHand ? 0.3 : 0.5 + k * 1.0, 1 + 0.2, -0.3 * k);
      p.lean = -0.3 * k;
      break;
    }
    case 'betweenLegs': {
      // The ball goes through at the top of the jump: legs split, hand chases
      // it under and comes up the far side.
      const thread = Math.sin(Math.min(1, k * 1.4) * Math.PI);
      p.stride = 1 + thread * 1.6;
      p.crouch = 0.3 * (1 - k) + 0.25 * thread;
      set(lead, -0.4 * thread + Math.max(0, k - 0.75) * 5, 1 - 0.4 * thread, 0.3);
      set(off, 0.3, 1 + 0.4 * thread);
      break;
    }
    case 'behindBack': {
      const wrap = Math.sin(Math.min(1, k * 1.4) * Math.PI);
      set(lead, -0.3 * wrap + Math.max(0, k - 0.75) * 5, 1 + 0.7 * wrap, -0.6 * wrap);
      set(off, 0.35, 1 + 0.3);
      p.spin += 0.4 * wrap;
      break;
    }
    case 'spin':
    case 'spin360':
    case 'spin540': {
      // The spin is the show: ball held tight, arms in so the turn reads, then
      // out over the iron at the end.
      const open = Math.max(0, k - 0.72) / 0.28;
      set(lead, 0.5 + open * 1.0, 1 - 0.4 * (1 - open), 0.2);
      set(off, style.oneHand ? 0.3 : 0.5 + open * 1.0, 1 - 0.4 * (1 - open), 0.2);
      p.crouch = 0.35 * (1 - open);
      break;
    }
  }
  return p;
}

/**
 * Hanging on the iron.
 *
 * Both hands or one by the package, body long, a swing that starts with the
 * violence of the slam and dies out — driven by how far through the hang the
 * timer is, so a long mythic hang settles to a dead-still hold before the drop.
 */
export function dunkHangPose(id: string, remaining: number, time: number): EmotePose {
  const style = styleFor(id);
  const settle = Math.max(0, Math.min(1, remaining));
  const sway = Math.sin(time * 6.5) * style.swing * 0.35 * settle;
  const p: EmotePose = { ...REST_POSE, arm: [0, 0] as [number, number], out: [1, 1] as [number, number], fwd: [0, 0] as [number, number] };
  p.arm = style.oneHand ? [0.2 + sway * 0.1, 1.5] : [1.5, 1.5];
  p.out = style.oneHand ? [1.2, 0.9] : [0.95, 0.95];
  p.crouch = 0.12;
  p.lean = sway * 0.4;
  p.spin = sway * 0.5;
  p.stride = 0.8;
  p.bob = 0;
  return p;
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
