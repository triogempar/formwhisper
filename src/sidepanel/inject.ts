/** Inject the self-contained content script into the top frame of a finished http(s) tab. */
export async function injectContentScript(tabId: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript || !chrome.tabs?.get) return
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url || !/^https?:/i.test(tab.url) || tab.status !== 'complete') return
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    })
  } catch {
    // chrome://, the Web Store, and other restricted pages cannot be injected.
  }
}
