/**
 * Every byte Acendri OS keeps on the device goes through here.
 *
 * Two things this buys us. First, one namespace (`acendri.os.v1.*`) so the app
 * can be dropped onto a page that already uses localStorage without either side
 * standing on the other. Second, a real answer when storage is missing: Safari
 * private browsing and some embedded webviews either hide localStorage or throw
 * on the first write, and an app that crashes there is worse than one that runs
 * for the session and says so.
 */

const PREFIX = 'acendri.os.v1.';

export type Durability = 'device' | 'tab';

/** A Storage-shaped object that lives in memory, for when the real one is gone. */
function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/**
 * Probe rather than trust. `window.localStorage` can exist and still throw on
 * access or on the first `setItem`, so the only reliable test is a round trip.
 */
function probe(pick: () => Storage): { store: Storage; real: boolean } {
  try {
    const store = pick();
    const key = `${PREFIX}__probe`;
    store.setItem(key, '1');
    store.removeItem(key);
    return { store, real: true };
  } catch {
    return { store: memoryStore(), real: false };
  }
}

const device = probe(() => window.localStorage);
const tab = probe(() => window.sessionStorage);

/** False when the browser denied us persistent storage; the UI warns about it. */
export const storageIsPersistent = device.real;

function backing(where: Durability): Storage {
  return where === 'tab' ? tab.store : device.store;
}

export function readRaw(key: string, where: Durability = 'device'): string | null {
  try {
    return backing(where).getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string, where: Durability = 'device'): boolean {
  try {
    backing(where).setItem(PREFIX + key, value);
    return true;
  } catch {
    // Quota exhausted, or storage revoked mid-session. Callers decide whether
    // that is fatal; most of them can carry on with what is already in memory.
    return false;
  }
}

export function remove(key: string, where: Durability = 'device'): void {
  try {
    backing(where).removeItem(PREFIX + key);
  } catch {
    /* nothing sensible to do */
  }
}

/**
 * Read JSON, and treat anything unparseable as absent rather than throwing.
 * A half-written record from a killed tab should cost you that record, not the
 * whole app.
 */
export function readJSON<T>(key: string, fallback: T, where: Durability = 'device'): T {
  const raw = readRaw(key, where);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown, where: Durability = 'device'): boolean {
  try {
    return writeRaw(key, JSON.stringify(value), where);
  } catch {
    return false;
  }
}

/** Wipes only our own keys — never anything another app on the origin owns. */
export function clearAll(): void {
  for (const where of ['device', 'tab'] as const) {
    const store = backing(where);
    const doomed: string[] = [];
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key.startsWith(PREFIX)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    } catch {
      /* nothing sensible to do */
    }
  }
}
