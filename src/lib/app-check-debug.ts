import { initializeAppCheck, CustomProvider, type AppCheck } from 'firebase/app-check'
import type { FirebaseApp } from 'firebase/app'

type DebugGlobal = typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }

/**
 * Debug App Check does not construct an enterprise attestation provider.
 * That provider's initialize() always inserts enterprise.js, which Manifest V3
 * rejects. The debug token is exchanged by the SDK itself.
 */
export function initDebugAppCheck(app: FirebaseApp, storedToken: string | null): AppCheck {
  const fromEnv = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  const token = fromEnv || storedToken || true
  ;(globalThis as DebugGlobal).FIREBASE_APPCHECK_DEBUG_TOKEN = token
  if (token === true) {
    console.log('AppCheck debug token')
  }
  return initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => ({
        token: 'unused-debug-provider',
        expireTimeMillis: Date.now() + 60_000,
      }),
    }),
    isTokenAutoRefreshEnabled: true,
  })
}
