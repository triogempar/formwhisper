export const APP_CHECK_MESSAGE =
  "Cloud is blocked by App Check. Register this browser's debug token in Firebase Console → App Check → Manage debug tokens."

export function friendlyModelError(error: unknown): { message: string; appCheck: boolean } {
  const raw = error instanceof Error ? error.message : 'The request failed.'
  if (/app\s*check/i.test(raw) || /\b403\b/.test(raw)) {
    return { message: APP_CHECK_MESSAGE, appCheck: true }
  }
  return { message: raw, appCheck: false }
}
