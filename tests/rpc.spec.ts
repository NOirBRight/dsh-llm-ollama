import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { HarnessError, LlmError } from '@deepseek-ai/dsh-llm'
import { apply, Config, inject } from '../src/index.ts'
import {
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_METHOD,
  OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
} from '../src/client-contract.ts'
import { OLLAMA_USAGE_FAILED } from '../src/usage.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

type Handler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<{ ok: boolean; value?: unknown; error?: { code?: string, message?: string } }>
interface FetchRoute {
  path: string
  methods: readonly string[]
  requestBody: string
  fetch(request: Request): Promise<Response>
}

/**
 * Register the authenticated Fetch route with a stub credential seam.
 * @param resolve - credential lookup behavior; omitted leaves `ctx.credentials` unmounted.
 * @returns the route adapter plus fiber disposal.
 */
async function usageHandler(
  resolve?: () => Promise<never>,
  settings?: {
    configure: (...args: unknown[]) => () => void
    describe: () => { ns: string; revision: number }[]
  },
) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime).await()
  const dispose = vi.fn(() => Promise.resolve())
  let route: FetchRoute | undefined
  const register = vi.fn((value: FetchRoute) => {
    route = value
    return dispose
  })
  ctx.provide('connection', { fetch: { register }, operator: {} } as never)
  ctx.provide('webServer', {} as never)
  if (resolve !== undefined) ctx.provide('credentials', { resolve: vi.fn(resolve) } as never)
  if (settings !== undefined) ctx.provide('settings', settings as never)
  const fiber = ctx.plugin({ inject: [...inject], Config, apply }, {})
  await fiber.await()
  const registeredRoute = route
  if (registeredRoute === undefined) throw new Error('Ollama authenticated Fetch route was not registered')
  const handler: Handler = async (endpoint, payload, signal) => {
    const response = await registeredRoute.fetch(new Request('http://localhost/api/plugin-rpc/ollama-cloud', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'test-ollama-1',
        method: OLLAMA_RPC_METHOD,
        payload: { endpoint, payload },
      }),
      signal,
    }))
    if (!response.ok) throw new Error(`plugin RPC route returned HTTP ${response.status}`)
    const wire = await response.json() as { result?: Awaited<ReturnType<Handler>> }
    if (wire.result === undefined) throw new Error('plugin RPC response omitted result')
    return wire.result
  }
  return {
    handler,
    route: registeredRoute,
    register,
    dispose: async () => { await fiber.dispose(); await ctx.fiber.dispose() },
  }
}

