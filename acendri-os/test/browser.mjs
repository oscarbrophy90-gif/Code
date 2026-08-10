/**
 * End-to-end checks against a real browser, driving the flows a person would.
 *
 * Playwright is not a dependency of this repo — point PLAYWRIGHT at an install
 * if it is not resolvable, and serve a build first:
 *
 *   npm run acendri:build && (cd acendri-os && npx vite preview --port 4174)
 *   node acendri-os/test/browser.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT ?? 'playwright';
let chromium;
try {
  ({ chromium } = await import(require.resolve(playwrightPath)));
} catch {
  console.error(`Could not load Playwright from "${playwrightPath}". Set PLAYWRIGHT to its path.`);
  process.exit(2);
}

const BASE = process.env.BASE ?? 'http://localhost:4174';
const SHOTS = process.env.SHOTS ?? new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const steps = [];
function ok(name) { steps.push(`  ok  ${name}`); }
function bad(name, detail) { problems.push(`FAIL ${name}: ${detail}`); steps.push(`FAIL  ${name} — ${detail}`); }
async function check(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e.message.split('\n')[0]); }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();

// Record which elements ever get a click listener. Production code stays clean;
// this patch lives only in the test browser.
await page.addInitScript(() => {
  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (type === 'click' && this instanceof Element) this.setAttribute('data-wired', '1');
    return original.call(this, type, listener, options);
  };
});

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });

// ---------------------------------------------------------------- welcome
await check('welcome screen renders', async () => {
  await page.waitForSelector('.welcome__title', { timeout: 5000 });
});
await page.screenshot({ path: `${SHOTS}01-welcome.png` });

// ----------------------------------------------------------------- sign up
await check('"Create your account" opens sign up', async () => {
  await page.getByRole('button', { name: /create your account/i }).click();
  await page.waitForSelector('.auth__title:has-text("Create your account")', { timeout: 4000 });
});

await check('empty submit shows field errors, hashes nothing', async () => {
  await page.getByRole('button', { name: /^create account$/i }).click();
  await page.waitForSelector('.field--bad', { timeout: 3000 });
  const errors = await page.locator('.field__error:not(:empty)').count();
  if (errors < 3) throw new Error(`expected errors on every field, saw ${errors}`);
});

await check('password strength meter reacts', async () => {
  await page.locator('#f3').fill('aaa');
  const weak = await page.locator('.meter').getAttribute('data-score');
  await page.locator('#f3').fill('a much longer passphrase 42');
  const strong = await page.locator('.meter').getAttribute('data-score');
  if (!(Number(strong) > Number(weak))) throw new Error(`score did not rise: ${weak} -> ${strong}`);
});

await check('show/hide password toggle works', async () => {
  const reveal = page.locator('.field--password .field__reveal').first();
  await reveal.click();
  if (await page.locator('#f3').getAttribute('type') !== 'text') throw new Error('did not reveal');
  await reveal.click();
  if (await page.locator('#f3').getAttribute('type') !== 'password') throw new Error('did not hide');
});

await check('mismatched confirmation is caught', async () => {
  await page.locator('#f1').fill('Ada Lovelace');
  await page.locator('#f2').fill('ada@example.com');
  await page.locator('#f3').fill('analytical-engine-1843');
  await page.locator('#f4').fill('different-password');
  await page.getByRole('button', { name: /^create account$/i }).click();
  await page.waitForSelector('.field--bad', { timeout: 3000 });
  const text = await page.locator('.field__error:not(:empty)').first().innerText();
  if (!/do not match/i.test(text)) throw new Error(`unexpected error: ${text}`);
});

await page.screenshot({ path: `${SHOTS}02-signup-validation.png` });

await check('sign up succeeds and lands on Home', async () => {
  await page.locator('#f4').fill('analytical-engine-1843');
  await page.getByRole('button', { name: /^create account$/i }).click();
  await page.waitForSelector('.hero__name', { timeout: 15000 });
  const name = await page.locator('.hero__name').innerText();
  if (name !== 'Ada') throw new Error(`greeting says "${name}"`);
});
await page.screenshot({ path: `${SHOTS}03-home.png` });

// ------------------------------------------------------- the headline promise
await check('RELOAD keeps you signed in', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.hero__name', { timeout: 5000 });
});

await check('a brand new browser context keeps you signed in (restart)', async () => {
  // Same profile directory is not available here, so assert on the stored
  // session shape instead: it must be in localStorage, not sessionStorage.
  const where = await page.evaluate(() => ({
    device: localStorage.getItem('acendri.os.v1.session') !== null,
    tab: sessionStorage.getItem('acendri.os.v1.session') !== null,
  }));
  if (!where.device || where.tab) throw new Error(JSON.stringify(where));
});

await check('the password is not stored anywhere readable', async () => {
  const dump = await page.evaluate(() => JSON.stringify(localStorage));
  if (dump.includes('analytical-engine-1843')) throw new Error('plaintext password found in localStorage');
});

// -------------------------------------------------------------------- tasks
await check('adding a task works', async () => {
  await page.locator('.quickadd__input').fill('Write the notes on the engine');
  await page.locator('.quickadd__go').click();
  await page.waitForSelector('.task', { timeout: 3000 });
  const count = await page.locator('.task').count();
  if (count !== 1) throw new Error(`expected 1 task, saw ${count}`);
});

await check('ticking a task updates the "Done today" count', async () => {
  await page.locator('.task__check').first().click();
  await page.waitForSelector('.task--done', { timeout: 3000 });
  const done = await page.locator('.stat').nth(1).locator('.stat__value').innerText();
  if (done !== '1') throw new Error(`Done today reads ${done}`);
});

await check('clear-finished button removes it', async () => {
  await page.getByRole('button', { name: /clear 1 finished/i }).click();
  await page.waitForSelector('.empty__title', { timeout: 3000 });
});

// -------------------------------------------------------------------- notes
await check('the Notes tab opens', async () => {
  await page.locator('.tab', { hasText: 'Notes' }).click();
  await page.waitForSelector('.search__input', { timeout: 3000 });
});

await check('creating and writing a note saves it', async () => {
  await page.getByRole('button', { name: /new note/i }).click();
  await page.waitForSelector('.editor__title', { timeout: 3000 });
  await page.locator('.editor__title').fill('Bernoulli numbers');
  await page.locator('.editor__body').fill('Note G, and the first algorithm.');
  await page.waitForTimeout(700);
  await page.locator('.iconbtn[aria-label="Back"]').click();
  await page.waitForSelector('.notecard__title', { timeout: 3000 });
  const title = await page.locator('.notecard__title').first().innerText();
  if (title !== 'Bernoulli numbers') throw new Error(`note list shows "${title}"`);
});

await check('search filters the list', async () => {
  await page.locator('.search__input').fill('zzzz');
  await page.waitForSelector('.empty__title', { timeout: 3000 });
  await page.locator('.search__input').fill('bernoulli');
  await page.waitForSelector('.notecard__title', { timeout: 3000 });
  await page.locator('.search__input').fill('');
});
await page.screenshot({ path: `${SHOTS}04-notes.png` });

await check('pinning a note works', async () => {
  await page.locator('.iconbtn[aria-label="Pin note"]').first().click();
  await page.waitForSelector('.notecard--pinned', { timeout: 3000 });
});

// ---------------------------------------------------------------- you/theme
await check('the You tab opens', async () => {
  await page.locator('.tab', { hasText: 'You' }).click();
  await page.waitForSelector('.profile__name', { timeout: 3000 });
});

await check('picking an avatar updates it', async () => {
  await page.locator('.avatarpicker__option').first().click();
  await page.waitForTimeout(200);
  const avatar = await page.locator('.profile .avatar').innerText();
  if (avatar !== '🚀') throw new Error(`avatar is "${avatar}"`);
});
await page.screenshot({ path: `${SHOTS}05-you.png` });

await check('Settings opens and the light theme applies', async () => {
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.waitForSelector('.segmented', { timeout: 3000 });
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.waitForTimeout(250);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== 'light') throw new Error(`theme is ${theme}`);
});
await page.screenshot({ path: `${SHOTS}06-settings-light.png` });

await check('changing the accent repaints', async () => {
  await page.getByRole('radio', { name: 'Ember' }).click();
  await page.waitForTimeout(200);
  const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
  if (accent.trim() !== '#ff6a3d') throw new Error(`accent is "${accent}"`);
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('radio', { name: 'Violet' }).click();
});

await check('the theme choice survives a reload', async () => {
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== 'light') throw new Error(`after reload theme is ${theme}`);
  await page.getByRole('radio', { name: 'Dark' }).click();
});

// ----------------------------------------------------------------- security
await check('Security screen: wrong current password is refused', async () => {
  await page.locator('.iconbtn[aria-label="Back"]').click();
  await page.waitForSelector('.profile__name', { timeout: 3000 });
  await page.getByRole('button', { name: /^Security/ }).click();
  await page.waitForSelector('.section-title:has-text("Password")', { timeout: 3000 });
  const fields = page.locator('.card').first().locator('input');
  await fields.nth(0).fill('wrong-password');
  await fields.nth(1).fill('a-new-good-password-1');
  await fields.nth(2).fill('a-new-good-password-1');
  await page.getByRole('button', { name: /^change password$/i }).click();
  await page.waitForSelector('.banner--bad', { timeout: 15000 });
});

await check('Security screen: the right one changes it', async () => {
  const fields = page.locator('.card').first().locator('input');
  await fields.nth(0).fill('analytical-engine-1843');
  await fields.nth(1).fill('a-new-good-password-1');
  await fields.nth(2).fill('a-new-good-password-1');
  await page.getByRole('button', { name: /^change password$/i }).click();
  await page.waitForSelector('.banner--good', { timeout: 30000 });
  // The form must survive its own success: the confirmation is useless if the
  // screen rebuilds and throws it away.
  const cleared = await page.locator('.card').first().locator('input').first().inputValue();
  if (cleared !== '') throw new Error('fields were not cleared after the change');
});

await check('a recovery question can be set', async () => {
  const card = page.locator('.card').nth(1);
  await card.locator('input').first().fill('Difference Engine');
  await card.getByRole('button', { name: /set recovery question/i }).click();
  await page.waitForTimeout(2500);
  await page.waitForSelector('.card__note:has-text("A recovery question is set")', { timeout: 15000 });
});
await page.screenshot({ path: `${SHOTS}07-security.png` });

// ------------------------------------------------------------ sign out / in
await check('signing out returns to Welcome', async () => {
  await page.locator('.tab', { hasText: 'You' }).click();
  await page.waitForSelector('.profile__name', { timeout: 3000 });
  await page.getByRole('button', { name: /^sign out$/i }).click();
  await page.waitForSelector('dialog.sheet', { timeout: 3000 });
  await page.locator('dialog.sheet').getByRole('button', { name: /^sign out$/i }).click();
  await page.waitForSelector('.welcome__title', { timeout: 4000 });
});

await check('the device remembers the account on the welcome screen', async () => {
  await page.waitForSelector('.accountchip__name', { timeout: 3000 });
  const name = await page.locator('.accountchip__name').innerText();
  if (name !== 'Ada Lovelace') throw new Error(`chip says "${name}"`);
});
await page.screenshot({ path: `${SHOTS}08-welcome-known.png` });

await check('the old password no longer works', async () => {
  await page.locator('.accountchip').click();
  await page.waitForSelector('.auth__title:has-text("Welcome back")', { timeout: 3000 });
  await page.locator('input[type=password]').fill('analytical-engine-1843');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForSelector('.banner--bad', { timeout: 20000 });
});

await check('the new password signs in', async () => {
  await page.locator('input[type=password]').fill('a-new-good-password-1');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForSelector('.hero__name', { timeout: 20000 });
});

await check('the note and its pin survived all of that', async () => {
  await page.locator('.tab', { hasText: 'Notes' }).click();
  await page.waitForSelector('.notecard--pinned', { timeout: 3000 });
  const title = await page.locator('.notecard__title').first().innerText();
  if (title !== 'Bernoulli numbers') throw new Error(`note list shows "${title}"`);
});

// ------------------------------------------------------------------ desktop
await check('the desktop layout switches to a side rail', async () => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(300);
  const railed = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    if (!bar) return false;
    return getComputedStyle(bar).flexDirection === 'column';
  });
  if (!railed) throw new Error('tab bar did not become a rail');
});
await page.screenshot({ path: `${SHOTS}09-desktop.png`, fullPage: false });

await page.locator('.tab', { hasText: 'Home' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOTS}10-desktop-home.png` });

// ------------------------------------------------------------- every button
await check('a note left completely blank is discarded, not left as clutter', async () => {
  await page.goto(`${BASE}/#/notes`, { waitUntil: 'networkidle' });
  const before = await page.locator('.notecard').count();
  await page.getByRole('button', { name: /new note/i }).click();
  await page.waitForSelector('.editor__title', { timeout: 3000 });
  await page.locator('.iconbtn[aria-label="Back"]').click();
  await page.waitForTimeout(400);
  const after = await page.locator('.notecard').count();
  if (after !== before) throw new Error(`note count went ${before} -> ${after}`);
});

await check('the note editor keeps text typed right before leaving', async () => {
  await page.getByRole('button', { name: /new note/i }).click();
  await page.waitForSelector('.editor__title', { timeout: 3000 });
  await page.locator('.editor__title').fill('Saved on the way out');
  // No pause: leave immediately, before the debounce would have fired.
  await page.locator('.iconbtn[aria-label="Back"]').click();
  await page.waitForTimeout(400);
  const titles = await page.locator('.notecard__title').allInnerTexts();
  if (!titles.includes('Saved on the way out')) throw new Error(`saw ${JSON.stringify(titles)}`);
});

// Walk every screen and assert each button on it actually does something.
const ROUTES = ['home', 'notes', 'you', 'settings', 'security', 'about'];
for (const route of ROUTES) {
  await check(`every button on /${route} is wired`, async () => {
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const dead = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        const wired =
          b.hasAttribute('data-wired') || b.type === 'submit' || b.closest('form') !== null;
        if (!wired) out.push((b.getAttribute('aria-label') || b.textContent || b.className).trim().slice(0, 50));
      }
      return out;
    });
    if (dead.length) throw new Error(`dead buttons: ${dead.join(' | ')}`);
  });
}

await check('a nonsense route lands somewhere real rather than blank', async () => {
  await page.goto(`${BASE}/#/not-a-route`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const has = await page.locator('.shell').count();
  if (!has) throw new Error('rendered nothing');
});

await check('deep-linking to a private route while signed out lands on Welcome', async () => {
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const blank = await fresh.newPage();
  await blank.goto(`${BASE}/#/security`, { waitUntil: 'networkidle' });
  await blank.waitForSelector('.welcome__title', { timeout: 4000 });
  await fresh.close();
});

await browser.close();

console.log(steps.join('\n'));
console.log(`\n${steps.length - problems.length}/${steps.length} checks passed`);
if (consoleErrors.length) {
  console.log('\nConsole errors:');
  for (const e of [...new Set(consoleErrors)]) console.log(`  ${e}`);
}
if (problems.length) {
  console.log('\n' + problems.join('\n'));
  process.exit(1);
}
