import { afterEach, describe, expect, it } from 'vitest'
import { CallId, createMessage, createUserMessage, ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  classifyOllamaTransientError,
  httpErrorCode,
  OllamaAdapter,
} from '../src/adapter.ts'
import type { OllamaAdapterOptions, OllamaConnectionOptions } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/index.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

const FIXED_POLICY = resolveRetryPolicy({ mode: 'normal', maxRetries: 8 }, 'test')
const MODEL_ID = 'gpt-oss:20b'

function connection(overrides: Partial<OllamaConnectionOptions> = {}): OllamaConnectionOptions {
  return {
    apiKeyEnv: credentialRef('OLLAMA_API_KEY'),
    baseURL: 'http://localhost',
    models: [{ id: MODEL_ID, thinking: true }],
    defaultContextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: undefined,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    webRequestTimeoutMs: 15_000,
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
    model: MODEL_ID,
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
    ...overrides,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

function completionChunk(
  delta: Record<string, unknown>,
  finishReason?: string,
  usage?: Record<string, unknown>,
): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1,
    model: MODEL_ID,
    choices: [{ index: 0, delta, ...finishReason === undefined ? {} : { finish_reason: finishReason } }],
    ...usage === undefined ? {} : { usage },
  })
}

const textEvents = [
  completionChunk({ role: 'assistant', content: 'hello' }),
  completionChunk({}, 'stop', { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }),
  '[DONE]',
]

function toolEvents(callId: string): string[] {
  return [
    completionChunk({
      role: 'assistant',
      tool_calls: [{
        index: 0,
        id: callId,
        type: 'function',
        function: { name: 'get_weather', arguments: JSON.stringify({ city: 'NYC' }) },
      }],
    }),
    completionChunk({}, 'tool_calls', { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }),
    '[DONE]',
  ]
}

describe('Ollama retry policy', () => {
  it('resolves the host default and an explicit eight-retry policy', () => {
    expect(resolveAdapterOptions({}).retryPolicy).toMatchObject({ mode: 'normal', maxRetries: 2 })
    expect(resolveAdapterOptions({
      retryPolicy: { mode: 'normal', maxRetries: 8 },
    }).retryPolicy).toMatchObject({ mode: 'normal', maxRetries: 8 })
  })
})

describe('classifyOllamaTransientError', () => {
  it.each([
    'the model failed to generate a response',
    'an error was encountered while running the model',
    'cloud model cannot be reached',
    'server is overloaded',
  ])('classifies %s as SERVER', (message) => {
    const chunk: StreamChunk = {
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message } },
    }

    expect(classifyOllamaTransientError(chunk)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'SERVER', message } },
    })
  })

  it.each([
    ['PI_AI_ERROR', 'model does not exist'],
    ['PI_AI_ERROR', 'unknown provider failure'],
    ['QUOTA', 'You have exceeded your current quota'],
  ])('leaves permanent or unknown %s failure unchanged', (code, message) => {
    const chunk: StreamChunk = {
      type: 'finish',
      reason: { kind: 'error', failure: { code, message } },
    }

    expect(classifyOllamaTransientError(chunk)).toBe(chunk)
  })
})

