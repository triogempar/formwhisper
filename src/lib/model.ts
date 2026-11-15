import type { Checklist, FieldContext, FieldExplanation, ModelAnswer, PageScan, RunMode } from './types'

export type ModelKind = 'mock' | 'hybrid'

export type ExplainOptions = {
  signal?: AbortSignal
  onPartial?: (text: string) => void
}

export interface FormModel {
  kind: ModelKind
  explainField(field: FieldContext, mode: RunMode, options?: ExplainOptions): Promise<ModelAnswer<FieldExplanation>>
  checklist(fields: FieldContext[], title: string, mode: RunMode, options?: ExplainOptions): Promise<ModelAnswer<Checklist>>
  readImage(jpegBase64: string, mode: RunMode, options?: ExplainOptions): Promise<ModelAnswer<PageScan>>
  /** Must be invoked from a user gesture. Absent on the preview provider. */
  prepareDevice?: (onProgress: (ratio: number) => void) => Promise<void>
}
