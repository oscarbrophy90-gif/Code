/* VOID FISHING — the catch card.
   The payoff screen: species art, rarity, mutation, size against the species
   record, value, and what to do with it. */
(function (VF) {
  'use strict';

  const U = VF.util;
  let host = null, card = null, open = false, raf = 0, art = null, artCtx = null;
  let gen = 0;   // guards the deferred teardown against a newer open
  let current = null, artT = 0, lastFrame = 0, resolved = false;
  let revealT = 0;   // 0..1 silhouette-to-creature wipe for a new species

  function init() {
    host = document.getElementById('modal');
    VF.bus.on('fishing:landed', function (c) {
      /* Two species stop the game to show you something first. The catch is
         already recorded by the time this runs, so the card is the same card
         whether the sequence is watched or skipped. */
      if (c.fish && c.fish.cutscene && VF.cutscene) {
        VF.cutscene.play(c.fish.cutscene, c, function () {
          setTimeout(function () { show(c); }, 260);
        });
        return;
      }
      setTimeout(function () { show(c); }, 340);
    });
    VF.bus.on('fishing:treasure', function (c) { setTimeout(function () { showTreasure(c); }, 320); });
  }

  function banner(c) {
    const traits = c.traits || [];
    if (c.rarity === 'unknown') return { text: 'the record has no tier for this', color: '#ffffff' };
    if (c.rarity === 'glitch') return { text: 'this should not be here', color: '#ff2d55' };
    if (traits.length >= 3) return { text: traits.length + ' traits', color: VF.traits.color(traits) };
    if (c.isNew) return { text: 'new discovery', color: VF.rarities.color(c.rarity) };
    if (traits.length === 2) return { text: 'double trait', color: VF.traits.color(traits) };
    if (c.isGiant) return { text: 'enormous', color: '#ffb03a' };
    if (c.isRecord) return { text: 'personal best', color: '#6fd8a4' };
    return { text: VF.rarities.get(c.rarity).name, color: VF.rarities.color(c.rarity) };
  }

  function show(c) {
    if (!c || open) return;
    current = c;
    open = true;
    resolved = false;
    gen++;
    VF.state.rt.panelOpen = 'catch';

    const r = VF.rarities.get(c.rarity);
    const traits = c.traits || [];
    const topTrait = traits.length ? VF.traits.get(traits[traits.length - 1]) : null;
    const b = banner(c);
    const rank = r.rank;

    /* --- audio + screen feedback scaled to how special this is --- */
    VF.audio.stinger(r.stinger, rank);
    if (r.shake > 0) VF.fx.shake(r.shake, 3.6);
    if (rank >= 2) VF.fx.flash(U.rgbToCss(U.hexToRgb(r.glow), 0.20), 0.24 + rank * 0.035, 1.8);
    if (rank >= 4 || c.isGiant) VF.fx.pulse(0.55);
    if (topTrait) VF.fx.flash(U.rgbToCss(U.hexToRgb(topTrait.color), 0.14 + traits.length * 0.04),
                              0.20 + traits.length * 0.05, 2.0);

    const scn = VF.scene.L;
    VF.particles.burst(scn.landPoint.x, scn.landPoint.y, 14 + rank * 5, {
      color: U.hexToRgb(r.glow), angle: -Math.PI / 2, spread: 2.0,
      speedMin: 40, speedMax: 130 + rank * 30, sizeMax: 2.6, grav: 260, lifeMax: 1.0
    });

    /* --- build the card --- */
    card = U.el('div', 'catch-card');

    const ban = U.el('div', 'catch-banner', b.text);
    ban.style.background = b.color;
    card.appendChild(ban);

    const hero = U.el('div', 'catch-hero');
    hero.style.background = 'radial-gradient(ellipse at 50% 55%, ' +
      U.rgbToCss(U.hexToRgb(r.glow), 0.14) + ', rgba(0,0,0,0) 68%)';
    art = U.el('canvas');
    art.width = 400; art.height = 168;
    art.style.width = '100%'; art.style.height = '168px';
    artCtx = art.getContext('2d');
    hero.appendChild(art);
    card.appendChild(hero);

    const body = U.el('div', 'catch-body');

    if (c.isRecord && !c.isNew) {
      const flag = U.el('div', 'record-flag');
      flag.appendChild(U.el('span', null, '↑'));
      flag.appendChild(U.el('span', null, 'beat your previous best'));
      body.appendChild(flag);
    }

    const rr = U.el('div', 'catch-rarity', r.name);
    rr.style.color = b.color;
    body.appendChild(rr);

    body.appendChild(U.el('h2', 'catch-name', VF.traits.title(traits, c.fish.name)));

    if (traits.length) {
      const row = U.el('div', 'trait-row');
      traits.forEach(function (id) {
        const t = VF.traits.get(id);
        if (!t) return;
        const chip = U.el('span', 'trait-chip', t.name + ' ×' + t.mult);
        chip.style.color = t.color;
        chip.style.borderColor = U.rgbToCss(U.hexToRgb(t.color), 0.42);
        chip.title = t.desc;
        row.appendChild(chip);
      });
      if (traits.length > 1) {
        const combo = U.el('span', 'trait-chip trait-combo',
          'combination ×' + (1 + (traits.length - 1) * 0.6).toFixed(1));
        combo.style.color = '#ffd88a';
        row.appendChild(combo);
      }
      body.appendChild(row);
    }

    body.appendChild(U.el('p', 'catch-desc', topTrait ? topTrait.desc : c.fish.desc));

    const metrics = U.el('div', 'catch-metrics');
    metrics.appendChild(metric('Weight', U.weight(c.kg)));
    metrics.appendChild(metric('Length', U.length(c.m)));
    metrics.appendChild(metric('Size', U.ordinalPercentile(c.pct)));
    body.appendChild(metrics);

    const track = U.el('div', 'size-track');
    const fill = U.el('div', 'size-fill');
    fill.style.background = 'linear-gradient(90deg, ' + U.rgbToCss(U.hexToRgb(r.color), 0.35) + ', ' + r.glow + ')';
    track.appendChild(fill);
    body.appendChild(track);

    const note = U.el('div', 'size-note');
    note.appendChild(U.el('span', null, 'runt'));
    note.appendChild(U.el('span', null, c.isGiant ? 'a specimen' : 'giant'));
    body.appendChild(note);

    const val = U.el('div', 'catch-value');
    const coin = U.el('span', 'coin', '◈');
    coin.style.color = 'var(--accent)';
    val.appendChild(coin);
    val.appendChild(U.el('span', 'amt', U.money(c.value)));
    body.appendChild(val);

    const acts = U.el('div', 'catch-actions');
    const sellBtn = U.el('button', 'btn btn-primary', 'Sell');
    sellBtn.addEventListener('click', function () { act('sell'); });
    const keepBtn = U.el('button', 'btn', 'Keep');
    keepBtn.title = 'Store it in your bag. Sell it later.';
    keepBtn.addEventListener('click', function () { act('keep'); });
    const relBtn = U.el('button', 'btn', 'Release');
    relBtn.title = 'Let it go for reputation, which quietly improves your luck.';
    relBtn.addEventListener('click', function () { act('release'); });
    acts.appendChild(sellBtn); acts.appendChild(keepBtn); acts.appendChild(relBtn);
    body.appendChild(acts);

    card.appendChild(body);
    U.clear(host);
    host.appendChild(card);
    host.classList.remove('hidden');

    requestAnimationFrame(function () { fill.style.width = (c.pct * 100).toFixed(1) + '%'; });

    if (c.isNew) {
      VF.audio.discover();
      VF.toast.show('<strong>' + U.esc(c.fish.name) + '</strong> added to the Fishdex', 'good', 4200);
    }
    VF.achievements.check();

    artT = 0;
    revealT = c.isNew ? 0 : 1;
    lastFrame = performance.now();
    loop();
    setTimeout(function () { sellBtn.focus(); }, 60);
  }

  /* Objects get their own card: no size, no fishdex, and often no price. */
  function showTreasure(c) {
    if (!c || open) return;
    current = c; open = true; resolved = false; gen++;
    VF.state.rt.panelOpen = 'catch';

    const t = c.treasure;
    const r = VF.rarities.get(t.rarity);
    const rank = r.rank;
    VF.audio.stinger(rank >= 4 ? 'grand' : rank >= 2 ? 'bright' : 'soft', rank);
    if (rank >= 3) VF.fx.shake(r.shake, 3.6);
    VF.fx.flash(U.rgbToCss(U.hexToRgb(t.color), 0.16), 0.20 + rank * 0.03, 1.9);

    card = U.el('div', 'catch-card');
    const ban = U.el('div', 'catch-banner',
      t.rodGift ? 'a rod, and nobody made it' : t.relic ? 'a relic' : 'pulled from the water');
    ban.style.background = t.color;
    card.appendChild(ban);

    const hero = U.el('div', 'catch-hero');
    hero.style.background = 'radial-gradient(ellipse at 50% 55%, ' +
      U.rgbToCss(U.hexToRgb(t.color), 0.16) + ', rgba(0,0,0,0) 68%)';
    art = U.el('canvas');
    art.width = 400; art.height = 168;
    art.style.width = '100%'; art.style.height = '168px';
    artCtx = art.getContext('2d');
    hero.appendChild(art);
    card.appendChild(hero);

    const body = U.el('div', 'catch-body');
    const rr = U.el('div', 'catch-rarity', r.name);
    rr.style.color = t.color;
    body.appendChild(rr);
    body.appendChild(U.el('h2', 'catch-name', t.name));
    body.appendChild(U.el('p', 'catch-desc', t.desc));

    if (t.relic) {
      const ch = VF.charms.get(t.relic);
      if (ch) {
        const note = U.el('div', 'relic-note');
        note.appendChild(U.el('span', 'k', 'relic'));
        note.appendChild(U.el('div', null, ch.note));
        body.appendChild(note);
      }
    }
    if (t.rod) {
      const r = VF.rods.get(t.rod);
      if (r) {
        const note = U.el('div', 'relic-note');
        note.appendChild(U.el('span', 'k', 'a rod'));
        note.appendChild(U.el('div', null, r.name + ' — ' + r.desc));
        body.appendChild(note);
      }
    }
    if (t.token) {
      const note = U.el('div', 'relic-note');
      note.appendChild(U.el('span', 'k', 'the keeper will want this'));
      note.appendChild(U.el('div', null, 'kept for now. it opens something.'));
      body.appendChild(note);
    }
    if (t.rodGift) {
      // the wrapping comes off on the bank, so this is where it gets a name
      const rod = VF.rods.get(t.rodGift);
      const note = U.el('div', 'relic-note');
      note.appendChild(U.el('span', 'k', 'unwrapped: ' + rod.name.toLowerCase()));
      note.appendChild(U.el('div', null, rod.desc));
      body.appendChild(note);
    }

    const sellable = t.value[1] > 0;
    let amount = 0;
    if (sellable) {
      amount = Math.round(VF.rng.g.range(t.value[0], t.value[1]) *
                          (VF.build ? VF.build.stats().value : 1));
      const val = U.el('div', 'catch-value');
      const coin = U.el('span', 'coin', '◈');
      coin.style.color = 'var(--accent)';
      val.appendChild(coin);
      val.appendChild(U.el('span', 'amt', U.money(amount)));
      body.appendChild(val);
    }

    const acts = U.el('div', 'catch-actions');
    acts.style.gridTemplateColumns = sellable ? '1.3fr 1fr' : '1fr';
    if (sellable) {
      const sellBtn = U.el('button', 'btn btn-primary', 'sell');
      sellBtn.addEventListener('click', function () {
        if (resolved) return;
        resolved = true;
        VF.economy.earn(amount, 'treasure');
        VF.state.data.stats.sold++;
        VF.audio.sell();
        VF.toast.show('sold for <strong class="mono">' + U.money(amount) + '</strong>', 'good', 2400);
        VF.fishing.resolveCatch();
        close();
      });
      acts.appendChild(sellBtn);
    }
    const keepBtn = U.el('button', sellable ? 'btn' : 'btn btn-primary', t.relic || t.token ? 'keep' : 'keep');
    keepBtn.addEventListener('click', function () {
      if (resolved) return;
      resolved = true;
      VF.audio.click();
      VF.fishing.resolveCatch();
      close();
    });
    acts.appendChild(keepBtn);
    body.appendChild(acts);
    card.appendChild(body);

    U.clear(host);
    host.appendChild(card);
    host.classList.remove('hidden');
    VF.achievements.check();

    artT = 0; revealT = 1;
    lastFrame = performance.now();
    loopTreasure();
    setTimeout(function () { acts.firstChild.focus(); }, 60);
  }

  function loopTreasure() {
    if (!open || !current || !current.treasure) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    artT += dt;
    const g = artCtx;
    g.clearRect(0, 0, art.width, art.height);
    g.save();
    g.translate(art.width / 2, art.height / 2 + Math.sin(artT * 1.3) * 4);
    g.rotate(Math.sin(artT * 0.7) * 0.06);
    VF.treasureArt.draw(g, current.treasure, 52, artT);
    g.restore();
    raf = requestAnimationFrame(loopTreasure);
  }

  function metric(k, v) {
    const el = U.el('div', 'metric');
    el.appendChild(U.el('span', 'k', k));
    el.appendChild(U.el('span', 'v', v));
    return el;
  }

  function loop() {
    if (!open) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    artT += dt;

    const c = current;
    const g = artCtx;
    const W = art.width, H = art.height;
    g.clearRect(0, 0, W, H);

    if (revealT < 1) revealT = Math.min(1, revealT + dt / 1.15);
    const k = VF.util.smootherstep(revealT);

    g.save();
    g.translate(W / 2, H / 2 + Math.sin(artT * 1.4) * 4);
    g.rotate(Math.sin(artT * 0.85) * 0.055);
    const size = VF.fishArt.fitSize(c.fish, 150);

    if (k < 1) {
      // a new species resolves out of its own silhouette
      g.globalAlpha = 1 - k;
      VF.fishArt.drawSilhouette(g, c.fish, size, 0.9);
      g.globalAlpha = k;
    }
    VF.fishArt.draw(g, c.fish, size, { time: artT, traits: c.traits });
    g.globalAlpha = 1;
    g.restore();

    if (k < 1) {
      // a light sweeps across as it resolves
      const r = VF.rarities.get(c.rarity);
      const x = -W * 0.3 + k * W * 1.6;
      const grad = g.createLinearGradient(x - W * 0.16, 0, x + W * 0.16, 0);
      grad.addColorStop(0, U.rgbToCss(U.hexToRgb(r.glow), 0));
      grad.addColorStop(0.5, U.rgbToCss(U.hexToRgb(r.glow), 0.42 * (1 - k)));
      grad.addColorStop(1, U.rgbToCss(U.hexToRgb(r.glow), 0));
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    raf = requestAnimationFrame(loop);
  }

  function act(kind) {
    if (!open || resolved) return;
    resolved = true;
    let r;
    if (kind === 'sell') { r = VF.catches.sell(); if (r) VF.toast.show('Sold for <strong class="mono">' + U.money(r) + '</strong>', 'good', 2400); }
    else if (kind === 'keep') { VF.catches.keep(); VF.toast.plain('Kept in your bag', null, 2000); }
    else {
      const res = VF.catches.release();
      if (res) {
        let msg = 'Released · <span class="mono">+' + res.rep + '</span> reputation';
        if (res.bonus && res.bonus.kind === 'bait') msg += '<br><span style="color:var(--good)">Found: ' + U.esc(res.bonus.text) + '</span>';
        if (res.bonus && res.bonus.kind === 'money') msg += '<br><span style="color:var(--good)">Gratitude: ' + U.money(res.bonus.amount) + '</span>';
        VF.toast.show(msg, 'good', 3600);
      }
    }
    close();
  }

  function defaultAction() { act('sell'); }

  /* Dismissing the card must never strand the catch. If no choice was made the
     fish is sold, so the player cannot lose progress by closing the window. */
  function close() {
    if (!open) return;
    if (!resolved && VF.fishing.state() === 'landed') {
      resolved = true;
      if (current && current.treasure) VF.fishing.resolveCatch();
      else VF.catches.sell();
    }
    open = false;
    VF.state.rt.panelOpen = null;
    cancelAnimationFrame(raf);
    raf = 0;
    if (card) card.classList.add('out');
    const myGen = ++gen;
    setTimeout(function () {
      // something else may own the modal host by now
      if (myGen !== gen || open || VF.panels.isOpen()) return;
      host.classList.add('hidden');
      U.clear(host);
      card = null; art = null; artCtx = null; current = null;
    }, 210);
    VF.hud.pressEnd();
  }

  VF.catchUI = { init: init, isOpen: function () { return open; }, defaultAction: defaultAction, close: close };
})(window.VF = window.VF || {});
