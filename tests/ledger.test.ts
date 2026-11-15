import { EMPTY_LEDGER, normalizeLedger, recordInference } from '../src/lib/ledger'
import { describe, expect, it } from 'vitest'

describe('privacy ledger', () => {
  it('counts inference source and never records personal bytes', () => {
    const once = recordInference({ ...EMPTY_LEDGER, personalBytesSent: 50 }, 'ON_DEVICE')
    const twice = recordInference(once, 'IN_CLOUD')
    expect(twice).toEqual({ onDevice: 1, inCloud: 1, personalBytesSent: 0 })
    expect(recordInference(twice, 'PREVIEW').personalBytesSent).toBe(0)
    expect(normalizeLedger({ onDevice: 3, inCloud: -1, personalBytesSent: 99 })).toEqual({
      onDevice: 3,
      inCloud: 0,
      personalBytesSent: 0,
    })
  })
})
