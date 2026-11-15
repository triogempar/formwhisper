export type Kv = {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}

export const STORAGE_KEYS = {
  settings: 'fw.settings',
  vault: 'fw.vault',
  ledger: 'fw.ledger',
  debugToken: 'fw.appCheckDebugToken',
} as const

function chromeKv(): Kv | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
  return {
    async get<T>(key: string): Promise<T | null> {
      const result = await chrome.storage.local.get(key)
      return (result[key] as T | undefined) ?? null
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value })
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key)
    },
  }
}

function memoryKv(): Kv {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : null
      } catch {
        return null
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      localStorage.setItem(key, JSON.stringify(value))
    },
    async remove(key: string): Promise<void> {
      localStorage.removeItem(key)
    },
  }
}

export function createKv(): Kv {
  return chromeKv() ?? memoryKv()
}
