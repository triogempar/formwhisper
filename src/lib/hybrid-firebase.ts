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
import type { FormModel } from './model'
import { parseChecklist, parseFieldExplanation, parseScan } from './parse'
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
          maxOutputTokens: kind === 'field' ? 768 : 2048,
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
    return created
  }

  return {
    kind: 'hybrid',
    async explainField(field, mode) {
      await ensureFirebase(config, storedToken)
      const result = await modelFor(mode, 'field').generateContent(buildFieldPrompt(field))
      return {
        data: parseFieldExplanation(result.response.text()),
        source: badgeFrom(result.response.inferenceSource),
      }
    },
    async checklist(fields, title, mode) {
      await ensureFirebase(config, storedToken)
      const result = await modelFor(mode, 'checklist').generateContent(buildChecklistPrompt(fields, title))
      return {
        data: parseChecklist(result.response.text()),
        source: badgeFrom(result.response.inferenceSource),
      }
    },
    async readImage(jpegBase64, mode) {
      await ensureFirebase(config, storedToken)
      const result = await modelFor(mode, 'scan').generateContent([
        { type: 'text', text: buildScanPrompt() },
        { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: rawBase64(jpegBase64) } },
      ])
      return {
        data: parseScan(result.response.text()),
        source: badgeFrom(result.response.inferenceSource),
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
