import type { FieldContext } from './types'
import { clip } from './text'

const RULES = [
  'Explain the form question in plain English.',
  'Do not invent, request, or repeat personal data.',
  'The typed contents of fields are not included and must not be guessed.',
  'Choose semanticType only from the schema enum. Use other when none fit.',
].join(' ')

export function buildFieldPrompt(field: FieldContext): string {
  return [
    `Label: ${clip(field.label || '(no label)', 80)}`,
    `Type: ${field.inputType}${field.required ? ', required' : ''}`,
    field.helpText ? `Help: ${clip(field.helpText, 80)}` : '',
    'JSON only. One short explanation, one short whyAsked, at most 3 commonMistakes. No personal data.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildChecklistPrompt(fields: FieldContext[], title: string): string {
  const body = fields
    .map((field, index) => {
      return [
        `${index + 1}. ${clip(field.label || field.name || 'Untitled', 160)}`,
        `required=${field.required ? 'yes' : 'no'}`,
        `help=${clip(field.helpText || '-', 180)}`,
        `section=${clip(field.legend || '-', 80)}`,
      ].join(' | ')
    })
    .join('\n')
  return [
    RULES,
    'Read this whole form. Return a checklist of what each field is asking and which documents a person should gather before they start. Do not supply answers.',
    `Form title: ${clip(title || 'Untitled form', 160)}`,
    body || '(no fields found)',
  ].join('\n\n')
}

export function buildScanPrompt(): string {
  return [
    RULES,
    'The image is a JPEG of the visible browser tab, used because the form is a scan, canvas, or PDF-like page.',
    'List the blank questions you can see. Do not transcribe any filled-in personal values. If a box already contains writing, describe the question only.',
    'Say which documents the person should have in hand.',
  ].join('\n\n')
}
