import { extractField } from '../lib/extract'
import type { FieldContext } from '../lib/types'

const LIVE = 'data-fw-live'
const FOCUS_DEBOUNCE_MS = 150
const HIGHLIGHT_SUPPRESS_MS = 400

function mark(el: Element, suppressUntil: { value: number }) {
  document.querySelectorAll(`[${LIVE}]`).forEach((node) => node.removeAttribute(LIVE))
  suppressUntil.value = performance.now() + HIGHLIGHT_SUPPRESS_MS
  el.setAttribute(LIVE, 'true')
}

function controlFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  const control = target.closest('input, textarea, select')
  return control instanceof Element ? control : null
}

/**
 * Observe focus and clicks. Highlighting only sets an attribute.
 * This never calls focus(), select(), or scrollIntoView().
 */
export function watchFields(onField: (field: FieldContext) => void) {
  const style = document.createElement('style')
  style.textContent = `[${LIVE}="true"]{outline:2px solid #1a73e8;outline-offset:2px;}@media (prefers-color-scheme:dark){[${LIVE}="true"]{outline-color:#8ab4f8;}}`
  document.documentElement.append(style)

  const suppressUntil = { value: 0 }
  let userControl: Element | null = null
  let timer = 0
  let latest: Element | null = null

  const publish = (control: Element) => {
    const field = extractField(control)
    if (!field) return
    mark(control, suppressUntil)
    onField({ ...field, origin: location.origin })
  }

  const schedule = (control: Element) => {
    latest = control
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (latest) publish(latest)
    }, FOCUS_DEBOUNCE_MS)
  }

  document.addEventListener('focusin', (event) => {
    const control = controlFrom(event.target)
    if (!control) return
    if (performance.now() < suppressUntil.value && control !== userControl) return
    userControl = control
    schedule(control)
  })

  document.addEventListener('click', (event) => {
    const control = controlFrom(event.target)
    if (!control) return
    window.clearTimeout(timer)
    latest = control
    userControl = control
    publish(control)
  })
}
