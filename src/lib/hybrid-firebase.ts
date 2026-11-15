import { initializeApp, type FirebaseApp } from 'firebase/app'
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
import { inferenceLog } from './inference-log'
import { destroySession, inferenceBusy, noteModelActivity } from './session-lifecycle'
import { parseChecklist, parseFieldExplanation, parseScan, partialExplanation } from './parse'
import { buildChecklistPrompt, buildFieldPrompt, buildScanPrompt } from './prompts'
import { checklistJsonSchema, fieldJsonSchema, scanJsonSchema } from './schemas'
import { SEMANTIC_TYPES, type InferenceBadge, type RunMode } from './types'

/**
 * Firebase AI Logic hybrid wiring, following the firebase-ai-logic-basics skill
 * and https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
 *
 * Debug mode uses CustomProvider plus FIREBASE_APPCHECK_DEBUG_TOKEN so the
 * extension never loads the reCAPTCHA script. The enterprise provider is loaded
 * only when appCheck.mode is recaptcha-enterprise. See SETUP.md.
 */

type Kind = 'field' | 'checklist' | 'scan'

const SYSTEM = 'You are Formwhisper, a calm clerk. Explain bureaucratic form questions in plain English. Never invent or request personal data. Respond only with JSON that matches the schema.'
const FIELD_SYSTEM = 'Explain one form question in plain English. JSON only. Do not invent personal data.'

let app: FirebaseApp | null = null
let ready: Promise<void> | null = null

export function ensureFirebase(config: FwConfig, storedToken: string | null): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    app = initializeApp(config.firebase)
    if (config.appCheck.mode === 'debug') {
      const { initDebugAppCheck } = await import('./app-check-debug')
      initDebugAppCheck(app, storedToken)
      return
    }
    const siteKey = config.appCheck.recaptchaEnterpriseSiteKey
    if (!siteKey) {
      throw new Error('Add a reCAPTCHA Enterprise site key before using App Check in production mode.')
    }
    const { initEnterpriseAppCheck } = await import('./app-check-enterprise')
    initEnterpriseAppCheck(app, siteKey)
  })()
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
        description: 'Vault key, or other.',
        enum: [...SEMANTIC_TYPES],
      }),
      explanation: Schema.string({ description: 'One short sentence.' }),
      whyAsked: Schema.string({ description: 'One short sentence.' }),
      commonMistakes: Schema.array({
        description: 'Up to 3 short items.',
        maxItems: 3,
        items: Schema.string(),
      }),
      sensitivity: Schema.enumString({
        description: 'ordinary or identity.',
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

function finishRequest(model: GenerativeModel): void {
  if (inferenceBusy()) {
    inferenceLog('session-kept', { reason: 'request-in-flight' })
    return
  }
  releaseModelSession(model)
}

export function releaseHybridSessions(): void {
  if (inferenceBusy()) {
    inferenceLog('session-kept', { reason: 'release-while-busy' })
    return
  }
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
        systemInstruction: kind === 'field' ? FIELD_SYSTEM : SYSTEM,
        generationConfig: {
          maxOutputTokens: kind === 'field' ? 1024 : 4096,
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
              content: [{ type: 'text', value: kind === 'field' ? FIELD_SYSTEM : SYSTEM }],
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
      inferenceLog('generate-start', { kind: 'field', mode, label: field.label })
      await ensureFirebase(config, storedToken)
      const model = modelFor(mode, 'field')
      const prompt = buildFieldPrompt(field)
      try {
        if (typeof model.generateContentStream === 'function') {
          let sawToken = false
          try {
            const streaming = await model.generateContentStream(prompt, { signal: options?.signal })
            let buffer = ''
            for await (const chunk of streaming.stream) {
              if (options?.signal?.aborted) {
                throw new DOMException('The request was cancelled.', 'AbortError')
              }
              options?.onActivity?.('token')
              sawToken = true
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
            if (sawToken) throw error
          }
        }
        options?.onActivity?.('full')
        const result = await model.generateContent(prompt, { signal: options?.signal })
        return {
          data: parseFieldExplanation(result.response.text()),
          source: badgeFrom(result.response.inferenceSource),
        }
      } finally {
        inferenceLog('generate-finished', { kind: 'field', mode })
        finishRequest(model)
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
        inferenceLog('generate-finished', { kind: 'checklist', mode })
        finishRequest(model)
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
        inferenceLog('generate-finished', { kind: 'scan', mode })
        finishRequest(model)
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
