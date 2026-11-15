import { extractField, extractForm, humanizeFieldName } from '../src/lib/extract'
import { describe, expect, it } from 'vitest'

const SECRET = 'SECRET-VALUE-99'

function mount(html: string): Document {
  document.body.innerHTML = html
  return document
}

describe('humanizeFieldName', () => {
  it('drops leading digits and splits known words', () => {
    expect(humanizeFieldName('22faxphone')).toBe('Fax phone')
    expect(humanizeFieldName('01__title')).toBe('Title')
    expect(humanizeFieldName('02firstname')).toBe('First name')
  })
})

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

  it('reads a label from the table cell to the left before the raw name', () => {
    const doc = mount(`
      <table>
        <tr>
          <td>Title</td>
          <td><input id="title" name="01__title"></td>
        </tr>
        <tr>
          <td>First Name</td>
          <td><input id="first" name="02firstname"></td>
        </tr>
        <tr>
          <td></td>
          <td><input id="fax" name="22faxphone"></td>
        </tr>
      </table>
      <label for="email">Email address</label>
      <input id="email" name="99emailaddr">
      <p id="nick">Preferred name</p>
      <input id="nick-field" aria-labelledby="nick" name="nickname">
      <input id="promo" aria-label="Promo code" name="promo">
      <label>Company <input id="company" name="company"></label>
    `)
    expect(extractField(doc.getElementById('title')!)?.label).toBe('Title')
    expect(extractField(doc.getElementById('first')!)?.label).toBe('First Name')
    expect(extractField(doc.getElementById('fax')!)?.label).toBe('Fax phone')
    expect(extractField(doc.getElementById('email')!)?.label).toBe('Email address')
    expect(extractField(doc.getElementById('nick-field')!)?.label).toBe('Preferred name')
    expect(extractField(doc.getElementById('promo')!)?.label).toBe('Promo code')
    expect(extractField(doc.getElementById('company')!)?.label).toBe('Company')
  })
})
