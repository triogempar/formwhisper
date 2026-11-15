import { loadConfig } from './config'
import { createHybridModel, ensureFirebase } from './hybrid-firebase'
import type { FormModel } from './model'
import { mockChecklist, mockExplain, mockScan } from './mock-model'

function createPreviewModel(): FormModel {
  return {
    kind: 'mock',
    async explainField(field) {
      return { data: mockExplain(field), source: 'PREVIEW' }
    },
    async checklist(fields, title) {
      return { data: mockChecklist(fields, title), source: 'PREVIEW' }
    },
    async readImage() {
      return { data: mockScan(), source: 'PREVIEW' }
    },
  }
}

export async function createFormModel(storedDebugToken: string | null): Promise<FormModel> {
  const config = loadConfig()
  if (!config) return createPreviewModel()
  const model = createHybridModel(config, storedDebugToken)
  await ensureFirebase(config, storedDebugToken)
  return model
}

export function createPreviewFormModel(): FormModel {
  return createPreviewModel()
}
