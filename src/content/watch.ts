import { extractField } from '../lib/extract'
import type { FieldContext } from '../lib/types'

const LIVE = 'data-fw-live'

function mark(el: Element) {
  document.querySelectorAll(`[${LIVE}]`).forEach((node) => node.removeAttribute(LIVE))
  el.setAttribute(LIVE, 'true')
}

/** Report the control under the cursor or keyboard. Typed values are not included. */
export function watchFields(onField: (field: FieldContext) => void) {
  const style = document.createElement('style')
  style.textContent = `[${LIVE}="true"]{outline:2px solid #1a73e8;outline-offset:2px;}@media (prefers-color-scheme:dark){[${LIVE}="true"]{outline-color:#8ab4f8;}}`
  document.documentElement.append(style)

  const emit = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const control = target.closest('input, textarea, select')
    if (!(control instanceof Element)) return
    const field = extractField(control)
    if (!field) return
    mark(control)
    onField(field)
  }

  document.addEventListener('focusin', (event) => emit(event.target))

  let hoverTimer = 0
  document.addEventListener('mouseover', (event) => {
    window.clearTimeout(hoverTimer)
    const target = event.target
    hoverTimer = window.setTimeout(() => emit(target), 380)
  })
}
