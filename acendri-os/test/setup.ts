/**
 * The core modules are written for a browser. Node has `crypto` and `btoa`, but
 * no Web Storage, so this stands one up before anything under `src/` is
 * imported. Import it first — `storage.ts` probes for storage at module load,
 * so a later import would find nothing there.
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

export const localStorageStub = memoryStorage();
export const sessionStorageStub = memoryStorage();

(globalThis as unknown as { window: unknown }).window = {
  localStorage: localStorageStub,
  sessionStorage: sessionStorageStub,
};

/** Empties both stores so each test starts on a clean device. */
export function resetDevice(): void {
  localStorageStub.clear();
  sessionStorageStub.clear();
}

/** Drops only the tab-scoped store — what closing the tab does. */
export function closeTab(): void {
  sessionStorageStub.clear();
}
