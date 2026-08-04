import { PARKS, computeOverall, generateOpponent, hashString, type ParkDef } from '@hoops/shared';

import { store } from '../../state/store.ts';
import { navigate } from '../../main.ts';
import { el, panel } from '../dom.ts';
import { startMatch } from '../session.ts';
import { hexA, mix } from '../../render/court.ts';

interface CourtNode {
  x: number;
  y: number;
  r: number;
  label: string;
  mode: 'ranked' | 'casual' | 'kotc' | 'training';
  busy: number;
}

interface Npc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  name: string;
}

let selectedPark = 'downtown';

export function renderParks(): HTMLElement {
  const player = store.player;
  const park = PARKS.find((p) => p.id === selectedPark) ?? PARKS[0];

  const root = el('div', { class: 'wrap' });
  root.append(
    el('h1', { class: 'page' }, 'Parks'),
    el('p', { class: 'page-sub' }, 'Walk the park, find an open court and queue from where you stand. Every park runs the same rules — only the light, the surface and the crowd change.'),
  );

  const hubHost = el('div', {});

  root.append(
    el(
      'div',
      { class: 'seg mb' },
      ...PARKS.map((p) => {
        const locked = player.level < p.unlockLevel;
        return el(
          'button',
          {
            class: selectedPark === p.id ? 'on' : '',
            disabled: locked,
            title: locked ? `Unlocks at level ${p.unlockLevel}` : p.tagline,
            onclick: () => {
              selectedPark = p.id;
              navigate('parks');
            },
          },
          locked ? `${p.name} · LV ${p.unlockLevel}` : p.name,
        );
      }),
    ),
    el(
      'div',
      { class: 'split' },
      hubHost,
      el(
        'div',
        { style: 'display:grid;gap:14px' },
        panel(
          park.name,
          el('p', { class: 'dim', style: 'margin:0 0 12px;font-size:13px' }, park.tagline),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Courts'), el('span', { class: 'v' }, String(park.courts))),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Time of day'), el('span', { class: 'v' }, park.timeOfDay)),
          el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Unlock'), el('span', { class: 'v' }, park.unlockLevel === 1 ? 'Available' : `Level ${park.unlockLevel}`)),
          el(
            'div',
            { class: 'row', style: 'margin-top:14px' },
            ...Object.entries(park.palette)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => el('span', { class: 'chip', title: k }, el('span', { class: 'dot', style: `background:${v as string}` }), k)),
          ),
        ),
        panel(
          'Runs',
          el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Every court here runs a CPU opponent at your selected difficulty. Walk up to one and step on the ring to start.'),
          el(
            'div',
            { class: 'row' },
            el('button', { class: 'btn sm', onclick: () => navigate('play') }, 'Choose difficulty'),
          ),
        ),
        panel(
          'How to move',
          el('p', { class: 'hint', style: 'margin:0' }, 'Drag or use WASD inside the park view to walk. Step onto a court ring to open it, then pick a mode.'),
        ),
      ),
    ),
  );

  hubHost.appendChild(buildHub(park));
  return root;
}

