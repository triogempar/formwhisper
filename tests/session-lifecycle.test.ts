import {
  cancelsInference,
  IDLE_RELEASE_MS,
  instrumentLanguageModel,
  releaseOnDeviceSessions,
  trackSession,
} from '../src/lib/session-lifecycle'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  releaseOnDeviceSessions()
  vi.useRealTimers()
})

describe('session lifecycle', () => {
  it('cancels inference when the form tab closes', () => {
    const session = { destroy: vi.fn() }
    trackSession(session)
    expect(cancelsInference('removed', 4, 4)).toBe(true)
    expect(cancelsInference('removed', 4, 9)).toBe(false)
    if (cancelsInference('removed', 4, 4)) releaseOnDeviceSessions()
    expect(session.destroy).toHaveBeenCalledOnce()
  })

  it('cancels when that tab navigates, the user switches tabs, or the panel hides', () => {
    expect(cancelsInference('loading', 4, 4)).toBe(true)
    expect(cancelsInference('loading', 4, 2)).toBe(false)
    expect(cancelsInference('activated', 4, 8)).toBe(true)
    expect(cancelsInference('activated', 4, 4)).toBe(false)
    expect(cancelsInference('hidden', 4)).toBe(true)
    expect(cancelsInference('disconnect', null)).toBe(true)
    expect(cancelsInference('field', 4)).toBe(true)
  })

  it('destroys a tracked session after idle without creating another', () => {
    vi.useFakeTimers()
    const created: string[] = []
    const session = { destroy: vi.fn() }
    instrumentLanguageModel({
      LanguageModel: {
        create: async () => {
          created.push('create')
          return session
        },
      },
    })
    trackSession(session)
    expect(created).toEqual([])
    vi.advanceTimersByTime(IDLE_RELEASE_MS)
    expect(session.destroy).toHaveBeenCalledOnce()
    expect(created).toEqual([])
  })
})
