/* Checks the admin door's code maths, and — the part that matters — that the
   authenticator page and the game agree about what the code is. If those two
   ever drift, the door cannot be opened by anybody, including its owner, and
   nothing on screen would say why. Run it after touching authcode.js. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function loadModule(source, label) {
  const VF = {};
  new Function('window', source)({ VF: VF });
  if (!VF.authcode) throw new Error('no VF.authcode in ' + label);
  return VF.authcode;
}

const game = loadModule(fs.readFileSync(path.join(root, 'js/systems/authcode.js'), 'utf8'), 'js/systems/authcode.js');

const built = path.join(root, 'dist/void-fishing-authenticator.html');
if (!fs.existsSync(built)) {
  console.error('FAIL  dist/void-fishing-authenticator.html is missing — run tools/build-authenticator.js');
  process.exit(1);
}
const page = fs.readFileSync(built, 'utf8');
const inlined = (page.match(/\(function \(VF\) \{[\s\S]*?\}\)\(window\.VF = window\.VF \|\| \{\}\);/) || [])[0];
if (!inlined) { console.error('FAIL  could not find authcode inside the authenticator page'); process.exit(1); }
const auth = loadModule(inlined, 'the authenticator page');

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
}

/* the whole point */
let drift = 0;
for (let w = 0; w < 200000; w++) if (game.codeForWindow(w) !== auth.codeForWindow(w)) drift++;
ok('the game and the authenticator agree on 200000 windows', drift === 0, drift ? drift + ' disagreed' : '');

/* four digits, always */
let bad = 0, distinct = {};
for (let w = 0; w < 200000; w++) {
  const c = game.codeForWindow(w);
  if (!/^\d{4}$/.test(c)) bad++;
  distinct[c] = 1;
}
ok('every code is exactly four digits', bad === 0);
ok('the codes cover the whole 0000-9999 space', Object.keys(distinct).length === 10000,
   Object.keys(distinct).length + ' distinct');

/* neighbouring windows must not be guessable from each other */
let adjacent = 0;
for (let w = 0; w < 100000; w++) if (game.codeForWindow(w) === game.codeForWindow(w + 1)) adjacent++;
ok('consecutive codes differ (bar chance collisions)', adjacent < 25, adjacent + ' repeats in 100000');

/* the window really is thirty minutes */
ok('a window is thirty minutes', game.WINDOW_MS === 30 * 60 * 1000);
const t = Date.UTC(2026, 0, 1, 12, 0, 0);
ok('the code holds for the whole window',
   game.current(t) === game.current(t + 29 * 60 * 1000));
ok('and it changes at the boundary',
   game.current(t) !== game.current(t + 30 * 60 * 1000));

/* what accepts() will and will not take */
ok('accepts the current code', game.accepts(game.current(t), t));
ok('accepts the previous code (their clock is behind ours)',
   game.accepts(game.codeForWindow(game.windowAt(t) - 1), t));
ok('accepts the next code (their clock is ahead of ours)',
   game.accepts(game.codeForWindow(game.windowAt(t) + 1), t));
ok('refuses two windows back', !game.accepts(game.codeForWindow(game.windowAt(t) - 2), t));
ok('refuses two windows on', !game.accepts(game.codeForWindow(game.windowAt(t) + 2), t));
ok('refuses junk', !game.accepts('', t) && !game.accepts('12', t) &&
   !game.accepts('abcd', t) && !game.accepts(null, t) && !game.accepts('12345', t));
ok('tolerates spaces around a good code', game.accepts('  ' + game.current(t) + ' ', t));

/* Skew: read on a phone, typed on a laptop whose clock disagrees. Swept well
   past where it stops working, because where it stops working is a decision
   and ought to be a tested one rather than a surprise. */
function skewOpens(mins) {
  let opened = 0;
  for (let phase = 0; phase < 30; phase++) {
    const at = t + phase * 60000;
    if (game.accepts(game.current(at + mins * 60000), at)) opened++;
  }
  return opened;   // out of 30 starting minutes within the window
}
let solid = true;
for (let m = -30; m <= 30; m++) if (skewOpens(m) !== 30) solid = false;
ok('any clock difference up to half an hour always opens the door', solid);
ok('an hour out never does, in either direction',
   skewOpens(60) === 0 && skewOpens(-60) === 0,
   '+60 -> ' + skewOpens(60) + '/30, -60 -> ' + skewOpens(-60) + '/30');
ok('between the two it is intermittent, which is what the gate warns about',
   skewOpens(45) > 0 && skewOpens(45) < 30, '45 min -> ' + skewOpens(45) + '/30');

/* and the odds a guess is right */
let hits = 0;
for (let n = 0; n < 10000; n++) if (game.accepts(('000' + n).slice(-4), t)) hits++;
ok('a blind guess is right 3 times in 10000', hits === 3, hits + ' of 10000 accepted');

console.log('\n' + (fails ? fails + ' FAILURES' : 'all good'));
process.exit(fails ? 1 : 0);
