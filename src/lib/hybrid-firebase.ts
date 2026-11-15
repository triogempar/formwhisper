import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  type GenerativeModel,
  type InferenceMode as InferenceModeName,
} from 'firebase/ai'
import type { FwConfig } from './config'
import { DEFAULT_CLOUD_MODEL } from './config'
import type { ExplainOptions, FormModel } from './model'
import { destroySession, noteModelActivity } from './session-lifecycle'
import { parseChecklist, parseFieldExplanation, parseScan, partialExplanation } from './parse'
import { buildChecklistPrompt, buildFieldPrompt, buildScanPrompt } from './prompts'
import { checklistJsonSchema, fieldJsonSchema, scanJsonSchema } from './schemas'
import { SEMANTIC_TYPES, type InferenceBadge, type RunMode } from './types'

/**
 * Firebase AI Logic hybrid wiring, following the firebase-ai-logic-basics skill
 * and https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
 *
 * Chrome extension note: Manifest V3 blocks the reCAPTCHA Enterprise script
 * (script-src 'self'), so local and hackathon builds use the App Check debug
 * provider. The ReCaptchaEnterpriseProvider is still constructed, as the skill
 * requires, and is the path that runs when a normal web origin can load the script.
 * Debug tokens are never hardcoded. See SETUP.md.
 */

type DebugGlobal = typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }

type Kind = 'field' | 'checklist' | 'scan'

const SYSTEM = 'You are Formwhisper, a calm clerk. Explain bureaucratic form questions in plain English. Never invent or request personal data. Respond only with JSON that matches the schema.'

let app: FirebaseApp | null = null
let ready: Promise<void> | null = null

