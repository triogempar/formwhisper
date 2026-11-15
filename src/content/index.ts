import { extractForm } from '../lib/extract'
import { applyFill, findField } from '../lib/fill'
import { watchFields } from './watch'

watchFields((field) => {
  void chrome.runtime.sendMessage({ source: 'formwhisper-page', type: 'FIELD', field })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== 'formwhisper-page') return
  if (message.type === 'FILL') {
    const el = findField(document, String(message.fieldId ?? ''))
    sendResponse({ ok: !!el && applyFill(el, String(message.value ?? '')) })
    return true
  }
  if (message.type === 'SCAN') {
    sendResponse({ title: document.title, fields: extractForm(document) })
    return true
  }
})
