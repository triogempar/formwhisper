import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Firebase hybrid wiring', () => {
  it('follows the Firebase AI Logic hybrid and App Check skill', () => {
    const source = readFileSync(resolve('src/lib/hybrid-firebase.ts'), 'utf8')
    const config = readFileSync(resolve('src/lib/config.ts'), 'utf8')
    for (const needle of [
      'InferenceMode.PREFER_ON_DEVICE',
      'InferenceMode.ONLY_ON_DEVICE',
      'InferenceMode.ONLY_IN_CLOUD',
      'useLimitedUseAppCheckTokens: true',
      'new GoogleAIBackend()',
      'initializeAppCheck',
      'ReCaptchaEnterpriseProvider',
      "responseMimeType: 'application/json'",
      'initializeDeviceModel',
      'inferenceSource',
      'FIREBASE_APPCHECK_DEBUG_TOKEN',
      'responseConstraint',
      'DEFAULT_CLOUD_MODEL',
    ]) {
      expect(source).toContain(needle)
    }
    expect(config).toContain("gemini-4-hydrogen")
  })
})
