export type ModelState = 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'checking'

export type ModelReadiness = {
  state: ModelState
  detail: string
}

type LanguageModelLike = {
  availability: (options?: unknown) => Promise<string>
  create: (options?: {
    monitor?: (monitor: { addEventListener: (type: string, listener: (event: Event & { loaded?: number }) => void) => void }) => void
    expectedInputs?: { type: string; languages?: string[] }[]
    expectedOutputs?: { type: string; languages?: string[] }[]
  }) => Promise<{ destroy?: () => void }>
}

function languageModel(): LanguageModelLike | null {
  const candidate = (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel
  if (!candidate || typeof candidate.availability !== 'function') return null
  return candidate
}

function normalize(value: string): ModelState {
  if (value === 'available' || value === 'readily') return 'available'
  if (value === 'downloadable' || value === 'after-download') return 'downloadable'
  if (value === 'downloading') return 'downloading'
  return 'unavailable'
}

export async function detectReadiness(): Promise<ModelReadiness> {
  const model = languageModel()
  if (!model) {
    return {
      state: 'unavailable',
      detail: 'This Chrome does not expose LanguageModel. On-device inference needs desktop Chrome 139 or newer and the Prompt API flag.',
    }
  }
  try {
    const value = await model.availability({
      expectedInputs: [
        { type: 'text', languages: ['en'] },
        { type: 'image' },
      ],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    })
    const state = normalize(value)
    const detail =
      state === 'available'
        ? 'Gemini Nano is on this computer.'
        : state === 'downloading'
          ? 'Chrome is downloading the on-device model.'
          : state === 'downloadable'
            ? 'The on-device model can be downloaded. The first download can take several minutes.'
            : 'The Prompt API is present, but the model is not available on this device.'
    return { state, detail }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Availability check failed.'
    return { state: 'unavailable', detail: message }
  }
}

/**
 * Direct Prompt API download for the preview provider, which has no Firebase model instance.
 * Must be called from a click or keypress.
 */
export function downloadLanguageModel(onProgress: (ratio: number) => void): Promise<void> {
  const model = languageModel()
  if (!model) return Promise.reject(new Error('LanguageModel is not available in this Chrome.'))
  return model
    .create({
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          if (typeof event.loaded === 'number') onProgress(event.loaded)
        })
      },
      expectedInputs: [
        { type: 'text', languages: ['en'] },
        { type: 'image' },
      ],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    })
    .then((session) => {
      session.destroy?.()
    })
}
