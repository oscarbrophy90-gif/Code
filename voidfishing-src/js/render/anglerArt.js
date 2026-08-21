/* VOID FISHING — the person doing the fishing.

   A small rig rather than a fixed silhouette. The pose is a handful of
   smoothed scalars driven by what the rod is doing; the skeleton is built
   from those every frame, the arms are solved with two-bone IK so the hands
   actually reach the grip, and the limbs are drawn as tapered ribbons so the
   figure reads as a body instead of a stack of capstrokes.

   Three modes share the rig: sitting on the ledge (origin at the seat),
   standing, and walking (origin on the ground between the feet), so the same
   figure can get up and go and talk to somebody. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const TAU = U.TAU;


  /* Moonlight comes over the water from up and to the right, and it is cold.
     Every part of the figure is filled with the same directional ramp so the
     body has form instead of being a flat cut-out. */
  const MOON = [148, 178, 220];

  function tone(rgb, k) {
    return U.rgbToCss(k >= 0 ? U.mixRgb(rgb, MOON, k) : U.shade(rgb, k));
  }

  function ramp(ctx, rgb, fh, lo, hi) {
    const g = ctx.createLinearGradient(fh * 0.30, -fh * 0.92, -fh * 0.22, fh * 0.26);
    g.addColorStop(0, tone(rgb, hi));
    g.addColorStop(0.42, tone(rgb, U.lerp(lo, hi, 0.55)));
    g.addColorStop(1, tone(rgb, lo));
    return g;
  }

  /* ------------------------------------------------------------- posing
     Everything here is 0..1 unless noted. The scene pushes fishing state in
     once per frame and the values chase their targets, so the figure never
     snaps between poses. */
  const P = {
    lean: 0.05,      // -1 hunched forward … +1 hauling back
    pull: 0,         // arms drawn in toward the chest
    alert: 0,        // spine tension — the moment something takes the bait
    crank: 0,        // how hard the reel hand is working
    phase: 0,        // accumulated crank rotation
    glance: 0,       // idle head turn, wanders on its own
    glanceT: 4
  };

  function update(dt, S) {
    S = S || {};
    const st = S.state || 'idle';
    let lean = 0.05, pull = 0.02, alert = 0, crank = 0;

    if (S.charging) {
      // loading the cast: weight goes back, elbows fold in
      const c = U.easeInOutSine(S.charge || 0);
      lean = 0.05 + c * 0.42;
      pull = 0.10 + c * 0.55;
    } else if (st === 'casting') {
      // the follow-through — forward and open, then settling
      const k = U.clamp((S.flight || 0) / 0.4, 0, 1);
      lean = U.lerp(-0.70, 0.05, U.easeOutCubic(k));
      pull = U.lerp(0.30, 0.02, k);
    } else if (st === 'bite') {
      alert = 1;
      lean = -0.16;
      pull = 0.30;
    } else if (st === 'reeling' && S.fight) {
      const ten = U.clamp(S.fight.tension || 0, 0, 1);
      const sur = U.clamp(S.fight.surge || 0, 0, 1);
      lean = 0.18 + ten * 0.62 + sur * 0.10;
      pull = 0.34 + ten * 0.44;
      alert = 0.35 + ten * 0.4;
      crank = S.fight.reeling ? 1 : 0.06;
    } else if (st === 'waiting') {
      lean = 0.05 + (S.nibble || 0) * 0.10;
      alert = (S.nibble || 0) * 0.5;
    }

    P.lean = U.approach(P.lean, lean, 0.0035, dt);
    P.pull = U.approach(P.pull, pull, 0.0035, dt);
    P.alert = U.approach(P.alert, alert, 0.002, dt);
    P.crank = U.approach(P.crank, crank, 0.004, dt);
    P.phase += P.crank * dt * 7.5;

    // an idle figure looks around now and then; a busy one does not
    P.glanceT -= dt;
    if (P.glanceT <= 0) {
      P.glanceT = 3.5 + Math.random() * 7;
      P.glance = (Math.random() - 0.45) * 0.9;
    }
    P.glance = U.approach(P.glance, alert > 0.3 ? 0 : P.glance, 0.9, dt);
  }

  /* ------------------------------------------------------------ geometry */

  /* Two-bone IK. Returns the elbow (or knee) that puts the end effector at
     the target, bending toward `sign`. */
  function solve(sx, sy, hx, hy, l1, l2, sign) {
    let dx = hx - sx, dy = hy - sy;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) { d = 1e-4; dx = 1e-4; }
    const ux = dx / d, uy = dy / d;
    const reach = U.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.998);
    const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { x: sx + ux * a - uy * h * sign, y: sy + uy * a + ux * h * sign };
  }

  /* A tapered ribbon along a quadratic — the whole reason the limbs have any
     shape to them. Caps are drawn as discs by the caller. */
  function ribbon(ctx, ax, ay, bx, by, cx, cy, w0, w1, steps) {
    steps = steps || 9;
    const lhs = [], rhs = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, iu = 1 - u;
      const x = iu * iu * ax + 2 * iu * u * bx + u * u * cx;
      const y = iu * iu * ay + 2 * iu * u * by + u * u * cy;
      let dx = 2 * iu * (bx - ax) + 2 * u * (cx - bx);
      let dy = 2 * iu * (by - ay) + 2 * u * (cy - by);
      const m = Math.hypot(dx, dy) || 1;
      const w = (w0 + (w1 - w0) * u) * 0.5;
      const nx = -dy / m * w, ny = dx / m * w;
      lhs.push(x + nx, y + ny);
      rhs.push(x - nx, y - ny);
    }
    ctx.beginPath();
    ctx.moveTo(lhs[0], lhs[1]);
    for (let i = 2; i < lhs.length; i += 2) ctx.lineTo(lhs[i], lhs[i + 1]);
    for (let i = rhs.length - 2; i >= 0; i -= 2) ctx.lineTo(rhs[i], rhs[i + 1]);
    ctx.closePath();
  }

  function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  /* A jointed limb: two ribbons plus a joint disc, so the elbow never pinches.
     `paint` re-lights each segment across its own thickness — a limb is a tube,
     and shading it like one is what stops the figure reading as paper. */
  function limb(ctx, s, j, e, w0, w1, w2, paint) {
    if (paint) paint(s.x, s.y, j.x, j.y, w1);
    ribbon(ctx, s.x, s.y, (s.x + j.x) / 2, (s.y + j.y) / 2, j.x, j.y, w0, w1, 5);
    ctx.fill();
    disc(ctx, j.x, j.y, w1 * 0.5);
    if (paint) paint(j.x, j.y, e.x, e.y, w2);
    ribbon(ctx, j.x, j.y, (j.x + e.x) / 2, (j.y + e.y) / 2, e.x, e.y, w1, w2, 5);
    ctx.fill();
  }

  /* A painter that runs the moonlight across a limb rather than along it. */
  function limbPaint(ctx, rgb, lo, hi) {
    return function (ax, ay, bx, by, w) {
      const dx = bx - ax, dy = by - ay;
      const m = Math.hypot(dx, dy) || 1;
      let nx = -dy / m, ny = dx / m;
      // whichever normal points up and out is the one facing the water
      if (nx * 0.45 - ny * 1 < 0) { nx = -nx; ny = -ny; }
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const r = Math.max(1, w);
      const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
      g.addColorStop(0, tone(rgb, hi));
      g.addColorStop(0.50, tone(rgb, U.lerp(lo, hi, 0.40)));
      g.addColorStop(1, tone(rgb, lo));
      ctx.fillStyle = g;
    };
  }

  /* Builds the whole skeleton in local units. `mode` picks where the origin
     sits: 'sit' puts it under the hips on the ledge, the others on the floor. */
  function skeleton(fh, mode, t, opts) {
    const walk = opts.walk || 0;                 // 0..1 how much of a stride
    const ph = opts.phase || 0;
    const face = opts.facing === undefined ? 1 : opts.facing;
    const breath = Math.sin(t * 0.95) * 0.006 + Math.sin(t * 0.41) * 0.0025;
    const lean = P.lean * (mode === 'sit' ? 1 : 0.35);

    const s = {};
    s.face = face;
    s.fh = fh;
    s.lean = lean;

    if (mode === 'sit') {
      // the hips slide back on the ledge as the pull comes on
      s.hip = { x: -P.lean * fh * 0.035, y: -fh * 0.02 - P.pull * fh * 0.010 };
      // legs hang over the lip, the near one a little further out
      s.legs = [
        { hip: { x: -fh * 0.01, y: s.hip.y }, knee: { x: fh * 0.33, y: -fh * 0.17 },
          ankle: { x: fh * 0.30, y: fh * 0.12 }, w: 0.084 },
        { hip: { x: fh * 0.05, y: s.hip.y + fh * 0.01 }, knee: { x: fh * 0.41, y: -fh * 0.145 },
          ankle: { x: fh * 0.37, y: fh * 0.15 }, w: 0.096 }
      ];
      // a rocking foot on the near leg — the only thing an idle body does
      const rock = Math.sin(t * 0.7) * fh * 0.012 * (1 - P.alert);
      s.legs[1].ankle.y += rock;
      s.legs[1].knee.y -= rock * 0.3;
      s.torsoH = 0.60;
    } else {
      const bob = walk ? Math.abs(Math.sin(ph)) * fh * 0.022 : 0;
      s.hip = { x: 0, y: -fh * 0.50 + bob };
      const sw = walk * fh * 0.20;
      const a = Math.sin(ph), b = Math.sin(ph + Math.PI);
      s.legs = [
        { hip: { x: -fh * 0.015, y: s.hip.y },
          knee: { x: face * (a * sw * 0.55) - fh * 0.01, y: -fh * 0.26 + Math.max(0, -a) * fh * 0.03 },
          ankle: { x: face * a * sw, y: -Math.max(0, a * walk) * fh * 0.055 }, w: 0.098 },
        { hip: { x: fh * 0.02, y: s.hip.y },
          knee: { x: face * (b * sw * 0.55) + fh * 0.02, y: -fh * 0.26 + Math.max(0, -b) * fh * 0.03 },
          ankle: { x: face * b * sw + fh * 0.02, y: -Math.max(0, b * walk) * fh * 0.055 }, w: 0.110 }
      ];
      s.torsoH = 0.44;
    }

    // spine: hips to the base of the neck, rotated by the lean
    const th = fh * s.torsoH * (1 + breath * 0.5);
    // hauling on a rod is a whole-body thing, so the lean has to be legible
    const rot = lean * (mode === 'sit' ? 0.44 : 0.30);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const spineX = sn * th * face, spineY = -cs * th;
    s.chest = { x: s.hip.x + spineX * 0.62 + face * fh * 0.012, y: s.hip.y + spineY * 0.62 };
    s.neck = { x: s.hip.x + spineX, y: s.hip.y + spineY };
    s.shN = { x: s.neck.x + face * fh * 0.082, y: s.neck.y + fh * 0.055 };
    s.shF = { x: s.neck.x - face * fh * 0.052, y: s.neck.y + fh * 0.068 };

    s.headR = fh * 0.083;
    const yaw = (P.glance * 0.5 + (opts.aimYaw || 0)) * face;
    s.head = {
      x: s.neck.x + face * fh * 0.030 + yaw * fh * 0.030 + sn * fh * 0.03 * face,
      y: s.neck.y - s.headR * 1.14 - fh * 0.008 + Math.abs(yaw) * fh * 0.004
    };
    s.yaw = yaw;
    s.breath = breath;
    return s;
  }

  /* ---------------------------------------------------------- rendering */

  /* cfg: { body, rim, hood, scarf, lamp, stars, fade }
     opts: { preview, rim, mode, hand:{x,y}, rodAngle, aim:{x,y}, walk, phase, facing } */
  function draw(ctx, cfg, fh, t, opts) {
    cfg = cfg || {};
    opts = opts || {};
    if (opts === true || opts.preview === true) opts = { preview: true };
    const preview = !!opts.preview;
    const mode = opts.mode || 'sit';
    const dark = cfg.body || '#03050a';
    const rim = opts.rim || 'rgba(200,220,255,0.20)';
    const face = opts.facing === undefined ? 1 : opts.facing;

    // where the head is looking, as a small yaw
    let aimYaw = 0;
    if (opts.aim) {
      const dx = opts.aim.x, dy = opts.aim.y + fh * 0.6;
      aimYaw = U.clamp(Math.atan2(dx, Math.max(fh * 0.4, Math.abs(dy))) * 0.55, -0.8, 0.8);
    }
    // the shop preview shows the outfit, not whatever the rod is doing
    let saved = null;
    if (preview) {
      saved = { lean: P.lean, pull: P.pull, alert: P.alert, crank: P.crank, glance: P.glance };
      P.lean = 0.06; P.pull = 0.05; P.alert = 0; P.crank = 0; P.glance = 0;
    }
    const s = skeleton(fh, mode, t, {
      walk: opts.walk || 0, phase: opts.phase || 0, facing: face, aimYaw: aimYaw
    });

    // hands: the near one grips the rod, the far one works the reel
    let rodHand = opts.hand;
    if (!rodHand) rodHand = defaultHand(fh, mode, face);
    const ra = opts.rodAngle === undefined ? -0.62 : opts.rodAngle;
    const cranking = P.crank > 0.02 && mode === 'sit';
    const orb = fh * 0.030;
    let reelHand;
    if (mode === 'sit') {
      // the crank hand works the reel, which sits just ahead of and below the grip
      const along = fh * 0.165, perp = fh * 0.075;
      reelHand = {
        x: rodHand.x + Math.cos(ra) * along - Math.sin(ra) * perp + (cranking ? Math.cos(P.phase) * orb : 0),
        y: rodHand.y + Math.sin(ra) * along + Math.cos(ra) * perp + (cranking ? Math.sin(P.phase) * orb : 0)
      };
    } else {
      // standing or walking: the arms hang and swing. They have to hang far
      // enough that the elbow does not fold out into a wedge.
      const sw = (opts.walk || 0) * fh * 0.11;
      const a = Math.sin((opts.phase || 0) + Math.PI);
      const drop = fh * 0.545;
      rodHand = { x: s.shN.x + face * (a * sw + fh * 0.015), y: s.shN.y + drop };
      reelHand = { x: s.shF.x - face * (a * sw - fh * 0.010), y: s.shF.y + drop * 0.98 };
    }

    ctx.save();
    if (cfg.fade) ctx.globalAlpha = 0.52 + 0.13 * Math.sin(t * 0.6);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const bodyRgb = U.hexToRgb(dark);
    const backPaint = limbPaint(ctx, bodyRgb, -0.66, 0.13);   // limbs behind read darker
    const frontPaint = limbPaint(ctx, bodyRgb, -0.48, mode === 'sit' ? 0.36 : 0.24);
    const legPaint = limbPaint(ctx, bodyRgb, -0.62, 0.20);
    const backLegPaint = limbPaint(ctx, bodyRgb, -0.75, 0.01);

    /* ---- far side: back leg and back arm, one shade down ---- */
    drawLeg(ctx, s.legs[0], fh, face, mode, backLegPaint, bodyRgb, -0.75, 0.01);
    const fl = { u: fh * 0.300, f: fh * 0.290 };
    const elbowF = solve(s.shF.x, s.shF.y, reelHand.x, reelHand.y, fl.u, fl.f, face > 0 ? 1 : -1);
    const fw = mode === 'sit' ? 1 : 0.88;
    limb(ctx, s.shF, elbowF, reelHand, fh * 0.080 * fw, fh * 0.062 * fw, fh * 0.048 * fw, backPaint);
    disc(ctx, reelHand.x, reelHand.y, fh * 0.032);

    /* ---- torso and coat ---- */
    drawCoat(ctx, s, fh, t, dark, face, mode, opts.walk || 0, opts.phase || 0);

    /* ---- near side: front leg, then head, then the rod arm over it ---- */
    drawLeg(ctx, s.legs[1], fh, face, mode, legPaint, bodyRgb, -0.62, 0.20);

    drawHead(ctx, s, fh, t, dark, cfg, face);

    const elbowN = solve(s.shN.x, s.shN.y, rodHand.x, rodHand.y, fh * 0.300, fh * 0.275,
                         face > 0 ? 1 : -1);
    const aw = mode === 'sit' ? 1 : 0.88;
    limb(ctx, s.shN, elbowN, rodHand, fh * 0.092 * aw, fh * 0.070 * aw, fh * 0.050 * aw, frontPaint);
    // the shoulder cap, so the arm grows out of the coat instead of poking through
    frontPaint(s.shN.x, s.shN.y - fh * 0.04, s.shN.x, s.shN.y + fh * 0.04, fh * 0.046);
    disc(ctx, s.shN.x, s.shN.y, fh * 0.046);
    if (!opts.handOver) drawHand(ctx, cfg, fh, rodHand, mode === 'sit' ? ra : 0.4 * face);

    drawFlourishes(ctx, s, fh, t, cfg, dark, face, mode);
    drawRim(ctx, s, fh, rim, face, elbowN, rodHand, mode, cfg);

    ctx.restore();
    if (saved) { P.lean = saved.lean; P.pull = saved.pull; P.alert = saved.alert; P.crank = saved.crank; P.glance = saved.glance; }

    return { rodHand: rodHand, reelHand: reelHand, head: s.head, headR: s.headR, neck: s.neck };
  }


  /* The gripping fist. Drawn last by the scene so it closes over the rod. */
  function drawHand(ctx, cfg, fh, hand, angle) {
    const rgb = U.hexToRgb((cfg && cfg.body) || '#03050a');
    ctx.save();
    if (cfg && cfg.fade) ctx.globalAlpha *= 0.7;
    ctx.translate(hand.x, hand.y);
    ctx.rotate(angle || 0);
    const g = ctx.createLinearGradient(0, -fh * 0.030, 0, fh * 0.030);
    g.addColorStop(0, tone(rgb, 0.16));
    g.addColorStop(1, tone(rgb, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-fh * 0.032, -fh * 0.026, fh * 0.066, fh * 0.052, fh * 0.020);
    else ctx.ellipse(fh * 0.001, 0, fh * 0.035, fh * 0.027, 0, 0, TAU);
    ctx.fill();
    // the thumb wraps back over the grip
    ctx.fillStyle = tone(rgb, 0.05);
    ctx.beginPath();
    ctx.ellipse(fh * 0.004, -fh * 0.020, fh * 0.026, fh * 0.010, -0.25, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function defaultHand(fh, mode, face) {
    if (mode === 'sit') return { x: face * fh * 0.355, y: -fh * 0.50 };
    return { x: face * fh * 0.13, y: -fh * 0.30 };
  }

  function drawLeg(ctx, leg, fh, face, mode, paint, rgb, lo, hi) {
    const knee = solve(leg.hip.x, leg.hip.y, leg.ankle.x, leg.ankle.y,
                       fh * (mode === 'sit' ? 0.26 : 0.255), fh * (mode === 'sit' ? 0.27 : 0.265),
                       mode === 'sit' ? (face > 0 ? -1 : 1) : (face > 0 ? 1 : -1));
    // the pre-authored knee wins when it is reachable; IK only saves the pose
    const k = mode === 'sit' ? leg.knee : knee;
    limb(ctx, leg.hip, k, leg.ankle, fh * (leg.w + 0.032), fh * leg.w, fh * (leg.w - 0.026), paint);
    // boot, a shade under the trouser so the ankle reads
    ctx.fillStyle = tone(rgb, U.lerp(lo, hi, 0.18));
    const bd = Math.atan2(leg.ankle.y - k.y, leg.ankle.x - k.x);
    ctx.save();
    ctx.translate(leg.ankle.x, leg.ankle.y);
    ctx.rotate(bd - Math.PI / 2 + (mode === 'sit' ? 0.25 * face : 0));
    ctx.beginPath();
    ctx.ellipse(0, fh * 0.012, fh * 0.052, fh * 0.036, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(face * fh * 0.035, fh * 0.026, fh * 0.048, fh * 0.024, 0.1 * face, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* The coat is the silhouette that sells the figure: shoulders that slope,
     a back that curves with the lean, and a hem that moves. */
  function drawCoat(ctx, s, fh, t, dark, face, mode, walk, phase) {
    const rgb = U.hexToRgb(dark);
    const cg = ctx.createLinearGradient(s.shN.x + face * fh * 0.14, s.shN.y - fh * 0.06,
                                        s.hip.x - face * fh * 0.20, s.hip.y + fh * 0.22);
    cg.addColorStop(0, tone(rgb, 0.30));
    cg.addColorStop(0.38, tone(rgb, 0.02));
    cg.addColorStop(1, tone(rgb, -0.55));
    ctx.fillStyle = cg;

    const hemY = mode === 'sit' ? s.hip.y + fh * 0.16 : s.hip.y + fh * 0.24;
    const sway = Math.sin(t * 1.15) * fh * 0.018 + walk * Math.sin(phase * 2) * fh * 0.03;
    const back = -face * fh * 0.145, front = face * fh * 0.155;

    ctx.beginPath();
    ctx.moveTo(s.hip.x + back - sway * 0.5, hemY);
    // back seam up to the shoulder
    ctx.quadraticCurveTo(s.chest.x - face * fh * 0.165, s.chest.y + fh * 0.04,
                         s.shF.x - face * fh * 0.048, s.shF.y);
    // shoulder line across
    ctx.quadraticCurveTo(s.neck.x, s.neck.y - fh * 0.020, s.shN.x + face * fh * 0.055, s.shN.y);
    // chest down to the hem
    ctx.quadraticCurveTo(s.chest.x + face * fh * 0.17, s.chest.y + fh * 0.06,
                         s.hip.x + front + sway * 0.6, hemY);
    // the hem itself, hanging loose
    ctx.quadraticCurveTo(s.hip.x + sway * 0.2, hemY + fh * 0.045, s.hip.x + back - sway * 0.5, hemY);
    ctx.closePath();
    ctx.fill();

    // a fold or two so the coat is not a flat plate
    ctx.strokeStyle = U.rgbToCss(U.shade(rgb, -0.72), 0.55);
    ctx.lineWidth = fh * 0.010;
    ctx.beginPath();
    ctx.moveTo(s.chest.x + face * fh * 0.05, s.chest.y + fh * 0.06);
    ctx.quadraticCurveTo(s.hip.x + face * fh * 0.13, s.hip.y - fh * 0.05,
                         s.hip.x + face * 0.10 * fh + sway * 0.4, hemY - fh * 0.02);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.moveTo(s.hip.x - face * fh * 0.05, s.hip.y - fh * 0.10);
    ctx.quadraticCurveTo(s.hip.x - face * fh * 0.10, s.hip.y + fh * 0.02,
                         s.hip.x - face * fh * 0.07 - sway * 0.3, hemY - fh * 0.02);
    ctx.stroke();
    ctx.globalAlpha /= 0.6;
  }


  /* The hood outline, shared by the fill and the rim so they never disagree. */
  function hoodPath(ctx, hx, hy, r, hs, face) {
    const f = face;
    ctx.beginPath();
    ctx.moveTo(hx - f * r * 1.06 * hs, hy + r * 1.10);
    ctx.quadraticCurveTo(hx - f * r * 1.34 * hs, hy - r * 0.60 * hs,
                         hx - f * r * 0.58, hy - r * 1.24 * hs);
    ctx.quadraticCurveTo(hx - f * r * 0.06, hy - r * 1.66 * hs,
                         hx + f * r * 0.66, hy - r * 1.06);
    ctx.quadraticCurveTo(hx + f * r * 1.16, hy - r * 0.66,
                         hx + f * r * 1.06, hy - r * 0.06);
    ctx.quadraticCurveTo(hx + f * r * 0.46, hy + r * 0.02,
                         hx - f * r * 0.02, hy + r * 0.72);
    ctx.quadraticCurveTo(hx - f * r * 0.58, hy + r * 1.20,
                         hx - f * r * 1.06 * hs, hy + r * 1.10);
    ctx.closePath();
  }

  function drawHead(ctx, s, fh, t, dark, cfg, face) {
    const rgb = U.hexToRgb(dark);
    const hx = s.head.x, hy = s.head.y, r = s.headR;
    ctx.fillStyle = ramp(ctx, rgb, fh, -0.62, 0.10);

    // neck
    ribbon(ctx, s.neck.x, s.neck.y + fh * 0.02, s.neck.x, s.neck.y - fh * 0.01,
           hx - face * r * 0.15, hy + r * 0.7, fh * 0.052, fh * 0.044, 3);
    ctx.fill();

    // skull, slightly egg-shaped and tilted with the lean
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-s.lean * 0.14 * face + s.yaw * 0.10);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.94, r * 1.06, 0, 0, TAU);
    ctx.fill();
    // jaw / muzzle hint on the facing side
    ctx.beginPath();
    ctx.ellipse(face * r * 0.42, r * 0.34, r * 0.46, r * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // hood: a peak behind the skull, a brow that overhangs, a face left open
    const hs = cfg.hood || 1;
    ctx.fillStyle = ramp(ctx, rgb, fh, -0.48, 0.19);
    hoodPath(ctx, hx, hy, r, hs, face);
    ctx.fill();
    // the fold where the cowl gathers at the neck
    ctx.strokeStyle = U.rgbToCss(U.shade(rgb, -0.45), 0.85);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(hx - face * r * 0.95 * hs, hy + r * 1.02);
    ctx.quadraticCurveTo(hx - face * r * 0.30, hy + r * 1.30, hx + face * r * 0.28, hy + r * 0.92);
    ctx.stroke();

    // the face stays in shadow — one cold catchlight is all it gets
    ctx.fillStyle = 'rgba(155,185,220,' + (0.13 + P.alert * 0.20).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(hx + face * r * 0.55, hy + r * 0.02, r * 0.11, r * 0.075,
                -0.2 * face, 0, TAU);
    ctx.fill();
  }

  function drawFlourishes(ctx, s, fh, t, cfg, dark, face, mode) {
    if (cfg.scarf) {
      const r = s.headR;
      ctx.strokeStyle = 'rgba(158,62,68,0.94)';
      ctx.lineCap = 'round';
      ctx.lineWidth = fh * 0.034;
      ctx.beginPath();
      ctx.moveTo(s.neck.x - face * r * 0.5, s.neck.y + fh * 0.015);
      ctx.quadraticCurveTo(s.neck.x + face * r * 0.6, s.neck.y + fh * 0.045,
                           s.neck.x - face * r * 0.3, s.neck.y + fh * 0.055);
      ctx.stroke();
      const fly = Math.sin(t * 1.3) * fh * 0.05, fly2 = Math.sin(t * 0.9 + 1.1) * fh * 0.035;
      ctx.lineWidth = fh * 0.024;
      ctx.beginPath();
      ctx.moveTo(s.neck.x - face * r * 0.4, s.neck.y + fh * 0.045);
      ctx.quadraticCurveTo(s.chest.x - face * fh * 0.16, s.chest.y + fh * 0.05,
                           s.chest.x - face * fh * 0.26 - fly, s.chest.y + fh * 0.19 + fly2);
      ctx.stroke();
      ctx.globalAlpha *= 0.75;
      ctx.lineWidth = fh * 0.017;
      ctx.beginPath();
      ctx.moveTo(s.neck.x - face * r * 0.2, s.neck.y + fh * 0.05);
      ctx.quadraticCurveTo(s.chest.x - face * fh * 0.09, s.chest.y + fh * 0.10,
                           s.chest.x - face * fh * 0.12 - fly * 0.6, s.chest.y + fh * 0.24);
      ctx.stroke();
      ctx.globalAlpha /= 0.75;
    }

    if (cfg.lamp) {
      const lx = s.hip.x - face * fh * 0.30;
      const ly = s.hip.y - fh * 0.10 + Math.sin(t * 0.8) * fh * 0.006;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, fh * 0.46);
      g.addColorStop(0, 'rgba(255,226,150,0.50)');
      g.addColorStop(0.35, 'rgba(255,206,130,0.17)');
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - fh * 0.46, ly - fh * 0.46, fh * 0.92, fh * 0.92);
      ctx.strokeStyle = U.rgbToCss(U.hexToRgb(dark), 0.95);
      ctx.lineWidth = fh * 0.012;
      ctx.beginPath();
      ctx.moveTo(lx, ly - fh * 0.10);
      ctx.quadraticCurveTo(lx + face * fh * 0.03, ly - fh * 0.16, lx + face * fh * 0.06, ly - fh * 0.09);
      ctx.stroke();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.arc(lx, ly, fh * 0.030, 0, TAU); ctx.fill();
      ctx.strokeRect(lx - fh * 0.048, ly - fh * 0.062, fh * 0.096, fh * 0.124);
    }

    if (cfg.stars) {
      const rnd = VF.rng.make(0xA17E);
      ctx.fillStyle = 'rgba(220,235,255,0.9)';
      const a0 = ctx.globalAlpha;
      for (let i = 0; i < 14; i++) {
        const x = s.hip.x + (rnd() - 0.5) * fh * 0.34;
        const y = U.lerp(s.hip.y + fh * 0.08, s.neck.y, rnd());
        const tw = 0.35 + 0.65 * Math.sin(t * 1.6 + i);
        ctx.globalAlpha = a0 * tw * 0.85;
        ctx.beginPath(); ctx.arc(x, y, fh * (i % 5 ? 0.009 : 0.014), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = a0;
    }
  }


  /* The same colour with the alpha taken out, for rim strokes that fade off
     instead of tracing the whole silhouette like a sticker. */
  function fade(css) {
    const m = /rgba?\(([^)]+)\)/.exec(css || '');
    if (!m) return 'rgba(200,220,255,0)';
    const p = m[1].split(',');
    return 'rgba(' + parseInt(p[0], 10) + ',' + parseInt(p[1], 10) + ',' + parseInt(p[2], 10) + ',0)';
  }

  /* Moonlight comes over the water, so the lit edge is the one facing out. */
  function drawRim(ctx, s, fh, rim, face, elbow, hand, mode, cfg) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, fh * 0.010);
    const r = s.headR, hs = cfg.hood || 1;
    // hood crown — only the lit half of the outline is stroked
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.head.x - r * 2.2, s.head.y - r * 2.4, r * 4.4, r * 2.5);
    ctx.clip();
    hoodPath(ctx, s.head.x, s.head.y, r, hs, face);
    ctx.stroke();
    ctx.restore();
    // the moon is out over the water, so the lit seam is the front one — and it
    // dies away before the hem, the way a highlight actually does
    const hemY = s.hip.y + (mode === 'sit' ? fh * 0.15 : fh * 0.23);
    const fg = ctx.createLinearGradient(s.neck.x, s.neck.y, s.hip.x, hemY);
    fg.addColorStop(0, rim);
    fg.addColorStop(0.45, rim);
    fg.addColorStop(1, fade(rim));
    ctx.strokeStyle = fg;
    ctx.beginPath();
    ctx.moveTo(s.shF.x - face * fh * 0.04, s.shF.y);
    ctx.quadraticCurveTo(s.neck.x, s.neck.y - fh * 0.020, s.shN.x + face * fh * 0.055, s.shN.y);
    ctx.quadraticCurveTo(s.chest.x + face * fh * 0.17, s.chest.y + fh * 0.06,
                         s.hip.x + face * fh * 0.16, hemY);
    ctx.stroke();
    // a cold spill down the back, barely there
    const bg = ctx.createLinearGradient(s.shF.x, s.shF.y, s.hip.x, s.hip.y + fh * 0.10);
    bg.addColorStop(0, rim);
    bg.addColorStop(1, fade(rim));
    ctx.save();
    ctx.globalAlpha *= 0.34;
    ctx.strokeStyle = bg;
    ctx.beginPath();
    ctx.moveTo(s.shF.x - face * fh * 0.06, s.shF.y + fh * 0.02);
    ctx.quadraticCurveTo(s.chest.x - face * fh * 0.21, s.chest.y + fh * 0.04,
                         s.hip.x - face * fh * 0.15, s.hip.y + fh * 0.09);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rim;
    // the working arm catches the most light
    ctx.lineWidth = Math.max(0.9, fh * 0.008);
    ctx.beginPath();
    ctx.moveTo(s.shN.x + face * fh * 0.02, s.shN.y - fh * 0.02);
    ctx.lineTo(elbow.x, elbow.y - fh * 0.024);
    ctx.lineTo(hand.x, hand.y - fh * 0.018);
    ctx.stroke();
    // the water throws a little light back up under the hem and the jaw
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = 'rgba(120,165,205,0.45)';
    ctx.lineWidth = Math.max(0.9, fh * 0.007);
    ctx.beginPath();
    ctx.moveTo(s.hip.x - face * fh * 0.10, hemY + fh * 0.03);
    ctx.quadraticCurveTo(s.hip.x + face * fh * 0.02, hemY + fh * 0.055,
                         s.hip.x + face * fh * 0.11, hemY + fh * 0.012);
    ctx.stroke();
    ctx.restore();

    // top of the near thigh
    const leg = s.legs[1];
    ctx.globalAlpha *= 0.75;
    ctx.beginPath();
    ctx.moveTo(leg.hip.x + fh * 0.04, leg.hip.y - fh * 0.01);
    ctx.quadraticCurveTo((leg.hip.x + leg.knee.x) / 2, leg.knee.y - fh * 0.050,
                         leg.knee.x + fh * 0.015, leg.knee.y - fh * 0.038);
    ctx.stroke();
  }

  VF.anglerArt = {
    draw: draw,
    drawHand: drawHand,
    update: update,
    pose: P,
    /* Where the rod butt wants to be for the current pose — the scene reads
       this back so the rod follows the body instead of floating beside it. */
    hand: function (fh, mode, face) {
      const m = mode || 'sit';
      const f = face === undefined ? 1 : face;
      const base = defaultHand(fh, m, f);
      const drawIn = P.pull * fh * 0.085 + P.lean * fh * 0.045;
      return {
        x: base.x - f * drawIn,
        y: base.y - P.lean * fh * 0.055 + P.pull * fh * 0.020
      };
    }
  };
})(window.VF = window.VF || {});
