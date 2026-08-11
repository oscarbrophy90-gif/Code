import type { Rng } from './rng.ts';
import type { EquipmentKey, Tier, Traits } from './types.ts';

/**
 * The workout generator.
 *
 * The catalogue's gym entry says "two main lifts, two accessories" — useful, but
 * it still leaves you standing in the gym deciding what to do. This builds the
 * actual session: warm-up, movements, sets and reps, sized to your Fitness
 * rating and to what you have access to.
 *
 * Safety, same rules as everywhere else:
 *  - Barbell work is 16+; loaded work of any kind is 14+. Under that it is
 *    bodyweight only.
 *  - Anything marked `impact` is dropped for an injury.
 *  - Rep ranges stay in the 6–15 band. Nothing here programmes a one-rep max,
 *    and nothing tells anyone to train to failure.
 *  - Every session opens with a warm-up and closes with a cool-down, because a
 *    generated session people actually follow needs both.
 */

export type Pattern = 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'carry' | 'conditioning';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** Main lifts anchor the session; accessories fill it out. */
  slot: 'main' | 'accessory';
  /** All must be available. Empty means bodyweight, anywhere. */
  needs: EquipmentKey[];
  minAge?: number;
  /** Jumping, sprinting, plyometrics — dropped for an injury. */
  impact?: boolean;
  /** Shown under the exercise. One line, the thing people get wrong. */
  cue: string;
}

const E = (
  id: string,
  name: string,
  pattern: Pattern,
  slot: Exercise['slot'],
  needs: EquipmentKey[],
  cue: string,
  extra: { minAge?: number; impact?: boolean } = {},
): Exercise => ({ id, name, pattern, slot, needs, cue, ...extra });

