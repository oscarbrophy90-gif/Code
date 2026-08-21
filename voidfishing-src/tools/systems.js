/* Exercises every new system end to end: traits, builds, charms, conditions,
   treasure, secrets, NPCs, wrong events, cases and cosmetics. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack||'').split('\n')[1]));

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#bootStart');
  await page.waitForTimeout(500);

  const out = await page.evaluate(async () => {
    const r = {};
    const d = VF.state.data;
    d.level = 60; d.money = 5e9;
    VF.progression.checkUnlocks();
    d.ownedRods = VF.rods.list.filter(x => x.level <= 60).map(x => x.id);
    d.rod = 'void'; d.bait = 'void';
    VF.bait.list.forEach(b => { if (!b.unlimited) VF.bait.add(b.id, 999); });

    /* --- traits: distribution and stacking --- */
    VF.loot.invalidatePool();
    const tally = {}; let multi = 0, maxN = 0, best = 0;
    for (let i = 0; i < 40000; i++) {
      const c = VF.loot.roll({});
      const n = c.traits.length;
      if (n) { multi += n >= 2 ? 1 : 0; maxN = Math.max(maxN, n); }
      c.traits.forEach(t => tally[t] = (tally[t] || 0) + 1);
      best = Math.max(best, VF.traits.multiplier(c.traits));
    }
    r.traits = { tally, multiPct: +(multi / 40000 * 100).toFixed(3), maxStack: maxN,
                 bestMult: Math.round(best) };

    /* --- build: charms actually move the numbers --- */
    const base = JSON.parse(JSON.stringify(VF.build.stats()));
    VF.charms.grant('compass'); VF.charms.grant('tooth'); VF.charms.grant('net');
    VF.charms.equip('compass'); VF.charms.equip('tooth'); VF.charms.equip('net');
    VF.build.invalidate();
    const withCharms = JSON.parse(JSON.stringify(VF.build.stats()));
    r.build = { slots: VF.charms.slotCount(), describe: VF.build.describe(),
                rareDelta: +(withCharms.rare - base.rare).toFixed(2),
                biteDelta: +(withCharms.bite - base.bite).toFixed(2),
                sizeDelta: +(withCharms.size - base.size).toFixed(2),
                treasureDelta: +(withCharms.treasure - base.treasure).toFixed(2) };

    /* --- conditions --- */
    const condSeen = new Set();
    for (let i = 0; i < 40; i++) { VF.conditions.end(); VF.conditions.start(); condSeen.add(VF.conditions.name()); }
    VF.conditions.end();
    r.conditions = { distinct: condSeen.size, mods: VF.conditions.mods().rare };

    /* --- treasure --- */
    const tt = {}; let relics = 0;
    for (let i = 0; i < 6000; i++) { const t = VF.treasureData.roll(); if (t) { tt[t.id] = (tt[t.id]||0)+1; if (t.relic) relics++; } }
    r.treasure = { kinds: Object.keys(tt).length, relicDraws: relics, chance: +VF.treasureData.chance().toFixed(4) };

    /* --- secrets: each one reachable under its own conditions --- */
    const found = [];
    VF.weather.force('fog'); for (let i = 0; i < 30; i++) VF.weather.tick(1);
    d.location = 'basin';
    for (let i = 0; i < 400 && !VF.secrets.found('lantern_isle'); i++) VF.secrets.tryFind();
    found.push(['lantern_isle', VF.secrets.found('lantern_isle')]);
    VF.journal.add('chart'); d.location = 'trench';
    for (let i = 0; i < 400 && !VF.secrets.found('sunken_arch'); i++) VF.secrets.tryFind();
    found.push(['sunken_arch', VF.secrets.found('sunken_arch')]);
    VF.conditions.start('lowtide');
    for (let i = 0; i < 400 && !VF.secrets.found('glass_shallows'); i++) VF.secrets.tryFind();
    found.push(['glass_shallows', VF.secrets.found('glass_shallows')]);
    VF.charms.grant('lantern'); d.location = 'abyss';
    for (let i = 0; i < 600 && !VF.secrets.found('drowned_hall'); i++) VF.secrets.tryFind();
    found.push(['drowned_hall', VF.secrets.found('drowned_hall')]);
    r.secrets = { found, registered: VF.locations.list.length };

    /* --- the endgame gate must stay shut until every thread is pulled --- */
    d.location = 'beneath';
    const beforeGate = VF.secrets.tryFind();
    VF.charms.grant('eye');
    VF.journal.add('chart'); VF.journal.add('thelast'); VF.journal.add('beneath');
    d.npcs.fisherman = { met: 9, stage: 5, heard: [0,1,2,3,4] };
    const afterGate = VF.secrets.tryFind();
    r.endgame = { openedEarly: VF.secrets.found('the_last_water') && !afterGate,
                  opensWhenReady: VF.secrets.found('the_last_water') };

    /* --- NPCs advance and hand things over --- */
    const talks = [];
    VF.npcs.list.forEach(n => {
      let stages = 0;
      for (let i = 0; i < 8; i++) { const res = VF.npcs.talk(n.id); if (res) stages++; else break; }
      talks.push([n.id, stages]);
    });
    r.npcs = { talks, journal: d.journal.length };

    /* --- cases --- */
    const rar = {}; let dupes = 0, refunded = 0;
    for (let i = 0; i < 300; i++) {
      const res = VF.caseOpen.buy('harbour');
      if (!res) break;
      rar[res.rarity] = (rar[res.rarity] || 0) + 1;
      if (res.duplicate) { dupes++; refunded += res.refund; }
      if (res.strip.length !== 48 || res.strip[res.winIndex] !== res.item) r.caseStripBroken = true;
    }
    r.cases = { rarities: rar, dupes, refunded, owned: d.cosmetics.length,
                completion: +(VF.cosmetics.completion().pct * 100).toFixed(1) };

    /* --- cosmetics equip cleanly --- */
    let equipped = 0;
    VF.cosmetics.list.forEach(c => { if (VF.cosmetics.owned(c.id) && VF.cosmetics.equip(c.id)) equipped++; });
    r.cosmetics = { equipped, slotsFilled: Object.keys(d.equipped).length };

    /* --- wrong event runs its full arc --- */
    const phases = [];
    ['wrong:begin','wrong:peak','wrong:shape','wrong:restore','wrong:end']
      .forEach(e => VF.bus.on(e, () => phases.push(e)));
    VF.wrong.begin();
    for (let i = 0; i < 900; i++) VF.wrong.tick(1 / 30);
    r.wrong = { phases: phases.length, done: !VF.wrong.active() };

    /* --- save survives all of it --- */
    VF.save.save();
    const before = { charms: d.charms.length, cos: d.cosmetics.length, secrets: Object.keys(d.secrets).length,
                     journal: d.journal.length, traits: Object.keys(d.traitsSeen).length };
    VF.state.data = VF.state.defaults();
    VF.save.load();
    const after = { charms: VF.state.data.charms.length, cos: VF.state.data.cosmetics.length,
                    secrets: Object.keys(VF.state.data.secrets).length,
                    journal: VF.state.data.journal.length,
                    traits: Object.keys(VF.state.data.traitsSeen).length };
    r.save = { match: JSON.stringify(before) === JSON.stringify(after), before, after };
    return r;
  });

  console.log(JSON.stringify(out, null, 1));
  console.log('\nerrors:', errors.length);
  errors.slice(0, 12).forEach(e => console.log('  !', e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
