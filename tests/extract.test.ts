import { extractField, extractForm } from '../src/lib/extract'
import { describe, expect, it } from 'vitest'

const SECRET = 'SECRET-VALUE-99'

function mount(html: string): Document {
  document.body.innerHTML = html
  return document
}

describe('extractField', () => {
  it('reads labels, help, legend, and options without the typed value', () => {
    const doc = mount(`
      <form>
        <fieldset>
          <legend>Who is filing</legend>
          <p>Use the identity document.</p>
          <label>
            Full legal name
            <input id="legal-name" name="legalName" required placeholder="As printed" aria-describedby="help" value="${SECRET}" />
            <small id="help">Include a middle name.</small>
          </label>
        </fieldset>
        <label>
          Status
          <select id="status" name="status">
            <option>Single</option>
            <option>Married, filing together</option>
          </select>
        </label>
        <input type="password" name="secret" value="${SECRET}" />
        <input type="hidden" name="token" value="${SECRET}" />
      </form>
    `)
    const input = doc.getElementById('legal-name')
    expect(input).toBeTruthy()
    if (!(input instanceof HTMLInputElement)) throw new Error('missing input')
    input.value = SECRET
    const field = extractField(input)
    expect(field).toMatchObject({
      label: 'Full legal name',
      helpText: 'Include a middle name.',
      legend: 'Who is filing',
      required: true,
      inputType: 'text',
      placeholder: 'As printed',
    })
    expect(JSON.stringify(field)).not.toContain(SECRET)
    expect(field?.nearbyText).toContain('Use the identity document')

    const select = doc.getElementById('status')
    if (!(select instanceof HTMLSelectElement)) throw new Error('missing select')
    expect(extractField(select)?.options).toEqual(['Single', 'Married, filing together'])

    const password = doc.querySelector('input[type="password"]')
    expect(password && extractField(password)).toBeNull()
    const hidden = doc.querySelector('input[type="hidden"]')
    expect(hidden && extractField(hidden)).toBeNull()

    const all = extractForm(doc)
    expect(all.map((item) => item.name)).toEqual(['legalName', 'status'])
    expect(JSON.stringify(all)).not.toContain(SECRET)
  })
})
