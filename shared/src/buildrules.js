/**
 * What a build is allowed to be.
 *
 * Plain JavaScript on purpose. These rules decide both what the creator lets
 * you make and what the server is willing to believe, and those two have to be
 * the same rules or the server starts rejecting legitimate players. One file,
 * imported by the TypeScript client through its .d.ts and by the Node server
 * directly, so there is no second copy to drift.
 *
 * Nothing here knows about matches, RP or the network. It answers one question:
 * given a body, how good is each attribute allowed to get?
 */

/**
 * The attribute list, duplicated from types.ts because that file is TypeScript
 * and this one has to load in plain Node. `buildrules.test.ts` fails if the two
 * ever disagree, which is the only way this duplication is safe.
 */
export const ATTRIBUTE_KEYS = [
  'closeShot', 'freeThrow', 'threePoint', 'midRange', 'layup', 'dunk',
  'ballHandle', 'speedWithBall', 'passAccuracy',
  'speed', 'acceleration', 'strength', 'vertical', 'stamina',
  'perimeterDefense', 'interiorDefense', 'offensiveRebound', 'defensiveRebound', 'steal', 'block',
];

export const MIN_ATTRIBUTE = 25;

/** Height range per position, in inches. */
export const HEIGHT_RANGE = {
  PG: { min: 68, max: 78 },
  SG: { min: 72, max: 81 },
  SF: { min: 76, max: 84 },
  PF: { min: 78, max: 87 },
  C: { min: 80, max: 90 },
};

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function emptyAttributes(value = MIN_ATTRIBUTE) {
  const out = {};
  for (const key of ATTRIBUTE_KEYS) out[key] = value;
  return out;
}

/**
 * Attribute caps are derived from the physical build. Taller/heavier builds
 * trade perimeter skill for interior presence, so every build has a real
 * identity instead of one dominant meta build.
 */
export function computeCaps(build) {
  const caps = emptyAttributes(99);
  // Normalised build descriptors, all roughly -1..1.
  const h = (build.heightIn - 78) / 12; // 6'6" is neutral
  const w = (build.weightLb - 215) / 75;
  const span = (build.wingspanIn - build.heightIn) / 9; // 0 .. 1 for +0" .. +9"

  const set = (key, value) => {
    caps[key] = clamp(Math.round(value), 55, 99);
  };

  set('closeShot', 92 + h * 8 + Math.max(0, w) * 4 - Math.max(0, -h) * 10);
  set('freeThrow', 99 - h * 14 - Math.max(0, w) * 6);
  set('threePoint', 99 - h * 26 - Math.max(0, w) * 10);
  set('midRange', 99 - h * 16 - Math.max(0, w) * 7);
  set('layup', 99 - Math.max(0, h) * 12 - Math.max(0, w) * 8);
  set('dunk', 72 + h * 22 + w * 12 + span * 6);
  set('ballHandle', 99 - h * 34 - Math.max(0, w) * 16);
  set('speedWithBall', 99 - h * 30 - Math.max(0, w) * 20);
  set('passAccuracy', 99 - h * 16 - Math.max(0, w) * 6);
  set('speed', 99 - h * 26 - Math.max(0, w) * 18);
  set('acceleration', 99 - h * 25 - Math.max(0, w) * 20);
  set('strength', 66 + h * 16 + w * 26);
  set('vertical', 92 - Math.max(0, w) * 22 + Math.max(0, -h) * 6);
  set('stamina', 96 - Math.max(0, h) * 18 - Math.max(0, w) * 14);
  set('perimeterDefense', 99 - h * 24 - Math.max(0, w) * 12 + span * 5);
  set('interiorDefense', 66 + h * 24 + w * 14 + span * 6);
  set('offensiveRebound', 60 + h * 28 + w * 15 + span * 8);
  set('defensiveRebound', 64 + h * 27 + w * 13 + span * 8);
  set('steal', 96 - h * 16 - Math.max(0, w) * 10 + span * 4);
  set('block', 60 + h * 28 + span * 12 + Math.max(0, -w) * 4);

  // Position bias: a build's declared position nudges a few caps so position
  // choice matters without letting one position dominate.
  const bias = {
    PG: { ballHandle: 5, speedWithBall: 5, passAccuracy: 5, speed: 3, freeThrow: 3, offensiveRebound: -7, defensiveRebound: -5, interiorDefense: -5 },
    SG: { threePoint: 4, midRange: 3, freeThrow: 3, steal: 2, offensiveRebound: -5, defensiveRebound: -3, strength: -3 },
    SF: { layup: 3, perimeterDefense: 3, dunk: 2, closeShot: 2 },
    PF: { offensiveRebound: 4, defensiveRebound: 4, closeShot: 3, interiorDefense: 4, strength: 3, ballHandle: -4, speedWithBall: -4, threePoint: -3 },
    C: { block: 6, offensiveRebound: 5, defensiveRebound: 5, closeShot: 4, interiorDefense: 5, ballHandle: -8, speedWithBall: -8, speed: -4, threePoint: -6, freeThrow: -4 },
  };
  for (const [key, delta] of Object.entries(bias[build.position] ?? {})) {
    caps[key] = clamp(caps[key] + delta, 55, 99);
  }
  return caps;
}

