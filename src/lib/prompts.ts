import type { FieldContext } from './types'
import { clip } from './text'

const RULES = [
  'Explain the form question in plain English.',
  'Do not invent, request, or repeat personal data.',
  'The typed contents of fields are not included and must not be guessed.',
  'Choose semanticType only from the schema enum. Use other when none fit.',
].join(' ')

function fieldBlock(field: FieldContext): string {
  const lines = [
    `Label: ${clip(field.label || '(no label)', 200)}`,
    `Control: ${field.tag} ${field.inputType}`,
    `Name attribute: ${clip(field.name || '(none)', 80)}`,
    `Required: ${field.required ? 'yes' : 'no'}`,
    `Autocomplete hint: ${clip(field.autocomplete || '(none)', 80)}`,
    `Placeholder: ${clip(field.placeholder || '(none)', 160)}`,
    `Help text: ${clip(field.helpText || '(none)', 400)}`,
    `Section legend: ${clip(field.legend || '(none)', 200)}`,
    `Surrounding text: ${clip(field.nearbyText || '(none)', 280)}`,
  ]
  if (field.options.length) lines.push(`Options: ${field.options.map((option) => clip(option, 60)).join(' | ')}`)
  return lines.join('\n')
}

export function buildFieldPrompt(field: FieldContext): string {
  return [
    RULES,
    'Describe this single field: what it means, why it is asked, and up to three common mistakes.',
    fieldBlock(field),
  ].join('\n\n')
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
