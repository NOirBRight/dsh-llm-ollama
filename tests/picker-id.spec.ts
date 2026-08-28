import { describe, expect, it } from 'vitest'
import { parseOllamaPickerId } from '../src/client-contract.ts'

describe('parseOllamaPickerId', () => {
  it('peels generic -<n>k / -<n>m and -fast', () => {
    expect(parseOllamaPickerId('qwen3-272k')).toEqual({
      wireId: 'qwen3',
      fast: false,
      contextTokens: 272_000,
    })
    expect(parseOllamaPickerId('qwen3-1m-fast')).toEqual({
      wireId: 'qwen3',
      fast: true,
      contextTokens: 1_000_000,
    })
  })

  it('leaves unknown suffixes and product names like -max alone', () => {
    expect(parseOllamaPickerId('kimi-k3-max')).toEqual({
      wireId: 'kimi-k3-max',
      fast: false,
    })
    expect(parseOllamaPickerId('llama3-preview')).toEqual({
      wireId: 'llama3-preview',
      fast: false,
    })
  })
})
