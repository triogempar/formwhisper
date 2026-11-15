import type { Checklist, FieldExplanation, PageScan, SemanticType, Sensitivity } from './types'
import { isSemanticType } from './text'

/** Pull a growing explanation string out of a partial JSON stream. */
export function partialExplanation(buffer: string): string | null {
  const match = buffer.match(/"explanation"\s*:\s*"((?:\\.|[^"\\])*)/)
  if (!match) return null
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ')
  }
}

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

/** Drop tags and entities so model text is shown as words, not markup. */
export function plainText(value: string): string {
  const withoutTags = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code)
      return Number.isFinite(point) ? String.fromCodePoint(point) : ''
    })
  return withoutTags.replace(/\s+/g, ' ').trim()
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ParseError(`${label} was empty.`)
  const text = plainText(value)
  if (!text) throw new ParseError(`${label} was empty.`)
  return text
}

function asStringList(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value)) throw new ParseError(`${label} was not a list.`)
  const seen = new Set<string>()
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = plainText(item)
    const letters = text.replace(/[^a-z]/gi, '')
    if (letters.length < 3) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(text)
    if (items.length >= max) break
  }
  return items
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
