import { describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import {
  applyOllamaReasoningMetadata,
  isGptOssModel,
  ollamaDefaultEffort,
  ollamaReasoningFamily,
  ollamaThinkingLevelMap,
} from '../src/reasoning.ts'

const OFF_HIGH = {
  off: 'none',
  minimal: null,
  low: null,
  medium: null,
  high: 'high',
  xhigh: null,
  max: null,
} as const

describe('ollamaReasoningFamily', () => {
  it('matches Cloud ids including tags and registry prefixes', () => {
    expect(ollamaReasoningFamily('registry.example/gpt-oss:20b')).toBe('gpt-oss')
    expect(ollamaReasoningFamily('glm-5.2')).toBe('glm-5.2')
    expect(ollamaReasoningFamily('deepseek-v4-pro:0813')).toBe('deepseek-v4-pro')
    expect(ollamaReasoningFamily('deepseek-v4-flash:preview')).toBe('deepseek-v4-flash')
    expect(ollamaReasoningFamily('gemma4:31b')).toBe('gemma4')
    expect(ollamaReasoningFamily('nemotron-3-nano:30b')).toBe('nemotron-3-nano')
    expect(ollamaReasoningFamily('minimax-m2.7')).toBe('minimax-m2')
    expect(ollamaReasoningFamily('kimi-k2.7-code')).toBe('kimi-k2.7')
    expect(ollamaReasoningFamily('kimi-k3')).toBe('kimi-k3')
    expect(ollamaReasoningFamily('qwen3.5:397b')).toBe('qwen3.5')
    expect(ollamaReasoningFamily('qwen3')).toBe('generic')
    expect(ollamaReasoningFamily('mistral-large-3:675b')).toBe('generic')
  })

  it('keeps the GPT-OSS detector aligned with the family classifier', () => {
    expect(isGptOssModel('gpt-oss:120b')).toBe(true)
    expect(isGptOssModel('registry.example/gpt-oss:20b')).toBe(true)
    expect(isGptOssModel('glm-5.2')).toBe(false)
  })
})

describe('ollamaThinkingLevelMap', () => {
  it('returns nothing when thinking is off', () => {
    expect(ollamaThinkingLevelMap({ id: 'glm-5.2', thinking: false })).toBeUndefined()
    expect(ollamaThinkingLevelMap({ id: 'glm-5.2' })).toBeUndefined()
  })

  it('pins vendor-real levels for known Cloud families', () => {
    expect(ollamaThinkingLevelMap({ id: 'glm-5.2', thinking: true })).toEqual({
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    })
    expect(ollamaThinkingLevelMap({ id: 'glm-5.1', thinking: true })).toEqual(OFF_HIGH)
    expect(ollamaThinkingLevelMap({ id: 'deepseek-v4-flash:0731', thinking: true })).toEqual({
      off: 'none',
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    })
    expect(ollamaThinkingLevelMap({ id: 'gpt-oss:20b', thinking: true })).toEqual({
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    })
    expect(ollamaThinkingLevelMap({ id: 'kimi-k3', thinking: true })).toEqual({
      off: null,
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    })
    expect(ollamaThinkingLevelMap({ id: 'kimi-k2.7-code', thinking: true })).toEqual({
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: null,
    })
    expect(ollamaThinkingLevelMap({ id: 'nemotron-3-ultra', thinking: true })).toEqual({
      off: 'none',
      minimal: null,
      low: null,
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    })
    expect(ollamaThinkingLevelMap({ id: 'qwen3', thinking: true })).toEqual({
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: 'max',
    })
  })
})

describe('ollamaDefaultEffort', () => {
  it('uses vendor defaults for known families and none for unknown ones', () => {
    expect(ollamaDefaultEffort('glm-5.2')).toBe('max')
    expect(ollamaDefaultEffort('deepseek-v4-pro:0813')).toBe('high')
    expect(ollamaDefaultEffort('deepseek-v4-flash:0731')).toBe('high')
    expect(ollamaDefaultEffort('gpt-oss:20b')).toBe('medium')
    expect(ollamaDefaultEffort('nemotron-3-super')).toBe('low')
    expect(ollamaDefaultEffort('nemotron-3-nano:30b')).toBe('low')
    expect(ollamaDefaultEffort('kimi-k3')).toBe('max')
    expect(ollamaDefaultEffort('minimax-m3')).toBe('high')
    expect(ollamaDefaultEffort('qwen3')).toBeUndefined()
  })
})

describe('applyOllamaReasoningMetadata', () => {
  function info(efforts: string[]): LlmResolvedModelInfo {
    return {
      provider: 'ollama-cloud',
      id: 'model',
      name: 'model',
      inputModalities: ['text'],
      context: { contextWindow: 128 },
      reasoning: {
        efforts: efforts.map(id => ({ id: ReasoningEffortId(id), name: id })),
      },
    }
  }

  it('attaches a supported family default', () => {
    expect(applyOllamaReasoningMetadata(info(['low', 'medium', 'high']), 'gpt-oss:20b').reasoning).toEqual({
      efforts: [
        { id: ReasoningEffortId('low'), name: 'low' },
        { id: ReasoningEffortId('medium'), name: 'medium' },
        { id: ReasoningEffortId('high'), name: 'high' },
      ],
      defaultEffort: ReasoningEffortId('medium'),
    })
  })

  it('leaves unknown families and non-thinking models unchanged', () => {
    const generic = info(['off', 'low', 'medium', 'high', 'max'])
    expect(applyOllamaReasoningMetadata(generic, 'qwen3')).toBe(generic)
    const plain = { provider: 'ollama-cloud', id: 'plain', name: 'plain', inputModalities: ['text'] as const, context: { contextWindow: 128 } }
    expect(applyOllamaReasoningMetadata(plain, 'glm-5.2')).toBe(plain)
  })
})
