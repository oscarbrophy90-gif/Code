/* Builds the little page that tells you the current admin code.

   It inlines js/systems/authcode.js verbatim rather than reimplementing it,
   so the page and the game are running the identical maths off the identical
   salt. Rebuild this whenever that file changes. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const authcode = fs.readFileSync(path.join(root, 'js/systems/authcode.js'), 'utf8');
/* Blank on purpose — see the note on EMAIL in js/ui/console.js. This page is
   gitignored, but it is built from a repository that is not. */
const EMAIL = '';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>void fishing · authenticator</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root {
    --ink: #e9eff6; --ink-2: rgba(233,239,246,0.62); --ink-3: rgba(233,239,246,0.36);
    --line: rgba(255,255,255,0.085); --line-2: rgba(255,255,255,0.16);
    --accent: #7fa8c8; --good: #6fd8a4;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #04060a; color: var(--ink);
    font-family: var(--mono); display: flex; align-items: center; justify-content: center;
    padding: 24px; -webkit-font-smoothing: antialiased;
  }
  .card { width: 100%; max-width: 380px; border: 1px solid var(--line); background: rgba(255,255,255,0.02); padding: 26px 26px 22px; }
  h1 { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: 0.34em; text-transform: uppercase; color: var(--ink-2); }
  .to { margin: 6px 0 22px; font-size: 11px; color: var(--ink-3); word-break: break-all; }
  .code { font-size: 54px; letter-spacing: 0.20em; text-indent: 0.20em; line-height: 1.1; color: var(--ink); }
  .track { height: 2px; background: var(--line); margin: 18px 0 8px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); width: 100%; transition: width 0.9s linear; }
  .left { font-size: 11px; color: var(--ink-3); display: flex; justify-content: space-between; }
  .next { margin-top: 16px; font-size: 11px; color: var(--ink-3); min-height: 15px; }
  .next b { color: var(--ink-2); font-weight: 400; letter-spacing: 0.14em; }
  .note { margin: 22px 0 0; padding-top: 16px; border-top: 1px solid var(--line); font-size: 10.5px; line-height: 1.7; color: var(--ink-3); }
  .copy { margin-top: 14px; font: inherit; font-size: 11px; color: var(--ink-2); background: none; border: 1px solid var(--line-2); padding: 7px 12px; cursor: pointer; }
  .copy:hover { border-color: var(--ink-3); color: var(--ink); }
  .copy.done { color: var(--good); border-color: var(--good); }
</style>
</head>
<body>
  <div class="card">
    <h1>authenticator</h1>
    <div class="to">the admin door${EMAIL ? " · " + EMAIL : ""}</div>
    <div class="code" id="code">····</div>
    <div class="track"><div class="fill" id="fill"></div></div>
    <div class="left"><span>rolls every 30 minutes</span><span id="left">–</span></div>
    <div class="next" id="next"></div>
    <button class="copy" id="copy">copy</button>
    <p class="note">
      Type this where the game asks for the code. A new one appears every thirty
      minutes, and the game also honours the one either side of what it thinks
      the time is — so this still works if the clock here and the clock there
      disagree, which they will.<br><br>
      Nothing is sent anywhere and nothing is stored — this page works out the
      same number the game does, from the clock. Keep it to yourself.
    </p>
  </div>
<script>
${authcode}
</script>
<script>
(function () {
  var codeEl = document.getElementById('code');
  var fillEl = document.getElementById('fill');
  var leftEl = document.getElementById('left');
  var nextEl = document.getElementById('next');
  var copyEl = document.getElementById('copy');
  var A = VF.authcode;

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function tick() {
    var now = Date.now();
    var code = A.current(now);
    if (codeEl.textContent !== code) codeEl.textContent = code;
    var ms = A.remaining(now);
    var secs = Math.ceil(ms / 1000);
    leftEl.textContent = Math.floor(secs / 60) + ':' + two(secs % 60);
    fillEl.style.width = (ms / A.WINDOW_MS * 100).toFixed(2) + '%';
    // the one after this, once it is close enough to matter
    nextEl.innerHTML = ms < 120000
      ? 'next: <b>' + A.codeForWindow(A.windowAt(now) + 1) + '</b>'
      : '';
    copyEl.dataset.code = code;
  }

  copyEl.addEventListener('click', function () {
    var code = copyEl.dataset.code || '';
    function done() { copyEl.textContent = 'copied'; copyEl.classList.add('done');
      setTimeout(function () { copyEl.textContent = 'copy'; copyEl.classList.remove('done'); }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      // clipboard access is blocked on file:// in some browsers; select it instead
      var r = document.createRange();
      r.selectNodeContents(codeEl);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      copyEl.textContent = 'select + copy'; copyEl.classList.add('done');
      setTimeout(function () { copyEl.textContent = 'copy'; copyEl.classList.remove('done'); }, 1800);
    }
  });

  tick();
  setInterval(tick, 500);
})();
</script>
</body>
</html>
`;

const out = path.join(root, 'dist', 'void-fishing-authenticator.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(root, out), (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
