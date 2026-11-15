import { extractForm } from '../lib/extract'
import { applyFill, findField } from '../lib/fill'
import { watchFields } from './watch'

if (window.parent !== window) {
  watchFields((field) => {
    window.parent.postMessage({ source: 'formwhisper-page', type: 'FIELD', field }, '*')
  })

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return
    const data = event.data as { source?: string; type?: string; fieldId?: string; value?: string; requestId?: string }
    if (data?.source !== 'formwhisper-panel') return
    if (data.type === 'FILL') {
      const el = findField(document, data.fieldId || '')
      const ok = !!el && applyFill(el, data.value || '')
      window.parent.postMessage({ source: 'formwhisper-page', type: 'FILLED', requestId: data.requestId, ok }, '*')
    }
    if (data.type === 'SCAN') {
      window.parent.postMessage(
        {
          source: 'formwhisper-page',
          type: 'FORM_SCAN',
          requestId: data.requestId,
          title: document.title,
          fields: extractForm(document),
        },
        '*',
      )
    }
  })
}