describe('Ollama rich-discovery RPC', () => {
  it('registers an authenticated buffered Fetch route and retains native discovery capabilities', async () => {
    const { handler, route, register, dispose: close } = await usageHandler()
    expect(register).toHaveBeenCalledTimes(1)
    expect(route).toMatchObject({
      path: '/api/plugin-rpc/ollama-cloud',
      methods: ['POST'],
      requestBody: 'buffered',
    })

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

    await close()
    expect(register.mock.results[0]?.value).toHaveBeenCalledTimes(1)
  })
  it('prevalidates settings at the expected revision before ConfigForm commits them', async () => {
    let revision = 1
    const settings = {
      configure: () => () => undefined,
      describe: () => [{ ns: 'llm-ollama', revision }],
    }
    const { handler, dispose: close } = await usageHandler(undefined, settings)
    const valid = await handler(OLLAMA_SETTINGS_VALIDATE_ENDPOINT, {
      baseURL: 'https://example.test/api',
      models: [{ id: 'gemma3', vision: true, tools: true }],
      expectedRevision: 1,
    }, new AbortController().signal)
    expect(valid).toEqual({ ok: true, value: {} })

    const invalid = await handler(OLLAMA_SETTINGS_VALIDATE_ENDPOINT, {
      baseURL: 'https://example.test/api',
      models: [{ id: 'gemma3' }, { id: 'gemma3' }],
      expectedRevision: 1,
    }, new AbortController().signal)
    expect(invalid).toMatchObject({ ok: false, error: { message: expect.stringContaining('duplicate catalog model') } })

    revision = 2
    const conflict = await handler(OLLAMA_SETTINGS_VALIDATE_ENDPOINT, {
      baseURL: 'https://example.test/api',
      models: [],
      expectedRevision: 1,
    }, new AbortController().signal)
    expect(conflict).toMatchObject({ ok: false, error: { code: 'SETTINGS_CONFLICT' } })
    await close()
  })
  it('serves a secret-free usage snapshot through the authenticated Fetch route', async () => {
    const { handler, dispose: close } = await usageHandler()
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
    await close()
  })



  it('answers a usage failure with the wire code the browser quota cache routes on', async () => {
    const { handler, dispose: close } = await usageHandler()

    // An endpoint that refuses the session is a credential failure.
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

    await close()
  })

  it('remaps a credential verdict from the credential seam to INVALID_CREDENTIAL', async () => {
    // The shared quota cache only drops its entry on this one code, so a provider
    // answering "no usable credential" must reach the browser as it.
    for (const verdict of [
      new LlmError('the stored key was revoked', 'INVALID_CREDENTIAL'),
      new HarnessError('no key is stored for this account', 'MISSING_CREDENTIAL'),
    ]) {
      const { handler, dispose: close } = await usageHandler(() => Promise.reject(verdict))
      const refused = await handler(
        OLLAMA_USAGE_ENDPOINT,
        { baseURL: 'https://ollama.example.test/api' },
        new AbortController().signal,
      )
      expect(refused).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIAL', message: verdict.message } })
      await close()
    }
  })

  it('keeps a credential-lookup failure that is no verdict on the credential out of that code', async () => {
    // An unreadable store, a locked keychain, or any other failed read leaves the
    // cached quota alone: only a verdict may discard it.
    for (const [failure, expected] of [
      [new Error('the credential store is unreadable'), 'internal'],
      [new LlmError('the keychain is locked', 'KEYCHAIN_LOCKED'), 'KEYCHAIN_LOCKED'],
    ] as const) {
      const { handler, dispose: close } = await usageHandler(() => Promise.reject(failure))
      const failed = await handler(
        OLLAMA_USAGE_ENDPOINT,
        { baseURL: 'https://ollama.example.test/api' },
        new AbortController().signal,
      )
      expect(failed).toMatchObject({ ok: false, error: { code: expected } })
      expect((failed.error as { code?: string }).code).not.toBe('INVALID_CREDENTIAL')
      await close()
    }
  })

  it('rejects bad wire requests and accepts omitted endpoint payloads', async () => {
    const { route, dispose: close } = await usageHandler()
    const request = (body: string, contentType = 'application/json') => route.fetch(new Request(
      'http://localhost/api/plugin-rpc/ollama-cloud',
      { method: 'POST', headers: { 'content-type': contentType }, body },
    ))

    const unsupported = await request('{}', 'text/plain')
    expect(unsupported.status).toBe(415)
    const malformed = await request(JSON.stringify({
      type: 'client-request',
      rpcId: 'invalid-method',
      method: 'wrong-method',
      payload: {},
    }))
    expect(malformed.status).toBe(400)

    const omittedPayload = await request(JSON.stringify({
      type: 'client-request',
      rpcId: 'omitted-payload',
      method: OLLAMA_RPC_METHOD,
      payload: { endpoint: 'not-a-real-endpoint' },
    }))
    expect(omittedPayload.status).toBe(200)
    await expect(omittedPayload.json()).resolves.toMatchObject({
      type: 'server-response',
      rpcId: 'omitted-payload',
      result: { ok: false, error: { message: expect.stringContaining('unknown Ollama Cloud endpoint') } },
    })
    await close()
  })
})
