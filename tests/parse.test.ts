import { mockChecklist, mockExplain, mockScan } from '../src/lib/mock-model'
import { ParseError, parseChecklist, parseFieldExplanation, parseScan } from '../src/lib/parse'
import type { FieldContext } from '../src/lib/types'
import { describe, expect, it } from 'vitest'

const field: FieldContext = {
  fieldId: 'fw-1',
  tag: 'input',
  inputType: 'text',
  name: 'legalName',
  label: 'Full legal name',
  placeholder: '',
  helpText: 'As printed.',
  legend: 'Who is filing',
  nearbyText: '',
  required: true,
  autocomplete: 'name',
  options: [],
}

describe('schema parsing', () => {
  it('accepts fenced JSON and rejects a bad enum', () => {
    const raw = mockExplain(field)
    const text = '```json\n' + JSON.stringify(raw) + '\n```'
    expect(parseFieldExplanation(text).semanticType).toBe('legalName')
    expect(() =>
      parseFieldExplanation(JSON.stringify({ ...raw, semanticType: 'nickname' })),
    ).toThrow(ParseError)
    expect(() => parseFieldExplanation('not json')).toThrow(ParseError)
  })

  it('parses checklist and scan payloads from the preview provider', () => {
    const checklist = mockChecklist([field], 'NR-1040')
    expect(parseChecklist(JSON.stringify(checklist)).items[0]?.label).toBe('Full legal name')
    const scan = mockScan()
    expect(parseScan(JSON.stringify(scan)).fields.length).toBeGreaterThan(0)
    expect(() => parseChecklist('{"formTitle":"x"}')).toThrow(ParseError)
  })
})