function applyDebugToken(config: FwConfig, storedToken: string | null): void {
  if (config.appCheck.mode !== 'debug') return
  // The skill's web sample gates this on import.meta.env.DEV. An unpacked
  // extension is a production Vite build, so the token is applied whenever
  // the gitignored config selects debug mode. The value comes from
  // VITE_APPCHECK_DEBUG_TOKEN or chrome.storage, never from source.
  const fromEnv = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  ;(globalThis as DebugGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = fromEnv || storedToken || true
}

export function ensureFirebase(config: FwConfig, storedToken: string | null): Promise<void> {
  if (ready) return ready
  ready = Promise.resolve().then(() => {
    applyDebugToken(config, storedToken)
    app = initializeApp(config.firebase)
    const siteKey =
      config.appCheck.recaptchaEnterpriseSiteKey ||
      (config.appCheck.mode === 'debug' ? 'extension-debug-provider' : '')
    if (!siteKey) {
      throw new Error('Add a reCAPTCHA Enterprise site key before using App Check in production mode.')
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  })
  return ready
}

function toInferenceMode(mode: RunMode): InferenceModeName {
  if (mode === 'only-cloud') return InferenceMode.ONLY_IN_CLOUD
  if (mode === 'only-device') return InferenceMode.ONLY_ON_DEVICE
  return InferenceMode.PREFER_ON_DEVICE
}

function badgeFrom(source: string | undefined): InferenceBadge {
  if (source === InferenceSource.ON_DEVICE) return 'ON_DEVICE'
  if (source === InferenceSource.IN_CLOUD) return 'IN_CLOUD'
  throw new Error('The response did not say whether inference ran on device or in the cloud.')
}

function fieldFirebaseSchema() {
  return Schema.object({
    description: 'Plain-language explanation of one form field.',
    properties: {
      semanticType: Schema.enumString({
        description: 'Vault fact that matches this field, or other.',
        enum: [...SEMANTIC_TYPES],
      }),
      explanation: Schema.string({ description: 'Two sentences. No personal data.' }),
      whyAsked: Schema.string({ description: 'Why the organisation asks.' }),
      commonMistakes: Schema.array({
        description: 'Up to three specific mistakes.',
        maxItems: 3,
        items: Schema.string(),
      }),
      sensitivity: Schema.enumString({
        description: 'identity for government or account numbers.',
        enum: ['ordinary', 'identity'],
      }),
    },
  })
}

function checklistFirebaseSchema() {
  return Schema.object({
    properties: {
      formTitle: Schema.string(),
      summary: Schema.string(),
      items: Schema.array({
        maxItems: 40,
        items: Schema.object({
          properties: {
            label: Schema.string(),
            required: Schema.boolean(),
            plainMeaning: Schema.string(),
            documents: Schema.array({ items: Schema.string(), maxItems: 3 }),
          },
        }),
      }),
      documentsToGather: Schema.array({ items: Schema.string(), maxItems: 8 }),
      beforeYouSubmit: Schema.array({ items: Schema.string(), maxItems: 4 }),
    },
  })
}

function scanFirebaseSchema() {
  return Schema.object({
    properties: {
      pageSummary: Schema.string(),
      fields: Schema.array({
        maxItems: 12,
        items: Schema.object({
          properties: {
            label: Schema.string(),
            plainMeaning: Schema.string(),
            required: Schema.boolean(),
            commonMistake: Schema.string(),
          },
        }),
      }),
      documentsToGather: Schema.array({ items: Schema.string(), maxItems: 8 }),
      cautions: Schema.array({ items: Schema.string(), maxItems: 4 }),
    },
  })
}

function constraintFor(kind: Kind): Record<string, unknown> {
  if (kind === 'field') return fieldJsonSchema()
  if (kind === 'checklist') return checklistJsonSchema()
  return scanJsonSchema()
}

function schemaFor(kind: Kind) {
  if (kind === 'field') return fieldFirebaseSchema()
  if (kind === 'checklist') return checklistFirebaseSchema()
  return scanFirebaseSchema()
}

type HeldAdapter = {
  oldSession?: { destroy?: () => void } | null
  downloadPromise?: Promise<{ destroy?: () => void } | void> | null
}

const heldModels = new Set<GenerativeModel>()

function releaseModelSession(model: GenerativeModel): void {
  const adapter = (model as unknown as { chromeAdapter?: HeldAdapter }).chromeAdapter
  if (!adapter) return
  destroySession(adapter.oldSession)
  adapter.oldSession = null
  const pending = adapter.downloadPromise
  if (!pending) return
  void pending.then((session) => {
    if (session && typeof session === 'object') destroySession(session)
  }).catch(() => undefined)
}

export function releaseHybridSessions(): void {
  for (const model of heldModels) releaseModelSession(model)
  noteModelActivity()
}

function rawBase64(value: string): string {
  const comma = value.indexOf(',')
  if (value.startsWith('data:') && comma >= 0) return value.slice(comma + 1)
  return value
}

export function createHybridModel(config: FwConfig, storedToken: string | null): FormModel {
  const cache = new Map<string, GenerativeModel>()

  function modelFor(mode: RunMode, kind: Kind): GenerativeModel {
    if (!app) throw new Error('Firebase has not been initialized.')
    const key = `${mode}:${kind}`
    const cached = cache.get(key)
    if (cached) return cached
    const ai = getAI(app, {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: true,
    })
    const created = getGenerativeModel(ai, {
      mode: toInferenceMode(mode),
      inCloudParams: {
        model: config.cloudModel || DEFAULT_CLOUD_MODEL,
        systemInstruction: SYSTEM,
        generationConfig: {
          maxOutputTokens: kind === 'field' ? 256 : 2048,
          responseMimeType: 'application/json',
          responseSchema: schemaFor(kind),
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs:
            kind === 'scan'
              ? [{ type: 'text', languages: ['en'] }, { type: 'image' }]
              : [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
          initialPrompts: [
            {
              role: 'system',
              content: [{ type: 'text', value: SYSTEM }],
            },
          ],
        },
        promptOptions: {
          responseConstraint: constraintFor(kind),
        },
      },
    })
    cache.set(key, created)
    heldModels.add(created)
    return created
  }

  return {
    kind: 'hybrid',
    async explainField(field, mode, options?: ExplainOptions) {
      await ensureFirebase(config, storedToken)
      const model = modelFor(mode, 'field')
      const prompt = buildFieldPrompt(field)
      try {
        if (typeof model.generateContentStream === 'function') {
          try {
            const streaming = await model.generateContentStream(prompt, { signal: options?.signal })
            let buffer = ''
            for await (const chunk of streaming.stream) {
              if (options?.signal?.aborted) {
                throw new DOMException('The request was cancelled.', 'AbortError')
              }
              try {
                buffer += chunk.text()
              } catch {
                continue
              }
              const partial = partialExplanation(buffer)
              if (partial) options?.onPartial?.(partial)
            }
            const finalResponse = await streaming.response
            return {
              data: parseFieldExplanation(finalResponse.text() || buffer),
              source: badgeFrom(finalResponse.inferenceSource),
            }
          } catch (error) {
            if (options?.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
          }
        }
        const result = await model.generateContent(prompt, { signal: options?.signal })
        return {
          data: parseFieldExplanation(result.response.text()),
          source: badgeFrom(result.response.inferenceSource),
        }
      } finally {
        releaseModelSession(model)
      }
    },
    async checklist(fields, title, mode, options?: ExplainOptions) {
      await ensureFirebase(config, storedToken)
      const model = modelFor(mode, 'checklist')
      try {
        const result = await model.generateContent(buildChecklistPrompt(fields, title), { signal: options?.signal })
        return {
          data: parseChecklist(result.response.text()),
          source: badgeFrom(result.response.inferenceSource),
        }
      } finally {
        releaseModelSession(model)
      }
    },
    async readImage(jpegBase64, mode, options?: ExplainOptions) {
      await ensureFirebase(config, storedToken)
      const model = modelFor(mode, 'scan')
      try {
        const result = await model.generateContent(
          [
            { type: 'text', text: buildScanPrompt() },
            { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: rawBase64(jpegBase64) } },
          ],
          { signal: options?.signal },
        )
        return {
          data: parseScan(result.response.text()),
          source: badgeFrom(result.response.inferenceSource),
        }
      } finally {
        releaseModelSession(model)
      }
    },
    prepareDevice(onProgress) {
      if (app) return modelFor('prefer-device', 'field').initializeDeviceModel(onProgress)
      return ensureFirebase(config, storedToken).then(() =>
        modelFor('prefer-device', 'field').initializeDeviceModel(onProgress),
      )
    },
  }
}
