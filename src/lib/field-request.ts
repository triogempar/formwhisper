import { inferenceLog } from './inference-log'
import type { ExplainOptions, FormModel } from './model'
import { noteRequestStart, releaseOnDeviceSessions } from './session-lifecycle'
import type { FieldContext, FieldExplanation, ModelAnswer, RunMode } from './types'

export const ON_DEVICE_TIMEOUT_MS = 25_000
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
  | { status: 'error'; field: FieldContext; message: string }
  | { status: 'idle' }

type Running = {
  id: number
  fieldId: string
  mode: RunMode
  controller: AbortController
}

export type FieldRequests = {
  start: (field: FieldContext, mode: RunMode, options?: { force?: boolean }) => void
  cancel: (reason: 'removed' | 'loading') => void
}

function onDevice(mode: RunMode): boolean {
  return mode === 'only-device' || mode === 'prefer-device'
}

function withDeadline<T>(work: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new OnDeviceTimeoutError()), ms)
    const fail = (error: unknown) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(error)
    }
    const onAbort = () => fail(new DOMException('The request was cancelled.', 'AbortError'))
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort)
    work.then(
      (value) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      fail,
    )
  })
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
  timeoutMs?: number
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
    inferenceLog('request-running', { id: running.id, fieldId: field.fieldId, label: field.label, mode })
    host.onView({ status: 'loading', field })
    try {
      const options: ExplainOptions = {
        signal: running.controller.signal,
        onPartial: (partial) => {
          if (current?.id === running.id) host.onView({ status: 'loading', field, partial })
        },
      }
      const work = host.explainField(field, mode, options)
      const answer = onDevice(mode)
        ? await withDeadline(work, host.timeoutMs ?? ON_DEVICE_TIMEOUT_MS, running.controller.signal)
        : await work
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
      const message = error instanceof Error ? error.message : 'The request failed.'
      inferenceLog('request-error', { id: running.id, message })
      host.onView({ status: 'error', field, message })
    } finally {
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
