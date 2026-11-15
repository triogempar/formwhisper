import { openProfile, plaintextVault, sealProfile } from '../src/lib/crypto'
import { demoProfile } from '../src/lib/vault'
import { describe, expect, it } from 'vitest'

describe('vault encryption', () => {
  it('round-trips a profile and rejects the wrong passphrase', async () => {
    const profile = demoProfile()
    const stored = await sealProfile(profile, 'cedar-tide')
    expect(stored.encrypted).toBe(true)
    if (!stored.encrypted) return
    expect(stored.ciphertext).not.toContain('Mara')
    expect(await openProfile(stored, 'cedar-tide')).toEqual(profile)
    await expect(openProfile(stored, 'wrong-phrase')).rejects.toThrow(/passphrase/i)
    const plain = plaintextVault(profile)
    expect(await openProfile(plain, '')).toEqual(profile)
  })
})
