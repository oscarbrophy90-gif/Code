/**
 * Password hashing: PBKDF2-HMAC-SHA-256, salted per account.
 *
 * Passwords are never stored, and never kept in memory past the call that
 * checks them. What lands on disk is a salt, an iteration count and a derived
 * key, so someone reading localStorage cannot read the password.
 *
 * There are two backends. WebCrypto does the work natively wherever it is
 * offered. It is only offered in a secure context, and a file:// document is
 * not a secure context in every browser — so the single-file build needs a
 * fallback, and that fallback is a plain-JavaScript SHA-256 below. The
 * iteration count is chosen per backend and *stored with the record*, so a
 * password hashed on one backend still verifies on the other.
 */

const WEBCRYPTO_ITERATIONS = 210_000; // OWASP's floor for PBKDF2-SHA256.
const FALLBACK_ITERATIONS = 25_000; // Hand-rolled SHA-256 is ~50x slower.
const KEY_BYTES = 32;
const SALT_BYTES = 16;

export type PasswordRecord = {
  alg: 'pbkdf2-sha256';
  iterations: number;
  salt: string; // base64
  hash: string; // base64
};

const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;

/** True when the browser gave us native crypto; the fallback is slower but equivalent. */
export const usingNativeCrypto = Boolean(subtle);

// ---------------------------------------------------------------- primitives

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  // Only reachable on a browser with no Web Crypto at all. Weak, but the
  // alternative is refusing to run.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A URL-safe opaque id, used for user ids and session tokens. */
export function randomId(bytes = 16): string {
  return toBase64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Compares in time that does not depend on where the first difference is, so a
 * bad hash cannot be found one byte at a time.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ------------------------------------------------------- SHA-256 in JS (fallback)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Compresses whole 64-byte blocks of `data` into `state`, in place. */
function sha256Blocks(state: Uint32Array, data: Uint8Array, w: Uint32Array): void {
  for (let off = 0; off + 64 <= data.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) >>> 0;
      const s1 = (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [h0, h1, h2, h3, h4, h5, h6, h7] = state;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(h4, 6) ^ rotr(h4, 11) ^ rotr(h4, 25)) >>> 0;
      const ch = ((h4 & h5) ^ (~h4 & h6)) >>> 0;
      const t1 = (h7 + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(h0, 2) ^ rotr(h0, 13) ^ rotr(h0, 22)) >>> 0;
      const maj = ((h0 & h1) ^ (h0 & h2) ^ (h1 & h2)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h7 = h6;
      h6 = h5;
      h5 = h4;
      h4 = (h3 + t1) >>> 0;
      h3 = h2;
      h2 = h1;
      h1 = h0;
      h0 = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + h0) >>> 0;
    state[1] = (state[1] + h1) >>> 0;
    state[2] = (state[2] + h2) >>> 0;
    state[3] = (state[3] + h3) >>> 0;
    state[4] = (state[4] + h4) >>> 0;
    state[5] = (state[5] + h5) >>> 0;
    state[6] = (state[6] + h6) >>> 0;
    state[7] = (state[7] + h7) >>> 0;
  }
}

export function sha256(message: Uint8Array): Uint8Array {
  const bitLen = message.length * 8;
  // Message + 0x80 + zero padding to 56 mod 64 + an 8-byte big-endian length.
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  // Lengths beyond 2^32 bits cannot occur here; the high word stays zero.
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x1_0000_0000), false);

  const state = INIT.slice();
  sha256Blocks(state, padded, new Uint32Array(64));

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, state[i], false);
  return out;
}

/**
 * HMAC-SHA-256 with the key block prepared once. PBKDF2 calls this tens of
 * thousands of times with the same key, so re-deriving the pads each time would
 * double the work.
 */
function hmacPads(key: Uint8Array): { inner: Uint8Array; outer: Uint8Array } {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64);
  const outer = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  return { inner, outer };
}

function hmac(pads: { inner: Uint8Array; outer: Uint8Array }, message: Uint8Array): Uint8Array {
  const a = new Uint8Array(64 + message.length);
  a.set(pads.inner);
  a.set(message, 64);
  const innerHash = sha256(a);
  const b = new Uint8Array(96);
  b.set(pads.outer);
  b.set(innerHash, 64);
  return sha256(b);
}

/** Hands the main thread back so a long derivation cannot freeze the UI. */
function breathe(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Exported so the test suite can hold it against Node's native PBKDF2. The two
 * backends must agree byte for byte or an account made in one browser would
 * refuse to open in another.
 */
export async function pbkdf2Js(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const pads = hmacPads(password);
  const out = new Uint8Array(KEY_BYTES);
  const blocks = Math.ceil(KEY_BYTES / 32);

  for (let block = 1; block <= blocks; block++) {
    const seed = new Uint8Array(salt.length + 4);
    seed.set(salt);
    new DataView(seed.buffer).setUint32(salt.length, block, false);

    let u = hmac(pads, seed);
    const acc = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmac(pads, u);
      for (let j = 0; j < 32; j++) acc[j] ^= u[j];
      // Every few thousand rounds, let the browser paint and stay responsive.
      if (i % 2_000 === 0) {
        onProgress?.((block - 1 + i / iterations) / blocks);
        await breathe();
      }
    }
    out.set(acc.subarray(0, Math.min(32, KEY_BYTES - (block - 1) * 32)), (block - 1) * 32);
  }
  onProgress?.(1);
  return out;
}

async function pbkdf2Native(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await subtle!.importKey('raw', password as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle!.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(password.normalize('NFKC'));
  return subtle
    ? pbkdf2Native(bytes, salt, iterations)
    : pbkdf2Js(bytes, salt, iterations, onProgress);
}

// --------------------------------------------------------------- public API

export async function hashPassword(
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<PasswordRecord> {
  const salt = randomBytes(SALT_BYTES);
  const iterations = subtle ? WEBCRYPTO_ITERATIONS : FALLBACK_ITERATIONS;
  const hash = await derive(password, salt, iterations, onProgress);
  return { alg: 'pbkdf2-sha256', iterations, salt: toBase64(salt), hash: toBase64(hash) };
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  if (record?.alg !== 'pbkdf2-sha256') return false;
  try {
    // The record's own iteration count, not today's default — otherwise an
    // account made on the fallback backend could never log in on the native one.
    const hash = await derive(password, fromBase64(record.salt), record.iterations, onProgress);
    return constantTimeEqual(hash, fromBase64(record.hash));
  } catch {
    return false;
  }
}
