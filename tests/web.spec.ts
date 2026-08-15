import { afterEach, describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  OLLAMA_WEB_PROVIDER_ID,
  OllamaWebFetchProvider,
  OllamaWebSearchProvider,
} from '../src/web.ts'
import type { OllamaWebProviderOptions } from '../src/web.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

function options(baseURL: string, apiKey?: string): OllamaWebProviderOptions {
  return {
    baseURL: () => baseURL,
    resolveApiKey: () => Promise.resolve(apiKey),
  }
}

describe('OllamaWebSearchProvider', () => {
  it('registers under the stable ollama-cloud id and checks availability without network', () => {
    const provider = new OllamaWebSearchProvider(options('https://ollama.com/api'))
    expect(provider.id).toBe(OLLAMA_WEB_PROVIDER_ID)
    expect(provider.available()).toBe(true)
    expect(new OllamaWebSearchProvider(options('not a url')).available()).toBe(false)
  })

  it('maps results to sources and sends the bearer credential', async () => {
    const server = await mockServer([{
      kind: 'json',
      status: 200,
      body: JSON.stringify({
        results: [
          { title: 'Ollama', url: 'https://ollama.com/', content: 'Cloud models…' },
          { title: '', url: 'https://example.test/page' },
          { title: 'no url', content: 'dropped' },
        ],
      }),
    }])
    const provider = new OllamaWebSearchProvider(options(server.url, 'test-key'))

    const result = await provider.search({ query: 'what is ollama?' })

    expect(result).toEqual({
      sources: [
        { url: 'https://ollama.com/', title: 'Ollama', snippet: 'Cloud models…' },
        { url: 'https://example.test/page' },
      ],
      truncated: false,
    })
    expect(server.requests[0]).toEqual({ query: 'what is ollama?' })
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('clamps max_results to the Ollama ceiling and omits it when unbounded', async () => {
    const server = await mockServer([
      { kind: 'json', status: 200, body: '{"results":[]}' },
      { kind: 'json', status: 200, body: '{"results":[]}' },
    ])
    const provider = new OllamaWebSearchProvider(options(server.url, 'test-key'))

    await provider.search({ query: 'a', maxResults: 25 })
    await provider.search({ query: 'b' })

    expect(server.requests[0]).toEqual({ query: 'a', max_results: 10 })
    expect(server.requests[1]).toEqual({ query: 'b' })
  })

  it('fails with OLLAMA_WEB_MISSING_CREDENTIAL when no key is stored', async () => {
    const provider = new OllamaWebSearchProvider(options('https://ollama.com/api'))
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      name: 'WebError',
      code: 'OLLAMA_WEB_MISSING_CREDENTIAL',
    })
  })

  it('fails closed on redirects without contacting the redirect target', async () => {
    const target = await mockServer([{ kind: 'json', status: 200, body: '{"results":[]}' }])
    const redirector = await mockServer([{
      kind: 'json',
      status: 302,
      body: '{}',
      headers: { location: `${target.url}/web_search` },
    }])
    const provider = new OllamaWebSearchProvider(options(redirector.url, 'test-key'))

    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    expect(target.requests).toEqual([])
  })

  it('fails with WEB_PROVIDER_ERROR on upstream errors', async () => {
    const server = await mockServer([{ kind: 'json', status: 401, body: '{"error":"unauthorized"}' }])
    const provider = new OllamaWebSearchProvider(options(server.url, 'bad-key'))
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({
      name: 'WebError',
      code: 'WEB_PROVIDER_ERROR',
    })
  })

  it('fails with OLLAMA_WEB_BAD_REPLY when the results array is missing', async () => {
    const server = await mockServer([{ kind: 'json', status: 200, body: '{}' }])
    const provider = new OllamaWebSearchProvider(options(server.url, 'test-key'))
    await expect(provider.search({ query: 'x' })).rejects.toMatchObject({ code: 'OLLAMA_WEB_BAD_REPLY' })
  })
})

describe('OllamaWebFetchProvider', () => {
  it('returns extracted page content as text', async () => {
    const server = await mockServer([{
      kind: 'json',
      status: 200,
      body: JSON.stringify({
        title: 'Ollama',
        content: 'Cloud models are now available…',
        links: ['https://ollama.com/models'],
      }),
    }])
    const provider = new OllamaWebFetchProvider(options(server.url, 'test-key'))

    const result = await provider.fetch({ url: 'https://ollama.com/blog/web-search' })

    expect(result).toEqual({
      url: 'https://ollama.com/blog/web-search',
      statusCode: 200,
      body: { kind: 'text', content: 'Cloud models are now available…' },
      truncated: false,
    })
    expect(server.requests[0]).toEqual({ url: 'https://ollama.com/blog/web-search' })
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('fails with OLLAMA_WEB_BAD_REPLY when content is missing', async () => {
    const server = await mockServer([{ kind: 'json', status: 200, body: '{"title":"t"}' }])
    const provider = new OllamaWebFetchProvider(options(server.url, 'test-key'))
    await expect(provider.fetch({ url: 'https://example.test' })).rejects.toMatchObject({
      code: 'OLLAMA_WEB_BAD_REPLY',
    })
  })

  it('fails with WEB_PROVIDER_ERROR when the upstream refuses the fetch', async () => {
    const server = await mockServer([{ kind: 'json', status: 500, body: '{"error":"boom"}' }])
    const provider = new OllamaWebFetchProvider(options(server.url, 'test-key'))
    const failure = await provider.fetch({ url: 'https://example.test' }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WebError)
    expect((failure as WebError).code).toBe('WEB_PROVIDER_ERROR')
  })
})
