export const DEFAULT_CLOUD_MODEL = 'gemini-4-hydrogen'

export type AppCheckMode = 'debug' | 'recaptcha-enterprise'

export type FwConfigFile = {
  firebase: {
    apiKey: string
    authDomain: string
    projectId: string
    storageBucket: string
    messagingSenderId: string
    appId: string
  }
  appCheck: {
    mode: AppCheckMode
    recaptchaEnterpriseSiteKey: string
  }
  cloudModel: string
}

export type FwConfig = FwConfigFile

function isConfig(value: unknown): value is FwConfigFile {
  if (!value || typeof value !== 'object') return false
  const record = value as FwConfigFile
  const firebase = record.firebase
  if (!firebase || typeof firebase !== 'object') return false
  return Boolean(
    firebase.apiKey &&
      firebase.projectId &&
      firebase.appId &&
      !firebase.apiKey.startsWith('YOUR_') &&
      !firebase.projectId.startsWith('YOUR_'),
  )
}

/** Build-time public Firebase config. Debug tokens are not read from this object. */
export function loadConfig(): FwConfig | null {
  const raw = __FORMWHISPER_CONFIG__
  if (!isConfig(raw)) return null
  const mode = raw.appCheck?.mode === 'recaptcha-enterprise' ? 'recaptcha-enterprise' : 'debug'
  return {
    firebase: {
      apiKey: raw.firebase.apiKey,
      authDomain: raw.firebase.authDomain || `${raw.firebase.projectId}.firebaseapp.com`,
      projectId: raw.firebase.projectId,
      storageBucket: raw.firebase.storageBucket || `${raw.firebase.projectId}.firebasestorage.app`,
      messagingSenderId: raw.firebase.messagingSenderId || '',
      appId: raw.firebase.appId,
    },
    appCheck: {
      mode,
      recaptchaEnterpriseSiteKey: raw.appCheck?.recaptchaEnterpriseSiteKey || '',
    },
    cloudModel: raw.cloudModel || DEFAULT_CLOUD_MODEL,
  }
}
