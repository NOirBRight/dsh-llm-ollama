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
import { OLLAMA_USAGE_FAILED } from '../src/usage.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

describe('Ollama rich-discovery RPC', () => {
  it('registers an authenticated Connection channel and retains native capabilities', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const dispose = vi.fn(() => Promise.resolve())
    const handle = vi.fn((_channel: string, _handler: Handler) => dispose)
    ctx.provide('connection', { rpc: { handle } } as never)
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
    await fiber.await()

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledWith(OLLAMA_RPC_CHANNEL, expect.any(Function))
    const registration = handle.mock.calls[0]
    if (registration === undefined) throw new Error('rich-discovery RPC was not registered')
    expect(registration).toHaveLength(2)
    expect(registration[0]).toBe(OLLAMA_RPC_CHANNEL)

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
    expect(dispose).toHaveBeenCalledTimes(1)
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
    const dispose = vi.fn(() => Promise.resolve())
    const handle = vi.fn((_channel: string, _handler: Handler) => dispose)
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
    expect(dispose).toHaveBeenCalledTimes(1)
    await ctx.fiber.dispose()
  })

  it('serves a secret-free usage snapshot over authenticated Connection RPC', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const dispose = vi.fn(() => Promise.resolve())
    const handle = vi.fn((_channel: string, _handler: Handler) => dispose)
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

    // Current account tiers answer limits.monthly with a separate activity block.
    const monthly = await mockServer([{
      kind: 'json',
      status: 200,
      body: JSON.stringify({
        activity: { cost: '0.00000', period: { type: 'last_4_weeks' }, models: [] },
        limits: { monthly: { usage: 0.25, models: [] } },
      }),
    }])
    const monthlyResult = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: monthly.url, apiKey: 'one-shot-key' },
      new AbortController().signal,
    )
    expect(monthlyResult).toEqual({
      ok: true,
      value: {
        status: 'ok',
        usage: { fetchedAt: expect.any(String), monthly: { usage: 0.25, models: [] } },
      },
    })

    const unsupported = await mockServer([{ kind: 'json', status: 404, body: '{}' }])
    const declined = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: unsupported.url },
      new AbortController().signal,
    )
    expect(declined).toEqual({ ok: true, value: { status: 'unsupported' } })

    await fiber.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    await ctx.fiber.dispose()
  })

  it('answers a usage failure with the wire code the browser quota cache routes on', async () => {
    type Handler = (
      endpoint: string,
      payload: unknown,
      signal: AbortSignal,
    ) => Promise<{ ok: boolean; value?: unknown; error?: { code?: string, message?: string } }>
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const dispose = vi.fn(() => Promise.resolve())
    const handle = vi.fn((_channel: string, _handler: Handler) => dispose)
    ctx.provide('connection', { rpc: { handle } } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(() => Promise.reject(new Error('the credential store is unreadable'))),
    } as never)
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
    await fiber.await()
    const handler = handle.mock.calls[0]?.[1]
    if (handler === undefined) throw new Error('Ollama RPC was not registered')

    // A credential the Host cannot resolve is a credential failure, not an
    // internal error: the shared quota cache drops the entry on this code.
    const unresolvable = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: 'https://ollama.example.test/api' },
      new AbortController().signal,
    )
    expect(unresolvable).toEqual({
      ok: false,
      error: { code: 'INVALID_CREDENTIAL', message: 'the credential store is unreadable', details: {} },
    })

    // An endpoint that refuses the session is the same credential failure.
    for (const status of [401, 403]) {
      const refused = await mockServer([{ kind: 'json', status, body: '{"error":"invalid credentials"}' }])
      const rejected = await handler(
        OLLAMA_USAGE_ENDPOINT,
        { baseURL: refused.url, apiKey: 'bad-key' },
        new AbortController().signal,
      )
      expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIAL' } })
    }

    // A non-credential provider failure keeps its own code, never the
    // credential code: a dropped network must not discard a working
    // account's cached quota.
    const unreachable = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: 'http://127.0.0.1:9/api', apiKey: 'one-shot-key' },
      new AbortController().signal,
    )
    expect(unreachable).toMatchObject({ ok: false, error: { code: OLLAMA_USAGE_FAILED } })

    const failing = await mockServer([{ kind: 'json', status: 500, body: '{}' }])
    const broke = await handler(
      OLLAMA_USAGE_ENDPOINT,
      { baseURL: failing.url, apiKey: 'one-shot-key' },
      new AbortController().signal,
    )
    expect(broke).toMatchObject({ ok: false, error: { code: OLLAMA_USAGE_FAILED } })

    // A failure that is not an LlmError stays internal.
    const invalid = await handler(OLLAMA_USAGE_ENDPOINT, 'not-a-request', new AbortController().signal)
    expect(invalid).toMatchObject({ ok: false, error: { code: 'internal' } })

    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects obsolete remoteManagement configuration', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime).await()
    const fiber = ctx.plugin({ inject: [...inject], Config, apply }, { remoteManagement: true } as never)
    await expect(fiber.await()).rejects.toThrow('remoteManagement is not supported by the Alpha.4 Connection service')
    await ctx.fiber.dispose()
  })
})
