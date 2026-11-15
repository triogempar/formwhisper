import type { Profile } from './types'
import { normalizeProfile } from './vault'

export type StoredVault =
  | { v: 1; encrypted: false; profile: Profile }
  | { v: 1; encrypted: true; salt: string; iv: string; ciphertext: string }

const ITERATIONS = 210_000

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealProfile(profile: Profile, passphrase: string): Promise<StoredVault> {
  const trimmed = passphrase.trim()
  if (trimmed.length < 4) throw new Error('Use at least 4 characters.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(trimmed, salt)
  const encoded = new TextEncoder().encode(JSON.stringify(profile))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(encoded))
  return {
    v: 1,
    encrypted: true,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipher)),
  }
}

export async function openProfile(stored: StoredVault, passphrase: string): Promise<Profile> {
  if (!stored.encrypted) return normalizeProfile(stored.profile)
  const key = await deriveKey(passphrase.trim(), b64ToBytes(stored.salt))
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asBuffer(b64ToBytes(stored.iv)) },
      key,
      asBuffer(b64ToBytes(stored.ciphertext)),
    )
    return normalizeProfile(JSON.parse(new TextDecoder().decode(plain)) as unknown)
  } catch {
    throw new Error('That passphrase did not open the vault.')
  }
}

export function plaintextVault(profile: Profile): StoredVault {
  return { v: 1, encrypted: false, profile }
}

export function isStoredVault(value: unknown): value is StoredVault {
  if (!value || typeof value !== 'object') return false
  const record = value as { v?: unknown; encrypted?: unknown }
  return record.v === 1 && typeof record.encrypted === 'boolean'
}
