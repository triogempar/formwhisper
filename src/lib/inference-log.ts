const FLAG = 'fw.debug'

/** Panel console trail. Set localStorage `fw.debug` to `0` to silence, or `1` to force. */
export function inferenceDebugEnabled(): boolean {
  try {
    const flag = globalThis.localStorage?.getItem(FLAG)
    if (flag === '0') return false
    if (flag === '1') return true
  } catch {
    // Extension pages can deny storage. Keep the trail on so a stall is visible.
  }
  return true
}

export function inferenceLog(state: string, detail?: Record<string, unknown>): void {
  if (!inferenceDebugEnabled()) return
  if (detail) console.log(`[formwhisper] ${state}`, detail)
  else console.log(`[formwhisper] ${state}`)
}
