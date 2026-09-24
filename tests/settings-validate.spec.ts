import { describe, expect, it } from 'vitest'
import { resolveAdapterOptions } from '../src/index.ts'

describe('Ollama provider catalog validation', () => {
  it('rejects duplicate catalog model ids before the adapter uses the updated catalog', () => {
    expect(() => resolveAdapterOptions({ models: [{ id: 'kept-model' }, { id: 'kept-model' }] })).toThrow(/duplicate catalog model/)
  })
})
