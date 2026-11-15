import type { ModelState } from './readiness'

export const POLL_MS = 2_000
export const STALL_MS = 20_000

export const READY_DETAIL = 'On-device model ready'
export const STALL_DETAIL =
  'Still preparing — Chrome downloads the model in the background. Check chrome://on-device-internals'

export type DownloadStatus = 'idle' | 'downloading' | 'ready' | 'stalled' | 'failed'

export type DownloadState = {
  status: DownloadStatus
  ratio: number | null
  message: string
  startedAt: number | null
  lastProgressAt: number | null
}

export type DownloadEvent =
  | { type: 'availability'; value: ModelState; now: number }
  | { type: 'progress'; loaded: number; now: number }
  | { type: 'tick'; now: number }
  | { type: 'fail'; message: string; now: number }

export function initialDownloadState(): DownloadState {
  return { status: 'idle', ratio: null, message: '', startedAt: null, lastProgressAt: null }
}

/**
 * Chrome's `downloadprogress` event reports `loaded` as a 0..1 fraction.
 * A 0..100 percentage is accepted. Larger numbers are byte counts and are ignored.
 */
export function progressRatio(loaded: number): number | null {
  if (!Number.isFinite(loaded) || loaded < 0) return null
  if (loaded <= 1) return loaded
  if (loaded <= 100) return loaded / 100
  return null
}

export function reduceDownload(state: DownloadState, event: DownloadEvent): DownloadState {
  if (event.type === 'availability' && event.value === 'available') {
    return {
      status: 'ready',
      ratio: 1,
      message: READY_DETAIL,
      startedAt: state.startedAt,
      lastProgressAt: event.now,
    }
  }

  if (event.type === 'fail') {
    if (state.status === 'ready') return state
    return { ...state, status: 'failed', message: event.message }
  }

  if (state.status === 'ready') return state

  if (event.type === 'availability' && event.value === 'unavailable') {
    return {
      ...state,
      status: 'failed',
      message: 'The Prompt API is present, but the model is not available on this device.',
    }
  }

  if (event.type === 'availability' && (event.value === 'downloading' || event.value === 'downloadable' || event.value === 'checking')) {
    if (state.status === 'stalled' || state.status === 'failed') return state
    return {
      status: 'downloading',
      ratio: state.ratio ?? 0,
      message: '',
      startedAt: state.startedAt ?? event.now,
      lastProgressAt: state.lastProgressAt,
    }
  }

  if (event.type === 'progress') {
    if (state.status === 'stalled' || state.status === 'failed') return state
    const ratio = progressRatio(event.loaded)
    if (ratio === null) return state
    const moved = state.ratio === null || ratio > state.ratio
    return {
      status: 'downloading',
      ratio,
      message: '',
      startedAt: state.startedAt ?? event.now,
      lastProgressAt: moved && ratio > 0 ? event.now : state.lastProgressAt,
    }
  }

  if (event.type === 'tick') {
    if (state.status !== 'downloading') return state
    const mark = state.lastProgressAt ?? state.startedAt
    if (mark === null || event.now - mark < STALL_MS) return state
    return { ...state, status: 'stalled', message: STALL_DETAIL }
  }

  return state
}

export async function driveModelDownload(options: {
  known: ModelState
  now: () => number
  sleep: (ms: number) => Promise<void>
  availability: () => Promise<ModelState>
  startDownload: (onProgress: (loaded: number) => void) => Promise<void>
  isCancelled?: () => boolean
  onUpdate?: (state: DownloadState) => void
}): Promise<DownloadState> {
  const emit = (next: DownloadState) => {
    options.onUpdate?.(next)
    return next
  }

  let state = reduceDownload(initialDownloadState(), {
    type: 'availability',
    value: options.known,
    now: options.now(),
  })
  emit(state)
  if (state.status === 'ready' || state.status === 'failed') return state

  // LanguageModel.create / initializeDeviceModel must run in this turn so Chrome
  // still counts the click as a user gesture. Skip it when the model is already available.
  try {
    const pending = options.startDownload((loaded) => {
      state = reduceDownload(state, { type: 'progress', loaded, now: options.now() })
      emit(state)
    })
    void pending.then(
      () => undefined,
      (error: unknown) => {
        const message = error instanceof Error ? error.message : 'The download did not start.'
        state = reduceDownload(state, { type: 'fail', message, now: options.now() })
        emit(state)
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The download did not start.'
    return emit(reduceDownload(state, { type: 'fail', message, now: options.now() }))
  }

  while (state.status === 'downloading') {
    if (options.isCancelled?.()) return state
    await options.sleep(POLL_MS)
    if (options.isCancelled?.() || state.status !== 'downloading') break
    try {
      const value = await options.availability()
      state = reduceDownload(state, { type: 'availability', value, now: options.now() })
      emit(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Availability check failed.'
      state = reduceDownload(state, { type: 'fail', message, now: options.now() })
      emit(state)
      break
    }
    state = reduceDownload(state, { type: 'tick', now: options.now() })
    emit(state)
  }

  return state
}