// ------------------------------------------------------- server-side checking

/**
 * A body the game would actually let you make.
 *
 * Everything is pulled back inside its range rather than rejected, so a build
 * that is merely odd still plays — only the parts that are impossible get
 * corrected. Returns the legal body and whether anything had to move.
 */
export function clampPhysicalBuild(claim) {
  const notes = [];
  const position = POSITIONS.includes(claim?.position) ? claim.position : 'SF';
  if (position !== claim?.position) notes.push(`position ${JSON.stringify(claim?.position)} -> ${position}`);

  const range = HEIGHT_RANGE[position];
  const heightIn = clamp(Math.round(Number(claim?.heightIn) || range.min), range.min, range.max);
  if (heightIn !== Math.round(Number(claim?.heightIn))) notes.push(`height ${claim?.heightIn} -> ${heightIn}`);

  // Weight tracks height: a 7-footer cannot weigh 160lb and a guard cannot
  // weigh 290. The band is the same shape the creator offers.
  const weightLo = Math.round(150 + (heightIn - 68) * 5.5);
  const weightHi = Math.round(205 + (heightIn - 68) * 7.5);
  const weightLb = clamp(Math.round(Number(claim?.weightLb) || weightLo), weightLo, weightHi);
  if (weightLb !== Math.round(Number(claim?.weightLb))) notes.push(`weight ${claim?.weightLb} -> ${weightLb}`);

  const wingspanIn = clamp(Math.round(Number(claim?.wingspanIn) || heightIn), heightIn - 4, heightIn + 9);
  if (wingspanIn !== Math.round(Number(claim?.wingspanIn))) notes.push(`wingspan ${claim?.wingspanIn} -> ${wingspanIn}`);

  return { build: { position, heightIn, weightLb, wingspanIn }, notes };
}

/**
 * Pull a claimed attribute set back inside what that body is allowed.
 *
 * This is the whole answer to "I set every stat to 99 in the console". The caps
 * are a function of the body, and a body that could hold 99 three-point AND 99
 * interior defence does not exist — so the claim is clamped, per attribute, to
 * what the build system would ever have sold. Nothing is rejected outright and
 * nobody is banned: the numbers are simply corrected to legal ones before the
 * match is built from them.
 */
export function clampAttributes(claim, build) {
  const caps = computeCaps(build);
  const attrs = {};
  const notes = [];
  for (const key of ATTRIBUTE_KEYS) {
    const raw = Number(claim?.[key]);
    const asked = Number.isFinite(raw) ? Math.round(raw) : MIN_ATTRIBUTE;
    const legal = clamp(asked, MIN_ATTRIBUTE, caps[key]);
    if (legal !== asked) notes.push(`${key} ${asked} -> ${legal} (cap ${caps[key]})`);
    attrs[key] = legal;
  }
  return { attrs, caps, notes };
}