export const EXERCISES: Exercise[] = [
  // Squat
  E('goblet-squat', 'Goblet squat', 'squat', 'main', ['gym'], 'Chest up, knees tracking over your toes.', { minAge: 14 }),
  E('back-squat', 'Back squat', 'squat', 'main', ['gym'], 'Brace before you unrack. Stop a rep short of grinding.', { minAge: 16 }),
  E('db-squat-home', 'Dumbbell squat', 'squat', 'main', ['home-weights'], 'Slow down on the way, drive up.', { minAge: 14 }),
  E('bodyweight-squat', 'Bodyweight squat', 'squat', 'main', [], 'Three seconds down, one up. Harder than it sounds.'),
  E('split-squat', 'Split squat', 'squat', 'accessory', [], 'Back knee to the floor, front foot flat.'),
  E('wall-sit', 'Wall sit', 'squat', 'accessory', [], 'Thighs parallel, hold and breathe.'),

  // Hinge
  E('romanian-deadlift', 'Romanian deadlift', 'hinge', 'main', ['gym'], 'Push your hips back, keep the bar close, flat back.', { minAge: 16 }),
  E('db-rdl', 'Dumbbell Romanian deadlift', 'hinge', 'main', ['home-weights'], 'Hips back, not knees down. Feel it in the hamstrings.', { minAge: 14 }),
  E('hip-thrust', 'Hip thrust', 'hinge', 'accessory', ['gym'], 'Squeeze at the top, ribs down.', { minAge: 14 }),
  E('glute-bridge', 'Glute bridge', 'hinge', 'accessory', [], 'Pause two seconds at the top of every rep.'),
  E('good-morning', 'Bodyweight good morning', 'hinge', 'accessory', [], 'Hands on your head, hinge to parallel.'),

  // Push
  E('bench-press', 'Bench press', 'push', 'main', ['gym'], 'Feet planted, elbows about 45°. Use a spotter or the safeties.', { minAge: 16 }),
  E('db-press', 'Dumbbell bench press', 'push', 'main', ['home-weights'], 'Lower under control, no bouncing.', { minAge: 14 }),
  E('overhead-press', 'Overhead press', 'push', 'main', ['gym'], 'Squeeze your glutes so you press, not lean.', { minAge: 16 }),
  E('push-up', 'Push-up', 'push', 'main', [], 'Straight line head to heels. Hands on a bench if you need it easier.'),
  E('dip', 'Bench dip', 'push', 'accessory', [], 'Elbows back, not flared.'),
  E('pike-push-up', 'Pike push-up', 'push', 'accessory', [], 'Hips high, crown of your head to the floor.'),
  E('lateral-raise', 'Lateral raise', 'push', 'accessory', ['gym'], 'Light weight. Lead with your elbows.', { minAge: 14 }),

  // Pull
  E('lat-pulldown', 'Lat pulldown', 'pull', 'main', ['gym'], 'Pull to your collarbone, no swinging.', { minAge: 14 }),
  E('pull-up', 'Pull-up', 'pull', 'main', ['gym'], 'Bands or a machine if you need help. Full hang each rep.', { minAge: 14 }),
  E('db-row', 'Dumbbell row', 'pull', 'main', ['home-weights'], 'Flat back, pull to your hip.', { minAge: 14 }),
  E('seated-row', 'Seated row', 'pull', 'accessory', ['gym'], 'Shoulders down, squeeze at the back.', { minAge: 14 }),
  E('inverted-row', 'Inverted row', 'pull', 'main', [], 'Under a table or a low bar. Body straight.'),
  E('face-pull', 'Face pull', 'pull', 'accessory', ['gym'], 'High elbows, pull to your eyes. Great for posture.', { minAge: 14 }),
  E('superman', 'Superman hold', 'pull', 'accessory', [], 'Lift chest and thighs, hold ten seconds.'),

  // Core
  E('plank', 'Plank', 'core', 'accessory', [], 'Squeeze everything. Quality over time.'),
  E('dead-bug', 'Dead bug', 'core', 'accessory', [], 'Lower back stays pressed into the floor.'),
  E('hanging-knee-raise', 'Hanging knee raise', 'core', 'accessory', ['gym'], 'No swinging — control the way down.', { minAge: 14 }),
  E('side-plank', 'Side plank', 'core', 'accessory', [], 'Hips high, both sides equally.'),
  E('hollow-hold', 'Hollow hold', 'core', 'accessory', [], 'Lower back flat, arms overhead.'),

  // Carry & conditioning
  E('farmers-carry', 'Farmer’s carry', 'carry', 'accessory', ['gym'], 'Tall posture, walk it out.', { minAge: 14 }),
  E('suitcase-carry', 'Suitcase carry', 'carry', 'accessory', ['home-weights'], 'One side only. Do not lean.', { minAge: 14 }),
  E('bike-intervals', 'Bike intervals', 'conditioning', 'accessory', ['gym'], '30 seconds hard, 90 easy.', { minAge: 14 }),
  E('rower', 'Rowing machine', 'conditioning', 'accessory', ['gym'], 'Legs, then back, then arms. Reverse on the way in.', { minAge: 14 }),
  E('burpee', 'Burpees', 'conditioning', 'accessory', [], 'Steady pace beats a fast start.', { minAge: 14, impact: true }),
  E('mountain-climber', 'Mountain climbers', 'conditioning', 'accessory', [], 'Hips level, quick feet.', { impact: true }),
  E('skipping', 'Skipping', 'conditioning', 'accessory', [], 'Small bounces, soft knees.', { impact: true }),
];

const WARM_UPS = [
  '5 min easy cardio, then arm circles, leg swings and 10 bodyweight squats',
  '5 min brisk walk or bike, then hips, ankles and shoulders through full range',
  '3 min cardio, 10 glute bridges, 10 band pull-aparts or arm circles',
];

const COOL_DOWNS = [
  'Cool down: 3 min easy walking, then stretch whatever worked hardest',
  'Cool down: 5 min slow cardio and two hamstring/hip stretches, 30s each',
  'Cool down: walk until your breathing settles, then stretch for 3 min',
];

export interface GeneratedWorkout {
  title: string;
  /** Ordered lines: warm-up, the work, cool-down. */
  steps: string[];
  minutes: number;
  xp: number;
  tier: Tier;
  /** Where it has to be done, for the card. */
  place: 'gym' | 'home';
}

interface Shape {
  tier: Tier;
  mains: number;
  accessories: number;
  sets: number;
  reps: string;
  compoundReps: string;
  minutes: number;
  xp: number;
}

/**
 * Session size by Fitness rating. Someone at 35 gets three movements and two
 * sets — small enough that they finish it, which is the entire point at that
 * end of the scale.
 */
