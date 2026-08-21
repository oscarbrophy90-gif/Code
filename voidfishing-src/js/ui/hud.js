/* VOID FISHING — HUD rendering and all player input.
   One press model drives everything: hold to charge a cast, tap to set the
   hook, hold to reel. Mouse, touch and keyboard all route through it. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const D = {};
  let shownMoney = 0;
  let pressed = false;
  let shownBarW = -1;
  let hintTimer = 0;
  let promptTimer = 0;

  function init() {
    [
      'hud', 'moneyVal', 'levelVal', 'xpFill', 'xpText', 'locName', 'wxName', 'timeName',
      'chipLoc', 'gearRod', 'gearBait', 'rodName', 'baitName', 'baitCount',
      'castMeter', 'castFill', 'actionBtn', 'actionLabel', 'actionHint',
      'fightUI', 'fightName', 'fightWarn', 'mgTrack', 'mgBar', 'mgFish',
      'mgProg', 'mgProgFill', 'fightHint', 'fightPct',
      'prompt', 'hintBox', 'edgeGlow', 'encounter', 'encText',
      'chipCond', 'condName'
    ].forEach(function (id) { D[id] = document.getElementById(id); });

    shownMoney = VF.state.data.money;
    bindInput();
    bindBus();
    refreshAll();
  }

  /* ------------------------------------------------------------- input */

  /* A click on the figure standing up the shore opens what he is carrying,
     rather than starting a cast into him. */
  function merchantPress(e, canvas) {
    if (!VF.merchant || !VF.merchant.here()) return false;
    if (VF.state.rt.panelOpen || VF.visit.active()) return false;
    if (VF.fishing.state() === 'reeling') return false;
    // the scene draws in CSS pixels (the context carries the device ratio), so
    // the rect maps straight onto scene coordinates
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const px = (e.clientX - r.left) * (VF.scene.L.w / r.width);
    const py = (e.clientY - r.top) * (VF.scene.L.h / r.height);
    if (!VF.scene.merchantHit(px, py)) return false;
    VF.audio.click();
    VF.panels.open('merchant');
    return true;
  }

  function pressStart(e) {
    // a sequence owns the input while it is running
    if (VF.cutscene && VF.cutscene.active()) { VF.cutscene.skip(); return; }
    if (VF.state.rt.panelOpen) return;
    if (e && e.type === 'pointerdown' && e.button !== undefined && e.button !== 0) return;
    // a conversation owns the input while it is running
    if (VF.visit.active()) { VF.visit.advance(); return; }
    if (pressed) return;
    pressed = true;
    const st = VF.fishing.state();
    if (st === 'idle') {
      if (VF.fishing.beginCharge()) VF.audio.charge();
    } else if (st === 'bite') {
      VF.fishing.hook();
    } else if (st === 'reeling') {
      VF.fishing.setReeling(true);
    }
  }

  function pressEnd() {
    if (!pressed) return;
    pressed = false;
    const st = VF.fishing.state();
    if (st === 'idle' || VF.fishing.S.charging) VF.fishing.releaseCharge();
    if (st === 'reeling') VF.fishing.setReeling(false);
  }

  function bindInput() {
    const canvas = document.getElementById('scene');

    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      // the wanderer gets the press before the water does
      if (merchantPress(e, canvas)) return;
      pressStart(e);
    });
    D.actionBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); pressStart(e); });
    window.addEventListener('pointerup', pressEnd);
    window.addEventListener('pointercancel', pressEnd);
    window.addEventListener('blur', pressEnd);

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (VF.cutscene && VF.cutscene.active()) {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          e.preventDefault();
          VF.cutscene.skip();
        }
        return;
      }
      if (e.code === 'Escape') {
        if (VF.panels.isOpen()) { e.preventDefault(); VF.panels.close(); return; }
        if (VF.visit.talking()) { e.preventDefault(); VF.visit.leave(); }
        return;
      }
      if (VF.visit.active()) {
        // nothing else is reachable until the two of you are done
        if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); VF.visit.advance(); }
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (VF.catchUI.isOpen()) { VF.catchUI.defaultAction(); return; }
        pressStart(e);
        return;
      }
      if (VF.state.rt.panelOpen) return;
      switch (e.code) {
        case 'KeyQ': e.preventDefault(); VF.panels.open('shop'); break;
        case 'KeyF': e.preventDefault(); VF.panels.open('fishdex'); break;
        case 'KeyB': e.preventDefault(); VF.panels.open('bag'); break;
        case 'KeyT': e.preventDefault(); VF.panels.open('stats'); break;
        case 'KeyM': e.preventDefault(); VF.panels.open('map'); break;
        case 'KeyJ': e.preventDefault(); VF.panels.open('journal'); break;
        case 'KeyC': e.preventDefault(); VF.panels.open('wardrobe'); break;
        case 'KeyR':
          e.preventDefault();
          if (VF.fishing.reelIn()) VF.toast.plain('Line reeled in', null, 1600);
          break;
      }
    });

    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space' || e.code === 'Enter') pressEnd();
    });

    D.chipLoc.addEventListener('click', function () { VF.audio.click(); VF.panels.open('map'); });
    D.gearRod.addEventListener('click', function () { VF.audio.click(); VF.panels.open('shop', 'rods'); });
    D.gearBait.addEventListener('click', function () { VF.audio.click(); VF.panels.open('shop', 'bait'); });

    U.qsa('.mbtn').forEach(function (b) {
      b.addEventListener('click', function () { VF.audio.click(); VF.panels.open(b.dataset.panel); });
      b.addEventListener('pointerenter', function () { VF.audio.hover(); });
    });
  }

  /* --------------------------------------------------------------- bus */

  function bindBus() {
    VF.bus.on('fishing:cast', function (e) {
      VF.audio.cast(e.power);
      VF.scene.newCastLateral();
      const cc = VF.cosmetics.cfg('cast');
      if (cc.n) {
        const tip = VF.scene.L.rodTip;
        VF.particles.burst(tip.x, tip.y, 6 * cc.n, {
          color: cc.col || [220, 210, 180], angle: -0.6, spread: 0.9,
          speedMin: 60, speedMax: 260, sizeMax: cc.tail ? 3 : 2, grav: 90, lifeMax: 0.9
        });
      }
      if (e.sweet) {
        VF.toast.plain('Perfect cast', 'good', 1700);
        VF.fx.pulse(0.28);
      }
    });
    VF.bus.on('fishing:splash', function () {
      const L = VF.scene.L, b = L.bobber;
      const sc = VF.cosmetics.cfg('splash');
      const col = sc.col || [200, 228, 248];
      VF.audio.splash(0.7);
      VF.fx.ripple(b.x, b.y, L.w * 0.07 * b.scale, 2.0, col);
      VF.fx.ripple(b.x, b.y, L.w * 0.04 * b.scale, 1.3, col);
      for (let i = 0; i < (sc.ring || 0); i++) {
        VF.fx.ripple(b.x, b.y, L.w * (0.10 + i * 0.05) * b.scale, 2.6 + i * 0.4, col, 1.6);
      }
      VF.particles.burst(b.x, b.y, Math.round(11 * (sc.n || 1)), {
        color: col, angle: -Math.PI / 2, spread: 1.6,
        speedMin: 30, speedMax: 110 * (sc.shard ? 1.7 : 1), sizeMax: 2.2, grav: 240, lifeMax: 0.7
      });
    });
    VF.bus.on('fishing:nibble', function () {
      const b = VF.scene.L.bobber;
      VF.audio.nibble();
      VF.fx.ripple(b.x, b.y, VF.scene.L.w * 0.022 * b.scale, 1.1, [190, 215, 235], 0.9);
    });
    VF.bus.on('fishing:bite', function (c) {
      const rank = VF.rarities.rank(c.rarity);
      VF.audio.bite(rank);
      VF.fx.shake(2.4 + rank * 0.9);
      VF.fx.pulse(0.5);
      const b = VF.scene.L.bobber;
      VF.fx.ripple(b.x, b.y, VF.scene.L.w * 0.06 * b.scale, 1.4, [255, 220, 180], 1.6);
      VF.particles.burst(b.x, b.y, 12, {
        color: [220, 236, 250], angle: -Math.PI / 2, spread: 1.9,
        speedMin: 50, speedMax: 150, sizeMax: 2.4, grav: 300, lifeMax: 0.6
      });
      showPrompt(rank >= 4 ? 'Set the hook' : 'Bite', VF.rarities.color(c.rarity), 1.0);
    });
    VF.bus.on('fishing:hooked', function () { VF.audio.reelStart(); });
    VF.bus.on('fishing:missed', function () {
      VF.toast.plain('It got away with the bait', 'warn', 2200);
    });
    VF.bus.on('fishing:surge', function () { VF.audio.surge(); VF.fx.shake(2.0); });
    // the reel runs for the whole fight; these two are the bar catching the
    // fish and the bar losing it, which is the thing the player needs to hear
    VF.bus.on('fishing:grip', function () { VF.audio.nibble(); });
    VF.bus.on('fishing:slip', function () { VF.audio.strain(0.9); });
    VF.bus.on('fishing:lost', function (e) {
      VF.audio.reelStop();
      if (e.reason === 'snap') {
        VF.audio.snap();
        VF.fx.shake(7, 5);
        VF.fx.flash('rgba(255,120,90,0.28)', 0.3);
        VF.toast.plain('It ran, and the line snapped', 'bad', 2800);
        showPrompt('Line snapped', '#ff8a6a', 1.2);
      } else {
        VF.toast.plain('It shook the hook loose', 'warn', 2600);
        showPrompt('It got away', '#ffc36a', 1.0);
      }
      if (VF.quests.anyArmed()) {
        VF.toast.plain('it goes back up, and it waits. cast again.', null, 4200);
      }
      VF.achievements.check();
    });
    VF.bus.on('fishing:landed', function () {
      VF.audio.reelStop();
      // the heavens rod does not land a fish quietly
      if (VF.state.data.rod !== 'heavens') return;
      const b = VF.scene.L.bobber;
      VF.fx.ripple(b.x, b.y, VF.scene.L.w * 0.085, 1.9, [255, 232, 176], 1.8);
      VF.fx.ripple(b.x, b.y, VF.scene.L.w * 0.045, 1.2, [255, 246, 214], 1.2);
      VF.fx.pulse(0.30);
      VF.particles.burst(b.x, b.y, 26, {
        color: [255, 230, 168], angle: -Math.PI / 2, spread: 2.2,
        speedMin: 40, speedMax: 210, sizeMax: 2.6, grav: 120, lifeMax: 1.5
      });
    });
    VF.bus.on('fishing:reelin', function () { VF.audio.reelStop(); });

    VF.bus.on('money:changed', function () { /* animated in tick */ });
    VF.bus.on('level:up', onLevelUp);
    VF.bus.on('achievement:unlocked', function (a) {
      VF.toast.show('<strong>' + U.esc(a.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(a.desc) + '</span>' + (a.reward ? '<br><span class="mono" style="color:var(--good)">+' +
        U.money(a.reward) + '</span>' : ''), 'good', 5200);
    });
    VF.bus.on('weather:changed', function (id) {
      const w = VF.weatherData.get(id);
      VF.toast.show('<strong>' + U.esc(w.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(w.blurb) + '</span>', null, 4200);
    });
    VF.bus.on('location:changed', refreshAll);
    VF.bus.on('rod:bought', refreshGear);
    VF.bus.on('bait:bought', refreshGear);
    VF.bus.on('bait:changed', refreshGear);
    VF.bus.on('gear:changed', refreshGear);

    /* ------------------------------------------------------- the long threads */

    VF.bus.on('quest:started', function (def) {
      VF.audio.discover();
      VF.fx.pulse(0.4);
      VF.toast.show('<strong>' + U.esc(def.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(def.blurb) + '</span>', null, 7000);
      flashMenu('journal');
    });

    VF.bus.on('quest:step', function (e) {
      VF.audio.click();
      VF.toast.show('<strong>' + U.esc(e.quest.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(e.chapter.task) + '</span>', null, 6000);
      flashMenu('journal');
    });

    VF.bus.on('quest:item', function (o) {
      VF.audio.discover();
      VF.fx.pulse(0.35);
      VF.toast.show('<strong>' + U.esc(o.name) + '</strong> ' + o.have + ' / ' + o.need +
        (o.note ? '<br><span style="color:var(--ink-3)">' + U.esc(o.note) + '</span>' : ''), 'good', 5200);
      flashMenu('journal');
    });

    VF.bus.on('quest:flag', function (o) {
      VF.audio.discover();
      VF.toast.plain('a piece of the celestial compass', 'good', 4200);
      flashMenu('journal');
    });

    VF.bus.on('quest:trial', function (o) {
      VF.audio.achievement();
      VF.fx.pulse(0.45);
      showPrompt(o.name, '#ffd88a', 1.2);
      VF.toast.plain('trial passed — ' + o.name.toLowerCase(), 'good', 4000);
      flashMenu('journal');
    });

    VF.bus.on('quest:note', function (o) { VF.toast.plain(o.text, null, 2200); });

    /* Four phases, and each one announces itself before it starts hurting. */
    VF.bus.on('fishing:phase', function (e) {
      VF.audio.surge();
      VF.fx.shake(4.5 + e.index * 1.6, 4);
      VF.fx.pulse(0.5 + e.index * 0.12);
      VF.fx.flash(e.index >= 3 ? 'rgba(255,228,160,0.22)' : 'rgba(190,215,255,0.13)', 0.26, 1.6);
      showPrompt(e.name, e.index >= 3 ? '#ffe6a8' : '#cfe0ff', 1.1);
      if (D.fightName) {
        D.fightName.textContent = 'heaven’s trial · ' + e.name.toLowerCase() +
                                  ' · ' + (e.index + 1) + ' of ' + e.of;
        D.fightName.style.color = '#ffd88a';
      }
    });

    /* The light goes out, and then it comes back in one column. */
    VF.bus.on('quest:complete', function (def) {
      VF.audio.stinger('void', 7);
      VF.fx.flash('rgba(0,0,0,0.96)', 1.0, 0.9);
      D.hud.classList.add('dimmed');
      setTimeout(function () {
        VF.fx.flash('rgba(255,240,200,0.85)', 1.0, 1.1);
        VF.fx.pulse(1);
        VF.fx.shake(9, 3);
        VF.audio.stinger('grand', 6);
        const L = VF.scene.L;
        VF.particles.burst(L.w * 0.5, L.h * 0.28, 90, {
          color: [255, 232, 176], angle: Math.PI / 2, spread: 0.5,
          speedMin: 40, speedMax: 320, sizeMax: 3.2, grav: -30, lifeMax: 2.4
        });
        showPrompt('the heavens rod', '#ffe6a8', 3.0);
      }, 1500);
      setTimeout(function () {
        D.hud.classList.remove('dimmed');
        VF.toast.show('<strong>' + U.esc(def.name) + '</strong> — complete<br>' +
          '<span style="color:var(--ink-3)">one ancient power has awakened. something beneath ' +
          'the ocean has noticed.</span>', 'good', 12000);
        flashMenu('journal');
        refreshGear();
      }, 3400);
    });

    /* ------------------------------------------------------- the wanderer */

    VF.bus.on('merchant:arrive', function () {
      VF.audio.discover();
      VF.fx.pulse(0.28);
      VF.toast.show('<strong>somebody has walked up the shore</strong><br>' +
        '<span style="color:var(--ink-3)">a case of rods that are on no shelf anywhere. ' +
        'click him. he leaves in half an hour.</span>', null, 8000);
    });
    VF.bus.on('merchant:leave', function () {
      if (VF.state.rt.panelOpen === 'merchant') VF.panels.close();
      VF.toast.plain('he has packed up and gone', null, 3600);
    });
    VF.bus.on('merchant:bought', function (rod) {
      VF.fx.pulse(0.35);
      refreshGear();
    });

    VF.bus.on('ui:toast', function (o) { VF.toast.plain(o.text, o.kind); });
    VF.bus.on('ui:whisper', function () {
      showPrompt(VF.rng.g.pick(['listen', 'something moved', 'not alone', 'hello?']), '#b9a8e8', 1.6);
    });

    VF.bus.on('encounter:start', function () {
      VF.audio.duck(1);
      D.hud.classList.add('dimmed');
    });
    VF.bus.on('encounter:reveal', function (d) {
      D.encounter.classList.remove('hidden', 'out');
      D.encText.textContent = d.line;
      VF.fx.flash('rgba(120,80,220,0.12)', 0.16, 1.1);
    });
    VF.bus.on('encounter:hooked', endEncounterUI);
    VF.bus.on('encounter:end', endEncounterUI);

    VF.bus.on('condition:start', function (c) {
      VF.toast.show('<strong>' + U.esc(c.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(c.blurb) + '</span>', null, 5000);
      refreshChips();
      if (c.id === 'thinplace') VF.state.data.flags.sawThinPlace = true;
      VF.fx.pulse(0.3);
    });
    VF.bus.on('condition:end', refreshChips);

    VF.bus.on('fishing:treasure', function (c) {
      VF.audio.splash(0.6);
      VF.fx.pulse(0.3);
    });

    VF.bus.on('secret:found', function (s2) {
      VF.audio.discover();
      VF.fx.flash('rgba(200,180,255,0.16)', 0.26, 1.5);
      VF.fx.pulse(0.6);
      showPrompt(s2.loc.name, s2.loc.glow, 2.4);
      VF.toast.show('<strong>' + U.esc(s2.loc.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(s2.found) + '</span>', 'good', 8000);
      flashMenu('map');
      VF.achievements.check();
    });

    /* A rod that was handed over rather than bought. grant() is the only way
       one arrives, from a person or from the water, so this is the only place
       that has to make anything of it. */
    VF.bus.on('rod:granted', function (rod) {
      VF.audio.stinger('grand', 5);
      VF.fx.pulse(0.6);
      VF.fx.flash(U.rgbToCss(U.hexToRgb(rod.art.tip), 0.20), 0.34, 1.5);
      showPrompt(rod.name, rod.art.tip, 2.2);
      VF.toast.show('<strong>' + U.esc(rod.name) + '</strong><br>' +
        '<span style="color:var(--ink-3)">nobody sold you this one. it is already in your hands.</span>',
        'good', 7000);
      flashMenu('shop');
      refreshGear();
      VF.achievements.check();
    });
    VF.bus.on('charm:found', function (c) {
      VF.toast.show('<strong>' + U.esc(c.name) + '</strong><br><span style="color:var(--ink-3)">' +
        U.esc(c.note) + '</span>', 'good', 6000);
      flashMenu('shop');
    });
    VF.bus.on('cosmetic:found', function (c) {
      VF.toast.show('<strong>' + U.esc(c.name) + '</strong> — ' +
        U.esc(VF.rarities.get(c.rarity).name), 'good', 4000);
    });
    VF.bus.on('journal:entry', function (e) {
      VF.toast.show('journal · <strong>' + U.esc(e.title) + '</strong>', null, 3600);
      flashMenu('journal');
    });
    VF.bus.on('npc:advanced', function () { flashMenu('journal'); });
    VF.bus.on('npc:gives', function (o) {
      if (o.gives.indexOf('rod:') === 0) {
        VF.rods.grant(o.gives.slice(4));
      } else if (o.gives === 'case') {
        VF.state.data.caseTokens++;
        VF.toast.show('the keeper hands you <strong>a key</strong>', 'good', 4200);
      } else if (o.gives === 'rod') {
        // a rod that is not for sale, handed over. It goes straight into the hand.
        const rod = VF.rods.get(o.rod);
        if (o.rod && VF.rods.grant(o.rod)) {
          VF.toast.show('<strong>' + U.esc(rod.name) + '</strong><br>' +
            '<span style="color:var(--ink-3)">' + U.esc(o.npc.name.toLowerCase()) +
            ' hands it over — it is in your hands</span>', 'good', 7000);
          flashMenu('shop');   // grant() already emitted gear:changed
        }
      } else if (o.gives === 'cosmetic') {
        const pool = VF.cosmetics.list.filter(function (c) { return c.secret && !VF.cosmetics.owned(c.id); });
        if (pool.length) {
          const pick = VF.rng.g.pick(pool);
          VF.cosmetics.grant(pick.id);
          VF.toast.show('the collector gives you <strong>' + U.esc(pick.name) + '</strong>', 'good', 5200);
        }
      }
      VF.save.save();
    });

    /* --- something is wrong --- */
    VF.bus.on('wrong:begin', function () {
      VF.audio.duck(1);
      D.hud.classList.add('dimmed');
    });
    VF.bus.on('wrong:peak', function () {
      document.body.classList.add('wrong');
      D.hud.classList.add('gone');
    });
    VF.bus.on('wrong:shape', function () {
      const loc = VF.locations.current();
      VF.scene.addShadow({ x: -0.6, y: 0.34, sp: 0.085, size: 16, alpha: 0.92, life: 9, max: 9 });
      VF.audio.wrongShape();
    });
    VF.bus.on('wrong:restore', function () {
      document.body.classList.remove('wrong');
      D.hud.classList.remove('gone');
    });
    VF.bus.on('wrong:end', function () {
      D.hud.classList.remove('dimmed');
      document.body.classList.remove('wrong');
      VF.achievements.check();
    });
  }

  function endEncounterUI() {
    D.hud.classList.remove('dimmed');
    if (D.encounter.classList.contains('hidden')) return;
    D.encounter.classList.add('out');
    setTimeout(function () { D.encounter.classList.add('hidden'); D.encounter.classList.remove('out'); }, 900);
  }

  function onLevelUp(e) {
    VF.audio.levelUp();
    VF.fx.flash('rgba(180,220,255,0.16)', 0.22, 1.6);
    VF.fx.pulse(0.4);
    showPrompt('Level ' + e.level, '#cfe4ff', 1.4);
    const u = e.unlocked;
    if (u) {
      u.locations.forEach(function (l) {
        VF.toast.show('<strong>New spot: ' + U.esc(l.name) + '</strong><br><span style="color:var(--ink-3)">' +
          U.esc(l.tag) + '</span>', 'good', 6000);
        flashMenu('map');
      });
      u.rods.forEach(function (r) {
        VF.toast.show('<strong>' + U.esc(r.name) + '</strong> available in the shop', null, 5000);
        flashMenu('shop');
      });
      u.baits.forEach(function (b) {
        VF.toast.show('<strong>' + U.esc(b.name) + '</strong> available in the shop', null, 5000);
      });
    }
    VF.achievements.check();
    refreshAll();
  }

  function flashMenu(panel) {
    const b = U.qs('.mbtn[data-panel="' + panel + '"]');
    if (!b) return;
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }

  /* Whether this is a device that can only be pressed, not typed on — the
     control is the same either way, the sentence that teaches it is not. */
  function touchOnly() {
    return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }

  /* ------------------------------------------------------------ prompts */

  /* ------------------------------------------------------------ captions */

  let capLine = null, capNpc = null, capReady = false;

  /* Somebody becoming willing to talk is silent otherwise — the player would
     have to keep opening the journal to find out. Checked about once a second;
     anyNew() only walks five people and their stage gates. */
  let newCheck = 0, hadNew = false;

  function watchForVisitors(dt) {
    newCheck -= dt;
    if (newCheck > 0) return;
    newCheck = 1.1;
    const now = VF.npcs.anyNew();
    if (now && !hadNew && !VF.visit.active()) {
      VF.toast.show('somebody on the shore has something to say &mdash; ' +
                    '<strong>journal &middot; people</strong>', null, 5600);
      flashMenu('journal');
    }
    hadNew = now;
  }

  function tickCaption() {
    const el = document.getElementById('caption');
    if (!el) return;
    const V = VF.visit;
    const hudEl = document.getElementById('hud');

    if (!V.active()) {
      if (!el.classList.contains('hidden')) {
        el.classList.add('hidden');
        el.classList.remove('fading', 'ready');
        capLine = null; capNpc = null;
      }
      if (hudEl) hudEl.classList.remove('visiting');
      return;
    }
    if (hudEl) hudEl.classList.add('visiting');

    const line = V.line();
    if (!line) {
      // walking out or walking back — the shore, and nothing written on it
      if (!el.classList.contains('hidden')) el.classList.add('fading');
      capLine = null;
      return;
    }
    const npc = V.npc();
    if (line !== capLine || npc !== capNpc) {
      capLine = line; capNpc = npc; capReady = false;
      document.getElementById('captionWho').textContent = npc ? npc.name.toLowerCase() : '';
      document.getElementById('captionWho').style.color = npc ? npc.color : 'var(--ink-3)';
      const txt = document.getElementById('captionText');
      txt.textContent = line;
      // restart the entry animation for each new line
      txt.style.animation = 'none';
      void txt.offsetWidth;
      txt.style.animation = '';
      el.classList.remove('hidden', 'fading', 'ready');
    }
    // the prompt only appears once the line has had time to be read
    const ready = VF.visit.S.lineT >= 0.55;
    if (ready !== capReady) {
      capReady = ready;
      el.classList.toggle('ready', ready);
    }
  }

  function showPrompt(text, color, hold) {
    D.prompt.textContent = text;
    D.prompt.style.color = color || 'var(--ink)';
    D.prompt.classList.remove('show', 'hold');
    void D.prompt.offsetWidth;
    D.prompt.classList.add('show');
    promptTimer = hold || 1.2;
  }

  function hint(text, seconds) {
    if (!VF.state.data.settings.showHints) return;
    D.hintBox.textContent = text;
    D.hintBox.classList.add('on');
    hintTimer = seconds || 6;
  }
  function clearHint() { D.hintBox.classList.remove('on'); hintTimer = 0; }

  /* ------------------------------------------------------------ refresh */

  function refreshAll() {
    refreshGear();
    refreshChips();
    refreshLevel();
    const loc = VF.locations.current();
    document.documentElement.style.setProperty('--accent', loc.glow);
    document.documentElement.style.setProperty('--accent-dim', U.rgbToCss(U.hexToRgb(loc.glow), 0.30));
  }

  function refreshGear() {
    const d = VF.state.data;
    const rod = VF.rods.get(d.rod);
    const bait = VF.bait.get(d.bait);
    D.rodName.textContent = rod.name;
    D.baitName.textContent = bait.name;
    const n = VF.bait.count(d.bait);
    D.baitCount.textContent = n === Infinity ? '∞' : n;
    D.baitCount.classList.toggle('low', n !== Infinity && n <= 3);
  }

  function refreshChips() {
    D.locName.textContent = VF.locations.current().name;
    D.wxName.textContent = VF.weather.name();
    D.timeName.textContent = VF.time.phaseName() + ' · ' + VF.time.clock();
    const c = VF.conditions.current();
    D.chipCond.classList.toggle('hidden', !c);
    if (c) {
      D.condName.textContent = c.name;
      D.chipCond.style.borderColor = U.rgbToCss(U.hexToRgb(c.tint), 0.55);
      D.condName.style.color = c.tint;
      D.chipCond.title = c.blurb;
    }
  }

  function refreshLevel() {
    const d = VF.state.data;
    D.levelVal.textContent = 'LV ' + d.level + (d.streak >= 5 ? '  ×' + d.streak : '');
    const need = VF.progression.xpToNext();
    const pctv = U.clamp(d.xp / Math.max(1, need), 0, 1);
    D.xpFill.style.width = (pctv * 100).toFixed(1) + '%';
    D.xpText.textContent = U.commas(d.xp) + ' / ' + U.commas(need);
  }

  /* --------------------------------------------------------------- tick */

  let chipTimer = 0;

  function tick(dt) {
    const d = VF.state.data;
    const S = VF.fishing.S;

    tickCaption();
    watchForVisitors(dt);

    /* money counts up rather than snapping */
    if (Math.abs(shownMoney - d.money) > 0.5) {
      const before = Math.floor(shownMoney);
      shownMoney = U.approach(shownMoney, d.money, 0.0006, dt);
      if (Math.abs(shownMoney - d.money) < 1) shownMoney = d.money;
      D.moneyVal.textContent = U.money(shownMoney);
      if (Math.floor(shownMoney) > before + 1) {
        D.moneyVal.classList.remove('bump'); void D.moneyVal.offsetWidth;
        D.moneyVal.classList.add('bump');
      }
    } else if (D.moneyVal.textContent !== U.money(d.money)) {
      shownMoney = d.money;
      D.moneyVal.textContent = U.money(d.money);
    }

    chipTimer -= dt;
    if (chipTimer <= 0) { chipTimer = 0.5; refreshChips(); refreshLevel(); }

    /* cast meter */
    if (S.charging) {
      D.castMeter.classList.add('on');
      D.castFill.style.width = (S.charge * 100).toFixed(1) + '%';
      D.actionBtn.classList.add('charging');
    } else {
      D.castMeter.classList.remove('on');
      D.actionBtn.classList.remove('charging');
    }

    updateAction(S);
    updateFight(S, dt);

    if (promptTimer > 0) {
      promptTimer -= dt;
      if (promptTimer <= 0) D.prompt.classList.remove('show', 'hold');
    }
    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) clearHint();
    }
  }

  function updateAction(S) {
    const st = S.state;
    let label = 'Cast', h = 'hold to charge', cls = '';
    if (S.charging) { label = 'Release'; h = 'let go to cast'; }
    else if (st === 'casting') { label = '—'; h = 'casting'; cls = 'busy'; }
    else if (st === 'waiting') { label = 'Waiting'; h = 'press R to reel in'; cls = 'busy'; }
    else if (st === 'bite') { label = 'Set hook'; h = 'now'; cls = 'bite'; }
    else if (st === 'reeling') { label = 'Reel'; h = 'hold to reel'; cls = 'reeling'; }
    else if (st === 'landed') { label = '—'; h = ''; cls = 'busy'; }

    if (D.actionLabel.textContent !== label) D.actionLabel.textContent = label;
    if (D.actionHint.textContent !== h) D.actionHint.textContent = h;
    D.actionBtn.className = 'action-btn' + (cls ? ' ' + cls : '') + (S.charging ? ' charging' : '');
  }

  /* The catch bar. Everything here is a straight read of the fight state the
     simulation already computed this frame — the HUD never decides anything,
     so what is drawn and what is being played are always the same thing. */
  function updateFight(S, dt) {
    const on = S.state === 'reeling' && S.fight;
    if (!on) {
      if (!D.fightUI.classList.contains('hidden')) {
        D.fightUI.classList.add('hidden');
        D.fightUI.classList.remove('shake', 'enter');
        // the ratchet loop is opened on the hook and closed here, because this
        // is the one observer that sees every way a fight can end — including
        // a treasure landing and a save reset, neither of which says anything
        VF.audio.reelStop();
        VF.audio.setTension(0);
      }
      return;
    }
    const f = S.fight;
    if (D.fightUI.classList.contains('hidden')) {
      D.fightUI.classList.remove('hidden');
      D.fightUI.classList.add('enter');
      setTimeout(function () { D.fightUI.classList.remove('enter'); }, 320);
      const col = f.c.kind === 'treasure' ? '#d8c79a' : VF.rarities.color(f.c.rarity);
      D.fightName.textContent = f.c.kind === 'treasure' ? 'something heavy'
        : f.c.isNew ? 'unknown — something new'
        : VF.traits.title(f.c.traits, f.c.fish.name);
      D.fightName.style.color = col;
      D.mgFish.style.setProperty('--fishcol', col);
      // sized here and then only when the fight itself moves the walls, which
      // ordinarily never happens and in the heaven's trial happens four times
      shownBarW = -1;
      // a phone has no space bar, and the same press model reaches the screen
      const key = touchOnly() ? 'hold' : 'hold <b>space</b>';
      D.fightHint.innerHTML = VF.state.data.stats.catches < 5
        ? key + ' — keep the fish in the bar'
        : key + ' to go right, let go to go left';
    }

    /* the bar and the fish */
    if (f.barW !== shownBarW) {
      shownBarW = f.barW;
      D.mgBar.style.width = (f.barW * 100).toFixed(2) + '%';
    }
    D.mgBar.style.left = ((f.bar - f.barW * 0.5) * 100).toFixed(3) + '%';
    D.mgFish.style.left = (f.fish * 100).toFixed(3) + '%';
    D.mgFish.classList.toggle('left', f.fishV < -0.02);
    D.mgBar.classList.toggle('grip', f.inside);
    D.mgBar.classList.toggle('right', f.barV > 0.05);
    D.mgBar.classList.toggle('still', Math.abs(f.barV) < 0.05);

    /* the progress */
    const pr = U.clamp(f.progress, 0, 1);
    D.mgProgFill.style.width = (pr * 100).toFixed(2) + '%';
    D.mgProg.classList.toggle('gain', f.inside);
    D.mgProg.classList.toggle('drain', !f.inside);
    D.mgProg.classList.toggle('low', pr < 0.22);
    D.fightPct.textContent = Math.round(pr * 100) + '%';

    /* the warning line only says something once it means something */
    const losing = !f.inside && f.outsideT > 0.28;
    const warn = pr < 0.18 ? 'nearly gone' : losing ? 'losing it' : '';
    if (D.fightWarn.textContent !== warn) D.fightWarn.textContent = warn;
    D.fightWarn.classList.toggle('on', !!warn);
    D.fightUI.classList.toggle('shake', f.shakeAmt > 0.45);

    VF.audio.reelTension(f.tension);
    VF.audio.setTension(f.tension);
    // no decay argument: fx.shake's decay is global and last-caller-wins, and
    // overriding it here would cut the surge shake short every frame
    if (f.shakeAmt > 0.1) VF.fx.shake(f.shakeAmt * 2.2);
  }

  VF.hud = {
    init: init, tick: tick, refreshAll: refreshAll, refreshGear: refreshGear,
    hint: hint, clearHint: clearHint, showPrompt: showPrompt,
    show: function () { D.hud.classList.remove('hidden'); },
    pressEnd: pressEnd
  };
})(window.VF = window.VF || {});
