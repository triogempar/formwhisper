import { VAULT_KEYS, type SemanticType, type VaultKey } from './types'

const VAULT_KEY_SET: ReadonlySet<string> = new Set(VAULT_KEYS)

export function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

export function isVaultKey(value: string): value is VaultKey {
  return VAULT_KEY_SET.has(value)
}

export function isSemanticType(value: string): value is SemanticType {
  return isVaultKey(value) || value === 'other'
}
