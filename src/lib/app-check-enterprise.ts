import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'
import type { FirebaseApp } from 'firebase/app'

/** Production web origin only. Extension pages cannot load this script under MV3 CSP. */
export function initEnterpriseAppCheck(app: FirebaseApp, siteKey: string): AppCheck {
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
}
