import { extractForm } from '../lib/extract'
import { applyFill, findField, revealField } from '../lib/fill'
import { watchFields } from './watch'

watchFields((field) => {
  void chrome.runtime.sendMessage({ source: 'formwhisper-page', type: 'FIELD', field })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== 'formwhisper-page') return
  if (message.type === 'FILL' || message.type === 'REVEAL') {
    const el = findField(document, String(message.fieldId ?? ''))
    const filled = message.type === 'FILL' && !!el && applyFill(el, String(message.value ?? ''))
    if (el) revealField(el)
    sendResponse({ ok: message.type === 'REVEAL' ? !!el : filled })
    return true
  }
  if (message.type === 'SCAN') {
    sendResponse({ title: document.title, fields: extractForm(document) })
    return true
  }
})
