import type { InferenceBadge } from './types'

export type Ledger = {
  onDevice: number
  inCloud: number
  personalBytesSent: number
}

export const EMPTY_LEDGER: Ledger = { onDevice: 0, inCloud: 0, personalBytesSent: 0 }

export function normalizeLedger(value: unknown): Ledger {
  if (!value || typeof value !== 'object') return { ...EMPTY_LEDGER }
  const record = value as Partial<Ledger>
  return {
    onDevice: typeof record.onDevice === 'number' && record.onDevice > 0 ? Math.floor(record.onDevice) : 0,
    inCloud: typeof record.inCloud === 'number' && record.inCloud > 0 ? Math.floor(record.inCloud) : 0,
    personalBytesSent: 0,
  }
}

/** Vault contents are never attached to a request, so the personal-data counter stays at zero. */
export function recordInference(ledger: Ledger, source: InferenceBadge): Ledger {
  const base = normalizeLedger(ledger)
  if (source === 'ON_DEVICE') return { ...base, onDevice: base.onDevice + 1, personalBytesSent: 0 }
  if (source === 'IN_CLOUD') return { ...base, inCloud: base.inCloud + 1, personalBytesSent: 0 }
  return { ...base, personalBytesSent: 0 }
}
