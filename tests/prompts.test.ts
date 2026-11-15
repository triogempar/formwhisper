import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildChecklistPrompt, buildFieldPrompt, buildScanPrompt } from '../src/lib/prompts'
import type { FieldContext } from '../src/lib/types'
import { demoProfile } from '../src/lib/vault'
import { describe, expect, it } from 'vitest'

const field: FieldContext = {
  fieldId: 'fw-tin',
  tag: 'input',
  inputType: 'text',
  name: 'tin',
  label: 'Taxpayer identification number',
  placeholder: 'NS-000-00-0000',
  helpText: 'The number on the notice.',
  legend: 'Who is filing',
  nearbyText: 'Use the identity document.',
  required: true,
  autocomplete: '',
  options: [],
}

describe('prompts', () => {
  it('describes the question and does not contain vault facts', () => {
    const prompt = [buildFieldPrompt(field), buildChecklistPrompt([field], 'NR-1040'), buildScanPrompt()].join('\n')
    for (const value of Object.values(demoProfile())) {
      expect(prompt).not.toContain(value)
    }
    expect(prompt).toContain('Taxpayer identification number')
    expect(prompt).not.toContain('SECRET-VALUE-99')
    const source = readFileSync(resolve('src/lib/prompts.ts'), 'utf8')
    expect(source).not.toContain('Profile')
    expect(source).not.toContain('.value')
  })
})
