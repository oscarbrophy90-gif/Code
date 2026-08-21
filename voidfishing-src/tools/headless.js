/* Minimal browser shim so game modules can be loaded and exercised in node. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const store = {};
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  Math, Date, JSON, parseInt, parseFloat, isFinite, isNaN, Infinity, NaN,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  unescape, encodeURIComponent, decodeURIComponent,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: {
    createElement: () => ({ style: {}, classList: { add(){}, remove(){}, toggle(){} }, appendChild(){}, setAttribute(){}, getContext: () => null }),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){}, body: { appendChild(){}, classList:{add(){},remove(){}} },
    visibilityState: 'visible'
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
vm.createContext(sandbox);

function load(files) {
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    try { vm.runInContext(src, sandbox, { filename: f }); }
    catch (e) { console.error('FAILED loading ' + f + ': ' + e.message); throw e; }
  }
  return sandbox.VF;
}
module.exports = { load, sandbox, store };
