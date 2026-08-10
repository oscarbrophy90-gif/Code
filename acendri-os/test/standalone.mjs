/**
 * Checks the single-file build the way someone actually opens it: straight off
 * the disk, over file://. Runs twice — once with the browser's WebCrypto, and
 * once with it removed, which is the case the built-in PBKDF2 exists for.
 *
 *   npm run acendri:standalone && node acendri-os/test/standalone.mjs
 */
import { pathToFileURL } from 'node:url';
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

const FILE = pathToFileURL(
  new URL('../../dist-standalone/AcendriOS.html', import.meta.url).pathname,
).href;
const results = [];
const fails = [];

async function run(label, { killSubtle }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  if (killSubtle) {
    // Prove the pure-JavaScript PBKDF2 path really works in a browser, not just
    // under Node. Some browsers do not expose WebCrypto on file:// at all.
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'subtle', { get: () => undefined, configurable: true });
    });
  }

  const started = Date.now();
  await page.goto(FILE);
  await page.waitForSelector('.welcome__title', { timeout: 8000 });

  await page.getByRole('button', { name: /create your account/i }).click();
  await page.waitForSelector('.auth__title', { timeout: 4000 });
  await page.locator('#f1').fill('Grace Hopper');
  await page.locator('#f2').fill('grace@example.com');
  await page.locator('#f3').fill('compiler-nineteen-52');
  await page.locator('#f4').fill('compiler-nineteen-52');
  await page.getByRole('button', { name: /^create account$/i }).click();
  await page.waitForSelector('.hero__name', { timeout: 120000 });

  const hashMs = Date.now() - started;

  // Reload from disk: the session must still be there.
  await page.reload();
  await page.waitForSelector('.hero__name', { timeout: 10000 });

  // Sign out and back in, exercising verification on the same backend.
  await page.locator('.tab', { hasText: 'You' }).click();
  await page.waitForSelector('.profile__name', { timeout: 4000 });
  await page.getByRole('button', { name: /^sign out$/i }).click();
  await page.locator('dialog.sheet').getByRole('button', { name: /^sign out$/i }).click();
  await page.waitForSelector('.welcome__title', { timeout: 5000 });
  await page.locator('.accountchip').click();
  await page.locator('input[type=password]').fill('compiler-nineteen-52');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForSelector('.hero__name', { timeout: 120000 });

  const backend = await page.evaluate(() => (window.crypto?.subtle ? 'WebCrypto' : 'JavaScript fallback'));
  await browser.close();

  if (errors.length) fails.push(`${label}: console errors ${JSON.stringify([...new Set(errors)])}`);
  results.push(`  ok  ${label} — ${backend}, signup+reload+signout+signin in ${(hashMs / 1000).toFixed(1)}s`);
}

try {
  await run('single file over file://', { killSubtle: false });
  await run('single file with WebCrypto removed', { killSubtle: true });
} catch (e) {
  fails.push(e.message.split('\n')[0]);
}

console.log(results.join('\n'));
if (fails.length) { console.log('\nFAILURES:\n' + fails.join('\n')); process.exit(1); }
console.log('\nstandalone build verified');
