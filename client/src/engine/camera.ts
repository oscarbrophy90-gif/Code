/**
 * Pinhole camera used to project the court into 2D. World space is the sim's:
 * +x across the court, +y up, +z away from the backboard.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  x: number;
  y: number;
  /** distance along the view axis; <= 0 means behind the camera */
  depth: number;
  /** pixels per world foot at this depth, for sizing sprites */
  scale: number;
}

export class Camera {
  pos: Vec3 = { x: 0, y: 17, z: 47 };
  target: Vec3 = { x: 0, y: 4.2, z: 10 };
  fov = 42 * (Math.PI / 180);
  /** horizontal field of view, used to keep the court framed in portrait */
  hFov = 58 * (Math.PI / 180);

  private right: Vec3 = { x: 1, y: 0, z: 0 };
  private up: Vec3 = { x: 0, y: 1, z: 0 };
  private fwd: Vec3 = { x: 0, y: 0, z: -1 };
  private focal = 1;
  private cx = 0;
  private cy = 0;

  /** Recompute the basis. Call once per frame after moving the camera. */
  update(width: number, height: number): void {
    const fx = this.target.x - this.pos.x;
    const fy = this.target.y - this.pos.y;
    const fz = this.target.z - this.pos.z;
    const flen = Math.hypot(fx, fy, fz) || 1;
    this.fwd = { x: fx / flen, y: fy / flen, z: fz / flen };

    // right = forward x worldUp
    const rx = this.fwd.z * 0 - this.fwd.y * 0;
    void rx;
    const r = cross(this.fwd, { x: 0, y: 1, z: 0 });
    const rlen = Math.hypot(r.x, r.y, r.z) || 1;
    this.right = { x: r.x / rlen, y: r.y / rlen, z: r.z / rlen };
    this.up = cross(this.right, this.fwd);

    // Fit vertically on a wide screen, horizontally on a tall one. Without the
    // horizontal constraint a portrait phone would crop the court to a sliver.
    const verticalFocal = height / 2 / Math.tan(this.fov / 2);
    const horizontalFocal = width / 2 / Math.tan(this.hFov / 2);
    this.focal = Math.min(verticalFocal, horizontalFocal);
    this.cx = width / 2;
    // A tall viewport has vertical room to spare once the width is the binding
    // constraint, so bias the horizon upward rather than framing dead sky.
    const aspect = width / height;
    this.cy = height * (aspect < 0.85 ? 0.4 : 0.5);
  }

  project(x: number, y: number, z: number): Projected {
    const vx = x - this.pos.x;
    const vy = y - this.pos.y;
    const vz = z - this.pos.z;
    const depth = vx * this.fwd.x + vy * this.fwd.y + vz * this.fwd.z;
    if (depth <= 0.05) {
      return { x: 0, y: 0, depth, scale: 0 };
    }
    const a = vx * this.right.x + vy * this.right.y + vz * this.right.z;
    const b = vx * this.up.x + vy * this.up.y + vz * this.up.z;
    const k = this.focal / depth;
    return { x: this.cx + a * k, y: this.cy - b * k, depth, scale: k };
  }

  /**
   * Frames the action: the camera drifts with the ball handler and pulls back
   * as the two players separate, the way a broadcast camera would.
   */
  follow(focusX: number, focusZ: number, spread: number, dt: number, distance = 1): void {
    // The rim is the anchor of a half-court game, so the camera only drifts
    // slightly with the ball — enough to feel alive, never enough to lose it.
    //
    // `distance` scales how far back the whole rig sits, from the player's
    // camera setting. The look target stays put and the position moves away
    // along both axes, which keeps the rim in the same part of the frame at
    // every distance instead of drifting up the screen as you pull out.
    // Clamped to [1, 2.2]: further out is safe at any setting, but nearer
    // than the classic framing would put the front of the court apron behind
    // the camera plane, which is how polygons end up smeared across the sky.
    const d = Math.max(1, Math.min(2.2, distance));
    const targetCamX = focusX * 0.16;
    const targetCamZ = (44 + spread * 0.34 + Math.max(0, focusZ - 20) * 0.5) * d;
    const targetCamY = (16.5 + spread * 0.11) * (0.55 + d * 0.45);
    const targetLookX = focusX * 0.22;
    const targetLookZ = 8 + focusZ * 0.2;

    const k = 1 - Math.pow(0.0016, dt);
    this.pos.x += (targetCamX - this.pos.x) * k;
    this.pos.z += (targetCamZ - this.pos.z) * k;
    this.pos.y += (targetCamY - this.pos.y) * k;
    this.target.x += (targetLookX - this.target.x) * k;
    this.target.z += (targetLookZ - this.target.z) * k;
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
