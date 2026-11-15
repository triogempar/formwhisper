import { ensurePageScript, withMessageTimeout } from '../src/sidepanel/page-script'
import { describe, expect, it, vi } from 'vitest'

describe('page script attach', () => {
  it('re-injects when the first ping times out, then accepts the new script', async () => {
    const inject = vi.fn(async (_tabId: number) => undefined)
    let injected = false
    const result = await ensurePageScript(4, {
      ping: async () => {
        injected = injected || false
        return injected
      },
      inject: async (tabId) => {
        injected = true
        await inject(tabId)
      },
    })
    expect(result).toBe('ready')
    expect(inject).toHaveBeenCalledWith(4)
  })

  it('asks for a reload when the page still does not answer', async () => {
    const result = await ensurePageScript(4, {
      ping: async () => false,
      inject: async () => undefined,
    })
    expect(result).toBe('reload')
  })

  it('stops waiting when a page message never returns', async () => {
    vi.useFakeTimers()
    const pending = withMessageTimeout(new Promise(() => undefined), 1000)
    const assertion = expect(pending).rejects.toThrow('The page did not answer.')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    vi.useRealTimers()
  })
})
