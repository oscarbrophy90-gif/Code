/* VOID FISHING — colour for the scene.
   Location supplies base tones; the time of day and the weather are layered on
   top as continuous interpolations so the sky never snaps between states. */
(function (VF) {
  'use strict';

  const U = VF.util;

  /* Keyframes around the day cycle. Interpolated, never switched. */
  const KEYS = [
    { at: 0.00, tint: '#ffb37a', k: 0.26, bright: 0.62, star: 0.42, glow: '#ffc48a', glowSize: 1.15, warm: 0.7 },
    { at: 0.18, tint: '#cfe2f5', k: 0.16, bright: 0.94, star: 0.10, glow: '#eaf4ff', glowSize: 0.85, warm: 0.3 },
    { at: 0.34, tint: '#bcd8f0', k: 0.13, bright: 1.00, star: 0.04, glow: '#ffffff', glowSize: 0.75, warm: 0.25 },
    { at: 0.50, tint: '#ff8f60', k: 0.30, bright: 0.66, star: 0.34, glow: '#ff9c66', glowSize: 1.25, warm: 0.85 },
    { at: 0.62, tint: '#7a5a9a', k: 0.26, bright: 0.40, star: 0.80, glow: '#c8a8e8', glowSize: 1.05, warm: 0.45 },
    { at: 0.80, tint: '#2c3c6e', k: 0.22, bright: 0.28, star: 1.00, glow: '#c8d8ff', glowSize: 1.00, warm: 0.1 },
    { at: 1.00, tint: '#ffb37a', k: 0.26, bright: 0.62, star: 0.42, glow: '#ffc48a', glowSize: 1.15, warm: 0.7 }
  ];

  const rgbCache = Object.create(null);
  function rgb(hex) { return rgbCache[hex] || (rgbCache[hex] = U.hexToRgb(hex)); }

  function dayKey(cycle) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (cycle >= KEYS[i].at && cycle <= KEYS[i + 1].at) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const t = U.smoothstep(U.invLerp(a.at, b.at, cycle));
    return {
      tint: U.mixRgb(rgb(a.tint), rgb(b.tint), t),
      k: U.lerp(a.k, b.k, t),
      bright: U.lerp(a.bright, b.bright, t),
      star: U.lerp(a.star, b.star, t),
      glow: U.mixRgb(rgb(a.glow), rgb(b.glow), t),
      glowSize: U.lerp(a.glowSize, b.glowSize, t),
      warm: U.lerp(a.warm, b.warm, t)
    };
  }

  /* The full resolved palette for this frame. */
  const P = {
    skyTop: [0, 0, 0], skyBot: [0, 0, 0],
    waterTop: [0, 0, 0], waterBot: [0, 0, 0],
    glow: [255, 255, 255], glowSize: 1,
    fog: [0, 0, 0], fogAmt: 0,
    star: [255, 255, 255], starAlpha: 1,
    accent: [255, 255, 255],
    bright: 1, warm: 0
  };

  function apply(base, day, wx, k) {
    let c = U.mixRgb(base, day.tint, day.k);
    c = c.map(function (v) { return v * U.lerp(1, day.bright, 0.78) * k; });
    if (wx) c = U.mixRgb(c, rgb(wx.c), wx.k * 0.30);
    return c;
  }

  function update() {
    const loc = VF.locations.current();
    const day = dayKey(VF.time.cycle());
    const wx = VF.weather.tint();
    const light = VF.weather.light();

    P.skyTop = apply(rgb(loc.sky[0]), day, wx, light);
    P.skyBot = apply(rgb(loc.sky[1]), day, wx, light);
    P.waterTop = apply(rgb(loc.water[0]), day, wx, light * 0.92);
    P.waterBot = apply(rgb(loc.water[1]), day, wx, light * 0.86);
    P.glow = U.mixRgb(rgb(loc.glow), day.glow, 0.45);
    P.glowSize = day.glowSize;
    P.fog = U.mixRgb(rgb(loc.fog), day.tint, day.k * 0.6);
    P.fogAmt = U.clamp(loc.fogAmt + VF.weather.fog() * 0.55, 0, 1);
    P.star = rgb(loc.starTint);
    P.starAlpha = U.clamp(day.star * loc.stars * U.lerp(1, 0.35, VF.weather.fog()), 0, 1);
    P.accent = rgb(loc.glow);
    P.bright = day.bright * light;
    P.warm = day.warm;
    return P;
  }

  VF.palette = { P: P, update: update, rgb: rgb };
})(window.VF = window.VF || {});
