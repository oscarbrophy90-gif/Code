/**
 * Court geometry, in feet. Origin is the centre of the baseline under the
 * basket: +x runs to the right, +z runs away from the backboard toward half
 * court, +y is up.
 */
export const COURT = {
  halfWidth: 25,
  depth: 47,
  /** rim centre */
  rimX: 0,
  rimZ: 5.25,
  rimY: 10,
  rimRadius: 0.75,
  backboardZ: 4,
  backboardWidth: 6,
  backboardHeight: 3.5,
  backboardBottomY: 9.5,
  threeRadius: 23.75,
  cornerThreeX: 22,
  keyHalfWidth: 8,
  freeThrowZ: 19,
  restrictedRadius: 4,
  /** ball must be taken back past this distance from the rim after a change */
  clearRadius: 23.75,
  /** 1v1 games are played on this much of the floor */
  playDepth: 34,
} as const;

export function distanceToRim(x: number, z: number): number {
  const dx = x - COURT.rimX;
  const dz = z - COURT.rimZ;
  return Math.sqrt(dx * dx + dz * dz);
}

/** True when the shot location is behind the three point line. */
export function isBeyondArc(x: number, z: number): boolean {
  if (Math.abs(x) >= COURT.cornerThreeX) {
    // Corner three: straight segment until the arc takes over.
    return z <= COURT.rimZ + Math.sqrt(Math.max(0, COURT.threeRadius ** 2 - COURT.cornerThreeX ** 2));
  }
  return distanceToRim(x, z) >= COURT.threeRadius;
}

export function inPaint(x: number, z: number): boolean {
  return Math.abs(x) <= COURT.keyHalfWidth && z <= COURT.freeThrowZ;
}

export function clampToCourt(x: number, z: number): { x: number; z: number } {
  const margin = 0.6;
  return {
    x: Math.max(-COURT.halfWidth + margin, Math.min(COURT.halfWidth - margin, x)),
    z: Math.max(margin, Math.min(COURT.playDepth, z)),
  };
}

/** Points a shot from this spot is worth in 1v1 streetball scoring. */
export function shotValue(x: number, z: number): 1 | 2 {
  return isBeyondArc(x, z) ? 2 : 1;
}
