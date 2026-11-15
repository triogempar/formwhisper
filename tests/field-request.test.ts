import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { createFieldRequests, DEVICE_TIMEOUT_MESSAGE, type FieldRequests, type RequestTimeouts } from '../src/lib/field-request'
import { parseFieldExplanation } from '../src/lib/parse'
import { instrumentLanguageModel, releaseOnDeviceSessions } from '../src/lib/session-lifecycle'
import type { ExplainOptions, FormModel } from '../src/lib/model'
import type { FieldContext, RunMode } from '../src/lib/types'
import { afterEach, describe, expect, it } from 'vitest'

const ANSWER = JSON.stringify({
  semanticType: 'other',
  explanation: 'A tax year is the period this form covers.',
  whyAsked: 'The office has to file the right year.',
  commonMistakes: ['Writing the calendar year out of habit.'],
  sensitivity: 'ordinary',
})

const field: FieldContext = {
  fieldId: 'tax-year',
  tag: 'input',
  inputType: 'text',
  name: 'taxYear',
  label: 'Tax year',
  placeholder: '',
  helpText: '',
  legend: '',
  nearbyText: '',
  required: true,
  autocomplete: '',
  options: [],
}

type FakeSession = {
  destroyed: boolean
  destroy: () => void
  prompt: () => Promise<string>
}

function installLanguageModel(prompt: (session: FakeSession) => Promise<string>, delayMs = 40) {
  const sessions: FakeSession[] = []
  const host = {
    LanguageModel: {
      create: () =>
        new Promise<FakeSession>((resolve) => {
          setTimeout(() => {
            const session: FakeSession = {
              destroyed: false,
              destroy() {
                session.destroyed = true
              },
              prompt: () => prompt(session),
            }
            sessions.push(session)
            resolve(session)
          }, delayMs)
        }),
    },
  }
  instrumentLanguageModel(host)
  let old: FakeSession | null = null
  async function explainField(_field: FieldContext, _mode: RunMode, _options?: ExplainOptions) {
    const created = await host.LanguageModel.create()
    if (old && old !== created) old.destroy()
    old = created
    const text = await created.prompt()
    return { data: parseFieldExplanation(text), source: 'ON_DEVICE' as const }
  }
  return { sessions, explainField }
}

function mount(
  explainField: FormModel['explainField'],
  start: (requests: FieldRequests) => void,
  timeouts?: RequestTimeouts,
) {
  const el = document.createElement('div')
  document.body.append(el)
  const root: Root = createRoot(el)
  function Panel() {
    const [text, setText] = useState('idle')
    const requests = useRef<FieldRequests | null>(null)
    if (!requests.current) {
      requests.current = createFieldRequests({
        explainField,
        timeouts,
        onView: (view) => {
          if (view.status === 'loading') setText(`Thinking on device… ${view.field.label}`)
          else if (view.status === 'ready') setText(view.answer.data.explanation)
          else if (view.status === 'timeout') setText(DEVICE_TIMEOUT_MESSAGE)
          else if (view.status === 'error') setText(view.message)
          else setText('idle')
        },
      })
    }
    useEffect(() => {
      start(requests.current as FieldRequests)
    }, [])
    return createElement('p', null, text)
  }
  act(() => {
    root.render(createElement(Panel))
  })
  return {
    text: () => el.textContent ?? '',
    unmount: () => {
      act(() => root.unmount())
      el.remove()
    },
  }
}

async function flush(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

afterEach(() => {
  releaseOnDeviceSessions()
  document.body.innerHTML = ''
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('field request with a LanguageModel session', () => {
  it('renders the on-device answer when focus repeats during session create', async () => {
    let destroyedBeforePrompt = false
    const model = installLanguageModel((session) => {
      if (session.destroyed) {
        destroyedBeforePrompt = true
        return new Promise(() => undefined)
      }
      return Promise.resolve(ANSWER)
    })
    const view = mount(model.explainField, (requests) => {
      requests.start(field, 'only-device')
      setTimeout(() => requests.start(field, 'only-device'), 15)
    })
    await flush(80)
    expect(destroyedBeforePrompt).toBe(false)
    expect(view.text()).toBe('A tax year is the period this form covers.')
    expect(model.sessions).toHaveLength(1)
    expect(model.sessions[0]?.destroyed).toBe(false)
    view.unmount()
  })

  it('leaves Thinking when the on-device prompt never returns', async () => {
    const model = installLanguageModel(() => new Promise(() => undefined), 0)
    const view = mount(
      model.explainField,
      (requests) => {
        requests.start(field, 'only-device')
      },
      { firstTokenMs: 30 },
    )
    await flush(10)
    expect(view.text()).toContain('Thinking on device…')
    await flush(40)
    expect(view.text()).toBe(DEVICE_TIMEOUT_MESSAGE)
    view.unmount()
  })

  it('does not time out a stream that keeps producing tokens', async () => {
    const explainField: FormModel['explainField'] = async (_field, _mode, options) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      options?.onActivity?.('token')
      options?.onPartial?.('A tax year')
      await new Promise((resolve) => setTimeout(resolve, 40))
      options?.onActivity?.('token')
      return { data: parseFieldExplanation(ANSWER), source: 'ON_DEVICE' }
    }
    const view = mount(
      explainField,
      (requests) => {
        requests.start(field, 'only-device')
      },
      { firstTokenMs: 30, gapMs: 80 },
    )
    await flush(90)
    expect(view.text()).toBe('A tax year is the period this form covers.')
    view.unmount()
  })

  it('leaves Thinking when the form tab closes', async () => {
    const model = installLanguageModel(() => new Promise(() => undefined), 0)
    const view = mount(model.explainField, (requests) => {
      requests.start(field, 'only-device')
      setTimeout(() => requests.cancel('removed'), 10)
    })
    await flush(40)
    expect(view.text()).toBe('idle')
    view.unmount()
  })
})
