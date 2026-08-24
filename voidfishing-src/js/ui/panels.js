/* VOID FISHING — menus. One panel host, six views, all rebuilt on open so they
   never drift out of sync with the game state. */
(function (VF) {
  'use strict';

  const U = VF.util;
  let host = null, overlay = null, current = null, node = null;
  let gen = 0;   // guards the deferred teardown against a newer open
  let rodCanvases = [];   // live rod previews, animated while the shop is open
  let rodRaf = 0;

  /* Rod previews animate — the flourishes on the late-tier rods are the point
     of showing them at all — so they run their own loop while visible. */
  function startRodLoop() {
    stopRodLoop();
    if (!rodCanvases.length) return;
    const t0 = performance.now();
    (function frame() {
      if (!rodCanvases.length) { rodRaf = 0; return; }
      const t = (performance.now() - t0) / 1000;
      for (let i = 0; i < rodCanvases.length; i++) {
        const e = rodCanvases[i];
        if (!e.cv.isConnected) continue;
        const g = e.ctx;
        g.clearRect(0, 0, e.cv.width, e.cv.height);
        VF.rodArt.preview(g, e.rod, e.cv.width, e.cv.height, t + e.phase);
      }
      rodRaf = requestAnimationFrame(frame);
    })();
  }
  function stopRodLoop() {
    if (rodRaf) cancelAnimationFrame(rodRaf);
    rodRaf = 0;
    rodCanvases = [];
  }

  /* Owning a rod and being allowed to swing it are two different things — the
     one at the end of the long thread arrives well before its level. Both
     places that offer an Equip button go through here so they cannot disagree
     about it. */
  function equipButton(rod, onDone, cls) {
    if (!VF.rods.canEquip(rod)) {
      const wait = U.el('div', 'row-price', 'needs lv ' + rod.level);
      wait.style.color = 'var(--warn)';
      return wait;
    }
    const btn = U.el('button', 'btn btn-sm' + (cls || ''), 'Equip');
    btn.addEventListener('click', function () {
      VF.state.data.rod = rod.id;
      VF.audio.click(); VF.bus.emit('gear:changed'); VF.save.save();
      onDone();
    });
    return btn;
  }

  function rodPreview(rod, i, dim) {
    const cv = U.el('canvas', 'rod-art');
    cv.width = 300; cv.height = 132;
    const g = cv.getContext('2d');
    if (dim) cv.style.opacity = '0.45';
    VF.rodArt.preview(g, rod, cv.width, cv.height, i * 0.9);
    rodCanvases.push({ cv: cv, ctx: g, rod: rod, phase: i * 0.9 });
    return cv;
  }
  let dexFilter = 'all', dexMode = 'all', dexTab = 'waters', dexLoc = 'all';

  function init() {
    host = document.getElementById('modal');
    overlay = document.getElementById('overlay');
    overlay.addEventListener('click', function () { if (current) close(); });
  }

  function isOpen() { return !!current; }

  function open(id, tab) {
    if (VF.catchUI.isOpen()) return;
    if (current === id) { close(); return; }
    if (current) closeNow();
    stopRodLoop();
    gen++;
    current = id;
    VF.state.rt.panelOpen = id;
    overlay.classList.remove('hidden', 'out');
    node = build(id, tab);
    U.clear(host);
    host.appendChild(node);
    host.classList.remove('hidden');
    startRodLoop();
    U.qsa('.mbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.panel === id); });
    VF.hud.pressEnd();
  }

  function close() {
    if (!current) return;
    VF.audio.back();
    if (node) node.classList.add('out');
    overlay.classList.add('out');
    const n = node;
    const myGen = ++gen;
    setTimeout(function () {
      // a panel opened during the exit animation owns the host now — leave it alone
      if (myGen !== gen) return;
      if (n && n.parentNode) n.parentNode.removeChild(n);
      if (!current) { host.classList.add('hidden'); overlay.classList.add('hidden'); }
    }, 210);
    closeNow();
  }

  function closeNow() {
    stopRodLoop();
    current = null; node = null;
    VF.state.rt.panelOpen = null;
    U.qsa('.mbtn').forEach(function (b) { b.classList.remove('active'); });
    overlay.classList.add('hidden');
  }

  function refresh(tab) {
    if (!current) return;
    stopRodLoop();
    const id = current, prev = node;
    /* Where the reader was. A panel is rebuilt from scratch on every change,
       and settings is long enough that acting on something near the bottom —
       loading a slot, erasing one — used to throw the page back to the top and
       leave them hunting for the row they had just pressed. */
    const wasAt = prev ? (prev.querySelector('.panel-body') || {}).scrollTop || 0 : 0;
    node = build(id, tab);
    if (prev && prev.parentNode) prev.parentNode.replaceChild(node, prev);
    if (wasAt) {
      const bodyEl = node.querySelector('.panel-body');
      if (bodyEl) bodyEl.scrollTop = wasAt;
    }
    startRodLoop();
  }

  /* ------------------------------------------------------------ scaffold */

  function shell(title, sub) {
    const p = U.el('div', 'panel');
    const head = U.el('div', 'panel-head');
    const left = U.el('div');
    left.appendChild(U.el('div', 'panel-title', title));
    if (sub) left.appendChild(U.el('div', 'panel-sub', sub));
    head.appendChild(left);
    const x = U.el('button', 'panel-close', '×');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    p.appendChild(head);
    return p;
  }

  function tabs(items, active, onPick) {
    const bar = U.el('div', 'tabs');
    items.forEach(function (it) {
      const b = U.el('button', 'tab' + (it.id === active ? ' active' : ''), it.label);
      b.addEventListener('click', function () { VF.audio.click(); onPick(it.id); });
      bar.appendChild(b);
    });
    return bar;
  }

  function body() { return U.el('div', 'panel-body scroll'); }

  function priceEl(cost, affordable) {
    const s = U.el('div', 'row-price' + (affordable ? '' : ' cant'));
    s.textContent = '◈ ' + U.money(cost);
    return s;
  }

  function statCell(k, v, dir) {
    const c = U.el('div', 'stat-cell');
    c.appendChild(U.el('span', 'k', k));
    const val = U.el('span', 'v' + (dir > 0 ? ' up' : dir < 0 ? ' down' : ''), v);
    c.appendChild(val);
    return c;
  }

  function build(id, tab) {
    switch (id) {
      case 'shop': return buildShop(tab || 'rods');
      case 'fishdex': return buildDex();
      case 'bag': return buildBag(tab || 'catches');
      case 'stats': return buildStats(tab || 'stats');
      case 'settings': return buildSettings();
      case 'map': return buildMap();
      case 'merchant': return buildMerchant();
      case 'cases': return buildCases();
      case 'wardrobe': return buildWardrobe(tab || 'all');
      // a running quest is what the journal is for while there is one
      case 'journal': return buildJournal(tab || (VF.quests.activeCount() ? 'quests' : 'entries'));
      default: return shell('—');
    }
  }

  /* ---------------------------------------------------------------- shop */

  function buildShop(tab) {
    const d = VF.state.data;
    const p = shell('Shop', 'Everything you will ever need, eventually · paid in Brophys');
    p.appendChild(tabs([
      { id: 'rods', label: 'rods' }, { id: 'bait', label: 'bait' },
      { id: 'charms', label: 'charms' }, { id: 'cases', label: 'cases' }
    ], tab, function (t) { refresh(t); }));
    const b = body();

    if (tab === 'charms') { b.appendChild(charmShop()); p.appendChild(b); return p; }
    if (tab === 'cases') { b.appendChild(caseList()); p.appendChild(b); return p; }

    if (tab === 'rods') {
      const eq = VF.rods.get(d.rod);
      const list = U.el('div', 'list');
      VF.rods.list.forEach(function (rod) {
        const owned = d.ownedRods.indexOf(rod.id) >= 0;
        // earned rods and the wanderer's stock are never on the shelf; they
        // turn up here once they are yours
        if ((rod.quest || rod.merchant || rod.admin) && !owned) return;
        const block = owned ? null : VF.rods.blocked(rod);
        const locked = !!block || (!owned && rod.noShop);
        const can = VF.economy.canAfford(rod.cost);

        const row = U.el('div', 'row row-rod' + (owned ? ' owned' : '') + (locked && !owned ? ' locked' : '') +
                                  (d.rod === rod.id ? ' equipped' : ''));
        const mark = U.el('div', 'row-mark');
        mark.style.background = owned ? 'var(--good)' : (locked ? 'var(--line-2)' : 'var(--accent)');
        row.appendChild(mark);

        const art = U.el('div', 'rod-art-box');
        art.appendChild(rodPreview(rod, VF.rods.index(rod.id), locked && !owned));
        row.appendChild(art);

        const main = U.el('div', 'row-main');
        const name = U.el('div', 'row-name');
        name.appendChild(U.el('span', null, rod.name));
        if (d.rod === rod.id) {
          const t = U.el('span', 'tag', 'equipped'); t.style.color = 'var(--accent)'; name.appendChild(t);
        } else if (owned) {
          const t = U.el('span', 'tag', 'owned'); t.style.color = 'var(--good)'; name.appendChild(t);
        }
        main.appendChild(name);
        // a rod that is never sold has no purchase requirement worth stating —
        // the level it sits at is not what is standing between you and it
        /* A rod that does something no other rod does has to say so on its own
           row rather than leaving it in the prose, because the stat grid below
           has nowhere to put it. */
        if (rod.perk && (!locked || owned)) {
          const pk = U.el('div', 'row-desc', rod.perk);
          pk.style.color = 'var(--good)';
          main.appendChild(pk);
        }
        main.appendChild(U.el('div', 'row-desc', !locked || owned ? rod.desc
          : rod.noShop ? (rod.notForSale || 'Not for sale. Somebody has to give you this one.')
          : block.note));

        // comparison arrows only matter when deciding whether to buy
        const c = owned ? function () { return 0; } : cmp;
        const grid = U.el('div', 'stat-grid');
        grid.appendChild(statCell('Cast', rod.cast.toFixed(2), c(rod.cast, eq.cast)));
        grid.appendChild(statCell('Reel', rod.reel.toFixed(2), c(rod.reel, eq.reel)));
        grid.appendChild(statCell('Line', rod.line.toFixed(2), c(rod.line, eq.line)));
        grid.appendChild(statCell('Rare', '×' + rod.rare.toFixed(2), c(rod.rare, eq.rare)));
        grid.appendChild(statCell('Luck', '+' + rod.luck.toFixed(2), c(rod.luck, eq.luck)));
        main.appendChild(grid);
        const bn = U.el('div', 'row-desc', rodBarNote(rod));
        bn.style.color = 'var(--ink-2)';
        main.appendChild(bn);
        row.appendChild(main);

        const side = U.el('div', 'row-side');
        if (owned) {
          if (d.rod !== rod.id) {
            side.appendChild(equipButton(rod, function () { refresh('rods'); }));
          } else {
            side.appendChild(U.el('div', 'row-price', 'in hand'));
          }
        } else if (rod.noShop) {
          /* the keeper does not stock these and will not be talked into it */
          const n = U.el('div', 'row-price', 'not for sale');
          n.style.color = 'var(--ink-3)';
          side.appendChild(n);
        } else {
          side.appendChild(priceEl(rod.cost, can && !locked));
          const btn = U.el('button', 'btn btn-sm' + (can && !locked ? ' btn-primary' : ''), 'Buy');
          btn.disabled = locked || !can;
          btn.addEventListener('click', function () {
            const r = VF.economy.buyRod(rod.id);
            if (r.ok) {
              VF.audio.buy();
              VF.toast.show('Equipped <strong>' + U.esc(rod.name) + '</strong>', 'good');
              VF.hud.refreshGear(); VF.achievements.check(); refresh('rods');
            } else { VF.audio.error(); }
          });
          side.appendChild(btn);
        }
        row.appendChild(side);
        list.appendChild(row);
      });
      b.appendChild(list);
    } else {
      const list = U.el('div', 'list');
      VF.bait.list.forEach(function (bt) {
        const levelOk = d.level >= bt.level;
        const have = VF.bait.count(bt.id);
        const row = U.el('div', 'row' + (levelOk ? '' : ' locked') + (d.bait === bt.id ? ' equipped' : ''));
        const mark = U.el('div', 'row-mark');
        mark.style.background = bt.color;
        row.appendChild(mark);

        const main = U.el('div', 'row-main');
        const name = U.el('div', 'row-name');
        name.appendChild(U.el('span', null, bt.name));
        if (d.bait === bt.id) { const t = U.el('span', 'tag', 'equipped'); t.style.color = 'var(--accent)'; name.appendChild(t); }
        if (bt.unlimited) { const t = U.el('span', 'tag', 'unlimited'); t.style.color = 'var(--ink-3)'; name.appendChild(t); }
        main.appendChild(name);
        main.appendChild(U.el('div', 'row-desc', levelOk ? bt.desc : 'Requires level ' + bt.level));
        const grid = U.el('div', 'stat-grid');
        grid.appendChild(statCell('Held', have === Infinity ? '∞' : U.commas(have), 0));
        grid.appendChild(statCell('Bite', (bt.bite < 1 ? '' : '+') + Math.round((1 - bt.bite) * 100) + '%', bt.bite < 1 ? 1 : bt.bite > 1 ? -1 : 0));
        grid.appendChild(statCell('Rare', '×' + bt.rare.toFixed(2), bt.rare > 1 ? 1 : 0));
        grid.appendChild(statCell('Luck', '+' + bt.luck.toFixed(2), bt.luck > 0 ? 1 : 0));
        main.appendChild(grid);
        row.appendChild(main);

        const side = U.el('div', 'row-side');
        if (!bt.unlimited) side.appendChild(priceEl(bt.cost, VF.economy.canAfford(bt.cost)));
        const acts = U.el('div', 'row-actions');
        if (!bt.unlimited) {
          [1, 5, 25].forEach(function (n) {
            const btn = U.el('button', 'btn btn-sm', '+' + (bt.pack * n));
            btn.title = 'Buy ' + n + ' pack' + (n > 1 ? 's' : '') + ' — ◈ ' + U.money(bt.cost * n);
            btn.disabled = !levelOk || !VF.economy.canAfford(bt.cost * n);
            btn.addEventListener('click', function () {
              const r = VF.economy.buyBait(bt.id, n);
              if (r.ok) { VF.audio.buy(); VF.hud.refreshGear(); refresh('bait'); }
              else VF.audio.error();
            });
            acts.appendChild(btn);
          });
        }
        if (d.bait !== bt.id && levelOk && (bt.unlimited || have > 0)) {
          const eqb = U.el('button', 'btn btn-sm btn-primary', 'Use');
          eqb.addEventListener('click', function () {
            d.bait = bt.id; VF.audio.click(); VF.bus.emit('bait:changed'); VF.save.save(); refresh('bait');
          });
          acts.appendChild(eqb);
        }
        side.appendChild(acts);
        row.appendChild(side);
        list.appendChild(row);
      });
      b.appendChild(list);
    }
    p.appendChild(b);
    return p;
  }

  function cmp(a, b) { return a > b + 1e-9 ? 1 : a < b - 1e-9 ? -1 : 0; }

  /* What a rod is worth once the fish is on: line strength is what widens the
     white bar, reel force is what steadies it and sharpens how fast it answers
     the key. Same arithmetic as loot.fightParams — stated here so the shop is
     not describing a bonus the fight does not actually give. */
  /* The totals, not the parts: what this rod does to the white bar once its
     line, its reel force and anything it declares for itself are all in. */
  function rodBarNote(rod) {
    /* An admin rod is outside this contract and says so itself. Nothing that
       can be bought is allowed to. */
    if (rod.barNote) return rod.barNote;
    const q = U.clamp((rod.reel - 0.40) / 2.70, 0, VF.loot.Q_MAX);
    const bar = (1 + 0.155 * (Math.log(Math.max(0.25, rod.line)) / Math.LN2)) * (rod.barSize || 1);
    const wider = Math.round((bar - 1) * 100);
    /* It cannot promise more slowing than the fight will actually give, and
       what the fight will actually give is the floor barMul clamps to. */
    const capped = Math.max(VF.loot.SLOW_FLOOR, (1 - 0.20 * q) * (rod.barSpeed || 1));
    const move = Math.round((capped - 1) * 100);
    const sharper = Math.round(60 * q);
    // reel force drives the meter as well as the key, so this carries the same
    // (1 + 0.35q) the fight applies — without it a rod with a stated −3%
    // drawback advertised a penalty while actually reeling a fifth faster
    const fill = Math.round(((1 + 0.35 * q) * (rod.barFill || 1) - 1) * 100);
    if (wider <= 0 && !move && !fill) {
      return 'white bar: the baseline every other rod is measured against';
    }
    const bits = [];
    if (wider > 0) bits.push('white bar +' + wider + '%');
    if (move) bits.push('bar movement ' + (move > 0 ? '+' : '−') + Math.abs(move) + '%');
    if (sharper > 0) bits.push(sharper + '% sharper on the key');
    if (fill) bits.push('progress ' + (fill > 0 ? '+' : '−') + Math.abs(fill) + '%');
    return bits.join(' · ');
  }

  /* What the wanderer is carrying, for as long as he is carrying it. Rows are
     the same shape as the shop's rods, because they are rods — the only real
     difference is that the stock is twenty of a hundred and it goes with him. */
  function buildMerchant() {
    const d = VF.state.data;
    const ms = VF.merchant.leavesIn();
    const mm = Math.floor(ms / 60000), ss = Math.floor((ms % 60000) / 1000);
    const p = shell('The Wanderer', VF.merchant.here()
      ? 'twenty of the hundred, and then he walks on · leaves in ' + mm + ':' + (ss < 10 ? '0' : '') + ss
      : 'he has gone');
    const b = body();

    const stock = VF.merchant.stock();
    if (!stock.length) {
      b.appendChild(U.el('div', 'empty', VF.merchant.here()
        ? 'his case is empty. you have bought everything he was carrying.'
        : 'there is nobody there. he turns up when he turns up.'));
      p.appendChild(b);
      return p;
    }

    b.appendChild(U.el('div', 'merch-intro',
      'he does not haggle and he does not come back for anything he did not sell. ' +
      'the numbers on the right are what the catch bar will actually do.'));

    const list = U.el('div', 'list');
    stock.forEach(function (rod) {
      const owned = d.ownedRods.indexOf(rod.id) >= 0;
      const gone = VF.merchant.sold(rod.id) || owned;
      const can = VF.economy.canAfford(rod.cost);
      const row = U.el('div', 'row row-rod' + (gone ? ' owned' : '') + (!can && !gone ? ' locked' : ''));
      const mark = U.el('div', 'row-mark');
      mark.style.background = VF.rarities.color(rod.rarity);
      row.appendChild(mark);

      const art = U.el('div', 'rod-art-box');
      art.appendChild(rodPreview(rod, VF.rods.index(rod.id), false));
      row.appendChild(art);

      const main = U.el('div', 'row-main');
      const name = U.el('div', 'row-name');
      name.appendChild(U.el('span', null, rod.name));
      const rt = U.el('span', 'tag', VF.rarities.get(rod.rarity).name);
      rt.style.color = VF.rarities.color(rod.rarity);
      name.appendChild(rt);
      if (gone) {
        const t2 = U.el('span', 'tag', owned ? 'yours' : 'sold');
        t2.style.color = 'var(--good)';
        name.appendChild(t2);
      }
      main.appendChild(name);
      main.appendChild(U.el('div', 'row-desc', rod.good + '.'));
      if (rod.bad) {
        const bad = U.el('div', 'row-desc', rod.bad);
        bad.style.color = 'var(--warn)';
        main.appendChild(bad);
      }

      const grid = U.el('div', 'stat-grid');
      grid.appendChild(statCell('Bar', '+' + Math.round((rod.barSize - 1) * 100) + '%', 1));
      const sp = Math.round((rod.barSpeed - 1) * 100);
      grid.appendChild(statCell('Movement', (sp > 0 ? '+' : '') + sp + '%', 0));
      if (rod.barFill && rod.barFill !== 1) {
        grid.appendChild(statCell('Progress', Math.round((rod.barFill - 1) * 100) + '%', -1));
      }
      grid.appendChild(statCell('Line', rod.line.toFixed(2), 0));
      grid.appendChild(statCell('Rare', '×' + rod.rare.toFixed(2), 0));
      main.appendChild(grid);
      row.appendChild(main);

      const side = U.el('div', 'row-side');
      if (gone) {
        const btn = U.el('button', 'btn btn-sm', owned && d.rod !== rod.id ? 'Equip' : 'Equipped');
        btn.disabled = d.rod === rod.id || !owned;
        btn.addEventListener('click', function () {
          d.rod = rod.id; VF.audio.click(); VF.bus.emit('gear:changed');
          VF.save.save(); refresh();
        });
        side.appendChild(btn);
      } else {
        side.appendChild(priceEl(rod.cost, can));
        const btn = U.el('button', 'btn btn-sm' + (can ? ' btn-primary' : ''), 'buy');
        btn.disabled = !can;
        btn.addEventListener('click', function () {
          if (!VF.merchant.buy(rod.id)) { VF.audio.error(); return; }
          VF.audio.buy();
          VF.toast.show('<strong>' + U.esc(rod.name) + '</strong><br><span style="color:var(--ink-3)">' +
            U.esc(rod.good) + '</span>', 'good', 5000);
          refresh();
        });
        side.appendChild(btn);
      }
      row.appendChild(side);
      list.appendChild(row);
    });
    b.appendChild(list);
    p.appendChild(b);
    return p;
  }

  /* --------------------------------------------------------- charms */

  function charmIcon(c, size) {
    const cv = U.el('canvas');
    cv.width = cv.height = size * 2;
    cv.style.width = cv.style.height = size + 'px';
    const g = cv.getContext('2d');
    const col = U.hexToRgb(VF.rarities.color(c.rarity));
    g.translate(size, size);
    const R = size * 0.72;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.6);
    grd.addColorStop(0, U.rgbToCss(col, 0.30));
    grd.addColorStop(1, U.rgbToCss(col, 0));
    g.fillStyle = grd;
    g.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
    g.strokeStyle = U.rgbToCss(col, 0.9);
    g.lineWidth = Math.max(1.4, size * 0.05);
    g.beginPath();
    if (c.kind === 'relic') {
      // relics are drawn as a broken ring, charms as a closed one
      g.arc(0, 0, R * 0.62, 0.5, Math.PI * 1.7);
    } else {
      g.arc(0, 0, R * 0.62, 0, VF.util.TAU);
    }
    g.stroke();
    g.fillStyle = U.rgbToCss(col, 0.55);
    const n = c.kind === 'relic' ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * VF.util.TAU - 0.6;
      g.beginPath();
      g.arc(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, size * 0.07, 0, VF.util.TAU);
      g.fill();
    }
    // charms that carry an emblem wear it in the middle of the ring
    if (c.icon) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = Math.round(size * 0.62) + 'px ' +
               '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.fillText(c.icon, 0, size * 0.03);
    }
    return cv;
  }

  function statLine(c) {
    const parts = [];
    const st = c.stats || {};
    const NAMES = { luck: 'luck', rare: 'rarity', value: 'value', xp: 'xp', bite: 'bite time',
                    reel: 'reel', line: 'line', size: 'size', trait: 'traits',
                    treasure: 'salvage', encounter: 'encounters', secret: 'discovery', 'void': 'the deep',
                    barSize: 'white bar size', barSpeed: 'bar movement' };
    for (const k in st) {
      const v = st[k];
      if (k === 'luck') { parts.push({ t: 'luck +' + v.toFixed(2), good: v > 0 }); continue; }
      // a lower bite figure is faster, so it reads as an improvement
      // bar movement is a preference, not an upgrade — it is left uncoloured
      const better = k === 'barSpeed' ? null : (k === 'bite' ? v < 1 : v > 1);
      const pctv = Math.round(Math.abs(v - 1) * 100);
      parts.push({ t: NAMES[k] + ' ' + (v > 1 ? '+' : '−') + pctv + '%', good: better });
    }
    const row = U.el('div', 'stat-grid');
    parts.forEach(function (p) {
      const cell = U.el('div', 'stat-cell');
      const val = U.el('span', 'v' + (p.good === null ? '' : p.good ? ' up' : ' down'), p.t);
      cell.appendChild(val);
      row.appendChild(cell);
    });
    return row;
  }

  function charmShop() {
    const d = VF.state.data;
    const wrap = U.el('div');

    wrap.appendChild(slotStrip());

    const list = U.el('div', 'list');
    VF.charms.list.forEach(function (c) {
      const own = VF.charms.owned(c.id);
      if (c.found && !own) return;                 // relics are never for sale
      const levelOk = !c.level || d.level >= c.level;
      const can = c.cost ? VF.economy.canAfford(c.cost) : true;
      const row = U.el('div', 'row' + (own ? ' owned' : '') + (levelOk ? '' : ' locked') +
                              (VF.charms.isEquipped(c.id) ? ' equipped' : ''));
      const mark = U.el('div', 'row-mark');
      mark.style.background = VF.rarities.color(c.rarity);
      row.appendChild(mark);

      const iconBox = U.el('div', 'rod-art-box');
      iconBox.style.width = '84px';
      iconBox.style.flex = '0 0 84px';
      iconBox.style.display = 'grid';
      iconBox.style.placeItems = 'center';
      iconBox.appendChild(charmIcon(c, 56));
      row.appendChild(iconBox);
      row.className += ' row-rod';

      const main = U.el('div', 'row-main');
      const name = U.el('div', 'row-name');
      name.appendChild(U.el('span', null, c.name));
      const kt = U.el('span', 'tag', c.kind);
      kt.style.color = VF.rarities.color(c.rarity);
      name.appendChild(kt);
      if (VF.charms.isEquipped(c.id)) {
        const t = U.el('span', 'tag', 'worn'); t.style.color = 'var(--accent)'; name.appendChild(t);
      }
      main.appendChild(name);
      main.appendChild(U.el('div', 'row-desc', levelOk ? c.desc : 'requires level ' + c.level));
      const note = U.el('div', 'row-desc');
      note.style.color = 'var(--ink-2)';
      note.textContent = c.note;
      main.appendChild(note);
      main.appendChild(statLine(c));
      row.appendChild(main);

      const side = U.el('div', 'row-side');
      if (own) {
        const eqd = VF.charms.isEquipped(c.id);
        const btn = U.el('button', 'btn btn-sm' + (eqd ? '' : ' btn-primary'), eqd ? 'take off' : 'wear');
        btn.disabled = !eqd && VF.charms.slotCount() === 0;
        btn.addEventListener('click', function () {
          if (eqd) VF.charms.unequip(d.charmSlots.indexOf(c.id));
          else VF.charms.equip(c.id);
          VF.audio.click(); VF.save.save(); refresh('charms');
        });
        side.appendChild(btn);
      } else {
        side.appendChild(priceEl(c.cost, can && levelOk));
        const btn = U.el('button', 'btn btn-sm' + (can && levelOk ? ' btn-primary' : ''), 'buy');
        btn.disabled = !levelOk || !can;
        btn.addEventListener('click', function () {
          if (!VF.economy.spend(c.cost, 'charm')) { VF.audio.error(); return; }
          VF.charms.grant(c.id);
          if (VF.charms.slotCount() > VF.charms.equipped().length) VF.charms.equip(c.id);
          VF.audio.buy();
          VF.toast.show('<strong>' + U.esc(c.name) + '</strong> — ' + U.esc(c.note), 'good', 4200);
          VF.achievements.check(); VF.save.save(); refresh('charms');
        });
        side.appendChild(btn);
      }
      row.appendChild(side);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  /* The worn row, plus what the loadout currently adds up to. */
  function slotStrip() {
    const d = VF.state.data;
    const wrap = U.el('div');
    const max = VF.charms.slotCount();
    const row = U.el('div', 'slot-row');
    for (let i = 0; i < 5; i++) {
      const id = d.charmSlots[i];
      const c = VF.charms.get(id);
      const el = U.el('div', 'slot' + (i >= max ? ' locked' : c ? ' filled' : ''));
      if (i >= max) {
        const nx = VF.charms.SLOT_LEVELS[i];
        el.appendChild(U.el('div', 'slot-name', 'level ' + nx));
      } else if (c) {
        el.appendChild(charmIcon(c, 38));
        el.appendChild(U.el('div', 'slot-name', c.name));
        el.title = c.note;
        el.addEventListener('click', function () {
          VF.charms.unequip(i); VF.audio.back(); VF.save.save(); refresh(current === 'shop' ? 'charms' : 'charms');
        });
      } else {
        el.appendChild(U.el('div', 'slot-name', 'empty'));
      }
      row.appendChild(el);
    }
    wrap.appendChild(row);

    const bs = VF.build.charmStats();
    const line = U.el('div', 'build-line');
    line.appendChild(U.el('span', 'k', 'charms'));
    const tag = U.el('span', 'v');
    tag.textContent = VF.build.describe();
    line.appendChild(tag);
    const show = [['rarity', bs.rare, false], ['size', bs.size, false], ['traits', bs.trait, false],
                  ['value', bs.value, false], ['bite time', bs.bite, true], ['line', bs.line, false],
                  ['salvage', bs.treasure, false], ['discovery', bs.secret, false],
                  ['white bar', bs.barSize, false], ['bar movement', bs.barSpeed, null]];
    show.forEach(function (row2) {
      const v = row2[1];
      if (Math.abs(v - 1) < 0.02) return;
      const better = row2[2] === null ? null : row2[2] ? v < 1 : v > 1;
      const el = U.el('span', 'v' + (better === null ? '' : better ? ' good' : ' bad'),
        row2[0] + ' ' + (v > 1 ? '+' : '−') + Math.round(Math.abs(v - 1) * 100) + '%');
      line.appendChild(el);
    });
    if (bs.luck > 0.01) line.appendChild(U.el('span', 'v good', 'luck +' + bs.luck.toFixed(2)));
    else if (bs.luck < -0.01) line.appendChild(U.el('span', 'v bad', 'luck ' + bs.luck.toFixed(2)));
    if (line.children.length <= 2) line.appendChild(U.el('span', 'v', 'nothing worn'));
    wrap.appendChild(line);
    return wrap;
  }

  /* ---------------------------------------------------------- cases */

  function caseIcon(c, size) {
    const cv = U.el('canvas', 'case-icon');
    cv.width = cv.height = size * 2;
    cv.style.width = cv.style.height = size + 'px';
    const g = cv.getContext('2d');
    const col = U.hexToRgb(c.color);
    g.translate(size, size);
    const S = size * 0.62;
    const grd = g.createLinearGradient(-S, -S, S, S);
    grd.addColorStop(0, U.rgbToCss(U.shade(col, -0.25)));
    grd.addColorStop(1, U.rgbToCss(U.shade(col, -0.62)));
    g.fillStyle = grd;
    g.fillRect(-S, -S * 0.78, S * 2, S * 1.56);
    g.strokeStyle = U.rgbToCss(col, 0.95);
    g.lineWidth = Math.max(1.4, size * 0.045);
    g.strokeRect(-S, -S * 0.78, S * 2, S * 1.56);
    g.fillStyle = U.rgbToCss(col, 0.85);
    g.fillRect(-S, -S * 0.16, S * 2, S * 0.32);
    g.fillStyle = U.rgbToCss(U.shade(col, 0.5), 0.95);
    g.fillRect(-S * 0.18, -S * 0.34, S * 0.36, S * 0.68);
    return cv;
  }

  function caseList() {
    const d = VF.state.data;
    const wrap = U.el('div');

    if (d.caseTokens > 0) {
      const note = U.el('div', 'relic-note');
      note.appendChild(U.el('span', 'k', 'keys'));
      note.appendChild(U.el('div', null, d.caseTokens + ' spare ' +
        (d.caseTokens === 1 ? 'key' : 'keys') + ' — the next case is free.'));
      wrap.appendChild(note);
    }

    const list = U.el('div', 'list');
    VF.cases.list.forEach(function (c) {
      const levelOk = d.level >= c.level;
      const comp = VF.cases.completion(c.id);
      const check = VF.caseOpen.canBuy(c.id);
      const card = U.el('div', 'case-card' + (levelOk ? '' : ' locked'));
      card.appendChild(caseIcon(c, 62));

      const main = U.el('div');
      main.appendChild(U.el('div', 'case-name', c.name));
      main.appendChild(U.el('div', 'case-blurb', levelOk ? c.blurb : 'requires level ' + c.level));

      const odds = U.el('div', 'odds');
      const eff = VF.cases.effectiveOdds(c);
      ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].forEach(function (r) {
        const pc = eff[r] * 100;
        if (pc <= 0) return;
        const sp = U.el('span', null, VF.rarities.get(r).name + ' ' +
          (pc >= 1 ? pc.toFixed(1) : pc.toFixed(2)) + '%');
        sp.style.color = VF.rarities.color(r);
        odds.appendChild(sp);
      });
      main.appendChild(odds);

      const bar = U.el('div', 'bar-mini');
      const fill = U.el('div');
      fill.style.width = (comp.pct * 100).toFixed(1) + '%';
      fill.style.background = c.color;
      bar.appendChild(fill);
      main.appendChild(bar);
      const cnt = U.el('div', 'case-blurb', 'collection ' + comp.have + ' / ' + comp.total);
      cnt.style.marginTop = '5px';
      main.appendChild(cnt);
      card.appendChild(main);

      const side = U.el('div', 'row-side');
      side.appendChild(priceEl(check.free ? 0 : c.cost, check.ok));
      if (check.free) side.lastChild.textContent = 'free — key';
      const btn = U.el('button', 'btn btn-sm' + (check.ok ? ' btn-primary' : ''), 'open');
      btn.disabled = !check.ok;
      btn.addEventListener('click', function () { openCase(c.id); });
      side.appendChild(btn);
      card.appendChild(side);
      list.appendChild(card);
    });
    wrap.appendChild(list);

    const foot = U.el('div', 'case-blurb');
    foot.style.marginTop = '14px';
    foot.textContent = 'cases contain cosmetics only. nothing inside changes how you fish. ' +
                       'duplicates are refunded.';
    wrap.appendChild(foot);
    return wrap;
  }

  /* -------------------------------------------------------- wardrobe */

  function cosThumb(cos, w, h, t) {
    const cv = U.el('canvas', 'cos-art');
    cv.width = w * 2; cv.height = h * 2;
    const g = cv.getContext('2d');
    g.scale(2, 2);
    VF.cosmeticArt.draw(g, cos, w, h, t || 0);
    return cv;
  }

  function buildWardrobe(tab) {
    const d = VF.state.data;
    const comp = VF.cosmetics.completion();
    const p = shell('Wardrobe', comp.have + ' of ' + comp.total + ' owned · ' +
                    Math.round(comp.pct * 100) + '% complete');
    const items = [{ id: 'all', label: 'all' }].concat(
      VF.cosmetics.slots.map(function (s2) { return { id: s2.id, label: s2.name }; }));
    p.appendChild(tabs(items, tab, function (t) { refresh(t); }));
    const b = body();

    const bar = U.el('div', 'bar-mini');
    const fill = U.el('div');
    fill.style.width = (comp.pct * 100).toFixed(1) + '%';
    bar.appendChild(fill);
    b.appendChild(bar);
    const spacer = U.el('div');
    spacer.style.height = '14px';
    b.appendChild(spacer);

    const list = VF.cosmetics.list.filter(function (c) { return tab === 'all' || c.slot === tab; });
    list.sort(function (a, c) {
      const ra = VF.rarities.rank(a.rarity), rc = VF.rarities.rank(c.rarity);
      if (ra !== rc) return rc - ra;
      return a.name.localeCompare(c.name);
    });

    const grid = U.el('div', 'cos-grid');
    list.forEach(function (c, i) {
      const own = VF.cosmetics.owned(c.id);
      const on = VF.cosmetics.equippedIn(c.slot) === c;
      const cell = U.el('div', 'cos-cell' + (own ? '' : ' locked') + (on ? ' on' : ''));
      const pip = U.el('div', 'cos-pip');
      pip.style.background = VF.rarities.color(c.rarity);
      if (own) pip.style.boxShadow = '0 0 8px ' + U.rgbToCss(U.hexToRgb(VF.rarities.get(c.rarity).glow), 0.7);
      cell.appendChild(pip);

      if (own) {
        cell.appendChild(cosThumb(c, 118, 54, i * 0.6));
        cell.appendChild(U.el('div', 'cos-name', c.name));
      } else {
        const blank = U.el('canvas', 'cos-art');
        blank.width = 236; blank.height = 108;
        const g = blank.getContext('2d');
        g.scale(2, 2);
        g.globalAlpha = 0.16;
        VF.cosmeticArt.draw(g, c, 118, 54, 0);
        cell.appendChild(blank);
        cell.appendChild(U.el('div', 'cos-name', '?????'));
      }
      cell.appendChild(U.el('div', 'cos-slot',
        (VF.cosmetics.slots.filter(function (s2) { return s2.id === c.slot; })[0] || {}).name || c.slot));

      if (own) {
        cell.addEventListener('click', function () {
          if (on) VF.cosmetics.unequip(c.slot);
          else VF.cosmetics.equip(c.id);
          VF.audio.click(); VF.save.save(); refresh(tab);
        });
      }
      grid.appendChild(cell);
    });
    b.appendChild(grid);
    p.appendChild(b);
    return p;
  }

  /* --------------------------------------------------- journal + people */

  function buildJournal(tab) {
    const d = VF.state.data;
    const p = shell('Journal', d.journal.length + ' entries · ' +
                    Object.keys(d.secrets).length + ' hidden places found');
    const qn = VF.quests.activeCount();
    p.appendChild(tabs([
      { id: 'quests', label: 'quests' + (qn ? ' ' + qn : '') },
      { id: 'entries', label: 'entries' },
      { id: 'people', label: 'people' + (VF.npcs.anyNew() ? ' •' : '') },
      { id: 'records', label: 'records' }
    ], tab, function (t) { refresh(t); }));
    const b = body();

    if (tab === 'quests') {
      const open = VF.quests.visible();
      /* Threads that have not opened, and what each is waiting for. Without
         this a quest becomes available in silence and the only way to find out
         is to go round talking to everybody again on the off chance. */
      const soon = VF.quests.locked();
      if (!open.length && !soon.length) {
        b.appendChild(U.el('div', 'empty',
          'nothing is asking anything of you yet. keep fishing, and talk to people.'));
      } else {
        open.forEach(function (v) { b.appendChild(questCard(v)); });
        if (soon.length) {
          const h = U.el('div', 'quest-sep', open.length ? 'not yet' : 'somebody has something to say');
          b.appendChild(h);
          soon.forEach(function (l) { b.appendChild(lockedCard(l)); });
        }
      }
    } else if (tab === 'entries') {
      if (!d.journal.length) {
        b.appendChild(U.el('div', 'empty', 'nothing written down yet. keep fishing.'));
      } else {
        d.journal.slice().reverse().forEach(function (e) {
          const el = U.el('div', 'entry' + (e.hint ? ' hint' : ''));
          const head = U.el('div');
          head.appendChild(U.el('span', 'entry-title', e.title));
          head.appendChild(U.el('span', 'entry-kind', e.kind));
          el.appendChild(head);
          el.appendChild(U.el('div', 'entry-text', e.text));
          b.appendChild(el);
        });
      }
    } else if (tab === 'people') {
      VF.npcs.list.forEach(function (n) {
        const known = VF.npcs.unlocked(n.id);
        const el = U.el('div', 'npc-row' + (known ? '' : ' locked'));
        const mark = U.el('div', 'npc-mark');
        mark.style.background = known ? n.color : 'var(--line-2)';
        el.appendChild(mark);
        const main = U.el('div');
        const nm = U.el('div', 'npc-name', known ? n.name : '?????');
        main.appendChild(nm);
        main.appendChild(U.el('div', 'npc-where', known ? n.where : 'you have not run into them yet'));
        if (known) main.appendChild(U.el('div', 'npc-blurb', n.blurb));
        el.appendChild(main);
        const side = U.el('div', 'row-side');
        if (known) {
          if (VF.npcs.hasNew(n.id)) side.appendChild(U.el('div', 'npc-new', 'has something to say'));
          const btn = U.el('button', 'btn btn-sm' + (VF.npcs.hasNew(n.id) ? ' btn-primary' : ''),
                           'go and see them');
          btn.addEventListener('click', function () { speak(n.id); });
          side.appendChild(btn);
        }
        el.appendChild(side);
        b.appendChild(el);
      });
    } else {
      const R = d.records;
      const grid = U.el('div', 'stats-grid');
      function nameOf(id, traits) {
        const f = VF.fish.byId(id);
        if (!f) return '—';
        return VF.traits.title(traits, f.name);
      }
      const tiles = [
        ['biggest fish', R.biggestKg ? U.weight(R.biggestKg) : '—', nameOf(R.biggestId, R.biggestTraits)],
        ['most valuable', R.richest ? '◈ ' + U.money(R.richest) : '—', nameOf(R.richestId, R.richestTraits)],
        ['rarest combination', R.bestComboTraits && R.bestComboTraits.length
          ? R.bestComboTraits.length + ' traits' : '—', nameOf(R.bestComboId, R.bestComboTraits)],
        ['longest specimen', R.longestSpecies ? U.length(R.longestSpecies) : '—', nameOf(R.longestId)],
        ['longest streak', U.commas(R.bestStreak), 'landed without a loss'],
        ['current streak', U.commas(d.streak), d.streak ? 'still going' : 'start again']
      ];
      tiles.forEach(function (t) {
        const tile = U.el('div', 'stat-tile');
        tile.appendChild(U.el('span', 'k', t[0]));
        tile.appendChild(U.el('div', 'v', t[1]));
        if (t[2]) tile.appendChild(U.el('div', 'sub', t[2]));
        grid.appendChild(tile);
      });
      b.appendChild(grid);

      const th = U.el('div');
      th.style.marginTop = '18px';
      th.appendChild(U.el('span', 'k', 'traits recorded'));
      const tg = U.el('div', 'cos-grid');
      tg.style.marginTop = '10px';
      VF.traits.list.forEach(function (tr) {
        const n = d.traitsSeen[tr.id] | 0;
        const cell = U.el('div', 'cos-cell' + (n ? '' : ' locked'));
        cell.style.cursor = 'default';
        const pip = U.el('div', 'cos-pip');
        pip.style.background = tr.color;
        cell.appendChild(pip);
        const nm = U.el('div', 'cos-name', n ? tr.name : '?????');
        nm.style.marginTop = '2px';
        cell.appendChild(nm);
        cell.appendChild(U.el('div', 'cos-slot', n ? '×' + U.commas(n) + ' · value ×' + tr.mult : 'not yet'));
        if (n) cell.title = tr.desc;
        tg.appendChild(cell);
      });
      th.appendChild(tg);
      b.appendChild(th);
    }
    p.appendChild(b);
    return p;
  }

  /* A thread that has not opened: who is carrying it, what it is about, and
     the list of what is still missing with how far along each one is. The list
     is the quest's own — the same one the engine tests — so it cannot say one
     thing and require another. */
  function lockedCard(l) {
    const def = l.def;
    const card = U.el('div', 'quest locked' + (l.ready ? ' ready' : ''));

    const head = U.el('div', 'quest-head');
    head.appendChild(U.el('span', 'quest-name', l.ready ? def.name : '?????'));
    if (def.difficulty) {
      const t = U.el('span', 'quest-tag', def.difficulty);
      t.style.color = 'var(--ink-4)';
      head.appendChild(t);
    }
    head.appendChild(U.el('span', 'quest-of',
      l.ready ? 'go and see ' + VF.npcs.name(def.giver).toLowerCase()
              : VF.npcs.name(def.giver).toLowerCase()));
    card.appendChild(head);
    card.appendChild(U.el('div', 'quest-blurb', l.ready ? def.blurb : (def.rumour || def.blurb)));

    if (l.ready) {
      card.appendChild(U.el('div', 'quest-where',
        VF.npcs.name(def.giver).toLowerCase() + ' is waiting to say it'));
      return card;
    }

    const list = U.el('div', 'quest-check');
    l.needs.forEach(function (n) {
      const row = U.el('div', 'quest-need' + (n.done ? ' done' : ''));
      row.appendChild(U.el('span', 'quest-box', n.done ? '✓' : ''));
      const main = U.el('div');
      main.appendChild(U.el('span', null, n.label));
      if (n.note) main.appendChild(U.el('div', 'quest-need-note', n.note));
      row.appendChild(main);
      if (n.need > 1) {
        row.appendChild(U.el('span', 'quest-need-at',
          U.commas(Math.min(n.have, n.need)) + ' / ' + U.commas(n.need)));
      }
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  /* One quest, and where in it the player currently is. Everything drawn here
     comes off the quest definition, so a second quest needs no new UI. */
  function questCard(v) {
    const def = v.def, q = v.q;
    const card = U.el('div', 'quest' + (v.done ? ' done' : '') + (def.id === 'heavens' ? ' gold' : ''));

    const head = U.el('div', 'quest-head');
    head.appendChild(U.el('span', 'quest-name', def.name));
    if (def.difficulty) {
      const t = U.el('span', 'quest-tag', def.difficulty);
      t.style.color = v.done ? 'var(--good)' : '#ffd88a';
      head.appendChild(t);
    }
    head.appendChild(U.el('span', 'quest-of', v.done ? 'complete'
      : 'chapter ' + (q.step + 1) + ' / ' + def.chapters.length));
    card.appendChild(head);
    card.appendChild(U.el('div', 'quest-blurb', def.blurb));

    if (v.done) {
      card.appendChild(U.el('div', 'quest-done-line', 'finished. it is in the journal.'));
      return card;
    }

    const o = VF.quests.objective(def.id);
    if (!o) return card;

    const ch = U.el('div', 'quest-ch');
    ch.appendChild(U.el('div', 'quest-ch-name', o.chapter.name));
    if (o.text) ch.appendChild(U.el('div', 'quest-text', o.text));
    ch.appendChild(U.el('div', 'quest-task', o.task));
    if (o.talk) {
      const who = VF.npcs.name(o.talk);
      const ready = VF.npcs.hasNew(o.talk);
      ch.appendChild(U.el('div', 'quest-where',
        ready ? who.toLowerCase() + ' is waiting to say it' : 'you need ' + who.toLowerCase() + ' first'));
    } else if (o.where) {
      ch.appendChild(U.el('div', 'quest-where', o.where));
    }

    if (o.goal) {
      const tr = U.el('div', 'quest-track');
      const fl = U.el('div', 'quest-fill');
      fl.style.width = Math.round(U.clamp(o.goal.have / Math.max(1, o.goal.need), 0, 1) * 100) + '%';
      tr.appendChild(fl);
      ch.appendChild(tr);
      ch.appendChild(U.el('div', 'quest-count', o.goal.have + ' / ' + o.goal.need + ' ' + o.goal.unit));
    }

    if (o.checklist && o.checklist.length) {
      const list = U.el('div', 'quest-list');
      o.checklist.forEach(function (it) {
        const row = U.el('div', 'quest-item' + (it.done ? ' on' : ''));
        row.appendChild(U.el('span', 'tick', it.done ? '\u2713' : '\u25cb'));
        row.appendChild(U.el('span', 'who', it.label));
        row.appendChild(U.el('span', 'want', it.done ? 'given' : it.task));
        list.appendChild(row);
      });
      ch.appendChild(list);
    }

    card.appendChild(ch);
    return card;
  }

  /* Talking is not a card any more — the panel closes and the two of you go
     and have the conversation out on the shore where it can be seen. */
  function speak(id) {
    if (!VF.visit.canVisit()) {
      VF.toast.show('reel in before you walk off', null, 2600);
      return;
    }
    close();
    // let the panel finish getting out of the way first
    setTimeout(function () { VF.visit.start(id); }, 190);
  }

  /* ------------------------------------------------------------- fishdex */

  /* Which waters the index can talk about: the ones the player has been to.
     A spot they have not found is not a gap in their record, it is a place
     that does not exist yet. */
  function dexWaters() {
    return VF.locations.list.filter(function (l) {
      return VF.state.data.seenLocations.indexOf(l.id) >= 0 ||
             VF.locations.isUnlocked(l.id);
    });
  }

  /* One water: what lives in it, what comes up out of it, and how much of both
     is in the record. The index is built around this now — a spot's roster is
     its own, and seeing them side by side is the point of having eight of them. */
  function waterCard(loc) {
    const d = VF.state.data;
    const here = d.location === loc.id;
    const fish = VF.fish.nativeTo(loc.id).filter(function (f) { return !f.hidden || d.fishdex[f.id]; });
    const home = fish.filter(function (f) { return f.locs[0] === loc.id; });
    const got = fish.filter(function (f) { return !!d.fishdex[f.id]; }).length;
    const objs = VF.treasureData.nativeTo(loc.id);
    const sig = objs.filter(function (t) { return t.locs && t.locs.length === 1; });
    const gotObj = objs.filter(function (t) { return (d.treasures[t.id] | 0) > 0; }).length;

    const card = U.el('div', 'water' + (here ? ' here' : ''));
    const head = U.el('div', 'water-head');
    const mark = U.el('div', 'water-mark');
    mark.style.background = loc.glow;
    head.appendChild(mark);
    const nm = U.el('div');
    const line = U.el('div', 'water-name');
    line.appendChild(U.el('span', null, loc.name));
    if (here) {
      const t = U.el('span', 'tag', 'here');
      t.style.color = 'var(--accent)';
      line.appendChild(t);
    }
    nm.appendChild(line);
    nm.appendChild(U.el('div', 'water-tag', loc.tag));
    head.appendChild(nm);
    head.appendChild(U.el('div', 'water-of', got + ' / ' + fish.length));
    card.appendChild(head);

    const track = U.el('div', 'water-track');
    const fill = U.el('div', 'water-fill');
    fill.style.width = (fish.length ? got / fish.length * 100 : 0).toFixed(1) + '%';
    fill.style.background = 'linear-gradient(90deg, ' +
      U.rgbToCss(U.shade(U.hexToRgb(loc.glow), -0.45)) + ', ' + loc.glow + ')';
    track.appendChild(fill);
    card.appendChild(track);

    /* The tier mix, which is most of what makes one water not another. */
    const pips = U.el('div', 'water-tiers');
    VF.rarities.visible().forEach(function (r) {
      const n = fish.filter(function (f) { return f.rarity === r.id; }).length;
      if (!n) return;
      const pip = U.el('span', 'water-tier');
      const dot = U.el('span', 'water-dot');
      dot.style.background = r.color;
      dot.style.boxShadow = '0 0 6px ' + U.rgbToCss(U.hexToRgb(r.glow), 0.6);
      pip.appendChild(dot);
      pip.appendChild(U.el('span', null, String(n)));
      pip.title = n + ' ' + r.name.toLowerCase();
      pips.appendChild(pip);
    });
    card.appendChild(pips);

    const foot = U.el('div', 'water-foot');
    foot.appendChild(U.el('span', null, home.length + ' live only here'));
    foot.appendChild(U.el('span', null, gotObj + ' / ' + objs.length + ' objects'));
    if (sig.length) {
      const s1 = sig[0];
      const has = (d.treasures[s1.id] | 0) > 0;
      const el = U.el('span', 'water-sig');
      el.appendChild(U.el('span', 'water-sig-k', 'only here'));
      const v = U.el('span', null, has ? s1.name : '?????');
      v.style.color = has ? s1.color : 'var(--ink-4)';
      el.appendChild(v);
      el.title = has ? s1.desc : 'one object comes up here and nowhere else';
      foot.appendChild(el);
    }
    card.appendChild(foot);

    const go = U.el('button', 'btn btn-sm', here ? 'Show its species' : 'Show its species');
    go.addEventListener('click', function () {
      dexTab = 'species'; dexLoc = loc.id; dexFilter = 'all';
      VF.audio.click(); refresh();
    });
    card.appendChild(go);
    return card;
  }

  function buildDex() {
    const d = VF.state.data;
    /* Species in a hidden tier are not in the total, not in the filter row and
       not in the grid until one has been caught — so the record never shows a
       gap the player has no way to explain. */
    const shown = VF.fish.knownList();
    const found = shown.filter(function (f) { return !!d.fishdex[f.id]; }).length;
    const p = shell('Fishdex', found + ' of ' + shown.length + ' species recorded');

    p.appendChild(tabs([
      { id: 'waters', label: 'waters' },
      { id: 'species', label: 'species' }
    ], dexTab, function (t) { dexTab = t; refresh(); }));

    const b = body();

    if (dexTab === 'waters') {
      const grid = U.el('div', 'water-grid');
      dexWaters().forEach(function (l) { grid.appendChild(waterCard(l)); });
      b.appendChild(grid);
      /* And the ones that are not from anywhere, which is its own fact about
         them rather than a hole in the record. */
      const odd = VF.fish.unplaced().filter(function (f) { return !f.hidden || d.fishdex[f.id]; });
      const oddGot = odd.filter(function (f) { return !!d.fishdex[f.id]; }).length;
      const note = U.el('div', 'water-odd');
      note.appendChild(U.el('div', 'water-odd-k', 'from no particular water'));
      note.appendChild(U.el('div', 'water-odd-v', oddGot + ' / ' + odd.length +
        ' — the wrong ones, and whatever a falling sky brings'));
      const oddGo = U.el('button', 'btn btn-sm', 'Show them');
      oddGo.addEventListener('click', function () {
        dexTab = 'species'; dexLoc = 'none'; dexFilter = 'all';
        VF.audio.click(); refresh();
      });
      note.appendChild(oddGo);
      b.appendChild(note);
      p.appendChild(b);
      return p;
    }

    const bar = U.el('div', 'dex-toolbar');

    /* Which water's roster is on screen. This is the spine of the index now:
       a spot's species are its own, and browsing all four hundred at once was
       the only way to look at them. */
    const segL = U.el('div', 'seg');
    [{ id: 'all', label: 'Everywhere' }].concat(dexWaters().map(function (l) {
      return { id: l.id, label: l.name.replace(/^The /, '') };
    })).concat([{ id: 'none', label: 'Nowhere' }]).forEach(function (o) {
      const btn = U.el('button', dexLoc === o.id ? 'active' : '', o.label);
      btn.addEventListener('click', function () { dexLoc = o.id; VF.audio.click(); refresh(); });
      segL.appendChild(btn);
    });
    bar.appendChild(segL);
    const segR = U.el('div', 'seg');
    [{ id: 'all', label: 'All' }].concat(VF.rarities.visible().map(function (r) {
      return { id: r.id, label: r.name };
    })).forEach(function (o) {
      const btn = U.el('button', dexFilter === o.id ? 'active' : '', o.label);
      if (o.id !== 'all') {
        const col = VF.rarities.color(o.id);
        btn.style.color = dexFilter === o.id ? col : '';
        const dot = U.el('span');
        dot.style.cssText = 'display:inline-block;width:5px;height:5px;border-radius:50%;' +
          'margin-right:6px;vertical-align:middle;background:' + col +
          ';box-shadow:0 0 6px ' + U.rgbToCss(U.hexToRgb(VF.rarities.get(o.id).glow), 0.6);
        btn.insertBefore(dot, btn.firstChild);
      }
      btn.addEventListener('click', function () { dexFilter = o.id; VF.audio.click(); refresh(); });
      segR.appendChild(btn);
    });
    bar.appendChild(segR);

    const segM = U.el('div', 'seg');
    [{ id: 'all', label: 'Every' }, { id: 'found', label: 'Found' }, { id: 'missing', label: 'Missing' }].forEach(function (o) {
      const btn = U.el('button', dexMode === o.id ? 'active' : '', o.label);
      btn.addEventListener('click', function () { dexMode = o.id; VF.audio.click(); refresh(); });
      segM.appendChild(btn);
    });
    bar.appendChild(segM);
    b.appendChild(bar);

    const list = shown.filter(function (f) {
      if (dexLoc === 'none' && f.locs.length) return false;
      if (dexLoc !== 'all' && dexLoc !== 'none' && f.locs.indexOf(dexLoc) < 0) return false;
      if (dexFilter !== 'all' && f.rarity !== dexFilter) return false;
      const has = !!d.fishdex[f.id];
      if (dexMode === 'found' && !has) return false;
      if (dexMode === 'missing' && has) return false;
      return true;
    });
    /* Home water first, so a spot's own species lead and the ones that merely
       range in from next door follow. */
    if (dexLoc !== 'all' && dexLoc !== 'none') {
      list.sort(function (a, b) {
        return (a.locs[0] === dexLoc ? 0 : 1) - (b.locs[0] === dexLoc ? 0 : 1);
      });
    }

    const cnt = U.el('div', 'dex-count', list.length + ' shown');
    bar.appendChild(cnt);

    if (!list.length) { b.appendChild(U.el('div', 'empty', 'Nothing here yet.')); p.appendChild(b); return p; }

    const grid = U.el('div', 'dex-grid');
    list.forEach(function (f, i) {
      const entry = d.fishdex[f.id];
      const has = !!entry;
      const cell = U.el('div', 'dex-cell' + (has ? '' : ' undiscovered'));
      const r = VF.rarities.get(f.rarity);

      const idx = U.el('div', 'dex-n', '#' + String(VF.fish.list.indexOf(f) + 1).padStart(2, '0'));
      cell.appendChild(idx);
      const pip = U.el('div', 'dex-pip');
      pip.style.background = has ? r.color : 'var(--line-2)';
      if (has) pip.style.boxShadow = '0 0 8px ' + U.rgbToCss(U.hexToRgb(r.glow), 0.7);
      cell.appendChild(pip);

      const cv = U.el('canvas', 'dex-art');
      cv.width = 240; cv.height = 132;
      const g = cv.getContext('2d');
      g.save(); g.translate(120, 66);
      const sz = VF.fishArt.fitSize(f, 118);
      if (has) VF.fishArt.draw(g, f, sz, { time: i * 0.7 });
      else { g.globalAlpha = 0.34; VF.fishArt.drawSilhouette(g, f, sz, 0.85); }
      g.restore();
      cell.appendChild(cv);

      cell.appendChild(U.el('div', 'dex-name', has ? f.name : '?????'));
      const nTraits = has ? Object.keys(entry.traits || {}).length : 0;
      cell.appendChild(U.el('div', 'dex-rec', has
        ? (entry.record ? U.weight(entry.record.kg) + ' · ×' + entry.caught +
            (nTraits ? ' · ' + nTraits + 't' : '') : '×' + entry.caught)
        : r.name));

      if (has) {
        cell.addEventListener('click', function () { VF.audio.click(); showDexDetail(f, entry); });
      }
      grid.appendChild(cell);
    });
    b.appendChild(grid);
    p.appendChild(b);
    return p;
  }

  function showDexDetail(f, entry) {
    const r = VF.rarities.get(f.rarity);
    const card = U.el('div', 'catch-card');
    const ban = U.el('div', 'catch-banner', r.name);
    ban.style.background = r.color;
    card.appendChild(ban);

    const hero = U.el('div', 'catch-hero');
    hero.style.background = 'radial-gradient(ellipse at 50% 55%, ' + U.rgbToCss(U.hexToRgb(r.glow), 0.14) + ', rgba(0,0,0,0) 68%)';
    const cv = U.el('canvas');
    cv.width = 400; cv.height = 168;
    cv.style.width = '100%'; cv.style.height = '168px';
    const g = cv.getContext('2d');
    g.save(); g.translate(200, 84);
    // objects are boxier than any fish, so the hero has to be fitted, not fixed
    VF.fishArt.draw(g, f, Math.min(62, VF.fishArt.fitSize(f, cv.height)),
                    { time: 1.2, mutation: entry.record ? entry.record.mutation : null });
    g.restore();
    hero.appendChild(cv);
    card.appendChild(hero);

    const bd = U.el('div', 'catch-body');
    bd.appendChild(U.el('h2', 'catch-name', f.name));
    bd.appendChild(U.el('p', 'catch-desc', f.desc));

    const m = U.el('div', 'catch-metrics');
    m.appendChild(metricEl('Record', entry.record ? U.weight(entry.record.kg) : '—'));
    m.appendChild(metricEl('Caught', U.commas(entry.caught)));
    m.appendChild(metricEl('Base value', '◈ ' + U.money(f.value)));
    bd.appendChild(m);

    const where = f.locs.length ? f.locs.map(function (l) { return VF.locations.get(l).name; }).join(' · ') : 'anywhere at all';
    const baits = f.baits.length ? f.baits.map(function (x) { return VF.bait.get(x).name; }).join(', ') : 'anything';
    const meta = U.el('div');
    meta.style.cssText = 'font-size:11.5px;line-height:1.7;color:var(--ink-3);margin-bottom:14px';
    meta.appendChild(kv('Found at', where));
    meta.appendChild(kv('Prefers', baits));
    if (f.time.length) meta.appendChild(kv('Active', f.time.join(', ')));
    if (f.weather.length) meta.appendChild(kv('Weather', f.weather.map(function (w) { return VF.weatherData.get(w).name; }).join(', ')));
    bd.appendChild(meta);

    /* every trait, with the ones seen on this species filled in */
    const tw = U.el('div');
    tw.appendChild(U.el('span', 'k', 'traits recorded on this species'));
    const trow = U.el('div', 'trait-row');
    trow.style.marginTop = '8px';
    const seen = entry.traits || {};
    VF.traits.list.forEach(function (tr) {
      const n = seen[tr.id] | 0;
      const chip = U.el('span', 'trait-chip', n ? tr.name + ' ×' + n : '?????');
      chip.style.color = n ? tr.color : 'var(--ink-4)';
      chip.style.borderColor = n ? U.rgbToCss(U.hexToRgb(tr.color), 0.42) : 'var(--line)';
      if (n) chip.title = tr.desc;
      trow.appendChild(chip);
    });
    tw.appendChild(trow);
    bd.appendChild(tw);

    const acts = U.el('div', 'catch-actions');
    acts.style.gridTemplateColumns = '1fr';
    const back = U.el('button', 'btn btn-primary', 'Back');
    back.addEventListener('click', function () { VF.audio.back(); refresh(); });
    acts.appendChild(back);
    bd.appendChild(acts);
    card.appendChild(bd);

    const prev = node;
    node = card;
    if (prev && prev.parentNode) prev.parentNode.replaceChild(card, prev);
  }

  function metricEl(k, v) {
    const el = U.el('div', 'metric');
    el.appendChild(U.el('span', 'k', k));
    el.appendChild(U.el('span', 'v', v));
    return el;
  }
  function kv(k, v) {
    const row = U.el('div');
    const kk = U.el('span', 'k', k + ' ');
    kk.style.marginRight = '6px';
    row.appendChild(kk);
    row.appendChild(document.createTextNode(v));
    return row;
  }

  /* ----------------------------------------------------------------- bag */

  function buildBag(tab) {
    const d = VF.state.data;
    const p = shell('Bag', 'What you are carrying');
    p.appendChild(tabs([
      { id: 'catches', label: 'catches (' + d.kept.length + ')' },
      { id: 'rods', label: 'rods' },
      { id: 'bait', label: 'bait' },
      { id: 'charms', label: 'charms' },
      { id: 'salvage', label: 'salvage' }
    ], tab, function (t) { refresh(t); }));
    const b = body();

    if (tab === 'charms') {
      b.appendChild(slotStrip());
      const owned = d.charms.map(function (id) { return VF.charms.get(id); }).filter(Boolean);
      if (!owned.length) {
        b.appendChild(U.el('div', 'empty', 'no charms yet. the shop sells some; the water gives up the rest.'));
      } else {
        const list = U.el('div', 'list');
        owned.forEach(function (c) {
          const eqd = VF.charms.isEquipped(c.id);
          const row = U.el('div', 'row row-rod' + (eqd ? ' equipped' : ' owned'));
          const mark = U.el('div', 'row-mark');
          mark.style.background = VF.rarities.color(c.rarity);
          row.appendChild(mark);
          const iconBox = U.el('div', 'rod-art-box');
          iconBox.style.cssText = 'width:84px;flex:0 0 84px;display:grid;place-items:center';
          iconBox.appendChild(charmIcon(c, 56));
          row.appendChild(iconBox);
          const main = U.el('div', 'row-main');
          const nm = U.el('div', 'row-name');
          nm.appendChild(U.el('span', null, c.name));
          const kt = U.el('span', 'tag', c.kind);
          kt.style.color = VF.rarities.color(c.rarity);
          nm.appendChild(kt);
          main.appendChild(nm);
          main.appendChild(U.el('div', 'row-desc', c.desc));
          const note = U.el('div', 'row-desc');
          note.style.color = 'var(--ink-2)';
          note.textContent = c.note;
          main.appendChild(note);
          main.appendChild(statLine(c));
          row.appendChild(main);
          const side = U.el('div', 'row-side');
          const btn = U.el('button', 'btn btn-sm' + (eqd ? '' : ' btn-primary'), eqd ? 'take off' : 'wear');
          btn.addEventListener('click', function () {
            if (eqd) VF.charms.unequip(d.charmSlots.indexOf(c.id));
            else VF.charms.equip(c.id);
            VF.audio.click(); VF.save.save(); refresh('charms');
          });
          side.appendChild(btn);
          row.appendChild(side);
          list.appendChild(row);
        });
        b.appendChild(list);
      }
    } else if (tab === 'salvage') {
      const ids = Object.keys(d.treasures);
      if (!ids.length) {
        b.appendChild(U.el('div', 'empty', 'nothing but fish so far.'));
      } else {
        const grid = U.el('div', 'cos-grid');
        VF.treasureData.list.forEach(function (t) {
          const n = d.treasures[t.id] | 0;
          const cell = U.el('div', 'cos-cell' + (n ? '' : ' locked'));
          cell.style.cursor = 'default';
          const pip = U.el('div', 'cos-pip');
          pip.style.background = VF.rarities.color(t.rarity);
          cell.appendChild(pip);
          const cv = U.el('canvas', 'cos-art');
          cv.width = 236; cv.height = 108;
          const g = cv.getContext('2d');
          g.scale(2, 2); g.translate(59, 27);
          if (!n) g.globalAlpha = 0.18;
          VF.treasureArt.draw(g, t, 22, 1.1);
          cell.appendChild(cv);
          cell.appendChild(U.el('div', 'cos-name', n ? t.name : '?????'));
          cell.appendChild(U.el('div', 'cos-slot', n ? '×' + n : VF.rarities.get(t.rarity).name));
          if (n) cell.title = t.desc;
          grid.appendChild(cell);
        });
        b.appendChild(grid);
      }
    } else if (tab === 'catches') {
      if (!d.kept.length) {
        b.appendChild(U.el('div', 'empty', 'Nothing kept. Choose "Keep" on a catch to store it here.'));
      } else {
        let total = 0;
        d.kept.forEach(function (k) { total += k.value; });
        const bar = U.el('div', 'dex-toolbar');
        const sellAll = U.el('button', 'btn btn-sm btn-primary', 'Sell everything · ◈ ' + U.money(total));
        sellAll.addEventListener('click', function () {
          const got = VF.catches.sellAllKept();
          if (got) VF.toast.show('Sold everything for <strong class="mono">' + U.money(got) + '</strong>', 'good');
          refresh('catches');
        });
        bar.appendChild(sellAll);
        b.appendChild(bar);

        const list = U.el('div', 'list');
        d.kept.slice().reverse().forEach(function (k, ri) {
          const idx = d.kept.length - 1 - ri;
          const f = VF.fish.byId(k.id);
          if (!f) return;
          const r = VF.rarities.get(f.rarity);
          const kTraits = k.traits || (k.mutation ? [k.mutation] : []);
          const row = U.el('div', 'row');
          const mark = U.el('div', 'row-mark');
          mark.style.background = r.color;
          row.appendChild(mark);
          const main = U.el('div', 'row-main');
          const name = U.el('div', 'row-name');
          name.appendChild(U.el('span', null, VF.traits.title(kTraits, f.name)));
          const tg = U.el('span', 'tag', r.name); tg.style.color = r.color; name.appendChild(tg);
          kTraits.forEach(function (tid) {
            const tr = VF.traits.get(tid);
            if (!tr) return;
            const mt = U.el('span', 'tag', tr.name);
            mt.style.color = tr.color;
            name.appendChild(mt);
          });
          main.appendChild(name);
          main.appendChild(U.el('div', 'row-desc',
            U.weight(k.kg) + ' · ' + U.length(k.m) + ' · ' + U.ordinalPercentile(k.pct) +
            ' · from ' + VF.locations.get(k.location).name));
          row.appendChild(main);
          const side = U.el('div', 'row-side');
          side.appendChild(priceEl(k.value, true));
          const btn = U.el('button', 'btn btn-sm', 'Sell');
          btn.addEventListener('click', function () {
            const got = VF.catches.sellKept(idx);
            if (got) VF.toast.show('Sold for <strong class="mono">' + U.money(got) + '</strong>', 'good', 2200);
            refresh('catches');
          });
          side.appendChild(btn);
          row.appendChild(side);
          list.appendChild(row);
        });
        b.appendChild(list);
      }
    } else if (tab === 'rods') {
      const list = U.el('div', 'list');
      d.ownedRods.map(function (id) { return VF.rods.get(id); })
        .sort(function (a, c) { return VF.rods.index(a.id) - VF.rods.index(c.id); })
        .forEach(function (rod) {
          const row = U.el('div', 'row row-rod' + (d.rod === rod.id ? ' equipped' : ' owned'));
          const mark = U.el('div', 'row-mark');
          mark.style.background = rod.art.tip;
          row.appendChild(mark);
          const artBox = U.el('div', 'rod-art-box');
          artBox.appendChild(rodPreview(rod, VF.rods.index(rod.id), false));
          row.appendChild(artBox);
          const main = U.el('div', 'row-main');
          const name = U.el('div', 'row-name');
          name.appendChild(U.el('span', null, rod.name));
          if (d.rod === rod.id) { const t = U.el('span', 'tag', 'equipped'); t.style.color = 'var(--accent)'; name.appendChild(t); }
          main.appendChild(name);
          main.appendChild(U.el('div', 'row-desc', rod.desc));
          const grid = U.el('div', 'stat-grid');
          grid.appendChild(statCell('Cast', rod.cast.toFixed(2), 0));
          grid.appendChild(statCell('Reel', rod.reel.toFixed(2), 0));
          grid.appendChild(statCell('Line', rod.line.toFixed(2), 0));
          grid.appendChild(statCell('Rare', '×' + rod.rare.toFixed(2), 0));
          grid.appendChild(statCell('Luck', '+' + rod.luck.toFixed(2), 0));
          main.appendChild(grid);
          row.appendChild(main);
          const side = U.el('div', 'row-side');
          if (d.rod !== rod.id) {
            side.appendChild(equipButton(rod, function () { refresh('rods'); }, ' btn-primary'));
          }
          row.appendChild(side);
          list.appendChild(row);
        });
      b.appendChild(list);
    } else {
      const list = U.el('div', 'list');
      VF.bait.list.forEach(function (bt) {
        const have = VF.bait.count(bt.id);
        if (!bt.unlimited && have <= 0) return;
        const row = U.el('div', 'row' + (d.bait === bt.id ? ' equipped' : ''));
        const mark = U.el('div', 'row-mark');
        mark.style.background = bt.color;
        row.appendChild(mark);
        const main = U.el('div', 'row-main');
        const name = U.el('div', 'row-name');
        name.appendChild(U.el('span', null, bt.name));
        if (d.bait === bt.id) { const t = U.el('span', 'tag', 'equipped'); t.style.color = 'var(--accent)'; name.appendChild(t); }
        main.appendChild(name);
        main.appendChild(U.el('div', 'row-desc', bt.desc));
        row.appendChild(main);
        const side = U.el('div', 'row-side');
        side.appendChild(U.el('div', 'row-price', have === Infinity ? '∞' : U.commas(have) + ' left'));
        if (d.bait !== bt.id) {
          const btn = U.el('button', 'btn btn-sm btn-primary', 'Use');
          btn.addEventListener('click', function () {
            d.bait = bt.id; VF.audio.click(); VF.bus.emit('bait:changed'); VF.save.save(); refresh('bait');
          });
          side.appendChild(btn);
        }
        row.appendChild(side);
        list.appendChild(row);
      });
      if (!list.children.length) b.appendChild(U.el('div', 'empty', 'No bait. Worms are always free in the shop.'));
      else b.appendChild(list);
    }

    p.appendChild(b);
    return p;
  }

  /* --------------------------------------------------------------- stats */

  function buildStats(tab) {
    const d = VF.state.data, s = d.stats;
    const done = VF.achievements.unlockedCount();
    const p = shell('Record', 'A quiet accounting');
    p.appendChild(tabs([
      { id: 'stats', label: 'Statistics' },
      { id: 'ach', label: 'Achievements (' + done + '/' + VF.achievementData.list.length + ')' }
    ], tab, function (t) { refresh(t); }));
    const b = body();

    if (tab === 'stats') {
      const grid = U.el('div', 'stats-grid');
      const big = VF.fish.byId(s.biggestFish);
      const rare = VF.fish.byId(s.rarestFish);
      const tiles = [
        ['Fish landed', U.commas(s.catches), U.commas(s.casts) + ' casts'],
        (d.level >= VF.progression.MAX_LEVEL
          ? ['Fathoms', U.commas(d.fathoms | 0),
             U.commas(d.fathomXp | 0) + ' / ' + U.commas(VF.progression.FATHOM_XP) + ' to the next']
          : ['Level', String(d.level), U.commas(d.xp) + ' / ' + U.commas(VF.progression.xpToNext())]),
        ['Discovered', Object.keys(d.fishdex).length + ' / ' + VF.fish.count, 'species'],
        ['Biggest catch', s.biggestKg ? U.weight(s.biggestKg) : '—', big ? big.name : ''],
        ['Rarest catch', rare ? VF.rarities.get(rare.rarity).name : '—', rare ? rare.name : ''],
        ['Total earned', '◈ ' + U.money(s.earned), '◈ ' + U.money(s.spent) + ' spent'],
        ['Fish sold', U.commas(s.sold), U.commas(s.released) + ' released'],
        ['Legendary+', U.commas(s.legendaryCatches), U.commas(s.voidCatches) + ' void'],
        /* The two rarest tiers were counted and never shown anywhere. A tier
           you can catch and cannot see the count of may as well not be kept. */
        ['!@#$%^&$#', U.commas(s.glitchCatches | 0),
         (s.unknownCatches | 0) ? U.commas(s.unknownCatches | 0) + ' of the other thing' : 'and one tier above it'],
        ['Mutations', U.commas(s.mutationsFound), U.commas(s.recordsBroken) + ' records broken'],
        ['Escapes', U.commas(s.escapes), U.commas(s.linesSnapped) + ' lines snapped'],
        ['Clean fights', U.commas(s.perfectReels), 'never in the red'],
        ['Second chances', U.commas(s.secondChances | 0), 'the rod would not have it'],
        ['Encounters', U.commas(s.encounters), 'something below'],
        /* Reputation stops paying into luck at 480 and nothing said so, which
           made releasing quietly worthless from a point nobody could see. */
        ['Reputation', U.commas(d.reputation),
         d.reputation >= VF.progression.REP_FULL ? 'the water knows you'
           : Math.round(d.reputation / VF.progression.REP_FULL * 100) + '% of what it is worth'],
        ['Time at the water', U.duration(s.playSeconds), 'longest run ' + U.commas(d.records.bestStreak | 0)]
      ];
      tiles.forEach(function (t) {
        const tile = U.el('div', 'stat-tile');
        tile.appendChild(U.el('span', 'k', t[0]));
        tile.appendChild(U.el('div', 'v', t[1]));
        if (t[2]) tile.appendChild(U.el('div', 'sub', t[2]));
        grid.appendChild(tile);
      });
      b.appendChild(grid);
    } else {
      const grid = U.el('div', 'ach-grid');
      VF.achievementData.list.forEach(function (a) {
        const got = !!d.achievements[a.id];
        const hidden = a.hidden && !got;
        const el = U.el('div', 'ach ' + (got ? 'done' : 'locked'));
        el.appendChild(U.el('div', 'ach-mark'));
        const main = U.el('div');
        main.appendChild(U.el('div', 'ach-name', hidden ? '??????' : a.name));
        main.appendChild(U.el('div', 'ach-desc', hidden ? 'Hidden' : a.desc));
        if (a.reward) main.appendChild(U.el('div', 'ach-reward', '◈ ' + U.money(a.reward)));
        el.appendChild(main);
        grid.appendChild(el);
      });
      b.appendChild(grid);
    }
    p.appendChild(b);
    return p;
  }

  /* ----------------------------------------------------------------- map */

  function buildMap() {
    const d = VF.state.data;
    const p = shell('Where To Fish', 'Deeper water, stranger catches');
    const b = body();
    const list = U.el('div', 'loc-list');

    let shownLocked = 0;
    VF.locations.list.forEach(function (loc) {
      const unlocked = VF.locations.isUnlocked(loc.id);
      const isCur = d.location === loc.id;
      const secret = VF.secrets.isSecretLoc(loc.id);
      // a secret spot only exists on the map once it has been found
      if (secret && !unlocked) return;
      // only tease the next locked spot, so the map keeps its mystery
      if (!unlocked) { shownLocked++; if (shownLocked > 1) return; }

      const el = U.el('div', 'loc' + (isCur ? ' current' : '') + (unlocked ? '' : ' locked'));
      const mark = U.el('div', 'loc-mark');
      mark.style.background = unlocked ? loc.glow : 'var(--line-2)';
      el.appendChild(mark);

      const main = U.el('div');
      const nameRow = U.el('div', 'loc-name');
      nameRow.appendChild(U.el('span', null, unlocked ? loc.name : '???'));
      if (secret) {
        const t = U.el('span', 'tag', 'found');
        t.style.color = 'var(--warn)';
        t.style.marginLeft = '8px';
        nameRow.appendChild(t);
      }
      main.appendChild(nameRow);
      main.appendChild(U.el('div', 'loc-tag', unlocked ? loc.tag : loc.hint));
      if (unlocked) {
        main.appendChild(U.el('div', 'loc-desc', loc.desc));
        const meta = U.el('div', 'loc-meta');
        meta.appendChild(U.el('span', null, 'rarity ×' + loc.rarityBoost.toFixed(2)));
        meta.appendChild(U.el('span', null, 'value ×' + loc.valueBoost.toFixed(2)));
        meta.appendChild(U.el('span', null, 'xp ×' + loc.xpBoost.toFixed(1)));
        main.appendChild(meta);
      } else {
        main.appendChild(U.el('div', 'loc-desc', 'unlocks at level ' + loc.level + ' · you are level ' + d.level));
      }
      el.appendChild(main);

      const side = U.el('div', 'row-side');
      if (isCur) side.appendChild(U.el('div', 'row-price', 'you are here'));
      else if (unlocked) {
        const btn = U.el('button', 'btn btn-sm btn-primary', 'Travel');
        btn.addEventListener('click', function () { travel(loc.id); });
        side.appendChild(btn);
      } else {
        side.appendChild(U.el('div', 'row-price cant', 'LV ' + loc.level));
      }
      el.appendChild(side);
      list.appendChild(el);
    });

    b.appendChild(list);

    const nFound = VF.secrets.countFound();
    const foot = U.el('div', 'case-blurb');
    foot.style.marginTop = '14px';
    foot.textContent = nFound
      ? nFound + ' hidden ' + (nFound === 1 ? 'place' : 'places') + ' found. there are others.'
      : 'not every stretch of water is on this list.';
    b.appendChild(foot);

    p.appendChild(b);
    return p;
  }

  function travel(id) {
    const st = VF.fishing.state();
    if (st === 'reeling' || st === 'bite') {
      VF.audio.error();
      VF.toast.plain('Land it first', 'warn', 2000);
      return;
    }
    VF.fishing.reelIn();
    const d = VF.state.data;
    d.location = id;
    if (d.seenLocations.indexOf(id) < 0) d.seenLocations.push(id);
    VF.loot.invalidatePool();
    VF.weather.reconcile();
    VF.encounters.reset();
    VF.fx.reset();
    VF.audio.click();
    VF.bus.emit('location:changed', id);
    VF.save.save();
    const loc = VF.locations.get(id);
    VF.toast.show('<strong>' + U.esc(loc.name) + '</strong><br><span style="color:var(--ink-3)">' + U.esc(loc.tag) + '</span>', null, 4000);
    VF.hud.showPrompt(loc.name, loc.glow, 1.6);
    close();
  }

  /* ------------------------------------------------------------ settings */

  function buildSettings() {
    const s = VF.state.data.settings;
    const p = shell('Settings');
    const b = body();

    const audio = U.el('div', 'set-group');
    audio.appendChild(U.el('span', 'k', 'Audio'));
    audio.appendChild(slider('Master', s.master, function (v) { s.master = v; VF.audio.setVolumes(); }));
    audio.appendChild(slider('Music', s.music, function (v) { s.music = v; VF.audio.setVolumes(); }));
    audio.appendChild(slider('Effects', s.sfx, function (v) { s.sfx = v; VF.audio.setVolumes(); }));
    b.appendChild(audio);

    const vis = U.el('div', 'set-group');
    vis.appendChild(U.el('span', 'k', 'Display'));
    const qRow = U.el('div', 'set-row');
    qRow.appendChild(U.el('label', null, 'Graphics'));
    const qSeg = U.el('div', 'seg');
    [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].forEach(function (o) {
      const btn = U.el('button', s.quality === o[0] ? 'active' : '', o[1]);
      btn.addEventListener('click', function () {
        s.quality = o[0];
        document.body.className = 'q-' + o[0];
        VF.audio.click();
        VF.scene.resize();
        VF.bus.emit('settings:quality');
        VF.save.save();
        refresh();
      });
      qSeg.appendChild(btn);
    });
    qRow.appendChild(qSeg);
    vis.appendChild(qRow);
    vis.appendChild(toggle('Screen shake', s.screenShake, function (v) { s.screenShake = v; }));
    vis.appendChild(toggle('Reduce flashing', s.reduceFlash, function (v) { s.reduceFlash = v; }));
    vis.appendChild(toggle('Show hints', s.showHints, function (v) { s.showHints = v; if (!v) VF.hud.clearHint(); }));

    const fsRow = U.el('div', 'set-row');
    fsRow.appendChild(U.el('label', null, 'Fullscreen'));
    const fsBtn = U.el('button', 'btn btn-sm', document.fullscreenElement ? 'Exit' : 'Enter');
    fsBtn.addEventListener('click', function () {
      VF.audio.click();
      if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); fsBtn.textContent = 'Enter'; }
      else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(function () { fsBtn.textContent = 'Exit'; }).catch(function () {});
      }
    });
    fsRow.appendChild(fsBtn);
    vis.appendChild(fsRow);
    b.appendChild(vis);

    const ctrl = U.el('div', 'set-group');
    ctrl.appendChild(U.el('span', 'k', 'Controls'));
    const keys = U.el('div');
    keys.style.cssText = 'font-size:11.5px;line-height:1.9;color:var(--ink-3)';
    [['Hold Space / click', 'charge and cast, set the hook, reel'],
     ['R', 'reel the line back in'],
     ['Q / F / B / T / M', 'shop, fishdex, bag, record, map'],
     ['Esc', 'close a menu']].forEach(function (k) {
      const row = U.el('div');
      const kk = U.el('span', 'mono');
      kk.style.cssText = 'color:var(--ink-2);display:inline-block;min-width:150px';
      kk.textContent = k[0];
      row.appendChild(kk);
      row.appendChild(document.createTextNode(k[1]));
      keys.appendChild(row);
    });
    ctrl.appendChild(keys);
    b.appendChild(ctrl);

    const data = U.el('div', 'set-group');
    data.appendChild(U.el('span', 'k', 'Save data'));
    const info = U.el('div');
    info.style.cssText = 'font-size:11.5px;color:var(--ink-3);margin-bottom:12px;line-height:1.6';
    info.textContent = VF.save.isAvailable()
      ? 'Four games. The one you are playing saves itself; the others sit where you left them.'
      : 'Storage is unavailable in this browser, so nothing here will persist.';
    data.appendChild(info);
    /* Four games, side by side. A row says what is in the slot so the choice
       is made on what the game looks like rather than on a number. */
    const list = U.el('div', 'saveslot-list');
    VF.save.slots().forEach(function (sl) {
      const here = sl.slot === VF.save.slot();
      /* `blank`, not `empty`: a global `.empty` already exists for the
         placeholder a panel shows when a list has nothing in it, and it is
         centred with forty-four pixels of padding. */
      const row = U.el('div', 'saveslot' + (here ? ' here' : '') + (sl.empty ? ' blank' : ''));

      const mark = U.el('div', 'saveslot-mark');
      mark.style.background = here ? 'var(--accent)' : (sl.empty ? 'var(--line-2)' : 'var(--good)');
      row.appendChild(mark);

      const main = U.el('div', 'saveslot-main');
      const name = U.el('div', 'saveslot-name');
      name.appendChild(U.el('span', null, 'slot ' + (sl.slot + 1)));
      if (here) {
        const t = U.el('span', 'tag', 'playing');
        t.style.color = 'var(--accent)';
        name.appendChild(t);
      }
      main.appendChild(name);
      main.appendChild(U.el('div', 'saveslot-desc', sl.empty ? 'empty'
        : (sl.level >= VF.progression.MAX_LEVEL
             ? 'lv 99 · ' + sl.fathoms + ' fathoms' : 'lv ' + sl.level) +
          ' · ' + U.commas(sl.species) + ' species · ◈ ' + U.money(sl.money)));
      if (!sl.empty) {
        main.appendChild(U.el('div', 'saveslot-sub',
          VF.locations.get(sl.location).name + ' · ' + U.duration(sl.playSeconds)));
      }
      row.appendChild(main);

      const acts = U.el('div', 'saveslot-acts');
      if (!here) {
        const go = U.el('button', 'btn btn-sm' + (sl.empty ? '' : ' btn-primary'),
                        sl.empty ? 'Start here' : 'Load');
        go.addEventListener('click', function () { switchSlot(sl); });
        acts.appendChild(go);
      }
      if (!sl.empty) {
        const del = U.el('button', 'btn btn-sm btn-danger', 'Erase');
        del.addEventListener('click', function () { confirmErase(sl); });
        acts.appendChild(del);
      }
      row.appendChild(acts);
      list.appendChild(row);
    });
    data.appendChild(list);
    b.appendChild(data);

    p.appendChild(b);
    return p;
  }

  function slider(label, value, onChange) {
    const row = U.el('div', 'set-row');
    row.appendChild(U.el('label', null, label));
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = '0'; inp.max = '1'; inp.step = '0.01'; inp.value = String(value);
    const val = U.el('span', 'val', Math.round(value * 100) + '%');
    inp.addEventListener('input', function () {
      const v = parseFloat(inp.value);
      val.textContent = Math.round(v * 100) + '%';
      onChange(v);
    });
    inp.addEventListener('change', function () { VF.save.save(); });
    row.appendChild(inp);
    row.appendChild(val);
    return row;
  }

  function toggle(label, value, onChange) {
    const row = U.el('div', 'set-row');
    row.appendChild(U.el('label', null, label));
    const sw = U.el('div', 'switch' + (value ? ' on' : ''));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('tabindex', '0');
    sw.setAttribute('aria-checked', value ? 'true' : 'false');
    function flip() {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      onChange(on);
      VF.audio.click();
      VF.save.save();
    }
    sw.addEventListener('click', flip);
    sw.addEventListener('keydown', function (e) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); flip(); } });
    row.appendChild(sw);
    return row;
  }

  /* The one door that discards a game. It shows what is about to be replaced
     and what is about to replace it, and it puts the outgoing save in the box
     on the way past so a mistaken paste is recoverable. */
  /* Everything the world has to be told when the game underneath it changes.
     Both slot doors go through here, and so does erasing the one in play. */
  function adoptGame() {
    VF.catchUI.close();
    VF.fishing.hardReset();
    VF.loot.invalidatePool();
    VF.encounters.reset();
    VF.fx.reset();
    VF.particles.clearAll();
    VF.scene.rebuild();
    VF.scene.seedAmbient();
    VF.audio.setVolumes();
    document.body.className = 'q-' + VF.state.data.settings.quality;
    VF.bus.emit('gear:changed');
    VF.bus.emit('location:changed');
    VF.hud.refreshAll();
  }

  function switchSlot(sl) {
    VF.audio.click();
    const res = VF.save.use(sl.slot);
    adoptGame();
    if (res.fresh) VF.tutorial.reset();
    refresh('settings');
    VF.toast.plain(res.fresh
      ? 'slot ' + (sl.slot + 1) + ' · a new game'
      : 'slot ' + (sl.slot + 1) + ' · level ' + sl.level + ' · ' +
        U.commas(sl.species) + ' species', 'good', 3600);
  }

  function confirmErase(sl) {
    VF.audio.click();
    const here = sl.slot === VF.save.slot();
    const dlg = U.el('div', 'dialog');
    dlg.appendChild(U.el('h3', null, 'Erase slot ' + (sl.slot + 1) + '?'));
    dlg.appendChild(U.el('p', null,
      'Level ' + sl.level + ', ' + U.commas(sl.species) + ' species and ' +
      U.duration(sl.playSeconds) + ' at the water.' +
      (here ? ' It is the game you are playing, and it will start again empty.' : '') +
      ' This cannot be undone.'));
    const acts = U.el('div', 'dialog-actions');
    const no = U.el('button', 'btn', 'Cancel');
    no.addEventListener('click', function () { VF.audio.back(); refresh('settings'); });
    const yes = U.el('button', 'btn btn-danger', 'Erase');
    yes.addEventListener('click', function () {
      const wasHere = VF.save.erase(sl.slot);
      if (wasHere) { adoptGame(); VF.tutorial.reset(); }
      refresh('settings');
      VF.toast.plain('slot ' + (sl.slot + 1) + ' erased', 'warn', 3000);
    });
    acts.appendChild(no); acts.appendChild(yes);
    dlg.appendChild(acts);
    const prev = node;
    node = dlg;
    if (prev && prev.parentNode) prev.parentNode.replaceChild(dlg, prev);
  }


  /* ------------------------------------------------- the case opening
     The result is decided before the animation starts. The strip is then
     positioned so it lands on it, easing out over roughly six seconds. */
  function openCase(caseId) {
    const res = VF.caseOpen.buy(caseId);
    if (!res) { VF.audio.error(); return; }

    stopRodLoop();
    const rank = VF.rarities.rank(res.rarity);
    const box = U.el('div', 'opener');

    const head = U.el('div', 'opener-head');
    head.appendChild(U.el('div', 'opener-title', res.caseDef.name));
    box.appendChild(head);

    const win = U.el('div', 'reel-window');
    const strip = U.el('div', 'reel-strip');
    const ITEM = 118, GAP = 8, STEP = ITEM + GAP;
    res.strip.forEach(function (it, i) {
      const cell = U.el('div', 'reel-item');
      cell.appendChild(cosThumb(it, 118, 70, i * 0.4));
      cell.appendChild(U.el('div', 'rn', it.name));
      const bar = U.el('div', 'rbar');
      bar.style.background = VF.rarities.color(it.rarity);
      cell.appendChild(bar);
      strip.appendChild(cell);
    });
    win.appendChild(strip);
    win.appendChild(U.el('div', 'reel-fade'));
    win.appendChild(U.el('div', 'reel-marker'));
    box.appendChild(win);

    const resultBox = U.el('div', 'opener-result');
    resultBox.style.display = 'none';
    box.appendChild(resultBox);

    const acts = U.el('div', 'opener-actions');
    acts.style.display = 'none';
    box.appendChild(acts);

    const prev = node;
    node = box;
    if (prev && prev.parentNode) prev.parentNode.replaceChild(box, prev);

    // land the winning cell under the marker
    const winW = win.clientWidth || 720;
    const target = -(res.winIndex * STEP) + winW / 2 - ITEM / 2 - 8;
    const start = 0;
    const DUR = 6.1;
    let t0 = 0, lastTick = -1, raf = 0;

    VF.audio.caseRoll();

    function frame(now) {
      if (!t0) t0 = now;
      const el = (now - t0) / 1000;
      const k = Math.min(1, el / DUR);
      // strong ease-out: fast blur, long slow crawl into the result
      const e = 1 - Math.pow(1 - k, 4.2);
      const x = start + (target - start) * e;
      strip.style.transform = 'translateX(' + x.toFixed(2) + 'px)';

      // one tick per cell that passes the marker, thinning out as it slows
      const idx = Math.floor(-x / STEP);
      if (idx !== lastTick) { lastTick = idx; VF.audio.caseTick(k); }

      if (k < 1) { raf = requestAnimationFrame(frame); return; }
      finish();
    }

    function finish() {
      cancelAnimationFrame(raf);
      if (rank >= 5) box.classList.add('hit-mythic');
      else if (rank >= 4) box.classList.add('hit-legendary');
      VF.audio.stinger(rank >= 4 ? 'grand' : rank >= 2 ? 'bright' : 'soft', rank);
      if (rank >= 3) VF.fx.shake(2 + rank * 1.6, 3.4);
      if (rank >= 2) VF.fx.flash(U.rgbToCss(U.hexToRgb(VF.rarities.get(res.rarity).glow), 0.18),
                                 0.16 + rank * 0.04, 1.8);

      resultBox.style.display = '';
      resultBox.appendChild(cosThumb(res.item, 300, 96, 1.4));
      resultBox.appendChild(U.el('div', 'result-name', res.item.name));
      const slotName = (VF.cosmetics.slots.filter(function (s2) { return s2.id === res.item.slot; })[0] || {}).name;
      resultBox.appendChild(U.el('div', 'result-slot', slotName || res.item.slot));
      const rr = U.el('div', 'result-rarity', VF.rarities.get(res.rarity).name);
      rr.style.color = VF.rarities.color(res.rarity);
      resultBox.appendChild(rr);
      if (res.duplicate) {
        resultBox.appendChild(U.el('div', 'result-dupe',
          'already owned — refunded ◈ ' + U.money(res.refund)));
      }

      acts.style.display = '';
      if (!res.duplicate) {
        const eq = U.el('button', 'btn btn-primary', 'wear it');
        eq.addEventListener('click', function () {
          VF.cosmetics.equip(res.item.id);
          VF.audio.click(); VF.save.save();
          VF.toast.show('wearing <strong>' + U.esc(res.item.name) + '</strong>', 'good', 2600);
          refresh('cases');
        });
        acts.appendChild(eq);
      }
      const again = U.el('button', 'btn', 'open another');
      again.addEventListener('click', function () {
        if (VF.caseOpen.canBuy(caseId).ok) openCase(caseId);
        else { VF.audio.error(); refresh('cases'); }
      });
      acts.appendChild(again);
      const done = U.el('button', 'btn', 'done');
      done.addEventListener('click', function () { VF.audio.back(); refresh('cases'); });
      acts.appendChild(done);

      VF.achievements.check();
    }

    raf = requestAnimationFrame(frame);
  }

  VF.panels = { init: init, open: open, close: close, isOpen: isOpen, refresh: refresh,
                openCase: openCase };
})(window.VF = window.VF || {});
