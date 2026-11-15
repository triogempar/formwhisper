import { extensionContextAlive, pageHasFields, startContentScript } from '../src/content/index'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Listener = (message: { target?: string; type?: string }, sender: unknown, sendResponse: (value: unknown) => void) => void

function resetInstallFlag() {
  const host = globalThis as { __formwhisperContent?: boolean; __formwhisperSeen?: boolean }
  delete host.__formwhisperContent
  delete host.__formwhisperSeen
}

afterEach(() => {
  resetInstallFlag()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

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

  it('stays quiet when the extension context is already gone', () => {
    document.body.innerHTML = '<input name="first">'
    vi.stubGlobal('chrome', { runtime: undefined })
    expect(extensionContextAlive()).toBe(false)
    expect(startContentScript(document)).toBe(false)
    expect(() => {
      document.querySelector('input')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }).not.toThrow()
  })

  it('tears listeners down instead of calling sendMessage after the context dies', () => {
    document.body.innerHTML = '<input name="first">'
    const listeners: Listener[] = []
    const sendMessage = vi.fn(() => {
      throw new Error('Extension context invalidated.')
    })
    const runtime: { id: string; sendMessage: typeof sendMessage; onMessage: { addListener: (fn: Listener) => void; removeListener: (fn: Listener) => void } } = {
      id: 'ext',
      sendMessage,
      onMessage: {
        addListener(fn) {
          listeners.push(fn)
        },
        removeListener(fn) {
          const index = listeners.indexOf(fn)
          if (index >= 0) listeners.splice(index, 1)
        },
      },
    }
    vi.stubGlobal('chrome', { runtime })
    expect(startContentScript(document)).toBe(true)
    const reply = vi.fn()
    listeners[0]?.({ target: 'formwhisper-page', type: 'PING' }, {}, reply)
    expect(reply).toHaveBeenCalledWith({ ok: true })

    expect(() => {
      document.querySelector('input')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }).not.toThrow()
    expect(listeners).toHaveLength(0)
  })
})
