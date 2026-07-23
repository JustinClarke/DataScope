// jsdom under an opaque origin exposes no Storage, so `window.localStorage` is
// undefined here even though `window` exists. The settings store persists through
// `createJSONStorage(() => localStorage)`, so tests need a working Storage, not a
// stub. Provide a spec-faithful in-memory one when the environment lacks it.
function installMemoryStorage(): void {
  if (typeof globalThis.localStorage !== 'undefined') return

  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })
}

installMemoryStorage()
