import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { apply, Config, inject } from '../src/index.ts'
import {
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_CHANNEL,
} from '../src/client-contract.ts'
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
})
