/** In-memory stand-in for `@gauntlet/local-storage`'s MMKV wrapper. */
const store = new Map<string, unknown>()

const instance = {
  getString: (key: string) => {
    const v = store.get(key)
    return typeof v === 'string' ? v : undefined
  },
  getBoolean: (key: string) => {
    const v = store.get(key)
    return typeof v === 'boolean' ? v : undefined
  },
  set: (key: string, value: unknown) => {
    store.set(key, value)
  },
  delete: (key: string) => {
    store.delete(key)
  },
}

export const LocalStorage = {
  getInstance: () => instance,
}

export function clearStorage() {
  store.clear()
}
