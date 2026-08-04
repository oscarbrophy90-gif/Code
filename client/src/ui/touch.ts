import type { DribbleMoveId } from '@hoops/shared';
import { el } from './dom.ts';

interface TouchTarget {
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
}

const STYLE = `
.tc { position:absolute; inset:0; pointer-events:none; z-index:5; touch-action:none; }
.tc-stick { position:absolute; left:max(18px, env(safe-area-inset-left)); bottom:calc(22px + env(safe-area-inset-bottom));
  width:132px; height:132px; border-radius:50%; background:rgba(20,25,36,.5); border:1px solid rgba(42,51,70,.9);
  pointer-events:auto; backdrop-filter:blur(6px); }
.tc-knob { position:absolute; left:50%; top:50%; width:54px; height:54px; margin:-27px 0 0 -27px; border-radius:50%;
  background:rgba(238,242,248,.28); border:1px solid rgba(238,242,248,.45); transition:background .12s; }
.tc-pad { position:absolute; right:max(14px, env(safe-area-inset-right)); bottom:calc(18px + env(safe-area-inset-bottom));
  display:grid; grid-template-columns:repeat(3, 62px); gap:9px; pointer-events:auto; }
.tc-btn { height:62px; border-radius:50%; background:rgba(20,25,36,.62); border:1px solid rgba(42,51,70,.95);
  color:#eef2f8; font-size:10px; font-weight:900; letter-spacing:.06em; display:grid; place-items:center;
  backdrop-filter:blur(6px); user-select:none; -webkit-user-select:none; text-align:center; line-height:1.1; padding:4px; }
.tc-btn.hot { background:rgba(255,122,61,.65); }
.tc-btn.go { background:rgba(62,240,122,.28); border-color:rgba(62,240,122,.6); }
.tc-btn.wide { grid-column: span 2; border-radius:31px; }
.tc-btn:active { transform:scale(.94); }
/* The swipe zone sits over open floor and stays visually out of the way — a
   solid panel here would hide the defender you are trying to read. */
.tc-swipe { position:absolute; right:max(10px, env(safe-area-inset-right)); bottom:calc(196px + env(safe-area-inset-bottom));
  width:172px; height:76px; border-radius:12px; background:transparent; border:1px dashed rgba(98,110,134,.35);
  pointer-events:auto; display:grid; place-items:end center; padding-bottom:5px; color:rgba(98,110,134,.75);
  font-size:9px; font-weight:800; letter-spacing:.09em; text-align:center; }
.tc-swipe:active { border-color:rgba(62,240,122,.6); }
@media (max-height: 520px) { .tc-swipe { display:none; } }
/* Without this there is no way off a phone out of a match or a shoot-around,
   which has no clock to run out. */
.tc-pause { position:absolute; right:max(14px, env(safe-area-inset-right)); top:calc(12px + env(safe-area-inset-top));
  width:44px; height:44px; border-radius:50%; background:rgba(20,25,36,.62); border:1px solid rgba(42,51,70,.95);
  color:#eef2f8; pointer-events:auto; backdrop-filter:blur(6px); display:grid; place-items:center;
  font-size:13px; font-weight:900; letter-spacing:.08em; }
.tc-pause:active { transform:scale(.94); }
`;

/**
 * Mobile controls: a left thumbstick for movement, a right button cluster for
 * actions, and a swipe pad that maps flick direction onto dribble moves.
 */
export function buildTouchControls(target: TouchTarget, onPause?: () => void): HTMLElement {
  const root = el('div', { class: 'tc' });
  root.appendChild(el('style', { html: STYLE }));

  // ---------------------------------------------------------------- joystick
  const stick = el('div', { class: 'tc-stick' });
  const knob = el('div', { class: 'tc-knob' });
  stick.appendChild(knob);
  let stickId: number | null = null;

  const setStick = (dx: number, dy: number) => {
    const max = 46;
    const len = Math.hypot(dx, dy);
    const clamped = len > max ? max / len : 1;
    const x = dx * clamped;
    const y = dy * clamped;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    target.moveX = x / max;
    target.moveZ = y / max;
  };

  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const r = stick.getBoundingClientRect();
    setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  });
  stick.addEventListener('pointermove', (e) => {
    if (stickId !== e.pointerId) return;
    const r = stick.getBoundingClientRect();
    setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  });
  const endStick = (e: PointerEvent) => {
    if (stickId !== e.pointerId) return;
    stickId = null;
    knob.style.transform = '';
    target.moveX = 0;
    target.moveZ = 0;
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  // ------------------------------------------------------------ action pad
  const hold = (node: HTMLElement, set: (on: boolean) => void) => {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.classList.add('hot');
      set(true);
      node.setPointerCapture(e.pointerId);
    });
    const off = () => {
      node.classList.remove('hot');
      set(false);
    };
    node.addEventListener('pointerup', off);
    node.addEventListener('pointercancel', off);
    node.addEventListener('pointerleave', off);
  };

  const tap = (node: HTMLElement, fire: () => void) => {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fire();
      node.classList.add('hot');
      setTimeout(() => node.classList.remove('hot'), 110);
    });
  };

  const sprintBtn = el('button', { class: 'tc-btn' }, 'SPRINT');
  const stealBtn = el('button', { class: 'tc-btn' }, 'STEAL');
  const fakeBtn = el('button', { class: 'tc-btn' }, 'FAKE');
  const driveBtn = el('button', { class: 'tc-btn' }, 'DRIVE');
  const shootBtn = el('button', { class: 'tc-btn go wide' }, 'SHOOT / CONTEST');

  hold(sprintBtn, (on) => (target.sprint = on));
  hold(shootBtn, (on) => (target.shoot = on));
  hold(driveBtn, (on) => (target.drive = on));
  tap(stealBtn, () => (target.steal = true));
  tap(fakeBtn, () => (target.fake = true));

  const pad = el('div', { class: 'tc-pad' }, fakeBtn, stealBtn, sprintBtn, shootBtn, driveBtn);

  // ---------------------------------------------------------------- swipe pad
  const swipe = el('div', { class: 'tc-swipe' }, 'SWIPE FOR DRIBBLE MOVES');
  let start: { x: number; y: number } | null = null;
  swipe.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    swipe.setPointerCapture(e.pointerId);
  });
  swipe.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    const len = Math.hypot(dx, dy);
    if (len < 22) {
      // A tap is a size-up.
      target.move = 'sizeUp';
      target.moveDirX = 0;
      target.moveDirZ = -1;
      return;
    }
    target.moveDirX = dx / len;
    target.moveDirZ = dy / len;
    target.move = swipeToMove(dx, dy, len);
  });

  // -------------------------------------------------------------- pause
  if (onPause) {
    const pauseBtn = el('button', { class: 'tc-pause', 'aria-label': 'Pause' }, 'II');
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPause();
    });
    root.appendChild(pauseBtn);
  }

  root.append(stick, pad, swipe);
  return root;
}

function swipeToMove(dx: number, dy: number, len: number): DribbleMoveId {
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const hard = len > 90;
  if (angle > 315 || angle <= 45) return 'hesitation';
  if (angle > 45 && angle <= 135) return hard ? 'spin' : 'crossover';
  if (angle > 135 && angle <= 225) return hard ? 'snatchBack' : 'stepback';
  return hard ? 'behindBack' : 'crossover';
}
