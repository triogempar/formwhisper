import type { Checklist, FieldContext, FieldExplanation, ModelAnswer, PageScan, RunMode } from './types'

export type ModelKind = 'mock' | 'hybrid'

export interface FormModel {
  kind: ModelKind
  explainField(field: FieldContext, mode: RunMode): Promise<ModelAnswer<FieldExplanation>>
  checklist(fields: FieldContext[], title: string, mode: RunMode): Promise<ModelAnswer<Checklist>>
  readImage(jpegBase64: string, mode: RunMode): Promise<ModelAnswer<PageScan>>
  /** Must be invoked from a user gesture. Absent on the preview provider. */
  prepareDevice?: (onProgress: (ratio: number) => void) => Promise<void>
}
