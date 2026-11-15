import { SEMANTIC_TYPES } from './types'

/** JSON schema passed to Chrome's Prompt API as responseConstraint. */
export function fieldJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      semanticType: { type: 'string', enum: [...SEMANTIC_TYPES] },
      explanation: { type: 'string' },
      whyAsked: { type: 'string' },
      commonMistakes: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      sensitivity: { type: 'string', enum: ['ordinary', 'identity'] },
    },
    required: ['semanticType', 'explanation', 'whyAsked', 'commonMistakes', 'sensitivity'],
  }
}

export function checklistJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      formTitle: { type: 'string' },
      summary: { type: 'string' },
      items: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            required: { type: 'boolean' },
            plainMeaning: { type: 'string' },
            documents: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          },
          required: ['label', 'required', 'plainMeaning', 'documents'],
        },
      },
      documentsToGather: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      beforeYouSubmit: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    },
    required: ['formTitle', 'summary', 'items', 'documentsToGather', 'beforeYouSubmit'],
  }
}

export function scanJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      pageSummary: { type: 'string' },
      fields: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            plainMeaning: { type: 'string' },
            required: { type: 'boolean' },
            commonMistake: { type: 'string' },
          },
          required: ['label', 'plainMeaning', 'required', 'commonMistake'],
        },
      },
      documentsToGather: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      cautions: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    },
    required: ['pageSummary', 'fields', 'documentsToGather', 'cautions'],
  }
}
