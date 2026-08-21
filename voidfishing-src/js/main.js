/* VOID FISHING — boot and the frame loop. */
(function (VF) {
  'use strict';

  const U = VF.util;
  let last = 0, running = false, rafId = 0;
  let started = false;

  function boot() {
    const res = VF.save.load();
    const s = VF.state.data.settings;
    document.body.className = 'q-' + s.quality;

    const canvas = document.getElementById('scene');
    VF.scene.init(canvas);
    VF.palette.update();
    VF.scene.seedAmbient();

    VF.toast.init();
    VF.hud.init();
    VF.panels.init();
    VF.catchUI.init();

    VF.weather.reconcile();
    VF.secrets.registerFound();
    VF.loot.invalidatePool();

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      last = performance.now();
      // coming back from a background tab is not evidence about this machine
      perf.acc = 0; perf.frames = 0; perf.slow = 0; perf.bad = 0; perf.warm = 2;
    });
    document.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.id === 'scene') e.preventDefault();
    });

    const bootEl = document.getElementById('boot');
    const startBtn = document.getElementById('bootStart');
    if (res.loaded && VF.state.data.stats.casts > 0) {
      startBtn.textContent = 'Continue';
      const note = U.qs('.boot-note');
      if (note) note.textContent = 'Level ' + VF.state.data.level + ' · ' +
        U.commas(VF.state.data.stats.catches) + ' caught';
    }
    startBtn.addEventListener('click', start);

    // draw one frame behind the title card so it is never a black screen
    VF.scene.update(0.016);
    VF.scene.draw();
    startLoop();
  }

  function start() {
    if (started) return;
    started = true;
    VF.audio.unlock();
    VF.audio.setVolumes();
    const bootEl = document.getElementById('boot');
    bootEl.classList.add('gone');
    setTimeout(function () { bootEl.style.display = 'none'; }, 750);
    document.getElementById('hud').classList.remove('hidden');
    VF.hud.show();
    VF.hud.refreshAll();
    VF.tutorial.init();
    VF.achievements.check();
    if (VF.state.data.stats.casts === 0) VF.hud.showPrompt(VF.locations.current().name, VF.locations.current().glow, 1.8);
  }

  function onResize() {
    VF.scene.resize();
    VF.scene.seedAmbient();
  }

  function startLoop() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------- adaptive quality
     The scene is heavier than it used to be. Rather than let a slow machine
     run it at twenty frames a second, watch the frame time and step the
     setting down — once, visibly, and never back up on its own, so the player
     stays in charge of it from Settings. */
  const perf = { acc: 0, frames: 0, slow: 0, bad: 0, warm: 4, stepped: 0 };

  function watchFrameRate(dt) {
    if (!started || perf.stepped >= 2 || VF.state.rt.panelOpen) return;
    if (perf.warm > 0) { perf.warm -= Math.min(dt, 0.1); return; }
    // half a second is not a slow machine, it is a tab that was somewhere else
    if (dt > 0.5) return;
    perf.acc += dt;
    perf.frames++;
    if (dt > 0.030) perf.slow++;
    if (perf.acc < 4) return;

    // the share of slow frames, not the mean: one garbage-collection pause in
    // four seconds should not be read as a machine that cannot cope
    const share = perf.slow / Math.max(1, perf.frames);
    const enough = perf.frames >= 40;
    perf.acc = 0; perf.frames = 0; perf.slow = 0;
    const q = VF.state.data.settings.quality;
    perf.share = share;
    if (enough && share > 0.55 && q !== 'low') {
      perf.bad++;
      if (perf.bad < 4) return;
      perf.bad = 0;
      perf.stepped++;
      const next = q === 'high' ? 'medium' : 'low';
      VF.state.data.settings.quality = next;
      document.body.className = 'q-' + next;
      VF.scene.resize();
      VF.bus.emit('settings:quality');
      VF.save.save();
      VF.toast.show('graphics turned down to <strong>' + next + '</strong> to keep it smooth' +
                    ' &mdash; change it back in settings', null, 6000);
    } else {
      perf.bad = 0;
    }
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    // the honest frame time, before the clamp, is what tells us how the
    // machine is coping — the clamp is for the simulation, not for measuring
    const raw = dt;
    // a long pause (tab in the background) must not fast-forward the fight
    if (dt > 0.1) dt = 0.1;

    const rt = VF.state.rt;
    rt.dt = dt;
    rt.t += dt;

    try {
      VF.time.tick(dt);
      VF.weather.tick(dt);
      VF.palette.update();

      if (started) {
        VF.visit.tick(dt);
        VF.fishing.tick(dt);
        VF.conditions.tick(dt);
        VF.encounters.tick(dt);
        VF.quests.tick(dt);
        VF.merchant.tick(dt);
        VF.cutscene.tick(dt);
        VF.wrong.tick(dt);
        VF.achievements.tick(dt);
        VF.state.data.stats.playSeconds += dt;
        VF.save.tick(dt);
      }

      VF.fx.update(dt);
      VF.scene.update(dt);
      VF.scene.draw();

      if (started) VF.hud.tick(dt);
      VF.audio.tick(dt);
      watchFrameRate(raw);
    } catch (err) {
      console.error('[frame]', err);
      // never let one bad frame kill the loop
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  VF.game = { start: start, restartLoop: startLoop, perf: perf };
})(window.VF = window.VF || {});
