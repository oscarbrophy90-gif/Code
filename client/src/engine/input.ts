import { emptyInput, type DribbleMoveId, type PlayerInput } from '@hoops/shared';

export interface ControlBinding {
  keys: string[];
  label: string;
  action: string;
}

/**
 * Keyboard layout. Left hand moves, right hand handles the ball — the same
 * split a controller uses, so muscle memory transfers.
 */
export const KEY_MOVES: Record<string, { move: DribbleMoveId; dir: [number, number] }> = {
  // J fakes left and goes right; L fakes right and goes left.
  KeyJ: { move: 'crossover', dir: [1, -0.25] },
  KeyL: { move: 'crossover', dir: [-1, -0.25] },
  KeyU: { move: 'behindBack', dir: [-1, -0.3] },
  KeyO: { move: 'spin', dir: [1, -0.4] },
  KeyI: { move: 'hesitation', dir: [0, -1] },
  KeyK: { move: 'stepback', dir: [0, 1] },
  KeyH: { move: 'sizeUp', dir: [0, -0.4] },
  KeyN: { move: 'euro', dir: [-1, -0.7] },
  KeyM: { move: 'snatchBack', dir: [0, 1] },
  KeyY: { move: 'hopJumper', dir: [1, -0.5] },
  KeyB: { move: 'doubleCross', dir: [-1, -0.5] },
  KeyV: { move: 'shamgod', dir: [1, -0.5] },
  KeyG: { move: 'betweenLegs', dir: [-1, -0.2] },
};

export const CONTROL_SHEET: ControlBinding[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move', action: 'Drive your player around the floor' },
  { keys: ['Shift'], label: 'Sprint', action: 'Burst — drains stamina fast' },
  { keys: ['Space'], label: 'Shoot / Contest', action: 'Hold to raise the meter, release in the green. On defense, jump to contest' },
  { keys: ['E'], label: 'Drive & Finish', action: 'Attack the rim for a layup, dunk or contact dunk' },
  { keys: ['F'], label: 'Steal', action: 'Reach in — a miss leaves you out of position' },
  { keys: ['R'], label: 'Pump Fake', action: 'Sell the shot and get the defender in the air' },
  { keys: ['J', 'L'], label: 'Crossover', action: 'J fakes left and goes right, L fakes right and goes left' },
  { keys: ['G'], label: 'Between the Legs', action: 'Tight change of direction' },
  { keys: ['U'], label: 'Behind the Back', action: 'Wide escape dribble' },
  { keys: ['O'], label: 'Spin', action: 'Spin off the defender' },
  { keys: ['I'], label: 'Hesitation', action: 'Freeze them, then burst' },
  { keys: ['K'], label: 'Stepback', action: 'Hold K: step back, keep holding to raise the meter, release to shoot' },
  { keys: ['M'], label: 'Snatch Back', action: 'Hard retreat into a shot' },
  { keys: ['Y'], label: 'Hop Jumper', action: 'Lateral hop into a shot' },
  { keys: ['N'], label: 'Eurostep', action: 'Two-step finish around a defender' },
  { keys: ['H'], label: 'Size-Up', action: 'Bait a reach and set up your combo' },
  { keys: ['B'], label: 'Double Crossover', action: 'Signature — needs 74 Ball Handle' },
  { keys: ['V'], label: 'Fake Pull-Through', action: 'Signature — needs 82 Ball Handle' },
  { keys: ['Esc'], label: 'Pause', action: 'Pause the match' },
];

type TouchState = {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  shoot: boolean;
  drive: boolean;
  steal: boolean;
  fake: boolean;
  move: DribbleMoveId | null;
  moveDirX: number;
  moveDirZ: number;
};

