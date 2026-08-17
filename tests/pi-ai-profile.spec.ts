import { describe, expect, it } from 'vitest'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { OllamaConnectionOptions } from '../src/adapter.ts'
import {
  OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
  createOllamaPiAiProfile,
  openAICompatibleBaseURL,
} from '../src/pi-ai-profile.ts'

const POLICY = resolveRetryPolicy(undefined, 'test')

function connection(overrides: Partial<OllamaConnectionOptions> = {}): OllamaConnectionOptions {
  return {
    apiKeyEnv: credentialRef('OLLAMA_API_KEY'),
    baseURL: 'https://ollama.com/api',
    models: [],
    defaultContextWindow: 4096,
    maxTokens: undefined,
    streamIdleTimeoutMs: 300_000,
    webRequestTimeoutMs: 15_000,
    retryPolicy: POLICY,
    ...overrides,
  }
}

describe('openAICompatibleBaseURL', () => {
  it('maps a native /api base to /v1', () => {
    expect(openAICompatibleBaseURL('https://ollama.com/api')).toBe('https://ollama.com/v1')
    expect(openAICompatibleBaseURL('http://localhost:11434/api/')).toBe('http://localhost:11434/v1')
  })

  it('keeps an existing /v1 base and appends /v1 to custom roots', () => {
    expect(openAICompatibleBaseURL('https://ollama.com/v1')).toBe('https://ollama.com/v1')
    expect(openAICompatibleBaseURL('https://gateway.example/ollama')).toBe('https://gateway.example/ollama/v1')
  })
})

describe('createOllamaPiAiProfile', () => {
  it('maps catalog capabilities and Ollama-specific OpenAI compat', () => {
    const profile = createOllamaPiAiProfile(connection({
      baseURL: 'https://ollama.example/api',
      models: [{
        id: 'qwen3',
        name: 'Qwen 3',
        contextWindow: 131_072,
        maxTokens: 4096,
        vision: true,
        thinking: true,
        tools: true,
      }],
      maxTokens: 8192,
    }))
    const model = profile.piProvider.getModels()[0]

    expect(profile.baseURL).toBe('https://ollama.example/v1')
    expect(model).toMatchObject({
      id: 'qwen3',
      name: 'Qwen 3',
      api: 'openai-completions',
      provider: 'ollama-cloud',
      baseUrl: 'https://ollama.example/v1',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 131_072,
      maxTokens: 4096,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        supportsUsageInStreaming: true,
        maxTokensField: 'max_tokens',
        thinkingFormat: 'openai',
      },
    })
    expect(model?.thinkingLevelMap).toEqual({
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: 'max',
    })
    expect(profile.configuredMaxTokens.size).toBe(0)
  })

  it('limits GPT-OSS thinking levels without applying a request maxTokens cap', () => {
    const profile = createOllamaPiAiProfile(connection({
      models: [{ id: 'registry.example/gpt-oss:20b', thinking: true }],
      maxTokens: 8192,
    }))
    const model = profile.piProvider.getModels()[0]

    expect(model?.thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    })
    expect(profile.configuredMaxTokens.size).toBe(0)
  })

  it('narrows Cloud family thinking maps to vendor-real levels', () => {
    const profile = createOllamaPiAiProfile(connection({
      models: [{ id: 'glm-5.2', thinking: true }, { id: 'kimi-k3', thinking: true }],
    }))
    const models = Object.fromEntries(profile.piProvider.getModels().map(model => [model.id, model]))
    expect(models['glm-5.2']?.thinkingLevelMap).toEqual({
      off: 'none',
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    })
    expect(models['kimi-k3']?.thinkingLevelMap).toEqual({
      off: null,
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    })
  })

  it('uses route defaults without turning capability maxTokens into a request default', () => {
    const profile = createOllamaPiAiProfile(connection({
      models: [{ id: 'plain', vision: false, thinking: false }],
    }))
    const model = profile.piProvider.getModels()[0]

    expect(model).toMatchObject({
      input: ['text'],
      reasoning: false,
      contextWindow: 4096,
      maxTokens: OLLAMA_DEFAULT_MODEL_MAX_TOKENS,
    })
    expect(model?.thinkingLevelMap).toBeUndefined()
    expect(profile.configuredMaxTokens.size).toBe(0)
  })
})
