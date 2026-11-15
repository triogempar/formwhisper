import { friendlyModelError } from './errors'
import { inferenceLog } from './inference-log'
import type { ExplainOptions, FormModel } from './model'
import { noteRequestStart, releaseOnDeviceSessions } from './session-lifecycle'
import type { FieldContext, FieldExplanation, ModelAnswer, RunMode } from './types'

/** No streamed token yet. A busy GPU may still be loading the first token. */
export const FIRST_TOKEN_MS = 60_000
/** Quiet stretch after tokens have started. */
export const TOKEN_GAP_MS = 30_000
/** Used only when the hybrid call cannot stream. */
export const NO_STREAM_TIMEOUT_MS = 90_000
export const DEVICE_TIMEOUT_MESSAGE = "On-device model didn't respond"

export class OnDeviceTimeoutError extends Error {
  constructor() {
    super(DEVICE_TIMEOUT_MESSAGE)
    this.name = 'OnDeviceTimeout'
  }
}

export type FieldRequestView =
  | { status: 'loading'; field: FieldContext; partial?: string }
  | { status: 'ready'; field: FieldContext; answer: ModelAnswer<FieldExplanation> }
  | { status: 'timeout'; field: FieldContext }
  | { status: 'error'; field: FieldContext; message: string; appCheck?: boolean }
  | { status: 'idle' }

type Running = {
  id: number
  fieldId: string
  mode: RunMode
  controller: AbortController
}

export type FieldRequests = {
  start: (field: FieldContext, mode: RunMode, options?: { force?: boolean }) => void
  cancel: (reason: 'removed' | 'loading' | 'user') => void
}

export type RequestTimeouts = {
  firstTokenMs?: number
  gapMs?: number
  totalMs?: number
}

function onDevice(mode: RunMode): boolean {
  return mode === 'only-device' || mode === 'prefer-device'
}

/**
 * One displayed field request.
 * A second report of the same field (click, then the debounced focusin) does
 * not abort the session. A different field supersedes it. Tab close and
 * navigation settle the view instead of leaving "Thinking" up.
 */
export function createFieldRequests(host: {
  explainField: FormModel['explainField']
  onView: (view: FieldRequestView) => void
  timeouts?: RequestTimeouts
}): FieldRequests {
  let current: Running | null = null
  let seq = 0

  function settle(id: number, view: FieldRequestView): boolean {
    if (current?.id !== id) {
      inferenceLog('request-dropped', { id, status: view.status })
      return false
    }
    host.onView(view)
    return true
  }

  async function run(running: Running, field: FieldContext, mode: RunMode): Promise<void> {
    const endHold = noteRequestStart()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const firstTokenMs = host.timeouts?.firstTokenMs ?? FIRST_TOKEN_MS
    const gapMs = host.timeouts?.gapMs ?? TOKEN_GAP_MS
    const totalMs = host.timeouts?.totalMs ?? NO_STREAM_TIMEOUT_MS
    const started = Date.now()
    inferenceLog('request-running', { id: running.id, fieldId: field.fieldId, label: field.label, mode })
    host.onView({ status: 'loading', field })
    let rejectWait: (error: unknown) => void = () => undefined
    const inactivity = new Promise<never>((_, reject) => {
      rejectWait = reject
    })
    const arm = (ms: number) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => rejectWait(new OnDeviceTimeoutError()), ms)
    }
    if (onDevice(mode)) arm(firstTokenMs)
    try {
      const options: ExplainOptions = {
        signal: running.controller.signal,
        onPartial: (partial) => {
          if (current?.id === running.id) host.onView({ status: 'loading', field, partial })
        },
        onActivity: (event) => {
          if (!onDevice(mode) || current?.id !== running.id) return
          if (event === 'full') {
            const remaining = Math.max(0, totalMs - (Date.now() - started))
            inferenceLog('request-no-stream', { id: running.id, remaining })
            arm(remaining)
            return
          }
          inferenceLog('request-token', { id: running.id })
          arm(gapMs)
        },
      }
      const work = host.explainField(field, mode, options)
      void work.catch(() => undefined)
      const answer = await Promise.race([work, inactivity])
      if (!settle(running.id, { status: 'ready', field, answer })) return
      inferenceLog('request-ready', { id: running.id, source: answer.source })
    } catch (error) {
      if (current?.id !== running.id) {
        inferenceLog('request-superseded', { id: running.id })
        return
      }
      if (error instanceof OnDeviceTimeoutError) {
        timedOut = true
        running.controller.abort()
        inferenceLog('request-timeout', { id: running.id })
        host.onView({ status: 'timeout', field })
        releaseOnDeviceSessions()
        return
      }
      if (running.controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        inferenceLog('request-aborted', { id: running.id })
        host.onView({ status: 'idle' })
        return
      }
      const friendly = friendlyModelError(error)
      inferenceLog('request-error', { id: running.id, appCheck: friendly.appCheck })
      host.onView({ status: 'error', field, message: friendly.message, appCheck: friendly.appCheck })
    } finally {
      if (timer) clearTimeout(timer)
      endHold()
      if (current?.id === running.id) current = null
      if (timedOut) releaseOnDeviceSessions()
    }
  }

  return {
    start(field, mode, options) {
      if (!options?.force && current && current.fieldId === field.fieldId && current.mode === mode) {
        inferenceLog('request-kept', { id: current.id, fieldId: field.fieldId })
        return
      }
      const previous = current
      const running: Running = {
        id: ++seq,
        fieldId: field.fieldId,
        mode,
        controller: new AbortController(),
      }
      current = running
      if (previous) {
        inferenceLog('request-supersede', { from: previous.fieldId, to: field.fieldId, id: running.id })
        previous.controller.abort()
      }
      void run(running, field, mode)
    },
    cancel(reason) {
      const running = current
      current = null
      inferenceLog('request-cancel', { reason, id: running?.id ?? null })
      running?.controller.abort()
      host.onView({ status: 'idle' })
      releaseOnDeviceSessions()
    },
  }
}
