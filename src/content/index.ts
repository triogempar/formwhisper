import { extractForm } from '../lib/extract'
import { applyFill, findField, revealField } from '../lib/fill'
import type { FieldContext } from '../lib/types'
import { watchFields } from './watch'

const INSTALLED = '__formwhisperContent'

type PageMessage = {
  target?: string
  type?: string
  fieldId?: string
  value?: string
}

type MessageListener = (
  message: PageMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void

export function pageHasFields(doc: Document): boolean {
  return doc.querySelector('input, textarea, select') !== null
}

/** False after an extension reload leaves this content script orphaned. */
export function extensionContextAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

export function startContentScript(doc: Document = document): boolean {
  const host = globalThis as typeof globalThis & { [INSTALLED]?: boolean; __formwhisperSeen?: boolean }
  host.__formwhisperSeen = true
  if (host[INSTALLED]) return false
  if (!pageHasFields(doc)) return false
  if (!extensionContextAlive()) return false
  host[INSTALLED] = true

  let stopWatch = () => {}
  let listener: MessageListener | null = null
  let tornDown = false

  const teardown = () => {
    if (tornDown) return
    tornDown = true
    stopWatch()
    host[INSTALLED] = false
    if (!listener) return
    try {
      chrome.runtime?.onMessage.removeListener(listener)
    } catch {
      // The extension context is already gone.
    }
    listener = null
  }

  const publish = (field: FieldContext) => {
    if (!extensionContextAlive()) {
      teardown()
      return
    }
    try {
      void chrome.runtime.sendMessage({ source: 'formwhisper-page', type: 'FIELD', field })
    } catch {
      teardown()
    }
  }

  listener = (message, _sender, sendResponse) => {
    if (!extensionContextAlive()) {
      teardown()
      return
    }
    if (!message || message.target !== 'formwhisper-page') return
    try {
      if (message.type === 'PING') {
        sendResponse({ ok: true })
        return true
      }
      if (message.type === 'FILL' || message.type === 'REVEAL') {
        const el = findField(doc, String(message.fieldId ?? ''))
        const filled = message.type === 'FILL' && !!el && applyFill(el, String(message.value ?? ''))
        if (el) revealField(el)
        sendResponse({ ok: message.type === 'REVEAL' ? !!el : filled })
        return true
      }
      if (message.type === 'SCAN') {
        sendResponse({ title: doc.title, fields: extractForm(doc) })
        return true
      }
    } catch {
      teardown()
    }
  }

  try {
    chrome.runtime.onMessage.addListener(listener)
    stopWatch = watchFields(publish)
  } catch {
    teardown()
    return false
  }
  return true
}

startContentScript()
