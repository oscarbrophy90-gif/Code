/* Screenshots the panels added in this pass. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#bootStart');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const d = VF.state.data;
    d.level = 60; d.money = 8e9;
    VF.progression.checkUnlocks();
    d.ownedRods = VF.rods.list.filter(r => r.level <= 60).map(r => r.id);
    d.rod = 'celestial'; d.bait = 'star';
    VF.bait.list.forEach(b => { if (!b.unlimited) VF.bait.add(b.id, 60); });
    ['moon','goldhook','compass','tooth','net','lens'].forEach(c => VF.charms.grant(c));
    ['voidfrag','lantern','coin'].forEach(c => VF.charms.grant(c));
    VF.charms.equip('compass', 0); VF.charms.equip('tooth', 1); VF.charms.equip('voidfrag', 2);
    VF.cosmetics.list.forEach((c, i) => { if (i % 2 === 0) VF.cosmetics.grant(c.id); });
    VF.cosmetics.equip('bob_lantern'); VF.cosmetics.equip('line_glow');
    // a populated fishdex with traits recorded
    VF.fish.list.forEach((f, i) => {
      if (i % 3 !== 0) return;
      const tr = {};
      if (i % 6 === 0) { tr.glowing = 2; tr.golden = 1; }
      if (i % 9 === 0) { tr.massive = 1; tr.ancient = 1; }
      d.fishdex[f.id] = { caught: 2 + (i % 7), firstSeen: Date.now(), mutations: {}, traits: tr,
        record: { kg: f.kg[1] * 0.5, m: f.m[1] * 0.5, pct: 0.7, traits: Object.keys(tr) } };
    });
    Object.keys(d.fishdex).forEach(id => { Object.keys(d.fishdex[id].traits).forEach(t => {
      d.traitsSeen[t] = (d.traitsSeen[t] || 0) + 1; }); });
    d.records = { biggestKg: 8241.5, biggestId: 'leviathan', biggestTraits: ['massive','ancient'],
      richest: 84210000, richestId: 'void_leviathan', richestTraits: ['voidtouched','golden','massive'],
      bestCombo: 640, bestComboId: 'moonfish', bestComboTraits: ['ancient','golden','massive','aggressive'],
      longestSpecies: 42.8, longestId: 'astral_whale', bestStreak: 61 };
    d.streak = 14;
    ['bottle','fossil','key','plate','chart','lens','voidfrag','lantern'].forEach(x => VF.journal.add(x));
    ['coins','bottle','shell','jewel','fossil','key','crystal','plate'].forEach((x, i) => d.treasures[x] = i + 1);
    d.stats.catches = 340; d.stats.casts = 410; d.stats.voidCatches = 2; d.stats.encounters = 6;
    d.stats.casesOpened = 12; d.stats.treasuresFound = 44;
    VF.secrets.discover('lantern_isle');
    VF.secrets.discover('glass_shallows');
    VF.hud.refreshAll();
  });
  await page.waitForTimeout(400);

  const shots = [['shop','charms'],['shop','cases'],['wardrobe','all'],['journal','entries'],
                 ['journal','people'],['journal','records'],['bag','charms'],['bag','salvage'],
                 ['map',null],['fishdex',null]];
  for (const [p, t] of shots) {
    await page.evaluate(([p, t]) => { VF.panels.close(); VF.panels.open(p, t); }, [p, t]);
    await page.waitForTimeout(600);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: 'tools/ui-' + p + (t ? '-' + t : '') + '.png', animations: 'disabled' });
  }

  // the case opening, mid-spin and at rest
  await page.evaluate(() => { VF.panels.close(); VF.panels.open('shop', 'cases'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => VF.panels.openCase('cradle'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tools/ui-case-spin.png' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'tools/ui-case-result.png', animations: 'disabled' });

  console.log('errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log('  !', e));
  await browser.close();
})();
