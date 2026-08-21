/* The ? tier: the two of them are reachable, the fight is the scripted one,
   the sequence runs and ends, and the record only admits the tier exists
   after one is in it. Also grabs a frame from each beat. */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#bootStart');
  await page.waitForTimeout(300);

  /* --- the tier is not on the record until one is in it --- */
  const before = await page.evaluate(() => ({
    dexTotal: VF.fish.knownCount(),
    raw: VF.fish.count,
    tiers: VF.rarities.visible().map(r => r.name).join(' ')
  }));
  console.log('before  dex total ' + before.dexTotal + ' of ' + before.raw +
              '   tiers: ' + before.tiers);

  /* --- how rare, at the very top of the game --- */
  const LOADOUTS = [
    ['a first rod at the shore',    { lv: 3,  rod: 'wood',        bait: 'worm', loc: 'shore',   charms: [] }],
    ['mid-game, deep water',        { lv: 40, rod: 'aether',      bait: 'void', loc: 'trench',  charms: ['moon', 'lens'] }],
    ['endgame, nothing stacked',    { lv: 99, rod: 'twinsun',     bait: 'null', loc: 'beneath', charms: [] }],
    ['endgame, everything stacked', { lv: 99, rod: 'twinsun',     bait: 'null', loc: 'beneath', charms: ['compass', 'bell', 'lens', 'eye', 'voidfrag'] }]
  ];
  for (const [label, L] of LOADOUTS) {
    const odds = await page.evaluate((L) => {
      const d = VF.state.data;
      d.level = L.lv; d.rod = L.rod; d.bait = L.bait; d.location = L.loc;
      d.charms = L.charms.slice(); d.charmSlots = [null, null, null, null, null];
      L.charms.forEach(function (c, i) { d.charmSlots[i] = c; });
      VF.build.invalidate(); VF.loot.invalidatePool();
      const N = 400000, tally = {};
      for (let i = 0; i < N; i++) {
        const r = VF.loot.pickFish().rarity;
        tally[r] = (tally[r] | 0) + 1;
      }
      return { n: N, rp: VF.loot.rarityPower().toFixed(1), tally: tally };
    }, L);
    const q = odds.tally.unknown | 0, gl = odds.tally.glitch | 0, vd = odds.tally['void'] | 0;
    const one = (n) => n ? '1 in ' + Math.round(odds.n / n).toLocaleString() : 'never in ' + odds.n.toLocaleString();
    console.log('  ' + label.padEnd(30) + 'RP ' + String(odds.rp).padStart(7) +
                '   void ' + one(vd).padEnd(16) + '   !@# ' + one(gl).padEnd(16) + '   ? ' + one(q));
  }
  console.log('');

  /* --- the scripted fight --- */
  const fight = await page.evaluate(() => {
    VF.fishing.hardReset();
    VF.fishing.S.pending = VF.loot.roll({ forceFish: 'nessie' });
    VF.fishing.S.pending.kind = 'fish';
    VF.fishing.S.pending.trial = VF.fish.byId('nessie').trial;
    VF.fishing.S.state = 'bite';
    const ok = VF.fishing.hook();
    const f = VF.fishing.S.fight;
    return { hooked: ok, phases: f && f.trial ? f.trial.spec.phases.length : 0,
             barW: f ? +f.barW.toFixed(3) : -1 };
  });
  console.log('nessie hooked=' + fight.hooked + ' phases=' + fight.phases + ' opening bar=' + fight.barW);

  /* --- the sequence, a frame per beat --- */
  for (const who of ['nessie', 'oscar']) {
    await page.evaluate((who) => {
      VF.fishing.hardReset();
      const id = who === 'nessie' ? 'nessie' : 'oscar_brophy';
      const c = VF.loot.roll({ forceFish: id });
      c.kind = 'fish';
      VF.cutscene.play(who, c, function () { window.__done = (window.__done || 0) + 1; });
    }, who);
    for (let b = 0; b < 5; b++) {
      await page.waitForTimeout(b === 0 ? 1200 : 2600);
      await page.screenshot({ path: path.join(OUT, who + '-' + b + '.png') });
    }
    await page.waitForTimeout(2500);
  }
  const ended = await page.evaluate(() => ({ done: window.__done | 0, active: VF.cutscene.active() }));
  console.log('sequences finished: ' + ended.done + ' / 2, still active: ' + ended.active);

  /* --- and now the record admits the tier --- */
  const after = await page.evaluate(() => {
    const d = VF.state.data;
    d.fishdex.nessie = { caught: 1, record: null, firstSeen: Date.now(), mutations: {}, traits: {} };
    d.flags.rare_unknown = true;
    return { dexTotal: VF.fish.knownCount(), tiers: VF.rarities.visible().map(r => r.name).join(' ') };
  });
  console.log('after   dex total ' + after.dexTotal + '   tiers: ' + after.tiers);

  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
