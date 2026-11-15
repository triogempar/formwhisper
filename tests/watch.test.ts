import { revealField } from '../src/lib/fill'
import { watchFields } from '../src/content/watch'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('watchFields', () => {
  it('debounces focusin, keeps the latest control, and does not move focus', () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <table>
        <tr><td>Title</td><td><input id="title" name="01__title"></td></tr>
        <tr><td>First Name</td><td><input id="first" name="02firstname"></td></tr>
      </table>
    `
    const seen: string[] = []
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => undefined)
    watchFields((field) => seen.push(field.label))

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
    document.getElementById('title')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    document.getElementById('first')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(seen).toEqual([])
    vi.advanceTimersByTime(150)
    expect(seen).toEqual(['First Name'])
    expect(focus).not.toHaveBeenCalled()
    expect(scroll).not.toHaveBeenCalled()
    focus.mockRestore()
    scroll.mockRestore()
  })

  it('uses a click immediately and still does not focus on its own', () => {
    document.body.innerHTML = `<input id="first" name="02firstname">`
    const seen: string[] = []
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    watchFields((field) => seen.push(field.label))
    document.getElementById('first')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toEqual(['First name'])
    expect(focus).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('focuses only when revealField is asked', () => {
    document.body.innerHTML = `<input id="first">`
    const input = document.getElementById('first')!
    const focus = vi.spyOn(input, 'focus')
    const scroll = vi.spyOn(input, 'scrollIntoView').mockImplementation(() => undefined)
    revealField(input)
    expect(focus).toHaveBeenCalledOnce()
    expect(scroll).toHaveBeenCalledOnce()
  })
})