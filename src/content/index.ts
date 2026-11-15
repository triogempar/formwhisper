import { extractForm } from '../lib/extract'
import { applyFill, findField, revealField } from '../lib/fill'
import { watchFields } from './watch'

const INSTALLED = '__formwhisperContent'

export function pageHasFields(doc: Document): boolean {
  return doc.querySelector('input, textarea, select') !== null
}

export function startContentScript(doc: Document = document): boolean {
  const host = globalThis as typeof globalThis & { [INSTALLED]?: boolean; __formwhisperSeen?: boolean }
  host.__formwhisperSeen = true
  if (host[INSTALLED]) return false
  if (!pageHasFields(doc)) return false
  host[INSTALLED] = true

  watchFields((field) => {
    void chrome.runtime.sendMessage({ source: 'formwhisper-page', type: 'FIELD', field })
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== 'formwhisper-page') return
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
  })
  return true
}

startContentScript()