export class InputManager {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private gamepadIndex: number | null = null;
  private prevGamepadButtons: boolean[] = [];
  private prevStickMove = false;
  touch: TouchState = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    shoot: false,
    drive: false,
    steal: false,
    fake: false,
    move: null,
    moveDirX: 0,
    moveDirZ: 0,
  };
  private lastFacingX = 0;
  private lastFacingZ = -1;
  onPause: (() => void) | null = null;

  private keyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Escape') {
      this.onPause?.();
      return;
    }
    if (SWALLOW.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
  };

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private blur = () => {
    this.keys.clear();
  };

  attach(): void {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    window.addEventListener('gamepadconnected', this.onGamepad);
    window.addEventListener('gamepaddisconnected', this.onGamepadLost);
  }

  detach(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('gamepadconnected', this.onGamepad);
    window.removeEventListener('gamepaddisconnected', this.onGamepadLost);
    this.keys.clear();
  }

  private onGamepad = (e: Event) => {
    this.gamepadIndex = (e as GamepadEvent).gamepad.index;
  };

  private onGamepadLost = () => {
    this.gamepadIndex = null;
  };

  hasGamepad(): boolean {
    return this.gamepadIndex !== null;
  }

  /** Samples every device and folds them into one input for this frame. */
  sample(): PlayerInput {
    const input = emptyInput();

    // --- keyboard ----------------------------------------------------------
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) input.mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) input.mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) input.mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) input.mz += 1;
    input.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    input.shoot = this.keys.has('Space');
    input.contest = this.keys.has('Space');
    // K throws the stepback and then times it: hold to run the meter, release
    // to shoot. Space never fires a stepback.
    input.moveShoot = this.keys.has('KeyK');
    input.drive = this.keys.has('KeyE');
    input.steal = this.pressedThisFrame.has('KeyF');
    input.fake = this.pressedThisFrame.has('KeyR');

    for (const code of this.pressedThisFrame) {
      const mapped = KEY_MOVES[code];
      if (mapped) {
        input.move = mapped.move;
        input.moveDirX = mapped.dir[0];
        input.moveDirZ = mapped.dir[1];
        break;
      }
    }

    // --- touch -------------------------------------------------------------
    const t = this.touch;
    if (Math.abs(t.moveX) > 0.01 || Math.abs(t.moveZ) > 0.01) {
      input.mx = t.moveX;
      input.mz = t.moveZ;
    }
    input.sprint = input.sprint || t.sprint;
    input.shoot = input.shoot || t.shoot;
    input.contest = input.contest || t.shoot;
    // A touchscreen has no second button to hold, so SHOOT keeps timing the
    // stepback there exactly as it always has.
    input.moveShoot = input.moveShoot || t.shoot;
    input.drive = input.drive || t.drive;
    input.steal = input.steal || t.steal;
    input.fake = input.fake || t.fake;
    if (t.move) {
      input.move = t.move;
      input.moveDirX = t.moveDirX;
      input.moveDirZ = t.moveDirZ;
      t.move = null;
    }
    t.steal = false;
    t.fake = false;

    // --- gamepad -----------------------------------------------------------
    this.sampleGamepad(input);

    // Aim moves along the current heading when no direction was given.
    const mag = Math.hypot(input.mx, input.mz);
    if (mag > 0.15) {
      this.lastFacingX = input.mx / mag;
      this.lastFacingZ = input.mz / mag;
    }
    if (input.move && Math.hypot(input.moveDirX, input.moveDirZ) < 0.05) {
      input.moveDirX = this.lastFacingX;
      input.moveDirZ = this.lastFacingZ;
    }

    this.pressedThisFrame.clear();
    return input;
  }

  private sampleGamepad(input: PlayerInput): void {
    if (this.gamepadIndex === null) return;
    const pad = navigator.getGamepads?.()[this.gamepadIndex];
    if (!pad) return;

    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const lx = dead(pad.axes[0] ?? 0);
    const ly = dead(pad.axes[1] ?? 0);
    if (lx || ly) {
      input.mx = lx;
      input.mz = ly;
    }

    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const rising = (i: number) => btn(i) && !this.prevGamepadButtons[i];

    if (btn(7) || btn(5)) input.sprint = true; // RT / RB
    if (btn(0)) {
      input.shoot = true; // A / Cross
      input.contest = true;
      input.moveShoot = true; // no spare face button, so A times the stepback
    }
    if (btn(1)) input.drive = true; // B / Circle
    if (rising(2)) input.steal = true; // X / Square
    if (rising(3)) input.fake = true; // Y / Triangle

    // Right stick flicks map to dribble moves.
    const rx = dead(pad.axes[2] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);
    const rMag = Math.hypot(rx, ry);
    if (rMag > 0.7 && !this.prevStickMove) {
      const angle = Math.atan2(rx, -ry);
      input.move = stickToMove(angle, btn(6) || btn(4));
      input.moveDirX = rx / rMag;
      input.moveDirZ = ry / rMag;
    }
    this.prevStickMove = rMag > 0.7;

    this.prevGamepadButtons = pad.buttons.map((b) => b.pressed);
  }
}

/** Maps a right-stick flick angle onto a dribble move. */
function stickToMove(angle: number, modifier: boolean): DribbleMoveId {
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (deg > 315 || deg <= 45) return modifier ? 'hesitation' : 'hesitation'; // up
  if (deg > 45 && deg <= 135) return modifier ? 'spin' : 'crossover'; // right
  if (deg > 135 && deg <= 225) return modifier ? 'snatchBack' : 'stepback'; // down
  return modifier ? 'doubleCross' : 'behindBack'; // left
}

const SWALLOW = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);
