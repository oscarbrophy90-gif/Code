/**
 * Builds a single self-contained HTML file you can double-click to play — no
 * Node, no terminal, no server.
 *
 * Vite's normal output loads its JS and CSS as separate files, which a browser
 * refuses to fetch over file:// for security reasons. So we bundle to a classic
 * (non-module) script and inline everything into one document.
 */
import { build } from 'vite';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'standalone-build');
const finalDir = join(here, '..', 'dist-standalone');
const finalFile = join(finalDir, 'HoopsElite.html');

await rm(outDir, { recursive: true, force: true });

await build({
  root: here,
  base: './',
  resolve: {
    alias: { '@hoops/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  // Baked in so a shared build already knows where the server is.
  define: {
    __HOOPS_SERVER_URL__: JSON.stringify(process.env.HOOPS_SERVER_URL ?? ''),
  },
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

// Drop the external references, then re-add the code inline.
html = html.replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>/, '');
html = html.replace(/<link[^>]*href="[^"]*app\.css"[^>]*>/, () => (css ? `<style>\n${css}\n</style>` : ''));

// Vite hoists the bundle into <head>. A module script is deferred and would be
// fine there, but a classic script is not — it would run before <div id="app">
// exists. So the inline bundle goes last in <body>.
// A function replacement, not a string one. `String.replace` treats `$&`, `$'`
// and `` $` `` in a *string* replacement as substitution patterns, and the
// bundle contains `` $` `` — which silently spliced the whole document head
// into the middle of the JavaScript. A function argument is taken literally.
html = html.replace('</body>', () => `<script>\n${js}\n</script>\n</body>`);

if (html.includes('app.js')) throw new Error('failed to inline the script bundle');
// Cheap proof the splice did not corrupt the bundle: the document's own doctype
// must not appear inside the script it wrapped.
{
  const from = html.indexOf('<script>');
  const to = html.lastIndexOf('</script>');
  if (html.slice(from + 8, to).includes('doctype html')) {
    throw new Error('the inlined bundle was corrupted by a substitution pattern');
  }
}
if (!html.includes('</script>\n</body>')) throw new Error('failed to place the inline bundle in <body>');

await mkdir(finalDir, { recursive: true });
await writeFile(finalFile, html, 'utf8');
await rm(outDir, { recursive: true, force: true });

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`\n  Standalone build ready: dist-standalone/HoopsElite.html (${kb} kB)`);
console.log('  Double-click it, or drag it into any browser. No server needed.\n');
