import { inferenceLog } from './inference-log'

export const IDLE_RELEASE_MS = 30_000

export type LifecycleEvent = 'removed' | 'loading' | 'activated' | 'hidden' | 'disconnect' | 'field'

/**
 * Abort only when the form tab goes away.
 * A new field is handled by the request controller. Hiding the panel, a port
 * disconnect, or retargeting the same tab must not kill the session that is
 * about to call prompt().
 */
export function cancelsInference(event: LifecycleEvent, activeTabId: number | null, eventTabId?: number): boolean {
  if (event !== 'removed' && event !== 'loading') return false
  if (activeTabId === null || eventTabId === undefined) return false
  return eventTabId === activeTabId
}

type Destroyable = { destroy?: () => void }

const tracked = new Set<Destroyable>()
let busy = 0
let releaseQueued = false
let idleTimer: ReturnType<typeof setTimeout> | null = null

export function destroySession(session: Destroyable | null | undefined): void {
  try {
    session?.destroy?.()
  } catch {
    // The native session may already be gone.
  }
}

export function inferenceBusy(): boolean {
  return busy > 0
}

export function trackSession(session: Destroyable): void {
  tracked.add(session)
  if (busy === 0) armIdleRelease()
}

/**
 * Hold every session until the displayed request finishes.
 * The returned function must run from that request's finally.
 */
export function noteRequestStart(): () => void {
  busy += 1
  releaseQueued = false
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  inferenceLog('request-held', { busy })
  let ended = false
  return () => {
    if (ended) return
    ended = true
    busy = Math.max(0, busy - 1)
    inferenceLog('request-released', { busy, releaseQueued })
    if (busy > 0) return
    if (releaseQueued) destroyTracked()
    else armIdleRelease()
  }
}

export function releaseOnDeviceSessions(): void {
  inferenceLog('release-requested', { busy })
  if (busy > 0) {
    releaseQueued = true
    inferenceLog('release-deferred', { busy })
    return
  }
  destroyTracked()
}

function destroyTracked(): void {
  releaseQueued = false
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  inferenceLog('sessions-destroyed', { count: tracked.size })
  for (const session of tracked) destroySession(session)
  tracked.clear()
}

function armIdleRelease(): void {
  if (busy > 0) return
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (busy > 0) {
      inferenceLog('idle-skipped', { busy })
      return
    }
    inferenceLog('idle-release')
    destroyTracked()
  }, IDLE_RELEASE_MS)
}

/** Record that a request finished. The session is released after 30s with no further use. */
export function noteModelActivity(): void {
  if (tracked.size === 0 || busy > 0) return
  armIdleRelease()
}

type LanguageModelWithCreate = {
  create: (options?: unknown) => Promise<Destroyable>
  __formwhisperWrapped?: boolean
}

/**
 * Track Prompt API sessions the Firebase SDK opens.
 * Never destroy a session inside create(): Chrome's prompt() does not reject
 * on a destroyed session, and the panel would stay on "Thinking" forever.
 */
export function instrumentLanguageModel(host?: { LanguageModel?: LanguageModelWithCreate }): void {
  const model = (host ?? (globalThis as { LanguageModel?: LanguageModelWithCreate })).LanguageModel
  if (!model || model.__formwhisperWrapped || typeof model.create !== 'function') return
  const original = model.create.bind(model)
  model.create = async (options?: unknown) => {
    inferenceLog('session-create-start', { busy })
    const session = await original(options)
    let gone = false
    const nativeDestroy = session.destroy?.bind(session)
    session.destroy = () => {
      if (gone) return
      gone = true
      try {
        nativeDestroy?.()
      } catch {
        // Chrome may throw if this session was already destroyed.
      }
    }
    tracked.add(session)
    inferenceLog('session-create-done', { busy })
    if (busy === 0) armIdleRelease()
    return session
  }
  model.__formwhisperWrapped = true
}