function shapeFor(rating: number): Shape {
  if (rating < 46) return { tier: 'light', mains: 2, accessories: 1, sets: 2, reps: '10–12', compoundReps: '8–10', minutes: 25, xp: 45 };
  if (rating < 60) return { tier: 'steady', mains: 3, accessories: 2, sets: 3, reps: '10–12', compoundReps: '8–10', minutes: 45, xp: 75 };
  if (rating < 74) return { tier: 'hard', mains: 3, accessories: 3, sets: 4, reps: '8–12', compoundReps: '6–8', minutes: 60, xp: 120 };
  return { tier: 'elite', mains: 4, accessories: 3, sets: 4, reps: '8–12', compoundReps: '6–8', minutes: 75, xp: 175 };
}

export function availableExercises(traits: Traits): Exercise[] {
  const limitations = new Set(traits.limitations);
  return EXERCISES.filter((exercise) => {
    if (exercise.minAge !== undefined && traits.age < exercise.minAge) return false;
    if (!exercise.needs.every((need) => traits.equipment.includes(need))) return false;
    if (exercise.impact && limitations.has('injury')) return false;
    return true;
  });
}

/** True when there is enough equipment and enough exercises to build a session. */
export function canBuildWorkout(traits: Traits): boolean {
  if (traits.limitations.includes('low-mobility')) return false;
  const pool = availableExercises(traits);
  const patterns = new Set(pool.filter((e) => e.slot === 'main').map((e) => e.pattern));
  return patterns.size >= 2;
}

/**
 * Builds one session. Mains are picked one per movement pattern so a session is
 * never three variations of the same thing, and the pattern order rotates with
 * the seed so consecutive workouts do not open with the same lift.
 */
export function buildWorkout(traits: Traits, fitnessRating: number, rng: Rng): GeneratedWorkout | null {
  if (!canBuildWorkout(traits)) return null;

  const pool = availableExercises(traits);
  const shape = shapeFor(fitnessRating);
  // A teen or a beginner is capped below whatever their rating alone would ask.
  const tier = capTier(shape.tier, traits.ceiling.fitness);
  const steps: string[] = [rng.pick(WARM_UPS)];

  const mainPatterns = rng.shuffled<Pattern>(['squat', 'hinge', 'push', 'pull']);
  const used = new Set<string>();
  let mains = 0;

  for (const pattern of mainPatterns) {
    if (mains >= shape.mains) break;
    const options = pool.filter((e) => e.slot === 'main' && e.pattern === pattern && !used.has(e.id));
    if (options.length === 0) continue;
    const exercise = rng.pick(options);
    used.add(exercise.id);
    mains++;
    const reps = exercise.pattern === 'squat' || exercise.pattern === 'hinge' ? shape.compoundReps : shape.reps;
    steps.push(`${exercise.name} — ${shape.sets} × ${reps}. ${exercise.cue}`);
  }

  const accessoryPool = rng.shuffled(pool.filter((e) => e.slot === 'accessory' && !used.has(e.id)));
  for (const exercise of accessoryPool.slice(0, shape.accessories)) {
    used.add(exercise.id);
    const prescription =
      exercise.pattern === 'core' || exercise.pattern === 'carry'
        ? `${shape.sets} × 30–40 seconds`
        : exercise.pattern === 'conditioning'
          ? `${Math.max(4, shape.sets * 2)} rounds`
          : `${shape.sets} × ${shape.reps}`;
    steps.push(`${exercise.name} — ${prescription}. ${exercise.cue}`);
  }

  steps.push(rng.pick(COOL_DOWNS));

  const place: GeneratedWorkout['place'] = traits.equipment.includes('gym') ? 'gym' : 'home';
  return {
    title: `${place === 'gym' ? 'Gym' : 'Home'} session — ${shape.minutes} minutes`,
    steps,
    minutes: shape.minutes,
    xp: shape.xp,
    tier,
    place,
  };
}

const TIER_ORDER: Tier[] = ['light', 'steady', 'hard', 'elite'];

function capTier(tier: Tier, ceiling: Tier): Tier {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(ceiling) ? tier : ceiling;
}