/** A small top-down park you can actually walk around. */
function buildHub(park: ParkDef): HTMLElement {
  const wrapper = el('div', { class: 'panel clipped', style: 'padding:0;overflow:hidden;position:relative' });
  const canvas = el('canvas', { style: 'display:block;width:100%;height:420px;touch-action:none;cursor:grab' }) as HTMLCanvasElement;
  wrapper.appendChild(canvas);

  const prompt = el('div', {
    style:
      'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(8,10,16,.9);border:1px solid var(--line);border-radius:4px;padding:8px 14px;font-size:12px;font-weight:800;display:none',
  });
  wrapper.appendChild(prompt);

  const ctx = canvas.getContext('2d')!;
  const W = 900;
  const H = 480;

  const allCourts: CourtNode[] = [
    { x: 210, y: 150, r: 62, label: 'Main Court', mode: 'ranked', busy: 0.7 },
    { x: 470, y: 110, r: 58, label: 'Side Court', mode: 'casual', busy: 0.4 },
    { x: 700, y: 200, r: 58, label: 'King of the Court', mode: 'kotc', busy: 0.9 },
    { x: 330, y: 340, r: 54, label: 'Training Rim', mode: 'training', busy: 0.1 },
  ];
  const courts = allCourts.slice(0, Math.max(2, Math.min(4, park.courts - 1)));

  const npcs: Npc[] = [];
  for (let i = 0; i < 14; i++) {
    npcs.push({
      x: 80 + Math.random() * (W - 160),
      y: 70 + Math.random() * (H - 140),
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.5) * 22,
      hue: Math.floor(Math.random() * 360),
      name: '',
    });
  }

  const me = { x: W / 2, y: H - 70, vx: 0, vy: 0 };
  const keys = new Set<string>();
  let pointer: { x: number; y: number } | null = null;
  let nearCourt: CourtNode | null = null;
  let raf = 0;
  let last = performance.now();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform((canvas.width / W) * 1, 0, 0, (canvas.height / H) * 1, 0, 0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!wrapper.isConnected) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
    if (e.code === 'Enter' && nearCourt) openCourt(nearCourt);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    pointer = { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointer) return;
    const rect = canvas.getBoundingClientRect();
    pointer = { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  });
  const endPointer = () => (pointer = null);
  canvas.addEventListener('pointerup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const hit = courts.find((c) => Math.hypot(c.x - px, c.y - py) < c.r);
    endPointer();
    if (hit && Math.hypot(hit.x - me.x, hit.y - me.y) < hit.r + 40) openCourt(hit);
  });
  canvas.addEventListener('pointercancel', endPointer);

  function openCourt(court: CourtNode): void {
    const player = store.player;
    if (court.mode === 'training') {
      const dummy = generateOpponent(60, hashString(`park-${park.id}`));
      dummy.name = 'Training Rim';
      dummy.attrs.perimeterDefense = 25;
      dummy.attrs.interiorDefense = 25;
      dummy.attrs.steal = 25;
      dummy.attrs.block = 25;
      startMatch({
        opponent: dummy,
        difficulty: 'rookie',
        parkId: park.id,
        playlist: 'casual',
        config: { targetScore: 21, maxScore: 21, winBy: 1, shotClock: 60 },
      });
      return;
    }
    if (court.mode === 'kotc') {
      startMatch({
        opponent: generateOpponent(Math.max(60, computeOverall(player.attributes, player.build.position)), hashString(`kotc-${Date.now()}`)),
        difficulty: 'allStar',
        parkId: park.id,
        playlist: 'event',
        config: { targetScore: 7, maxScore: 9 },
        eventName: 'King of the Court',
      });
      return;
    }
    navigate('play');
  }

  const loop = (now: number) => {
    if (!wrapper.isConnected) {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      return;
    }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Movement.
    let ax = 0;
    let ay = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
    if (pointer) {
      const dx = pointer.x - me.x;
      const dy = pointer.y - me.y;
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        ax = dx / len;
        ay = dy / len;
      }
    }
    const speed = 165;
    me.vx += (ax * speed - me.vx) * Math.min(1, dt * 9);
    me.vy += (ay * speed - me.vy) * Math.min(1, dt * 9);
    me.x = Math.max(24, Math.min(W - 24, me.x + me.vx * dt));
    me.y = Math.max(46, Math.min(H - 24, me.y + me.vy * dt));

    for (const n of npcs) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.x < 40 || n.x > W - 40) n.vx *= -1;
      if (n.y < 60 || n.y > H - 40) n.vy *= -1;
    }

    nearCourt = courts.find((c) => Math.hypot(c.x - me.x, c.y - me.y) < c.r + 18) ?? null;
    prompt.style.display = nearCourt ? 'block' : 'none';
    if (nearCourt) prompt.textContent = `${nearCourt.label} — press Enter or tap the court`;

    draw();
  };

  function draw(): void {
    // Ground.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(park.palette.sky[0], '#05070b', 0.4));
    g.addColorStop(0.28, mix(park.palette.floor, '#05070b', 0.45));
    g.addColorStop(1, mix(park.palette.floor, '#05070b', 0.18));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Path texture.
    ctx.strokeStyle = hexA(park.palette.line, 0.05);
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 30, H);
      ctx.stroke();
    }

    // Courts.
    for (const c of courts) {
      const near = nearCourt === c;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r, c.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = hexA(park.palette.paint, 0.75);
      ctx.fill();
      ctx.strokeStyle = near ? park.palette.accent : hexA(park.palette.line, 0.7);
      ctx.lineWidth = near ? 3 : 1.6;
      ctx.stroke();

      // Hoop stub.
      ctx.strokeStyle = '#e8eef5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - c.r * 0.55);
      ctx.lineTo(c.x, c.y - c.r * 0.55 - 26);
      ctx.stroke();
      ctx.fillStyle = '#ff6b2c';
      ctx.fillRect(c.x - 9, c.y - c.r * 0.55 - 30, 18, 4);

      ctx.font = '900 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = near ? park.palette.accent : 'rgba(238,242,248,.75)';
      ctx.fillText(c.label.toUpperCase(), c.x, c.y + c.r * 0.62 + 16);
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(150,162,184,.7)';
      ctx.fillText(`${Math.round(c.busy * 9) + 1} waiting`, c.x, c.y + c.r * 0.62 + 30);
      ctx.restore();
    }

    // NPCs then the player, sorted so nearer figures draw last.
    const figures = [...npcs.map((n) => ({ ...n, me: false })), { ...me, hue: 0, me: true }];
    figures.sort((a, b) => a.y - b.y);
    for (const f of figures) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 2, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = f.me ? '#3ef07a' : `hsl(${(f as Npc).hue}, 45%, 55%)`;
      ctx.fillRect(f.x - 5, f.y - 22, 10, 17);
      ctx.beginPath();
      ctx.arc(f.x, f.y - 26, 5, 0, Math.PI * 2);
      ctx.fillStyle = f.me ? '#d1a07a' : '#b0784f';
      ctx.fill();
      if (f.me) {
        ctx.strokeStyle = 'rgba(62,240,122,.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + 2, 13, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '800 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#eef2f8';
        ctx.fillText(store.player.name, f.x, f.y - 34);
      }
      ctx.restore();
    }

    // Vignette.
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  requestAnimationFrame(() => {
    resize();
    raf = requestAnimationFrame(loop);
  });
  window.addEventListener('resize', resize);

  return wrapper;
}
