import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { apply, Config, inject } from '../src/index.ts'
import {
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SAVE_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
} from '../src/client-contract.ts'
import type { OllamaSettingsView } from '../src/client-contract.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

describe('Ollama rich-discovery RPC', () => {
  it('registers a loopback channel and retains native capabilities', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const handle = vi.fn((_channel: string, _handler: Handler, _options: { authority: 'loopback' }) =>
      () => Promise.resolve())
    ctx.provide('connection', { rpc: { handle } } as never)
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
    await fiber.await()

    expect(handle).toHaveBeenCalledTimes(1)
    const registration = handle.mock.calls[0]
    if (registration === undefined) throw new Error('rich-discovery RPC was not registered')
    expect(registration[0]).toBe(OLLAMA_RPC_CHANNEL)
    expect(registration[2]).toEqual({ authority: 'loopback' })

    const handler = registration[1]
    const server = await mockServer([
      {
        kind: 'json',
        status: 200,
        body: JSON.stringify({ models: [{ name: 'gemma3', model: 'gemma3' }] }),
      },
      {
        kind: 'json',
        status: 200,
        body: JSON.stringify({
          capabilities: ['completion', 'vision', 'tools'],
          model_info: { 'gemma3.context_length': 131_072 },
        }),
      },
    ])
    const result = await handler(
      OLLAMA_DISCOVER_ENDPOINT,
      { baseURL: server.url, apiKey: 'one-shot-key' },
      new AbortController().signal,
    )

    expect(result).toEqual({
      ok: true,
      value: {
        models: [{
          id: 'gemma3',
          contextWindow: 131_072,
          vision: true,
          thinking: false,
          tools: true,
        }],
      },
    })
    expect(server.headers[0]?.authorization).toBe('Bearer one-shot-key')

    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('commits URL and catalog through one revision-fenced settings mutation', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
    const current: OllamaSettingsView = {
      apiKeyEnv: 'OLLAMA_API_KEY',
      baseURL: 'https://ollama.com/api',
      models: [],
      defaultContextWindow: 262_144,
      streamIdleTimeoutMs: 300_000,
    }
    let value = current
    let revision = 1
    const mutate = vi.fn(async (_ns: string, ops: readonly { op: string; path: readonly string[]; value: unknown }[], expected: number) => {
      expect(expected).toBe(revision)
      const next = structuredClone(value) as Record<string, unknown>
      for (const op of ops) next[op.path[0] as string] = structuredClone(op.value)
      value = next as typeof current
      revision += 1
    })
    const settings = {
      register: () => ({
        get: () => value,
        watch: () => () => undefined,
        update: () => Promise.resolve(),
        replace: () => Promise.resolve(),
      }),
      describe: () => [{ ns: 'llm-ollama', value, revision }],
      mutate,
    }
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const handle = vi.fn((_channel: string, _handler: Handler, _options: { authority: 'loopback' }) =>
      () => Promise.resolve())
    ctx.provide('connection', { rpc: { handle } } as never)
    ctx.provide('settings', settings as never)
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
    await fiber.await()
    const handler = handle.mock.calls[0]?.[1]
    if (handler === undefined) throw new Error('Ollama RPC was not registered')

    const result = await handler(OLLAMA_SAVE_ENDPOINT, {
      baseURL: 'https://example.test/api',
      models: [{ id: 'gemma3', vision: true, tools: true }],
      expectedRevision: 1,
    }, new AbortController().signal)

    expect(result).toEqual({
      ok: true,
      value: {
        settings: {
          ...current,
          baseURL: 'https://example.test/api',
          models: [{ id: 'gemma3', vision: true, tools: true }],
        },
        revision: 2,
      },
    })
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[1]).toEqual([
      { op: 'set', path: ['baseURL'], value: 'https://example.test/api' },
      { op: 'set', path: ['models'], value: [{ id: 'gemma3', vision: true, tools: true }] },
    ])
    expect(settings.describe()[0]?.value.models).toEqual([{ id: 'gemma3', vision: true, tools: true }])

    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('serves a secret-free usage snapshot over the loopback channel', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const handle = vi.fn((_channel: string, _handler: Handler, _options: { authority: 'loopback' }) =>
      () => Promise.resolve())
    ctx.provide('connection', { rpc: { handle } } as never)
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
    await fiber.await()
    const handler = handle.mock.calls[0]?.[1]
    if (handler === undefined) throw new Error('Ollama RPC was not registered')

    const server = await mockServer([{
      kind: 'json',
      status: 200,
      body: JSON.stringify({
        limits: {
          session: { usage: 0.188, models: [{ name: 'glm-5.2', request_count: 57 }] },
          weekly: { usage: 0.891, models: [] },
        },
      }),
    }])
    const result = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: server.url, apiKey: 'one-shot-key' },
      new AbortController().signal,
    )

    expect(result).toEqual({
      ok: true,
      value: {
        status: 'ok',
        usage: {
          fetchedAt: expect.any(String),
          session: { usage: 0.188, models: [{ name: 'glm-5.2', requestCount: 57 }] },
          weekly: { usage: 0.891, models: [] },
        },
      },
    })
    expect(server.headers[0]?.authorization).toBe('Bearer one-shot-key')

    const unsupported = await mockServer([{ kind: 'json', status: 404, body: '{}' }])
    const declined = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: unsupported.url },
      new AbortController().signal,
    )
    expect(declined).toEqual({ ok: true, value: { status: 'unsupported' } })

    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
