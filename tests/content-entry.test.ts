import { pageHasFields, startContentScript } from '../src/content/index'
import { describe, expect, it } from 'vitest'

describe('content script entry', () => {
  it('does not install listeners when the page has no fields', () => {
    document.body.innerHTML = '<article><p>A video page with no form.</p></article>'
    expect(pageHasFields(document)).toBe(false)
    expect(startContentScript(document)).toBe(false)
  })

  it('sees a normal form page', () => {
    document.body.innerHTML = '<form><input name="first"></form>'
    expect(pageHasFields(document)).toBe(true)
  })
})