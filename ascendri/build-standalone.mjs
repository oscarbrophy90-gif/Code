/* Bundles Acendri OS into one self-contained HTML file.
   Usage: node ascendri/build-standalone.mjs
   Output: ascendri/AcendriOS.html — no server, no install, no network. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

const indexHTML = read('index.html');

// Script tags are loaded in the order index.html declares them, so the bundle
// can never drift from the app that runs against the local server.
const scripts = [...indexHTML.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no script tags found in index.html');

const css = read('styles.css');
const js = scripts.map((src) => `/* ===== ${src} ===== */\n${read(src)}`).join('\n');

// A literal </script> inside the inlined source would close the tag early.
const guard = (s, what) => {
  if (/<\/script/i.test(s)) throw new Error(`${what} contains a </script sequence — escape it before inlining`);
  return s;
};

const head = indexHTML.slice(indexHTML.indexOf('<head>') + 6, indexHTML.indexOf('</head>'));
const meta = head
  .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
  .trim();

const out = `<!DOCTYPE html>
<html lang="en">
<head>
${meta}
<style>
${guard(css, 'styles.css')}
</style>
</head>
<body>
<div id="root"></div>
<script>
${guard(js, 'app javascript')}
window.Ascendri.boot();
</script>
</body>
</html>
`;

writeFileSync(join(here, 'AcendriOS.html'), out);
console.log(`AcendriOS.html — ${(out.length / 1024).toFixed(0)} KB, ${scripts.length} modules inlined`);
