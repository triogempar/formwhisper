export const VAULT_KEYS = [
  'legalName',
  'preferredName',
  'dateOfBirth',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'nationality',
  'occupation',
  'employer',
  'taxId',
  'nationalId',
  'passportNumber',
  'driversLicense',
] as const

export type VaultKey = (typeof VAULT_KEYS)[number]
export const SEMANTIC_TYPES = [...VAULT_KEYS, 'other'] as const
export type SemanticType = (typeof SEMANTIC_TYPES)[number]
export type Sensitivity = 'ordinary' | 'identity'

export type Profile = Record<VaultKey, string>

export type FieldContext = {
  fieldId: string
  tag: string
  inputType: string
  name: string
  label: string
  placeholder: string
  helpText: string
  legend: string
  nearbyText: string
  required: boolean
  autocomplete: string
  options: string[]
  origin?: string
}

export type FieldExplanation = {
  semanticType: SemanticType
  explanation: string
  whyAsked: string
  commonMistakes: string[]
  sensitivity: Sensitivity
}

export type ChecklistItem = {
  label: string
  required: boolean
  plainMeaning: string
  documents: string[]
}

export type Checklist = {
  formTitle: string
  summary: string
  items: ChecklistItem[]
  documentsToGather: string[]
  beforeYouSubmit: string[]
}

export type ScanField = {
  label: string
  plainMeaning: string
  required: boolean
  commonMistake: string
}

export type PageScan = {
  pageSummary: string
  fields: ScanField[]
  documentsToGather: string[]
  cautions: string[]
}

/** Visible badge. SDK values are mapped onto these labels. */
export type InferenceBadge = 'ON_DEVICE' | 'IN_CLOUD' | 'PREVIEW'

export type ModelAnswer<T> = {
  data: T
  source: InferenceBadge
}

export type RunMode = 'prefer-device' | 'only-device' | 'only-cloud'

export type VaultMatch = {
  key: VaultKey
  value: string
  label: string
}
