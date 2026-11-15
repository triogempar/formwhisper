import type { FieldContext } from '../lib/types'

export type FieldHandler = (field: FieldContext) => void

export type PanelTransport = {
  listen(handler: FieldHandler): () => void
  fill(fieldId: string, value: string): Promise<boolean>
  reveal(fieldId: string): Promise<void>
  scan(): Promise<{ title: string; fields: FieldContext[] }>
  capture(): Promise<string | null>
}

function frameWindow(): Window | null {
  const frame = document.getElementById('fw-form-frame')
  if (!(frame instanceof HTMLIFrameElement)) return null
  return frame.contentWindow
}

function postToFrame(fieldId: string, value: string, type: 'FILL' | 'REVEAL'): Promise<boolean> {
  const child = frameWindow()
  if (!child) return Promise.resolve(false)
  const requestId = crypto.randomUUID()
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(false)
    }, 2000)
    function onMessage(event: MessageEvent) {
      const data = event.data as { source?: string; type?: string; requestId?: string; ok?: boolean }
      if (data?.source !== 'formwhisper-page' || data.type !== 'FILLED' || data.requestId !== requestId) return
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(Boolean(data.ok))
    }
    window.addEventListener('message', onMessage)
    child.postMessage({ source: 'formwhisper-panel', type, fieldId, value, requestId }, '*')
  })
}

function previewTransport(): PanelTransport {
  return {
    listen(handler) {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as { source?: string; type?: string; field?: FieldContext }
        if (data?.source !== 'formwhisper-page' || data.type !== 'FIELD' || !data.field) return
        handler(data.field)
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    },
    fill(fieldId, value) {
      return postToFrame(fieldId, value, 'FILL')
    },
    reveal(fieldId) {
      return postToFrame(fieldId, '', 'REVEAL').then(() => undefined)
    },
    scan() {
      const child = frameWindow()
      if (!child) return Promise.reject(new Error('The specimen form is not open.'))
      const requestId = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          window.removeEventListener('message', onMessage)
          reject(new Error('This page did not answer the scan.'))
        }, 4000)
        function onMessage(event: MessageEvent) {
          const data = event.data as {
            source?: string
            type?: string
            requestId?: string
            title?: string
            fields?: FieldContext[]
          }
          if (data?.source !== 'formwhisper-page' || data.type !== 'FORM_SCAN' || data.requestId !== requestId) return
          window.clearTimeout(timer)
          window.removeEventListener('message', onMessage)
          resolve({ title: data.title || document.title, fields: data.fields || [] })
        }
        window.addEventListener('message', onMessage)
        child.postMessage({ source: 'formwhisper-panel', type: 'SCAN', requestId }, '*')
      })
    },
    async capture() {
      return window.__FW_FAKE_CAPTURE__ || null
    },
  }
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) throw new Error('No active tab to read.')
  return tab.id
}

function extensionTransport(): PanelTransport {
  return {
    listen(handler) {
      const listener = (message: { source?: string; type?: string; field?: FieldContext }) => {
        if (message?.source === 'formwhisper-page' && message.type === 'FIELD' && message.field) {
          handler(message.field)
        }
      }
      chrome.runtime.onMessage.addListener(listener)
      return () => chrome.runtime.onMessage.removeListener(listener)
    },
    async fill(fieldId, value) {
      const tabId = await activeTabId()
      const response = (await chrome.tabs.sendMessage(tabId, {
        target: 'formwhisper-page',
        type: 'FILL',
        fieldId,
        value,
      })) as { ok?: boolean } | undefined
      return Boolean(response?.ok)
    },
    async reveal(fieldId) {
      const tabId = await activeTabId()
      await chrome.tabs.sendMessage(tabId, {
        target: 'formwhisper-page',
        type: 'REVEAL',
        fieldId,
      })
    },
    async scan() {
      const tabId = await activeTabId()
      const response = (await chrome.tabs.sendMessage(tabId, {
        target: 'formwhisper-page',
        type: 'SCAN',
      })) as { title?: string; fields?: FieldContext[] } | undefined
      return { title: response?.title || 'This page', fields: response?.fields || [] }
    },
    capture() {
      return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 72 }, (dataUrl) => {
          const error = chrome.runtime.lastError
          if (error) {
            reject(new Error(error.message || 'Could not capture the tab.'))
            return
          }
          resolve(dataUrl || null)
        })
      })
    },
  }
}

export function createTransport(): PanelTransport {
  const preview = document.documentElement.hasAttribute('data-fw-preview')
  if (preview || typeof chrome === 'undefined' || !chrome.runtime?.id) return previewTransport()
  return extensionTransport()
}
