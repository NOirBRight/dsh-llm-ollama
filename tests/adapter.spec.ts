import { afterEach, describe, expect, it } from 'vitest'
import { createUserMessage, ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  httpErrorCode,
  OllamaAdapter,
} from '../src/adapter.ts'
import type { OllamaAdapterOptions, OllamaConnectionOptions } from '../src/adapter.ts'
import { closeMockServers, mockServer, textLines, toolCallLines } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

const FIXED_POLICY = resolveRetryPolicy(undefined, 'test')

function connection(overrides: Partial<OllamaConnectionOptions> = {}): OllamaConnectionOptions {
  return {
    apiKeyEnv: credentialRef('OLLAMA_API_KEY'),
    baseURL: 'http://localhost',
    models: [],
    defaultContextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: undefined,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: FIXED_POLICY,
    ...overrides,
  }
}

function adapter(opts: Partial<OllamaAdapterOptions>): OllamaAdapter {
  return new OllamaAdapter({
    options: opts.options ?? (() => connection()),
    resolveApiKey: opts.resolveApiKey ?? (() => Promise.resolve('test-key')),
    ...opts.resolveAttachments === undefined ? {} : { resolveAttachments: opts.resolveAttachments },
  })
}

function request(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'ollama-cloud',
    model: 'gpt-oss:20b',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
    ...overrides,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('OllamaAdapter.providerInfo', () => {
  it('returns the Ollama Cloud display name', () => {
    expect(adapter({}).providerInfo('ollama-cloud')).toEqual({ id: 'ollama-cloud', name: 'Ollama Cloud' })
  })
})

describe('OllamaAdapter.listModels', () => {
  it('returns configured models with text-only modalities by default', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'gpt-oss:20b', name: 'GPT-OSS 20B' }],
      }),
    })
    const models = await a.listModels('ollama-cloud')
    expect(models).toEqual([
      { provider: 'ollama-cloud', id: 'gpt-oss:20b', name: 'GPT-OSS 20B', inputModalities: ['text'] },
    ])
  })

  it('declares image modality for vision models', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'llava', name: 'LLaVA', vision: true }],
      }),
    })
    const models = await a.listModels('ollama-cloud')
    expect(models[0]?.inputModalities).toEqual(['text', 'image'])
  })
})

describe('OllamaAdapter.resolveModel', () => {
  it('returns context and default maxTokens from the catalog', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'gpt-oss:20b', contextWindow: 131072, maxTokens: 4096 }],
        maxTokens: 8192,
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'gpt-oss:20b')
    expect(info.context).toEqual({ contextWindow: 131072 })
    expect(info.defaultMaxTokens).toBe(4096)
  })

  it('falls back to defaultContextWindow for unlisted models', async () => {
    const a = adapter({
      options: () => connection({ defaultContextWindow: 4096 }),
    })
    const info = await a.resolveModel('ollama-cloud', 'unknown-model')
    expect(info.context).toEqual({ contextWindow: 4096 })
  })

  it('exposes reasoning efforts for thinking models', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'qwen3', thinking: true }],
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'qwen3')
    expect(info.reasoning?.efforts.map(e => e.id)).toEqual(['off', 'low', 'medium', 'high', 'max'])
    expect(info.reasoning?.defaultEffort).toBe(ReasoningEffortId('high'))
  })

  it('limits GPT-OSS to the documented low, medium, and high efforts', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'registry.example/gpt-oss:20b', thinking: true }],
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'registry.example/gpt-oss:20b')
    expect(info.reasoning?.efforts.map(e => e.id)).toEqual(['low', 'medium', 'high'])
  })

  it('omits reasoning for non-thinking models', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'gemma3', thinking: false }],
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'gemma3')
    expect(info.reasoning).toBeUndefined()
  })

  it('declares image modality for vision models', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'llava', vision: true }],
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'llava')
    expect(info.inputModalities).toEqual(['text', 'image'])
  })
})

describe('OllamaAdapter.stream', () => {
  it('streams a text response from the mock server', async () => {
    const server = await mockServer([{ kind: 'ndjson', lines: textLines }])
    const a = adapter({
      options: () => connection({ baseURL: server.url }),
    })
    const chunks = await collect(a.stream(request()))
    const textDelta = chunks.find(c => c.type === 'text-delta')
    expect(textDelta?.text).toBe('hello')
    const finish = chunks[chunks.length - 1] as Extract<StreamChunk, { type: 'finish' }>
    expect(finish.reason).toEqual({ kind: 'stop' })
  })

  it('streams a tool-call response and maps stop to tool-calls', async () => {
    const server = await mockServer([{ kind: 'ndjson', lines: toolCallLines }])
    const a = adapter({
      options: () => connection({ baseURL: server.url }),
    })
    const chunks = await collect(a.stream(request()))
    const finish = chunks[chunks.length - 1] as Extract<StreamChunk, { type: 'finish' }>
    expect(finish.reason).toEqual({ kind: 'tool-calls' })
  })

  it('sends the bearer token in the authorization header', async () => {
    const server = await mockServer([{ kind: 'ndjson', lines: textLines }])
    const a = adapter({
      options: () => connection({ baseURL: server.url }),
      resolveApiKey: () => Promise.resolve('my-secret-key'),
    })
    await collect(a.stream(request()))
    expect(server.headers[0]?.authorization).toBe('Bearer my-secret-key')
  })

  it('throws AUTH on 401', async () => {
    const server = await mockServer([{ kind: 'json', status: 401, body: '{"error":"unauthorized"}' }])
    const a = adapter({
      options: () => connection({ baseURL: server.url }),
    })
    await expect(collect(a.stream(request()))).rejects.toThrow()
  })
})

describe('httpErrorCode', () => {
  it('maps 401 to AUTH', () => { expect(httpErrorCode(401)).toBe('AUTH') })
  it('maps 403 to AUTH', () => { expect(httpErrorCode(403)).toBe('AUTH') })
  it('maps 429 to RATE_LIMIT', () => { expect(httpErrorCode(429)).toBe('RATE_LIMIT') })
  it('maps 400 to INVALID_REQUEST', () => { expect(httpErrorCode(400)).toBe('INVALID_REQUEST') })
  it('maps 500 to SERVER', () => { expect(httpErrorCode(500)).toBe('SERVER') })
  it('maps unknown status to HTTP_N', () => { expect(httpErrorCode(418)).toBe('HTTP_418') })
})
