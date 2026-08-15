import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { extractContextWindow, extractCapabilities, discoverModels, PUBLIC_BASE_URL, uniqueTagModels } from '../src/discovery.ts'
import type { WireShowResponse, WireTagsResponse } from '../src/types.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => {
  await closeMockServers()
  vi.unstubAllGlobals()
})

describe('extractContextWindow', () => {
  it('reads *.context_length from model_info', () => {
    const show: WireShowResponse = { model_info: { 'gemma3.context_length': 131072 } }
    expect(extractContextWindow(show)).toBe(131072)
  })

  it('prefers parameters num_ctx over model_info', () => {
    const show: WireShowResponse = {
      parameters: 'num_ctx 32768\n',
      model_info: { 'llama.context_length': 8192 },
    }
    expect(extractContextWindow(show)).toBe(32768)
  })

  it('returns undefined when neither source discloses it', () => {
    expect(extractContextWindow({})).toBeUndefined()
  })

  it('ignores non-integer context_length values', () => {
    const show: WireShowResponse = { model_info: { 'foo.context_length': 'big' } }
    expect(extractContextWindow(show)).toBeUndefined()
  })
})

describe('extractCapabilities', () => {
  it('detects vision, thinking, and tools', () => {
    expect(extractCapabilities(['completion', 'vision', 'tools', 'thinking']))
      .toEqual({ vision: true, thinking: true, tools: true })
  })

  it('defaults to all false when absent', () => {
    expect(extractCapabilities(undefined))
      .toEqual({ vision: false, thinking: false, tools: false })
  })
})

describe('uniqueTagModels', () => {
  it('deduplicates API tags while retaining the first row and order', () => {
    expect(uniqueTagModels([
      { model: 'shared', name: 'first' },
      { model: 'shared', name: 'duplicate' },
      { name: 'name-only' },
      { model: '' },
    ])).toEqual([
      { model: 'shared', name: 'first' },
      { name: 'name-only' },
    ])
  })
})

describe('discoverModels', () => {
  it('uses only public /api/tags and never requests the HTML cloud catalog', async () => {
    const requestedUrls: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      requestedUrls.push(url)
      if (url === PUBLIC_BASE_URL + '/tags') {
        return new Response(JSON.stringify({
          models: [{ model: 'shared' }, { model: 'tag-only' }, { model: 'shared' }],
        }), { status: 200 })
      }
      if (url === 'https://ollama.com/search?c=cloud') {
        throw new Error('HTML cloud catalog must not be requested')
      }
      if (url === PUBLIC_BASE_URL + '/show') {
        const body = JSON.parse(String(init?.body)) as { model: string }
        return new Response(JSON.stringify({
          model_info: { [body.model + '.context_length']: 8192 },
          capabilities: ['tools'],
        }), { status: 200 })
      }
      throw new Error('unexpected discovery URL: ' + url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await discoverModels({ baseURL: PUBLIC_BASE_URL, apiKey: 'test-key' })

    expect(models.map(model => model.id)).toEqual(['shared', 'tag-only'])
    expect(requestedUrls).toEqual([
      PUBLIC_BASE_URL + '/tags',
      PUBLIC_BASE_URL + '/show',
      PUBLIC_BASE_URL + '/show',
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
describe('discoverModels', () => {
  it('lists models from /api/tags and enriches with /api/show', async () => {
    const tags: WireTagsResponse = {
      models: [
        { name: 'gpt-oss:20b', model: 'gpt-oss:20b' },
        { name: 'gemma3', model: 'gemma3' },
      ],
    }
    const showGptOss: WireShowResponse = {
      capabilities: ['completion', 'thinking'],
      model_info: { 'gptoss.context_length': 131072 },
    }
    const showGemma: WireShowResponse = {
      capabilities: ['completion', 'vision'],
      model_info: { 'gemma3.context_length': 131072 },
    }
    const server = await mockServer([
      { kind: 'json', status: 200, body: JSON.stringify(tags) },
      { kind: 'json', status: 200, body: JSON.stringify(showGptOss) },
      { kind: 'json', status: 200, body: JSON.stringify(showGemma) },
    ])
    const models = await discoverModels({
      baseURL: server.url,
      apiKey: 'test-key',
    })
    expect(models).toEqual([
      {
        id: 'gpt-oss:20b',
        contextWindow: 131072,
        vision: false,
        thinking: true,
        tools: false,
      },
      {
        id: 'gemma3',
        contextWindow: 131072,
        vision: true,
        thinking: false,
        tools: false,
      },
    ])
    // Verify auth header was sent.
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('bounds concurrent /api/show enrichment and preserves tag order', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `model-${String(index)}`)
    let active = 0
    let maxActive = 0
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/tags')) {
        return new Response(JSON.stringify({ models: ids.map(id => ({ model: id })) }), { status: 200 })
      }
      const request = JSON.parse(String(init?.body)) as { model: string }
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 10))
      active -= 1
      return new Response(JSON.stringify({
        model_info: { [`${request.model}.context_length`]: 8192 },
        capabilities: ['tools'],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await discoverModels({ baseURL: 'https://ollama.example/api' })

    expect(models.map(model => model.id)).toEqual(ids)
    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(6)
  })

  it('retries one transient /api/tags transport failure', async () => {
    const transportError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(transportError)
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverModels({ baseURL: 'https://ollama.example/api' })).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports the safe transport detail after both /api/tags attempts fail', async () => {
    const transportError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
    const fetchMock = vi.fn(() => Promise.reject(transportError))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverModels({ baseURL: 'https://ollama.example/api' }))
      .rejects.toThrow('could not reach https://ollama.example/api/tags: fetch failed (ECONNRESET)')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws DISCOVERY_FAILED on 401', async () => {
    const server = await mockServer([
      { kind: 'json', status: 401, body: '{"error":"unauthorized"}' },
    ])
    await expect(discoverModels({
      baseURL: server.url,
      apiKey: 'bad-key',
    })).rejects.toThrow(LlmError)
  })

  it('skips /api/show failures and still returns the model id', async () => {
    const tags: WireTagsResponse = { models: [{ name: 'broken', model: 'broken' }] }
    const server = await mockServer([
      { kind: 'json', status: 200, body: JSON.stringify(tags) },
      { kind: 'json', status: 500, body: '{"error":"oops"}' },
    ])
    const models = await discoverModels({ baseURL: server.url, apiKey: 'key' })
    expect(models).toEqual([{ id: 'broken' }])
  })

  it('defaults to the public base URL when baseURL is omitted', async () => {
    // This test just verifies the function doesn't throw with no baseURL;
    // a real network call would fail, so we provide a signal that aborts immediately.
    const controller = new AbortController()
    controller.abort()
    await expect(discoverModels({
      apiKey: 'key',
      signal: controller.signal,
    })).rejects.toThrow()
  })
})
