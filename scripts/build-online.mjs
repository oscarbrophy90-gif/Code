/**
 * Builds a copy of the game that already knows where your server is.
 *
 * The point of this script is the thing that otherwise trips people up: online
 * play needs both players pointed at the same server, and telling a friend to
 * open Settings and paste an address is a step most of them will not complete.
 * A build made here has the address baked in, so the copy you send them just
 * works.
 *
 *   node scripts/build-online.mjs wss://your-server.fly.dev
 *
 * It checks the address answers before building, because a build with a typo in
 * it looks exactly like a build with nobody online.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/build-online.mjs <server-url>');
  console.error('   eg: node scripts/build-online.mjs wss://hoops-elite.fly.dev');
  console.error('       node scripts/build-online.mjs ws://192.168.1.20:8787');
  process.exit(1);
}

// Accept what people actually paste. A host on its own, or an https:// URL
// copied out of a browser, are both obviously meant to be the game server.
let url = raw.trim().replace(/\/+$/, '');
if (/^https:\/\//.test(url)) url = url.replace(/^https:/, 'wss:');
else if (/^http:\/\//.test(url)) url = url.replace(/^http:/, 'ws:');
else if (!/^wss?:\/\//.test(url)) {
  // A bare host is a deployed server and those are behind TLS — except on your
  // own machine or your own network, which never are. Guessing wss:// for
  // localhost sends you to a port that is not speaking TLS and fails in a way
  // that looks like the server being down.
  const host = url.split(':')[0];
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  url = `${local ? 'ws' : 'wss'}://${url}`;
}

const httpUrl = url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');

console.log(`Checking ${url} …`);
let reachable = false;
try {
  const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(8000) });
  const info = await res.json();
  if (!info.ok) throw new Error('server did not report ok');
  console.log(`  answered: protocol v${info.version}, ${info.sessions} connected, ${info.rooms} match(es) running`);
  reachable = true;
} catch (err) {
  console.log(`  no answer (${err instanceof Error ? err.message : err})`);
}

if (!reachable) {
  // Not fatal: you may well be building before you deploy. But it is said
  // loudly, because "nobody is ever online" is what a wrong address looks like
  // from inside the game.
  console.log('');
  console.log('  WARNING: that address did not answer. Building anyway, but if the');
  console.log('  server is not there when someone plays, they will only ever see');
  console.log('  "no game found". Check the address and rebuild once it is up.');
  console.log('');
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, HOOPS_SERVER_URL: url },
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

await run('npm', ['run', 'build:standalone']);

console.log('');
console.log(`Built for ${url}`);
console.log('  dist-standalone/HoopsElite.html');
console.log('');
console.log('Send that one file to whoever you want to play. They open it, make a');
console.log('player, walk into a park and step on a court — the same court as you.');
