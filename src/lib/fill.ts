const SAFE_ID = /^[\w.-]+$/

export function findField(doc: Document, fieldId: string): Element | null {
  if (!SAFE_ID.test(fieldId)) return null
  return doc.querySelector(`[data-fw-id="${fieldId}"]`)
}

/** Insert a vault suggestion into a control. File and password inputs are refused. */
export function applyFill(el: Element, value: string): boolean {
  const next = value.trim()
  if (!next) return false

  if (el instanceof HTMLSelectElement) {
    const target = next.toLowerCase()
    const option = [...el.options].find((item) => {
      const label = (item.label || item.textContent || '').trim().toLowerCase()
      return item.value.toLowerCase() === target || label === target
    })
    if (!option) return false
    el.value = option.value
  } else if (el instanceof HTMLInputElement) {
    if (el.type === 'password' || el.type === 'file' || el.type === 'hidden') return false
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = /^(yes|true|on|1)$/i.test(next)
    } else if (el.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      return false
    } else {
      el.value = next
    }
  } else if (el instanceof HTMLTextAreaElement) {
    el.value = next
  } else {
    return false
  }

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
