import {
  cancelsInference,
  IDLE_RELEASE_MS,
  inferenceBusy,
  instrumentLanguageModel,
  noteRequestStart,
  releaseOnDeviceSessions,
  trackSession,
} from '../src/lib/session-lifecycle'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  releaseOnDeviceSessions()
  vi.useRealTimers()
})

describe('session lifecycle', () => {
  it('cancels inference when the form tab closes or navigates', () => {
    const session = { destroy: vi.fn() }
    trackSession(session)
    expect(cancelsInference('removed', 4, 4)).toBe(true)
    expect(cancelsInference('removed', 4, 9)).toBe(false)
    expect(cancelsInference('loading', 4, 4)).toBe(true)
    expect(cancelsInference('loading', 4, 2)).toBe(false)
    if (cancelsInference('removed', 4, 4)) releaseOnDeviceSessions()
    expect(session.destroy).toHaveBeenCalledOnce()
  })

  it('does not cancel because the panel hid, the port dropped, or the same tab stayed active', () => {
    expect(cancelsInference('hidden', 4)).toBe(false)
    expect(cancelsInference('disconnect', 4)).toBe(false)
    expect(cancelsInference('activated', 4, 4)).toBe(false)
    expect(cancelsInference('activated', 4, 8)).toBe(false)
    expect(cancelsInference('field', 4)).toBe(false)
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

  it('does not destroy the session create() just returned while a request is open', async () => {
    const destroy = vi.fn()
    const session = { destroy }
    let resolveCreate: (value: typeof session) => void = () => {}
    const host = {
      LanguageModel: {
        create: () =>
          new Promise<typeof session>((resolve) => {
            resolveCreate = resolve
          }),
      },
    }
    instrumentLanguageModel(host)
    const end = noteRequestStart()
    const pending = host.LanguageModel.create()
    releaseOnDeviceSessions()
    resolveCreate(session)
    await pending
    expect(destroy).not.toHaveBeenCalled()
    expect(inferenceBusy()).toBe(true)
    end()
    expect(destroy).toHaveBeenCalledOnce()
  })
})
