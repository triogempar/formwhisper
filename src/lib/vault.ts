import type { Profile, VaultKey } from './types'
import { VAULT_KEYS } from './types'

export const VAULT_LABELS: Record<VaultKey, string> = {
  legalName: 'Legal name',
  preferredName: 'Preferred name',
  dateOfBirth: 'Date of birth',
  email: 'Email',
  phone: 'Phone',
  addressLine1: 'Street address',
  addressLine2: 'Address line 2',
  city: 'City',
  region: 'Region',
  postalCode: 'Postal code',
  country: 'Country',
  nationality: 'Nationality',
  occupation: 'Occupation',
  employer: 'Employer',
  taxId: 'Taxpayer ID',
  nationalId: 'National ID',
  passportNumber: 'Passport number',
  driversLicense: "Driver's license",
}

export const VAULT_GROUPS: { id: string; keys: VaultKey[] }[] = [
  { id: 'identity', keys: ['legalName', 'preferredName', 'dateOfBirth', 'email', 'phone', 'nationality'] },
  { id: 'address', keys: ['addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country'] },
  { id: 'papers', keys: ['occupation', 'employer', 'taxId', 'nationalId', 'passportNumber', 'driversLicense'] },
]

export function emptyProfile(): Profile {
  return Object.fromEntries(VAULT_KEYS.map((key) => [key, ''])) as Profile
}

/** Fictional specimen used only when the person asks to load it. Stays on the device. */
export function demoProfile(): Profile {
  return {
    legalName: 'Mara Ellison',
    preferredName: 'Mara',
    dateOfBirth: '1987-03-14',
    email: 'mara.ellison@example.com',
    phone: '+1 415 555 0142',
    addressLine1: '418 West Cedar Street',
    addressLine2: 'Apartment 3',
    city: 'Port Meridian',
    region: 'Northshore',
    postalCode: '94107',
    country: 'United States',
    nationality: 'United States',
    occupation: 'Harbor cartographer',
    employer: 'Cedar & Tide Survey',
    taxId: 'NS-000-00-0142',
    nationalId: 'NS-ID-448291',
    passportNumber: 'AL0000000',
    driversLicense: 'NS-DL-000142',
  }
}

export function normalizeProfile(value: unknown): Profile {
  const profile = emptyProfile()
  if (!value || typeof value !== 'object') return profile
  const record = value as Record<string, unknown>
  for (const key of VAULT_KEYS) {
    const raw = record[key]
    profile[key] = typeof raw === 'string' ? raw : ''
  }
  return profile
}
