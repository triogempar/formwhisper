export const PAGE_PING_MS = 1000

export type PageScriptResult = 'ready' | 'reload'

export function withMessageTimeout<T>(work: Promise<T>, ms = PAGE_PING_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The page did not answer.')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('The page did not answer.'))
      },
    )
  })
}

/**
 * Ask the tab's content script to answer. If it is an orphan from a previous
 * extension load, inject a fresh content.js and ask once more.
 */
export async function ensurePageScript(
  tabId: number,
  deps: {
    ping: (tabId: number) => Promise<boolean>
    inject: (tabId: number) => Promise<void>
  },
): Promise<PageScriptResult> {
  if (await safePing(deps.ping, tabId)) return 'ready'
  try {
    await deps.inject(tabId)
  } catch {
    return 'reload'
  }
  if (await safePing(deps.ping, tabId)) return 'ready'
  return 'reload'
}

async function safePing(ping: (tabId: number) => Promise<boolean>, tabId: number): Promise<boolean> {
  try {
    return await ping(tabId)
  } catch {
    return false
  }
}

export function pingContentScript(tabId: number, timeoutMs = PAGE_PING_MS): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.tabs?.sendMessage) return Promise.resolve(false)
  return withMessageTimeout(
    new Promise<boolean>((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, { target: 'formwhisper-page', type: 'PING' }, (response) => {
          const error = chrome.runtime?.lastError
          if (error) {
            reject(new Error(error.message || 'The page did not answer.'))
            return
          }
          resolve(Boolean((response as { ok?: boolean } | undefined)?.ok))
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error('The page did not answer.'))
      }
    }),
    timeoutMs,
  ).catch(() => false)
}
