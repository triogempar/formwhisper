import type { Profile, VaultMatch } from './types'
import { isVaultKey } from './text'
import { VAULT_LABELS } from './vault'

/**
 * Map a model semantic type onto a vault fact.
 * The model never sees these values; this runs only after the response arrives.
 */
export function matchVault(semanticType: string, profile: Profile | null): VaultMatch | null {
  if (!profile || !isVaultKey(semanticType)) return null
  const value = profile[semanticType].trim()
  if (!value) return null
  return { key: semanticType, value, label: VAULT_LABELS[semanticType] }
}
