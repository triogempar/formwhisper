import { applyFill } from '../src/lib/fill'
import { describe, expect, it } from 'vitest'

describe('applyFill', () => {
  it('writes text, matches a select by its label, and refuses passwords', () => {
    document.body.innerHTML = `
      <input id="name" />
      <input id="dob" type="date" />
      <input id="secret" type="password" />
      <select id="status"><option value="s">Single</option><option value="m">Married, filing together</option></select>
    `
    const name = document.getElementById('name')
    const dob = document.getElementById('dob')
    const secret = document.getElementById('secret')
    const status = document.getElementById('status')
    if (!(name instanceof HTMLInputElement) || !(dob instanceof HTMLInputElement)) throw new Error('inputs')
    if (!(secret instanceof HTMLInputElement) || !(status instanceof HTMLSelectElement)) throw new Error('controls')

    expect(applyFill(name, 'Mara Ellison')).toBe(true)
    expect(name.value).toBe('Mara Ellison')
    expect(applyFill(dob, '1987-03-14')).toBe(true)
    expect(dob.value).toBe('1987-03-14')
    expect(applyFill(dob, '14 March 1987')).toBe(false)
    expect(applyFill(status, 'Married, filing together')).toBe(true)
    expect(status.value).toBe('m')
    expect(applyFill(secret, 'hunter2')).toBe(false)
    expect(secret.value).toBe('')
  })
})
