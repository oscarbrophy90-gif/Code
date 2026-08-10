/**
 * Builds Acendri OS into one self-contained HTML file you can open straight off
 * the disk — no Node, no terminal, no server.
 *
 * Vite's normal output loads its JS and CSS as separate files, which a browser
 * refuses to fetch over file:// . So the bundle is emitted as a classic script
 * and spliced into the document, stylesheet and all.
 */
import { build } from 'vite';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'standalone-build');
const finalDir = join(here, '..', 'dist-standalone');
const finalFile = join(finalDir, 'AcendriOS.html');

await rm(outDir, { recursive: true, force: true });

await build({
  root: here,
  base: './',
  build: {
    target: 'es2019',
    outDir,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // A classic script works from file://; an ES module does not.
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
  logLevel: 'warn',
});

let html = await readFile(join(outDir, 'index.html'), 'utf8');
const js = await readFile(join(outDir, 'app.js'), 'utf8');

let css = '';
try {
  css = await readFile(join(outDir, 'app.css'), 'utf8');
} catch {
  // Vite may have inlined the stylesheet already.
}

html = html.replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/, '');
html = html.replace(/<link[^>]*href="[^"]*app\.css"[^>]*>/, () => (css ? `<style>\n${css}\n</style>` : ''));

// Vite hoists the bundle into <head>. A deferred module script would be fine
// there; a classic script is not — it would run before <div id="app"> exists.
// Function replacements, not string ones: `$&`, `$'` and "$`" in a string
// replacement are substitution patterns, and a JS bundle contains them.
html = html.replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);

if (html.includes('app.js')) throw new Error('failed to inline the script bundle');
if (!html.includes('</script>\n</body>')) throw new Error('failed to place the bundle in <body>');
{
  // Cheap proof the splice did not corrupt the bundle: the document's own
  // doctype must not have been spliced into the script it wrapped.
  const from = html.indexOf('<script>');
  const to = html.lastIndexOf('</script>');
  if (html.slice(from + 8, to).includes('doctype html')) {
    throw new Error('the inlined bundle was corrupted by a substitution pattern');
  }
}

await mkdir(finalDir, { recursive: true });
await writeFile(finalFile, html, 'utf8');
await rm(outDir, { recursive: true, force: true });

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`\n  Standalone build ready: dist-standalone/AcendriOS.html (${kb} kB)`);
console.log('  Double-click it, or drag it into any browser. No server needed.\n');