describe('OllamaAdapter metadata', () => {
  it('returns the Ollama Cloud display name and retry policy', () => {
    const a = adapter({})
    expect(a.providerInfo('ollama-cloud')).toEqual({ id: 'ollama-cloud', name: 'Ollama Cloud' })
    expect(a.providerRetryPolicy('ollama-cloud')).toBe(FIXED_POLICY)
    expect(a.providerRetryPolicy('ollama-cloud')).toMatchObject({ mode: 'normal', maxRetries: 8 })
  })

  it('lists configured models with mapped modalities', async () => {
    const a = adapter({
      options: () => connection({ models: [{ id: 'llava', name: 'LLaVA', vision: true }] }),
    })
    await expect(a.listModels('ollama-cloud')).resolves.toEqual([
      { provider: 'ollama-cloud', id: 'llava', name: 'LLaVA', inputModalities: ['text', 'image'] },
    ])
  })

  it('resolves context and thinking efforts without a request maxTokens cap', async () => {
    const a = adapter({
      options: () => connection({
        models: [{ id: 'qwen3', contextWindow: 131_072, maxTokens: 4096, thinking: true, defaultEffort: 'low' }],
      }),
    })
    const info = await a.resolveModel('ollama-cloud', 'qwen3')
    expect(info.context).toEqual({ contextWindow: 131_072 })
    expect(info.defaultMaxTokens).toBeUndefined()
    expect(info.reasoning?.efforts.map(e => e.id)).toEqual(['off', 'low', 'medium', 'high', 'max'])
    expect(info.reasoning?.defaultEffort).toBe('low')
  })

  it('limits GPT-OSS thinking efforts and defaults to medium', async () => {
    const a = adapter({
      options: () => connection({ models: [{ id: 'registry.example/gpt-oss:20b', thinking: true }] }),
    })
    const info = await a.resolveModel('ollama-cloud', 'registry.example/gpt-oss:20b')
    expect(info.reasoning?.efforts.map(e => e.id)).toEqual(['low', 'medium', 'high'])
    expect(info.reasoning?.defaultEffort).toBe('medium')
  })

  it('exposes vendor-real Cloud family levels and their plugin defaults', async () => {
    const a = adapter({
      options: () => connection({
        models: [
          { id: 'glm-5.2', thinking: true },
          { id: 'deepseek-v4-flash:0731', thinking: true },
          { id: 'kimi-k2.7-code', thinking: true },
          { id: 'minimax-m3', thinking: true },
        ],
      }),
    })
    await expect(a.resolveModel('ollama-cloud', 'glm-5.2')).resolves.toMatchObject({
      reasoning: { efforts: [{ id: 'off' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'max' },
    })
    await expect(a.resolveModel('ollama-cloud', 'deepseek-v4-flash:0731')).resolves.toMatchObject({
      reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'high' },
    })
    await expect(a.resolveModel('ollama-cloud', 'kimi-k2.7-code')).resolves.toMatchObject({
      reasoning: { efforts: [{ id: 'high' }], defaultEffort: 'high' },
    })
    await expect(a.resolveModel('ollama-cloud', 'minimax-m3')).resolves.toMatchObject({
      reasoning: { efforts: [{ id: 'off' }, { id: 'high' }], defaultEffort: 'high' },
    })
  })

  it('rejects an unconfigured model instead of passing it through', async () => {
    const a = adapter({ options: () => connection({ models: [] }) })
    await expect(a.resolveModel('ollama-cloud', 'unknown-model')).rejects.toThrow(/no configured model|UNKNOWN_MODEL/)
  })
})

describe('OllamaAdapter.stream', () => {
  it('streams text and sends the Ollama-specific OpenAI payload', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const a = adapter({ options: () => connection({ baseURL: server.url }) })

    const chunks = await collect(a.stream(request({
      maxTokens: 64,
      reasoningEffort: ReasoningEffortId('low'),
    })))

    expect(chunks.find(c => c.type === 'text-delta')).toMatchObject({ text: 'hello' })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
    expect(server.requests[0]).toMatchObject({
      model: MODEL_ID,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 64,
      reasoning_effort: 'low',
    })
    expect(server.requests[0]).not.toHaveProperty('max_completion_tokens')
    expect(server.requests[0]).not.toHaveProperty('store')
    expect(server.requests[0]).not.toHaveProperty('prompt_cache_key')
    expect(server.requests[0]).not.toHaveProperty('prompt_cache_retention')
  })

  it('streams a non-thinking model without forcing reasoning', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const a = adapter({
      options: () => connection({
        baseURL: server.url,
        models: [{ id: 'plain-model', thinking: false }],
      }),
    })

    const chunks = await collect(a.stream(request({ model: 'plain-model' })))

    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(server.requests[0]).not.toHaveProperty('reasoning_effort')
  })

  it('preserves provider-issued tool-call ids across streams', async () => {
    const server = await mockServer([
      { kind: 'sse', events: toolEvents('call_first') },
      { kind: 'sse', events: toolEvents('call_second') },
    ])
    const a = adapter({ options: () => connection({ baseURL: server.url }) })

    const first = await collect(a.stream(request()))
    const second = await collect(a.stream(request()))
    const firstCall = first.find(c => c.type === 'block-end' && c.block.type === 'tool-call')
    const secondCall = second.find(c => c.type === 'block-end' && c.block.type === 'tool-call')

    expect(firstCall).toMatchObject({ block: { id: CallId('call_first'), name: 'get_weather' } })
    expect(secondCall).toMatchObject({ block: { id: CallId('call_second'), name: 'get_weather' } })
    expect(first.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('replays tool results with their provider call id', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const a = adapter({ options: () => connection({ baseURL: server.url }) })
    const history: Message[] = [
      createUserMessage({ content: [{ type: 'text', text: 'weather?' }], source: { kind: 'user' } }),
      createMessage({
        role: 'assistant',
        content: [{ type: 'tool-call', id: CallId('call_first'), name: 'get_weather', arguments: JSON.stringify({ city: 'NYC' }) }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('call_first'), content: [{ type: 'text', text: '22°C' }] }],
        source: { kind: 'tool', callId: CallId('call_first') },
      }),
    ]

    await collect(a.stream(request({ messages: history })))

    const payload = server.requests[0] as { messages?: Record<string, unknown>[] }
    expect(payload.messages?.[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_first', function: { name: 'get_weather' } }],
    })
    expect(payload.messages?.[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_first' })
  })

  it('maps a provider 401 to an AUTH error finish', async () => {
    const server = await mockServer([{ kind: 'json', status: 401, body: '{"error":"unauthorized"}' }])
    const a = adapter({ options: () => connection({ baseURL: server.url }) })

    const chunks = await collect(a.stream(request()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'AUTH' } },
    })
  })

  it('rejects a stream for an unconfigured model', async () => {
    const a = adapter({ options: () => connection({ models: [] }) })
    await expect(collect(a.stream(request()))).rejects.toThrow(/no configured model|UNKNOWN_MODEL/)
  })
})

describe('httpErrorCode', () => {
  it('keeps the source-compatible status mapping', () => {
    expect(httpErrorCode(401)).toBe('AUTH')
    expect(httpErrorCode(403)).toBe('AUTH')
    expect(httpErrorCode(429)).toBe('RATE_LIMIT')
    expect(httpErrorCode(400)).toBe('INVALID_REQUEST')
    expect(httpErrorCode(500)).toBe('SERVER')
    expect(httpErrorCode(418)).toBe('HTTP_418')
  })
})
