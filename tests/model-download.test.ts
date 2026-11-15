import {
  driveModelDownload,
  POLL_MS,
  progressRatio,
  READY_DETAIL,
  reduceDownload,
  STALL_DETAIL,
  STALL_MS,
  initialDownloadState,
  type DownloadState,
} from '../src/lib/model-download'
import type { ModelState } from '../src/lib/readiness'
import { describe, expect, it } from 'vitest'

function downloading(now = 0): DownloadState {
  return reduceDownload(initialDownloadState(), { type: 'availability', value: 'downloading', now })
}

describe('on-device download state machine', () => {
  it('treats loaded as a 0..1 fraction and ignores byte counts', () => {
    expect(progressRatio(0)).toBe(0)
    expect(progressRatio(0.42)).toBe(0.42)
    expect(progressRatio(1)).toBe(1)
    expect(progressRatio(42)).toBe(0.42)
    expect(progressRatio(4_300_000_000)).toBeNull()

    const started = downloading(0)
    const ignored = reduceDownload(started, { type: 'progress', loaded: 4_300_000_000, now: 5 })
    expect(ignored.ratio).toBe(0)
    const moved = reduceDownload(ignored, { type: 'progress', loaded: 0.25, now: 6 })
    expect(moved.ratio).toBe(0.25)
    expect(moved.status).toBe('downloading')
  })

  it('skips straight to ready when the model is already available', async () => {
    let started = false
    const outcome = await driveModelDownload({
      known: 'available',
      now: () => 0,
      sleep: async () => undefined,
      availability: async () => 'downloading',
      startDownload: () => {
        started = true
        return new Promise(() => undefined)
      },
    })
    expect(started).toBe(false)
    expect(outcome.status).toBe('ready')
    expect(outcome.message).toBe(READY_DETAIL)
  })

  it('finishes when a later availability check reports available', async () => {
    let now = 0
    const checks: ModelState[] = ['downloading', 'available']
    const outcome = await driveModelDownload({
      known: 'downloading',
      now: () => now,
      sleep: async (ms) => {
        expect(ms).toBe(POLL_MS)
        now += ms
      },
      availability: async () => checks.shift() ?? 'available',
      startDownload: (onProgress) => {
        onProgress(0)
        return new Promise(() => undefined)
      },
    })
    expect(outcome.status).toBe('ready')
    expect(outcome.message).toBe(READY_DETAIL)
  })

  it('stalls after 20s with no progress and leaves a retryable state', () => {
    let state = downloading(0)
    state = reduceDownload(state, { type: 'progress', loaded: 0, now: 1_000 })
    state = reduceDownload(state, { type: 'tick', now: STALL_MS })
    expect(state.status).toBe('stalled')
    expect(state.message).toBe(STALL_DETAIL)

    const retried = reduceDownload(state, { type: 'availability', value: 'downloading', now: STALL_MS + 1 })
    expect(retried.status).toBe('stalled')
  })

  it('does not stay in downloading after a start error', () => {
    const state = reduceDownload(downloading(0), {
      type: 'fail',
      message: 'The download did not start.',
      now: 10,
    })
    expect(state.status).toBe('failed')
    expect(state.status).not.toBe('downloading')
  })
})
