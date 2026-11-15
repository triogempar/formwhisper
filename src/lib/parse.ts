import type { Checklist, FieldExplanation, PageScan, SemanticType, Sensitivity } from './types'
import { isSemanticType } from './text'

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown
      } catch {
        throw new ParseError('The model did not return JSON.')
      }
    }
    throw new ParseError('The model did not return JSON.')
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ParseError(`${label} was not a JSON object.`)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ParseError(`${label} was empty.`)
  return value.trim()
}

function asStringList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value)) throw new ParseError(`${label} was not a list.`)
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()).slice(0, max)
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parseFieldExplanation(text: string): FieldExplanation {
  const record = asRecord(extractJson(text), 'Field explanation')
  const semanticRaw = asString(record.semanticType, 'semanticType')
  if (!isSemanticType(semanticRaw)) throw new ParseError('semanticType is not an allowed value.')
  const sensitivityRaw = asString(record.sensitivity, 'sensitivity')
  if (sensitivityRaw !== 'ordinary' && sensitivityRaw !== 'identity') {
    throw new ParseError('sensitivity is not an allowed value.')
  }
  return {
    semanticType: semanticRaw as SemanticType,
    explanation: asString(record.explanation, 'explanation'),
    whyAsked: asString(record.whyAsked, 'whyAsked'),
    commonMistakes: asStringList(record.commonMistakes, 'commonMistakes', 3),
    sensitivity: sensitivityRaw as Sensitivity,
  }
}

export function parseChecklist(text: string): Checklist {
  const record = asRecord(extractJson(text), 'Checklist')
  const itemsRaw = record.items
  if (!Array.isArray(itemsRaw)) throw new ParseError('items was not a list.')
  const items = itemsRaw.slice(0, 40).map((item, index) => {
    const row = asRecord(item, `item ${index + 1}`)
    return {
      label: asString(row.label, 'label'),
      required: asBool(row.required, false),
      plainMeaning: asString(row.plainMeaning, 'plainMeaning'),
      documents: asStringList(row.documents, 'documents', 3),
    }
  })
  return {
    formTitle: asString(record.formTitle, 'formTitle'),
    summary: asString(record.summary, 'summary'),
    items,
    documentsToGather: asStringList(record.documentsToGather, 'documentsToGather', 8),
    beforeYouSubmit: asStringList(record.beforeYouSubmit, 'beforeYouSubmit', 4),
  }
}

export function parseScan(text: string): PageScan {
  const record = asRecord(extractJson(text), 'Scan')
  const fieldsRaw = record.fields
  if (!Array.isArray(fieldsRaw)) throw new ParseError('fields was not a list.')
  const fields = fieldsRaw.slice(0, 12).map((item, index) => {
    const row = asRecord(item, `field ${index + 1}`)
    return {
      label: asString(row.label, 'label'),
      plainMeaning: asString(row.plainMeaning, 'plainMeaning'),
      required: asBool(row.required, false),
      commonMistake: asString(row.commonMistake, 'commonMistake'),
    }
  })
  return {
    pageSummary: asString(record.pageSummary, 'pageSummary'),
    fields,
    documentsToGather: asStringList(record.documentsToGather, 'documentsToGather', 8),
    cautions: asStringList(record.cautions, 'cautions', 4),
  }
}
