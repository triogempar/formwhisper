import type { FieldContext, FieldExplanation, ModelAnswer } from './types'

const cache = new Map<string, ModelAnswer<FieldExplanation>>()

export function explanationCacheKey(field: FieldContext): string {
  return `${field.origin || ''}\n${field.label}\n${field.inputType}`
}

export function readExplanationCache(field: FieldContext): ModelAnswer<FieldExplanation> | null {
  return cache.get(explanationCacheKey(field)) ?? null
}

export function writeExplanationCache(field: FieldContext, answer: ModelAnswer<FieldExplanation>): void {
  cache.set(explanationCacheKey(field), answer)
}
