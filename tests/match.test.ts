import { matchVault } from '../src/lib/match'
import { demoProfile, emptyProfile } from '../src/lib/vault'
import { describe, expect, it } from 'vitest'

describe('matchVault', () => {
  it('maps a semantic type onto a stored fact and ignores everything else', () => {
    const profile = demoProfile()
    expect(matchVault('legalName', profile)).toEqual({
      key: 'legalName',
      value: 'Mara Ellison',
      label: 'Legal name',
    })
    expect(matchVault('other', profile)).toBeNull()
    expect(matchVault('not-a-key', profile)).toBeNull()
    expect(matchVault('legalName', null)).toBeNull()
    const empty = emptyProfile()
    empty.legalName = '   '
    expect(matchVault('legalName', empty)).toBeNull()
  })
})
