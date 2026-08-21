/* Each late rod must state the right reason it is not for sale yet. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('#bootStart');
  await page.waitForTimeout(250);

  const cases = [
    ['level 99, nothing else',      { lv: 99, voids: 0, glitch: 0, secret: false }],
    ['+ a void catch',              { lv: 99, voids: 1, glitch: 0, secret: false }],
    ['+ a glitch catch',            { lv: 99, voids: 1, glitch: 1, secret: false }],
    ['+ the last water',            { lv: 99, voids: 1, glitch: 1, secret: true }],
    ['+ the glass shallows',        { lv: 99, voids: 1, glitch: 1, secret: true, shallows: true }],
    ['+ a growing crystal',         { lv: 99, voids: 1, glitch: 1, secret: true, shallows: true, crystal: true }],
    ['+ the two gate species',      { lv: 99, voids: 1, glitch: 1, secret: true, shallows: true, crystal: true, dex: true }],
    ['+ the fallen star finished',  { lv: 99, voids: 1, glitch: 1, secret: true, shallows: true, crystal: true, dex: true, quest: true }]
  ];
  const IDS = ['frostpoint', 'shatterhour', 'ninearms', 'thunderstruck',
               'seraph', 'redthread', 'unknown'];
  for (const [label, c] of cases) {
    const out = await page.evaluate(({ c, IDS }) => {
      const d = VF.state.data;
      d.level = c.lv; d.money = 5e11;
      d.stats.voidCatches = c.voids; d.stats.glitchCatches = c.glitch;
      d.secrets = {};
      if (c.secret) d.secrets.the_last_water = Date.now();
      if (c.shallows) d.secrets.glass_shallows = Date.now();
      d.treasures = c.crystal ? { crystal: 1 } : {};
      d.fishdex = c.dex ? { nine_tide: { caught: 1 }, stormcaller: { caught: 1 } } : {};
      d.quests = c.quest ? { heavens: { started: 1, step: 11, done: Date.now(), flags: {}, counts: {} } } : {};
      d.ownedRods = ['wood'];
      return IDS.map(function (id) {
        const r = VF.economy.buyRod(id);
        if (r.ok) { d.ownedRods = ['wood']; d.money = 5e11; }
        return id + ':' + (r.ok ? 'BUYABLE' : r.why);
      }).join('  ');
    }, { c: c, IDS: IDS });
    console.log(label.padEnd(24), out);
  }

  /* The six that are never sold have to stay unsellable no matter what, and
     have to arrive when they are handed over. */
  const gifted = await page.evaluate(function () {
    const d = VF.state.data;
    d.level = 99; d.money = 5e11;
    d.stats.voidCatches = 1; d.stats.glitchCatches = 1;
    d.secrets = { the_last_water: Date.now(), glass_shallows: Date.now() };
    d.quests = { heavens: { started: 1, step: 11, done: Date.now(), flags: {}, counts: {} } };
    const ids = ['redthread', 'pyrewing', 'halflife', 'seraph', 'longfeather', 'twinsun'];
    const buy = ids.map(function (id) {
      d.ownedRods = ['wood'];
      const r = VF.economy.buyRod(id);
      return id + ':' + (r.ok ? 'BUYABLE(!)' : r.why);
    });
    d.ownedRods = ['wood'];
    const grant = ids.map(function (id) {
      return id + ':' + (VF.rods.grant(id) ? 'granted' : 'FAILED');
    });
    return { buy: buy.join('  '), grant: grant.join('  ') };
  });
  console.log('\nnever for sale:  ' + gifted.buy);
  console.log('when handed over:' + gifted.grant);

  /* And the two that the water gives back have to actually be in the salvage
     table, or they are unreachable however many casts you make. */
  const water = await page.evaluate(function () {
    const d = VF.state.data;
    d.ownedRods = ['wood'];
    d.location = 'beneath';
    const want = ['pyrewing', 'longfeather'];
    const inTable = want.filter(function (id) {
      return VF.treasureData.list.some(function (t) { return t.rod === id; });
    });
    // and once owned they stop being in the water
    d.ownedRods = ['wood', 'pyrewing'];
    let seen = 0;
    for (let i = 0; i < 4000; i++) { const t = VF.treasureData.roll(); if (t && t.rod === 'pyrewing') seen++; }
    return { inTable: inTable.join(','), ownedStillRolls: seen };
  });
  console.log('rods in the water:' + water.inTable + '  (owned still rolls: ' + water.ownedStillRolls + ')');
  console.log('\nerrors: ' + errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
})();
