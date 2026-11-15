export const IDLE_RELEASE_MS = 30_000

export type LifecycleEvent = 'removed' | 'loading' | 'activated' | 'hidden' | 'disconnect' | 'field'

/** Whether this browser event should abort inference and free the on-device model. */
export function cancelsInference(event: LifecycleEvent, activeTabId: number | null, eventTabId?: number): boolean {
  if (event === 'hidden' || event === 'disconnect' || event === 'field') return true
  if (activeTabId === null || eventTabId === undefined) return false
  if (event === 'removed' || event === 'loading') return eventTabId === activeTabId
  if (event === 'activated') return eventTabId !== activeTabId
  return false
}

type Destroyable = { destroy?: () => void }

const tracked = new Set<Destroyable>()
let epoch = 0
let idleTimer: ReturnType<typeof setTimeout> | null = null

export function destroySession(session: Destroyable | null | undefined): void {
  try {
    session?.destroy?.()
  } catch {
    // The native session may already be gone.
  }
}

export function trackSession(session: Destroyable, bornEpoch = epoch): void {
  if (bornEpoch !== epoch) {
    destroySession(session)
    return
  }
  tracked.add(session)
  armIdleRelease()
}

export function releaseOnDeviceSessions(): void {
  epoch += 1
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  for (const session of tracked) destroySession(session)
  tracked.clear()
}

export function sessionEpoch(): number {
  return epoch
}

function armIdleRelease(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    releaseOnDeviceSessions()
  }, IDLE_RELEASE_MS)
}

/** Record that a request finished. The session is released after 30s with no further use. */
export function noteModelActivity(): void {
  if (tracked.size === 0) return
  armIdleRelease()
}

type LanguageModelWithCreate = {
  create: (options?: unknown) => Promise<Destroyable>
  __formwhisperWrapped?: boolean
}

/** Track every Prompt API session Chrome creates, including ones the Firebase SDK opens. */
export function instrumentLanguageModel(host?: { LanguageModel?: LanguageModelWithCreate }): void {
  const model = (host ?? (globalThis as { LanguageModel?: LanguageModelWithCreate })).LanguageModel
  if (!model || model.__formwhisperWrapped || typeof model.create !== 'function') return
  const original = model.create.bind(model)
  model.create = async (options?: unknown) => {
    const born = epoch
    const session = await original(options)
    trackSession(session, born)
    return session
  }
  model.__formwhisperWrapped = true
}
