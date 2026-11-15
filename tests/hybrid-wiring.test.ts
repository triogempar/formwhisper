import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Firebase hybrid wiring', () => {
  it('follows the Firebase AI Logic hybrid and App Check skill', () => {
    const source = readFileSync(resolve('src/lib/hybrid-firebase.ts'), 'utf8')
    const debugAppCheck = readFileSync(resolve('src/lib/app-check-debug.ts'), 'utf8')
    const enterprise = readFileSync(resolve('src/lib/app-check-enterprise.ts'), 'utf8')
    const config = readFileSync(resolve('src/lib/config.ts'), 'utf8')
    for (const needle of [
      'InferenceMode.PREFER_ON_DEVICE',
      'InferenceMode.ONLY_ON_DEVICE',
      'InferenceMode.ONLY_IN_CLOUD',
      'useLimitedUseAppCheckTokens: true',
      'new GoogleAIBackend()',
      "responseMimeType: 'application/json'",
      'initializeDeviceModel',
      'inferenceSource',
      'responseConstraint',
      'DEFAULT_CLOUD_MODEL',
      "config.appCheck.mode === 'debug'",
    ]) {
      expect(source).toContain(needle)
    }
    expect(source).not.toContain('ReCaptchaEnterpriseProvider')
    expect(debugAppCheck).toContain('FIREBASE_APPCHECK_DEBUG_TOKEN')
    expect(debugAppCheck).toContain('new CustomProvider')
    expect(debugAppCheck).toContain("console.log('AppCheck debug token')")
    expect(debugAppCheck).not.toContain('ReCaptcha')
    expect(enterprise).toContain('ReCaptchaEnterpriseProvider')
    expect(config).toContain("gemini-4-hydrogen")
  })
})
