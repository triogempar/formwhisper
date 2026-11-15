import type { FieldContext } from './types'
import { clip } from './text'

const SKIP_INPUT_TYPES = new Set(['hidden', 'password', 'submit', 'button', 'reset', 'image'])

function cleanedText(root: Element): string {
  const clone = root.cloneNode(true) as Element
  clone.querySelectorAll('input, textarea, select, button, script, style, small').forEach((node) => node.remove())
  return (clone.textContent || '').replace(/\s+/g, ' ').trim()
}

export function isWritableControl(
  el: Element,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  )
}

export function ensureFieldId(el: Element): string {
  const existing = el.getAttribute('data-fw-id')
  if (existing) return existing
  const base = el.id ? `fw-${el.id}` : `fw-n${Math.random().toString(36).slice(2, 8)}`
  const id = base.replace(/[^\w.-]/g, '')
  el.setAttribute('data-fw-id', id)
  return id
}

function describedBy(el: Element): string {
  const raw = el.getAttribute('aria-describedby')
  if (!raw) return ''
  const doc = el.ownerDocument
  const text = raw
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map((node) => cleanedText(node))
    .filter(Boolean)
    .join(' ')
  return clip(text, 400)
}

function helpText(el: Element): string {
  const described = describedBy(el)
  if (described) return described
  const next = el.nextElementSibling
  if (next && (next.tagName === 'SMALL' || next.classList.contains('note'))) {
    return clip(cleanedText(next), 400)
  }
  return ''
}

const NAME_TOKENS = [
  'company',
  'address',
  'expiration',
  'extension',
  'password',
  'username',
  'postal',
  'country',
  'number',
  'mobile',
  'phone',
  'email',
  'first',
  'middle',
  'last',
  'name',
  'title',
  'street',
  'state',
  'city',
  'code',
  'date',
  'birth',
  'login',
  'user',
  'card',
  'credit',
  'month',
  'year',
  'line',
  'home',
  'work',
  'fax',
  'zip',
  'id',
].sort((left, right) => right.length - left.length)

/** Turn `22faxphone` / `01__title` into words. Leading digits and underscores are dropped. */
export function humanizeFieldName(raw: string): string {
  const stripped = raw.trim().replace(/^[\d_\s]+/, '').replace(/[_\-.]+/g, ' ')
  if (!stripped) return ''
  const pieces = stripped
    .split(/\s+/)
    .flatMap((token) => token.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/))
    .flatMap((token) => splitFieldToken(token.toLowerCase()))
    .filter(Boolean)
  return pieces
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

function splitFieldToken(token: string): string[] {
  const words: string[] = []
  let index = 0
  while (index < token.length) {
    const match = NAME_TOKENS.find((name) => token.startsWith(name, index))
    if (match) {
      words.push(match)
      index += match.length
      continue
    }
    let next = index + 1
    while (next < token.length && !NAME_TOKENS.some((name) => token.startsWith(name, next))) next += 1
    words.push(token.slice(index, next))
    index = next
  }
  return words
}

function labelForControl(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const explicit = [...(el.labels ?? [])].find((label) => label.htmlFor && label.htmlFor === el.id)
  if (explicit) {
    const text = cleanedText(explicit)
    if (text) return clip(text, 200)
  }
  const wrap = el.closest('label')
  if (wrap) {
    const text = cleanedText(wrap)
    if (text) return clip(text, 200)
  }
  const labelled = el.getAttribute('aria-labelledby')
  if (labelled) {
    const doc = el.ownerDocument
    const text = labelled
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => cleanedText(node))
      .filter(Boolean)
      .join(' ')
    if (text) return clip(text, 200)
  }
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return clip(aria, 200)
  return ''
}

function previousCellText(el: Element): string {
  const cell = el.closest('td, th')
  if (!cell?.parentElement) return ''
  const cells = [...cell.parentElement.children].filter((child) => child.tagName === 'TD' || child.tagName === 'TH')
  const index = cells.indexOf(cell)
  if (index <= 0) return ''
  return clip(cleanedText(cells[index - 1]), 200)
}

function textBeforeControl(el: Element): string {
  let sibling = el.previousSibling
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      const text = (sibling.textContent || '').replace(/\s+/g, ' ').trim()
      if (text) return clip(text, 200)
    } else if (sibling instanceof Element && !isWritableControl(sibling)) {
      const text = cleanedText(sibling)
      if (text) return clip(text, 200)
    }
    sibling = sibling.previousSibling
  }
  return ''
}

function resolveLabel(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  return (
    labelForControl(el) ||
    previousCellText(el) ||
    textBeforeControl(el) ||
    legendText(el) ||
    el.getAttribute('placeholder') ||
    el.getAttribute('title') ||
    humanizeFieldName(el.getAttribute('name') || '') ||
    humanizeFieldName(el.id || '')
  )
}

function legendText(el: Element): string {
  const fieldset = el.closest('fieldset')
  if (!fieldset) return ''
  const legend = [...fieldset.children].find((child) => child.tagName === 'LEGEND')
  return legend ? clip(cleanedText(legend), 200) : ''
}

function nearbyText(el: Element, label: string): string {
  const fieldset = el.closest('fieldset')
  const parent = el.parentElement
  const source = fieldset || parent
  if (!source || source.tagName === 'BODY') return ''
  let text = cleanedText(source)
  if (label) text = text.replace(label, ' ')
  return clip(text, 280)
}

function optionLabels(el: HTMLSelectElement): string[] {
  return [...el.options]
    .map((option) => (option.label || option.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8)
}

/**
 * Read the question around a control. Typed values are never copied:
 * form controls are removed before text is collected, and `.value` is not read.
 */
export function extractField(el: Element): FieldContext | null {
  if (!isWritableControl(el)) return null
  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return null
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('disabled')) return null

  const label = resolveLabel(el)
  const inputType =
    el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLTextAreaElement ? 'textarea' : el.type || 'text'

  return {
    fieldId: ensureFieldId(el),
    tag: el.tagName.toLowerCase(),
    inputType,
    name: el.getAttribute('name') || '',
    label,
    placeholder: el.getAttribute('placeholder') || '',
    helpText: helpText(el),
    legend: legendText(el),
    nearbyText: nearbyText(el, label),
    required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    autocomplete: el.getAttribute('autocomplete') || '',
    options: el instanceof HTMLSelectElement ? optionLabels(el) : [],
  }
}

export function extractForm(doc: Document): FieldContext[] {
  const fields: FieldContext[] = []
  doc.querySelectorAll('input, textarea, select').forEach((node) => {
    if (!(node instanceof Element)) return
    const field = extractField(node)
    if (field) fields.push(field)
  })
  return fields.slice(0, 40)
}
